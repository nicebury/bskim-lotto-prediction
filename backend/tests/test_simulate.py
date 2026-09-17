"""AI 번호추천 시뮬레이터 (`POST /api/lotto/simulate`).

계약: `docs/wiki/10-contracts/api-contract.md` 의 'AI 번호추천 시뮬레이터' 절

계약이 별표로 강조한 것이 셋이다.

1. **단계 수치는 실제 값이어야 한다** — 지어내면 정보형 대시보드가 아니라 연출이 된다
2. **금지 필드명이 여기에도 적용된다** — 앙상블은 순위만, `score` 를 담지 않는다
3. **`recommend?strategy=ensemble` 과 같은 번호를 만든다** — 두 화면이 다르면 안 된다

`trials` 는 테스트에서 최소값(10,000)을 쓴다. 100,000 은 5초쯤 걸려 전체 스위트를
느리게 만들고, 여기서 검증할 것은 **응답의 모양과 규약**이지 속도가 아니다.
"""
from __future__ import annotations

import httpx
import pytest
from httpx import ASGITransport

from app.db import close_pool, open_pool
from app.domain import simulate as sim
from app.domain import stats as stats_mod
from app.main import app

from .conftest import make_draws

FAST = 10_000


# ── 단계 수치가 실제 값인가 ───────────────────────────────────────────────


def test_빈도_단계는_정규화_점수가_아니라_실제_횟수다():
    """★ 화면이 "34번이 187회" 라고 말한다. 사용자가 검증할 수 있는 것은 횟수뿐이다.

    예측 모듈의 `frequency.analyze()` 는 0~1 로 정규화된 값을 주므로, 그것을 그대로
    실으면 "34번이 0.87회" 가 된다.
    """
    draws = make_draws(200)
    st = sim._stage_frequency(draws)

    assert st["rounds_analyzed"] == 200
    assert st["include_bonus"] is True
    # 실제 집계와 같아야 한다
    counts = stats_mod.frequency(draws, include_bonus=True)
    for row in st["most"] + st["least"]:
        assert row["count"] == counts[str(row["number"])]
        assert isinstance(row["count"], int)
    # 최다는 내림차순, 최소는 오름차순
    assert [r["count"] for r in st["most"]] == sorted(
        [r["count"] for r in st["most"]], reverse=True
    )
    assert [r["count"] for r in st["least"]] == sorted(
        [r["count"] for r in st["least"]]
    )


def test_주기_단계는_stats_와_같은_함수다():
    """`/stats/hot-cold` 의 `overdue` 와 같은 번호에 다른 값을 보이면 안 된다."""
    draws = make_draws(200)
    st = sim._stage_cycle(draws)
    truth = stats_mod._rounds_since(draws)

    for row in st["longest_waiting"]:
        assert row["rounds_since"] == truth[row["number"]]
    # 오래 기다린 순
    gaps = [r["rounds_since"] for r in st["longest_waiting"]]
    assert gaps == sorted(gaps, reverse=True)


def test_추세_단계의_횟수가_실제_최근_출현과_같다():
    draws = make_draws(200)
    st = sim._stage_trend(draws, 20)

    assert st["window"] == 20
    # 지어낸 값이 아니라 분석기의 실제 가중 규칙(1.0 / 0.5)에서 온 수다
    assert st["recency_weight"] == 2.0

    recent = draws[-20:]
    for row in st["rising"]:
        actual = sum(1 for d in recent if row["number"] in d.numbers)
        assert row["count"] == actual


def test_패턴_단계의_합계_구간_비율이_실제와_같다():
    """`sum_range.rate` 는 공개 통계에 없는 값이라 여기서 센다 — 검산한다."""
    draws = make_draws(300)
    st = sim._stage_pattern(draws)

    lo, hi = st["sum_range"]["from"], st["sum_range"]["to"]
    inside = sum(1 for d in draws if lo <= sum(d.numbers) <= hi)
    assert st["sum_range"]["rate"] == round(inside / len(draws), 4)

    # 나머지는 `/stats/pattern` 과 같은 값
    pat = stats_mod.pattern(draws)
    assert st["consecutive_rate"] == pat["consecutive_ratio"]
    assert st["tail_variety_avg"] == pat["tail_variety_avg"]
    assert st["odd_even_3_3_rate"] == pat["odd_even"].get("3:3", 0.0)


def test_몬테카를로_수치가_서로_맞는다():
    """유효 + 걸러냄 = 전체. 안 맞으면 어느 하나가 지어낸 값이다."""
    result = sim.simulate(make_draws(200), sets=2, trials=FAST, seed=1)
    mc = result["stages"]["montecarlo"]

    assert mc["trials"] == FAST
    assert mc["valid_combinations"] + mc["filtered_out"] == mc["trials"]
    assert mc["valid_combinations"] >= 0 and mc["filtered_out"] >= 0


# ── 금지 필드명 ───────────────────────────────────────────────────────────


def test_앙상블_단계는_점수를_담지_않는다():
    """★ 순위는 사실이고 점수는 주장이다.

    시안의 "최종 점수를 매깁니다" 라는 **설명 문구**와, 그 점수를 **응답 필드로
    노출하는 것**은 다르다.
    """
    result = sim.simulate(make_draws(200), sets=1, trials=FAST, seed=1)
    ens = result["stages"]["ensemble"]

    assert set(ens) == {"top_numbers"}
    assert all(isinstance(n, int) for n in ens["top_numbers"])
    assert len(ens["top_numbers"]) == 10
    assert len(set(ens["top_numbers"])) == 10  # 중복 없음


def test_응답_어디에도_금지_필드가_없다():
    import json

    body = json.dumps(sim.simulate(make_draws(200), sets=2, trials=FAST, seed=1))
    for banned in (
        "score", "weight", "probability", "confidence",
        "accuracy", "hit_rate", "expected_value", "success_rate",
    ):
        assert f'"{banned}"' not in body, banned


# ── recommend 와 같은 번호 ───────────────────────────────────────────────


def test_recommend_와_같은_번호를_만든다():
    """★ 계약의 핵심. 두 화면이 같은 seed 에 다른 번호를 내면 사용자는 어느 쪽도 믿지 않는다.

    `recommend` 의 기본 시뮬레이션 횟수(5만)와 맞춰야 비교가 성립한다 — `trials` 가
    다르면 몬테카를로 결과가 달라지는 것이 **정상**이다.
    """
    from app.domain import recommend as rec
    from app.prediction.config import MONTE_CARLO_SIMULATIONS

    draws = make_draws(300)
    expected = rec.generate("ensemble", draws, sets=3, seed=7)
    got = sim.simulate(draws, sets=3, trials=MONTE_CARLO_SIMULATIONS, seed=7)

    assert [s["numbers"] for s in got["sets"]] == expected


def test_같은_seed_는_재현된다():
    draws = make_draws(200)
    a = sim.simulate(draws, sets=2, trials=FAST, seed=42)
    b = sim.simulate(draws, sets=2, trials=FAST, seed=42)
    assert a == b


def test_seed_없이도_stages_의_넷은_회차에만_의존한다():
    """계약: "`stages` 의 나머지 넷은 회차 데이터에만 의존하므로 seed 와 무관하게 같다"."""
    draws = make_draws(200)
    a = sim.simulate(draws, sets=1, trials=FAST, seed=1)["stages"]
    b = sim.simulate(draws, sets=1, trials=FAST, seed=999)["stages"]

    for key in ("frequency", "cycle", "trend", "pattern"):
        assert a[key] == b[key], key


def test_traits_가_recommend_와_같은_모양이다():
    """계약: "traits 는 recommend 와 동일"."""
    result = sim.simulate(make_draws(200), sets=1, trials=FAST, seed=1)
    traits = result["sets"][0]["traits"]

    assert set(traits) == {
        "odd_even", "high_low", "sum", "range_distribution",
        "has_consecutive", "tail_variety", "hot_count", "cold_count",
    }


def test_면책이_반드시_있다():
    result = sim.simulate(make_draws(200), sets=1, trials=FAST, seed=1)
    assert "보장" in result["disclaimer"]


# ── 데이터가 모자랄 때 ────────────────────────────────────────────────────


def test_회차가_모자라면_recommend_와_같은_예외다():
    """두 엔드포인트의 실패 모양이 같아야 한다 — 라우터가 같은 422 로 옮긴다."""
    from app.domain.recommend import InsufficientDataError

    with pytest.raises(InsufficientDataError):
        sim.simulate(make_draws(49), sets=1, trials=FAST, seed=1)


# ── 통합 ─────────────────────────────────────────────────────────────────


@pytest.fixture
async def client(require_lotto_draw: None):
    await open_pool()
    try:
        async with httpx.AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test", timeout=120.0
        ) as c:
            yield c
    finally:
        await close_pool()


@pytest.mark.integration
async def test_실데이터로_계약_모양을_지킨다(client):
    r = await client.post(
        "/api/lotto/simulate", json={"sets": 2, "trials": FAST, "seed": 1}
    )
    assert r.status_code == 200
    b = r.json()

    assert set(b) == {"sets", "trials", "seed", "hot_window", "stages", "disclaimer"}
    assert len(b["sets"]) == 2
    assert set(b["stages"]) == {
        "frequency", "cycle", "trend", "pattern", "ensemble", "montecarlo"
    }
    # `sum_range` 의 `from` 은 파이썬 예약어라 alias 를 쓴다 — JSON 에는 `from` 으로 나가야 한다
    assert "from" in b["stages"]["pattern"]["sum_range"]
    assert "from_" not in b["stages"]["pattern"]["sum_range"]


@pytest.mark.integration
@pytest.mark.parametrize(
    "payload",
    [
        {"sets": 1, "trials": 12345},   # 계약이 허용하지 않는 trials
        {"sets": 0, "trials": 10000},   # sets 하한 밖
        {"sets": 11, "trials": 10000},  # sets 상한 밖
    ],
)
async def test_계약_밖_입력은_422(client, payload: dict):
    assert (await client.post("/api/lotto/simulate", json=payload)).status_code == 422


@pytest.mark.integration
async def test_허용된_trials_셋은_전부_받는다(client):
    """계약이 셋으로 고정했다. 하나라도 막히면 화면의 단계 선택이 깨진다."""
    for trials in sim.ALLOWED_TRIALS:
        # 가장 큰 값도 받아야 하지만 전체 스위트를 느리게 만들지 않도록 sets=1 로 부른다
        r = await client.post(
            "/api/lotto/simulate", json={"sets": 1, "trials": trials, "seed": 1}
        )
        assert r.status_code == 200, trials
        assert r.json()["trials"] == trials
