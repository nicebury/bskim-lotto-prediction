"""
GitHub 공개 데이터셋(happylie/lotto_data)에서 역대 당첨번호를 일괄 적재.

사용법:
    uv run python -m scripts.seed_from_github

특징:
- 외부 SQLite 파일을 임시 경로에 다운로드 후 우리 DB로 UPSERT
- 금액(판매액/당첨금/당첨자수)은 원본에 없으므로 NULL — 이후 네이버 증분에서 채움
- 이미 존재하는 회차는 건너뜀 (중복 INSERT 방지)
"""
from __future__ import annotations

import asyncio
import sqlite3
import sys
import tempfile
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.request import Request, urlopen

# Add parent path for `app.*` imports when run as `python -m scripts.seed_from_github`
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.config import settings  # noqa: E402
from app.database import get_db, init_db  # noqa: E402

DATASET_URL = (
    "https://raw.githubusercontent.com/happylie/lotto_data/main/lotto_data.db"
)
KST = timezone(timedelta(hours=9))


def _now_kst_iso() -> str:
    return datetime.now(KST).replace(microsecond=0).isoformat()


def download_dataset(dest: Path) -> None:
    print(f"⬇ 다운로드 중: {DATASET_URL}")
    req = Request(DATASET_URL, headers={"User-Agent": "lotto-seed/1.0"})
    with urlopen(req, timeout=30) as resp, open(dest, "wb") as f:
        f.write(resp.read())
    print(f"✓ {dest.stat().st_size:,} bytes 저장 → {dest}")


def normalize_date(raw: str) -> str:
    """'2002.12.7' → '2002-12-07'"""
    parts = raw.replace(" ", "").split(".")
    y, m, d = parts
    return f"{int(y):04d}-{int(m):02d}-{int(d):02d}"


def read_source_rows(src_db: Path):
    src = sqlite3.connect(src_db)
    rows = src.execute(
        '''SELECT round, date, "1st", "2nd", "3rd", "4th", "5th", "6th", bonus
             FROM tb_lotto_list ORDER BY round'''
    ).fetchall()
    src.close()
    return rows


async def main() -> int:
    await init_db()

    with tempfile.TemporaryDirectory() as td:
        tmp_db = Path(td) / "lotto_remote.db"
        download_dataset(tmp_db)
        rows = read_source_rows(tmp_db)
        print(f"✓ 원본 {len(rows)}행 로드됨 (범위 {rows[0][0]}~{rows[-1][0]})")

    inserted = skipped = 0
    created_at = _now_kst_iso()

    async with get_db() as db:
        async with db.execute(
            "SELECT round_no FROM lotto_results"
        ) as cur:
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

        # 시드 로그 기록
        await db.execute(
            """
            INSERT INTO crawl_logs (
                started_at, finished_at, status, start_round, end_round,
                collected_count, error_message
            ) VALUES (?, ?, 'success', ?, ?, ?, 'seed:github:happylie/lotto_data');
            """,
            (created_at, _now_kst_iso(), rows[0][0], rows[-1][0], inserted),
        )
        await db.commit()

    print(f"✓ 신규 INSERT: {inserted}건 / 기존 스킵: {skipped}건")
    print(f"  DB 경로: {settings.DB_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
