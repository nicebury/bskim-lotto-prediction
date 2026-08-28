"""003 통계 개편 — 기간 조회 · top · 번호 통계 · 패턴 추가 필드.

DB 를 쓰지 않는다. 계약이 정한 **규칙**을 검증하는 곳이고, 규칙은 데이터가 무엇이든
성립해야 한다 (docs/wiki/10-contracts/api-contract.md 의 '기간 조회' 이하).
"""
from __future__ import annotations

import pytest

from app.domain import stats

from .conftest import FIRST_DRAW_DATE, make_draws


# ── 기간 조회 ────────────────────────────────────────────────────────────


def test_window_조회는_구간_메타를_함께_준다():
    draws = make_draws(100)
    selected, meta = stats.select_range(draws, window="20")

    assert len(selected) == 20
    assert meta["window"] == 20
    assert meta["rounds_analyzed"] == 20
    # 최근 20회 = 81~100회차
    assert (meta["from_round"], meta["to_round"]) == (81, 100)
    assert meta["from_date"] == FIRST_DRAW_DATE.__class__.fromordinal(
        (FIRST_DRAW_DATE.toordinal() + 7 * 80)
    )
    assert meta["to_date"] > meta["from_date"]


def test_window_all_은_전체이고_echo_도_문자열이다():
    draws = make_draws(30)
    selected, meta = stats.select_range(draws, window="all")
    assert len(selected) == 30
    assert meta["window"] == "all"
    assert (meta["from_round"], meta["to_round"]) == (1, 30)


def test_기간을_주면_window_는_무시되고_null_이_된다():
    draws = make_draws(100)
    selected, meta = stats.select_range(draws, window="20", from_round=10, to_round=19)

    assert [d.round_no for d in selected] == list(range(10, 20))
    # window=20 을 함께 보냈지만 기간이 이긴다. 그리고 응답에는 null 이 나가야 한다 —
    # 20 을 되돌려 주면 화면이 "최근 20회" 라고 잘못 쓴다.
    assert meta["window"] is None
    assert (meta["from_round"], meta["to_round"]) == (10, 19)
    assert meta["rounds_analyzed"] == 10


@pytest.mark.parametrize(
    "from_round, to_round",
    [(10, None), (None, 10)],
    ids=["from_만", "to_만"],
)
def test_한쪽만_주면_거부한다(from_round, to_round):
    """한쪽만 받아 나머지를 알아서 채우면 사용자가 무엇을 보는지 화면과 어긋난다."""
    with pytest.raises(stats.InvalidRangeError):
        stats.select_range(
            make_draws(50), window="20", from_round=from_round, to_round=to_round
        )


def test_역순_구간은_조용히_뒤집지_않고_거부한다():
    with pytest.raises(stats.InvalidRangeError):
        stats.select_range(make_draws(50), window="20", from_round=40, to_round=10)


def test_데이터_밖_범위는_에러가_아니라_교집합으로_자른다():
    draws = make_draws(50)
    selected, meta = stats.select_range(draws, window="20", from_round=1, to_round=9999)

    assert meta["rounds_analyzed"] == 50
    # 응답의 to_round 는 요청한 9999 가 아니라 **실제로 집계에 쓰인** 50 이다.
    assert meta["to_round"] == 50
    assert meta["from_round"] == 1


def test_교집합이_비면_0건과_null_메타를_준다():
    draws = make_draws(50)
    selected, meta = stats.select_range(
        draws, window="20", from_round=9000, to_round=9999
    )

    assert list(selected) == []
    assert meta["rounds_analyzed"] == 0
    # 없는 구간을 물어본 것은 오류가 아니라 사실 조회다. 200 으로 나가되 메타는 전부 null.
    assert meta["from_round"] is None and meta["to_round"] is None
    assert meta["from_date"] is None and meta["to_date"] is None


def test_빈_구간에도_빈도는_1_45_키를_모두_유지한다():
    """`counts` 의 '1~45 전부 존재' 는 데이터 유무와 무관한 불변식이다."""
    counts = stats.frequency([], include_bonus=False)
    assert len(counts) == 45
    assert set(counts.values()) == {0}


# ── hot-cold 의 top ──────────────────────────────────────────────────────


@pytest.mark.parametrize("top", [1, 10, 15, 45])
def test_top_이_세_배열의_길이를_정한다(top):
    draws = make_draws(60)
    result = stats.hot_cold(draws, stats.slice_window(draws, 20), top=top)
    assert len(result["hot"]) == top
    assert len(result["cold"]) == top
    assert len(result["overdue"]) == top


def test_top_45_면_hot_과_cold_가_같은_45개다():
    """계약이 명시한 정상 동작이다 — 같은 집합을 정반대 기준으로 정렬한 목록."""
    draws = make_draws(60)
    result = stats.hot_cold(draws, stats.slice_window(draws, 20), top=45)
    assert {i["number"] for i in result["hot"]} == set(range(1, 46))
    assert {i["number"] for i in result["cold"]} == set(range(1, 46))
    # 가장 많이 나온 번호의 횟수 >= 가장 적게 나온 번호의 횟수
    assert result["hot"][0]["count"] >= result["cold"][0]["count"]


def test_추천의_hot_cold_기준은_top_에_흔들리지_않는다():
    """사용자가 top=40 으로 본다고 추천의 hot_count 정의가 따라 바뀌면 안 된다."""
    draws = make_draws(60)
    hot, cold = stats.hot_cold_sets(draws, 20)
    assert len(hot) == stats.TOP_N
    assert len(cold) == stats.TOP_N


def test_기간으로_고른_구간에도_hot_cold_가_계산된다():
    draws = make_draws(100)
    selected, meta = stats.select_range(draws, window="20", from_round=1, to_round=10)
    result = stats.hot_cold(draws, selected, top=10)

    assert result["rounds_analyzed"] == 10
    # hot 의 count 합은 6 × 회차수다. 구간이 제대로 반영됐다는 뜻.
    assert sum(stats.frequency(selected, include_bonus=False).values()) == 60


def test_overdue_는_구간이_아니라_역대_전체로_계산한다():
    """구간 안에서만 세면 30회 전과 300회 전이 똑같은 값으로 뭉개진다."""
    draws = make_draws(200)
    narrow = stats.hot_cold(draws, stats.slice_window(draws, 5), top=10)
    wide = stats.hot_cold(draws, draws, top=10)
    # 구간이 달라도 overdue 는 같은 역대 데이터에서 나오므로 동일하다.
    assert narrow["overdue"] == wide["overdue"]


# ── 패턴 추가 필드 ───────────────────────────────────────────────────────


def test_합계_히스토그램은_회차수이고_전부_더하면_분석회차와_같다():
    draws = make_draws(200)
    result = stats.pattern(draws)
    hist = result["sum_histogram"]

    assert sum(hist.values()) == result["rounds_analyzed"]
    # 키는 "100-109" 형식이고 오름차순이다.
    lows = [int(k.split("-")[0]) for k in hist]
    assert lows == sorted(lows)
    assert all(int(k.split("-")[1]) - int(k.split("-")[0]) == 9 for k in hist)


def test_연속쌍_분포는_consecutive_ratio_와_맞아떨어진다():
    """어긋나면 백엔드 버그다 — 계약이 이 불변식을 명시했다."""
    draws = make_draws(300)
    result = stats.pattern(draws)
    zero = result["consecutive_counts"].get("0", 0.0)
    assert abs((1 - zero) - result["consecutive_ratio"]) < 1e-4


def test_연속쌍_개수를_쌍_단위로_센다():
    """[1,2,3] 은 (1,2)·(2,3) 두 쌍이다. '연속이 있다/없다' 가 아니다."""
    from app.domain.draw import Draw

    draws = [Draw(round_no=1, numbers=(1, 2, 3, 10, 20, 30), bonus=45)]
    assert stats.pattern(draws)["consecutive_counts"] == {"2": 1.0}


def test_회차가_없으면_새_필드도_비어_있다():
    result = stats.pattern([])
    assert result["sum_histogram"] == {}
    assert result["consecutive_counts"] == {}


# ── 번호 하나의 통계 ─────────────────────────────────────────────────────


def test_순위는_hot_정렬과_같은_규칙을_쓴다():
    """두 화면의 순위가 어긋나면 사용자는 어느 쪽도 믿지 않는다."""
    draws = make_draws(120)
    selected = stats.slice_window(draws, 50)
    hot = stats.hot_cold(draws, selected, top=45)["hot"]

    for expected_rank, item in enumerate(hot, start=1):
        result = stats.number_stats(draws, selected, item["number"])
        assert result["rank"] == expected_rank
        assert result["count"] == item["count"]
        assert result["rank_total"] == 45


def test_구간이_비면_순위는_null_이다():
    """모든 횟수가 0 이면 정렬은 번호순이 된다. 그것을 순위라 부르면 거짓이다."""
    draws = make_draws(50)
    result = stats.number_stats(draws, [], 15)
    assert result["rank"] is None
    assert result["count"] == 0
    assert result["appearance_rate"] == 0.0
    assert result["rank_total"] == 45


def test_구간이_비어도_역대_기준_값은_살아_있다():
    """구간에 데이터가 없다는 것과 그 번호의 역사가 없다는 것은 다른 말이다."""
    draws = make_draws(200)
    result = stats.number_stats(draws, [], 15)
    assert result["last_seen_round"] is not None
    assert result["max_gap"] is not None


def test_최장_미출현_간격은_역대_전체에서_나온다():
    from app.domain.draw import Draw

    # 7번이 1회차와 10회차에만 나온다 → 간격 9, 이후 20회차까지 미출현 10.
    draws = [
        Draw(round_no=r, numbers=(7, 11, 12, 13, 14, 15) if r in (1, 10)
             else (1, 2, 3, 4, 5, 6), bonus=45)
        for r in range(1, 21)
    ]
    result = stats.number_stats(draws, draws, 7)
    assert result["last_seen_round"] == 10
    assert result["rounds_since"] == 10
    # 진행 중인 미출현 구간(10)도 후보에 넣는다. 지금이 역대 최장이면 그것이 최장이다.
    assert result["max_gap"] == 10


def test_역대로_없는_번호는_최장간격이_null_이다():
    from app.domain.draw import Draw

    draws = [Draw(round_no=r, numbers=(1, 2, 3, 4, 5, 6), bonus=45) for r in range(1, 11)]
    result = stats.number_stats(draws, draws, 45)
    assert result["max_gap"] is None
    assert result["last_seen_round"] is None


def test_함께_나온_번호는_pairs_와_같은_집계다():
    """화면이 한 번 더 왕복하지 않게 담는 값이라, 따로 세면 안 된다."""
    draws = make_draws(150)
    selected = stats.slice_window(draws, 100)
    result = stats.number_stats(draws, selected, 7)
    expected = stats.pairs(selected, number=7, top=stats.COMPANIONS_TOP)["pairs"]

    assert len(result["companions"]) <= stats.COMPANIONS_TOP
    assert [c["count"] for c in result["companions"]] == [p["count"] for p in expected]
    # 상대 번호는 요청한 번호가 아닌 쪽이다.
    assert all(c["number"] != 7 for c in result["companions"])


def test_출현_회차는_최신순이고_그_번호가_실제로_든_회차뿐이다():
    draws = make_draws(300)
    selected = stats.slice_window(draws, 200)
    result = stats.number_stats(draws, selected, 7)
    recent = result["recent_appearances"]

    assert len(recent) <= stats.RECENT_APPEARANCES_LIMIT
    assert [r["round_no"] for r in recent] == sorted(
        (r["round_no"] for r in recent), reverse=True
    )
    by_round = {d.round_no: d for d in selected}
    assert all(7 in by_round[r["round_no"]].numbers for r in recent)
    assert all(r["draw_date"] is not None for r in recent)


def test_출현_횟수와_출현_회차_수가_어긋나지_않는다():
    """20개 상한에 걸리지 않는 범위에서는 둘이 같아야 한다."""
    draws = make_draws(60)
    selected = stats.slice_window(draws, 60)
    result = stats.number_stats(draws, selected, 7)
    if result["count"] <= stats.RECENT_APPEARANCES_LIMIT:
        assert len(result["recent_appearances"]) == result["count"]
