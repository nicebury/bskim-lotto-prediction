"""꿈 분석 → 로또 번호 추천 라우터.

엔드포인트:
  POST /api/dream/analyze  — 꿈 텍스트 → 형태소 추출 + 각 단어별 유사 매칭
  POST /api/dream/lotto    — 선택된 매칭 → 3-세트 번호 생성
  POST /api/dream/predict  — 한 방에 (analyze + 모든 매칭 lotto 생성)
"""
from __future__ import annotations

import asyncio
import logging
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..config import settings
from ..dream import generator
from ..dream.state import get_analyzer, get_searcher

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/dream", tags=["dream"])


class DreamTextRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=500)


class SelectedItem(BaseModel):
    gubun: int = Field(..., ge=1, le=3)
    lotto_number: list[int]


class LottoRequest(BaseModel):
    selected: List[SelectedItem]
    sets_per_tier: int = Field(10, ge=1, le=30)
    seed: Optional[int] = None


class PredictRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=500)
    sets_per_tier: int = Field(10, ge=1, le=30)
    seed: Optional[int] = None


def _analyze_impl(text: str) -> dict:
    analyzer = get_analyzer()
    searcher = get_searcher(settings.CHROMA_DB_PATH)

    words = analyzer.analyze(text)
    if not words:
        return {"query": text, "words": []}

    payload: list[dict] = []
    for w in words:
        exact, containing, similar = searcher.search(w)
        results = [m.to_dict() for m in (*exact, *containing, *similar)]
        if not results:
            continue
        payload.append({"dream_word": w, "results": results})

    return {"query": text, "words": payload}


def _build_lotto_impl(selected: list[dict], sets_per_tier: int, seed: Optional[int]) -> dict:
    return generator.build_tier_sets(
        selected, sets_per_tier=sets_per_tier, seed=seed
    )


def _predict_impl(text: str, sets_per_tier: int, seed: Optional[int]) -> dict:
    analyzed = _analyze_impl(text)
    flat: list[dict] = []
    for w in analyzed["words"]:
        for r in w["results"]:
            flat.append({"gubun": r["gubun"], "lotto_number": r["lotto_number"]})
    tiers = _build_lotto_impl(flat, sets_per_tier, seed)
    return {**analyzed, "tiers": tiers}


@router.post("/analyze")
async def analyze(req: DreamTextRequest) -> dict:
    try:
        return await asyncio.to_thread(_analyze_impl, req.text)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("dream analyze failed")
        raise HTTPException(status_code=500, detail=f"분석 실패: {exc}") from exc


@router.post("/lotto")
async def make_lotto(req: LottoRequest) -> dict:
    try:
        items = [s.model_dump() for s in req.selected]
        return await asyncio.to_thread(
            _build_lotto_impl, items, req.sets_per_tier, req.seed
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("dream lotto failed")
        raise HTTPException(status_code=500, detail=f"번호 생성 실패: {exc}") from exc


@router.post("/predict")
async def predict(req: PredictRequest) -> dict:
    try:
        return await asyncio.to_thread(
            _predict_impl, req.text, req.sets_per_tier, req.seed
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("dream predict failed")
        raise HTTPException(status_code=500, detail=f"예측 실패: {exc}") from exc
