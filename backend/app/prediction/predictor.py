"""예측 파이프라인 오케스트레이터.

사용 예:
    from app.prediction import predictor
    result = predictor.predict(db_path="data/lotto.db")
"""
from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Optional

from .analyzer import delay, frequency, hot_cold, pattern
from . import ensemble, montecarlo
from .config import (
    HOT_RECENT_ROUNDS,
    MIN_REQUIRED_ROUNDS,
    MONTE_CARLO_SIMULATIONS,
    RECOMMEND_SETS,
    WEIGHTS,
)


def _load_data(db_path: Path):
    conn = sqlite3.connect(str(db_path))
    try:
        rows = conn.execute(
            """
            SELECT round_no, num1, num2, num3, num4, num5, num6, bonus
              FROM lotto_results
             ORDER BY round_no ASC
            """
        ).fetchall()
    finally:
        conn.close()
    round_numbers = [r[0] for r in rows]
    num_rows = [tuple(r[1:7]) for r in rows]
    bonuses = [r[7] for r in rows]
    return round_numbers, num_rows, bonuses


def _top_n(scores: dict, n: int) -> list[dict]:
    items = sorted(scores.items(), key=lambda x: x[1], reverse=True)[:n]
    return [{"number": k, "score": round(float(v), 4)} for k, v in items]


def predict(
    db_path: str | Path,
    *,
    sets: int = RECOMMEND_SETS,
    simulations: int = MONTE_CARLO_SIMULATIONS,
    hot_rounds: int = HOT_RECENT_ROUNDS,
    weights: Optional[dict] = None,
    seed: Optional[int] = None,
) -> dict:
    weights = weights or WEIGHTS
    db_path = Path(db_path)
    if not db_path.exists():
        raise FileNotFoundError(f"DB 파일이 없습니다: {db_path}")

    round_numbers, num_rows, bonuses = _load_data(db_path)
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
