"""꿈 매칭 결과 → 로또 번호 조합 생성.

원본 `/api/lottonum` 의 TypeScript 로직을 Python/numpy 로 이식.
- gubun=1 만으로 세트1
- gubun=1 + 2 로 세트2
- gubun=1 + 2 + 3 으로 세트3
- 각 세트: 6개 미만이면 1~45 랜덤으로 채워 고유 조합 10개 생성
"""
from __future__ import annotations

from typing import Iterable, List, Optional

import numpy as np


def _generate_combo(pool: list[int], rng: np.random.Generator) -> list[int]:
    """풀에서 최대한 뽑고 모자라면 1~45 랜덤 채움."""
    selected: set[int] = set()
    pool_copy = list(pool)
    rng.shuffle(pool_copy)

    for n in pool_copy:
        if 1 <= n <= 45 and n not in selected:
            selected.add(int(n))
        if len(selected) >= 6:
            break

    # 모자라면 랜덤 채움
    while len(selected) < 6:
        n = int(rng.integers(1, 46))
        selected.add(n)

    return sorted(selected)


def generate_unique_combos(
    pool: Iterable[int],
    count: int,
    rng: np.random.Generator,
    max_attempts: int = 1000,
) -> list[list[int]]:
    pool_list = sorted({int(n) for n in pool if 1 <= int(n) <= 45})
    combos: list[list[int]] = []
    seen: set[tuple[int, ...]] = set()

    for _ in range(max_attempts):
        if len(combos) >= count:
            break
        combo = _generate_combo(pool_list, rng)
        key = tuple(combo)
        if key in seen:
            continue
        seen.add(key)
        combos.append(combo)
    return combos


def build_tier_sets(
    selected_items: list[dict],
    *,
    sets_per_tier: int = 10,
    seed: Optional[int] = None,
) -> dict:
    """selected_items: [{'gubun': 1|2|3, 'lotto_number': [int,...]}]"""
    rng = np.random.default_rng(seed)

    tiers: dict[int, set[int]] = {1: set(), 2: set(), 3: set()}
    for it in selected_items:
        g = int(it.get("gubun", 0))
        if g not in tiers:
            continue
        for n in it.get("lotto_number", []):
            try:
                x = int(n)
            except (TypeError, ValueError):
                continue
            if 1 <= x <= 45:
                tiers[g].add(x)

    pool1 = set(tiers[1])
    pool2 = pool1 | tiers[2]
    pool3 = pool2 | tiers[3]

    def _tier(pool: set[int]) -> Optional[dict]:
        if not pool:
            return None
        combos = generate_unique_combos(pool, sets_per_tier, rng)
        return {
            "pool_size": len(pool),
            "pool": sorted(pool),
            "combos": combos,
        }

    return {
        "tier1": _tier(pool1),  # 정확일치 전용
        "tier2": _tier(pool2),  # 일치 + 포함
        "tier3": _tier(pool3),  # 전체
    }
