"""collect_job_log 상세화 — stat_json · log_list

Revision ID: 0003
Revises: 0002
Create Date: 2026-08-28

worker/scripts/ddl/003_job_log_detail.sql 을 그대로 옮겨 적은 것이다.
두 곳이 어긋나면 db-schema 계약이 깨진다.

기존 행에는 두 컬럼이 NULL 로 남는다. 조회하는 쪽이 NULL 을 정상으로 다뤄야
한다 — 이 마이그레이션 이전에 실행된 잡은 상세를 남길 방법이 없었다.

계약: docs/wiki/10-contracts/db-schema.md
"""
from __future__ import annotations

from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.execute("ALTER TABLE collect_job_log ADD COLUMN IF NOT EXISTS stat_json jsonb")
    op.execute("ALTER TABLE collect_job_log ADD COLUMN IF NOT EXISTS log_list  jsonb")
    op.execute("COMMENT ON COLUMN collect_job_log.stat_json IS '단계별 통과 건수(잡마다 키가 다르다. 예: fetched/on_topic/stored)'")
    op.execute("COMMENT ON COLUMN collect_job_log.log_list  IS '그 실행의 WARNING 이상 메시지 전문 배열. error_desc 는 잡을 죽인 마지막 예외 하나뿐이라 죽지 않고 넘어간 문제가 안 남는다'")
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_collect_job_log_started
            ON collect_job_log (started_dttm DESC)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_collect_job_log_failed
            ON collect_job_log (started_dttm DESC)
            WHERE status_cd = 'failed'
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_collect_job_log_failed")
    op.execute("DROP INDEX IF EXISTS ix_collect_job_log_started")
    op.execute("ALTER TABLE collect_job_log DROP COLUMN IF EXISTS log_list")
    op.execute("ALTER TABLE collect_job_log DROP COLUMN IF EXISTS stat_json")
