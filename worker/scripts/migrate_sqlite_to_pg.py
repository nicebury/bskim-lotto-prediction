"""SQLite → Postgres 1회성 이관.

    uv run python -m scripts.migrate_sqlite_to_pg [--dry-run]

기존 backend/data/lotto.db 의 lotto_results(1,231행)를 lotto_draw 로 옮긴다.
이관 이후의 증분 수집은 worker 의 lotto 잡이 담당하며 이 이관과 별개다.

**이관은 멱등이 아니다.** 대상 테이블이 비어 있지 않으면 거부한다. 재실행하려면
사람이 명시적으로 `TRUNCATE lotto_draw CASCADE` 한 뒤 다시 돌린다. 자동으로
TRUNCATE 하지 않는 이유는 자명하다 — 이 스크립트가 실수로 두 번 돌면 증분 수집으로
쌓인 회차까지 날아간다.

절차·매핑·검증: docs/wiki/50-ops/migration-sqlite-to-postgres.md
"""
from __future__ import annotations

import argparse
import asyncio
import sqlite3
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from worker.config import settings
from worker.db import connect

# worker/ 기준 상대경로. backend/data/lotto.db 는 읽기만 하고 건드리지 않는다.
SQLITE_PATH = Path(__file__).resolve().parent.parent.parent / "backend" / "data" / "lotto.db"

KST = ZoneInfo("Asia/Seoul")

# 이관 시점 실측값. 이 숫자와 다르면 원본이 바뀐 것이므로 사람이 확인해야 한다.
EXPECTED_ROWS = 1231


def _read_sqlite() -> list[dict]:
    """원본을 읽기 전용으로 연다.

    `mode=ro` 를 쓰는 이유: 실수로라도 원본에 쓰지 않는다. 이관 후에도 lotto.db 를
    삭제하지 않고 보관한다 — 원본이 유일한 재실행 근거다.
    """
    if not SQLITE_PATH.exists():
        raise SystemExit(f"원본 SQLite 를 찾을 수 없다: {SQLITE_PATH}")

    con = sqlite3.connect(f"file:{SQLITE_PATH}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    try:
        rows = con.execute(
            """
            SELECT round_no, draw_date, num1, num2, num3, num4, num5, num6, bonus,
                   total_sell_amount, first_win_amount, first_winner_count,
                   first_accum_amount, created_at
              FROM lotto_results
             ORDER BY round_no
            """
        ).fetchall()
    finally:
        con.close()
    return [dict(r) for r in rows]


def _parse_created_at(raw: str) -> datetime:
    """SQLite 의 created_at(TEXT)을 timestamptz 로 옮길 값으로 바꾼다.

    실측상 1,231행 전부 `+09:00` 오프셋을 달고 있지만, naive 문자열이 섞일
    가능성에 대비한다. **naive 면 KST 로 해석한다.** 아무 타임존이나(UTC 등)
    붙이면 9시간 어긋나고, 나중에 어느 쪽이 맞는지 아무도 모른다.
    """
    dt = datetime.fromisoformat(raw)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=KST)
    return dt


def _to_pg_row(r: dict) -> dict:
    """컬럼 매핑. SQLite 이름을 한국형 표준으로 재설계했다.

    번호는 sorted() 로 강제하지 않는다. 원본에서 오름차순 위반 0건을 확인했고,
    만약 위반이 있다면 ck_lotto_draw_ascending 이 잡아 이관을 실패시켜야 한다.
    조용히 고쳐 넣으면 원본이 틀렸다는 사실이 묻힌다.
    """
    created = _parse_created_at(r["created_at"])
    return {
        "round_no": r["round_no"],
        # TEXT → date. psycopg 가 date 객체를 넘겨받으면 캐스팅이 확실하다.
        "draw_ymd": datetime.strptime(r["draw_date"], "%Y-%m-%d").date(),
        "n1": r["num1"], "n2": r["num2"], "n3": r["num3"],
        "n4": r["num4"], "n5": r["num5"], "n6": r["num6"],
        "bonus_no": r["bonus"],
        "total_sell_amt": r["total_sell_amount"],
        "first_prize_amt": r["first_win_amount"],
        "first_winner_cnt": r["first_winner_count"],
        "first_accum_prize_amt": r["first_accum_amount"],
        "created_dttm": created,
        # updated_dttm 은 now() 가 아니라 created_dttm 값으로 채운다.
        # 이관 시점을 '수정 시각' 으로 남기면, 나중에 공식 API 로 enrich 할 때
        # 무엇이 실제로 갱신됐는지 구분할 수 없다.
        "updated_dttm": created,
    }


VERIFY_QUERIES: list[tuple[str, str, str]] = [
    (
        "행수 일치",
        "SELECT count(*) AS v FROM lotto_draw",
        f"{EXPECTED_ROWS} 이어야 함",
    ),
    (
        "회차 연속성",
        "SELECT (max(round_no) - min(round_no) + 1 = count(*)) AS v FROM lotto_draw",
        "true 여야 함",
    ),
    (
        "번호 오름차순 불변식",
        """SELECT count(*) AS v FROM lotto_draw
            WHERE NOT (winning_no1<winning_no2 AND winning_no2<winning_no3
                   AND winning_no3<winning_no4 AND winning_no4<winning_no5
                   AND winning_no5<winning_no6)""",
        "0 이어야 함",
    ),
    (
        "번호 범위",
        """SELECT count(*) AS v FROM lotto_draw
            WHERE winning_no1 < 1 OR winning_no6 > 45
               OR bonus_no NOT BETWEEN 1 AND 45""",
        "0 이어야 함",
    ),
    (
        "추첨일자 유일성",
        "SELECT count(*) AS v FROM (SELECT draw_ymd FROM lotto_draw GROUP BY 1 HAVING count(*) > 1) d",
        "0 이어야 함",
    ),
]


def _check(name: str, value, expected) -> bool:
    ok = value == expected
    print(f"  [{'OK ' if ok else 'FAIL'}] {name}: {value}")
    return ok


async def _verify(conn) -> bool:
    print("\n검증 쿼리 (다섯 개 모두 통과해야 성공):")
    expected = [EXPECTED_ROWS, True, 0, 0, 0]
    results = []
    for (name, sql, hint), exp in zip(VERIFY_QUERIES, expected, strict=True):
        cur = await conn.execute(sql)
        row = await cur.fetchone()
        results.append(_check(f"{name} ({hint})", row["v"], exp))
    return all(results)


async def main(dry_run: bool) -> int:
    print(f"원본: {SQLITE_PATH}")
    print(f"대상: {settings.PG_USER}@{settings.PG_HOST}:{settings.PG_PORT}/{settings.PG_DB}")

    rows = _read_sqlite()
    print(f"\nSQLite 에서 {len(rows)}행을 읽었다.")
    if len(rows) != EXPECTED_ROWS:
        print(
            f"⚠ 실측 기준({EXPECTED_ROWS}행)과 다르다. 원본이 바뀌었는지 확인한다.",
            file=sys.stderr,
        )

    pg_rows = [_to_pg_row(r) for r in rows]

    async with connect() as conn:
        cur = await conn.execute("SELECT count(*) AS c FROM lotto_draw")
        existing = (await cur.fetchone())["c"]
        if existing:
            print(
                f"\n✗ lotto_draw 에 이미 {existing}행이 있다. 이관은 멱등이 아니다.\n"
                "  재실행하려면 먼저 사람이 직접 실행한다:\n"
                "      TRUNCATE lotto_draw CASCADE;",
                file=sys.stderr,
            )
            return 1

        if dry_run:
            print("\n--dry-run: 아무것도 쓰지 않고 종료한다.")
            print(f"  첫 행: {pg_rows[0]['round_no']}회 {pg_rows[0]['draw_ymd']}")
            print(f"  끝 행: {pg_rows[-1]['round_no']}회 {pg_rows[-1]['draw_ymd']}")
            return 0

        # executemany 로 한 번에 넣는다. 제약 위반은 삼키지 않고 그대로 터뜨린다 —
        # uk_lotto_draw_draw_ymd 나 ck_lotto_draw_ascending 이 걸리면 원본에
        # 문제가 있다는 뜻이고, 그건 사람이 봐야 한다.
        #
        # ON CONFLICT 를 쓰지 않는 이유도 같다. 빈 테이블임을 위에서 확인했으므로
        # 충돌은 곧 원본의 중복이고, 조용히 건너뛰면 1231행이 아닌 채로 끝난다.
        await conn.cursor().executemany(
            """
            INSERT INTO lotto_draw (
                round_no, draw_ymd,
                winning_no1, winning_no2, winning_no3,
                winning_no4, winning_no5, winning_no6,
                bonus_no,
                total_sell_amt, first_prize_amt, first_winner_cnt, first_accum_prize_amt,
                created_dttm, updated_dttm
            ) VALUES (
                %(round_no)s, %(draw_ymd)s,
                %(n1)s, %(n2)s, %(n3)s, %(n4)s, %(n5)s, %(n6)s,
                %(bonus_no)s,
                %(total_sell_amt)s, %(first_prize_amt)s,
                %(first_winner_cnt)s, %(first_accum_prize_amt)s,
                %(created_dttm)s, %(updated_dttm)s
            )
            """,
            pg_rows,
        )
        print(f"\n{len(pg_rows)}행을 lotto_draw 에 넣었다.")

        ok = await _verify(conn)

    if ok:
        print("\n✓ 이관 성공. backend/data/lotto.db 는 삭제하지 말고 보관한다.")
        return 0
    print("\n✗ 검증 실패. TRUNCATE lotto_draw CASCADE 후 재실행한다.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SQLite → Postgres 1회성 이관")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="읽고 매핑만 해 보고 쓰지 않는다",
    )
    args = parser.parse_args()
    raise SystemExit(asyncio.run(main(args.dry_run)))
