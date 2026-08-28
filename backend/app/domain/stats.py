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

# hot/cold/overdue 의 `top` 상한. 45 를 주면 hot 과 cold 가 같은 45개를 정반대로 정렬한
# 목록이 된다 — 이상해 보이지만 계약이 명시한 정상 동작이다.
TOP_MAX = 45

# 번호 하나의 통계에서 함께 나온 상대 번호를 몇 개까지 줄지, 출현 회차를 몇 개까지 줄지.
COMPANIONS_TOP = 5
RECENT_APPEARANCES_LIMIT = 20


class InvalidRangeError(ValueError):
    """기간 조회 파라미터가 잘못됐다. 라우터가 422 로 옮긴다."""


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


def select_range(
    all_draws: Sequence[Draw],
    *,
    window: str,
    from_round: Optional[int] = None,
    to_round: Optional[int] = None,
) -> tuple[Sequence[Draw], dict]:
    """집계 대상 회차와 응답의 구간 메타를 함께 만든다.

    통계 네 엔드포인트와 번호 통계가 **모두 이 함수 하나**를 쓴다. 구간 계산이 여러 곳에
    흩어지면 화면마다 "몇 회차를 봤는가" 가 달라지고, 그것을 사용자가 대조하는 순간
    어느 쪽도 믿을 수 없게 된다.

    규칙 (docs/wiki/10-contracts/api-contract.md 의 '기간 조회'):

    - `from_round`·`to_round` 를 **둘 다** 주면 `window` 는 무시한다.
    - **하나만** 오면 `InvalidRangeError`. 한쪽만 받아 나머지를 알아서 채우면 사용자가
      무엇을 보고 있는지 화면과 어긋난다.
    - `from_round > to_round` 도 `InvalidRangeError`. 조용히 swap 하지 않는다 — 잘못
      입력한 사실을 화면이 알려야 한다.
    - 데이터 밖으로 나간 범위는 **에러가 아니라 교집합**으로 자른다. 그래서 응답의
      `from_round`/`to_round` 는 요청값이 아니라 **실제로 집계에 쓰인 값**이다.
    - 교집합이 비면 `rounds_analyzed: 0` 과 메타 전부 `None`. 없는 구간을 물어본 것은
      오류가 아니라 사실 조회다.
    """
    range_mode = from_round is not None or to_round is not None

    if range_mode:
        if from_round is None or to_round is None:
            raise InvalidRangeError(
                "기간 조회는 from_round 와 to_round 를 함께 주어야 합니다."
            )
        if from_round > to_round:
            raise InvalidRangeError(
                f"from_round({from_round}) 가 to_round({to_round}) 보다 큽니다."
            )
        # 요청 범위를 그대로 믿지 않고 실제 데이터와 교집합을 낸다.
        selected: Sequence[Draw] = [
            d for d in all_draws if from_round <= d.round_no <= to_round
        ]
    else:
        selected = slice_window(all_draws, resolve_window(window))

    meta = {
        # 기간 조회면 window 는 의미가 없다. 요청받은 값을 되돌려 주면 화면이 "최근 20회"
        # 라고 잘못 쓰게 되므로 null 을 준다.
        "window": None if range_mode else _window_echo(window),
        "rounds_analyzed": len(selected),
        "from_round": selected[0].round_no if selected else None,
        "to_round": selected[-1].round_no if selected else None,
        "from_date": selected[0].draw_date if selected else None,
        "to_date": selected[-1].draw_date if selected else None,
    }
    return selected, meta


def _window_echo(window: str) -> int | str:
    """응답의 `window` 는 요청받은 값을 그대로 되돌려 준다."""
    return window if window == "all" else int(window)


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


def _last_seen_round(all_draws: Sequence[Draw]) -> dict[int, Optional[int]]:
    """각 번호가 **마지막으로 나온 회차 번호**(절대값). 역대로 없으면 None.

    window 가 아니라 역대 전체에서 찾는다 — window 밖에서 나온 번호도 "언제 나왔나" 는
    답할 수 있어야 한다. `_rounds_since` 와 hot-cold 의 `last_seen_round` 가 같은
    출처를 쓰게 하려고 별도 함수로 뽑았다.
    """
    last_seen: dict[int, Optional[int]] = {n: None for n in ALL_NUMBERS}
    for d in all_draws:
        for n in d.numbers:
            last_seen[n] = d.round_no
    return last_seen


def _rounds_since(all_draws: Sequence[Draw]) -> dict[int, int]:
    """최신 회차 기준, 각 번호가 마지막으로 나온 뒤 지난 회차 수.

    window 가 아니라 **역대 전체**로 계산한다. 최근 20회차만 보면 30회 전에 나온 번호와
    300회 전에 나온 번호가 똑같이 "20" 이 되어 정보가 사라진다.
    """
    if not all_draws:
        return {}
    latest = all_draws[-1].round_no
    last_seen = _last_seen_round(all_draws)
    # 역대 한 번도 안 나온 번호는 (실데이터엔 없지만) 전체 회차 수로 둔다.
    # 0 으로 두면 "방금 나왔다" 는 정반대 의미가 된다.
    return {
        n: (latest - r if (r := last_seen[n]) is not None else len(all_draws))
        for n in ALL_NUMBERS
    }


def _trend(windowed: Sequence[Draw], number: int) -> str:
    """window 안에서 번호의 출현 추세. "up" | "down" | "flat".

    window 를 회차 기준 최근 절반과 이전 절반으로 나눠 출현 횟수를 비교한다. 홀수
    window 는 가운데 회차를 **최근 쪽**에 넣는다(이전 절반 = n//2 개). 최근이 더 많으면
    up, 적으면 down, 같으면 flat. 회차가 2개 미만이면 나눌 수 없으니 flat.

    **이것은 관찰된 추세일 뿐 예측이 아니다.** "오를 것" 이 아니라 "최근에 더 나왔다" 다
    (docs/wiki/40-domain/forbidden-expressions.md).
    """
    n = len(windowed)
    if n < 2:
        return "flat"
    split = n // 2  # 이전 절반의 크기. 홀수면 가운데는 최근 쪽으로 넘어간다.
    earlier = sum(1 for d in windowed[:split] if number in d.numbers)
    recent = sum(1 for d in windowed[split:] if number in d.numbers)
    if recent > earlier:
        return "up"
    if recent < earlier:
        return "down"
    return "flat"


def hot_cold(
    all_draws: Sequence[Draw], windowed: Sequence[Draw], *, top: int = TOP_N
) -> dict:
    """`windowed` 안의 출현 횟수로 hot/cold 를, **역대 전체**로 overdue 를 만든다.

    두 번째 인자가 window 정수가 아니라 **이미 고른 회차 목록**인 이유: 기간 조회
    (`from_round`~`to_round`)는 "최근 N회" 라는 정수로 표현할 수 없다. 자르는 일은
    `select_range` 한 곳이 하고, 여기서는 고른 결과를 받아 세기만 한다.

    `all_draws` 를 따로 받는 것은 overdue·`last_seen_round` 가 구간이 아니라 역대
    전체에서 나오기 때문이다. "최근 20회에 안 나왔다" 는 20 이상의 모든 값을 20 으로
    뭉개므로 쓸모가 없다 (docs/wiki/10-contracts/api-contract.md).

    hot·cold 항목은 출현 횟수(`count`)에 더해 출현 비율(`appearance_rate`)·마지막 출현
    회차(`last_seen_round`)·추세(`trend`)를 담는다. 셋 다 과거의 사실이다 — 비율은
    다음 회차 확률이 아니라 "지난 N회 중 나온 비율" 이고, 그래서 `appearance_rate`
    이지 `probability` 가 아니다.
    """
    counts = frequency(windowed, include_bonus=False)
    rounds_analyzed = len(windowed)

    # 동점이면 번호가 작은 쪽이 앞선다. 정렬이 불안정하면 같은 요청이 다른 순서를 내고,
    # 사용자는 데이터가 바뀐 줄 안다.
    by_count_desc = sorted(ALL_NUMBERS, key=lambda n: (-counts[str(n)], n))
    by_count_asc = sorted(ALL_NUMBERS, key=lambda n: (counts[str(n)], n))

    since = _rounds_since(all_draws)
    last_seen = _last_seen_round(all_draws)
    by_overdue = sorted(ALL_NUMBERS, key=lambda n: (-since.get(n, 0), n))

    def _item(n: int) -> dict:
        return {
            "number": n,
            "count": counts[str(n)],
            # rounds_analyzed=0 이면 나눗셈이 터진다. 회차가 없는 것은 오류가 아니므로 0.0.
            "appearance_rate": (
                round(counts[str(n)] / rounds_analyzed, 4) if rounds_analyzed else 0.0
            ),
            "last_seen_round": last_seen[n],
            "trend": _trend(windowed, n),
        }

    return {
        "rounds_analyzed": rounds_analyzed,
        # 구간에 회차가 하나도 없으면 hot·cold 는 **빈 배열**이다. 45개를 전부 0회로
        # 채워 내보내면 화면에 "1번 0회 · 1위" 가 뜨는데, 그것은 사실이 아니라 정렬의
        # 부산물이다. 반면 overdue 는 구간이 아니라 역대 전체에서 나오므로 그대로 둔다 —
        # 구간에 데이터가 없다는 것과 그 번호의 역사가 없다는 것은 다른 말이다
        # (docs/wiki/10-contracts/api-contract.md 의 '기간 조회').
        "hot": [_item(n) for n in by_count_desc[:top]] if rounds_analyzed else [],
        "cold": [_item(n) for n in by_count_asc[:top]] if rounds_analyzed else [],
        # overdue 에는 비율·추세를 넣지 않는다 — 미출현 목록에 "얼마나 자주" 나 "추세" 는
        # 의미가 없다. 마지막 출현 회차만 더한다.
        "overdue": [
            {
                "number": n,
                "rounds_since": since.get(n, 0),
                "last_seen_round": last_seen[n],
            }
            for n in by_overdue[:top]
        ],
    }


def hot_cold_sets(all_draws: Sequence[Draw], window: int) -> tuple[set[int], set[int]]:
    """번호 추천의 `hot_count`/`cold_count` 가 쓰는 집합.

    `/api/lotto/stats/hot-cold` 와 **같은 함수**에서 나온다. 두 화면의 숫자가 어긋나면
    사용자는 어느 쪽도 믿지 않는다.
    """
    # 여기서만 기본 TOP_N 을 쓴다. 추천의 hot_count/cold_count 기준은 화면이 고르는
    # `top` 과 무관하게 고정이어야 한다 — 사용자가 `top=40` 으로 본다고 추천의 정의가
    # 따라 바뀌면 두 화면을 대조할 수 없다 (docs/wiki/10-contracts/api-contract.md).
    result = hot_cold(all_draws, slice_window(all_draws, window))
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
            "sum_histogram": {},
            "consecutive_counts": {},
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
        "sum_histogram": _sum_histogram(draws),
        "consecutive_counts": _consecutive_counts(draws),
    }


def _sum_histogram(draws: Sequence[Draw]) -> dict[str, int]:
    """여섯 번호 합계를 10 단위 구간으로 묶은 **회차 수**.

    비율이 아니라 개수인 이유: 사용자가 `rounds_analyzed` 와 더해 검증할 수 있어야 한다.
    기존 `sum_range`(10·90 퍼센타일과 중앙값)는 요약값이라 분포의 모양을 보여주지 못해
    히스토그램을 따로 둔다 (docs/wiki/10-contracts/api-contract.md).

    데이터가 있는 구간만 담는다. 합계는 최소 21(1+2+3+4+5+6), 최대 255(40..45)라
    비어 있는 구간까지 채우면 대부분이 0 인 표가 된다.
    """
    buckets: Counter = Counter()
    for d in draws:
        low = (sum(d.numbers) // 10) * 10
        buckets[low] += 1
    return {f"{low}-{low + 9}": c for low, c in sorted(buckets.items())}


def _consecutive_counts(draws: Sequence[Draw]) -> dict[str, float]:
    """한 회차에 든 **연속번호 쌍의 개수**별 비율. 키는 개수, 값은 0.0~1.0.

    `[1, 2, 3]` 은 (1,2)·(2,3) 두 쌍으로 센다.

    **`consecutive_ratio` 와 반드시 맞아떨어져야 한다** — 그 값은 "연속을 한 쌍 이상
    포함한 회차의 비율" 이므로 `1 - consecutive_counts["0"]` 과 같다. 두 값이 어긋나면
    백엔드 버그이고, 테스트가 이 불변식을 지킨다.

    `numbers` 는 오름차순이 보장돼 있어(DB CHECK 제약) 여기서 다시 정렬하지 않는다.
    """
    total = len(draws)
    if not total:
        return {}
    buckets: Counter = Counter()
    for d in draws:
        nums = d.numbers
        buckets[sum(1 for i in range(5) if nums[i + 1] - nums[i] == 1)] += 1
    return {str(k): round(v / total, 4) for k, v in sorted(buckets.items())}


# 동반 출현 결과의 기본 개수와 상한. 45개를 다 주면 "많이 나온 순" 이 무의미하다.
PAIRS_DEFAULT_TOP = 10
PAIRS_MAX_TOP = 45


def pairs(
    draws: Sequence[Draw], *, number: Optional[int] = None, top: int = PAIRS_DEFAULT_TOP
) -> dict:
    """window 안에서 함께 나온 번호쌍을 센다.

    `pair_affinity` 전략이 내부에서 쓰던 동시출현 집계를 사용자에게 노출하는 것이다.
    각 회차의 여섯 번호에서 15개(6C2) 쌍을 만들어 누적한다. 동시출현도 관찰된 사실이고,
    이 값이 "이 쌍이 또 나온다" 를 뜻하지 않는다 (docs/wiki/40-domain/forbidden-expressions.md).

    `number` 를 주면 그 번호를 포함한 쌍만 남긴다. `numbers` 는 그 경우에도 항상
    오름차순이며, 어떤 번호 기준인지는 응답 최상위 `number` 로 구분한다.
    """
    counter: Counter = Counter()
    for d in draws:
        nums = sorted(d.numbers)
        # 오름차순 입력에서 i<j 로만 만들면 (a, b) 는 항상 a < b 다. 정렬을 한 번 더 하지 않는다.
        for i in range(len(nums)):
            for j in range(i + 1, len(nums)):
                counter[(nums[i], nums[j])] += 1

    if number is not None:
        # 그 번호가 든 쌍만. 상대 번호가 무엇이든 쌍은 여전히 오름차순으로 둔다.
        items = [(pair, c) for pair, c in counter.items() if number in pair]
    else:
        items = list(counter.items())

    # 많이 나온 순, 동점이면 번호가 작은 쌍이 앞선다 — 정렬을 안정시켜 같은 요청이 같은
    # 순서를 내게 한다.
    items.sort(key=lambda x: (-x[1], x[0]))

    return {
        "rounds_analyzed": len(draws),
        "number": number,
        "pairs": [
            {"numbers": [a, b], "count": c} for (a, b), c in items[: max(0, top)]
        ],
    }


def _max_gap(all_draws: Sequence[Draw], number: int) -> Optional[int]:
    """역대 최장 미출현 간격(회차). 역대로 한 번도 안 나왔으면 None.

    간격은 `rounds_since` 와 **같은 자로 잰다** — 뒤 회차 번호 빼기 앞 회차 번호다.
    두 값이 다른 자를 쓰면 "지금 12회째 안 나왔고 최장은 21회" 라는 문장이 성립하지 않는다.

    **진행 중인 미출현 구간도 후보에 넣는다.** 지금이 역대 최장 가뭄이라면 그 사실이
    최장값으로 보여야지, 과거 기록에 가려지면 안 된다.

    첫 출현 이전 구간은 세지 않는다. 데이터가 1회차부터 있더라도 "그 이전에 얼마나
    안 나왔는가" 는 알 수 없는 값이고, 0회차라는 것은 없다.

    구간이 아니라 **역대 전체** 기준이다 — "최장 21회차까지 안 나온 적이 있다" 는 사실이
    조회 구간에 갇히면 의미가 없다 (docs/wiki/10-contracts/api-contract.md).
    """
    appeared = [d.round_no for d in all_draws if number in d.numbers]
    if not appeared:
        return None
    gaps = [later - earlier for earlier, later in zip(appeared, appeared[1:])]
    gaps.append(all_draws[-1].round_no - appeared[-1])
    return max(gaps)


def number_stats(
    all_draws: Sequence[Draw], selected: Sequence[Draw], number: int
) -> dict:
    """번호 하나의 통계. 화면 하단 "내가 보고 싶은 번호" 조회용.

    **이 함수가 따로 있는 이유는 `rank` 다.** "15번은 최근 50회에서 12회 나와 3위" 를
    만들려면 45개 전부를 정렬해야 하는데, 그 집계를 브라우저에서 하면 화면과 서버의
    숫자가 갈라진다 (docs/wiki/10-contracts/component-boundaries.md).

    구간에 매인 값(`count`·`appearance_rate`·`rank`·`trend`·`companions`·
    `recent_appearances`)과 역대 전체에 매인 값(`last_seen_round`·`rounds_since`·
    `max_gap`)이 섞여 있다. 계약이 후자를 역대 기준으로 못박았기 때문이고, 그래서 구간이
    비어도 후자는 실제 값을 유지한다 — 구간에 데이터가 없다는 것과 그 번호의 역사가
    없다는 것은 다른 말이다.
    """
    counts = frequency(selected, include_bonus=False)
    rounds_analyzed = len(selected)

    # hot 정렬과 **같은 규칙**이다(횟수 내림차순, 동점이면 번호가 작은 쪽). 두 화면의
    # 순위가 어긋나면 사용자는 어느 쪽도 믿지 않는다.
    order = sorted(ALL_NUMBERS, key=lambda n: (-counts[str(n)], n))

    companions = [
        # pairs 는 오름차순 쌍을 주므로, 요청한 번호가 아닌 쪽이 상대다.
        {"number": p["numbers"][1] if p["numbers"][0] == number else p["numbers"][0],
         "count": p["count"]}
        for p in pairs(selected, number=number, top=COMPANIONS_TOP)["pairs"]
    ]

    recent = [
        {"round_no": d.round_no, "draw_date": d.draw_date}
        for d in reversed(selected)
        if number in d.numbers
    ][:RECENT_APPEARANCES_LIMIT]

    return {
        "number": number,
        "count": counts[str(number)],
        "appearance_rate": (
            round(counts[str(number)] / rounds_analyzed, 4) if rounds_analyzed else 0.0
        ),
        # 구간이 비면 모든 번호의 횟수가 0 이라 정렬은 번호순이 된다. 그것을 순위라고
        # 내보내면 "15번은 15위" 라는 거짓이 나가므로 null 을 준다.
        "rank": (order.index(number) + 1) if rounds_analyzed else None,
        "rank_total": len(ALL_NUMBERS),
        "trend": _trend(selected, number),
        "last_seen_round": _last_seen_round(all_draws)[number],
        "rounds_since": _rounds_since(all_draws).get(number, 0),
        "max_gap": _max_gap(all_draws, number),
        "companions": companions,
        "recent_appearances": recent,
    }
