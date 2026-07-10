"""백엔드가 정말로 DB 에 쓰지 못하는지 확인한다.

이 테스트가 통과해야 권한 분리가 의미를 갖는다. 규율은 6개월 뒤 "조회수를 기록하면
편할 텐데" 앞에서 협상 가능해지지만, `GRANT SELECT` 만 받은 롤은 협상하지 않는다
(docs/wiki/00-decisions/0003-worker-writes-backend-reads.md).

**이 테스트가 실패하면(=쓰기가 성공하면) 롤 설정이 잘못된 것이다.** 코드를 고치지 말고
`worker/scripts/init_roles.sql` 을 다시 돌린다.
"""
from __future__ import annotations

import psycopg
import pytest

from app.config import settings

pytestmark = pytest.mark.integration

# 실데이터를 건드리지 않는 값. 어차피 권한에서 막혀 실행조차 되지 않지만, 만에 하나
# 권한이 열려 있다면 롤백으로 되돌린다.
_PROBE_INSERT = """
INSERT INTO lotto_draw (round_no, draw_ymd, winning_no1, winning_no2, winning_no3,
                        winning_no4, winning_no5, winning_no6, bonus_no)
VALUES (99999, '2099-01-01', 1, 2, 3, 4, 5, 6, 7)
"""


def test_app_reader_는_lotto_draw_에_쓰지_못한다(require_lotto_draw: None):
    """기대하는 예외는 SQLSTATE 42501 — permission denied for table lotto_draw.

    커넥션을 앱의 풀이 아니라 여기서 직접 연다. 풀은 세션을 read-only 로 여는데,
    그러면 '읽기 전용 트랜잭션' 오류가 먼저 나서 정작 **롤 권한**을 검증하지 못한다.
    검증 대상은 애플리케이션의 설정이 아니라 Postgres 의 GRANT 다.
    """
    with psycopg.connect(settings.database_dsn, connect_timeout=5) as conn:
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            with conn.cursor() as cur:
                cur.execute(_PROBE_INSERT)
        conn.rollback()


def test_app_reader_는_테이블을_만들지_못한다(require_lotto_draw: None):
    """스키마 마이그레이션은 워커의 일이다. 백엔드는 DDL 권한이 없어야 한다."""
    with psycopg.connect(settings.database_dsn, connect_timeout=5) as conn:
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            with conn.cursor() as cur:
                cur.execute("CREATE TABLE backend_should_not_exist (id int)")
        conn.rollback()


def test_app_reader_는_읽을_수_있다(require_lotto_draw: None):
    """쓰기가 막혔다는 것만으로는 부족하다. 읽기까지 막혔으면 그것도 잘못된 설정이다."""
    with psycopg.connect(settings.database_dsn, connect_timeout=5) as conn:
        row = conn.execute("SELECT count(*) FROM lotto_draw").fetchone()
    assert row is not None
