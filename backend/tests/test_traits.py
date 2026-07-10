"""조합 성향 계산. 손으로 셀 수 있는 값만 검증한다 — 그게 traits 의 존재 이유다."""
from __future__ import annotations

import pytest

from app.domain import traits


def test_계약_예시_회차의_성향():
    # api-contract.md 의 1231회차 예시. 5+11+18+27+33+42 = 136
    result = traits.compute([5, 11, 18, 27, 33, 42])

    assert result["sum"] == 136
    assert result["odd_even"] == "4:2"          # 5, 11, 27, 33
    assert result["high_low"] == "3:3"          # 27, 33, 42 가 23 이상
    assert result["range_distribution"] == {"1-15": 2, "16-30": 2, "31-45": 2}
    assert result["has_consecutive"] is False
    assert result["tail_variety"] == 6          # 끝자리 5,1,8,7,3,2 — 겹치는 것이 없다


def test_연속번호_감지():
    assert traits.compute([1, 2, 10, 20, 30, 40])["has_consecutive"] is True
    assert traits.compute([1, 3, 10, 20, 30, 40])["has_consecutive"] is False


def test_고저_경계는_23():
    # 22 는 저, 23 은 고. 이 경계가 흔들리면 예측 모듈과 통계가 다른 답을 낸다.
    assert traits.compute([1, 2, 3, 4, 5, 22])["high_low"] == "0:6"
    assert traits.compute([1, 2, 3, 4, 5, 23])["high_low"] == "1:5"


def test_입력_순서가_결과를_바꾸지_않는다():
    assert traits.compute([42, 5, 33, 11, 27, 18]) == traits.compute([5, 11, 18, 27, 33, 42])


def test_hot_cold_는_기본적으로_없다():
    """회차 상세와 꿈해몽은 기준 시점을 밝힐 수 없으므로 두 키가 아예 없어야 한다."""
    result = traits.compute([5, 11, 18, 27, 33, 42])
    assert "hot_count" not in result
    assert "cold_count" not in result


def test_hot_cold_를_셀_수_없으면_null_이지_누락이_아니다():
    result = traits.compute_with_hot_cold([5, 11, 18, 27, 33, 42], None, None)
    assert result["hot_count"] is None
    assert result["cold_count"] is None


def test_hot_cold_카운트():
    result = traits.compute_with_hot_cold(
        [5, 11, 18, 27, 33, 42], hot={5, 27, 44}, cold={18}
    )
    assert result["hot_count"] == 2
    assert result["cold_count"] == 1


def test_여섯개가_아니면_거부한다():
    with pytest.raises(ValueError):
        traits.compute([1, 2, 3])
