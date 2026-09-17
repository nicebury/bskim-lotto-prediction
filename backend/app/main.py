"""FastAPI 앱.

이 서비스는 Postgres 를 **읽어** 계산하고 JSON 으로 준다. 크롤링하지 않고, 스케줄링하지
않고, DB 에 쓰지 않는다. 워커의 존재를 알지 못한다
(docs/wiki/10-contracts/component-boundaries.md).
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

import psycopg
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import settings
from .db import close_pool, open_pool
from .routers import (
    admin, analyze, dream, lotto, meta, news, recommend, simulate, stats, video,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 꿈해몽 모델은 여기서 로드하지 않는다. lazy 를 eager 로 바꾸면 꿈해몽을 쓰지 않는
    # 배포에서도 기동이 20초 느려진다.
    await open_pool()
    try:
        yield
    finally:
        await close_pool()


app = FastAPI(
    title="행운상자 API",
    description="로또 6/45 회차·통계·추천 정보를 제공하는 읽기 전용 API",
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.exception_handler(psycopg.Error)
async def handle_db_error(request: Request, exc: psycopg.Error) -> JSONResponse:
    """DB 오류의 원문을 사용자에게 흘리지 않는다.

    특히 `permission denied for table ...` 이 그렇다. 그것이 클라이언트에 보이면
    ① 롤 권한 설정이 잘못됐다는 사실과 ② 테이블 이름이 함께 노출된다. 사용자가 할 수
    있는 일도 없다. 원문은 서버 로그에만 남기고 500 으로 감싼다
    (docs/wiki/10-contracts/api-contract.md 의 오류 형식).

    워커가 새 테이블을 추가했는데 `ALTER DEFAULT PRIVILEGES` 가 빠졌을 때 정확히 이
    경로를 탄다. 로그의 SQLSTATE 42501 을 보고 db-schema.md 의 함정 절로 가면 된다.
    """
    logger.exception("DB 오류 [%s] %s: %s", request.method, request.url.path, exc)
    return JSONResponse(status_code=500, content={"detail": "일시적인 서버 오류입니다."})


app.include_router(lotto.router)
app.include_router(stats.router)
app.include_router(analyze.router)
app.include_router(recommend.router)
app.include_router(simulate.router)
app.include_router(dream.router)
app.include_router(news.router)
app.include_router(video.router)
app.include_router(admin.router)
app.include_router(meta.router)


@app.get("/health", tags=["health"])
async def health() -> dict[str, str]:
    """얕은 헬스체크. DB 연결을 확인하지 않는다.

    DB 를 확인하는 헬스체크는 DB 가 잠깐 흔들릴 때 멀쩡한 프로세스를 재시작시킨다.
    준비 상태(readiness)가 필요하면 별도 엔드포인트를 만든다.
    """
    return {"status": "ok"}
