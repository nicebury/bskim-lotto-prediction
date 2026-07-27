"""공개 통계. 사용자가 손으로 셀 수 있는 값을 우리도 그렇게 센다."""
from __future__ import annotations

from app.domain import stats
from app.domain.draw import Draw
from tests.conftest import make_draws


def _draws(*rows: tuple[int, tuple[int, ...], int]) -> list[Draw]:
    return [Draw(round_no=r, numbers=n, bonus=b) for r, n, b in rows]  # type: ignore[arg-type]


def test_빈도는_1부터_45까지_모든_키를_갖는다():
    counts = stats.frequency(make_draws(10), include_bonus=False)
    assert len(counts) == 45
    assert counts.keys() == {str(n) for n in range(1, 46)}


def test_빈도_합계는_회차수_곱하기_6():
    draws = make_draws(30)
    counts = stats.frequency(draws, include_bonus=False)
    assert sum(counts.values()) == 30 * 6

    # 보너스를 포함하면 회차마다 정확히 하나씩 늘어난다. ×0.3 가중은 예측 모듈의
    # 내부 사정이지 공개 통계의 규칙이 아니다.
    with_bonus = stats.frequency(draws, include_bonus=True)
    assert sum(with_bonus.values()) == 30 * 7


def test_window_는_최근_회차를_자른다():
    draws = make_draws(100)
    assert [d.round_no for d in stats.slice_window(draws, 3)] == [98, 99, 100]
    # 데이터보다 큰 window 는 있는 만큼만. 오류가 아니다.
    assert len(stats.slice_window(draws, 500)) == 100
    assert len(stats.slice_window(draws, None)) == 100


def test_overdue_는_window_가_아니라_역대_전체에서_계산한다():
    """window 를 바꿔도 overdue 는 그대로여야 한다.

    최근 20회차만 보고 계산하면 30회 전에 나온 번호와 300회 전에 나온 번호가 똑같이
    "20" 이 되어 정보가 사라진다. hot/cold 만 window 를 탄다.
    """
    draws = make_draws(120)
    narrow = stats.hot_cold(draws, window=5)
    wide = stats.hot_cold(draws, window=None)

    assert narrow["rounds_analyzed"] == 5
    assert wide["rounds_analyzed"] == 120
    assert narrow["overdue"] == wide["overdue"]
    # hot 은 반대로 window 에 따라 달라진다 — 그러라고 있는 파라미터다.
    assert narrow["hot"] != wide["hot"]


def test_지연_회차수는_최신_회차_기준이다():
    draws = _draws(
        (1, (1, 2, 3, 4, 5, 6), 45),
        (2, (10, 11, 12, 13, 14, 15), 45),
        (3, (20, 21, 22, 23, 24, 25), 45),
        (4, (30, 31, 32, 33, 34, 35), 45),
    )
    since = stats._rounds_since(draws)

    assert since[3] == 3    # 1회차에 나왔고 최신은 4회차
    assert since[30] == 0   # 최신 회차에 나왔다
    # 역대 한 번도 안 나온 번호는 전체 회차 수. 0 으로 두면 "방금 나왔다" 가 된다.
    assert since[44] == 4


def test_최신_회차에_나온_번호의_rounds_since_는_0():
    draws = _draws(
        (1, (1, 2, 3, 4, 5, 6), 45),
        (2, (10, 11, 12, 13, 14, 15), 45),
    )
    result = stats.hot_cold(draws, window=None)
    overdue = {item["number"]: item["rounds_since"] for item in result["overdue"]}
    assert overdue.get(10, 0) == 0 or 10 not in overdue  # 상위 10개에 들지 못할 수도 있다

    since = stats._rounds_since(draws)
    assert since[10] == 0
    assert since[1] == 1


def test_동점이면_번호가_작은_쪽이_먼저():
    """정렬이 불안정하면 같은 요청이 다른 순서를 내고 사용자는 데이터가 바뀐 줄 안다."""
    draws = _draws((1, (1, 2, 3, 4, 5, 6), 45))
    result = stats.hot_cold(draws, window=None)
    assert [item["number"] for item in result["hot"][:6]] == [1, 2, 3, 4, 5, 6]


def test_hot_cold_집합은_hot_cold_응답과_같은_번호를_준다():
    """추천의 hot_count 와 통계 화면의 HOT 목록이 어긋나면 둘 다 신뢰를 잃는다."""
    draws = make_draws(60)
    response = stats.hot_cold(draws, 20)
    hot, cold = stats.hot_cold_sets(draws, 20)

    assert hot == {item["number"] for item in response["hot"]}
    assert cold == {item["number"] for item in response["cold"]}


def test_패턴_비율의_합은_1():
    draws = make_draws(100)
    result = stats.pattern(draws)
    assert abs(sum(result["odd_even"].values()) - 1.0) < 0.01
    assert abs(sum(result["high_low"].values()) - 1.0) < 0.01
    assert result["rounds_analyzed"] == 100


def test_회차가_없어도_패턴이_터지지_않는다():
    """워커가 아직 데이터를 채우지 않은 상태는 오류가 아니다."""
    result = stats.pattern([])
    assert result["rounds_analyzed"] == 0
    assert result["odd_even"] == {}
    assert result["sum_range"] == {"min": 0, "max": 0, "peak": 0}


def test_window_문자열_해석():
    assert stats.resolve_window("all") is None
    assert stats.resolve_window("20") == 20


# ── 002 개편: hot-cold 의 새 필드 ────────────────────────────────────────


def test_appearance_rate_는_출현_비율이다():
    """count / rounds_analyzed. 확률이 아니라 지난 N회 중 나온 비율이다."""
    draws = _draws(
        (1, (1, 2, 3, 4, 5, 6), 45),
        (2, (1, 2, 3, 10, 11, 12), 45),
        (3, (1, 20, 21, 22, 23, 24), 45),
        (4, (30, 31, 32, 33, 34, 35), 45),
    )
    result = stats.hot_cold(draws, window=None)
    hot = {item["number"]: item for item in result["hot"]}
    # 1번은 4회 중 3회 나왔다 → 0.75
    assert hot[1]["appearance_rate"] == 0.75
    assert hot[1]["count"] == 3


def test_appearance_rate_는_회차가_없으면_0():
    result = stats.hot_cold([], window=20)
    assert all(item["appearance_rate"] == 0.0 for item in result["hot"])


def test_last_seen_round_는_마지막_출현_회차_번호다():
    draws = _draws(
        (100, (1, 2, 3, 4, 5, 6), 45),
        (101, (1, 10, 11, 12, 13, 14), 45),
        (102, (20, 21, 22, 23, 24, 25), 45),
    )
    result = stats.hot_cold(draws, window=None)
    seen = {item["number"]: item["last_seen_round"] for item in result["hot"] + result["cold"]}
    assert seen[1] == 101   # 1번은 101회에 마지막
    assert seen[2] == 100   # 2번은 100회에만

    # 역대 한 번도 안 나온 번호는 null. hot/cold TOP-10 에 안 들 수 있어 헬퍼를 직접 본다.
    last_seen = stats._last_seen_round(draws)
    assert last_seen[45] is None
    assert last_seen[1] == 101


def test_last_seen_round_는_회차번호이지_인덱스가_아니다():
    """회차가 1부터 시작하지 않아도 절대 회차 번호를 그대로 준다."""
    draws = _draws((500, (7, 8, 9, 10, 11, 12), 45))
    result = stats.hot_cold(draws, window=None)
    seen = {item["number"]: item["last_seen_round"] for item in result["hot"]}
    assert seen[7] == 500


def test_trend_최근_절반이_많으면_up():
    # 6회차 중 앞 3회엔 없고 뒤 3회에 나온 번호 → up
    draws = _draws(
        (1, (10, 11, 12, 13, 14, 15), 45),
        (2, (10, 11, 12, 13, 14, 15), 45),
        (3, (10, 11, 12, 13, 14, 15), 45),
        (4, (1, 20, 21, 22, 23, 24), 45),
        (5, (1, 30, 31, 32, 33, 34), 45),
        (6, (1, 35, 36, 37, 38, 39), 45),
    )
    result = stats.hot_cold(draws, window=None)
    trend = {item["number"]: item["trend"] for item in result["hot"] + result["cold"]}
    assert trend[1] == "up"     # 뒤 3회에만
    assert trend[10] == "down"  # 앞 3회에만


def test_trend_홀수_window_는_가운데를_최근쪽에():
    # 5회차: 이전 절반 2개(회차1,2), 최근 절반 3개(회차3,4,5)
    draws = _draws(
        (1, (1, 2, 3, 4, 5, 6), 45),
        (2, (7, 8, 9, 10, 11, 12), 45),
        (3, (1, 13, 14, 15, 16, 17), 45),
        (4, (18, 19, 20, 21, 22, 23), 45),
        (5, (24, 25, 26, 27, 28, 29), 45),
    )
    # 1번: 이전 절반(1,2) 1회, 최근 절반(3,4,5) 1회 → flat (가운데 회차3 이 최근 쪽)
    t = stats._trend(draws, 1)
    assert t == "flat"


def test_trend_회차가_2개_미만이면_flat():
    assert stats._trend(_draws((1, (1, 2, 3, 4, 5, 6), 45)), 1) == "flat"
    assert stats._trend([], 1) == "flat"


def test_overdue_에_last_seen_round_가_붙는다():
    draws = make_draws(60)
    result = stats.hot_cold(draws, window=20)
    for item in result["overdue"]:
        assert "last_seen_round" in item
        # rounds_since 와 last_seen_round 는 같은 출처라 정합해야 한다
        latest = draws[-1].round_no
        if item["last_seen_round"] is not None:
            assert latest - item["last_seen_round"] == item["rounds_since"]


def test_hot_cold_sets_는_새_필드_추가_후에도_동작한다():
    """추천의 hot_count 가 쓰는 집합 추출이 항목 구조 변화에 깨지지 않아야 한다."""
    draws = make_draws(60)
    hot, cold = stats.hot_cold_sets(draws, 20)
    assert len(hot) == stats.TOP_N and len(cold) == stats.TOP_N


# ── 002 개편: 동반 출현 (pairs) ──────────────────────────────────────────


def test_pairs_는_함께_나온_횟수를_센다():
    draws = _draws(
        (1, (1, 2, 3, 10, 11, 12), 45),
        (2, (1, 2, 20, 21, 22, 23), 45),
        (3, (1, 2, 30, 31, 32, 33), 45),
    )
    result = stats.pairs(draws)
    top = result["pairs"][0]
    assert top["numbers"] == [1, 2]  # 세 회차 모두 함께 나왔다
    assert top["count"] == 3
    assert result["number"] is None


def test_pairs_각_회차는_15개_쌍을_만든다():
    # 6개 번호 한 회차 → 6C2 = 15 쌍, 각 count 1
    draws = _draws((1, (1, 2, 3, 4, 5, 6), 45))
    result = stats.pairs(draws, top=45)
    assert len(result["pairs"]) == 15
    assert all(p["count"] == 1 for p in result["pairs"])
    # 항상 오름차순
    assert all(p["numbers"] == sorted(p["numbers"]) for p in result["pairs"])


def test_pairs_number_를_주면_그_번호가_든_쌍만():
    draws = _draws(
        (1, (1, 2, 3, 4, 5, 6), 45),
        (2, (1, 7, 8, 9, 10, 11), 45),
        (3, (20, 21, 22, 23, 24, 25), 45),  # 1번 없음
    )
    result = stats.pairs(draws, number=1)
    assert result["number"] == 1
    # 1번이 든 쌍만, 그리고 여전히 오름차순
    assert all(1 in p["numbers"] for p in result["pairs"])
    assert all(p["numbers"] == sorted(p["numbers"]) for p in result["pairs"])


def test_pairs_top_으로_개수를_자른다():
    draws = _draws((1, (1, 2, 3, 4, 5, 6), 45))
    assert len(stats.pairs(draws, top=5)["pairs"]) == 5


def test_pairs_동점이면_작은_쌍이_먼저():
    draws = _draws((1, (1, 2, 3, 4, 5, 6), 45))
    pairs_list = stats.pairs(draws, top=45)["pairs"]
    # 전부 count 1 이므로 쌍 자체의 오름차순 정렬이 순서를 정한다
    tuples = [tuple(p["numbers"]) for p in pairs_list]
    assert tuples == sorted(tuples)


def test_pairs_빈_입력():
    result = stats.pairs([], top=10)
    assert result["rounds_analyzed"] == 0
    assert result["pairs"] == []
