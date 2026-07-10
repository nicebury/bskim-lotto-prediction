"""회차 조회 — 최신 / 목록 / 상세."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Path, Query

from .. import repository as repo
from ..db import get_pool
from ..domain import traits as traits_mod
from ..schemas import LottoRound, LottoRoundDetail, RoundPage

router = APIRouter(prefix="/api/lotto", tags=["lotto"])


@router.get("/latest", response_model=LottoRound)
async def get_latest() -> dict:
    row = await repo.latest_round(get_pool())
    if row is None:
        # 회차가 하나도 없는 것은 서버 오류가 아니라 워커가 아직 데이터를 채우지 않은
        # 상태다. 그래도 "최신 회차" 라는 자원은 존재하지 않으므로 404 다.
        raise HTTPException(status_code=404, detail="아직 수집된 회차가 없습니다.")
    return row


@router.get("/rounds", response_model=RoundPage)
async def list_rounds(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=200),
) -> dict:
    pool = get_pool()
    total = await repo.count_rounds(pool)
    items = await repo.list_rounds(pool, page=page, size=size)
    # 범위를 벗어난 page 는 404 가 아니라 빈 items 다. 목록의 끝은 오류가 아니다.
    return {"total": total, "page": page, "size": size, "items": items}


@router.get("/rounds/{round_no}", response_model=LottoRoundDetail)
async def get_round(round_no: int = Path(ge=1)) -> dict:
    pool = get_pool()
    row = await repo.get_round(pool, round_no)
    if row is None:
        raise HTTPException(status_code=404, detail=f"{round_no}회차를 찾을 수 없습니다.")

    # traits 에 hot_count/cold_count 를 넣지 않는다. 과거 회차 페이지에 "HOT 2개 포함"
    # 이라고 적으면 독자는 그것이 지금 기준인지 그때 기준인지 알 수 없다.
    return {
        **row,
        "prize_tiers": await repo.get_prize_tiers(pool, round_no),
        "traits": traits_mod.compute(row["numbers"]),
    }
