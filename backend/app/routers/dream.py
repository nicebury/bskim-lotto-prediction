"""꿈해몽 → 번호.

`/keywords` 는 즉시 응답한다. `/recommend` 의 **첫 요청만** 임베딩 모델 로딩으로 약
20초 걸리고 이후는 즉시다. lazy 를 eager 로 바꾸면 꿈해몽을 쓰지 않는 배포에서도
기동 때마다 20초와 수백 MB 를 낸다 (docs/wiki/40-domain/dream-pipeline.md).
"""
from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, HTTPException

from ..config import settings
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


@router.post("/recommend", response_model=DreamRecommendResponse)
async def recommend(req: DreamRequest) -> dict:
    try:
        return await asyncio.to_thread(
            service.recommend,
            req.text,
            chroma_path=settings.chroma_path,
            sets_per_tier=req.sets_per_tier,
            seed=req.seed,
        )
    except FileNotFoundError as exc:
        logger.error("ChromaDB 를 찾을 수 없습니다: %s", exc)
        raise HTTPException(
            status_code=503, detail="꿈해몽 사전을 사용할 수 없습니다."
        ) from exc
