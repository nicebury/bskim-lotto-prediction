"""워커 진입점.

    uv run uvicorn worker.main:app --host 127.0.0.1 --port 8003

**워커는 반드시 1개다.** 잡 락이 프로세스 메모리에 있어 다중 워커면 같은 잡이
중복 실행된다. uvicorn 의 --workers 를 쓰지 않는다.

WORKER_HOST 를 0.0.0.0 으로 바꾸지 않는다. /internal/* 은 루프백 전용이다.
"""
from __future__ import annotations

import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from . import job_log, scheduler
from .api.internal import router as internal_router
from .config import settings
from .db import ping

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s [%(name)s] %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
    """기동과 종료.

    순서가 중요하다.
      1. DB 접속을 먼저 확인한다. 안 되면 여기서 죽는 게 낫다 — 접속 불가인 채
         뜨면 토요일 21시 크론에서야 알게 되고, 그때는 회차를 놓친 뒤다.
      2. 유령 running 행을 정리한다. 스케줄러가 돌기 전에 해야 방금 시작한
         잡을 오인해 failed 로 덮지 않는다.
      3. 스케줄러를 띄운다. catch-up 은 그 안에서 백그라운드로 돈다.
    """
    logger.info(
        "워커 기동 — %s:%d / lotto_cron=%r / news_cron=%r / 뉴스API=%s",
        settings.WORKER_HOST,
        settings.WORKER_PORT,
        settings.LOTTO_CRON,
        settings.NEWS_CRON,
        "활성" if settings.naver_news_enabled else "비활성(키 없음)",
    )
    if settings.WORKER_HOST not in ("127.0.0.1", "localhost", "::1"):
        # 죽이지는 않는다 — 실제 바인딩은 uvicorn 인자가 결정하므로 이 값이
        # 곧 노출을 뜻하지는 않는다. 다만 눈에 띄게 남긴다.
        logger.warning(
            "WORKER_HOST=%r 가 루프백이 아니다. /internal/* 은 외부에 노출되면 안 된다.",
            settings.WORKER_HOST,
        )

    await ping()
    await job_log.cleanup_stale()
    scheduler.start()

    yield

    scheduler.shutdown()
    logger.info("워커 종료")


# 공개 API 가 아니므로 문서 UI 를 끈다. 루프백 전용이고, 스키마를 노출해서
# 얻을 것이 없다.
app = FastAPI(
    title="행운상자 워커",
    description="외부 수집 → Postgres 쓰기. 내부 트리거 전용.",
    lifespan=lifespan,
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)

app.include_router(internal_router)
