"""예측 파이프라인 오케스트레이터.

사용 예:
    from app.prediction import predictor
    result = predictor.predict(draws)      # draws: Sequence[Draw], round_no 오름차순

**동기 함수다.** numpy 로 5만 회를 돌리는 동안 이벤트 루프가 멈추면 안 되므로,
라우터가 `asyncio.to_thread` 로 감싼다. 이 분리를 유지한다
(docs/wiki/40-domain/prediction-algorithm.md).

과거에는 이 모듈이 `sqlite3` 로 DB 를 직접 열었다. 이제 데이터는 호출자가 넘긴다 —
백엔드의 저장소는 Postgres 이고, 그 접근은 async 라 여기서 부를 수 없다. 알고리즘은
한 줄도 바뀌지 않았다.
"""
from __future__ import annotations

from typing import Optional, Sequence

from ..domain.draw import Draw
from .analyzer import delay, frequency, hot_cold, pattern
from . import ensemble, montecarlo
from .config import (
    HOT_RECENT_ROUNDS,
    MIN_REQUIRED_ROUNDS,
    MONTE_CARLO_SIMULATIONS,
    RECOMMEND_SETS,
    WEIGHTS,
)


def _top_n(scores: dict, n: int) -> list[dict]:
    items = sorted(scores.items(), key=lambda x: x[1], reverse=True)[:n]
    return [{"number": k, "score": round(float(v), 4)} for k, v in items]


def predict(
    draws: Sequence[Draw],
    *,
    sets: int = RECOMMEND_SETS,
    simulations: int = MONTE_CARLO_SIMULATIONS,
    hot_rounds: int = HOT_RECENT_ROUNDS,
    weights: Optional[dict] = None,
    seed: Optional[int] = None,
) -> dict:
    weights = weights or WEIGHTS

    round_numbers = [d.round_no for d in draws]
    num_rows = [d.numbers for d in draws]
    bonuses = [d.bonus for d in draws]

    if len(num_rows) < MIN_REQUIRED_ROUNDS:
        raise ValueError(
            f"데이터가 부족합니다. 최소 {MIN_REQUIRED_ROUNDS}회차 필요, "
            f"현재 {len(num_rows)}회차."
        )

    freq_scores = frequency.analyze(num_rows, bonuses)
    delay_scores = delay.analyze(num_rows, round_numbers)
    hot_scores = hot_cold.analyze(num_rows, round_numbers, hot_rounds)

    pat = pattern.analyze(num_rows)
    pattern_scores = pattern.per_number(pat)

    final_scores = ensemble.score(
        freq_scores, delay_scores, hot_scores, pattern_scores, weights
    )

    mc = montecarlo.simulate(
        final_scores, pat,
        sets=sets, simulations=simulations, seed=seed,
    )

    return {
        "latest_round": max(round_numbers),
        "total_rounds": len(num_rows),
        "hot_rounds_analyzed": hot_rounds,
        "weights": weights,
        "frequency": {
            "top5": _top_n(freq_scores, 5),
        },
        "delay": {
            "top5": _top_n(delay_scores, 5),
        },
        "hot_cold": {
            "top5": _top_n(hot_scores, 5),
        },
        "pattern": {
            "odd_even_top": list(pat["odd_even_dist"].items())[:3],
            "high_low_top": list(pat["high_low_dist"].items())[:3],
            "consecutive_ratio": round(pat["consecutive_ratio"], 3),
            "sum_range": pat["sum_range"],
            "tail_diversity_avg": round(pat["tail_diversity_avg"], 2),
        },
        "ensemble": {
            "top10": _top_n(final_scores, 10),
        },
        "montecarlo": {
            "total_simulations": mc["total_simulations"],
            "valid_combos": mc["valid_combos_count"],
            "top10_candidates": mc["top10_candidates"],
        },
        "recommendations": mc["recommendations"],
    }
