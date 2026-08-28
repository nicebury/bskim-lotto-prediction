# CLAUDE.md — 세션 A: 워커

루트 `CLAUDE.md` 의 규칙이 여기에도 적용된다. 아래는 이 세션만의 제약이다.
실행법·트러블슈팅은 `README.md`, 설계 근거는 `docs/wiki/` 에 있다.

## 책임

외부 소스에서 데이터를 가져와 Postgres 에 쓴다. **그 외 아무것도 하지 않는다.**

## 소유 — 이 세션만 고칠 수 있다

- `worker/**`
- `worker/migrations/` — **Alembic 의 유일한 소유자.** 다른 세션은 마이그레이션을 만들지 않는다
- `lotto_draw` · `lotto_prize` · `lotto_news` · `lotto_video` · `collect_job_log` 테이블의 스키마

## 절대 하지 않는 것

- HTML 렌더링, 예측 계산, 공개 API 제공
- `backend/` 또는 `frontend/` 의 코드 수정
- `/internal/*` 를 `0.0.0.0` 에 바인딩하거나 nginx 에 노출
- 관리자 UI 제작
- 뉴스 **원문** 저장 (제목·요약·출처·발행일·링크만)
- 영상 **파일·자막·썸네일 이미지** 저장 (메타데이터와 URL 만)
- **수집한 영상 제목을 변조하는 것** — 금지 표현이 남았다면 표시를 손볼 일이 아니라 필터를 고칠 일이다

## 매 턴 지킬 것

- **DB 접속은 `app_writer` 롤.** 백엔드의 `app_reader` 를 쓰지 않는다.
- **잡 이름별로 락을 나눈다.** 전역 락 하나를 쓰면 로또 수집이 뉴스 수집을 막는다.
- **워커는 1 프로세스.** 락이 프로세스 메모리에 있다.
- **크론 문자열을 코드에 박지 않는다.** `LOTTO_CRON` / `NEWS_CRON` / `YOUTUBE_*_CRON` 환경변수에서 읽는다. 수집 딜레이·재시도 횟수·금지 낱말도 마찬가지다.
- **API 키를 쿼리스트링에 싣지 않는다.** httpx 예외에 request URL 이 실려 `collect_job_log.error_desc` 에 평문으로 남는다. YouTube 는 `X-goog-api-key`, OpenAI 는 `Authorization` 헤더를 쓰고, 예외를 다시 던질 때 원본 문자열이 아니라 타입 이름과 상태코드만 싣는다.
- **`video_refresh` 의 하드 만료 삭제는 API 키 검사보다 먼저 돈다.** 순서를 바꾸지 않는다 — 갱신 성공에 삭제를 의존시키면 API 장애가 곧 30일 정책 위반이 된다.
- **LLM 보조 판정이 실패해도 수집을 멈추지 않는다.** 규칙 필터가 정본이고 LLM 은 보조다. 이 관계가 뒤집히면 외부 API 장애가 수집 중단으로 이어진다.
- **`WORKER_JOB_KEY` 가 비면 기동을 거부한다.** 빈 문자열끼리 비교하면 통과한다.
- **키 비교는 `secrets.compare_digest`.** `==` 를 쓰지 않는다. 인증은 잡 존재 확인보다 **먼저** 한다(401 이 404 보다 앞선다).
- **DB 접속 문자열을 f-string 으로 잇지 않는다.** `make_conninfo` / `URL.create` 를 쓰고, URL 을 문자열로 렌더링하지 않는다 — 예외 메시지에 비밀번호가 실린다.
- **`409` 판정(`lock.locked()`)과 `lock.acquire()` 사이에 `await` 을 넣지 않는다.** 넣으면 두 요청이 같은 잡을 동시에 실행한다.
- 모든 잡 실행(크론·수동)을 `collect_job_log` 에 기록한다. `exec_type_cd` 로 구분한다.
- 스키마를 바꾸면 **먼저** `docs/wiki/10-contracts/db-schema.md` 를 고치고 사용자 승인을 받는다. 백엔드가 그 계약을 읽고 개발 중이다.

## 환경과 의존성

- **가상환경은 uv 가 관리한다.** `python -m venv` / `pip install` 금지. `uv add` · `uv remove` · `uv run` · `uv sync` 만 쓰고 `uv.lock` 을 커밋한다. `uv` 를 `sudo` 로 실행하지 않는다.
- 환경변수 파일은 `.env` 가 아니라 **`.env_worker`** 다. `SettingsConfigDict(env_file=".env_worker")`
- 의존성은 `httpx` `apscheduler` `psycopg` `alembic` `fastapi` `uvicorn` `pydantic-settings` 뿐이다.
  **torch·transformers 를 추가하지 않는다.** 이 세션이 Python 3.13 을 제약 없이 쓰는 이유이자, 워커를 분리한 실질적 이득이다.

## 먼저 읽을 위키

| 문서 | 내용 |
|------|------|
| `docs/wiki/10-contracts/component-boundaries.md` | ★ **가장 먼저.** 소유 경계와 세션 간 접점 |
| `docs/wiki/10-contracts/worker-jobs.md` | 잡·크론·트리거·보안 계약 |
| `docs/wiki/10-contracts/db-schema.md` | DDL 과 롤 권한 |
| `docs/wiki/10-contracts/env-vars.md` | 환경변수 명세 |
| `docs/wiki/90-external/naver-search-api.md` | 뉴스 API. 쿼터 25,000/일 확인됨. **재배포 약관 미확인** |
| `docs/wiki/90-external/youtube-data-api.md` | 영상 API. **search.list 하루 100회 · 30일 보관 제한** |
| `docs/wiki/90-external/dhlottery-blocked.md` | 공식 API 차단과 네이버 위젯 파싱 |
| `docs/wiki/50-ops/migration-sqlite-to-postgres.md` | 1회성 이관 절차 |

## 완료 기준

빈 DB → 시드 적재 → `lotto` 수동 트리거 → 최신 회차 증분 수집 → `news` 수동 트리거 → 기사 저장.
영상은 `video_channel` → 화이트리스트 저장, `video_search` → 검색 유래 저장(중복은 `discovery_cd='channel'` 로 승격),
`refreshed_dttm` 을 26일 전으로 늙힌 뒤 `video_refresh` → 갱신 + 사라진 영상 삭제.
`collect_job_log` 에 실행 이력이 남는다. **백엔드 없이 단독으로 검증된다.**

순수 함수 검증은 API 를 부르지 않는다: `uv run python -m unittest discover -s tests`
