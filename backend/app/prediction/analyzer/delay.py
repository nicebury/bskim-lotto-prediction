"""지연 번호 분석 — 마지막 출현 이후 지난 회차 기반 점수.

오래 안 나온 번호일수록 높은 점수. 극단적 long-tail(상위 5%)은 0.85배 감쇠.
"""
from __future__ import annotations

from typing import Dict, Iterable, Sequence

import numpy as np


def analyze(
    num_rows: Sequence[tuple], round_numbers: Sequence[int]
) -> Dict[int, float]:
    assert len(num_rows) == len(round_numbers)
    latest = max(round_numbers)
    last_seen = {n: 0 for n in range(1, 46)}
    for row, rn in zip(num_rows, round_numbers):
        for n in row:
            if rn > last_seen[n]:
                last_seen[n] = rn

    delays = np.array(
        [latest - last_seen[i] for i in range(1, 46)], dtype=float
    )
    mn, mx = float(delays.min()), float(delays.max())
    if mx == mn:
        normalized = np.full_like(delays, 0.5)
    else:
        normalized = (delays - mn) / (mx - mn)

    # 상위 5% 감쇠
    threshold = float(np.percentile(delays, 95))
    for i in range(45):
        if delays[i] >= threshold:
            normalized[i] *= 0.85

    return {i + 1: float(normalized[i]) for i in range(45)}
