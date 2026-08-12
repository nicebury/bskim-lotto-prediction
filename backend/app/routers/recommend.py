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

from .. import concurrency
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
        if strategy in rec.HEAVY_STRATEGIES:
            # 몬테카를로는 동시에 돌릴수록 느려진다 — 2건 6.5배, 4건 24.8배(실측).
            # 스레드를 늘려도 GIL 아래에서는 총 처리량이 하나분이라 이득이 0 이고,
            # 잦은 GIL 손바꿈(convoy) 손해만 남는다. 그래서 줄을 세운다
            # (docs/wiki/00-decisions/0012-serialize-monte-carlo.md).
            #
            # 게이트를 `to_thread` **바깥**에 두는 것이 중요하다. 안쪽에서 기다리면
            # 대기하는 스레드가 기본 실행기 슬롯을 쥔 채 잠들고, 같은 실행기를 쓰는
            # 꿈해몽이 굶는다.
            async with concurrency.heavy_slot(strategy):
                combos = await asyncio.to_thread(
                    rec.generate, strategy, draws, sets=sets, seed=seed
                )
        else:
            # 나머지 다섯 전략은 6~14ms 다. 무거운 요청 뒤에 줄 세우지 않는다.
            combos = await asyncio.to_thread(
                rec.generate, strategy, draws, sets=sets, seed=seed
            )
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
