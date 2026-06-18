"""로컬 lotto_origin.db → lotto.db 마이그레이션 스크립트.

seed_from_github.py 와 동일하지만, GitHub 다운로드 대신
이미 받아둔 로컬 원본 DB(`data/lotto_origin.db`, 테이블 `tb_lotto_list`)를 읽어
`lotto_results` 로 옮긴다.

사용:
    cd backend && uv run python -m scripts.seed_from_origin
    # 다른 원본 경로 지정:
    uv run python -m scripts.seed_from_origin path/to/lotto_origin.db

- 스키마/PRAGMA 는 init_db() 가 보장 (journal_mode=DELETE)
- 이미 존재하는 회차는 건너뜀 (중복 INSERT 방지)
- 네이버 소스에 없는 금액 필드는 NULL
"""
import asyncio
import sys
from pathlib import Path

from app.config import settings
from app.database import get_db, init_db
from scripts.seed_from_github import _now_kst_iso, normalize_date, read_source_rows

DEFAULT_SRC = settings.DB_PATH.parent / "lotto_origin.db"


async def main() -> int:
    src_db = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SRC
    if not src_db.exists():
        print(f"✗ 원본 DB 없음: {src_db}")
        return 1

    await init_db()

    rows = read_source_rows(src_db)
    if not rows:
        print("✗ 원본에 데이터가 없습니다.")
        return 1
    print(f"✓ 원본 {len(rows)}행 로드됨 (범위 {rows[0][0]}~{rows[-1][0]}) ← {src_db}")

    inserted = skipped = 0
    created_at = _now_kst_iso()

    async with get_db() as db:
        async with db.execute("SELECT round_no FROM lotto_results") as cur:
            existing = {r["round_no"] for r in await cur.fetchall()}

        for round_no, date_raw, n1, n2, n3, n4, n5, n6, bonus in rows:
            if round_no in existing:
                skipped += 1
                continue
            await db.execute(
                """
                INSERT INTO lotto_results (
                    round_no, draw_date, num1, num2, num3, num4, num5, num6, bonus,
                    total_sell_amount, first_win_amount, first_winner_count,
                    first_accum_amount, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?);
                """,
                (round_no, normalize_date(date_raw), n1, n2, n3, n4, n5, n6, bonus, created_at),
            )
            inserted += 1
        await db.commit()

        await db.execute(
            """
            INSERT INTO crawl_logs (
                started_at, finished_at, status, start_round, end_round,
                collected_count, error_message
            ) VALUES (?, ?, 'success', ?, ?, ?, 'seed:local:lotto_origin.db');
            """,
            (created_at, _now_kst_iso(), rows[0][0], rows[-1][0], inserted),
        )
        await db.commit()

    print(f"✓ 신규 INSERT: {inserted}건 / 기존 스킵: {skipped}건")
    print(f"  DB 경로: {settings.DB_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
