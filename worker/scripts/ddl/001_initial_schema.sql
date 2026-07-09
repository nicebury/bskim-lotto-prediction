-- =============================================================================
-- 001_initial_schema.sql — 행운상자 초기 스키마 (한국형 표준화 적용)
-- =============================================================================
--
-- [이 파일의 지위]
--   * 이 파일은 **참조 원본(reference source)** 이다. 실제 스키마 적용의 정본(SSOT)은
--     worker 세션의 Alembic 마이그레이션(worker/migrations/)이다.
--   * Alembic 마이그레이션을 작성할 때는 이 파일의 DDL 을 **그대로 옮겨 적는다.**
--     두 곳이 어긋나면 안 된다. 어긋나는 순간 db-schema 계약이 깨진다.
--   * 이 파일을 실제 DB 에 직접 적용하지 않는다. 적용은 worker 가 Alembic 으로 하며,
--     **실행 전 반드시 사용자 승인**을 받는다.
--   * 문법 검증만 필요하면 트랜잭션 안에서 실행하고 롤백한다:
--       docker exec -i bskim-dev-pg18 psql -U postgres -d prod_db -v ON_ERROR_STOP=1 \
--         -c 'BEGIN;' -f worker/scripts/ddl/001_initial_schema.sql -c 'ROLLBACK;'
--
-- [전제]
--   * 대상: prod_db 의 public 스키마. 소유자 롤은 app_writer (이 파일을 실행하는 롤).
--   * 스키마 이동/롤 권한 변경 없음. 권한 초기화는 worker/scripts/init_roles.sql 소관.
--   * 표준: 표준단어·도메인 접미어·제약 명명 규칙은 db-naming-standard.md 참조.
--   * 명명 규칙: pk_ / fk_ / uk_ / ck_ / ix_
--   * 대리키: bigint GENERATED ALWAYS AS IDENTITY (BIGSERIAL 미사용)
--   * 접미어 타입: _no=integer, _ymd=date, _dttm=timestamptz, _amt=bigint,
--                 _cnt=integer, _cd=text+CHECK, _nm=text, _desc=text, _url=text
--
-- 관련 계약: docs/wiki/10-contracts/db-schema.md
--            docs/wiki/10-contracts/api-contract.md
--            docs/wiki/10-contracts/db-naming-standard.md
-- =============================================================================

-- =============================================================================
-- 1) lotto_draw — 로또 회차별 당첨결과
--    현행 SQLite lotto_results 의 후신. round_no 는 자연키(1~n, 결번 없음)이므로
--    대리키를 추가하지 않고 그대로 PK 로 쓴다.
-- =============================================================================
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
    CONSTRAINT ck_lotto_draw_ascending CHECK (
        winning_no1 < winning_no2 AND winning_no2 < winning_no3
        AND winning_no3 < winning_no4 AND winning_no4 < winning_no5
        AND winning_no5 < winning_no6
    ),
    -- 번호 범위 1~45. 오름차순 + 양끝 검사로 6개 전부가 범위에 든다. 보너스는 별도.
    CONSTRAINT ck_lotto_draw_no_range CHECK (
        winning_no1 >= 1 AND winning_no6 <= 45 AND bonus_no BETWEEN 1 AND 45
    ),
    -- 주 1회 추첨이므로 추첨일자는 회차와 1:1. 무결성 강제 겸 날짜 조회 인덱스.
    CONSTRAINT uk_lotto_draw_draw_ymd UNIQUE (draw_ymd)
);

COMMENT ON TABLE  lotto_draw                       IS '로또 회차별 당첨결과';
COMMENT ON COLUMN lotto_draw.round_no              IS '회차번호(자연키)';
COMMENT ON COLUMN lotto_draw.draw_ymd              IS '추첨일자';
COMMENT ON COLUMN lotto_draw.winning_no1          IS '당첨번호1(오름차순 최소)';
COMMENT ON COLUMN lotto_draw.winning_no2          IS '당첨번호2';
COMMENT ON COLUMN lotto_draw.winning_no3          IS '당첨번호3';
COMMENT ON COLUMN lotto_draw.winning_no4          IS '당첨번호4';
COMMENT ON COLUMN lotto_draw.winning_no5          IS '당첨번호5';
COMMENT ON COLUMN lotto_draw.winning_no6          IS '당첨번호6(오름차순 최대)';
COMMENT ON COLUMN lotto_draw.bonus_no             IS '보너스번호(1~45)';
COMMENT ON COLUMN lotto_draw.total_sell_amt        IS '총판매금액(네이버 소스 미제공, 항상 NULL)';
COMMENT ON COLUMN lotto_draw.first_prize_amt       IS '1등 게임당 당첨금액(회차 테이블에 의도적 중복 저장)';
COMMENT ON COLUMN lotto_draw.first_winner_cnt      IS '1등 당첨자수(회차 테이블에 의도적 중복 저장)';
COMMENT ON COLUMN lotto_draw.first_accum_prize_amt IS '1등 누적당첨금액(네이버 소스 미제공, 항상 NULL)';
COMMENT ON COLUMN lotto_draw.created_dttm          IS '생성일시';
COMMENT ON COLUMN lotto_draw.updated_dttm          IS '수정일시(공식 API 복구 후 enrich 추적용)';

-- =============================================================================
-- 2) lotto_prize — 등위별 당첨정보
--    당분간 비어 있다. API 회차 상세 응답 형태를 미리 확정하기 위한 스키마.
--    1등 정보는 lotto_draw 에 중복 저장되며, 이 테이블은 확보 시 1~5등 전체를 담는다.
--    (round_no, prize_grade_no) 자연키 조합을 PK 로 사용.
-- =============================================================================
CREATE TABLE IF NOT EXISTS lotto_prize (
    round_no        integer  NOT NULL,
    prize_grade_no  smallint NOT NULL,
    winner_cnt      integer,
    game_prize_amt  bigint,

    CONSTRAINT pk_lotto_prize PRIMARY KEY (round_no, prize_grade_no),
    CONSTRAINT fk_lotto_prize_round FOREIGN KEY (round_no)
        REFERENCES lotto_draw (round_no) ON DELETE CASCADE,
    CONSTRAINT ck_lotto_prize_grade CHECK (prize_grade_no BETWEEN 1 AND 5)
);

COMMENT ON TABLE  lotto_prize                IS '등위별 당첨정보(1~5등)';
COMMENT ON COLUMN lotto_prize.round_no       IS '회차번호(lotto_draw 참조)';
COMMENT ON COLUMN lotto_prize.prize_grade_no IS '등위(1~5)';
COMMENT ON COLUMN lotto_prize.winner_cnt     IS '해당 등위 당첨자수';
COMMENT ON COLUMN lotto_prize.game_prize_amt IS '해당 등위 게임당 당첨금액';

-- =============================================================================
-- 3) lotto_news — 복권 관련 뉴스
--    원문은 저장하지 않는다(제목/요약/출처/발행일/링크/키워드만).
--    link_url UNIQUE 로 중복 수집 방지 → 워커는 INSERT ... ON CONFLICT DO NOTHING.
-- =============================================================================
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
);

COMMENT ON TABLE  lotto_news                IS '복권 관련 뉴스(원문 미저장)';
COMMENT ON COLUMN lotto_news.news_id        IS '뉴스 대리키';
COMMENT ON COLUMN lotto_news.title_nm       IS '뉴스 제목';
COMMENT ON COLUMN lotto_news.summary_desc   IS '뉴스 요약문(네이버 API 요약, 원문 아님)';
COMMENT ON COLUMN lotto_news.link_url       IS '뉴스 링크(중복 수집 방지 UNIQUE)';
COMMENT ON COLUMN lotto_news.orig_link_url  IS '원본 매체 링크';
COMMENT ON COLUMN lotto_news.provider_nm    IS '출처(예약어 source 대체, 기본 naver)';
COMMENT ON COLUMN lotto_news.published_dttm IS '발행일시';
COMMENT ON COLUMN lotto_news.keyword_list   IS '추출 키워드 목록';
COMMENT ON COLUMN lotto_news.collected_dttm IS '수집일시';

CREATE INDEX IF NOT EXISTS ix_lotto_news_published_dttm
    ON lotto_news (published_dttm DESC);

-- =============================================================================
-- 4) collect_job_log — 수집 잡 실행이력
--    현행 SQLite crawl_logs 의 후신. job_nm 으로 lotto/news 잡을 구분하고,
--    exec_type_cd 로 크론/수동 실행을 구분한다. start_round/end_round 는 미이관.
-- =============================================================================
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
);

COMMENT ON TABLE  collect_job_log               IS '수집 잡 실행이력';
COMMENT ON COLUMN collect_job_log.job_log_id    IS '실행이력 대리키';
COMMENT ON COLUMN collect_job_log.job_nm        IS '잡 이름(lotto/news 구분)';
COMMENT ON COLUMN collect_job_log.exec_type_cd  IS '실행구분(예약어 trigger 대체, cron/manual)';
COMMENT ON COLUMN collect_job_log.status_cd     IS '진행상태(running/success/failed)';
COMMENT ON COLUMN collect_job_log.started_dttm  IS '시작일시';
COMMENT ON COLUMN collect_job_log.finished_dttm IS '종료일시';
COMMENT ON COLUMN collect_job_log.collected_cnt IS '수집건수';
COMMENT ON COLUMN collect_job_log.error_desc    IS '오류메시지';

CREATE INDEX IF NOT EXISTS ix_collect_job_log_job_nm_started
    ON collect_job_log (job_nm, started_dttm DESC);

-- =============================================================================
-- 롤백 (역순 DROP) — 필요 시 아래 블록의 주석을 해제해 실행한다.
-- FK 의존성 때문에 lotto_prize 를 lotto_draw 보다 먼저 내린다.
-- =============================================================================
-- DROP INDEX IF EXISTS ix_collect_job_log_job_nm_started;
-- DROP INDEX IF EXISTS ix_lotto_news_published_dttm;
-- DROP TABLE IF EXISTS collect_job_log;
-- DROP TABLE IF EXISTS lotto_news;
-- DROP TABLE IF EXISTS lotto_prize;
-- DROP TABLE IF EXISTS lotto_draw;
