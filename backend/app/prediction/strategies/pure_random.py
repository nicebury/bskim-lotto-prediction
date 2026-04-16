"""완전 랜덤 — 1~45 에서 무작위 6개. 비교 통제군."""
from __future__ import annotations

from typing import List, Optional

import numpy as np

NUMS = np.arange(1, 46)


def generate(*, sets: int, seed: Optional[int] = None) -> dict:
    rng = np.random.default_rng(seed)
    results: List[dict] = []
    for _ in range(sets):
        picks = sorted(rng.choice(NUMS, size=6, replace=False).tolist())
        results.append({
            "numbers": [int(n) for n in picks],
            "source": "pure_random",
        })
    return {
        "sets": results,
        "meta": {
            "description": "아무 분석 없이 1~45에서 무작위 6개. 실제 확률상 다른 모든 전략과 동일.",
        },
    }
