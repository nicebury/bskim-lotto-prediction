"""Postgres 커넥션 풀.

백엔드는 `app_reader` 롤로만 접속한다. 쓰기는 코드 리뷰가 아니라 **권한**이 막는다
(docs/wiki/00-decisions/0003-worker-writes-backend-reads.md).

여기에 스키마 생성·마이그레이션 코드가 없는 것은 누락이 아니다. 스키마의 유일한
소유자는 워커이고, 이 프로세스는 테이블을 만들 권한조차 없다.
"""
from __future__ import annotations

import logging
from typing import Optional

from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from .config import settings

logger = logging.getLogger(__name__)

_pool: Optional[AsyncConnectionPool] = None


async def open_pool() -> None:
    """lifespan 시작 시 한 번 호출한다.

    풀을 열지 못하면 기동을 중단시킨다. DB 없이 뜬 서버는 모든 요청에서 500 을 내며
    헬스체크만 통과하는, 가장 알아채기 어려운 형태의 고장이 된다.
    """
    global _pool
    if _pool is not None:
        return

    # open() 이 실패하면 _pool 은 None 으로 남는다. 반쯤 열린 풀을 전역에 두지 않기 위해
    # 지역 변수로 만들어 성공한 뒤에만 대입한다.
    pool = AsyncConnectionPool(
        conninfo=settings.database_dsn,
        min_size=settings.DB_POOL_MIN_SIZE,
        max_size=settings.DB_POOL_MAX_SIZE,
        open=False,
        kwargs={
            "row_factory": dict_row,
            # 롤 권한 위에 한 겹 더 두르는 안전장치다. app_reader 가 어떤 이유로든
            # 쓰기 권한을 얻게 되더라도 이 세션에서는 INSERT/UPDATE 가 실패한다.
            # 권한 분리가 침해당한 상황에서도 데이터가 상하지 않게 한다.
            "options": "-c default_transaction_read_only=on",
        },
    )
    await pool.open(wait=True, timeout=10.0)
    try:
        await _assert_read_only_role(pool)
    except Exception:
        await pool.close()
        raise
    _pool = pool
    logger.info("Postgres 커넥션 풀을 열었습니다 (읽기 전용 세션)")


async def _assert_read_only_role(pool: AsyncConnectionPool) -> None:
    """접속한 롤이 쓰기 권한을 가졌으면 기동을 거부한다.

    `.env_backend` 에 실수로 `app_writer` 자격증명이 들어가도 서버는 잘 뜬다. 코드가
    쓰기를 시도하지 않으니 아무 증상이 없다. 그러나 그 순간 이 서비스의 유일하게
    **권한으로 강제되던** 경계가 사라진다 — 프로세스를 장악한 쪽은 쓸 수 있다
    (docs/wiki/00-decisions/0003-worker-writes-backend-reads.md).

    설정 파일을 눈으로 검사하는 대신, 붙어 보고 물어본다. 증상 없는 사고를
    기동 실패라는 시끄러운 사고로 바꾸는 것이다.

    비밀번호는 어디에도 찍지 않는다. 롤 이름만 로그에 남긴다.
    """
    async with pool.connection() as conn:
        cur = await conn.execute(
            """
            SELECT current_user AS role_name,
                   -- 테이블이 아직 없으면(워커의 마이그레이션 전) 판단을 보류한다.
                   CASE WHEN to_regclass('lotto_draw') IS NULL THEN NULL
                        ELSE has_table_privilege(current_user, 'lotto_draw', 'INSERT')
                   END AS can_insert
            """
        )
        row = await cur.fetchone()

    assert row is not None  # 위 SELECT 는 항상 한 행이다
    role_name, can_insert = row["role_name"], row["can_insert"]

    if can_insert:
        raise RuntimeError(
            f"'{role_name}' 롤은 lotto_draw 에 INSERT 할 수 있습니다. 백엔드는 읽기 전용 "
            "롤로만 접속해야 합니다. backend/.env_backend 의 PG_USER/PG_PASSWORD 를 "
            "app_reader 의 것으로 바꾸세요."
        )

    if can_insert is None:
        logger.warning(
            "lotto_draw 테이블이 없어 롤 권한을 확인하지 못했습니다 "
            "(워커의 마이그레이션 전). 접속 롤: %s",
            role_name,
        )
    else:
        logger.info("접속 롤 '%s' 의 쓰기 권한 없음을 확인했습니다", role_name)


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
        logger.info("Postgres 커넥션 풀을 닫았습니다")


def get_pool() -> AsyncConnectionPool:
    if _pool is None:
        raise RuntimeError("커넥션 풀이 아직 열리지 않았습니다. lifespan 을 확인하세요.")
    return _pool
