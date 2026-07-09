# worker — 워커

외부 소스에서 데이터를 가져와 Postgres 에 쓴다. 웹 API 도, 화면도 제공하지 않는다.

제약과 규칙은 `CLAUDE.md`, 설계 근거는 [`../docs/wiki/10-contracts/worker-jobs.md`](../docs/wiki/10-contracts/worker-jobs.md).

---

## 셋업

```bash
cd worker
cp env.sample .env_worker   # 값을 채운다. PG_PORT / PG_PASSWORD / WORKER_JOB_KEY 필수
uv sync                     # .venv 를 만들고 uv.lock 대로 설치한다
```

**가상환경은 uv 가 관리한다.** `python -m venv` 나 `pip install` 을 직접 쓰지 않는다. 의존성은 `uv add` / `uv remove` 로 넣고 빼며, `uv.lock` 을 커밋해 재현 가능하게 유지한다. 실행은 항상 `uv run` 을 거친다. **`uv` 를 `sudo` 로 실행하지 않는다.**

`.env` 가 아니라 **`.env_worker`** 다. pydantic-settings 에 파일명을 명시해야 읽힌다.

```python
model_config = SettingsConfigDict(env_file=".env_worker")
```

`WORKER_JOB_KEY` 생성:

```bash
openssl rand -hex 32
```

## 실행

```bash
uv run uvicorn worker.main:app --host 127.0.0.1 --port 8003
```

**워커는 반드시 1개.** 잡 락이 프로세스 메모리에 있어 다중 워커면 같은 잡이 중복 실행된다. `--workers` 를 쓰지 않는다.

## 파일 구조

```
worker/
├─ worker/                  # 패키지
│  ├─ config.py             # 환경변수를 읽는 유일한 곳 (.env_worker)
│  ├─ db.py                 # psycopg 커넥션 (app_writer 롤, autocommit)
│  ├─ job_log.py            # collect_job_log 기록·정리·조회
│  ├─ scheduler.py          # APScheduler. 크론·재시도·catch-up
│  ├─ main.py               # FastAPI 진입점. lifespan 기동 순서
│  ├─ jobs/
│  │  ├─ __init__.py        # 잡 레지스트리 + 잡별 asyncio.Lock
│  │  ├─ lotto.py           # 증분 수집 (MAX(round_no)+1 부터)
│  │  ├─ news.py            # 뉴스 수집 (ON CONFLICT DO NOTHING)
│  │  └─ progress.py        # 부분 성공 건수를 담는 가변 객체
│  ├─ sources/
│  │  ├─ naver_widget.py    # 검색 위젯 HTML 파싱 (공식 API 아님)
│  │  └─ naver_news.py      # 검색 오픈 API
│  └─ api/internal.py       # /internal/*  루프백 전용
├─ migrations/              # Alembic. 이 디렉토리가 유일한 소유자
├─ scripts/
│  ├─ ddl/001_initial_schema.sql   # 스키마 정본(참조 원본)
│  ├─ init_roles.sql               # 롤·권한 초기화 (슈퍼유저로 1회)
│  └─ migrate_sqlite_to_pg.py      # 1회성 이관
└─ alembic.ini              # sqlalchemy.url 을 적지 않는다
```

`config.py` 밖에서 `os.getenv` 를 부르지 않는다. `db.py` 밖에서 커넥션을 열지 않는다.

## 잡

| 이름 | 기본 크론 (KST) | 환경변수 |
|------|----------------|---------|
| `lotto` | 매주 토 20:40 · 20:50 · 21:00 | `LOTTO_CRON` |
| `news` | 매시간 | `NEWS_CRON` |

여러 크론을 **`;` 로 잇는다** — `40,50 20 * * sat;0 21 * * sat`. `OrTrigger` 로 합쳐지고 잡은 하나로 유지된다. 추첨 방송은 20:35 에 시작하지만 끝나는 시각이 회차마다 달라 세 번 시도한다. 먼저 결과가 보이는 실행이 가져가고 나머지는 0건 성공으로 끝난다.

**요일은 반드시 이름(`sat`)으로 쓴다.** APScheduler 는 요일 숫자를 `0=월…6=일` 로 읽어 표준 크론(`0=일…6=토`)과 하루 어긋난다. `* * 6` 은 토요일이 아니라 **일요일**이다.

`news` 는 매시간 돌지만 일일 쿼터 25,000 중 48회(0.2%)만 쓴다. 발행일이 하루보다 오래된 기사는 저장하지 않는다(`NEWS_MAX_AGE_DAYS=1`).

## 수동 실행

엔드포인트는 `127.0.0.1` 에만 바인딩된다. 외부에서 직접 부를 수 없다.

```bash
KEY=$(grep '^WORKER_JOB_KEY=' .env_worker | cut -d= -f2)   # Claude 가 .env* 를 읽지 않는다. 사람이 실행

curl -X POST -H "X-Job-Key: $KEY" http://127.0.0.1:8003/internal/jobs/lotto/run
curl -X POST -H "X-Job-Key: $KEY" http://127.0.0.1:8003/internal/jobs/news/run
curl        -H "X-Job-Key: $KEY" http://127.0.0.1:8003/internal/jobs/status

curl http://127.0.0.1:8003/internal/health    # 헬스체크만 키가 필요 없다
```

원격 서버에서 실행하려면 SSH 터널을 쓴다.

```bash
ssh -L 8003:127.0.0.1:8003 user@server
```

응답: `202` 시작됨 · `401` 키 불일치 · `404` 없는 잡 · `409` 이미 실행 중

`202` 응답의 `run_id` 는 `collect_job_log.job_log_id` 다. 진행 상황은 `/internal/jobs/status` 로 확인한다 — 수집이 수십 초 걸려 요청을 붙들지 않는다.

## 초기 데이터 적재

```bash
uv run python -m scripts.migrate_sqlite_to_pg    # 기존 lotto.db 1,231회차 이관 (1회)
```

절차와 검증 쿼리는 [`../docs/wiki/50-ops/migration-sqlite-to-postgres.md`](../docs/wiki/50-ops/migration-sqlite-to-postgres.md).

## 스키마 마이그레이션

이 디렉토리가 **Alembic 의 유일한 소유자**다.

```bash
uv run alembic revision -m "설명"      # --autogenerate 를 쓰지 않는다
uv run alembic upgrade head --sql      # 적용 전, 나갈 DDL 을 눈으로 확인
uv run alembic upgrade head
```

**`--autogenerate` 를 쓰지 않는다.** 워커는 SQLAlchemy 모델을 두지 않는다(`target_metadata = None`). 스키마의 정본은 `scripts/ddl/001_initial_schema.sql` 이고, 마이그레이션은 그 DDL 을 `op.execute()` 로 그대로 옮겨 적는다. 모델을 두면 정본이 둘이 되고, 어긋나는 날 `db-schema` 계약이 깨진다.

`alembic.ini` 에 `sqlalchemy.url` 을 적지 않는다 — 비밀번호가 git 에 커밋된다. 접속정보는 `migrations/env.py` 가 `config.py` 에서 주입한다.

새 테이블을 만들면 백엔드의 `app_reader` 가 읽지 못할 수 있다. `ALTER DEFAULT PRIVILEGES` 설정을 확인한다 — [`../docs/wiki/10-contracts/db-schema.md`](../docs/wiki/10-contracts/db-schema.md).

**스키마를 바꾸기 전에 계약 문서를 먼저 고치고 사용자 승인을 받는다.** 백엔드 세션이 그 계약을 읽고 개발 중이다.

---

## 트러블슈팅

**기동 즉시 종료된다** — `WORKER_JOB_KEY` 가 비어 있다. 의도된 동작이다. 빈 키로 뜨면 무인증 상태가 된다.

**`401` 이 계속 난다** — 헤더 이름은 `X-Job-Key` 다. `.env` 값 앞뒤 공백을 확인한다.

**`lotto` 잡이 0건 수집하고 성공한다** — 정상이다. 다음 회차가 아직 추첨되지 않았다는 뜻이다. 다만 최신 회차가 8일 이상 낡으면 워커가 경고 로그를 남긴다 — 그때는 회차를 놓친 것이다.

**`lotto` 잡이 토요일이 아니라 일요일에 돈다** — `LOTTO_CRON` 의 요일을 숫자로 썼다. APScheduler 에서 `6` 은 일요일이다. `sat` 으로 바꾼다. 워커가 기동 시 경고 로그를 남긴다.

**네이버 위젯 파싱이 실패한다** — 위젯 HTML 구조가 바뀌었을 수 있다. 정규식은 `class="ball type\d"` 에 의존한다. [`../docs/wiki/90-external/dhlottery-blocked.md`](../docs/wiki/90-external/dhlottery-blocked.md) 참조.

**뉴스 잡이 429 를 받는다** — 일일 쿼터 초과다. `NEWS_CRON` 빈도를 낮춘다.

**뉴스 잡이 `202` 를 주고 곧바로 실패한다** — `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` 이 비어 있다. `collect_job_log.error_desc` 에 이유가 남는다. 키가 없으면 크론에는 등록되지 않고 수동 트리거만 이렇게 동작한다. 의도된 것이다 — 조용히 성공하지 않는다.

**`alembic upgrade` 가 `invalid interpolation syntax` 로 죽으며 비밀번호를 출력한다** — `alembic.ini` 의 ConfigParser 가 URL 의 `%` 를 보간으로 해석한 것이다. `env.py` 가 `set_main_option` 을 쓰지 않고 엔진을 직접 만드는 이유다. 이미 출력됐다면 **비밀번호를 교체한다.** [`../docs/wiki/10-contracts/db-schema.md`](../docs/wiki/10-contracts/db-schema.md) 의 함정 절.

**이관 스크립트가 종료코드 1 로 거부한다** — `lotto_draw` 가 비어 있지 않다. 이관은 멱등이 아니다. 사람이 `TRUNCATE lotto_draw CASCADE` 한 뒤 재실행한다.
