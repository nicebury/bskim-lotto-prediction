"""황금 조합 — 역대 '모범' 조합만 추출해 그 분포로 번호 생성.

모범 조건: 합계 120~150 · 홀짝 3:3 · 고저 3:3 · 끝자리 5종 이상 · 연속 1쌍 이상.
"""
from __future__ import annotations

from typing import List, Optional, Sequence

import numpy as np

NUMS = np.arange(1, 46)


def _is_golden(s: list[int]) -> bool:
    total = sum(s)
    odds = sum(1 for n in s if n % 2 == 1)
    highs = sum(1 for n in s if n >= 23)
    tails = len({n % 10 for n in s})
    has_consec = any(s[i + 1] - s[i] == 1 for i in range(5))
    return (
        120 <= total <= 150
        and odds == 3
        and highs == 3
        and tails >= 5
        and has_consec
    )


def generate(
    num_rows: Sequence[tuple], *, sets: int, seed: Optional[int] = None
) -> dict:
    rng = np.random.default_rng(seed)

    golden: list[list[int]] = []
    for row in num_rows:
        s = sorted(row)
        if _is_golden(s):
            golden.append(s)

    if golden:
        counts = np.zeros(46, dtype=float)
        for g in golden:
            for n in g:
                counts[n] += 1
        weights = counts[1:46]
    else:
        # 황금 조합이 없으면 전체 빈도로 폴백
        counts = np.zeros(46, dtype=float)
        for row in num_rows:
            for n in row:
                counts[n] += 1
        weights = counts[1:46]

    if weights.sum() == 0:
        weights = np.ones(45)
    probs = weights / weights.sum()

    results: List[dict] = []
    for _ in range(sets):
        picks: list[int] = []
        # 최대 400회 시도해서 _is_golden 만족하는 조합 찾기
        for _ in range(400):
            cand = sorted(rng.choice(NUMS, size=6, replace=False, p=probs).tolist())
            if _is_golden(cand):
                picks = cand
                break
        if not picks:
            picks = sorted(rng.choice(NUMS, size=6, replace=False, p=probs).tolist())
        results.append({
            "numbers": [int(n) for n in picks],
            "source": "golden_combo",
        })

    return {
        "sets": results,
        "meta": {
            "golden_count": len(golden),
            "total_rounds": len(num_rows),
            "golden_ratio": round(len(golden) / max(1, len(num_rows)), 4),
            "description": "합계 120~150 · 홀짝 3:3 · 고저 3:3 · 끝자리 5종 · 연속 1쌍을 모두 만족하는 역대 조합 기반",
        },
    }
