"""통계 — 빈도 / HOT·COLD / 패턴.

세 엔드포인트 모두 회차 전체를 한 번 읽어 메모리에서 자른다. 1,231행이라 SQL 로
window 별 집계를 시키는 것보다 단순하고, `window=all` 과 `window=20` 이 같은 코드를 탄다.
"""
from __future__ import annotations

from fastapi import APIRouter, Query

from .. import repository as repo
from ..db import get_pool
from ..domain import stats
from ..schemas import (
    FrequencyResponse,
    HotColdResponse,
    PairsResponse,
    PatternResponse,
)

router = APIRouter(prefix="/api/lotto/stats", tags=["stats"])

# 계약이 정한 네 값만 받는다. 다른 값은 FastAPI 가 422 로 거른다.
_WINDOW_QUERY = Query("20", pattern=f"^({'|'.join(stats.WINDOW_CHOICES)})$")


def _window_echo(window: str) -> int | str:
    """응답의 `window` 는 요청받은 값을 그대로 되돌려 준다."""
    return window if window == "all" else int(window)


@router.get("/frequency", response_model=FrequencyResponse)
async def frequency(
    window: str = _WINDOW_QUERY,
    include_bonus: bool = Query(
        False,
        description="예측 모듈은 보너스에 ×0.3 가중을 쓰지만, 공개 통계는 포함/제외를 명시적으로 고른다",
    ),
) -> dict:
    draws = await repo.all_draws(get_pool())
    windowed = stats.slice_window(draws, stats.resolve_window(window))
    return {
        "window": _window_echo(window),
        "rounds_analyzed": len(windowed),
        "include_bonus": include_bonus,
        "counts": stats.frequency(windowed, include_bonus=include_bonus),
    }


@router.get("/hot-cold", response_model=HotColdResponse)
async def hot_cold(window: str = _WINDOW_QUERY) -> dict:
    draws = await repo.all_draws(get_pool())
    result = stats.hot_cold(draws, stats.resolve_window(window))
    return {"window": _window_echo(window), **result}


@router.get("/pattern", response_model=PatternResponse)
async def pattern(window: str = _WINDOW_QUERY) -> dict:
    draws = await repo.all_draws(get_pool())
    windowed = stats.slice_window(draws, stats.resolve_window(window))
    return {"window": _window_echo(window), **stats.pattern(windowed)}


@router.get("/pairs", response_model=PairsResponse)
async def pairs(
    window: str = _WINDOW_QUERY,
    number: int | None = Query(
        None, ge=1, le=45, description="주면 그 번호와 함께 나온 상대 번호만"
    ),
    top: int = Query(
        stats.PAIRS_DEFAULT_TOP, ge=1, le=stats.PAIRS_MAX_TOP, description="반환 개수"
    ),
) -> dict:
    draws = await repo.all_draws(get_pool())
    windowed = stats.slice_window(draws, stats.resolve_window(window))
    return {
        "window": _window_echo(window),
        **stats.pairs(windowed, number=number, top=top),
    }
