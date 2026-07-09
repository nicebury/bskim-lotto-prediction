---
type: ops
title: "로컬 개발 환경 셋업"
description: "저장소를 처음 연 개발자가 worker·backend·frontend 세 컴포넌트를 로컬에서 구동하는 절차"
tags: [ops]
owner: shared
status: stable
sources: ["raw:작업지시서초안_보완.md#9", "raw:작업지시서초안_보완.md#2", "env.sample", "backend/run.py"]
created: 2026-07-09
updated: 2026-07-09
---

# 로컬 개발 환경 셋업

저장소를 처음 클론한 개발자가 세 컴포넌트(`worker` / `backend` / `frontend`)를 로컬에서 띄우기까지의 절차다. 세션 경계(누가 무엇을 소유하는가)는 여기서 다루지 않는다 — 각 세션의 `CLAUDE.md` 와 `[[db-schema]]` 계약을 본다.

## 절대 규칙 — `.env` 로 시작하는 파일은 Claude 가 읽지 않는다

**Claude 는 어떤 이유로도 `.env*` 를 읽지 않는다.** `cat` / `grep` / `Read` 전부 금지다. (**프로그램은 당연히 읽는다** — 시크릿이 대화 기록에 남지 않게 하려는 규칙이다.) 환경변수 정보가 필요하면 **`env.sample` 만** 읽는다. 새 변수가 필요하면 `env.sample` 에 **키와 주석만** 추가하고 값은 사용자가 채우도록 요청한다.

실제 파일은 컴포넌트마다 이름이 다르다 — `worker/.env_worker`, `backend/.env_backend`, `frontend/.env_frontend`. 모두 `.gitignore` 로 유지하고 `env.sample` 만 커밋한다. 변수 명세는 `[[env-vars]]` 가 정본이다.

## 포트 배정

| 컴포넌트 | 포트 | 근거 |
|---------|------|------|
| worker | **8003** | 내부 트리거 API. `127.0.0.1` 바인딩 |
| backend | **8005** | 웹 API |
| frontend | **3000** | Next.js dev 서버 |

worker 의 `/internal/*` 는 로컬에서도 `127.0.0.1` 에만 바인딩하고 외부에 노출하지 않는다.

## 사전 준비

- **WSL** (Windows 환경). 아래 명령은 WSL 셸에서 실행한다.
- **Docker** (Postgres 컨테이너용). 사용자가 이미 로컬 WSL Docker 에 Postgres 를 설치·구동해 둔 상태를 전제한다.
- **uv** (Python 패키지 매니저). worker·backend 공통.
- **Node.js 20+** + 패키지 매니저. frontend 용.

## 1. Postgres (WSL Docker)

개발 DB 는 사용자의 로컬 WSL Docker 안에 있다. **이미 구축되어 있다** (2026-07-09).

| 항목 | 값 |
|------|-----|
| 컨테이너 | `bskim-dev-pg18` (`postgres:18.4`) |
| 호스트 포트 | **5179** (컨테이너 5432) |
| 데이터베이스 | `prod_db` — 소유자 `prod_user`(슈퍼유저 아님, DBeaver 접속용) |
| 롤 | `app_writer`(worker, 쓰기) · `app_reader`(backend, 읽기 전용) |

두 롤은 생성되어 있고 권한 분리 테스트도 통과했다. 비밀번호는 사용자가 `.env_worker` / `.env_backend` 에 채워 두었다.

롤 생성 SQL 과 권한(특히 `ALTER DEFAULT PRIVILEGES FOR ROLE`)은 `[[db-schema]]` 가 정본이고, 실행 스크립트는 `worker/scripts/init_roles.sql` 이다.

> `prod_user` 는 `app_writer` 의 멤버다. 그래야 DBeaver 에서 worker 가 만든 테이블이 보인다. **운영에서는 이 멤버십을 부여하지 않는다.** 스키마는 worker 의 Alembic 마이그레이션이 만들고, 최초 데이터는 `[[migration-sqlite-to-postgres]]` 절차로 기존 SQLite(`backend/data/lotto.db`, 1,231회차)에서 이관한다.

## 2. worker (Python 3.13, 포트 8003)

```bash
cd worker
cp env.sample .env_worker   # 값은 사용자가 채운다 (Claude 는 .env 를 읽지 않는다)
uv sync                     # uv 가 .venv 를 만들고 uv.lock 대로 설치한다
```

`.env` 가 아니라 `.env_worker` 다. 파일명 규약은 `[[env-vars]]` 참조.

worker 는 ML 의존이 없어 Python 3.13 을 제약 없이 쓴다. 실행·잡 트리거 방법은 `worker/README.md` 와 `[[worker-jobs]]` 를 본다.

## 3. backend (Python 3.13, 포트 8005)

```bash
cd backend
cp env.sample .env_backend
uv sync
uv run python -c "import torch; print(torch.__version__)"   # 스모크: torch import 확인
```

backend 는 `torch` / `sentence-transformers` 를 쓰므로 첫 `uv sync` 직후 위 import 스모크를 **반드시** 통과시킨다. 실패하면 backend 만 Python 3.12 로 내린다(worker·frontend 는 영향 없음). ChromaDB(`backend/data/chroma_words`)는 읽기 전용으로 그대로 쓴다 — Postgres 로 이관하지 않는다(`[[0006-keep-chromadb-not-pgvector]]`).

`DATABASE_URL` 은 `app_reader`(읽기 전용) 롤을 가리킨다. backend 가 실수로 쓰기를 시도하면 코드리뷰가 아니라 DB 권한이 막는다.

## 4. frontend (Node.js, 포트 3000)

```bash
cd frontend
cp env.sample .env_frontend   # next.config.ts 에서 dotenv 로 명시 로드해야 읽힌다
npm install
npm run dev
```

`API_BASE_URL`(서버 컴포넌트용, 내부망)과 `NEXT_PUBLIC_API_BASE_URL`(브라우저용, 공개)을 섞지 않는다. `NEXT_PUBLIC_*` 값은 번들에 박혀 공개되므로 비밀값을 넣지 않는다.

## 스모크 테스트

세 컴포넌트를 각각 별도 셸에서 띄운 뒤:

```bash
# backend 헬스체크
curl http://localhost:8005/health

# worker 헬스체크 (내부 API)
curl http://127.0.0.1:8003/internal/health

# frontend
curl -s http://localhost:3000/ | head
```

worker 의 잡 수동 트리거·상태 조회는 `X-Job-Key` 헤더가 필요하다 — `[[worker-jobs]]` 참고.

## WSL 에서 개발한다면

이 저장소는 Windows 의 `D:\` 에 있고 WSL 이 `/mnt/d` 로 마운트한다. **`/mnt/*` 위에서 디렉토리를 rename 하면 파일이 사라진 것처럼 보인다.** 실제로는 사라지지 않았지만, 당황해서 `rm -rf` 로 정리하면 그때 진짜로 지워진다.

증상·원인·해법은 [[wsl-drvfs-pitfall]] 에 있다. `/mnt` 아래에서 `mv` 나 `git mv` 로 디렉토리를 옮기기 전에 읽는다.

## 관련 문서

- 최초 데이터 적재: `[[migration-sqlite-to-postgres]]`
- WSL 함정: `[[wsl-drvfs-pitfall]]`
- 배포(미정): `[[deployment]]`
- 외부 소스: `[[naver-search-api]]`, `[[dhlottery-blocked]]`
- 환경변수 명세: `[[env-vars]]`
