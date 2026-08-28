"""통계 — 빈도 / HOT·COLD / 패턴 / 동반 출현 / 번호 하나.

다섯 엔드포인트 모두 회차 전체를 한 번 읽어 메모리에서 자른다. 1,232행이라 SQL 로
구간별 집계를 시키는 것보다 단순하고, `window=all`·`window=20`·임의 기간이 **같은
코드**를 탄다. 실측으로 전 회차 빈도 집계가 1.54ms 다
(docs/wiki/10-contracts/db-schema.md 의 '통계 테이블을 두지 않는 이유').
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Path, Query

from .. import repository as repo
from ..db import get_pool
from ..domain import stats
from ..schemas import (
    FrequencyResponse,
    HotColdResponse,
    NumberStatsResponse,
    PairsResponse,
    PatternResponse,
)

router = APIRouter(prefix="/api/lotto/stats", tags=["stats"])

# 계약이 정한 네 값만 받는다. 다른 값은 FastAPI 가 422 로 거른다.
_WINDOW_QUERY = Query("20", pattern=f"^({'|'.join(stats.WINDOW_CHOICES)})$")


class RangeQuery:
    """조회 구간 파라미터. 다섯 엔드포인트가 **같은 의존성**을 공유한다.

    파라미터 선언을 한 곳에 모으는 이유는 문서화가 아니라 **규칙의 단일화**다. 엔드포인트
    마다 따로 선언하면 어느 하나에서 `from_round` 만 받아 주는 실수가 생기고, 그때
    화면은 자기가 무엇을 보고 있는지 모르게 된다.

    유효성 검사는 여기서 끝내고(422), 도메인은 이미 유효한 값만 받는다.
    """

    def __init__(
        self,
        window: str = _WINDOW_QUERY,
        from_round: int | None = Query(
            None, ge=1, description="구간 시작 회차(포함). to_round 와 함께 주어야 한다"
        ),
        to_round: int | None = Query(
            None, ge=1, description="구간 끝 회차(포함). from_round 와 함께 주어야 한다"
        ),
    ) -> None:
        self.window = window
        self.from_round = from_round
        self.to_round = to_round

    def select(self, draws):
        """집계 대상 회차와 응답의 구간 메타를 만든다. 잘못된 구간이면 422."""
        try:
            return stats.select_range(
                draws,
                window=self.window,
                from_round=self.from_round,
                to_round=self.to_round,
            )
        except stats.InvalidRangeError as exc:
            # 요청 형식은 유효하다. 값의 조합이 성립하지 않을 뿐이라 400 이 아니라 422 다.
            raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/frequency", response_model=FrequencyResponse)
async def frequency(
    rq: RangeQuery = Depends(),
    include_bonus: bool = Query(
        False,
        description="예측 모듈은 보너스에 ×0.3 가중을 쓰지만, 공개 통계는 포함/제외를 명시적으로 고른다",
    ),
) -> dict:
    draws = await repo.all_draws(get_pool())
    selected, meta = rq.select(draws)
    return {
        **meta,
        "include_bonus": include_bonus,
        "counts": stats.frequency(selected, include_bonus=include_bonus),
    }


@router.get("/hot-cold", response_model=HotColdResponse)
async def hot_cold(
    rq: RangeQuery = Depends(),
    top: int = Query(
        stats.TOP_N,
        ge=1,
        le=stats.TOP_MAX,
        description="hot·cold·overdue 각 배열의 개수. 기본 10 은 하위호환을 위한 값이다",
    ),
) -> dict:
    draws = await repo.all_draws(get_pool())
    selected, meta = rq.select(draws)
    # overdue 와 last_seen_round 는 구간이 아니라 역대 전체에서 나온다. 그래서 draws 를
    # 통째로 넘긴다 — 자세한 이유는 stats.hot_cold 의 docstring.
    return {**meta, **stats.hot_cold(draws, selected, top=top)}


@router.get("/pattern", response_model=PatternResponse)
async def pattern(rq: RangeQuery = Depends()) -> dict:
    draws = await repo.all_draws(get_pool())
    selected, meta = rq.select(draws)
    return {**meta, **stats.pattern(selected)}


@router.get("/pairs", response_model=PairsResponse)
async def pairs(
    rq: RangeQuery = Depends(),
    number: int | None = Query(
        None, ge=1, le=45, description="주면 그 번호와 함께 나온 상대 번호만"
    ),
    top: int = Query(
        stats.PAIRS_DEFAULT_TOP, ge=1, le=stats.PAIRS_MAX_TOP, description="반환 개수"
    ),
) -> dict:
    draws = await repo.all_draws(get_pool())
    selected, meta = rq.select(draws)
    return {**meta, **stats.pairs(selected, number=number, top=top)}


@router.get("/number/{n}", response_model=NumberStatsResponse)
async def number_stats(
    n: int = Path(ge=1, le=45, description="조회할 번호"),
    rq: RangeQuery = Depends(),
) -> dict:
    """번호 하나의 통계. 화면 하단 "내가 보고 싶은 번호" 조회용.

    `rank` 를 서버가 계산해 주는 것이 이 엔드포인트의 존재 이유다 — 45개를 정렬해야
    나오는 값이라 브라우저가 따로 세면 화면과 서버의 숫자가 갈라진다.
    """
    draws = await repo.all_draws(get_pool())
    selected, meta = rq.select(draws)
    return {**meta, **stats.number_stats(draws, selected, n)}
