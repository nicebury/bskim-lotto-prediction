"""번호 추천.

무거운 numpy 작업(몬테카를로 5만 회)은 `asyncio.to_thread` 로 워커 스레드에 보낸다.
이벤트 루프에서 돌리면 그동안 다른 요청이 전부 멈춘다
(docs/wiki/40-domain/prediction-algorithm.md).
"""
from __future__ import annotations

import asyncio
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from .. import repository as repo
from ..db import get_pool
from ..domain import recommend as rec
from ..domain import stats
from ..domain import traits as traits_mod
from ..prediction.config import HOT_RECENT_ROUNDS
from ..schemas import RecommendResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/lotto", tags=["recommend"])


@router.post("/recommend", response_model=RecommendResponse)
async def recommend(
    strategy: str = Query(rec.ENSEMBLE, description=" | ".join(rec.STRATEGIES)),
    sets: int = Query(5, ge=1, le=10),
    seed: Optional[int] = Query(None, description="같은 seed 는 항상 같은 결과를 낸다"),
) -> dict:
    if strategy not in rec.STRATEGIES:
        raise HTTPException(
            status_code=422,
            detail=f"알 수 없는 전략입니다: {strategy}. "
            f"가능한 값: {', '.join(rec.STRATEGIES)}",
        )

    draws = await repo.all_draws(get_pool())

    try:
        combos = await asyncio.to_thread(rec.generate, strategy, draws, sets=sets, seed=seed)
    except rec.InsufficientDataError as exc:
        # 요청 자체는 유효하다. 처리 조건(회차 50개)이 미충족일 뿐이라 400 이 아니라 422 다.
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    # hot/cold 기준은 `/api/lotto/stats/hot-cold?window=20` 과 같은 함수에서 나온다.
    # 두 화면의 숫자가 어긋나면 사용자는 어느 쪽도 믿지 않는다.
    if draws:
        hot, cold = stats.hot_cold_sets(draws, HOT_RECENT_ROUNDS)
        hot_window: Optional[int] = HOT_RECENT_ROUNDS
    else:
        # pure_random 만 여기 도달한다. 나머지 전략은 위에서 422 로 끝났다.
        hot, cold, hot_window = None, None, None

    return {
        "strategy": strategy,
        "seed": seed,
        "sets": [
            {"numbers": c, "traits": traits_mod.compute_with_hot_cold(c, hot, cold)}
            for c in combos
        ],
        "hot_window": hot_window,
        "disclaimer": rec.DISCLAIMER,
    }
