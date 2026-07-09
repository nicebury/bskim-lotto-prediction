"""Alembic 실행 환경.

접속정보를 alembic.ini 가 아니라 여기서 settings 로 주입한다.
ini 에 sqlalchemy.url 을 적으면 app_writer 비밀번호가 git 에 남는다.

target_metadata 를 두지 않는 이유:
워커는 SQLAlchemy ORM 모델을 정의하지 않는다. 스키마의 정본은
worker/scripts/ddl/001_initial_schema.sql 이고 마이그레이션은 그 DDL 을 그대로
옮겨 적는다. 모델을 따로 두면 정본이 둘이 되고, 둘이 어긋나는 날 db-schema 계약이
깨진다. 따라서 `--autogenerate` 는 쓰지 않고 수동 리비전만 작성한다.
"""
from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine, pool
from sqlalchemy.engine import URL

from worker.config import settings

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# URL 을 문자열로 조립하지 않는다. 비밀번호에 @ / : / ? 가 섞이면 URL 파싱이
# 어긋나 엉뚱한 호스트로 붙거나 인증에 실패한다. URL.create 가 이스케이프한다.
_url = URL.create(
    drivername="postgresql+psycopg",  # psycopg v3 드라이버
    username=settings.PG_USER,
    password=settings.PG_PASSWORD,
    host=settings.PG_HOST,
    port=settings.PG_PORT,
    database=settings.PG_DB,
)

# ★ config.set_main_option("sqlalchemy.url", ...) 을 쓰지 않는다.
#
# 두 가지가 동시에 잘못된다.
#   1) alembic.ini 는 ConfigParser 라 값에 든 `%` 를 보간 문법으로 해석한다.
#      URL.create 는 비밀번호의 특수문자를 퍼센트 인코딩하므로(! → %21),
#      비번에 특수문자가 있으면 "invalid interpolation syntax" 로 죽는다.
#   2) 더 나쁜 것은 그 ValueError 메시지가 **URL 전체를 평문으로 출력**한다는 점이다.
#      비밀번호가 터미널과 CI 로그에 그대로 남는다. 실제로 겪었다.
#
# 그래서 ini 를 거치지 않고 엔진을 직접 만든다. URL 객체는 문자열로 렌더링하지
# 않는 한 비번을 노출하지 않으며, repr 은 기본이 `***` 로 가려진다.
target_metadata = None


def run_migrations_offline() -> None:
    """DB 접속 없이 SQL 을 출력한다 (`alembic upgrade head --sql`).

    운영 배포 전에 어떤 DDL 이 나갈지 사람이 눈으로 확인할 때 쓴다.
    URL 을 넘기지 않고 dialect 이름만 넘긴다 — 비번을 문자열로 만들 이유가 없다.
    """
    context.configure(
        dialect_name="postgresql",
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """실제 DB 에 적용한다. app_writer 롤로 붙는다.

    NullPool 을 쓰는 이유: 마이그레이션은 한 번 붙어 끝내는 단발성 작업이다.
    풀을 두면 스크립트가 끝나도 커넥션이 남아 프로세스가 바로 종료되지 않는다.
    """
    connectable = create_engine(_url, poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
