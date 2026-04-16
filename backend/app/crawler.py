"""네이버 검색 위젯 기반 로또 당첨번호 크롤러.

배경:
- 동행복권 공식 API(`common.do?method=getLottoNumber`)가 전 클라이언트 대상으로
  메인 페이지로 302 리다이렉트하는 상태라 네이버 검색 위젯을 대체 소스로 사용.
- 요청 간 2초 딜레이(+ 지터)를 두어 네이버에 부담을 주지 않도록 함.
"""
from __future__ import annotations

import asyncio
import logging
import random
from datetime import datetime, timedelta, timezone
from typing import Optional

import aiosqlite
import httpx

from .config import settings
from .database import get_db
from . import naver_source
from .schemas import CrawlStatus

logger = logging.getLogger(__name__)
KST = timezone(timedelta(hours=9))


def _now_kst() -> datetime:
    return datetime.now(KST).replace(microsecond=0)


def _now_kst_iso() -> str:
    return _now_kst().isoformat()


class LottoCrawler:
    """네이버 검색 위젯 기반 증분 크롤러 (싱글톤)."""

    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._status = CrawlStatus(status="idle")

    @property
    def status(self) -> CrawlStatus:
        return self._status

    def is_running(self) -> bool:
        return self._status.status == "running" or self._lock.locked()

    def mark_pending(self, start_round: int) -> None:
        self._status = CrawlStatus(
            status="running",
            start_round=start_round,
            current_round=start_round,
            collected_count=0,
            started_at=_now_kst(),
            message=f"{start_round}회차부터 수집 예약",
        )

    # ─── DB helpers ──────────────────────────────────────────────
    async def _get_last_round(self, db: aiosqlite.Connection) -> int:
        async with db.execute(
            "SELECT MAX(round_no) AS m FROM lotto_results"
        ) as cur:
            row = await cur.fetchone()
        return int(row["m"]) if row and row["m"] is not None else 0

    async def _insert_result(
        self, db: aiosqlite.Connection, data: dict, created_at: str
    ) -> None:
        await db.execute(
            """
            INSERT OR IGNORE INTO lotto_results (
                round_no, draw_date, num1, num2, num3, num4, num5, num6, bonus,
                total_sell_amount, first_win_amount, first_winner_count,
                first_accum_amount, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """,
            (
                data["round_no"],
                data["draw_date"],
                data["numbers"][0], data["numbers"][1], data["numbers"][2],
                data["numbers"][3], data["numbers"][4], data["numbers"][5],
                data["bonus"],
                data.get("total_sell_amount"),
                data.get("first_win_amount"),
                data.get("first_winner_count"),
                data.get("first_accum_amount"),
                created_at,
            ),
        )

    async def _write_log(
        self,
        db: aiosqlite.Connection,
        started_at: str,
        finished_at: str,
        status: str,
        start_round: int,
        end_round: Optional[int],
        collected: int,
        error: Optional[str],
    ) -> None:
        await db.execute(
            """
            INSERT INTO crawl_logs (
                started_at, finished_at, status, start_round, end_round,
                collected_count, error_message
            ) VALUES (?, ?, ?, ?, ?, ?, ?);
            """,
            (
                started_at, finished_at, status,
                start_round, end_round, collected, error,
            ),
        )

    # ─── Fetch with retry ────────────────────────────────────────
    async def _fetch_with_retry(
        self, client: httpx.AsyncClient, round_no: int
    ) -> Optional[dict]:
        last_exc: Optional[Exception] = None
        for attempt in range(1, settings.CRAWL_MAX_RETRY + 1):
            try:
                return await naver_source.fetch_round(
                    client, round_no, timeout=settings.CRAWL_HTTP_TIMEOUT_SEC
                )
            except Exception as exc:  # noqa: BLE001
                last_exc = exc
                logger.warning(
                    "round %d fetch failed (%d/%d): %s",
                    round_no, attempt, settings.CRAWL_MAX_RETRY, exc,
                )
                if attempt < settings.CRAWL_MAX_RETRY:
                    await asyncio.sleep(settings.CRAWL_RETRY_DELAY_SEC)
        raise RuntimeError(
            f"round {round_no} fetch failed after "
            f"{settings.CRAWL_MAX_RETRY} retries: {last_exc}"
        )

    # ─── Main run ────────────────────────────────────────────────
    async def run(self) -> CrawlStatus:
        async with self._lock:
            started = _now_kst()
            started_iso = started.isoformat()
            collected = 0
            last_ok: Optional[int] = None
            error_msg: Optional[str] = None
            status_final = "success"

            async with get_db() as db:
                start_round = (await self._get_last_round(db)) + 1

            self._status = CrawlStatus(
                status="running",
                start_round=start_round,
                current_round=start_round,
                collected_count=0,
                started_at=started,
                message=f"{start_round}회차부터 수집 시작 (네이버 소스)",
            )

            try:
                async with httpx.AsyncClient(
                    headers=naver_source.DEFAULT_HEADERS,
                ) as client, get_db() as db:
                    current = start_round
                    while True:
                        self._status.current_round = current
                        data = await self._fetch_with_retry(client, current)
                        if data is None:
                            # 해당 회차가 아직 추첨되지 않음 → 정상 종료
                            break
                        await self._insert_result(db, data, _now_kst_iso())
                        await db.commit()
                        collected += 1
                        last_ok = current
                        self._status.collected_count = collected
                        current += 1
                        # 봇 감지 완화: 2초 + 0~0.8초 지터
                        await asyncio.sleep(
                            settings.CRAWL_DELAY_SEC + random.uniform(0, 0.8)
                        )
            except Exception as exc:  # noqa: BLE001
                status_final = "failed"
                error_msg = str(exc)
                logger.exception("crawl failed")

            finished = _now_kst()
            async with get_db() as db:
                await self._write_log(
                    db,
                    started_iso,
                    finished.isoformat(),
                    status_final,
                    start_round,
                    last_ok,
                    collected,
                    error_msg,
                )
                await db.commit()

            self._status = CrawlStatus(
                status="success" if status_final == "success" else "failed",
                start_round=start_round,
                current_round=last_ok,
                collected_count=collected,
                started_at=started,
                finished_at=finished,
                error=error_msg,
                message=(
                    f"{collected}건 수집 완료"
                    if status_final == "success"
                    else f"실패: {error_msg}"
                ),
            )
            return self._status


crawler = LottoCrawler()
