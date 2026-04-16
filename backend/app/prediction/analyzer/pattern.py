"""패턴 분석 — 홀짝/고저/연속/끝자리/합산 분포 집계 + 번호별 보정 점수.

analyze()       : 역대 조합의 분포 기준표를 반환 (몬테카를로 필터용).
per_number()    : 홀짝/고저/끝자리 분포에서 유리한 번호에 보정 점수 부여.
"""
from __future__ import annotations

from collections import Counter
from typing import Dict, Sequence

import numpy as np


def analyze(num_rows: Sequence[tuple]) -> dict:
    odd_even = Counter()
    high_low = Counter()
    consecutive_cnt = 0
    sums = []
    tail_counts = Counter()   # 끝자리 0~9 등장 총합
    tail_diversity = []

    for row in num_rows:
        s = sorted(row)
        odds = sum(1 for x in s if x % 2 == 1)
        evens = 6 - odds
        odd_even[f"{odds}:{evens}"] += 1

        highs = sum(1 for x in s if x >= 23)  # 1~22 저, 23~45 고
        lows = 6 - highs
        high_low[f"{highs}:{lows}"] += 1

        if any(s[i + 1] - s[i] == 1 for i in range(5)):
            consecutive_cnt += 1

        sums.append(sum(s))

        tails = {x % 10 for x in s}
        tail_diversity.append(len(tails))
        for t in tails:
            tail_counts[t] += 1

    total = len(num_rows)
    sums_arr = np.array(sums, dtype=float)

    return {
        "odd_even_dist": {k: v / total for k, v in odd_even.most_common()},
        "high_low_dist": {k: v / total for k, v in high_low.most_common()},
        "consecutive_ratio": consecutive_cnt / total,
        "sum_range": {
            "min": int(np.percentile(sums_arr, 10)),
            "max": int(np.percentile(sums_arr, 90)),
            "peak": int(np.median(sums_arr)),
        },
        "tail_diversity_avg": float(np.mean(tail_diversity)),
        "tail_counts": dict(tail_counts),
    }


def per_number(pattern: dict) -> Dict[int, float]:
    """패턴 기준을 번호별 보정 점수(0.0~1.0)로 변환."""
    # 끝자리 분포 기반 점수 — 흔한 끝자리일수록 가산.
    tail_counts = pattern.get("tail_counts", {})
    if tail_counts:
        vals = np.array(list(tail_counts.values()), dtype=float)
        mx = vals.max()
        mn = vals.min()
    else:
        mx, mn = 1.0, 0.0

    scores: Dict[int, float] = {}
    for n in range(1, 46):
        t = n % 10
        tv = tail_counts.get(t, 0)
        if mx == mn:
            tail_score = 0.5
        else:
            tail_score = (tv - mn) / (mx - mn)

        # 고저 가산: 역대 다빈도 분포에 기여하는 번호에 살짝 가산
        top_hl = next(iter(pattern["high_low_dist"]), "3:3")
        highs_str, lows_str = top_hl.split(":")
        highs_need = int(highs_str)  # 선호되는 고번호 개수
        # 고저 선호에 따른 미세 가중: 고번호 선호면 23~45에 가산
        if highs_need >= 3 and n >= 23:
            hl_bonus = 0.1
        elif highs_need < 3 and n <= 22:
            hl_bonus = 0.1
        else:
            hl_bonus = 0.0

        raw = 0.5 * tail_score + 0.5  # 0.5~1.0
        raw = min(1.0, raw + hl_bonus)
        scores[n] = float(raw)
    return scores
