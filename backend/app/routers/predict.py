import asyncio
import logging
import sqlite3
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from ..config import settings
from ..prediction import predictor
from ..prediction.strategies import (
    balanced_range,
    cold_return,
    golden_combo,
    pair_affinity,
    pure_random,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["predict"])


def _load_rows():
    conn = sqlite3.connect(str(settings.DB_PATH))
    try:
        rows = conn.execute(
            """
            SELECT round_no, num1, num2, num3, num4, num5, num6
              FROM lotto_results
             ORDER BY round_no ASC
            """
        ).fetchall()
    finally:
        conn.close()
    round_numbers = [r[0] for r in rows]
    num_rows = [tuple(r[1:7]) for r in rows]
    return round_numbers, num_rows


def _run_all_strategies(sets: int, seed: Optional[int]) -> dict:
    round_numbers, num_rows = _load_rows()
    if len(num_rows) < 20:
        raise ValueError(
            f"데이터가 부족합니다. 최소 20회차 필요, 현재 {len(num_rows)}회차."
        )
    return {
        "pair_affinity": pair_affinity.generate(num_rows, sets=sets, seed=seed),
        "balanced_range": balanced_range.generate(num_rows, sets=sets, seed=seed),
        "cold_return": cold_return.generate(
            num_rows, round_numbers, sets=sets, seed=seed
        ),
        "golden_combo": golden_combo.generate(num_rows, sets=sets, seed=seed),
        "pure_random": pure_random.generate(sets=sets, seed=seed),
        "latest_round": max(round_numbers),
        "total_rounds": len(num_rows),
    }


@router.post("/predict")
async def run_prediction(
    sets: int = Query(5, ge=1, le=10, description="추천 세트 수"),
    simulations: int = Query(
        50_000, ge=1_000, le=200_000, description="몬테카를로 시뮬레이션 횟수"
    ),
    hot_rounds: int = Query(
        20, ge=5, le=100, description="핫넘버 분석에 사용할 최근 회차 수"
    ),
    seed: Optional[int] = Query(None, description="재현 가능성 시드"),
) -> dict:
    """역대 데이터 기반 다음 회차 번호 예측 (재미 목적)."""
    try:
        return await asyncio.to_thread(
            predictor.predict,
            settings.DB_PATH,
            sets=sets,
            simulations=simulations,
            hot_rounds=hot_rounds,
            seed=seed,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("prediction failed")
        raise HTTPException(status_code=500, detail=f"예측 실패: {exc}") from exc


@router.post("/predict/strategies")
async def run_strategies(
    sets: int = Query(1, ge=1, le=5, description="전략별 세트 수"),
    seed: Optional[int] = Query(None),
) -> dict:
    """5개 대체 추천 전략을 한 번에 실행 (궁합/구간/부활/황금/랜덤)."""
    try:
        return await asyncio.to_thread(_run_all_strategies, sets, seed)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("strategies failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc
