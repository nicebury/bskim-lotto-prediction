"""전체 빈도 분석 — 각 번호의 역대 출현 횟수 기반 점수.

보너스 번호는 0.3 가중치로 합산. min-max 정규화 후 0.0~1.0 점수 반환.
"""
from __future__ import annotations

from typing import Dict, Iterable

import numpy as np


def analyze(num_rows: Iterable[tuple], bonuses: Iterable[int]) -> Dict[int, float]:
    counts = np.zeros(46, dtype=float)  # index 1..45 사용
    for row in num_rows:
        for n in row:
            counts[n] += 1.0

    bonus_counts = np.zeros(46, dtype=float)
    for b in bonuses:
        bonus_counts[b] += 1.0

    combined = counts + bonus_counts * 0.3
    values = combined[1:46]
    return _normalize(values)


def _normalize(values: np.ndarray) -> Dict[int, float]:
    mn, mx = float(values.min()), float(values.max())
    if mx == mn:
        normalized = np.full_like(values, 0.5)
    else:
        normalized = (values - mn) / (mx - mn)
    return {i + 1: float(normalized[i]) for i in range(45)}
