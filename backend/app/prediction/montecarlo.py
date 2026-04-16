"""몬테카를로 시뮬레이션 — 확률 가중 추출 + 패턴 필터로 유효 조합 도출."""
from __future__ import annotations

from collections import Counter
from typing import Dict, List, Optional

import numpy as np

NUMS = np.arange(1, 46)


def simulate(
    ensemble_scores: Dict[int, float],
    pattern: dict,
    *,
    sets: int,
    simulations: int,
    seed: Optional[int] = None,
) -> dict:
    rng = np.random.default_rng(seed)

    scores = np.array(
        [ensemble_scores[n] for n in NUMS], dtype=float
    )
    # 음수/0 방지
    scores = np.clip(scores, 1e-6, None)
    probs = scores / scores.sum()

    # 패턴 필터 파라미터
    oe_dist = pattern["odd_even_dist"]
    hl_dist = pattern["high_low_dist"]
    sum_min = pattern["sum_range"]["min"]
    sum_max = pattern["sum_range"]["max"]
    tail_avg = pattern["tail_diversity_avg"]
    oe_thresh = max(0.05, min(oe_dist.values()) if oe_dist else 0.05)
    hl_thresh = max(0.05, min(hl_dist.values()) if hl_dist else 0.05)

    valid_combos: list[tuple] = []
    number_counts: Counter = Counter()

    for _ in range(simulations):
        pick = rng.choice(NUMS, size=6, replace=False, p=probs)
        s = np.sort(pick)
        odds = int(np.sum(s % 2 == 1))
        oe_key = f"{odds}:{6 - odds}"
        highs = int(np.sum(s >= 23))
        hl_key = f"{highs}:{6 - highs}"
        total = int(s.sum())
        tails = len(set((int(x) % 10) for x in s))

        if (
            oe_dist.get(oe_key, 0) >= oe_thresh
            and hl_dist.get(hl_key, 0) >= hl_thresh
            and sum_min <= total <= sum_max
            and tails >= tail_avg - 1
        ):
            combo = tuple(int(x) for x in s)
            valid_combos.append(combo)
            for n in combo:
                number_counts[n] += 1

    total_valid = len(valid_combos)
    top10 = [n for n, _ in number_counts.most_common(10)]

    # 추천 세트: 가장 자주 등장한 조합 순.
    combo_freq = Counter(valid_combos)
    recommendations: List[dict] = []
    used = set()

    def _avg_hits(combo: tuple) -> int:
        """6개 번호가 유효 조합 전체에서 평균적으로 등장한 횟수."""
        if not combo:
            return 0
        return int(sum(number_counts[n] for n in combo) / len(combo))

    for combo, cnt in combo_freq.most_common():
        if len(recommendations) >= sets:
            break
        if combo in used:
            continue
        used.add(combo)
        recommendations.append({
            "numbers": list(combo),
            "hit_count": cnt,
            "avg_number_hits": _avg_hits(combo),
            "source": "frequent_combo",
        })

    # 부족하면 top10 중에서 샘플링으로 보충
    attempts = 0
    while len(recommendations) < sets and attempts < 200 and len(top10) >= 6:
        attempts += 1
        pool = np.array(top10)
        pool_scores = np.array([ensemble_scores[int(n)] for n in pool], dtype=float)
        pool_p = pool_scores / pool_scores.sum()
        pick = sorted(rng.choice(pool, size=6, replace=False, p=pool_p).tolist())
        combo = tuple(int(x) for x in pick)
        if combo in used:
            continue
        used.add(combo)
        recommendations.append({
            "numbers": list(combo),
            "hit_count": combo_freq.get(combo, 0),
            "avg_number_hits": _avg_hits(combo),
            "source": "top10_sampling",
        })

    recommendations.sort(key=lambda r: r["avg_number_hits"], reverse=True)

    return {
        "recommendations": recommendations,
        "top10_candidates": top10,
        "valid_combos_count": total_valid,
        "total_simulations": simulations,
    }
