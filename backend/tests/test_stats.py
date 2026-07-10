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
