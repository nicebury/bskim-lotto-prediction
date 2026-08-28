"""회차 데이터의 내부 표현.

리포지토리가 돌려주는 dict 를 라우터·통계·예측이 그대로 들고 다니면, DB 컬럼명
(`winning_no1`) 이 코드 구석구석에 스며든다. 컬럼 하나를 바꾸면 전부 고쳐야 한다.
경계에서 한 번만 이 타입으로 바꾸고, 안쪽은 컬럼명을 모른다.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Optional


@dataclass(frozen=True, slots=True)
class Draw:
    """한 회차의 당첨번호. `numbers` 는 항상 오름차순 6개다.

    오름차순은 관례가 아니라 `ck_lotto_draw_ascending` CHECK 제약이 보장하는 불변식이다
    (docs/wiki/10-contracts/db-schema.md). 따라서 이 안에서 다시 정렬하지 않는다.
    """

    round_no: int
    numbers: tuple[int, int, int, int, int, int]
    bonus: int
    # 통계 응답의 구간 메타(`from_date`/`to_date`)와 번호 통계의 `recent_appearances` 가
    # 이 값을 쓴다. 화면이 "1213~1232회 (2026.02.28~2026.07.11)" 을 그리려면 회차→날짜를
    # 따로 왕복하지 않아야 한다 (docs/wiki/10-contracts/api-contract.md).
    #
    # 기본값을 둔 이유: 예측 모듈은 추첨일을 쓰지 않으므로 날짜 없이 만든 Draw 도
    # 유효해야 한다. 날짜가 없으면 구간 메타의 날짜가 null 이 될 뿐 집계는 정상이다.
    draw_date: Optional[date] = None
