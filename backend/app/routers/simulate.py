"""AI 번호추천 시뮬레이터.

계약: `docs/wiki/10-contracts/api-contract.md` 의 'AI 번호추천 시뮬레이터' 절

`POST /api/lotto/recommend?strategy=ensemble` 과 **같은 번호를 만들되**, 어떻게 그
번호에 이르렀는지를 단계별 수치로 함께 준다.

## ★ 이 경로는 몬테카를로를 탄다 — 줄을 세운다

`recommend` 의 `ensemble` 과 같은 계산이므로 **같은 게이트**(`concurrency.heavy_slot`)를
쓴다. 게이트를 공유해야 하는 이유: 두 엔드포인트가 각자 슬롯을 가지면 동시에 두 개가
돌아 [[0012-serialize-monte-carlo]] 가 막으려던 상황(2건 6.5배)이 그대로 재현된다.

⚠ `trials=100000` 은 기본 5만의 두 배라 단독으로도 5초쯤 걸린다. 계약은 화면이 "총
15초쯤 진행 표시를 돌린다" 고 했으므로 그 안에 든다. 다만 **앞 요청이 돌고 있으면 그만큼
더 기다린다** — 그때 `app.concurrency` 가 대기 시간을 경고로 남긴다.
"""
from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, HTTPException

from .. import concurrency
from .. import repository as repo
from ..db import get_pool
from ..domain import recommend as rec
from ..domain import simulate as sim
from ..schemas import SimulateRequest, SimulateResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/lotto", tags=["simulate"])


@router.post("/simulate", response_model=SimulateResponse)
async def simulate(req: SimulateRequest) -> dict:
    # `trials` 의 허용값은 스키마의 `Literal` 이 막는다(422). 여기서 다시 검사하지
    # 않는 이유: 검사가 두 곳에 있으면 한쪽만 고쳐 규칙이 갈라진다.
    draws = await repo.all_draws(get_pool())

    try:
        # ★ `recommend` 와 **같은 게이트**를 쓴다. 라벨만 다르게 줘서 로그에서 어느
        # 경로가 밀리는지 구분한다.
        async with concurrency.heavy_slot("simulate"):
            result = await asyncio.to_thread(
                sim.simulate,
                draws,
                sets=req.sets,
                trials=req.trials,
                seed=req.seed,
            )
    except rec.InsufficientDataError as exc:
        # 요청 자체는 유효하다. 처리 조건(회차 50개)이 미충족일 뿐이라 400 이 아니라
        # 422 다 — `recommend` 와 같은 규약이다.
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return result
