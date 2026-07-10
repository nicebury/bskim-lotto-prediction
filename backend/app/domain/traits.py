"""조합의 성향(traits) 계산.

이 모듈이 이 서비스의 정책을 코드로 표현한다. 여기서 나오는 값은 전부 **관찰된 사실**이다.
`odd_even: "3:3"` 은 여섯 숫자를 세면 누구나 검증할 수 있다. 반면 `probability: 0.13` 은
검증할 수 없는 주장이고, 그래서 이 코드베이스에 그런 필드가 없다
(docs/wiki/40-domain/forbidden-expressions.md).

고/저의 경계(23)는 예측 모듈이 쓰는 값과 같아야 한다. 두 곳이 다른 경계를 쓰면
같은 조합에 다른 성향이 나오고, 어느 쪽이 맞는지 아무도 모르게 된다.
"""
from __future__ import annotations

from typing import Iterable, Optional

# 고 = 23 이상. prediction/analyzer/pattern.py:28 과 같은 경계다.
HIGH_THRESHOLD = 23

# 볼 색상 구간(1~10, 11~20…)이 아니라 3분할 통계 구간이다. 색상은 프론트의 표현이고,
# 이쪽은 balanced_range 전략이 쓰는 구간이다.
RANGE_BUCKETS: tuple[tuple[str, int, int], ...] = (
    ("1-15", 1, 15),
    ("16-30", 16, 30),
    ("31-45", 31, 45),
)


def compute(numbers: Iterable[int]) -> dict:
    """여섯 개 번호만 보면 계산되는 여섯 가지 사실.

    `hot_count`/`cold_count` 는 여기 없다. 두 값은 "어느 시점의 최근 몇 회차 기준인가"
    라는 선택이 개입하므로, 기준을 함께 밝히는 곳에서만 붙인다
    (docs/wiki/10-contracts/api-contract.md).
    """
    nums = sorted(numbers)
    if len(nums) != 6:
        raise ValueError(f"조합은 6개여야 합니다. 받은 개수: {len(nums)}")

    odds = sum(1 for n in nums if n % 2 == 1)
    highs = sum(1 for n in nums if n >= HIGH_THRESHOLD)

    return {
        "odd_even": f"{odds}:{6 - odds}",
        "high_low": f"{highs}:{6 - highs}",
        "sum": sum(nums),
        "range_distribution": {
            label: sum(1 for n in nums if lo <= n <= hi)
            for label, lo, hi in RANGE_BUCKETS
        },
        # 오름차순이 보장되므로 인접한 두 개만 비교하면 된다.
        "has_consecutive": any(nums[i + 1] - nums[i] == 1 for i in range(5)),
        "tail_variety": len({n % 10 for n in nums}),
    }


def compute_with_hot_cold(
    numbers: Iterable[int],
    hot: Optional[set[int]],
    cold: Optional[set[int]],
) -> dict:
    """번호 추천 응답용. 여섯 필드에 `hot_count`·`cold_count` 를 더한다.

    `hot`/`cold` 가 None 이면 키를 남기고 값만 None 으로 둔다. 회차가 없어 HOT/COLD 를
    셀 수 없는 pure_random 이 그 경우다. 전략에 따라 응답 모양이 달라지면 프론트가
    전략별 분기를 갖게 되므로, 없는 값은 빼는 게 아니라 null 로 말한다.
    """
    nums = sorted(numbers)
    traits = compute(nums)
    traits["hot_count"] = None if hot is None else sum(1 for n in nums if n in hot)
    traits["cold_count"] = None if cold is None else sum(1 for n in nums if n in cold)
    return traits
