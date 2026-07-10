"""공개 통계 계산 — 빈도 · HOT/COLD · 패턴.

예측 모듈(`app/prediction/`)과 이 모듈은 목적이 다르다. 예측 모듈은 번호를 뽑기 위한
**정규화된 점수**를 만들고, 여기서는 사용자가 직접 세어 검증할 수 있는 **횟수와 비율**을
만든다. 그래서 보너스 번호에 `× 0.3` 같은 임의 가중을 쓰지 않고 `include_bonus` 로
명시적으로 선택하게 한다 (docs/wiki/10-contracts/api-contract.md).

`window` 를 20 으로 고정하지 않은 것이 기존 구현과의 유일한 실질적 차이다.
"""
from __future__ import annotations

from collections import Counter
from typing import Optional, Sequence

from ..prediction.analyzer import pattern as pattern_analyzer
from .draw import Draw

ALL_NUMBERS = range(1, 46)

# hot/cold/overdue 각 배열의 길이. 45개를 다 주면 "상위"라는 말이 무의미하고,
# 5개면 동점 구간이 잘려 사용자가 기준을 오해한다.
TOP_N = 10

# 허용되는 window 값. FastAPI 쿼리 검증과 이 모듈이 같은 목록을 봐야 한다.
WINDOW_CHOICES = ("20", "50", "100", "all")


def resolve_window(window: str) -> Optional[int]:
    """`"all"` 을 None 으로, 나머지는 정수로. None 은 '자르지 않음' 을 뜻한다."""
    return None if window == "all" else int(window)


def slice_window(draws: Sequence[Draw], window: Optional[int]) -> Sequence[Draw]:
    """최근 N회차를 잘라낸다. `draws` 는 round_no 오름차순 전제.

    요청한 window 보다 데이터가 적으면 있는 만큼만 돌려준다. 이때 응답의
    `rounds_analyzed` 가 `window` 와 달라지고, 프론트는 그 차이를 표시할 수 있다.
    """
    if window is None or window >= len(draws):
        return draws
    return draws[-window:]


def frequency(draws: Sequence[Draw], *, include_bonus: bool) -> dict[str, int]:
    """번호별 출현 횟수. 1~45 키가 모두 존재하고, 안 나온 번호는 0 이다.

    키를 문자열로 두는 이유는 JSON 객체의 키가 어차피 문자열이기 때문이다.
    파이썬 dict 를 그대로 직렬화하면 `1` 이 `"1"` 이 되므로 미리 맞춰 혼란을 없앤다.
    """
    counts = Counter()
    for d in draws:
        counts.update(d.numbers)
        if include_bonus:
            counts[d.bonus] += 1
    return {str(n): counts.get(n, 0) for n in ALL_NUMBERS}


def _rounds_since(all_draws: Sequence[Draw]) -> dict[int, int]:
    """최신 회차 기준, 각 번호가 마지막으로 나온 뒤 지난 회차 수.

    window 가 아니라 **역대 전체**로 계산한다. 최근 20회차만 보면 30회 전에 나온 번호와
    300회 전에 나온 번호가 똑같이 "20" 이 되어 정보가 사라진다.
    """
    if not all_draws:
        return {}
    latest = all_draws[-1].round_no
    last_seen: dict[int, int] = {}
    for d in all_draws:
        for n in d.numbers:
            last_seen[n] = d.round_no
    # 역대 한 번도 안 나온 번호는 (실데이터엔 없지만) 전체 회차 수로 둔다.
    # 0 으로 두면 "방금 나왔다" 는 정반대 의미가 된다.
    return {
        n: latest - last_seen[n] if n in last_seen else len(all_draws)
        for n in ALL_NUMBERS
    }


def hot_cold(all_draws: Sequence[Draw], window: Optional[int]) -> dict:
    """window 안의 출현 횟수로 hot/cold 를, 역대 전체로 overdue 를 만든다."""
    windowed = slice_window(all_draws, window)
    counts = frequency(windowed, include_bonus=False)

    # 동점이면 번호가 작은 쪽이 앞선다. 정렬이 불안정하면 같은 요청이 다른 순서를 내고,
    # 사용자는 데이터가 바뀐 줄 안다.
    by_count_desc = sorted(ALL_NUMBERS, key=lambda n: (-counts[str(n)], n))
    by_count_asc = sorted(ALL_NUMBERS, key=lambda n: (counts[str(n)], n))

    since = _rounds_since(all_draws)
    by_overdue = sorted(ALL_NUMBERS, key=lambda n: (-since.get(n, 0), n))

    return {
        "rounds_analyzed": len(windowed),
        "hot": [{"number": n, "count": counts[str(n)]} for n in by_count_desc[:TOP_N]],
        "cold": [{"number": n, "count": counts[str(n)]} for n in by_count_asc[:TOP_N]],
        "overdue": [
            {"number": n, "rounds_since": since.get(n, 0)} for n in by_overdue[:TOP_N]
        ],
    }


def hot_cold_sets(all_draws: Sequence[Draw], window: int) -> tuple[set[int], set[int]]:
    """번호 추천의 `hot_count`/`cold_count` 가 쓰는 집합.

    `/api/lotto/stats/hot-cold` 와 **같은 함수**에서 나온다. 두 화면의 숫자가 어긋나면
    사용자는 어느 쪽도 믿지 않는다.
    """
    result = hot_cold(all_draws, window)
    return (
        {item["number"] for item in result["hot"]},
        {item["number"] for item in result["cold"]},
    )


def pattern(draws: Sequence[Draw]) -> dict:
    """역대 조합의 모양 분포. 예측 모듈의 `pattern.analyze()` 를 재사용한다.

    내부 키(`odd_even_dist`, `tail_diversity_avg`)를 API 필드명으로 바꿔 내보낸다.
    예측 모듈은 몬테카를로 필터가 쓰는 이름을 유지해야 하고, API 는 계약이 정한 이름을
    써야 한다. 둘을 억지로 맞추는 대신 여기서 번역한다.
    """
    # 빈 입력이면 analyze() 가 0으로 나눈다. 회차가 하나도 없는 것은 오류가 아니라
    # 워커가 아직 데이터를 채우지 않은 정상 상태이므로 빈 분포를 돌려준다.
    if not draws:
        return {
            "rounds_analyzed": 0,
            "odd_even": {},
            "high_low": {},
            "consecutive_ratio": 0.0,
            "sum_range": {"min": 0, "max": 0, "peak": 0},
            "tail_variety_avg": 0.0,
            "tail_counts": {},
        }

    num_rows = [d.numbers for d in draws]
    raw = pattern_analyzer.analyze(num_rows)
    return {
        "rounds_analyzed": len(draws),
        "odd_even": {k: round(v, 4) for k, v in raw["odd_even_dist"].items()},
        "high_low": {k: round(v, 4) for k, v in raw["high_low_dist"].items()},
        "consecutive_ratio": round(raw["consecutive_ratio"], 4),
        "sum_range": raw["sum_range"],
        "tail_variety_avg": round(raw["tail_diversity_avg"], 2),
        "tail_counts": {str(k): v for k, v in sorted(raw["tail_counts"].items())},
    }
