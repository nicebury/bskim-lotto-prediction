"""구간 균형 — 1-15/16-30/31-45 세 구간에서 각 2개씩, 구간 내 빈도 가중."""
from __future__ import annotations

from typing import List, Optional, Sequence

import numpy as np

BUCKETS = [
    list(range(1, 16)),
    list(range(16, 31)),
    list(range(31, 46)),
]


def generate(
    num_rows: Sequence[tuple], *, sets: int, seed: Optional[int] = None
) -> dict:
    rng = np.random.default_rng(seed)
    counts = np.zeros(46, dtype=float)
    for row in num_rows:
        for n in row:
            counts[n] += 1

    def weighted_pick(bucket: list[int], k: int) -> list[int]:
        w = counts[bucket]
        if w.sum() == 0:
            w = np.ones_like(w)
        p = w / w.sum()
        return rng.choice(bucket, size=k, replace=False, p=p).tolist()

    # 구간별 빈도 비율 (메타로 노출)
    ratios = [float(counts[b].sum() / counts[1:].sum()) for b in BUCKETS]

    results: List[dict] = []
    for _ in range(sets):
        picks = sorted(
            weighted_pick(BUCKETS[0], 2)
            + weighted_pick(BUCKETS[1], 2)
            + weighted_pick(BUCKETS[2], 2)
        )
        results.append({
            "numbers": [int(n) for n in picks],
            "source": "balanced_range",
        })

    return {
        "sets": results,
        "meta": {
            "bucket_ratios": {
                "1-15": round(ratios[0], 3),
                "16-30": round(ratios[1], 3),
                "31-45": round(ratios[2], 3),
            },
            "description": "1~15 / 16~30 / 31~45 세 구간에서 각 2개씩 균형 배분",
        },
    }
