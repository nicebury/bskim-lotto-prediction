"""AI 번호추천 시뮬레이터 — 앙상블이 번호에 이르는 **과정**을 단계별 수치로 준다.

계약: `docs/wiki/10-contracts/api-contract.md` 의 'AI 번호추천 시뮬레이터' 절

## 왜 `recommend` 에 얹지 않고 별도인가

`recommend` 는 여섯 전략이 공유하는 얇은 계약이다. 거기에 단계별 근거를 얹으면
`pure_random` 에도 "빈도 분석 결과" 가 붙는다 — **아무것도 분석하지 않는 전략에 분석
결과가 딸려 오는 응답은 거짓말이다.** 시뮬레이터는 앙상블 한 갈래의 과정을 드러내는
것이므로 자기 엔드포인트를 갖는다.

## ★ 단계 수치는 실제 값이어야 한다

화면이 "역대 1,239회를 분석했습니다 · 34번이 187회로 가장 많이 나왔습니다" 라고 말한다.
그 수치가 지어낸 것이면 **그 순간 이 서비스는 정보형 대시보드가 아니라 연출이 된다.**

그래서 각 단계를 `domain/stats.py` 와 `prediction/` 의 **실제 계산 결과**에서 뽑는다.
계산할 수 없는 단계는 `None` 이다 — 0 으로 채우지 않는다.

## ★ 점수를 응답에 담지 않는다

앙상블 단계는 번호별 **순위만** 준다(`top_numbers`). `predictor` 는 내부적으로 점수를
갖고 있지만 그것을 내보내지 않는다 — 시안의 "최종 점수를 매깁니다" 라는 **설명 문구**와
그 점수를 **응답 필드로 노출하는 것**은 다르다. 설명은 알고리즘이 무엇을 하는지 말하는
것이고, 필드는 사용자가 그 값을 근거로 삼게 만든다
(docs/wiki/40-domain/forbidden-expressions.md).

**전부 동기 함수다.** 몬테카를로가 CPU 를 오래 쥐므로 라우터가 `asyncio.to_thread` 로
감싸고, `concurrency.heavy_slot` 으로 줄을 세운다.
"""
from __future__ import annotations

from typing import Optional, Sequence

from ..prediction import predictor
from ..prediction.config import HOT_RECENT_ROUNDS, MIN_REQUIRED_ROUNDS
from . import stats as stats_mod
from . import traits as traits_mod
from .draw import Draw
from .recommend import DISCLAIMER, InsufficientDataError

# 계약이 셋으로 고정했다. **자유 정수로 받지 않는다** — 화면이 세 단계만 제공하고,
# 열린 값을 받으면 누군가 1,000만을 넣어 서버를 오래 붙잡는다. 몬테카를로를 한 번에
# 하나만 돌리기로 한 것과 같은 이유다 (0012-serialize-monte-carlo).
ALLOWED_TRIALS = (10_000, 50_000, 100_000)
DEFAULT_TRIALS = 100_000

# 각 단계에서 보여줄 번호 개수. 화면이 한 줄에 담을 만큼만 준다.
TOP_N = 5
ENSEMBLE_TOP_N = 10

# `trend` 단계가 응답에 싣는 값. `hot_cold` 분석기는 최근 회차에 1.0, 가장 오래된
# 회차에 0.5 의 가중치를 준다(`analyzer/hot_cold.py`) — 그 비가 2.0 이다.
# ⚠ 지어낸 값이 아니라 **실제 가중 규칙에서 온 수**다. 분석기를 고치면 여기도 고친다.
RECENCY_WEIGHT = 2.0


def _stage_frequency(draws: Sequence[Draw]) -> dict:
    """1단계 — 역대 출현 횟수.

    ⚠ **정규화 점수가 아니라 실제 횟수**다. 예측 모듈의 `frequency.analyze()` 는 0~1 로
    정규화된 값을 주는데, 화면은 "34번이 187회" 라고 말한다. 사용자가 검증할 수 있는
    것은 횟수뿐이므로 `stats.frequency()` 의 실제 집계를 쓴다.

    `include_bonus=True` 인 이유: 계약의 응답 예시가 그렇고, 이 단계는 "이 번호가 얼마나
    자주 등장했나" 를 보여주는 것이라 보너스도 등장이다. 공개 통계 화면
    (`/stats/frequency`)의 기본값(false)과 다른 것은 **용도가 다르기 때문**이고,
    응답에 `include_bonus` 를 함께 실어 화면이 그 사실을 밝힐 수 있게 한다.
    """
    counts = stats_mod.frequency(draws, include_bonus=True)
    ranked = sorted(
        ({"number": int(n), "count": c} for n, c in counts.items()),
        # 많이 나온 순. 동점이면 번호 오름차순 — 정렬이 불안정하면 같은 요청에
        # 다른 목록이 나와 "왜 바뀌었지" 가 된다.
        key=lambda x: (-x["count"], x["number"]),
    )
    return {
        "rounds_analyzed": len(draws),
        "include_bonus": True,
        "most": ranked[:TOP_N],
        # 적게 나온 순. 뒤에서 자르고 뒤집으면 동점 정렬이 뒤집히므로 다시 정렬한다.
        "least": sorted(ranked[-TOP_N:], key=lambda x: (x["count"], x["number"])),
    }


def _stage_cycle(draws: Sequence[Draw]) -> dict:
    """2단계 — 가장 오래 안 나온 번호.

    `stats.hot_cold` 의 `overdue` 와 **같은 함수**를 쓴다. 두 화면이 같은 번호에 다른
    '몇 회차째' 를 보이면 사용자는 어느 쪽도 믿지 않는다.
    """
    rounds_since = stats_mod._rounds_since(draws)
    ranked = sorted(
        ({"number": n, "rounds_since": v} for n, v in rounds_since.items()),
        key=lambda x: (-x["rounds_since"], x["number"]),
    )
    return {"longest_waiting": ranked[:TOP_N]}


def _stage_trend(draws: Sequence[Draw], window: int) -> dict:
    """3단계 — 최근 흐름.

    최근 `window` 회차의 출현 **횟수**를 준다. `hot_cold` 분석기의 가중 점수가 아니라
    횟수인 이유는 1단계와 같다 — 사용자가 검증할 수 있어야 한다.
    """
    recent = draws[-window:]
    counts: dict[int, int] = {n: 0 for n in range(1, 46)}
    for d in recent:
        for n in d.numbers:
            counts[n] += 1
    ranked = sorted(
        ({"number": n, "count": c} for n, c in counts.items()),
        key=lambda x: (-x["count"], x["number"]),
    )
    return {
        "window": len(recent),
        "recency_weight": RECENCY_WEIGHT,
        "rising": ranked[:TOP_N],
    }


def _stage_pattern(draws: Sequence[Draw]) -> dict:
    """4단계 — 조합의 모양.

    `stats.pattern()` 과 같은 집계를 쓴다. `sum_range.rate` 만 여기서 더 센다 —
    "그 구간에 실제로 몇 %가 들었나" 는 공개 통계에 없는 값이다.
    """
    pat = stats_mod.pattern(draws)
    lo, hi = pat["sum_range"]["min"], pat["sum_range"]["max"]
    inside = sum(1 for d in draws if lo <= sum(d.numbers) <= hi)
    return {
        # 역대에서 홀짝이 3:3 이던 회차의 비율. 없으면 0.0 이 아니라 **없는 것**이지만,
        # `pattern()` 이 분포 맵을 주므로 키가 없으면 그 조합이 한 번도 없었다는 뜻이다.
        "odd_even_3_3_rate": pat["odd_even"].get("3:3", 0.0),
        "sum_range": {
            "from": lo,
            "to": hi,
            "rate": round(inside / len(draws), 4),
        },
        "consecutive_rate": pat["consecutive_ratio"],
        "tail_variety_avg": pat["tail_variety_avg"],
    }


def simulate(
    draws: Sequence[Draw],
    *,
    sets: int,
    trials: int = DEFAULT_TRIALS,
    seed: Optional[int] = None,
) -> dict:
    """앙상블 추천 + 단계별 근거.

    `recommend?strategy=ensemble` 과 **같은 경로**를 탄다(`predictor.predict`). 같은
    `seed`·같은 `trials` 면 같은 번호가 나온다 — 두 화면이 다른 답을 내면 안 된다.
    """
    if len(draws) < MIN_REQUIRED_ROUNDS:
        # 통계 기반이라 회차가 모자라면 계산할 수 없다. `recommend` 와 같은 예외를
        # 던져 라우터가 같은 422 로 옮긴다 — 두 엔드포인트의 실패 모양이 같아야 한다.
        raise InsufficientDataError(
            f"데이터가 부족합니다. 최소 {MIN_REQUIRED_ROUNDS}회차 필요, "
            f"현재 {len(draws)}회차."
        )

    result = predictor.predict(draws, sets=sets, seed=seed, simulations=trials)

    mc = result["montecarlo"]
    valid = mc["valid_combos"]

    # `traits` 는 `recommend` 와 **같은 함수**로 만든다. 계약이 "recommend 와 동일" 이라
    # 적었고, 두 화면이 같은 조합에 다른 성향을 보이면 안 된다.
    # hot/cold 기준도 `/stats/hot-cold?window=20` 과 같은 함수에서 나온다.
    hot, cold = stats_mod.hot_cold_sets(draws, HOT_RECENT_ROUNDS)

    return {
        "sets": [
            {
                "numbers": r["numbers"],
                "traits": traits_mod.compute_with_hot_cold(r["numbers"], hot, cold),
            }
            for r in result["recommendations"]
        ],
        "trials": trials,
        "seed": seed,
        "hot_window": HOT_RECENT_ROUNDS,
        "stages": {
            "frequency": _stage_frequency(draws),
            "cycle": _stage_cycle(draws),
            "trend": _stage_trend(draws, HOT_RECENT_ROUNDS),
            "pattern": _stage_pattern(draws),
            # ★ **번호만.** `predictor` 는 점수를 갖고 있지만 내보내지 않는다.
            # 순위는 사실이고 점수는 주장이다.
            "ensemble": {
                "top_numbers": [x["number"] for x in result["ensemble"]["top10"]][
                    :ENSEMBLE_TOP_N
                ]
            },
            "montecarlo": {
                "trials": mc["total_simulations"],
                # "패턴 필터를 통과한 조합 수" 라는 **사실**이다. 당첨 가능성을 뜻하지
                # 않는다는 것은 프론트가 문구로 밝힌다.
                "valid_combinations": valid,
                "filtered_out": mc["total_simulations"] - valid,
            },
        },
        "disclaimer": DISCLAIMER,
    }
