# 위키 변경 로그

append-only. 새 항목을 **아래에** 추가한다. 과거 항목을 고치지 않는다.

기록 대상:
- 페이지 생성·삭제
- **계약 변경** (`10-contracts/`) — 반드시. 무엇을 왜 바꿨고 어느 세션이 영향받는지
- ADR 추가 또는 `deprecated` 전환
- lint 결과 중 사람이 결정한 사항
- 코드와 위키가 어긋난 것을 발견하고 고친 일

형식: `YYYY-MM-DD | 작업 | 대상 | 한 줄 설명`

---

2026-07-09 | 초기화 | `SCHEMA.md` | 위키 규약 확정. 그래프 레이어 미사용, 계약 페이지의 특별 지위 명시
2026-07-09 | 생성 | `00-decisions/0001~0009` | Phase 0 결정 9건 기록
2026-07-09 | 생성 | `10-contracts/*` | DB 스키마·API·잡·환경변수 계약 4건 확정. **이 시점부터 세션 분기 가능**
2026-07-09 | 생성 | `20-design/*` | 시안(`메인샘플.png`) 기반 토큰·반응형·컴포넌트·a11y 4건
2026-07-09 | 생성 | `30-seo/*` | 메타데이터·구조화데이터·애널리틱스·애드센스·검색엔진등록 5건
2026-07-09 | 생성 | `40-domain/*` | 기존 코드에서 추출한 도메인 지식 4건
2026-07-09 | 생성 | `50-ops/*`, `90-external/*` | 운영 3건, 외부 의존 3건
2026-07-09 | 발견 | `40-domain/prediction-algorithm.md` | 기존 `CLAUDE.md` 가 `confidence` 필드를 정의했으나 **코드에 존재하지 않음**. 실제로는 `avg_number_hits`. 문서가 없는 확률 개념을 발명했고 그것이 금지 표현. 신규 API 에서 미노출로 확정
2026-07-09 | 발견 | `40-domain/prediction-algorithm.md` | 기존 `CLAUDE.md` 가 `pattern.py` 에 "조합 레벨 필터" 가 있다고 적었으나 없음. 필터는 `montecarlo.py` 인라인 구현
2026-07-09 | 발견 | `40-domain/dream-pipeline.md` | 기존 `CLAUDE.md` 의 "3-세트 조합 생성" 은 실제로 3 tier × tier당 10세트
2026-07-09 | 발견 | `10-contracts/db-schema.md` | `lotto_results` 실측 1,231행(1~1231 연속). `CLAUDE.md` 의 "1,204회차" 는 낡은 값
2026-07-09 | 발견 | `00-decisions/0008-python-313-torch-pin.md` | torch 2.13.0 이 Python 3.13/3.14 를 공식 지원. 과거 3.11 핀의 원인은 torch 2.11 이었음. 3.13 승격 가능
2026-07-09 | 폐기 | `00-decisions/0005-postgres-migration.md` | SQLite `journal_mode=DELETE` 결정(WSL/NTFS 락 회피)을 `deprecated` 로 기록. Postgres 전환으로 무효
2026-07-09 | 수정 | `SCHEMA.md` | 태그 분류 체계에 `ops` 추가 (누락 발견)
2026-07-09 | 생성 | `50-ops/wsl-drvfs-pitfall.md` | `/mnt/d`(drvfs) 에서 디렉토리 rename 시 dentry 캐시가 오염돼 stat=ENOENT / mkdir=EEXIST 모순이 발생. 두 이름이 별칭이 되어 한쪽 `rm -rf` 가 둘 다 지운다. 실제 겪고 기록
2026-07-09 | 재편 | 저장소 | 구 Vite 프론트를 `frontend_old/` 로 이동(git rename 23파일). `worker/` `frontend/` 골격 생성. `frontend_bak` 이름은 WSL 캐시 오염으로 사용 불가하여 `frontend_old` 채택
2026-07-09 | 생성 | `CLAUDE.md` ×4, `README.md` ×4, `env.sample` ×4 | 문서 계층 규약 적용. 루트 36줄/세션 54~58줄로 상한 준수. 구 루트 `CLAUDE.md`(약 200줄)를 README 와 위키로 해체
2026-07-09 | 결정 | 루트 `CLAUDE.md` 규칙 4 | "실행 전, 다른 세션의 작업이 필요하면 위키부터 쓴다" 를 명문화. 세 세션이 동시에 돌기 때문
2026-07-09 | 개명 | 전역 | **`collector` → `worker`**, `연계수집기`/`수집기` → `워커`. 디렉토리·환경변수(`COLLECTOR_*`→`WORKER_*`)·위키 페이지 3건(`worker-jobs`, `0003-worker-writes-backend-reads`, `0004-manual-trigger-on-worker`)·frontmatter `owner` 포함. `items_collected`/`collected_at` 식별자는 불변
2026-07-09 | 정정 | `00-decisions/0006-keep-chromadb-not-pgvector.md` | **사실 오류 수정.** "chroma_words 는 git 에 포함된다" 고 썼으나 실제로는 36MB 이고 `.gitignore` 에 등록되어 git 에 없다. 백업 반론이 유효함을 인정하고, 보관 방법 결정을 `tbd` 로 남김. pgvector 도 이 문제를 풀지 못한다는 점은 그대로
2026-07-09 | 확정 | `10-contracts/env-vars.md` | env 파일명 규약: worker=`.env_worker`, backend=`.env_backend`, **frontend=`.env.local`**. Next.js 는 임의 파일명을 읽지 않아 `.env_frontend` 를 만들면 전부 `undefined` 가 되고 에러도 안 난다
2026-07-09 | 확정 | `10-contracts/env-vars.md` | 가상환경은 uv 가 관리한다(`uv sync`/`uv run`/`uv add`, `uv.lock` 커밋, sudo 금지). 세션 CLAUDE.md 3건에 반영
2026-07-09 | 결정 | `50-ops/deployment.md` | **worker 와 backend 는 별개 컨테이너로 배포한다.** 같은 호스트여도 서비스를 나눈다. backend 컨테이너에 `app_writer` 자격증명이 없어야 권한 분리가 침해 시나리오까지 방어한다. 합칠 경우 ADR 필수
2026-07-09 | 보강 | `00-decisions/0003-worker-writes-backend-reads.md` | "백엔드에 쓰기 요구가 생기면" 절 추가. **워커에 HTTP 로 던지는 구조는 안티패턴** — 워커는 배치 잡 러너지 쓰기 서비스가 아니다. 권한은 컴포넌트가 아니라 데이터 소유권을 따라 나눈다(`app_user` 롤 + 자기 스키마). 워커에게 작업을 지시해야 하면 Postgres outbox 테이블
2026-07-09 | 보강 | `10-contracts/db-schema.md` | 롤 초기화 SQL 을 실제 실행 가능한 형태로 교체. `REVOKE ... FROM PUBLIC`, `ALTER DEFAULT PRIVILEGES FOR ROLE` 이 빠져 있었다. 스크립트: `worker/scripts/init_roles.sql` (비밀번호는 psql 변수로 주입)
2026-07-09 | 확정 | `10-contracts/db-schema.md` · `env-vars.md` | **개발 DB 는 신규 생성이 아니라 기존 `prod_db` 를 쓴다.** WSL Docker `bskim-dev-pg18`(postgres:18.4), 호스트 포트 **5179**. DB·`public` 스키마 소유자는 `prod_user`(슈퍼유저 아님, DBeaver 접속용). `CREATE DATABASE` 하지 않고 스키마 소유권도 뺏지 않는다. `prod_db`/`prod_user` 라는 이름은 로컬 개발용인데 운영으로 오인될 수 있어 **사용자가 인지하고 감수한 위험**
2026-07-09 | 정정 | `10-contracts/env-vars.md` | **frontend env 파일명을 `.env.local` → `.env_frontend` 로 되돌림.** 사용자 규약(`.env_<컴포넌트>`)을 따른다. Next.js 가 이 이름을 자동 로드하지 않는 것은 사실이므로, `next.config.ts` 최상단에서 `dotenv` 로 명시 로드하는 방법을 함정과 함께 기록. 로더를 빼면 전부 `undefined` 가 되고 에러도 안 난다
2026-07-09 | 확장 | 루트 `CLAUDE.md` | **규칙 우선순위**(대화 > 폴더 > 상위폴더 > 루트 > 관례), **주석 규칙**(무엇이 아니라 왜), **CLAUDE.md 관리 원칙** 추가. 분량 상한을 40줄 → 약 80줄로 조정. 세션 `CLAUDE.md` 는 60줄 유지. `.env` 열람 금지는 **Claude 에게만** 적용되고 프로그램은 읽는다는 점을 명시
2026-07-09 | 조정 | 문서 계층 | 사용자가 제시한 "폴더 `CLAUDE.md` 에 파일 구조·실행/테스트 방법·API/DB 정보를 쓴다" 는 "CLAUDE.md 를 가볍게 유지한다" 와 충돌. **제약은 `CLAUDE.md`, 실행법·구조는 `README.md`** 로 정리해 반영
2026-07-09 | 완료 | Postgres | 사용자가 `worker/scripts/init_roles.sql` 실행. `app_writer`/`app_reader` 롤 생성 및 권한 분리 테스트 통과
2026-07-09 | 변경 | 포트 | **backend 포트 8002 → 8005.** `frontend/env.sample`, `backend/run.py`, README 3건, `local-setup.md`, `deployment.md`, `env-vars.md`, `index.md` 반영. `docs/raw/` 는 읽기 전용이라 손대지 않음(위키가 정본)
2026-07-09 | 완료 | `10-contracts/env-vars.md` | 사용자가 `.env_worker`/`.env_backend`/`.env_frontend` 를 만들고 실제값을 채움. **Phase 1·2·3 을 막는 항목이 사라짐.** `news` 잡만 네이버 API 키 대기(`lotto` 잡은 키 없이 동작)
2026-07-09 | 수정 | `.claude/agents/postgres-db-expert.md` | **위험한 결함 제거.** 에이전트가 자신을 "`gtob` 프로젝트" 로 소개했고(같은 서버에 실존하는 타 프로젝트 DB), `.env_worker` 를 읽으라고 지시했으며(루트 규칙 2 위반), 키 이름이 `DB_*` 로 달랐다. 접속을 `docker exec -u postgres` 소켓(비밀번호 불필요)으로 교체하고 프로젝트 제약 절을 추가
2026-07-09 | **계약 변경** | `10-contracts/db-schema.md` | **DB 명명 전면 재설계** (사용자 승인). SQLite 이름을 그대로 옮기지 않는다. 테이블 4개 전부 개명: `lotto_draws`→`lotto_draw`, `lotto_prize_tiers`→`lotto_prize`, `news_articles`→`lotto_news`, `job_runs`→`collect_job_log`. 예약어 3개 제거(`trigger`→`exec_type_cd`, `rank`→`prize_grade_no`, `source`→`provider_nm`). 전 컬럼 `COMMENT ON`, `pk_/fk_/uk_/ck_/ix_` 명명, `BIGSERIAL`→`GENERATED ALWAYS AS IDENTITY`. DDL 원본: `worker/scripts/ddl/001_initial_schema.sql`
2026-07-09 | 생성 | `10-contracts/db-naming-standard.md` · `00-decisions/0010-db-naming-standard.md` | 표준단어·도메인 접미어 사전과 ADR. **API 응답 필드는 바꾸지 않는다** — 공개 계약을 DB 스키마에 결합시키지 않는다. 백엔드가 매핑하며 매핑표는 `db-schema.md` 에
2026-07-09 | 결정 | `10-contracts/db-schema.md` | 접미어 `_ymd` 의 타입은 **`date`** 다(공공표준의 `CHAR(8)` 아님). 문자열이면 날짜 연산마다 캐스팅이 필요해 인덱스가 죽는다. 이 서비스는 최근 N회차·D-day·sitemap lastmod 로 날짜를 계속 계산한다
2026-07-09 | 추가 | `10-contracts/db-schema.md` | 신규 제약 `uk_lotto_draw_draw_ymd`(UNIQUE). 주 1회 추첨이라 일자↔회차 1:1. **실데이터 1,231행에서 중복 0건 확인 후 추가.** 날짜 조회 인덱스를 겸하므로 별도 인덱스를 두지 않는다
2026-07-09 | 정정 | `10-contracts/db-naming-standard.md` | 에이전트 산출물의 내부 모순 수정. 도메인사전은 `_no`(업무상 번호)를 정의하는데 DDL 은 사전에 없는 `_num`(`winning_num1`, `bonus_num`)을 썼다. 같은 개념에 이름이 둘이면 표준이 아니다 → `winning_no1..6`, `bonus_no` 로 통일하고 표준단어 `번호=num` 을 삭제
2026-07-09 | 검증 | `worker/scripts/ddl/001_initial_schema.sql` | `BEGIN; ... ROLLBACK;` 으로 문법 검증. 4테이블·2인덱스·36컬럼 전부 생성 성공, **컬럼 코멘트 36/36**, 롤백 후 DB 무변경 확인. **DDL 을 실제 적용하지 않았다** — 적용은 워커의 Alembic
2026-07-09 | 생성 | `10-contracts/component-boundaries.md` | **세션이 가장 먼저 읽는 경계 페이지.** 세 세션의 소유/금지/접점을 한 장에. 세션 `CLAUDE.md` 3건의 "먼저 읽을 위키" 표 최상단에 추가. 세션 기동 프롬프트에서 이 경로를 가리킨다
2026-07-09 | 함정 | `10-contracts/db-schema.md` | **DBeaver 에서 테이블이 안 보이는 함정.** `app_writer` 가 만든 테이블의 소유자는 `app_writer` 이고, `prod_user` 는 DB 소유자일 뿐 슈퍼유저가 아니라 남의 테이블에 권한이 없다. DB 를 소유한다고 그 안의 객체를 소유하는 게 아니다. 해법은 `GRANT app_writer TO prod_user` (롤 기본이 INHERIT). **운영에서는 이 멤버십을 주지 않는다**
2026-07-09 | **계약 보강** | `10-contracts/api-contract.md` | 백엔드 세션이 구현에 착수하며 응답 스키마가 비어 있던 **여섯 곳**을 확정. 엔드포인트·필드명·표현 규약은 불변이므로 기존 계약과 충돌 없음. ① 목록 응답 봉투 `{total,page,size,items}` 통일(`rounds` 는 `round_no` DESC, 범위 밖 page 는 빈 배열 200) ② 회차 상세 `traits` 6필드 확정 — **`hot_count`/`cold_count` 제외**(기준 시점이 모호해 과거 회차에 붙이면 오독된다) ③ `stats/*` 에 `window`·`rounds_analyzed` 공통 필드, `overdue` 는 window 가 아니라 역대 전체에서 계산, pattern 응답 필드 확정(`tail_diversity_avg`→API 는 `tail_variety_avg`) ④ `recommend` 의 `traits` 는 6필드+`hot_count`/`cold_count`, 기준을 `hot_window` 로 응답에 노출 ⑤ **`pure_random` 은 회차 50개 미만에서도 200** — DB 를 읽지 않는 통제군이라 막을 근거가 없다. `hot_count`/`cold_count` 는 `null` ⑥ `dream/keywords` 슬러그는 **한글 그대로**(검색어와 URL 일치, 로마자 규칙의 정본 부재), `dream/recommend` 응답에서 `score`·`distance` 제거(`score` 는 금지 필드명). 영향: 프론트 세션은 이 문서만으로 전 엔드포인트를 타이핑할 수 있다
2026-07-09 | 구현 | `worker/**` | **Phase 1 워커 구현.** 잡 레지스트리·잡별 락·크론·수동 트리거·`collect_job_log`·Alembic·이관 스크립트. 코드를 먼저 쓰고 위키를 나중에 맞췄다 — 루트 규칙 4 위반. 사용자가 지적해 아래 계약 갱신을 수행. **순서를 지켰어야 했다**
2026-07-09 | **계약 변경** | `10-contracts/env-vars.md` | worker 환경변수 11개 추가(`LOTTO_RETRY_DELAY_MIN` `LOTTO_MAX_ATTEMPT` `CRAWL_*` 5개 `NEWS_MAX_RETRY` `NEWS_BACKOFF_BASE_SEC` `STALE_RUNNING_HOURS` `CATCH_UP_DAYS`). 전부 기본값이 있어 `.env_worker` 에 없어도 기동한다. 수집 딜레이·재시도 횟수를 코드에 박지 않기 위한 것. worker 세션만 영향
2026-07-09 | **계약 변경** | `10-contracts/env-vars.md` · `worker/CLAUDE.md` | **의존성에 `pydantic-settings` 추가.** 기존 목록(`httpx` `apscheduler` `psycopg` `alembic` `fastapi` `uvicorn` "뿐")과 같은 문서의 `SettingsConfigDict(env_file=".env_worker")` 요구가 서로 모순이었다. 목록의 취지는 ML 의존(`torch`·`transformers`) 금지이지 경량 설정 라이브러리 금지가 아님을 명문화
2026-07-09 | **계약 변경** | `10-contracts/worker-jobs.md` | `lotto` 재시도를 절대시각("22:00, 23:00")이 아니라 **상대시간**(`LOTTO_RETRY_DELAY_MIN` × `LOTTO_MAX_ATTEMPT`)으로 규정. `LOTTO_CRON` 을 바꾸면 재시도도 따라 움직여야 한다. 예약된 재시도는 워커 재시작 시 사라진다(메모리 잡스토어) — 수동 트리거로 복구
2026-07-09 | **계약 변경** | `10-contracts/worker-jobs.md` | **`/internal/health` 는 `X-Job-Key` 를 요구하지 않는다.** 기존 문서가 세 엔드포인트 아래 헤더를 뭉뚱그려 적어 모호했고, `local-setup.md` 의 스모크 테스트는 키 없이 호출한다. 나머지 둘은 키 필요
2026-07-09 | **계약 변경** | `10-contracts/worker-jobs.md` | **`401` 이 `404` 보다 먼저 판정된다.** 키를 모르는 호출자가 상태코드 차이만으로 유효한 잡 이름을 알아내지 못하게 한다. `404` 의 판정 기준은 DB 제약이 아니라 잡 레지스트리(`JOBS`)
2026-07-09 | **계약 변경** | `10-contracts/worker-jobs.md` | `news` 잡의 **키 부재 시 동작** 규정: 워커는 기동하고, 크론에 등록하지 않으며, 수동 트리거는 `202` 후 즉시 실패해 `collect_job_log` 에 사유를 남긴다. 조용히 성공하지 않는다. `collected_cnt` 는 조회 건수가 아니라 실제 INSERT 된 행 수(`rowcount`)
2026-07-09 | **계약 변경** | `10-contracts/worker-jobs.md` | **락 획득 원자성 함정.** `lock.locked()` 확인과 `await lock.acquire()` 사이에 어떤 `await` 도 넣지 않는다. `run_id` 를 먼저 얻으려 `job_log.start()` 를 끼우면 두 요청이 나란히 `409` 를 통과해 같은 잡을 두 번 실행한다. 부분 성공 기록(`JobProgress`)도 명문화
2026-07-09 | 함정 | `10-contracts/db-schema.md` | ★ **Alembic 이 `app_writer` 비밀번호를 평문으로 뱉었다. 실제로 겪었고 사용자가 비번을 교체했다.** `alembic.ini` 는 ConfigParser 라 URL 의 `%`(퍼센트 인코딩된 특수문자)를 보간으로 해석해 `ValueError` 를 내는데, **그 메시지가 URL 전체를 출력**한다. 해법: `set_main_option` 을 쓰지 않고 `env.py` 에서 `create_engine(URL)` 을 직접 만들고, 오프라인 모드에는 `dialect_name` 만 넘긴다. psycopg 접속문자열도 f-string 대신 `make_conninfo`
2026-07-09 | 추가 | `10-contracts/db-schema.md` | Alembic 은 **`--autogenerate` 를 쓰지 않는다**(`target_metadata = None`). DDL 정본은 `scripts/ddl/001_initial_schema.sql` 이고 마이그레이션은 `op.execute()` 로 그대로 옮겨 적는다. 모델을 두면 정본이 둘이 된다. `worker/README.md` 의 autogenerate 안내를 정정. `alembic_version` 테이블이 추가로 생기지만 계약 대상이 아니다
2026-07-09 | 정정 | `10-contracts/env-vars.md` · `90-external/naver-search-api.md` · `index.md` | **네이버 API 키가 이미 발급·기입되어 있었다.** 위키는 "미발급 → `news` 잡 차단" 으로 기록돼 있었으나 실제로는 채워져 있어 `news` 잡이 동작한다. 남은 미결은 **일일 쿼터**뿐이며 `naver-search-api` 는 `status: draft` 유지. 현재 하루 6회 호출(3회 × 검색어 2개)
2026-07-09 | 적용 | Postgres `prod_db` | 사용자 승인 후 `alembic upgrade head` 실행. 4테이블·2인덱스·**컬럼 코멘트 36/36** 생성. `ALTER DEFAULT PRIVILEGES FOR ROLE app_writer` 가 실제로 동작함을 확인 — 새 4테이블 전부 `app_reader` 가 `SELECT` 가능·`INSERT` 불가
2026-07-09 | 완료 | `50-ops/migration-sqlite-to-postgres.md` | 1회성 이관 실행. **1,231행 적재, 검증 5쿼리 전부 통과.** 재실행은 종료코드 1 로 거부(멱등 아님). `backend/data/lotto.db` 는 보관
