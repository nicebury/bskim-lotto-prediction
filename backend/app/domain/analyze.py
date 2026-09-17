"""조합 분석 — 번호 6개를 역대 회차와 대조한다.

계약: `docs/wiki/10-contracts/api-contract-analysis.md`

## 왜 엔드포인트를 새로 두는가

기존 통계 API 로 조립할 수 없어서가 아니라 **왕복이 스무 번을 넘기 때문**이다. 번호
6개 × (전체·최근20·최근50) 지표만 `/stats/number/{n}` 을 18번 불러야 하고, 과거 회차
대조(몇 개 일치가 몇 번)는 애초에 없다. 한 화면이 한 번 부르는 편이 **화면과 서버의
숫자가 갈라질 여지도 없앤다**.

## 이 모듈의 원칙 셋

1. **정의를 여기 한 곳에 둔다.** `ac_value` 같은 지표는 커뮤니티마다 계산이 다르다.
   화면이 "AC값이 뭐냐" 는 도움말을 붙이므로 정의가 하나로 고정돼야 한다.
2. **기존 통계와 같은 함수를 쓴다.** `sum_histogram`·`pattern` 은 `domain/stats.py` 를
   그대로 부른다 — 두 API 의 값이 어긋나면 그 자체로 버그다.
3. **모르는 것은 `null` 이지 0 이 아니다.** 특히 1~3등 당첨금은 회차마다 다르고 우리
   데이터에 없다. 0 이나 평균으로 메우면 그 순간 숫자가 거짓말이 된다.

**전부 동기 함수다.** 전 회차 스캔이 CPU 를 쥐므로 라우터가 `asyncio.to_thread` 로 감싼다.
"""
from __future__ import annotations

from collections import Counter
from itertools import combinations
from typing import Optional, Sequence

from . import stats as stats_mod
from .draw import Draw

# 로또 한 게임 값. 회고 집계(`retrospect`)의 유일한 상수다.
TICKET_PRICE = 1_000

# 금액이 **고정된** 등위만. 1~3등은 회차마다 총 판매액과 당첨자 수에 따라 달라지고
# 3등 금액은 우리 데이터 소스에 아예 없다 (docs/wiki/40-domain/lotto-rules.md).
# 없는 금액을 0 이나 평균으로 메우면 그 순간 합계가 거짓말이 된다.
FIXED_PRIZE = {4: 50_000, 5: 5_000}

# 1~45 중의 소수. **1은 소수가 아니다** — 계약이 명시한다.
PRIMES = frozenset({2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43})

# 동행복권 공식 5구간. 색까지 정하는 것은 화면의 일이지만 **구간은 서버가 정한다** —
# 프론트가 번호에서 다시 계산하면 규칙이 두 곳에 살게 된다 (lotto-rules.md).
_BANDS = ((10, "1-10"), (20, "11-20"), (30, "21-30"), (40, "31-40"), (45, "41-45"))

RECENT_WINDOWS = (20, 50)


class InvalidNumbersError(Exception):
    """번호 입력이 계약을 어겼다. 라우터가 422 로 옮긴다."""


class NoDrawDataError(Exception):
    """회차가 하나도 없다. 라우터가 503 으로 옮긴다.

    빈 값을 0 으로 채워 내려보내지 않는다 — "역대 0번 나왔다" 와 "데이터가 없다" 는
    전혀 다른 말인데, 화면은 둘을 구분할 방법이 없다.
    """


def parse_numbers(raw: str) -> list[int]:
    """`"3,11,24,29,38,41"` → `[3, 11, 24, 29, 38, 41]`. 어기면 `InvalidNumbersError`.

    **오름차순으로 정렬해 돌려준다.** `41,3,11,…` 과 `3,11,…,41` 은 같은 조합이므로
    캐시 키도 정렬 후의 것이어야 한다.

    오류 메시지에 무엇이 잘못됐는지 담는 이유: 이 값은 사용자가 URL 로 직접 만질 수
    있고(공유·북마크되는 화면이다), 비밀이 아니다. 조용히 보정하면 사용자가 잘못 입력한
    사실을 화면이 알려 주지 못한다.
    """
    parts = [p.strip() for p in (raw or "").split(",") if p.strip()]
    try:
        numbers = [int(p) for p in parts]
    except ValueError as exc:
        raise InvalidNumbersError("번호는 숫자여야 합니다.") from exc

    if len(numbers) != 6:
        raise InvalidNumbersError(f"번호는 정확히 6개여야 합니다 (받은 개수 {len(numbers)}).")
    out_of_range = [n for n in numbers if not (1 <= n <= 45)]
    if out_of_range:
        raise InvalidNumbersError(f"번호는 1~45 여야 합니다: {out_of_range}")
    if len(set(numbers)) != 6:
        dupes = sorted({n for n in numbers if numbers.count(n) > 1})
        raise InvalidNumbersError(f"중복된 번호가 있습니다: {dupes}")

    return sorted(numbers)


def _band(number: int) -> str:
    for upper, label in _BANDS:
        if number <= upper:
            return label
    return _BANDS[-1][1]  # 도달하지 않는다. 45 상한을 이미 검증했다.


# ── 블록 1: 번호별 지표 ───────────────────────────────────────────────────


def per_number(all_draws: Sequence[Draw], numbers: Sequence[int]) -> list[dict]:
    """여섯 번호 각각의 지표. `numbers` 와 같은 순서(오름차순)다.

    ⚠ `total_count`·`recent_*` 는 **보너스를 세지 않는다.** 보너스는 `bonus_count` 로
    따로 낸다 — 당첨번호와 성격이 다르고, 섞으면 "역대 152번" 이 무엇의 152번인지
    설명할 수 없게 된다 (lotto-rules.md).
    """
    latest_round = all_draws[-1].round_no
    recent = {w: all_draws[-w:] for w in RECENT_WINDOWS}

    out: list[dict] = []
    for n in numbers:
        appeared = [d.round_no for d in all_draws if n in d.numbers]
        last_seen = appeared[-1] if appeared else None
        out.append(
            {
                "number": n,
                "total_count": len(appeared),
                # 계약이 `recent_20`·`recent_50` 두 키를 못 박았다. 창을 늘리려면
                # 계약을 먼저 고친다 — 화면이 키 이름을 그대로 읽는다.
                "recent_20": sum(1 for d in recent[20] if n in d.numbers),
                "recent_50": sum(1 for d in recent[50] if n in d.numbers),
                "last_seen_round": last_seen,
                # 마지막 출현이 없으면 "몇 회차째 안 나왔는가" 도 알 수 없다. 전체
                # 회차 수로 채우면 "1239회째 가뭄" 이라는 없는 사실이 생긴다.
                "rounds_since": (latest_round - last_seen) if last_seen else None,
                # `/stats/number/{n}` 과 **같은 함수**를 쓴다. 두 화면이 같은 번호에
                # 다른 최장 간격을 보이면 사용자는 어느 쪽도 믿지 않는다.
                "max_gap": stats_mod._max_gap(all_draws, n),
                "bonus_count": sum(1 for d in all_draws if d.bonus == n),
                "tail": n % 10,
                "color_band": _band(n),
            }
        )
    return out


def frequency_grid(all_draws: Sequence[Draw]) -> list[dict]:
    """45칸 격자용. 1~45 **전부**, 번호 오름차순.

    ⚠ 비율이 아니라 **개수**다 — 프론트가 최댓값으로 나눠 색 농도를 정한다.
    `/stats/frequency?window=all&include_bonus=false` 와 같은 값이어야 하므로 그 함수를
    그대로 쓴다.
    """
    counts = stats_mod.frequency(all_draws, include_bonus=False)
    return [{"number": n, "count": counts[str(n)]} for n in range(1, 46)]


# ── 블록 2: 조합 패턴 ────────────────────────────────────────────────────


def ac_value(numbers: Sequence[int]) -> int:
    """AC값 — 두 개씩 뽑아 만든 차이 15개 중 **서로 다른 값의 개수 − 5**.

    최솟값 0(`1,2,3,4,5,6` — 차이가 1~5 다섯 종류), 최댓값 10.

    커뮤니티마다 "차이의 종류 수" 만 세거나 −5 를 빼지 않는 변형이 돌아다닌다. 화면이
    도움말을 붙이므로 **계약이 정한 이 정의만** 쓴다.
    """
    diffs = {abs(a - b) for a, b in combinations(numbers, 2)}
    return len(diffs) - 5


def _consecutive_pairs(numbers: Sequence[int]) -> int:
    """값이 1 차이 나는 **인접 쌍의 개수**. `24,25,26` 이면 2 다."""
    s = sorted(numbers)
    return sum(1 for i in range(len(s) - 1) if s[i + 1] - s[i] == 1)


def _same_tail_pairs(numbers: Sequence[int]) -> int:
    """끝수가 같은 번호의 **쌍 개수**. 끝수 3인 번호가 3개면 3C2 = 3 이다."""
    tails = Counter(n % 10 for n in numbers)
    return sum(c * (c - 1) // 2 for c in tails.values())


def reference_blocks(all_draws: Sequence[Draw]) -> dict:
    """**조합과 무관한** 역대 집계. 전 회차를 훑으므로 회차 단위로 캐시할 수 있다.

    `combination()` 에서 이 부분만 떼어낸 이유: 사용자가 번호 하나만 바꿔도 1,200여
    회차를 통째로 다시 훑는 것을 막기 위해서다(계약이 권고한 캐시 전략).

    집계는 `domain/stats.py` 와 **같은 함수**를 쓴다. 계약이 "두 API 의 값이 어긋나면
    백엔드 버그다" 라고 못 박았다.
    """
    total = len(all_draws)
    pat = stats_mod.pattern(all_draws)

    ac_counter: Counter = Counter()
    for d in all_draws:
        ac_counter[ac_value(d.numbers)] += 1

    carry_total = 0
    for earlier, later in zip(all_draws, all_draws[1:]):
        carry_total += len(set(later.numbers) & set(earlier.numbers))
    # 첫 회차는 직전이 없어 이월수를 정의할 수 없다. 분모에서도 뺀다 —
    # 0 으로 세면 평균이 실제보다 낮아진다.
    carry_pairs = total - 1

    return {
        "sum_histogram": pat["sum_histogram"],
        "odd_even_dist": pat["odd_even"],
        "high_low_dist": pat["high_low"],
        "consecutive_share": pat["consecutive_ratio"],
        "ac_histogram": {
            str(k): round(v / total, 4) for k, v in sorted(ac_counter.items())
        },
        "carryover_avg": (
            round(carry_total / carry_pairs, 4) if carry_pairs else None
        ),
    }


def combination(
    all_draws: Sequence[Draw],
    numbers: Sequence[int],
    shared: Optional[dict] = None,
) -> dict:
    """내 조합의 지표 + 역대에서 그 값이 얼마나 흔한지.

    `shared` 는 `reference_blocks()` 의 결과다. 주면 전 회차 재집계를 건너뛴다 —
    호출부(라우터)가 회차 단위로 캐시해 넘긴다. 없으면 여기서 만든다.
    """
    total = len(all_draws)
    my_sum = sum(numbers)
    odds = sum(1 for n in numbers if n % 2 == 1)
    # 고 = 23 이상. `traits.compute` 와 같은 경계다 (prediction-algorithm.md).
    highs = sum(1 for n in numbers if n >= 23)
    my_odd_even = f"{odds}:{6 - odds}"
    my_high_low = f"{highs}:{6 - highs}"

    # ⚠ 직전 회차는 **가장 최근 회차**다. `all_draws` 는 round_no 오름차순이므로 마지막.
    # 이월수는 "지난주 번호와 몇 개 겹치나" 이고, 보너스는 세지 않는다.
    previous = all_draws[-1]
    carryover = len(set(numbers) & set(previous.numbers))

    ref = shared if shared is not None else reference_blocks(all_draws)
    sum_histogram = ref["sum_histogram"]
    band_low = (my_sum // 10) * 10
    band_key = f"{band_low}-{band_low + 9}"

    return {
        "sum": my_sum,
        "odd_even": my_odd_even,
        "high_low": my_high_low,
        "consecutive_pairs": _consecutive_pairs(numbers),
        "tail_sum": sum(n % 10 for n in numbers),
        "same_tail_pairs": _same_tail_pairs(numbers),
        "ac_value": ac_value(numbers),
        "multiples_of_3": sum(1 for n in numbers if n % 3 == 0),
        "prime_count": sum(1 for n in numbers if n in PRIMES),
        "carryover": carryover,
        "reference": {
            "sum_histogram": sum_histogram,
            # 내 합계가 든 구간의 비율. 그 구간에 한 회차도 없으면 0.0 이다 —
            # 이것은 "모른다" 가 아니라 "역대 한 번도 없었다" 는 사실이다.
            "sum_band_share": round(sum_histogram.get(band_key, 0) / total, 4),
            "odd_even_share": ref["odd_even_dist"].get(my_odd_even, 0.0),
            "high_low_share": ref["high_low_dist"].get(my_high_low, 0.0),
            "consecutive_share": ref["consecutive_share"],
            "ac_histogram": ref["ac_histogram"],
            "carryover_avg": ref["carryover_avg"],
        },
    }


# ── 블록 3: 과거 회차 대조 ───────────────────────────────────────────────


def _rank_of(match_count: int, bonus_matched: bool) -> Optional[int]:
    """등수. 해당 없으면 None.

    ⚠ **보너스는 2등 판정에만 쓰인다.** 5개를 맞추고 보너스까지 맞으면 2등, 아니면
    3등이다. 4개·3개 일치에서는 보너스를 보지 않는다 (lotto-rules.md).
    """
    if match_count == 6:
        return 1
    if match_count == 5:
        return 2 if bonus_matched else 3
    if match_count == 4:
        return 4
    if match_count == 3:
        return 5
    return None


CLOSEST_LIMIT = 5


def past_match(all_draws: Sequence[Draw], numbers: Sequence[int]) -> dict:
    """내 번호가 실제 당첨번호와 얼마나 가까웠는지. **이 화면의 핵심**이다."""
    picked = set(numbers)

    # 0~6 일곱 키를 **모두** 담는다. 0 인 키를 빼면 화면이 "데이터가 없는 것" 과
    # "0회인 것" 을 구분할 수 없다.
    distribution = {str(k): 0 for k in range(7)}
    # ⚠ `rank_counts` 도 **1~5 다섯 키를 모두** 담는다. 같은 이유다 — 화면이
    # "1등 0회 · 2등 0회 …" 를 그리려면 키가 있어야 하고, 없는 키를 만나면 화면은
    # 그것이 0인지 서버가 못 준 것인지 알 수 없다.
    #
    # 처음에 0인 등수를 빼고 만들었다가 프론트 계산과 대조하며 잡았다(2026-09-03).
    # 계약의 응답 예시가 `"1": 0, "2": 0, "3": 0, "4": 2, "5": 31` 로 0을 담고 있다.
    rank_counts = {str(k): 0 for k in range(1, 6)}
    scored: list[dict] = []
    exact_rounds: list[int] = []

    for d in all_draws:
        matched = sorted(picked & set(d.numbers))
        count = len(matched)
        distribution[str(count)] += 1

        bonus_matched = d.bonus in picked
        rank = _rank_of(count, bonus_matched)
        if rank is not None:
            rank_counts[str(rank)] += 1
        if count == 6:
            exact_rounds.append(d.round_no)

        # 3개 미만은 `closest` 후보가 될 수 없다(5개까지만 보여준다). 전 회차의
        # 상세 dict 를 다 만들면 1,200여 개를 헛되이 만든다.
        if count >= 3:
            scored.append(
                {
                    "round_no": d.round_no,
                    "draw_date": d.draw_date,
                    "numbers": list(d.numbers),
                    "bonus": d.bonus,
                    "matched": matched,
                    "match_count": count,
                    "bonus_matched": bonus_matched,
                    "rank": rank,
                }
            )

    # 일치 개수 내림차순 → 같으면 회차 내림차순(최신 우선). 정렬이 불안정하면 같은
    # 조합을 두 번 조회했을 때 목록이 달라 보인다.
    scored.sort(key=lambda x: (-x["match_count"], -x["round_no"]))

    return {
        "distribution": distribution,
        "rank_counts": rank_counts,
        "closest": scored[:CLOSEST_LIMIT],
        # ⚠ `null` 이 아니라 **빈 배열**이다. 비어 있다는 것 자체가 화면에 쓸 정보다
        # ("역대 한 번도 없었습니다").
        "exact_match_rounds": exact_rounds,
    }


# ── 블록 0: 가정 집계 ────────────────────────────────────────────────────


def retrospect(rank_counts: dict[str, int], rounds: int) -> dict:
    """1회차부터 매주 이 번호를 샀다면.

    ⚠ **1~3등 금액을 지어내지 않는다.** 회차마다 총 판매액과 당첨자 수에 따라 달라지고
    3등 금액은 우리 데이터 소스에 아예 없다. 해당하는 회차가 있으면 `unpriced` 에 넣고
    `returned`·`net` 계산에서 **뺀다.** 0 이나 평균으로 메우면 그 순간 합계가 거짓말이
    된다 (lotto-rules.md · api-contract-analysis.md).

    이 블록은 "사면 이만큼 번다" 가 아니라 **"1,239주를 사도 이렇게 된다"** 를 보여준다.
    `net` 은 사실상 언제나 큰 음수이고, 그것이 이 블록을 두는 이유다.
    """
    prizes: list[dict] = []
    unpriced: list[dict] = []

    for rank_str, count in sorted(rank_counts.items()):
        # ⚠ 0회인 등수는 **담지 않는다.** `rank_counts` 는 화면이 표를 그리도록 1~5 를
        # 모두 담지만, 이쪽은 "실제로 당첨된 것" 의 목록이라 성격이 다르다. 0을 담으면
        # `unpriced` 가 "금액을 모르는 당첨이 있다" 는 신호로 쓰이는데 **한 번도 안
        # 됐는데도 그 경고가 뜬다.**
        if count <= 0:
            continue
        rank = int(rank_str)
        each = FIXED_PRIZE.get(rank)
        if each is None:
            unpriced.append({"rank": rank, "count": count})
        else:
            prizes.append(
                {
                    "rank": rank,
                    "count": count,
                    "amount_each": each,
                    "amount": each * count,
                }
            )

    spent = rounds * TICKET_PRICE
    returned = sum(p["amount"] for p in prizes)
    return {
        "rounds": rounds,
        "ticket_price": TICKET_PRICE,
        "spent": spent,
        "prizes": prizes,
        "unpriced": unpriced,
        "returned": returned,
        "net": returned - spent,
    }


# ── 조립 ─────────────────────────────────────────────────────────────────

# 2026-09-03 프론트 세션 요청으로 뒷문장을 서술형으로 바꿨다(2026-09-08 반영).
#
# ⚠ **사실은 하나도 빼지 않았다.** "지난 회차의 기록" 과 "추첨의 독립성" 둘 다 그대로
# 남아 있고, 말하는 방식만 바꿨다 (forbidden-expressions.md 의 어투 규칙 1·3).
#
# ⚠ **법적 방어는 앞문장이 한다** — "참고용 정보입니다". 그래서 뒷문장을 서술형으로
# 바꿔도 어투 규칙 5("면책 고지는 그대로 둔다")를 어기지 않는다.
#
# 같은 이유로 `recommend`·`dream` 의 DISCLAIMER 는 **건드리지 않았다.** 그 둘은
# "당첨을 보장하지 않습니다" · "인과관계는 없습니다" 라는 **명시적 법적 방어**를 담고
# 있어 규칙 5 가 지목한 대상이다. 이쪽은 정보의 성격을 알리는 안내에 가깝다.
DISCLAIMER = (
    "과거 당첨번호를 대조한 참고용 정보입니다. "
    "여기 담긴 것은 지난 회차의 기록이고, 추첨은 매 회차 새로 진행됩니다."
)


def analyze(
    all_draws: Sequence[Draw],
    numbers: Sequence[int],
    *,
    shared: Optional[dict] = None,
    grid: Optional[list[dict]] = None,
) -> dict:
    """네 블록을 조립한다. `numbers` 는 정렬·검증이 끝난 6개여야 한다.

    `shared`·`grid` 는 회차 단위로 캐시된 집계다(라우터가 넘긴다). 없으면 여기서
    만든다 — 테스트와 단독 호출이 인자 없이도 돌아야 한다.
    """
    if not all_draws:
        raise NoDrawDataError("회차 데이터가 없습니다.")

    matches = past_match(all_draws, numbers)
    return {
        "numbers": list(numbers),
        "rounds_analyzed": len(all_draws),
        "from_round": all_draws[0].round_no,
        "to_round": all_draws[-1].round_no,
        "latest_draw_date": all_draws[-1].draw_date,
        "per_number": per_number(all_draws, numbers),
        "frequency_grid": grid if grid is not None else frequency_grid(all_draws),
        "combination": combination(all_draws, numbers, shared),
        "past_match": matches,
        "retrospect": retrospect(matches["rank_counts"], len(all_draws)),
        # 면책은 **백엔드가 내려준다.** 프론트가 잊지 못하게 하려는 장치다.
        "disclaimer": DISCLAIMER,
    }
