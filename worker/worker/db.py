"""Postgres 접속 헬퍼.

워커는 app_writer 롤로만 붙는다. 백엔드의 app_reader 를 쓰지 않는다 —
읽기만 하는 조회라도 마찬가지다. 롤이 섞이면 권한 분리가 코드 리뷰의 문제가 된다.

커넥션 풀을 두지 않는다. 워커의 DB 접근은 잡 실행(주 1회 / 일 3회)과 상태 조회뿐이라
동시 커넥션이 사실상 한둘이다. 풀은 psycopg_pool 이라는 의존성을 하나 더 부르고,
유휴 커넥션이 죽었을 때의 복구 로직을 떠안는다. 필요해지면 그때 넣는다.
"""
from __future__ import annotations

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

import psycopg
from psycopg.rows import dict_row

from .config import settings


@asynccontextmanager
async def connect() -> AsyncGenerator[psycopg.AsyncConnection]:
    """자동 커밋 커넥션을 연다.

    autocommit=True 를 쓰는 이유: 잡 하나가 여러 회차를 순차로 넣는데, 중간에
    실패해도 그때까지 수집한 회차는 남기고 싶다. 전체를 한 트랜잭션으로 묶으면
    12회차를 모으다 13번째에서 죽었을 때 12건이 통째로 사라진다. 각 INSERT 가
    독립적으로 커밋되어야 다음 실행이 그 다음 회차부터 이어받는다.

    row_factory=dict_row: 컬럼을 인덱스가 아니라 이름으로 읽는다. 컬럼 순서에
    의존하는 코드는 마이그레이션 한 번에 조용히 틀린 값을 읽기 시작한다.
    """
    conn = await psycopg.AsyncConnection.connect(
        settings.conninfo,
        autocommit=True,
        row_factory=dict_row,
    )
    try:
        yield conn
    finally:
        await conn.close()


async def ping() -> None:
    """기동 시 접속을 확인한다.

    실패하면 예외를 그대로 올려 워커를 죽인다. 접속이 안 되는 채로 뜨면
    첫 크론 시각(토요일 21시)에야 실패를 알게 된다 — 그때는 회차를 놓친 뒤다.
    """
    async with connect() as conn:
        await conn.execute("SELECT 1")
