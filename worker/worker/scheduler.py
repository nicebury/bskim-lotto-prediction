"""APScheduler 기반 잡 스케줄.

크론 문자열을 코드에 박지 않는다. LOTTO_CRON / NEWS_CRON 환경변수에서 읽는다 —
추첨 시각이 바뀌거나 뉴스 API 쿼터가 확인되면 재배포 없이 조정할 수 있어야 한다.

계약: docs/wiki/10-contracts/worker-jobs.md
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.date import DateTrigger

from . import job_log
from .config import settings
from .jobs import runner

logger = logging.getLogger(__name__)

KST = ZoneInfo(settings.TZ)

_scheduler: AsyncIOScheduler | None = None


async def _run_lotto(attempt: int = 1) -> None:
    """로또 잡을 실행하고, 실패하면 일정 시간 뒤 다시 시도한다.

    추첨 결과가 네이버 위젯에 늦게 반영되는 경우가 있어 같은 날 안에서 재시도한다.
    기본값(60분 × 3회)이면 21:00 · 22:00 · 23:00 이 된다. 시각을 박지 않고
    '몇 분 뒤' 로 표현하는 이유는 LOTTO_CRON 을 바꾸면 재시도도 따라 움직여야
    하기 때문이다.

    세 번 모두 실패하면 포기한다. 다음 주까지 기다리지 않는다 — 수동 트리거가 있다.
    (워커가 재시작되면 예약된 재시도는 사라진다. DateTrigger 가 메모리에만 있기
     때문이다. 이것도 수동 트리거로 복구한다.)
    """
    if runner.is_running("lotto"):
        logger.info("lotto 잡 건너뜀 — 이미 실행 중이다")
        return

    ok = await runner.run_now("lotto", "cron")
    if ok:
        return

    if attempt >= settings.LOTTO_MAX_ATTEMPT:
        logger.error(
            "lotto 잡이 %d회 시도 후에도 실패했다. 다음 크론까지 자동 재시도하지 않는다. "
            "수동 트리거로 실행한다.",
            attempt,
        )
        return

    next_attempt = attempt + 1
    run_at = datetime.now(KST) + timedelta(minutes=settings.LOTTO_RETRY_DELAY_MIN)
    logger.warning(
        "lotto 잡 %d차 시도 실패. %s 에 %d차 시도를 예약한다",
        attempt, run_at.strftime("%H:%M"), next_attempt,
    )
    assert _scheduler is not None
    _scheduler.add_job(
        _run_lotto,
        DateTrigger(run_date=run_at),
        kwargs={"attempt": next_attempt},
        id=f"lotto_retry_{next_attempt}",
        name=f"lotto 재시도 {next_attempt}차",
        replace_existing=True,
    )


async def _run_news() -> None:
    """뉴스 잡. 실패해도 재시도하지 않는다 — 다음 주기에 어차피 다시 검색된다."""
    if runner.is_running("news"):
        logger.info("news 잡 건너뜀 — 이미 실행 중이다")
        return
    await runner.run_now("news", "cron")


async def _catch_up() -> None:
    """기동 시 로또 잡을 따라잡는다.

    서버가 토요일 밤에 꺼져 있었으면 회차를 통째로 놓친다. 마지막 성공이 7일을
    넘었으면(= 최소 한 번의 추첨을 지나쳤으면) 즉시 한 번 실행한다.

    news 잡은 catch-up 하지 않는다 — 놓친 뉴스는 다음 주기에 검색된다.
    """
    last = await job_log.last_success_at("lotto")
    if last is None:
        logger.info("catch-up: lotto 잡의 성공 이력이 없어 즉시 1회 실행한다")
        await _run_lotto()
        return

    age = datetime.now(KST) - last
    if age < timedelta(days=settings.CATCH_UP_DAYS):
        logger.info("catch-up 건너뜀 — 마지막 성공이 %s 전이다", age)
        return

    logger.info("catch-up: 마지막 성공이 %s 전이라 즉시 1회 실행한다", age)
    await _run_lotto()


def start() -> None:
    """스케줄러를 띄우고 잡을 등록한다.

    coalesce=True: 서버가 꺼져 있어 크론을 여러 번 놓쳤어도 살아난 뒤 한 번만 돈다.
    max_instances=1: APScheduler 수준의 중복 방지. 잡별 락과 이중 방어다.
    misfire_grace_time: 크론 시각에 프로세스가 잠깐 바빴어도 1시간 내면 실행한다.
    """
    global _scheduler
    if _scheduler is not None:
        return

    sched = AsyncIOScheduler(timezone=KST)

    # from_crontab 이 문자열을 파싱한다. 잘못된 크론이면 여기서 ValueError 로
    # 기동이 멈춘다 — 조용히 안 도는 것보다 낫다.
    sched.add_job(
        _run_lotto,
        CronTrigger.from_crontab(settings.LOTTO_CRON, timezone=KST),
        id="lotto_cron",
        name="lotto 주간 수집",
        replace_existing=True,
        coalesce=True,
        max_instances=1,
        misfire_grace_time=3600,
    )
    logger.info("lotto 잡 등록 — cron=%r", settings.LOTTO_CRON)

    # 키가 없으면 크론에 올리지 않는다. 올려두면 하루 3번 failed 행만 쌓인다.
    # 수동 트리거는 여전히 가능하고, 그때는 '키가 없다' 는 이유가 이력에 남는다.
    if settings.naver_news_enabled:
        sched.add_job(
            _run_news,
            CronTrigger.from_crontab(settings.NEWS_CRON, timezone=KST),
            id="news_cron",
            name="news 수집",
            replace_existing=True,
            coalesce=True,
            max_instances=1,
            misfire_grace_time=3600,
        )
        logger.info("news 잡 등록 — cron=%r", settings.NEWS_CRON)
    else:
        logger.warning(
            "NAVER_CLIENT_ID/SECRET 이 없어 news 잡을 크론에 등록하지 않는다. "
            "lotto 잡은 정상 동작한다."
        )

    sched.start()
    _scheduler = sched

    # catch-up 이 기동을 막지 않게 백그라운드로 돌린다. 수집이 수십 초 걸리는데
    # lifespan 안에서 기다리면 그동안 헬스체크가 응답하지 않는다.
    asyncio.create_task(_catch_up())


def shutdown() -> None:
    global _scheduler
    if _scheduler is None:
        return
    _scheduler.shutdown(wait=False)
    _scheduler = None
    logger.info("스케줄러를 중지했다")
