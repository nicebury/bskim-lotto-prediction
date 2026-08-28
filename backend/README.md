# backend — 웹 API

Postgres 를 읽어 계산하고 JSON 으로 제공한다. DB 에 쓰지 않고, 크롤링하지 않고, 스케줄링하지 않는다.

제약과 규칙은 `CLAUDE.md`, API 계약은 [`api-contract.md`](../docs/wiki/10-contracts/api-contract.md) 와 [`api-contract-stats.md`](../docs/wiki/10-contracts/api-contract-stats.md)(통계 전용).

---

## 셋업

```bash
cd backend
cp env.sample .env_backend   # PG_USER 는 app_reader 다. 쓰기 비밀번호를 두지 않는다
uv sync                      # .venv 를 만들고 uv.lock 대로 설치한다
```

**가상환경은 uv 가 관리한다.** `python -m venv` 나 `pip install` 을 직접 쓰지 않는다. 의존성은 `uv add` / `uv remove`, 실행은 `uv run`. `uv.lock` 을 커밋한다.

`.env` 가 아니라 **`.env_backend`** 다. pydantic-settings 에 파일명을 명시해야 읽힌다.

```python
model_config = SettingsConfigDict(env_file=".env_backend")
```

`PG_DB` · `PG_USER` · `PG_PASSWORD` 중 하나라도 비면 **기동을 거부한다.** DB 주소 없이 뜬 서버는 헬스체크만 통과하고 모든 요청에서 500 을 내는, 가장 알아채기 어려운 형태로 고장난다.

접속 정보를 URL 한 줄이 아니라 **조각으로** 받는다. URL 이면 비밀번호의 특수문자를 사람이 퍼센트 인코딩해야 하고(`!` → `%21`), 그 규칙을 잊으면 접속이 조용히 실패하거나 라이브러리가 URL 을 통째로 예외 메시지에 실어 비밀번호를 로그에 남긴다. 조각을 넘기면 인코딩은 psycopg 의 일이 된다.

기동 시 **접속한 롤이 정말 쓰기 권한이 없는지 DB 에 물어본다.** `.env_backend` 에 실수로 `app_writer` 자격증명이 들어가면 서버가 뜨지 않는다. 설정 파일을 눈으로 검사하는 대신 붙어 보고 확인하는 것이고, 증상 없는 사고를 시끄러운 기동 실패로 바꾸는 것이다.

### torch import 스모크 테스트 — 반드시 통과시킨다

```bash
uv run python -c "import torch; print(torch.__version__)"
# 확인됨 (2026-07-09): Python 3.13.8 + torch 2.13.0+cu130
```

실패하면 `pyproject.toml` 의 `requires-python` 을 `>=3.12,<3.13` 으로 내린다. 워커·프론트는 영향받지 않는다. 배경은 [`../docs/wiki/00-decisions/0008-python-313-torch-pin.md`](../docs/wiki/00-decisions/0008-python-313-torch-pin.md).

**`uv` 나 venv 생성을 절대 `sudo` 로 실행하지 않는다.**

## 실행

```bash
uv run uvicorn app.main:app --port 8005 --reload
```

Swagger: http://localhost:8005/docs

## 테스트

```bash
uv run pytest                      # 전체
uv run pytest -m "not integration" # DB 없이 도는 순수 로직만
uv run pytest -m integration       # 실제 Postgres 가 필요하다
```

`integration` 표시가 붙은 테스트는 `lotto_draw` 테이블이 없거나 DB 에 붙지 못하면 **이유를 밝히며 skip 한다.** 워커가 아직 마이그레이션을 돌리지 않은 상태에서도 순수 로직은 검증돼야 하고, 조용히 통과해 초록불만 켜지는 일은 없어야 한다.

`tests/test_db_readonly.py` 는 **쓰기가 실패하는 것을 확인한다.** 이 테스트가 실패하면(=쓰기가 성공하면) 코드가 아니라 롤 설정이 잘못된 것이다.

`tests/test_contract_conformance.py` 는 **계약 전수검사**다. 모든 응답을 한 번에 훑어 금지 필드명·DB 컬럼명 누출·비KST 시각을 찾는다. 엔드포인트를 추가하면 그 응답도 여기 `payloads` 에 넣는다 — 넣지 않으면 새 엔드포인트만 검사를 피해 간다.

## 스모크 테스트

```bash
curl http://localhost:8005/health
curl http://localhost:8005/api/lotto/latest
curl 'http://localhost:8005/api/lotto/rounds?page=1&size=3'
curl 'http://localhost:8005/api/lotto/stats/hot-cold?window=20'

# 재현성 — 두 번 호출해 같은 결과가 나와야 한다
curl -X POST 'http://localhost:8005/api/lotto/recommend?sets=3&seed=1'
curl -X POST 'http://localhost:8005/api/lotto/recommend?sets=3&seed=1'
```

### 권한 분리 검증

`app_reader` 로 쓰기가 **실패해야** 한다. 성공하면 롤 설정이 잘못된 것이다.

```bash
uv run pytest -m integration tests/test_db_readonly.py
# app_reader 로 INSERT·CREATE TABLE 이 실패하고, SELECT 는 성공하는 것을 확인한다
```

비밀번호 없이 확인하려면 슈퍼유저 세션에서 롤만 갈아탄다.

```bash
docker exec -u postgres bskim-dev-pg18 psql -d prod_db \
  -c "SET ROLE app_reader; INSERT INTO lotto_draw (round_no, draw_ymd, winning_no1,
      winning_no2, winning_no3, winning_no4, winning_no5, winning_no6, bonus_no)
      VALUES (99999,'2099-01-01',1,2,3,4,5,6,7);"
```

---

## 이 디렉토리의 것들

| 경로 | 내용 |
|------|------|
| `app/config.py` | 환경변수를 읽는 **유일한** 곳 |
| `app/db.py` | psycopg 커넥션 풀. 세션을 `default_transaction_read_only` 로 연다 |
| `app/repository.py` | 모든 SQL. **DB 컬럼명이 이 파일 밖으로 나가지 않는다** |
| `app/concurrency.py` | 무거운 계산의 동시 실행 게이트. 몬테카를로는 한 번에 하나만 |
| `app/domain/` | `traits`(조합 성향) · `stats`(공개 통계·기간 선택) · `recommend`(전략 6종 어댑터) · `number_scores`(번호별 통계 점수. 꿈해몽 부족분 채움용, 최신 회차로 캐시) |
| `app/routers/` | `lotto` · `stats` · `recommend` · `dream` · `news` · `video` · `admin`(운영자 전용) · `meta` |
| `app/prediction/` | 앙상블 4모듈 + 몬테카를로 + 대체 전략 5종. **재작성하지 않는다** |
| `app/dream/` | kiwipiepy → ChromaDB → 번호 생성. `keywords.py` 만 임베딩 모델을 건너뛴다. 부족분 채움은 `domain/number_scores` 를 쓴다 |
| `data/chroma_words/` | 꿈해몽 임베딩 36MB(4,803 단어). **직접 쓰지 않는다.** `.gitignore` 되어 **git 에 없다** |
| `data/custom_words.json` | 사전에 덧붙인 단어 목록. **git 에 들어간다** — 사전이 사라져도 무엇을 더했는지가 남는다 |
| `scripts/add_custom_words.py` | 위 JSON 을 사전에 반영(`upsert`). **실행 전 서버를 멈춘다** |

알고리즘 명세는 [`../docs/wiki/40-domain/prediction-algorithm.md`](../docs/wiki/40-domain/prediction-algorithm.md) 와 [`../docs/wiki/40-domain/dream-pipeline.md`](../docs/wiki/40-domain/dream-pipeline.md).

### 엔드포인트

| 메서드 | 경로 | 비고 |
|--------|------|------|
| GET | `/health` | DB 를 확인하지 않는 얕은 체크 |
| GET | `/api/lotto/latest` | 데이터가 없으면 404 |
| GET | `/api/lotto/rounds` | `page`·`size`(≤200). 범위 밖 page 는 빈 배열 200 |
| GET | `/api/lotto/rounds/index` | 회차-날짜 경량 목록. **`/rounds/{round_no}` 보다 먼저 선언해야 한다** |
| GET | `/api/lotto/rounds/{round_no}` | `prize_tiers` 는 당분간 빈 배열 |
| GET | `/api/lotto/stats/frequency` | `window=20\|50\|100\|all`, `include_bonus` |
| GET | `/api/lotto/stats/hot-cold` | `top`(기본 10). `overdue` 만 역대 전체에서 계산 |
| GET | `/api/lotto/stats/pattern` | `sum_histogram`·`consecutive_counts` 포함 |
| GET | `/api/lotto/stats/number/{n}` | 번호 하나. `rank` 는 서버가 45개를 정렬해 준다 |
| POST | `/api/lotto/recommend` | `strategy`·`sets`(1~10)·`seed`. `disclaimer` 필수. `ensemble` 은 **한 번에 하나만** |
| GET | `/api/dream/keywords` | 임베딩 모델을 로드하지 않는다 |
| POST | `/api/dream/recommend` | **첫 요청 20초**. 모자란 자리는 통계 점수로 채운다. `exclude`(최대 39)·응답 `from_text` |
| GET | `/api/videos` | `kind`(all\|normal\|shorts)·`round`·`game`. **캐시 24시간 상한**, 표시 조건 WHERE 필수 |
| GET | `/api/videos/{id}` | `game='lotto'` 일 때만 회차 정보를 함께 담는다 |
| GET | `/api/news` | `lotto_news` 가 비면 빈 배열 |
| POST | `/api/admin/login` · `/logout` | **운영자 전용.** `ADMIN_TOKEN` 이 비면 503 |
| GET | `/api/admin/job-logs` | 수집 잡 이력. 커서 페이징(`before_id`), `total` 없음 |
| GET | `/api/meta/sitemap-entries` | 프론트 `sitemap.ts` 전용 |

---

## 트러블슈팅

**기동 시 `RuntimeError: 필수 환경변수가 비어 있습니다`** — `.env_backend` 에 `PG_DB`/`PG_USER`/`PG_PASSWORD` 중 하나가 없다. `env.sample` 을 보고 채운다.

**기동 시 `RuntimeError: '...' 롤은 lotto_draw 에 INSERT 할 수 있습니다`** — 쓰기 롤로 접속했다. `PG_USER` 를 `app_reader` 로 바꾼다. 백엔드에 `app_writer` 자격증명을 두면 [권한 분리](../docs/wiki/00-decisions/0003-worker-writes-backend-reads.md)가 무의미해진다 — 코드가 쓰기를 시도하지 않아도 프로세스를 장악한 쪽은 쓸 수 있다.

**첫 `/api/dream/recommend` 요청이 20초 걸린다** — 정상이다. SentenceTransformer 모델과 ChromaDB 가 lazy 싱글톤으로 로드된다. 이후 요청은 즉시 응답한다. 프론트는 반드시 로딩 상태를 표시한다. `/api/dream/keywords` 는 이 경로를 타지 않는다.

**`permission denied for table <새테이블>`** — 워커가 새 테이블을 추가했는데 `ALTER DEFAULT PRIVILEGES` 가 없다. [`../docs/wiki/10-contracts/db-schema.md`](../docs/wiki/10-contracts/db-schema.md) 의 함정 절 참조. 사용자에게는 500 과 일반 메시지만 나가고, 원문은 서버 로그에 SQLSTATE 42501 로 남는다.

**`uv run` 이 `Failed to query Python interpreter ... Permission denied`** — 과거에 `sudo uv sync` 로 venv 를 만들었다. `rm -rf .venv && uv sync` 를 일반 사용자로 실행한다.

**`import torch` 가 `IndentationError` 로 죽는다** — torch 버전이 낮다. `torch>=2.13` 을 확인한다.

**브라우저에서만 통계가 비고 서버 로그에는 200 만 남는다** — CORS 다. `CORS_ORIGINS` 에 그 오리진이 없다. `localhost:3000` 과 `127.0.0.1:3000` 은 **다른 오리진**이라 둘 다 써야 한다. 서버는 정상 응답하고 브라우저만 막으므로 서버 로그로는 알 수 없다 — 브라우저 콘솔을 본다. 003 개편으로 통계 조회가 CSR 로 바뀌어 이 경로를 타게 됐다.

```bash
curl -s -o /dev/null -D- -H "Origin: http://127.0.0.1:3000" \
  http://localhost:8005/api/lotto/stats/number/15 | grep -i access-control-allow-origin
# 이 헤더가 안 나오면 브라우저는 차단한다
```

**통계 API 가 `422` 를 반환한다** — 기간 조회는 `from_round` 와 `to_round` 를 **함께** 주어야 한다. 하나만 주거나 `from_round > to_round` 면 422 다. 조용히 보정하지 않는 이유는, 사용자가 잘못 입력한 사실을 화면이 알려야 하기 때문이다. 반면 범위가 데이터 밖으로 나간 것은 오류가 아니라 **교집합으로 잘리고**, 응답의 `from_round`/`to_round` 에 잘린 실제 값이 담긴다.

**`/api/lotto/rounds/index` 가 `422` 를 반환한다** — 라우트 선언 순서가 뒤집혔다. FastAPI 는 등록 순서대로 매칭하므로 이 경로가 `/rounds/{round_no}` 뒤에 있으면 `index` 를 회차 번호로 읽는다. `app/routers/lotto.py` 에서 순서를 확인한다.

**`/api/admin/*` 가 전부 `503` 을 반환한다** — `.env_backend` 에 `ADMIN_TOKEN` 또는 `ADMIN_SESSION_SECRET` 이 없다. `openssl rand -hex 32` 를 **두 번** 돌려 서로 다른 값으로 채운다. ⚠ 같은 값을 넣으면 **기동을 거부한다** — 같으면 쿠키 서명에서 토큰을 역산할 여지가 생긴다. 비어 있는 것을 '인증 없음' 으로 통과시키지 않는 이유: `secrets.compare_digest("", "")` 는 **True** 라서 빈 토큰을 보낸 누구나 들어온다. 공개 API 는 이 값들과 무관하게 정상 동작한다.

**로그인은 되는데 바로 401 이 된다** — 서버 시계가 뒤로 갔거나, `ADMIN_SESSION_SECRET` 을 바꾼 뒤 옛 쿠키가 남아 있다. 브라우저에서 쿠키를 지우고 다시 로그인한다. 세션 만료는 `ADMIN_SESSION_HOURS`(기본 12)다.

**영상 API 가 `422` 를 반환한다** — `kind` 는 `all|normal|shorts`, `game` 은 `lotto|pension` 만 받는다. ⚠ `kind=normal` 에 `shorts_hint='unknown'` 인 영상은 **일부러 넣지 않는다** — 추정값을 어느 한쪽으로 밀면 그 순간 확정이 된다. `all` 에서만 보인다.

**추천 API 가 `422` 를 반환한다** — 회차가 50개 미만이다. 워커가 먼저 데이터를 채워야 한다. `strategy=pure_random` 만은 이 경우에도 200 이다.

**`strategy=ensemble` 응답이 2.5초를 넘고, 동시에 부르면 그만큼 더 걸린다** — 정상이다. 몬테카를로 5만 회는 단독 2.5초이고, 이 계산은 **동시에 돌리면 오히려 느려지므로**(2건 6.5배, 4건 24.8배) 백엔드가 한 번에 하나만 실행한다. 그래서 동시 4건은 62초가 아니라 약 10초(2.5×4)로 **줄 서서** 끝난다. 나머지 전략 5종과 다른 엔드포인트는 이 대기에 걸리지 않는다.

서버 로그에 `무거운 계산(ensemble) 슬롯을 기다린 시간 N초` 경고가 잦게 뜨면 추천 요청이 몰리고 있다는 뜻이다. `RECOMMEND_MAX_CONCURRENCY` 를 **올리지 않는다** — 올리면 더 느려진다. 근거와 대안은 [`../docs/wiki/00-decisions/0012-serialize-monte-carlo.md`](../docs/wiki/00-decisions/0012-serialize-monte-carlo.md).

**꿈 사전에 단어를 더하고 싶다** — `data/custom_words.json` 에 적고 `uv run python scripts/add_custom_words.py --apply`. `--apply` 없이 부르면 무엇이 바뀔지만 보여준다. **전체 재임베딩은 필요 없다** — 새 단어만 같은 모델로 인코딩한다. ⚠ **백엔드 서버를 멈추고 실행한다.** 서버가 HNSW 인덱스 파일을 열고 있으면 복구할 수 없는 사전이 상한다(스크립트가 감지해 거부한다). 사전에 넣어도 kiwipiepy 가 그 단어를 못 뽑으면 검색에 도달하지 못하므로 `DreamAnalyzer.analyze()` 로 먼저 확인한다. 자세한 절차는 [`../docs/wiki/40-domain/dream-pipeline.md`](../docs/wiki/40-domain/dream-pipeline.md).

**`FileNotFoundError: chroma_words`** — `CHROMA_DB_PATH` 를 확인한다. 상대경로는 `backend/` 기준으로 풀린다. 이 디렉토리는 이관 대상이 아니며 파일 그대로 쓴다.
