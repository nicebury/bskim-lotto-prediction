"""테스트 공통 설비.

이 저장소는 세 세션이 동시에 개발한다. 워커가 아직 마이그레이션을 돌리지 않았으면
`lotto_draw` 가 없고, 그때도 순수 로직 테스트는 통과해야 한다. DB 가 필요한 테스트는
스스로 skip 하고, 그 사실을 이유와 함께 알린다 — 조용히 통과하면 아무것도 검증하지
않은 채 초록불이 켜진다.
"""
from __future__ import annotations

import random
from typing import Optional

import psycopg
import pytest

from app.config import settings
from app.domain.draw import Draw


def _table_exists(table: str) -> Optional[str]:
    """테이블이 없거나 접속이 안 되면 skip 사유를, 있으면 None 을 돌려준다."""
    try:
        with psycopg.connect(settings.database_dsn, connect_timeout=3) as conn:
            row = conn.execute("SELECT to_regclass(%s)", (table,)).fetchone()
    except psycopg.Error as exc:
        return f"Postgres 에 접속할 수 없습니다: {exc.__class__.__name__}"
    if not row or row[0] is None:
        return f"{table} 테이블이 없습니다. 워커의 마이그레이션이 아직 돌지 않았습니다."
    return None


@pytest.fixture(scope="session")
def require_lotto_draw() -> None:
    reason = _table_exists("lotto_draw")
    if reason:
        pytest.skip(reason)


def make_draws(count: int, *, seed: int = 0) -> list[Draw]:
    """실데이터를 흉내 낸 회차 목록. round_no 오름차순, 번호는 오름차순 6개.

    무작위지만 seed 로 고정한다. 테스트가 실행할 때마다 다른 데이터를 보면, 실패했을 때
    코드가 틀린 것인지 그날의 데이터가 특이했던 것인지 알 수 없다.
    """
    rng = random.Random(seed)
    draws: list[Draw] = []
    for round_no in range(1, count + 1):
        nums = tuple(sorted(rng.sample(range(1, 46), 6)))
        bonus = rng.choice([n for n in range(1, 46) if n not in nums])
        draws.append(Draw(round_no=round_no, numbers=nums, bonus=bonus))  # type: ignore[arg-type]
    return draws
