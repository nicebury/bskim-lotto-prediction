-- =============================================================================
-- 003 — collect_job_log 상세화 (stat_json · log_list)
--
-- 이 파일은 **참조 원본**이다. 적용 정본은
-- worker/migrations/versions/0003_job_log_detail.py 이며 두 SQL 은 한 글자씩 같다.
--
-- 왜 필요한가:
--   collected_cnt 와 error_desc 만으로는 **왜 0건인지 알 수 없다.** 검색이
--   200건을 물어왔는데 필터가 전부 걸렀는지, API 가 0건을 줬는지, 이미 다
--   저장된 것이었는지가 구분되지 않는다. 그 정보는 터미널 로그에만 남고
--   스크롤과 함께 사라졌다.
--
--   error_desc 는 잡을 죽인 마지막 예외 하나뿐이라, 죽지 않고 넘어간 문제
--   (채널명이 바뀌었다 / LLM 판정 실패로 규칙 결과를 썼다 / 배치를 건너뛰었다)
--   가 기록되지 않았다.
--
-- 계약: docs/wiki/10-contracts/db-schema.md
-- =============================================================================

ALTER TABLE collect_job_log ADD COLUMN IF NOT EXISTS stat_json jsonb;
ALTER TABLE collect_job_log ADD COLUMN IF NOT EXISTS log_list  jsonb;

COMMENT ON COLUMN collect_job_log.stat_json IS '단계별 통과 건수(잡마다 키가 다르다. 예: fetched/on_topic/stored)';
COMMENT ON COLUMN collect_job_log.log_list  IS '그 실행의 WARNING 이상 메시지 전문 배열. error_desc 는 잡을 죽인 마지막 예외 하나뿐이라 죽지 않고 넘어간 문제가 안 남는다';

-- 관리자 화면의 기본 조회(최신순 + 상태 필터). job_nm 인덱스와 별개로 필요하다 —
-- 전체 잡을 섞어 최신순으로 보는 화면이 있고, 그 쿼리는 기존 (job_nm, started_dttm)
-- 인덱스를 타지 못한다(선두 컬럼이 없다).
CREATE INDEX IF NOT EXISTS ix_collect_job_log_started
    ON collect_job_log (started_dttm DESC);

-- 실패만 훑는 조회. 부분 인덱스라 작고, 장애 조사에서 가장 자주 쓴다.
CREATE INDEX IF NOT EXISTS ix_collect_job_log_failed
    ON collect_job_log (started_dttm DESC)
    WHERE status_cd = 'failed';

-- =============================================================================
-- 롤백 — 필요 시 주석 해제
-- =============================================================================
-- DROP INDEX IF EXISTS ix_collect_job_log_failed;
-- DROP INDEX IF EXISTS ix_collect_job_log_started;
-- ALTER TABLE collect_job_log DROP COLUMN IF EXISTS log_list;
-- ALTER TABLE collect_job_log DROP COLUMN IF EXISTS stat_json;
