"""꿈해몽 → 번호.

`/keywords` 는 즉시 응답한다. `/recommend` 의 **첫 요청만** 임베딩 모델 로딩으로 약
20초 걸리고 이후는 즉시다. lazy 를 eager 로 바꾸면 꿈해몽을 쓰지 않는 배포에서도
기동 때마다 20초와 수백 MB 를 낸다 (docs/wiki/40-domain/dream-pipeline.md).
"""
from __future__ import annotations

import asyncio
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException

from .. import repository as repo
from ..config import settings
from ..db import get_pool
from ..domain import number_scores
from ..dream import keywords as keywords_mod
from ..dream import service
from ..schemas import DreamKeywordsResponse, DreamRecommendResponse, DreamRequest

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/dream", tags=["dream"])


@router.get("/keywords", response_model=DreamKeywordsResponse)
async def list_keywords() -> dict:
    try:
        # 파일 읽기라 첫 호출만 잠깐 걸린다. 그래도 이벤트 루프를 막지 않는다.
        words = await asyncio.to_thread(keywords_mod.get_keywords, settings.chroma_path)
    except FileNotFoundError as exc:
        # 설정이 잘못된 것이지 사용자 요청이 잘못된 게 아니다. 조용히 빈 목록을 주면
        # 프론트의 정적 페이지가 통째로 사라지고 며칠 뒤에야 발견된다.
        logger.error("ChromaDB 를 찾을 수 없습니다: %s", exc)
        raise HTTPException(
            status_code=503, detail="꿈해몽 사전을 사용할 수 없습니다."
        ) from exc

    return {"total": len(words), "keywords": words}


async def _fill_scores() -> Optional[dict[int, float]]:
    """조합의 모자란 자리를 채울 번호별 통계 점수. 만들지 못하면 `None`.

    **최신 회차만 먼저 물어보고 캐시를 확인한다.** 점수는 회차가 늘 때만 바뀌므로(주 1회),
    캐시가 살아 있으면 1,200여 행을 읽는 질의 자체를 건너뛴다.

    ⚠ **DB 오류를 삼켜서 꿈해몽을 살린다.** 꿈해몽의 본래 의존은 ChromaDB 이고 Postgres 가
    아니다. 채움 방식 하나 때문에 멀쩡히 동작하던 화면을 500 으로 만드는 것은 사용자에게
    더 나쁘다. 대신 **ERROR 로 시끄럽게 남긴다** — 조용히 무작위로 되돌아가면 화면의
    "통계로 채웠습니다" 안내가 사실과 어긋난 채 아무도 모르게 지나간다.
    """
    try:
        pool = get_pool()
        latest = await repo.latest_round(pool)
        if latest is None:
            # 워커가 아직 한 회차도 넣지 않았다. 오류가 아니라 데이터 이전 상태다.
            return None

        cached = number_scores.get_cached(latest["round_no"])
        if cached is not None:
            return cached

        draws = await repo.all_draws(pool)
        # 분석기 4종은 순수 파이썬 루프라 CPU 를 쥔다. 이벤트 루프에 두지 않는다.
        return await asyncio.to_thread(number_scores.load, draws)
    except Exception:
        logger.exception(
            "번호별 통계 점수를 준비하지 못했습니다. "
            "이번 꿈해몽 요청의 부족분은 균등 무작위로 채웁니다."
        )
        return None


@router.post("/recommend", response_model=DreamRecommendResponse)
async def recommend(req: DreamRequest) -> dict:
    fill_scores = await _fill_scores()
    try:
        return await asyncio.to_thread(
            service.recommend,
            req.text,
            chroma_path=settings.chroma_path,
            sets_per_tier=req.sets_per_tier,
            seed=req.seed,
            fill_scores=fill_scores,
            exclude=set(req.exclude),
        )
    except FileNotFoundError as exc:
        logger.error("ChromaDB 를 찾을 수 없습니다: %s", exc)
        raise HTTPException(
            status_code=503, detail="꿈해몽 사전을 사용할 수 없습니다."
        ) from exc
