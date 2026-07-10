"""회차 데이터의 내부 표현.

리포지토리가 돌려주는 dict 를 라우터·통계·예측이 그대로 들고 다니면, DB 컬럼명
(`winning_no1`) 이 코드 구석구석에 스며든다. 컬럼 하나를 바꾸면 전부 고쳐야 한다.
경계에서 한 번만 이 타입으로 바꾸고, 안쪽은 컬럼명을 모른다.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Draw:
    """한 회차의 당첨번호. `numbers` 는 항상 오름차순 6개다.

    오름차순은 관례가 아니라 `ck_lotto_draw_ascending` CHECK 제약이 보장하는 불변식이다
    (docs/wiki/10-contracts/db-schema.md). 따라서 이 안에서 다시 정렬하지 않는다.
    """

    round_no: int
    numbers: tuple[int, int, int, int, int, int]
    bonus: int
