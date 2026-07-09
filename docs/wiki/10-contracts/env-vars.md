---
type: contract
title: "환경변수 계약과 시크릿 취급 규약"
description: "컴포넌트별 env.sample 명세, .env 열람 금지 규칙, 사용자에게 요청할 미확정 값"
tags: [contract, security, ops, tbd]
owner: shared
status: stable
sources: ["env.sample", "raw:작업지시서초안_보완.md#9"]
created: 2026-07-09
updated: 2026-07-09
---

# 환경변수 계약과 시크릿 취급 규약

## 절대 규칙 ★

**Claude 는 `.env` 로 시작하는 파일을 읽지 않는다.** 어떤 이유로도. `Read`, `cat`, `grep`, `head`, `sed` 전부 금지다.

이 규칙은 **Claude 에게만** 적용된다. **프로그램은 당연히 읽어야 한다** — pydantic-settings 든 dotenv 든.

환경변수 정보가 필요하면 **`env.sample` 을 읽는다.** 새 변수가 필요하면 `env.sample` 에 **키와 주석만** 추가하고 사용자에게 `.env` 갱신을 요청한다. 값을 추측해서 채우지 않는다.

이유는 단순하다. 시크릿이 한 번 대화 컨텍스트에 들어오면 전사 로그와 요약본에 남고, 그 뒤로는 회수할 방법이 없다. `env.sample` 은 이 규칙을 지키면서도 필요한 정보 — 어떤 키가 있고 어떤 형식인지 — 를 모두 준다.

`.env` 는 `.gitignore` 에 유지하고 `env.sample` 은 커밋한다.

---

## 컴포넌트별 분리

`.env` 를 하나만 두고 셋이 공유하지 않는다. 세 가지 이유가 있다.

첫째, **최소 권한**. 하나를 공유하면 읽기 전용이어야 할 백엔드가 쓰기 롤의 비밀번호를 갖게 된다. [[db-schema]] 의 롤 분리가 무의미해진다.

둘째, **프론트의 `NEXT_PUBLIC_*` 는 공개된다.** Next.js 는 이 접두어가 붙은 변수를 브라우저 번들에 문자열로 박아 넣는다. 같은 파일에 DB 비밀번호가 있으면 실수 하나로 유출된다.

셋째, **배포**. 컨테이너마다 다른 시크릿을 주입해야 한다.

→ `worker/env.sample`, `backend/env.sample`, `frontend/env.sample`. 루트 `env.sample` 은 공통값만 남긴다.

### 실제 파일명 — 컴포넌트마다 다르다

| 컴포넌트 | 템플릿 | 실제 파일 | 읽는 방법 |
|---------|--------|----------|----------|
| worker | `worker/env.sample` | `worker/.env_worker` | `SettingsConfigDict(env_file=".env_worker")` |
| backend | `backend/env.sample` | `backend/.env_backend` | `SettingsConfigDict(env_file=".env_backend")` |
| frontend | `frontend/env.sample` | `frontend/.env_frontend` | `next.config.ts` 에서 dotenv 로 **명시 로드** |

파일명에 컴포넌트가 드러나면 잘못된 `.env` 를 잘못된 컨테이너에 마운트하는 실수를 알아채기 쉽다. Python 쪽은 pydantic-settings 에 파일명을 넘기면 그만이다.

### 함정: Next.js 는 `.env_frontend` 를 자동으로 읽지 않는다

**증상.** `frontend/.env_frontend` 에 값을 다 채웠는데 `process.env.NEXT_PUBLIC_SITE_NAME` 이 `undefined` 다. 빌드도 성공하고 에러도 나지 않는다. 화면에만 값이 비어 있다.

**원인.** Next.js 가 자동 로드하는 파일명은 `.env`, `.env.local`, `.env.development[.local]`, `.env.production[.local]` **네 가지로 고정**돼 있다. 설정으로 바꿀 수 없다. 다른 이름의 파일은 그냥 무시된다 — 경고조차 없다.

**해법.** `next.config.ts` 최상단에서 직접 로드한다. 이 파일은 dev·build 양쪽에서 **가장 먼저** 실행되므로, 여기서 `process.env` 를 채우면 이후의 `NEXT_PUBLIC_*` 인라인 치환과 서버 컴포넌트의 `process.env` 조회가 모두 정상 동작한다.

```ts
// next.config.ts
import { config } from 'dotenv'
config({ path: '.env_frontend' })   // ← 반드시 다른 import 보다 먼저

import type { NextConfig } from 'next'
const nextConfig: NextConfig = { /* ... */ }
export default nextConfig
```

`dotenv` 를 `devDependencies` 에 넣는다. 그리고 **`next.config.ts` 를 거치지 않는 도구는 이 로더를 못 탄다** — 테스트 러너나 독립 스크립트를 쓴다면 거기서도 같은 `config({ path })` 를 호출해야 한다.

`.gitignore` 는 `.env`, `.env_worker`, `.env_backend`, `.env_frontend`, `.env.local` 을 모두 무시한다.

### 함정: pydantic 의 ValidationError 가 `.env` 를 로그에 쏟는다

**증상.** `.env_backend` 에 `DATABASE_URL` 을 빠뜨린 채 백엔드를 띄웠더니 스택트레이스에 **다른 키의 비밀번호가 그대로 찍혔다.**

```
pydantic_core._pydantic_core.ValidationError: 1 validation error for Settings
DATABASE_URL
  Field required [type=missing, input_value={'CHROMA_DB_PATH': './dat...rd': 'app_writer!*…'}, ...]
```

**원인.** pydantic 은 검증 실패 시 `input_value` 에 **입력 dict 전체**를 실어 출력한다. pydantic-settings 에서 그 dict 는 곧 `.env` 파일의 내용이다. 필드 하나가 빠진 것만으로 나머지 전부가 노출된다.

**Claude 가 `.env` 를 읽지 않는다는 규약을 지켜도 예외 처리가 그것을 무너뜨린다.** 그리고 이 트레이스는 터미널·CI 로그·대화 기록에 남는다.

**해법.** 필수 환경변수를 pydantic 의 `required` 로 두지 않는다. 빈 기본값으로 검증을 통과시킨 뒤, **값을 담지 않은** 예외를 직접 던진다.

```python
PG_PASSWORD: str = ""          # required 가 아니라 빈 기본값

def model_post_init(self, __context) -> None:
    missing = [k for k in ("PG_DB", "PG_USER", "PG_PASSWORD") if not str(getattr(self, k)).strip()]
    if missing:
        raise RuntimeError(f"필수 환경변수가 비어 있습니다: {', '.join(missing)}.")
```

"없으면 기동 거부" 라는 동작은 그대로이고, 메시지에는 **키 이름만** 담긴다. 세 컴포넌트의 필수 변수(`WORKER_JOB_KEY`, `PG_PASSWORD`, `PG_USER`, `PG_DB`) 전부에 같은 방식을 쓴다.

**같은 부류의 함정이 하루에 두 번 나왔다.** 워커에서는 Alembic 이 예외 메시지에 접속 URL 을 평문으로 실었다([[db-schema]] 의 "Alembic 이 `app_writer` 비밀번호를 평문으로 뱉는다"). 공통 원인은 **라이브러리가 실패를 설명하려고 입력값을 그대로 출력한다**는 것이다. 시크릿을 다루는 코드에서는 "어떤 값이 잘못됐나" 를 말하지 않고 "어느 키가 잘못됐나" 만 말해야 한다. 새 설정 로더를 붙일 때마다 **일부러 값을 비우고 실패시켜, 출력에 값이 섞이지 않는지 확인한다.**

### 가상환경은 uv 가 관리한다

`python -m venv` 나 `pip install` 을 직접 쓰지 않는다. `uv sync` 가 `.venv` 를 만들고 `uv.lock` 대로 설치한다. 의존성은 `uv add` / `uv remove`, 실행은 `uv run`. `uv.lock` 을 커밋해 재현 가능하게 유지한다.

**`uv` 를 `sudo` 로 실행하지 않는다** — 인터프리터 심볼릭 링크가 `/root/` 아래를 가리켜 일반 사용자가 `uv run` 을 못 쓰게 된다. [[0008-python-313-torch-pin]] 참조.

---

## `worker/env.sample`

```bash
# ── Postgres (쓰기 롤) ────────────────────────────
# 개발 DB: WSL Docker 컨테이너 bskim-dev-pg18 (postgres:18)
PG_HOST=localhost
PG_PORT=5179                  # 컨테이너 5432 → 호스트 5179
PG_DB=prod_db                 # 이미 존재하는 DB. 소유자는 prod_user
PG_USER=app_writer
PG_PASSWORD=                  # init_roles.sql 로 만든 비번

# ── 잡 스케줄 (KST). APScheduler CronTrigger 문법 ──
# 여러 크론을 `;` 로 잇는다 → OrTrigger 로 합쳐진다. 잡은 여전히 하나다.
# 추첨 방송은 20:35 시작이고 끝나는 시각이 회차마다 달라 세 번 시도한다.
# ★ 요일은 이름으로 쓴다. APScheduler 는 0=월…6=일 이라 `6` 은 토요일이 아니라 일요일이다.
LOTTO_CRON=40,50 20 * * sat;0 21 * * sat
NEWS_CRON=0 * * * *           # 매시간. 쿼터 25,000 중 48회(0.2%)만 쓴다

# lotto 잡이 '오류로' 죽었을 때의 재시도. 위 크론 3회와는 별개다.
LOTTO_RETRY_DELAY_MIN=60
LOTTO_MAX_ATTEMPT=3

# ── 수동 트리거 인증 ──────────────────────────────
# 비어 있으면 워커는 기동을 거부한다. openssl rand -hex 32
WORKER_JOB_KEY=

# ── 네이버 검색 API (뉴스) ────────────────────────
NAVER_CLIENT_ID=
NAVER_CLIENT_SECRET=
NAVER_NEWS_QUERY=로또,복권     # 쉼표 구분
NAVER_NEWS_DISPLAY=50         # 최대 100

# 발행일(KST)이 실행일로부터 이 일수보다 오래된 기사는 저장하지 않는다.
# 1 = 오늘과 어제. 0 이면 당일만이라 자정 직전 기사를 영영 놓친다.
NEWS_MAX_AGE_DAYS=1

# ── 서버 ─────────────────────────────────────────
WORKER_HOST=127.0.0.1      # 루프백 고정. 외부 노출 금지
WORKER_PORT=8003
TZ=Asia/Seoul

# ── 수집 튜닝 (봇 감지 완화). 코드에 박지 않는다 ──
CRAWL_DELAY_SEC=2.0           # 회차 간 대기
CRAWL_JITTER_SEC=0.8          # 위 값에 더할 무작위 지터 상한
CRAWL_MAX_RETRY=3
CRAWL_RETRY_DELAY_SEC=3.0
CRAWL_HTTP_TIMEOUT_SEC=10.0

# 뉴스 API 쿼터 초과(429) 대응 지수 백오프
NEWS_MAX_RETRY=3
NEWS_BACKOFF_BASE_SEC=2.0

# ── 잡 이력 정리 / catch-up ───────────────────────
STALE_RUNNING_HOURS=6         # 이 시간을 넘긴 running 행을 기동 시 failed 로 정리
CATCH_UP_DAYS=7               # lotto 마지막 성공이 이보다 오래되면 기동 직후 1회 실행
```

`WORKER_HOST` 를 `0.0.0.0` 으로 바꾸지 않는다. [[worker-jobs]] 의 보안 절 참조.

**뒤쪽 세 블록(수집 튜닝·백오프·정리)은 전부 기본값이 있다.** `.env_worker` 에 없어도 워커는 뜬다. 값을 코드가 아니라 여기 두는 이유는, 네이버가 요청 빈도에 민감해졌을 때 재배포 없이 늦출 수 있어야 하기 때문이다.

### worker 의 의존성에 `pydantic-settings` 가 포함된다

`worker/CLAUDE.md` 는 의존성을 `httpx` `apscheduler` `psycopg` `alembic` `fastapi` `uvicorn` 으로 적었지만, **같은 문서와 이 페이지가 `SettingsConfigDict(env_file=".env_worker")` 를 요구한다.** 그것은 `pydantic-settings` 의 API 다. 목록의 취지는 "무거운 ML 의존을 들이지 않는다"(`torch`·`transformers` 금지)이지 경량 설정 라이브러리 금지가 아니다.

`pydantic-settings` 는 `pydantic` 만 끌어오며 ML 스택과 무관하다. `fastapi` 가 이미 `pydantic` 을 의존한다.

## `backend/env.sample`

```bash
# ── Postgres (읽기 전용 롤) ───────────────────────
# app_writer 가 아니라 app_reader 다. 쓰기 비밀번호를 여기에 두지 않는다.
PG_HOST=localhost
PG_PORT=5179                  # 컨테이너 5432 → 호스트 5179
PG_DB=prod_db                 # 이미 존재하는 DB. 소유자는 prod_user
PG_USER=app_reader
PG_PASSWORD=

# ── 꿈해몽 벡터 DB (읽기 전용) ─────────────────────
CHROMA_DB_PATH=./data/chroma_words

BACKEND_PORT=8005
CORS_ORIGINS=http://localhost:3000
TZ=Asia/Seoul
```

백엔드에는 `WORKER_JOB_KEY` 가 **없다.** 백엔드는 워커를 부르지 않는다.

### 왜 URL 한 줄이 아니라 조각인가

이 페이지는 한때 백엔드에 `DATABASE_URL=postgresql://app_reader:<인코딩된PW>@...` 를 요구했다. **2026-07-09 에 워커와 같은 `PG_*` 조각 방식으로 통일했다.** URL 문자열은 세 가지를 요구한다.

첫째, **사람이 퍼센트 인코딩을 해야 한다.** 비밀번호에 `!` 나 `*` 가 있으면 `%21`, `%2A` 로 바꿔 적어야 한다. 잊으면 접속이 엉뚱한 이유로 실패한다.

둘째, **비밀번호가 통째로 든 문자열이 돌아다닌다.** 그 값이 예외 메시지에 실리는 순간 로그에 남는다. Alembic 이 실제로 그랬다 ([[db-schema]] 의 함정 절).

셋째, **워커와 키 이름이 달라 대조가 안 된다.** 같은 DB 를 가리키는 두 파일이 다른 문법을 쓰면, 한쪽을 복사해 다른 쪽에 붙였을 때 무엇이 어긋났는지 눈으로 알기 어렵다.

조각으로 받으면 조립은 라이브러리의 일이다. `psycopg.conninfo.make_conninfo(host=..., password=...)` 가 이스케이프를 처리하므로 비밀번호에 어떤 문자가 있어도 된다.

`PG_DB` · `PG_USER` · `PG_PASSWORD` 중 하나라도 비면 백엔드는 **기동을 거부한다.**

### 백엔드는 자기 롤을 스스로 검증한다

`.env_backend` 에 실수로 `app_writer` 자격증명이 들어가도 서버는 잘 뜬다. 코드가 쓰기를 시도하지 않으니 아무 증상이 없다. 그런데 그 순간 이 프로젝트에서 유일하게 **권한으로 강제되던** 경계가 사라진다 ([[0003-worker-writes-backend-reads]]).

그래서 백엔드는 기동 시 DB 에 직접 물어본다.

```sql
SELECT current_user, has_table_privilege(current_user, 'lotto_draw', 'INSERT');
```

`true` 면 기동을 거부한다. 설정 파일을 눈으로 검사하는 대신 붙어 보고 확인하는 것이고, **증상 없는 사고를 시끄러운 기동 실패로 바꾸는 것이다.** 테이블이 아직 없으면(워커의 마이그레이션 전) 판단을 보류하고 경고만 남긴다.

## `frontend/env.sample`

```bash
# ── 백엔드 주소 ──────────────────────────────────
# 서버 컴포넌트용 (내부망. 브라우저에 노출되지 않음)
API_BASE_URL=http://localhost:8005
# 브라우저용 (공개 번들에 박힘. 비밀값 절대 금지)
NEXT_PUBLIC_API_BASE_URL=http://localhost:8005

NEXT_PUBLIC_SITE_URL=https://<도메인>     # ← 미확정
NEXT_PUBLIC_SITE_NAME=행운상자

# 문의처. /contact 와 /privacy 에 노출된다. 비어 있으면 문의 페이지가 주소 대신
# "준비 중" 안내를 보여준다 — 동작하지 않는 가짜 주소를 만들지 않는다.
# 애드센스 심사는 연락 수단의 존재를 확인한다.
NEXT_PUBLIC_CONTACT_EMAIL=                # ← 미정

# ── 애널리틱스 ───────────────────────────────────
NEXT_PUBLIC_GA_ID=                        # G-XXXXXXXXXX
NEXT_PUBLIC_NAVER_ANALYTICS_ID=

# ── 검색엔진 소유확인 ─────────────────────────────
GOOGLE_SITE_VERIFICATION=
NAVER_SITE_VERIFICATION=

# ── 애드센스 (승인 후. 비어 있으면 광고 미렌더링) ──
NEXT_PUBLIC_ADSENSE_CLIENT=
```

### `NEXT_PUBLIC_` 접두어의 의미

접두어가 붙은 변수는 **빌드 시점에 번들에 문자열로 치환**된다. 브라우저에서 누구나 볼 수 있고, 런타임에 바꿀 수 없다. 값을 바꾸려면 다시 빌드해야 한다.

접두어가 없는 변수(`API_BASE_URL`)는 서버 컴포넌트와 라우트 핸들러에서만 읽힌다. 클라이언트 컴포넌트에서 읽으면 `undefined` 다. 이걸 디버깅하느라 시간을 쓰는 일이 흔하다.

**둘을 섞지 않는다.** 서버 컴포넌트가 백엔드를 부를 때는 `API_BASE_URL`(도커 내부 호스트명일 수 있다), 브라우저가 부를 때는 `NEXT_PUBLIC_API_BASE_URL`(공개 도메인).

빈 문자열과 미정의는 다르다. `NEXT_PUBLIC_ADSENSE_CLIENT` 가 빈 문자열이면 광고 컴포넌트는 `null` 을 반환해야 한다 — 이것이 [[adsense-readiness|애드센스 승인 전 광고 미노출]] 규칙의 구현이다.

---

## 사용자에게 요청할 항목

이 표의 항목이 채워지지 않으면 해당 Phase 를 시작할 수 없다.

| 키 | 컴포넌트 | 상태 | 막는 것 |
|----|---------|------|--------|
| `PG_HOST` `PG_PORT` `PG_DB` `PG_USER` `PG_PASSWORD` | worker | ✅ 채움 (`localhost:5179/prod_db`) | — |
| `PG_HOST` `PG_PORT` `PG_DB` `PG_USER` `PG_PASSWORD` | backend | ✅ 채움 (`app_reader`, 기동 시 롤 검증 통과) | — |
| `app_writer` / `app_reader` 롤 | Postgres | ✅ 생성·권한 테스트 통과 | — |
| `WORKER_JOB_KEY` | worker | ✅ 채움 | — |
| `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` | worker | ✅ 채움 (2026-07-09 확인) | — |
| `NEXT_PUBLIC_GA_ID` | frontend | 미발급 | Phase 4 |
| `NEXT_PUBLIC_NAVER_ANALYTICS_ID` | frontend | 미발급 | Phase 4 |
| `GOOGLE_SITE_VERIFICATION` / `NAVER_SITE_VERIFICATION` | frontend | 미발급 | Phase 4 |
| `NEXT_PUBLIC_SITE_URL` | frontend | **도메인 미확정** | Phase 4 |
| `NEXT_PUBLIC_CONTACT_EMAIL` | frontend | ✅ 채움 (2026-07-09) | — |
| `NEXT_PUBLIC_ADSENSE_CLIENT` | frontend | 승인 후 | 광고 게재 |

네이버 API 키가 채워졌고 일일 쿼터도 **25,000** 으로 확인되어 `NEWS_CRON` 이 확정됐다 ([[naver-search-api]]).

`NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` 중 하나라도 비면 워커는 **기동은 하되** `news` 잡을 크론에 등록하지 않는다. `lotto` 잡은 키와 무관하게 동작한다. 자세한 것은 [[worker-jobs]] 의 "`news` 잡" 절.

### 해소됨 — `backend/.env_backend` 의 키 불일치 (2026-07-09)

**증상.** 백엔드가 `RuntimeError: DATABASE_URL 이 비어 있습니다` 로 기동하지 못했다.

**원인.** 이 계약이 `DATABASE_URL` 을 요구했는데 실제 `.env_backend` 에는 `PG_*` 조각이 들어 있었다. **자격증명 문제가 아니라 키 이름 문제였다.**

**한때 이 자리에 "`app_writer` 자격증명이 들어 있다" 고 적혀 있었다. 그것은 틀린 추측이었다.** pydantic 의 `ValidationError` 가 뱉은 값에 `app_writer` 라는 문자열이 보였는데, 그것은 롤 이름이 아니라 `app_reader` 의 비밀번호에 우연히 들어 있던 부분 문자열이었다. **파일을 읽지 않은 채 유출된 파편으로 내용을 추론하면 이렇게 된다** — 규칙을 지키면서 추측까지 하려 들지 말고, 확인할 방법을 코드로 만든다.

**확인할 방법.** 위의 [기동 시 롤 검증](#백엔드는-자기-롤을-스스로-검증한다)이 그것이다. 실제 접속 결과 `current_user = app_reader` 이고 `lotto_draw` 에 `INSERT` 권한이 없음이 확인됐다. 권한 경계는 처음부터 온전했다.

**남은 일.** 노출된 것은 `app_reader` 의 비밀번호다(읽기 전용 롤). 위험도는 낮지만 터미널·대화 기록에 남았으므로 교체를 권한다.

```sql
ALTER ROLE app_reader PASSWORD '<새 비밀번호>';
```

교체 후 `backend/.env_backend` 의 `PG_PASSWORD` 를 갱신한다. 퍼센트 인코딩은 필요 없다.

### 감수한 위험 — `prod_db` / `prod_user`

로컬 개발 DB 인데 이름에 `prod` 접두어가 붙어 있다. 언젠가 진짜 운영 DB 와 혼동할 수 있다. **사용자가 인지하고 감수한 위험이다.** 운영 배포 시에는 다른 이름을 쓴다.

루트 `env.sample` 의 `OPEN_AI_KEY` 는 코드 어디서도 참조되지 않는다. 유지할지 지울지 아직 결정되지 않았다.

---

## 코드에서 읽는 방법

설정은 각 컴포넌트의 `config.py` (Python) 또는 `env.ts` (Next.js) **한 곳에서만** 읽는다. 모듈 여기저기서 `os.getenv` 를 호출하지 않는다.

값이 없을 때의 동작을 명시한다. 세 종류가 있다.

- **없으면 기동 거부**: `WORKER_JOB_KEY`, `PG_DB`, `PG_USER`, `PG_PASSWORD`. 없는 채로 뜨면 나중에 더 나쁜 방식으로 실패한다.
- **없으면 기능 비활성**: `NEXT_PUBLIC_ADSENSE_CLIENT`, `NEXT_PUBLIC_GA_ID`. 없으면 그 컴포넌트가 조용히 아무것도 렌더링하지 않는다.
- **없으면 기본값**: `LOTTO_CRON`, `WORKER_PORT`, `TZ`.

관련: [[db-schema]] · [[worker-jobs]] · [[local-setup]] · [[adsense-readiness]] · [[analytics]]
