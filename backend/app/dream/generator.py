"""꿈 매칭 결과 → 로또 번호 조합 생성.

원본 `/api/lottonum` 의 TypeScript 로직을 Python/numpy 로 이식.
- gubun=1 만으로 세트1
- gubun=1 + 2 로 세트2
- gubun=1 + 2 + 3 으로 세트3
- 각 세트: 6개 미만이면 부족분을 채워 고유 조합 10개 생성

**부족분을 채우는 방법은 2026-08-27 에 바뀌었다.** 종전에는 `1~45 무작위`였고, 지금은
번호별 통계 점수에 비례해 뽑는다(`domain/number_scores.py`). 화면이 "모자란 번호는
통계로 채웠습니다" 라고 안내할 수 있어야 하기 때문이다
(docs/wiki/40-domain/dream-pipeline.md).

⚠ **꿈에서 나온 번호에는 가중치를 적용하지 않는다.** 통계로 채우는 것은 어디까지나
빈자리이고, 풀 안에서의 선택까지 통계가 흔들면 그 조합은 더 이상 "꿈에서 나온 번호"가
아니게 된다. 프론트는 `pool` 과 세트의 `numbers` 를 대조해 두 종류를 구분해 보여준다 —
그 구분이 성립하려면 풀 쪽 추출은 균등이어야 한다.
"""
from __future__ import annotations

from typing import Iterable, List, Optional

import numpy as np

from ..domain import number_scores


def _generate_combo(
    pool: list[int],
    rng: np.random.Generator,
    fill_scores: Optional[dict[int, float]] = None,
    exclude: Optional[set[int]] = None,
) -> list[int]:
    """풀에서 최대한 뽑고, 모자란 자리는 통계 점수에 비례해 채운다.

    `fill_scores` 가 `None` 이면 종전대로 균등 무작위로 채운다 — 회차가 50개 미만이거나
    점수를 만들지 못한 경우다. 그 판단은 `number_scores.weighted_pick` 안에서 끝나므로
    여기에 분기를 두지 않는다.
    """
    selected: set[int] = set()
    pool_copy = list(pool)
    rng.shuffle(pool_copy)

    for n in pool_copy:
        if 1 <= n <= 45 and n not in selected:
            selected.add(int(n))
        if len(selected) >= 6:
            break

    # 모자란 자리만 채운다. 한 번에 뽑는 이유: 하나씩 뽑아 set 에 넣으면 이미 뽑힌 번호가
    # 다시 나올 때마다 재시도가 되고, 가중이 셀수록 그 재시도가 늘어난다.
    # `replace=False` 로 한 번에 뽑으면 중복 자체가 생기지 않는다.
    shortage = 6 - len(selected)
    if shortage > 0:
        # 사용자가 뺀 번호는 채움에도 나오면 안 된다. 풀에서만 빼고 채움을 그대로 두면
        # "뺐는데 또 나온다" 가 되고, 그건 제외 스위치가 고장 난 것으로 읽힌다.
        blocked = selected | (exclude or set())
        selected.update(
            number_scores.weighted_pick(
                fill_scores, exclude=blocked, count=shortage, rng=rng
            )
        )

    return sorted(selected)


def generate_unique_combos(
    pool: Iterable[int],
    count: int,
    rng: np.random.Generator,
    max_attempts: int = 1000,
    fill_scores: Optional[dict[int, float]] = None,
    exclude: Optional[set[int]] = None,
) -> list[list[int]]:
    """서로 다른 조합을 `count` 개까지 모은다. 못 채우면 모인 만큼만 돌려준다.

    ⚠ `max_attempts` 를 두는 이유가 통계 채움 이후 더 중요해졌다. 가중 추출은 균등보다
    같은 번호를 자주 고르므로 중복 조합이 더 자주 나온다. 풀이 5개이고 빈자리가 하나뿐인
    경우처럼 만들 수 있는 조합 자체가 적을 때는 요청 개수를 못 채울 수 있는데, **억지로
    채우지 않는다** — 없는 것을 만들어 내느니 적게 주는 편이 정직하다
    (`domain/recommend.py` 의 몬테카를로도 같은 원칙이다).
    """
    pool_list = sorted({int(n) for n in pool if 1 <= int(n) <= 45})
    combos: list[list[int]] = []
    seen: set[tuple[int, ...]] = set()

    for _ in range(max_attempts):
        if len(combos) >= count:
            break
        combo = _generate_combo(pool_list, rng, fill_scores, exclude)
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
    fill_scores: Optional[dict[int, float]] = None,
    exclude: Optional[set[int]] = None,
) -> dict:
    """selected_items: [{'gubun': 1|2|3, 'lotto_number': [int,...]}]

    `fill_scores` 는 라우터가 준비해 넘긴다. 이 모듈이 직접 DB 를 읽지 않는 이유는
    나머지 예측·통계 코드와 같다 — 데이터 접근은 async 이고 여기는 동기다
    (`prediction/predictor.py` 의 같은 결정).
    """
    rng = np.random.default_rng(seed)
    blocked = {int(n) for n in (exclude or set()) if 1 <= int(n) <= 45}

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

    # 제외 번호는 **풀을 만든 뒤** 뺀다. 넣기 전에 거르면 응답의 `pool` 에도 남지 않아,
    # 프론트가 "꿈에서 온 번호" 를 표시할 때 사용자가 뺀 번호가 통째로 사라진 것처럼
    # 보인다. 뺀 사실이 보이는 편이 낫다 — 어느 쪽을 응답에 담을지는 아래 `_tier` 가 정한다.
    pool1 = set(tiers[1]) - blocked
    pool2 = (set(tiers[1]) | tiers[2]) - blocked
    pool3 = (set(tiers[1]) | tiers[2] | tiers[3]) - blocked

    def _tier(pool: set[int]) -> Optional[dict]:
        if not pool:
            return None
        combos = generate_unique_combos(
            pool, sets_per_tier, rng, fill_scores=fill_scores, exclude=blocked
        )
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
