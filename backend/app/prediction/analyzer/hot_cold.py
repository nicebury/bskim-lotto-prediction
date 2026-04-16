"""핫/콜드 넘버 분석 — 최근 N회차의 가중 빈도로 트렌드 반영.

가중치: weight = 1.0 - (order_from_newest / N) * 0.5
  (가장 최근 = 1.0, 가장 오래된 = 0.5)
"""
from __future__ import annotations

from typing import Dict, Sequence

import numpy as np


def analyze(
    num_rows: Sequence[tuple],
    round_numbers: Sequence[int],
    hot_rounds: int = 20,
) -> Dict[int, float]:
    # round_numbers는 오름차순 전제. 최근 N개는 리스트 뒤쪽.
    n = min(hot_rounds, len(num_rows))
    recent = num_rows[-n:]

    counts = np.zeros(46, dtype=float)
    for i, row in enumerate(recent):
        order_from_newest = (n - 1) - i  # 0 = 가장 최근
        weight = 1.0 - (order_from_newest / n) * 0.5
        for num in row:
            counts[num] += weight

    values = counts[1:46]
    mn, mx = float(values.min()), float(values.max())
    if mx == mn:
        normalized = np.full_like(values, 0.5)
    else:
        normalized = (values - mn) / (mx - mn)
    return {i + 1: float(normalized[i]) for i in range(45)}
