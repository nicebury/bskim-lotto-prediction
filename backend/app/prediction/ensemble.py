"""앙상블 스코어링 — 4개 모듈의 점수를 가중 합산."""
from __future__ import annotations

from typing import Dict


def score(
    frequency: Dict[int, float],
    delay: Dict[int, float],
    hot_cold: Dict[int, float],
    pattern_bonus: Dict[int, float],
    weights: Dict[str, float],
) -> Dict[int, float]:
    result: Dict[int, float] = {}
    for n in range(1, 46):
        result[n] = (
            frequency[n] * weights["frequency"]
            + delay[n] * weights["delay"]
            + hot_cold[n] * weights["hot_cold"]
            + pattern_bonus[n] * weights["pattern"]
        )
    return result
