"""부활 번호 — 장기 미출현 후 최근 깜짝 등장한 번호 우선."""
from __future__ import annotations

from typing import List, Optional, Sequence

import numpy as np


def generate(
    num_rows: Sequence[tuple],
    round_numbers: Sequence[int],
    *,
    sets: int,
    seed: Optional[int] = None,
    min_gap: int = 30,
    recent_window: int = 5,
) -> dict:
    rng = np.random.default_rng(seed)
    latest = max(round_numbers)

    appearances: dict[int, list[int]] = {n: [] for n in range(1, 46)}
    for row, rn in zip(num_rows, round_numbers):
        for n in row:
            appearances[n].append(rn)

    candidates: list[tuple[int, int]] = []  # (number, gap_before_last)
    for n in range(1, 46):
        app = appearances[n]
        if len(app) < 2:
            continue
        last = app[-1]
        if latest - last > recent_window:
            continue
        gap = app[-1] - app[-2]
        if gap >= min_gap:
            candidates.append((n, gap))

    if len(candidates) < 6:
        # 폴백: 최근 출현 번호 중 직전 간격이 큰 순
        fallback = []
        for n in range(1, 46):
            app = appearances[n]
            if len(app) < 2 or latest - app[-1] > recent_window:
                continue
            fallback.append((n, app[-1] - app[-2]))
        fallback.sort(key=lambda x: x[1], reverse=True)
        candidates = fallback or [(n, 0) for n in range(1, 46)]

    pool = [c[0] for c in candidates]
    results: List[dict] = []
    for _ in range(sets):
        if len(pool) >= 6:
            picks = sorted(rng.choice(pool, size=6, replace=False).tolist())
        else:
            # pool이 작으면 전체에서 보충
            extra = [n for n in range(1, 46) if n not in pool]
            rng.shuffle(extra)
            combined = pool + extra[: 6 - len(pool)]
            picks = sorted(combined)
        results.append({
            "numbers": [int(n) for n in picks],
            "source": "cold_return",
        })

    return {
        "sets": results,
        "meta": {
            "candidates_count": len(pool),
            "sample_candidates": [
                {"number": int(n), "prev_gap": int(g)}
                for n, g in sorted(candidates, key=lambda x: x[1], reverse=True)[:8]
            ],
            "description": f"{min_gap}회차 이상 '잠수' 타다 최근 {recent_window}회차 내에 부활한 번호 중심",
        },
    }
