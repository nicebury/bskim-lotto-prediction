"""APScheduler 기반 주간 크롤 자동 실행.

- 매주 토요일 21:00 KST 에 crawler.run() 호출 (추첨 20:45 직후 최신 회차 수집)
- 기동 시 마지막 성공 크롤이 7일 초과 전이면 catch-up 1회 실행
- 워커 1개 전제 — 기존 asyncio.Lock 이 같은 이벤트 루프에서 중복 방지
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from .crawler import crawler
from .database import get_db

logger = logging.getLogger(__name__)

KST = timezone(timedelta(hours=9))
CATCH_UP_THRESHOLD = timedelta(days=7)

_scheduler: Optional[AsyncIOScheduler] = None


async def _run_crawl(reason: str) -> None:
    if crawler.is_running():
        logger.info("crawl skipped (%s) — already running", reason)
        return
    logger.info("crawl triggered (%s)", reason)
    await crawler.run()


async def _last_success_at() -> Optional[datetime]:
    async with get_db() as db:
        async with db.execute(
            "SELECT MAX(finished_at) AS t FROM crawl_logs WHERE status = 'success'"
        ) as cur:
            row = await cur.fetchone()
    if not row or not row["t"]:
        return None
    try:
        dt = datetime.fromisoformat(row["t"])
    except ValueError:
        return None
    return dt.replace(tzinfo=KST) if dt.tzinfo is None else dt


async def _catch_up_if_needed() -> None:
    last = await _last_success_at()
    now = datetime.now(KST)
    if last is None:
        await _run_crawl("catch-up: no prior success")
        return
    age = now - last
    if age < CATCH_UP_THRESHOLD:
        logger.info("catch-up skipped — last success %s ago", age)
        return
    await _run_crawl(f"catch-up: last success {age} ago")


def start_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        return
    sched = AsyncIOScheduler(timezone=KST)
    sched.add_job(
        _run_crawl,
        CronTrigger(day_of_week="sat", hour=21, minute=0, timezone=KST),
        kwargs={"reason": "weekly cron (Sat 21:00 KST)"},
        id="weekly_naver_crawl",
        name="Weekly Naver lotto crawl",
        replace_existing=True,
        coalesce=True,
        max_instances=1,
        misfire_grace_time=3600,
    )
    sched.start()
    _scheduler = sched
    logger.info("scheduler started — weekly crawl at Saturday 21:00 KST")
    asyncio.create_task(_catch_up_if_needed())


def shutdown_scheduler() -> None:
    global _scheduler
    if _scheduler is None:
        return
    _scheduler.shutdown(wait=False)
    _scheduler = None
    logger.info("scheduler stopped")
