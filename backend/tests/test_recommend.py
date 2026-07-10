"""번호 추천 — 재현성과 데이터 요구조건.

계약이 약속하는 두 가지를 지킨다.
  · 같은 seed 는 항상 같은 결과를 낸다.
  · 회차 50개 미만이면 통계 기반 전략은 422 인데, pure_random 만은 예외다.
"""
from __future__ import annotations

import pytest

from app.domain import recommend as rec
from app.prediction.config import MIN_REQUIRED_ROUNDS
from tests.conftest import make_draws

# 몬테카를로가 유효 조합을 찾으려면 분포가 있어야 한다. 실데이터는 1,231회차다.
ENOUGH = 200

# 기본 5만 회를 그대로 돌리면 테스트 한 번에 수십 초가 든다. 재현성·형식 검증에는
# 시뮬레이션 횟수가 중요하지 않다 — 같은 seed 로 같은 횟수를 돌리면 같은 답이 나온다.
FAST = 2_000


@pytest.mark.parametrize("strategy", rec.STRATEGIES)
def test_같은_seed_는_같은_결과를_낸다(strategy: str):
    draws = make_draws(ENOUGH)
    first = rec.generate(strategy, draws, sets=3, seed=1, simulations=FAST)
    second = rec.generate(strategy, draws, sets=3, seed=1, simulations=FAST)
    assert first == second


@pytest.mark.parametrize("strategy", rec.STRATEGIES)
def test_모든_조합은_오름차순_6개다(strategy: str):
    for combo in rec.generate(strategy, make_draws(ENOUGH), sets=3, seed=7, simulations=FAST):
        assert len(combo) == 6
        assert len(set(combo)) == 6
        assert combo == sorted(combo)
        assert all(1 <= n <= 45 for n in combo)


def test_다른_seed_는_다른_결과를_낼_수_있다():
    """재현성이 '항상 같은 답' 을 뜻하지 않는다는 것을 확인한다."""
    draws = make_draws(ENOUGH)
    assert rec.generate("pure_random", draws, sets=5, seed=1) != rec.generate(
        "pure_random", draws, sets=5, seed=2
    )


@pytest.mark.parametrize(
    "strategy",
    [s for s in rec.STRATEGIES if s not in rec.DATA_FREE_STRATEGIES],
)
def test_회차가_모자라면_통계_전략은_거부한다(strategy: str):
    with pytest.raises(rec.InsufficientDataError):
        rec.generate(strategy, make_draws(MIN_REQUIRED_ROUNDS - 1), sets=1, seed=1, simulations=FAST)


def test_pure_random_은_데이터가_없어도_동작한다():
    """통제군은 과거 회차를 읽지 않는다. 데이터가 없다는 이유로 막을 근거가 없다."""
    combos = rec.generate("pure_random", [], sets=5, seed=1)
    assert len(combos) == 5


def test_알_수_없는_전략은_거부한다():
    with pytest.raises(ValueError):
        rec.generate("존재하지_않는_전략", make_draws(ENOUGH), sets=1)


def test_앙상블은_요청한_만큼_또는_그_이하로_준다():
    """몬테카를로가 유효 조합을 못 채우면 적게 준다. 없는 것을 만들어 내지 않는다."""
    combos = rec.generate("ensemble", make_draws(ENOUGH), sets=5, seed=1, simulations=FAST)
    assert 0 < len(combos) <= 5
