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
from apscheduler.triggers.combining import OrTrigger
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.date import DateTrigger

from . import job_log
from .config import settings
from .jobs import runner

logger = logging.getLogger(__name__)

KST = ZoneInfo(settings.TZ)

_scheduler: AsyncIOScheduler | None = None


def _warn_if_numeric_dow(expr: str) -> None:
    """★ APScheduler 의 요일 숫자는 표준 크론과 다르다.

        APScheduler:  0=월 1=화 2=수 3=목 4=금 5=토 6=일
        표준 크론:    0=일 1=월 ...        5=금 6=토

    즉 `0 21 * * 6` 은 표준 크론으로는 토요일이지만 APScheduler 에서는 **일요일**이다.
    로또 추첨은 토요일이므로 이 한 글자가 잡을 하루 늦춘다. 그리고 조용히 그렇게 된다 —
    에러도 경고도 없이 매주 하루 늦게 돈다.

    그래서 요일은 `sat` 처럼 **이름으로 쓴다.** 숫자를 쓰면 경고한다.
    """
    fields = expr.split()
    if len(fields) != 5:
        return
    dow = fields[4]
    if dow != "*" and any(ch.isdigit() for ch in dow):
        logger.warning(
            "크론 %r 의 요일 필드가 숫자다(%r). APScheduler 는 0=월…6=일 로 읽어 "
            "표준 크론(0=일…6=토)과 하루 어긋난다. `sat` 처럼 이름으로 쓴다.",
            expr, dow,
        )


def _build_trigger(cron_spec: str) -> CronTrigger | OrTrigger:
    """`;` 로 이어진 여러 크론 표현식을 하나의 트리거로 합친다.

    표준 크론 한 줄로는 20:40·20:50·21:00 을 표현할 수 없다.
    `40,50,0 20,21 * * sat` 은 분과 시의 곱집합이라 여섯 번 돈다.

    잘못된 크론이면 from_crontab 이 ValueError 를 던져 기동이 멈춘다.
    조용히 안 도는 것보다 낫다.
    """
    parts = [p.strip() for p in cron_spec.split(";") if p.strip()]
    if not parts:
        raise ValueError(f"크론 표현식이 비어 있다: {cron_spec!r}")

    for p in parts:
        _warn_if_numeric_dow(p)

    triggers = [CronTrigger.from_crontab(p, timezone=KST) for p in parts]
    # 표현식이 하나뿐이면 굳이 OrTrigger 로 감싸지 않는다.
    return triggers[0] if len(triggers) == 1 else OrTrigger(triggers)


def _cancel_pending_lotto_retries() -> None:
    """예약된 lotto 재시도를 취소한다.

    20:40 이 오류로 죽어 21:40 재시도가 걸렸는데 20:50 크론이 성공했다면,
    그 재시도는 의미가 없다. 남겨 두면 21:40 에 0건 성공 한 줄이 이력에 더 쌓인다.
    """
    if _scheduler is None:
        return
    for attempt in range(2, settings.LOTTO_MAX_ATTEMPT + 1):
        job_id = f"lotto_retry_{attempt}"
        # 없는 잡을 지우려 하면 JobLookupError 다. 대부분의 경우 없는 게 정상이라
        # 예외로 다루지 않는다.
        if _scheduler.get_job(job_id) is not None:
            _scheduler.remove_job(job_id)
            logger.info("예약된 %s 를 취소했다 (다른 실행이 성공)", job_id)


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
        # 성공했으니 앞선 실행이 걸어 둔 재시도 예약은 필요 없다.
        _cancel_pending_lotto_retries()
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
        _build_trigger(settings.LOTTO_CRON),
        id="lotto_cron",
        name="lotto 주간 수집",
        replace_existing=True,
        coalesce=True,
        max_instances=1,
        misfire_grace_time=3600,
    )
    logger.info("lotto 잡 등록 — cron=%r", settings.LOTTO_CRON)

    # 키가 없으면 크론에 올리지 않는다. 올려두면 매시간 failed 행만 쌓인다.
    # 수동 트리거는 여전히 가능하고, 그때는 '키가 없다' 는 이유가 이력에 남는다.
    if settings.naver_news_enabled:
        sched.add_job(
            _run_news,
            _build_trigger(settings.NEWS_CRON),
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
