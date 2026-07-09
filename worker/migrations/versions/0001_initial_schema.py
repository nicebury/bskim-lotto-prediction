"""초기 스키마 — lotto_draw · lotto_prize · lotto_news · collect_job_log

Revision ID: 0001
Revises:
Create Date: 2026-07-09

이 리비전의 DDL 은 worker/scripts/ddl/001_initial_schema.sql 을 **그대로 옮겨 적은 것**이다.
두 곳이 어긋나면 안 된다 — 어긋나는 순간 db-schema 계약이 깨진다.

SQLAlchemy 의 op.create_table() 대신 op.execute(원시 SQL) 을 쓰는 이유:
  * DDL 원본과 한 글자씩 대조할 수 있어야 한다. op.create_table 로 옮겨 적으면
    CHECK 식과 COMMENT 36개가 파이썬 표현으로 번역되면서 대조가 불가능해진다.
  * 컬럼 코멘트·GENERATED ALWAYS AS IDENTITY·text[] 는 op 헬퍼로 표현하면
    장황해지기만 하고 얻는 게 없다. 워커는 ORM 모델을 두지 않으므로
    SQLAlchemy 타입 추상화가 필요 없다.

계약: docs/wiki/10-contracts/db-schema.md
"""
from __future__ import annotations

from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    # ── 1) lotto_draw — 로또 회차별 당첨결과 ─────────────────────────────
    # round_no 는 자연키(1~n, 결번 없음)이므로 대리키를 추가하지 않고 PK 로 쓴다.
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS lotto_draw (
            round_no                integer     NOT NULL,
            draw_ymd                date        NOT NULL,
            winning_no1            smallint    NOT NULL,
            winning_no2            smallint    NOT NULL,
            winning_no3            smallint    NOT NULL,
            winning_no4            smallint    NOT NULL,
            winning_no5            smallint    NOT NULL,
            winning_no6            smallint    NOT NULL,
            bonus_no               smallint    NOT NULL,
            total_sell_amt          bigint,
            first_prize_amt         bigint,
            first_winner_cnt        integer,
            first_accum_prize_amt   bigint,
            created_dttm            timestamptz NOT NULL DEFAULT now(),
            updated_dttm            timestamptz NOT NULL DEFAULT now(),

            CONSTRAINT pk_lotto_draw PRIMARY KEY (round_no),

            -- 당첨번호 6개는 항상 오름차순으로 저장한다. 관례가 아니라 불변식이다.
            -- 예측 모듈이 조합을 집합으로 다루면서도 DB 에서는 정렬 순서를 신뢰한다.
            CONSTRAINT ck_lotto_draw_ascending CHECK (
                winning_no1 < winning_no2 AND winning_no2 < winning_no3
                AND winning_no3 < winning_no4 AND winning_no4 < winning_no5
                AND winning_no5 < winning_no6
            ),
            -- 번호 범위 1~45. 오름차순 + 양끝 검사로 6개 전부가 범위에 든다.
            CONSTRAINT ck_lotto_draw_no_range CHECK (
                winning_no1 >= 1 AND winning_no6 <= 45 AND bonus_no BETWEEN 1 AND 45
            ),
            -- 주 1회 추첨이므로 추첨일자는 회차와 1:1. 무결성 강제 겸 날짜 조회 인덱스.
            CONSTRAINT uk_lotto_draw_draw_ymd UNIQUE (draw_ymd)
        )
        """
    )
    op.execute("COMMENT ON TABLE  lotto_draw                       IS '로또 회차별 당첨결과'")
    op.execute("COMMENT ON COLUMN lotto_draw.round_no              IS '회차번호(자연키)'")
    op.execute("COMMENT ON COLUMN lotto_draw.draw_ymd              IS '추첨일자'")
    op.execute("COMMENT ON COLUMN lotto_draw.winning_no1           IS '당첨번호1(오름차순 최소)'")
    op.execute("COMMENT ON COLUMN lotto_draw.winning_no2           IS '당첨번호2'")
    op.execute("COMMENT ON COLUMN lotto_draw.winning_no3           IS '당첨번호3'")
    op.execute("COMMENT ON COLUMN lotto_draw.winning_no4           IS '당첨번호4'")
    op.execute("COMMENT ON COLUMN lotto_draw.winning_no5           IS '당첨번호5'")
    op.execute("COMMENT ON COLUMN lotto_draw.winning_no6           IS '당첨번호6(오름차순 최대)'")
    op.execute("COMMENT ON COLUMN lotto_draw.bonus_no              IS '보너스번호(1~45)'")
    op.execute("COMMENT ON COLUMN lotto_draw.total_sell_amt        IS '총판매금액(네이버 소스 미제공, 항상 NULL)'")
    op.execute("COMMENT ON COLUMN lotto_draw.first_prize_amt       IS '1등 게임당 당첨금액(회차 테이블에 의도적 중복 저장)'")
    op.execute("COMMENT ON COLUMN lotto_draw.first_winner_cnt      IS '1등 당첨자수(회차 테이블에 의도적 중복 저장)'")
    op.execute("COMMENT ON COLUMN lotto_draw.first_accum_prize_amt IS '1등 누적당첨금액(네이버 소스 미제공, 항상 NULL)'")
    op.execute("COMMENT ON COLUMN lotto_draw.created_dttm          IS '생성일시'")
    op.execute("COMMENT ON COLUMN lotto_draw.updated_dttm          IS '수정일시(공식 API 복구 후 enrich 추적용)'")

    # ── 2) lotto_prize — 등위별 당첨정보 ─────────────────────────────────
    # 당분간 비어 있다. 현재 수집 소스(네이버 위젯)에 2~5등 정보가 없다.
    # 미리 만드는 이유는 api-contract 의 회차 상세 응답 형태를 지금 확정하기 위해서다.
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS lotto_prize (
            round_no        integer  NOT NULL,
            prize_grade_no  smallint NOT NULL,
            winner_cnt      integer,
            game_prize_amt  bigint,

            CONSTRAINT pk_lotto_prize PRIMARY KEY (round_no, prize_grade_no),
            CONSTRAINT fk_lotto_prize_round FOREIGN KEY (round_no)
                REFERENCES lotto_draw (round_no) ON DELETE CASCADE,
            CONSTRAINT ck_lotto_prize_grade CHECK (prize_grade_no BETWEEN 1 AND 5)
        )
        """
    )
    op.execute("COMMENT ON TABLE  lotto_prize                IS '등위별 당첨정보(1~5등)'")
    op.execute("COMMENT ON COLUMN lotto_prize.round_no       IS '회차번호(lotto_draw 참조)'")
    op.execute("COMMENT ON COLUMN lotto_prize.prize_grade_no IS '등위(1~5)'")
    op.execute("COMMENT ON COLUMN lotto_prize.winner_cnt     IS '해당 등위 당첨자수'")
    op.execute("COMMENT ON COLUMN lotto_prize.game_prize_amt IS '해당 등위 게임당 당첨금액'")

    # ── 3) lotto_news — 복권 관련 뉴스 ───────────────────────────────────
    # 원문은 저장하지 않는다(제목/요약/출처/발행일/링크/키워드만).
    # link_url UNIQUE 가 중복 수집을 막는 유일한 장치다 → ON CONFLICT DO NOTHING.
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS lotto_news (
            news_id         bigint      GENERATED ALWAYS AS IDENTITY,
            title_nm        text        NOT NULL,
            summary_desc    text,
            link_url        text        NOT NULL,
            orig_link_url   text,
            provider_nm     text        NOT NULL DEFAULT 'naver',
            published_dttm  timestamptz,
            keyword_list    text[],
            collected_dttm  timestamptz NOT NULL DEFAULT now(),

            CONSTRAINT pk_lotto_news PRIMARY KEY (news_id),
            CONSTRAINT uk_lotto_news_link_url UNIQUE (link_url)
        )
        """
    )
    op.execute("COMMENT ON TABLE  lotto_news                IS '복권 관련 뉴스(원문 미저장)'")
    op.execute("COMMENT ON COLUMN lotto_news.news_id        IS '뉴스 대리키'")
    op.execute("COMMENT ON COLUMN lotto_news.title_nm       IS '뉴스 제목'")
    op.execute("COMMENT ON COLUMN lotto_news.summary_desc   IS '뉴스 요약문(네이버 API 요약, 원문 아님)'")
    op.execute("COMMENT ON COLUMN lotto_news.link_url       IS '뉴스 링크(중복 수집 방지 UNIQUE)'")
    op.execute("COMMENT ON COLUMN lotto_news.orig_link_url  IS '원본 매체 링크'")
    op.execute("COMMENT ON COLUMN lotto_news.provider_nm    IS '출처(예약어 source 대체, 기본 naver)'")
    op.execute("COMMENT ON COLUMN lotto_news.published_dttm IS '발행일시'")
    op.execute("COMMENT ON COLUMN lotto_news.keyword_list   IS '추출 키워드 목록'")
    op.execute("COMMENT ON COLUMN lotto_news.collected_dttm IS '수집일시'")
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_lotto_news_published_dttm
            ON lotto_news (published_dttm DESC)
        """
    )

    # ── 4) collect_job_log — 수집 잡 실행이력 ────────────────────────────
    # job_nm 으로 lotto/news 를 구분하고 exec_type_cd 로 크론/수동을 구분한다.
    # job_nm 에는 CHECK 를 걸지 않는다 — 잡이 늘 때마다 마이그레이션을 강제하고
    # 싶지 않다. 잡 목록의 정본은 docs/wiki/10-contracts/worker-jobs.md 다.
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS collect_job_log (
            job_log_id      bigint      GENERATED ALWAYS AS IDENTITY,
            job_nm          text        NOT NULL,
            exec_type_cd    text        NOT NULL,
            status_cd       text        NOT NULL,
            started_dttm    timestamptz NOT NULL DEFAULT now(),
            finished_dttm   timestamptz,
            collected_cnt   integer     NOT NULL DEFAULT 0,
            error_desc      text,

            CONSTRAINT pk_collect_job_log PRIMARY KEY (job_log_id),
            CONSTRAINT ck_collect_job_log_exec_type CHECK (exec_type_cd IN ('cron', 'manual')),
            CONSTRAINT ck_collect_job_log_status    CHECK (status_cd IN ('running', 'success', 'failed'))
        )
        """
    )
    op.execute("COMMENT ON TABLE  collect_job_log               IS '수집 잡 실행이력'")
    op.execute("COMMENT ON COLUMN collect_job_log.job_log_id    IS '실행이력 대리키'")
    op.execute("COMMENT ON COLUMN collect_job_log.job_nm        IS '잡 이름(lotto/news 구분)'")
    op.execute("COMMENT ON COLUMN collect_job_log.exec_type_cd  IS '실행구분(예약어 trigger 대체, cron/manual)'")
    op.execute("COMMENT ON COLUMN collect_job_log.status_cd     IS '진행상태(running/success/failed)'")
    op.execute("COMMENT ON COLUMN collect_job_log.started_dttm  IS '시작일시'")
    op.execute("COMMENT ON COLUMN collect_job_log.finished_dttm IS '종료일시'")
    op.execute("COMMENT ON COLUMN collect_job_log.collected_cnt IS '수집건수'")
    op.execute("COMMENT ON COLUMN collect_job_log.error_desc    IS '오류메시지'")
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_collect_job_log_job_nm_started
            ON collect_job_log (job_nm, started_dttm DESC)
        """
    )


def downgrade() -> None:
    # FK 의존성 때문에 lotto_prize 를 lotto_draw 보다 먼저 내린다.
    op.execute("DROP INDEX IF EXISTS ix_collect_job_log_job_nm_started")
    op.execute("DROP INDEX IF EXISTS ix_lotto_news_published_dttm")
    op.execute("DROP TABLE IF EXISTS collect_job_log")
    op.execute("DROP TABLE IF EXISTS lotto_news")
    op.execute("DROP TABLE IF EXISTS lotto_prize")
    op.execute("DROP TABLE IF EXISTS lotto_draw")
