"""조합 분석 API (`GET /api/lotto/analyze`).

계약: `docs/wiki/10-contracts/api-contract-analysis.md`

계약이 **"어긋나면 백엔드 버그다"** 라고 직접 적은 불변식이 셋 있다. 그것들이 이 파일의
중심이다 — 나머지는 정의가 하나로 고정됐는지 본다.

1. `distribution` 의 합 == `rounds_analyzed`
2. `distribution["5"]` == `rank_counts["2"] + rank_counts["3"]` (보너스로 갈린다)
3. `reference` 의 집계 == `/stats/pattern` 의 같은 값

그리고 이 응답에만 있는 위험 하나 — **1~3등 금액을 지어내지 않는다.**
"""
from __future__ import annotations

import httpx
import pytest
from httpx import ASGITransport

from app.db import close_pool, open_pool
from app.domain import analyze as az
from app.domain import stats as stats_mod
from app.domain.draw import Draw
from app.main import app
from app.routers import analyze as analyze_router

from .conftest import make_draws


@pytest.fixture(autouse=True)
def _clear_cache():
    """회차 단위 캐시가 테스트 사이에 새지 않게 한다.

    프로세스 전역이라 한 테스트가 채운 값을 다음 테스트가 그대로 본다 — `frequency_grid`
    를 고쳐도 통과하는 최악의 초록불이 만들어진다.
    """
    analyze_router.invalidate_cache()
    yield
    analyze_router.invalidate_cache()


# ── 입력 검증 ─────────────────────────────────────────────────────────────


def test_정상_입력은_정렬해서_돌려준다():
    """`41,3,…` 과 `3,…,41` 은 같은 조합이다 — 캐시 키도 정렬 후의 것이어야 한다."""
    assert az.parse_numbers("41,3,11,29,38,24") == [3, 11, 24, 29, 38, 41]
    assert az.parse_numbers(" 3 , 11,24,29,38,41 ") == [3, 11, 24, 29, 38, 41]


@pytest.mark.parametrize(
    "raw",
    [
        "",                       # 빈 값
        "3,11,24,29,38",          # 5개
        "3,11,24,29,38,41,45",    # 7개
        "0,11,24,29,38,41",       # 범위 밖(아래)
        "3,11,24,29,38,46",       # 범위 밖(위)
        "3,3,24,29,38,41",        # 중복
        "3,11,x,29,38,41",        # 숫자 아님
    ],
)
def test_계약을_어긴_입력은_거부한다(raw: str):
    with pytest.raises(az.InvalidNumbersError):
        az.parse_numbers(raw)


# ── 지표 정의 ─────────────────────────────────────────────────────────────


def test_AC값_정의():
    """계약: 차이값 15개 중 **서로 다른 값의 개수 − 5**. 커뮤니티마다 변형이 돈다."""
    # 1,2,3,4,5,6 → 차이가 1~5 다섯 종류 → 5 - 5 = 0 (최솟값)
    assert az.ac_value([1, 2, 3, 4, 5, 6]) == 0
    # 1,2,3,4,5,7 → 차이가 1~6 여섯 종류 → 6 - 5 = 1
    assert az.ac_value([1, 2, 3, 4, 5, 7]) == 1
    # 차이 15개가 **전부 다른** 조합이라야 최댓값 10 이다.
    # ⚠ "값이 넓게 퍼지면 10" 이 아니다 — 1,2,5,11,21,36 은 넓지만 차이가 겹쳐 9 다.
    assert az.ac_value([1, 2, 4, 8, 13, 21]) == 10
    assert az.ac_value([1, 2, 5, 11, 21, 36]) == 9
    # 어떤 조합이든 정의상 0~10 을 벗어날 수 없다
    for combo in ([3, 11, 24, 29, 38, 41], [40, 41, 42, 43, 44, 45], [1, 9, 18, 27, 36, 45]):
        assert 0 <= az.ac_value(combo) <= 10, combo


def test_끝수와_동끝수_쌍():
    # 41 → 1, 30 → 0
    assert az.combination(make_draws(60), [1, 11, 21, 30, 40, 41])["tail_sum"] == (
        1 + 1 + 1 + 0 + 0 + 1
    )
    # 끝수 1인 번호가 셋(1·11·21) → 3C2 = 3 쌍
    assert az._same_tail_pairs([1, 11, 21, 32, 43, 45]) == 3
    # ⚠ 끝수가 같은 무리가 둘이면 **더한다**. 1·11·21(3쌍) + 30·40(1쌍) = 4 쌍이다
    assert az._same_tail_pairs([1, 11, 21, 30, 40, 45]) == 4
    assert az._same_tail_pairs([1, 12, 23, 34, 45, 6]) == 0


def test_연속_쌍은_인접만_센다():
    assert az._consecutive_pairs([24, 25, 26, 30, 40, 45]) == 2
    assert az._consecutive_pairs([1, 2, 10, 11, 30, 45]) == 2
    assert az._consecutive_pairs([1, 3, 5, 7, 9, 11]) == 0


def test_1은_소수가_아니다():
    """계약이 명시했다. 흔한 실수라 못 박아 둔다."""
    assert 1 not in az.PRIMES
    combo = az.combination(make_draws(60), [1, 2, 3, 4, 5, 6])
    assert combo["prime_count"] == 3  # 2, 3, 5


def test_색_구간은_서버가_정한다():
    """프론트가 번호에서 재계산하면 규칙이 두 곳에 살게 된다."""
    assert az._band(1) == "1-10"
    assert az._band(10) == "1-10"
    assert az._band(11) == "11-20"
    assert az._band(30) == "21-30"
    assert az._band(40) == "31-40"
    assert az._band(41) == "41-45"
    assert az._band(45) == "41-45"


# ── 계약이 못 박은 교차검증 ───────────────────────────────────────────────


def test_일치_분포의_합이_회차_수와_같다():
    """★ "값의 합은 `rounds_analyzed` 와 같아야 한다" — 계약 원문."""
    draws = make_draws(300)
    result = az.analyze(draws, [3, 11, 24, 29, 38, 41])
    dist = result["past_match"]["distribution"]

    assert sum(dist.values()) == result["rounds_analyzed"] == 300
    # 0~6 일곱 키를 **모두** 담는다. 빼면 화면이 "데이터 없음" 과 "0회" 를 구분 못 한다.
    assert set(dist) == {"0", "1", "2", "3", "4", "5", "6"}


def test_등수_키도_다섯_개를_모두_담는다():
    """★ `distribution` 과 같은 이유다 — 화면이 "1등 0회 · 2등 0회 …" 를 그린다.

    계약의 응답 예시가 `"1": 0, "2": 0, "3": 0, "4": 2, "5": 31` 로 0을 담고 있다.
    처음에 0인 등수를 빼고 구현했다가 **프론트의 클라이언트 계산과 대조하며** 잡았다
    (2026-09-03). 두 곳에서 같은 것을 계산하고 있었기에 드러난 버그다.
    """
    draws = make_draws(300)
    # 4·5등조차 한 번도 없을 수 있는 조합이어도 키는 다섯 개다
    result = az.analyze(draws, [1, 2, 3, 4, 5, 6])
    assert set(result["past_match"]["rank_counts"]) == {"1", "2", "3", "4", "5"}


def test_0회인_등수는_당첨_목록에_담지_않는다():
    """⚠ `rank_counts` 와 성격이 다르다.

    `rank_counts` 는 화면이 표를 그리도록 1~5 를 모두 담지만, `prizes`·`unpriced` 는
    "실제로 당첨된 것" 의 목록이다. 0을 담으면 `unpriced` 가 "금액을 모르는 당첨이
    있다" 는 신호로 쓰이는데 **한 번도 안 됐는데도 그 경고가 뜬다.**
    """
    rt = az.retrospect({"1": 0, "2": 0, "3": 0, "4": 5, "5": 10}, rounds=1000)
    assert [p["rank"] for p in rt["prizes"]] == [4, 5]
    assert rt["unpriced"] == []   # 0회인 1~3등이 들어가면 안 된다
    assert rt["returned"] == 50_000 * 5 + 5_000 * 10


def test_5개_일치는_2등과_3등의_합이다():
    """★ 보너스로 갈린다 — "두 값이 안 맞으면 버그다" 가 계약 원문이다.

    실데이터로는 5개 일치가 거의 없어 검증이 되지 않는다. **당첨번호를 그대로 골라**
    반드시 일치가 나오게 만든다.
    """
    draws = make_draws(200)
    # 어떤 회차의 당첨번호 그대로 → 그 회차는 6개 일치, 주변에도 일치가 생긴다
    target = list(draws[100].numbers)
    result = az.analyze(draws, target)
    pm = result["past_match"]

    five = pm["distribution"]["5"]
    assert five == pm["rank_counts"].get("2", 0) + pm["rank_counts"].get("3", 0)
    # 6개 일치는 1등이고, 그 회차가 `exact_match_rounds` 에 담긴다
    assert pm["distribution"]["6"] == pm["rank_counts"].get("1", 0)
    assert draws[100].round_no in pm["exact_match_rounds"]


def test_보너스는_2등_판정에만_쓰인다():
    """4개·3개 일치에서는 보너스를 보지 않는다 (lotto-rules.md)."""
    assert az._rank_of(6, False) == 1
    assert az._rank_of(5, True) == 2
    assert az._rank_of(5, False) == 3
    assert az._rank_of(4, True) == 4   # 보너스를 맞춰도 4등 그대로
    assert az._rank_of(3, True) == 5
    assert az._rank_of(2, True) is None


def test_reference_가_stats_pattern_과_같다():
    """★ "같은 함수를 쓰기를 권한다" — 두 API 가 다른 숫자를 보이면 안 된다."""
    draws = make_draws(300)
    ref = az.reference_blocks(draws)
    pat = stats_mod.pattern(draws)

    assert ref["sum_histogram"] == pat["sum_histogram"]
    assert ref["odd_even_dist"] == pat["odd_even"]
    assert ref["high_low_dist"] == pat["high_low"]
    assert ref["consecutive_share"] == pat["consecutive_ratio"]


def test_frequency_grid_가_stats_frequency_와_같다():
    """`/stats/frequency?window=all&include_bonus=false` 와 같은 값이어야 한다."""
    draws = make_draws(200)
    grid = az.frequency_grid(draws)
    counts = stats_mod.frequency(draws, include_bonus=False)

    assert len(grid) == 45
    assert [g["number"] for g in grid] == list(range(1, 46))
    for g in grid:
        assert g["count"] == counts[str(g["number"])]


def test_max_gap_은_stats_와_같은_함수다():
    """두 화면이 같은 번호에 다른 최장 간격을 보이면 사용자는 어느 쪽도 믿지 않는다."""
    draws = make_draws(200)
    rows = az.per_number(draws, [7])
    assert rows[0]["max_gap"] == stats_mod._max_gap(draws, 7)


# ── 1~3등 금액을 지어내지 않는다 ─────────────────────────────────────────


def test_금액을_모르는_등수는_합계에서_뺀다():
    """★ 이 응답에만 있는 위험이다.

    4·5등은 고정 금액이라 계산할 수 있지만 1~3등은 회차마다 다르고 3등 금액은 우리
    데이터에 아예 없다. 0 이나 평균으로 메우면 그 순간 합계가 거짓말이 된다.
    """
    rt = az.retrospect({"1": 1, "3": 2, "4": 5, "5": 10}, rounds=1000)

    priced = {p["rank"] for p in rt["prizes"]}
    unpriced = {u["rank"] for u in rt["unpriced"]}
    assert priced == {4, 5}
    assert unpriced == {1, 3}

    # returned 는 **prizes 만으로** 계산한다 — 1·3등이 섞이면 안 된다
    assert rt["returned"] == 50_000 * 5 + 5_000 * 10
    assert rt["spent"] == 1000 * az.TICKET_PRICE
    assert rt["net"] == rt["returned"] - rt["spent"]


def test_당첨이_없으면_net_은_구매액만큼_음수다():
    """이 블록은 "사면 이만큼 번다" 가 아니라 "이렇게 된다" 를 보여준다."""
    rt = az.retrospect({}, rounds=1239)
    assert rt["prizes"] == []
    assert rt["unpriced"] == []
    assert rt["returned"] == 0
    assert rt["net"] == -1_239_000


# ── 없는 데이터 ───────────────────────────────────────────────────────────


def test_회차가_없으면_0_이_아니라_예외다():
    """빈 값을 0 으로 채우면 "역대 0번" 과 "데이터 없음" 이 구분되지 않는다."""
    with pytest.raises(az.NoDrawDataError):
        az.analyze([], [1, 2, 3, 4, 5, 6])


def test_한_번도_안_나온_번호는_null_이다():
    """`rounds_since` 를 전체 회차 수로 채우면 없는 사실이 생긴다."""
    # 45번이 한 번도 없는 회차 집합을 만든다
    draws = [
        Draw(round_no=i, numbers=(1, 2, 3, 4, 5, 6), bonus=7)  # type: ignore[arg-type]
        for i in range(1, 61)
    ]
    row = az.per_number(draws, [45])[0]
    assert row["total_count"] == 0
    assert row["last_seen_round"] is None
    assert row["rounds_since"] is None
    assert row["max_gap"] is None


def test_이월수_평균은_회차가_하나면_null():
    """첫 회차는 직전이 없어 이월수를 정의할 수 없다."""
    one = make_draws(1)
    assert az.reference_blocks(one)["carryover_avg"] is None


# ── 캐시 ─────────────────────────────────────────────────────────────────


def test_캐시를_써도_결과가_같다():
    """캐시가 계산 결과를 바꾸면 그것은 캐시가 아니라 버그다."""
    draws = make_draws(200)
    numbers = [3, 11, 24, 29, 38, 41]

    직접 = az.analyze(draws, numbers)
    shared = az.reference_blocks(draws)
    grid = az.frequency_grid(draws)
    캐시경유 = az.analyze(draws, numbers, shared=shared, grid=grid)

    assert 직접 == 캐시경유


# ── 통합 ─────────────────────────────────────────────────────────────────


@pytest.fixture
async def client(require_lotto_draw: None):
    await open_pool()
    try:
        async with httpx.AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test", timeout=60.0
        ) as c:
            yield c
    finally:
        await close_pool()


@pytest.mark.integration
async def test_실데이터로_계약_모양을_지킨다(client):
    r = await client.get("/api/lotto/analyze?numbers=41,3,11,29,38,24")
    assert r.status_code == 200
    b = r.json()

    # 정렬해서 돌려준다
    assert b["numbers"] == [3, 11, 24, 29, 38, 41]
    assert set(b) == {
        "numbers", "rounds_analyzed", "from_round", "to_round", "latest_draw_date",
        "per_number", "frequency_grid", "combination", "past_match", "retrospect",
        "disclaimer",
    }
    assert len(b["per_number"]) == 6
    assert len(b["frequency_grid"]) == 45
    assert b["disclaimer"]

    # 계약의 교차검증이 실데이터에서도 성립한다
    pm = b["past_match"]
    assert sum(pm["distribution"].values()) == b["rounds_analyzed"]
    assert pm["distribution"]["5"] == pm["rank_counts"].get("2", 0) + pm[
        "rank_counts"
    ].get("3", 0)
    assert isinstance(pm["exact_match_rounds"], list)  # null 이 아니다

    # closest 정렬: 일치 개수 내림차순 → 같으면 회차 내림차순
    keys = [(-c["match_count"], -c["round_no"]) for c in pm["closest"]]
    assert keys == sorted(keys)
    assert len(pm["closest"]) <= 5


@pytest.mark.integration
async def test_캐시_헤더가_붙는다(client):
    r = await client.get("/api/lotto/analyze?numbers=1,2,3,4,5,6")
    assert "max-age=" in r.headers.get("cache-control", "")


@pytest.mark.integration
@pytest.mark.parametrize(
    "query",
    ["numbers=1,2,3,4,5", "numbers=1,2,3,4,5,46", "numbers=1,1,3,4,5,6", "numbers=a,b,c,d,e,f"],
)
async def test_잘못된_입력은_422(client, query: str):
    assert (await client.get(f"/api/lotto/analyze?{query}")).status_code == 422


@pytest.mark.integration
async def test_numbers_가_없으면_422(client):
    assert (await client.get("/api/lotto/analyze")).status_code == 422


@pytest.mark.integration
async def test_금지_필드명이_없다(client):
    """계약의 표현 규약이 이 응답에도 그대로 적용된다."""
    body = (await client.get("/api/lotto/analyze?numbers=3,11,24,29,38,41")).text
    for banned in (
        "probability", "win_rate", "accuracy", "confidence",
        "hit_rate", "expected_value", "success_rate",
    ):
        assert f'"{banned}"' not in body, banned
