"""번호 추천 — 여섯 전략을 하나의 인터페이스로.

모든 전략은 `list[list[int]]`(정렬된 6개 번호의 세트들)만 돌려준다. 각 전략이 자기
`meta`(top_pair, golden_ratio 등)를 갖고 있지만 API 로 내보내지 않는다. 그 값들은
"이 조합이 왜 좋은가" 를 암시하고, 좋은 조합 같은 것은 없기 때문이다. 사용자에게는
조합의 성향(`traits`)만 사실로 서술한다 (docs/wiki/40-domain/forbidden-expressions.md).

`avg_number_hits`·`hit_count`·`valid_combos_count` 도 같은 이유로 여기서 버린다.
시뮬레이션 내부 수치이고, 사용자가 해석하려 들면 확률로 오해한다.

**이 모듈의 모든 함수는 동기다.** numpy 가 이벤트 루프를 막지 않도록 라우터가
`asyncio.to_thread` 로 감싼다.
"""
from __future__ import annotations

from typing import Optional, Sequence

from ..prediction import predictor
from ..prediction.config import (
    HOT_RECENT_ROUNDS,
    MIN_REQUIRED_ROUNDS,
    MONTE_CARLO_SIMULATIONS,
)
from ..prediction.strategies import (
    balanced_range,
    cold_return,
    golden_combo,
    pair_affinity,
    pure_random,
)
from .draw import Draw

ENSEMBLE = "ensemble"
PURE_RANDOM = "pure_random"

STRATEGIES = (
    ENSEMBLE,
    "pair_affinity",
    "balanced_range",
    "cold_return",
    "golden_combo",
    PURE_RANDOM,
)

# 과거 회차를 한 줄도 읽지 않는 전략. 데이터가 없다는 이유로 막을 근거가 없다.
# 이것은 통제군이다 — 다른 전략의 결과가 무작위와 구분되지 않음을 보이는 것이
# 이 서비스의 정직함이므로, 데이터가 비었을 때에도 살아 있어야 한다.
DATA_FREE_STRATEGIES = frozenset({PURE_RANDOM})

# 몬테카를로 5만 회를 타는 전략. 라우터가 이 목록을 보고 동시 실행을 막는다
# (docs/wiki/00-decisions/0012-serialize-monte-carlo.md).
#
# 나머지 다섯은 6~14ms 로 끝난다. 그것들까지 같은 게이트에 넣으면 가벼운 요청이
# 2.5초짜리 뒤에서 기다리게 되므로 **넣지 않는다.**
#
# 이 목록을 라우터가 아니라 여기 두는 이유: 어떤 전략이 무엇을 계산하는지 아는 곳은
# 이 모듈이다. 새 전략을 STRATEGIES 에 추가하면서 몬테카를로를 태운다면, 그 사실을
# 라우터가 아니라 여기서 함께 적게 된다.
HEAVY_STRATEGIES = frozenset({ENSEMBLE})

DISCLAIMER = (
    "추천번호는 과거 당첨번호 통계와 랜덤 알고리즘을 활용한 참고용 시뮬레이션입니다. "
    "당첨을 보장하지 않습니다."
)


class InsufficientDataError(Exception):
    """회차가 모자라 통계 기반 전략을 계산할 수 없다. 라우터가 422 로 옮긴다."""


def _sets_from(result: dict) -> list[list[int]]:
    """대체 전략들의 `{"sets": [{"numbers": [...], "source": ...}], "meta": {...}}` 를 벗긴다."""
    return [item["numbers"] for item in result["sets"]]


def generate(
    strategy: str,
    draws: Sequence[Draw],
    *,
    sets: int,
    seed: Optional[int] = None,
    simulations: int = MONTE_CARLO_SIMULATIONS,
) -> list[list[int]]:
    """전략 이름으로 조합을 만든다. 같은 seed 는 항상 같은 결과를 낸다.

    `simulations` 는 API 로 노출하지 않는다. 사용자가 조절할 이유가 없고, 값을 올리면
    응답이 느려질 뿐이다. 테스트가 빠르게 돌도록 낮출 수 있게만 열어 둔다.
    """
    if strategy not in STRATEGIES:
        raise ValueError(f"알 수 없는 전략입니다: {strategy}")

    if strategy not in DATA_FREE_STRATEGIES and len(draws) < MIN_REQUIRED_ROUNDS:
        raise InsufficientDataError(
            f"데이터가 부족합니다. 최소 {MIN_REQUIRED_ROUNDS}회차 필요, "
            f"현재 {len(draws)}회차."
        )

    if strategy == PURE_RANDOM:
        return _sets_from(pure_random.generate(sets=sets, seed=seed))

    num_rows = [d.numbers for d in draws]
    round_numbers = [d.round_no for d in draws]

    if strategy == ENSEMBLE:
        # 몬테카를로가 유효 조합을 못 채우면 세트가 요청보다 적을 수 있다. 억지로
        # 채우지 않는다 — 없는 것을 만들어 내느니 적게 주는 편이 정직하다.
        result = predictor.predict(draws, sets=sets, seed=seed, simulations=simulations)
        return [r["numbers"] for r in result["recommendations"]]

    if strategy == "pair_affinity":
        return _sets_from(pair_affinity.generate(num_rows, sets=sets, seed=seed))
    if strategy == "balanced_range":
        return _sets_from(balanced_range.generate(num_rows, sets=sets, seed=seed))
    if strategy == "cold_return":
        return _sets_from(
            cold_return.generate(num_rows, round_numbers, sets=sets, seed=seed)
        )
    if strategy == "golden_combo":
        return _sets_from(golden_combo.generate(num_rows, sets=sets, seed=seed))

    # STRATEGIES 에 이름을 추가하고 분기를 잊었을 때 조용히 빈 리스트를 주지 않는다.
    raise AssertionError(f"전략 분기가 누락되었습니다: {strategy}")


def hot_window_for(draws: Sequence[Draw]) -> Optional[int]:
    """`traits` 의 hot_count/cold_count 기준. 데이터가 없으면 기준도 없다."""
    return HOT_RECENT_ROUNDS if draws else None
