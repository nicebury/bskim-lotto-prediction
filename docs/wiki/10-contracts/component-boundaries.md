---
type: contract
title: "컴포넌트 경계 — 세션이 가장 먼저 읽는 페이지"
description: "worker·backend·frontend 가 각각 무엇을 소유하고 무엇을 하지 않는가. 세 세션의 접점"
tags: [contract, security]
owner: shared
status: stable
sources: ["raw:작업지시서초안_보완.md#7"]
created: 2026-07-09
updated: 2026-07-09
---

# 컴포넌트 경계

**세 개의 Claude Code 세션이 동시에, 서로를 모른 채 개발한다.** 이 페이지는 각 세션이 시작할 때 가장 먼저 읽는 문서다. 자기 경계를 알고 나면 자기 계약 페이지로 간다.

세 세션은 서로의 **코드를 읽지 않는다.** 유일한 접점은 아래 두 계약이다.

```
worker ──(write, Alembic 소유)──▶ ┌──────────┐
                                  │ Postgres │   ← 계약: db-schema.md
backend ──(read-only 롤)─────────▶ └──────────┘
   │
   └──(REST)──▶ frontend            ← 계약: api-contract.md
```

---

## 한눈에

| | worker | backend | frontend |
|---|---|---|---|
| **역할** | 외부 수집 → DB 쓰기 | DB 읽기 → REST | 렌더링·SEO |
| **디렉토리** | `worker/` | `backend/` | `frontend/` |
| **포트** | 8003 (`127.0.0.1`) | 8005 | 3000 |
| **DB 롤** | `app_writer` | `app_reader` | 없음 |
| **스택** | Python 3.13 · FastAPI · APScheduler | Python 3.13 · FastAPI · numpy · torch | Next.js App Router · TS |
| **env 파일** | `.env_worker` | `.env_backend` | `.env_frontend` |
| **읽을 계약** | [[worker-jobs]] · [[db-schema]] | [[api-contract]] · [[db-schema]] | [[api-contract]] |

---

## worker — 세션 A

**한다.** 외부 소스에서 데이터를 가져와 Postgres 에 쓴다. 잡 레지스트리(`lotto`, `news`), 크론, 잡별 락, 수동 트리거, `collect_job_log` 로깅, Alembic 마이그레이션.

**소유한다.** `worker/**`, `worker/migrations/`(Alembic 의 **유일한** 소유자), 그리고 `lotto_draw` · `lotto_prize` · `lotto_news` · `collect_job_log` 테이블의 스키마.

**하지 않는다.** HTML 렌더링. 예측 계산. 공개 API 제공. 다른 디렉토리 코드 수정. `/internal/*` 를 `0.0.0.0` 에 바인딩하거나 nginx 에 노출. 관리자 UI. 뉴스 **원문** 저장.

**ML 의존성이 없다.** `torch` 를 추가하지 않는다. 이것이 worker 를 분리한 실질적 이득이다 — 무거운 의존성의 위험이 backend 하나로 격리된다.

**스키마를 바꾸려면** 먼저 [[db-schema]] 를 고치고 사용자 승인을 받는다. backend 세션이 그 계약을 읽고 동시에 개발 중이다.

## backend — 세션 B

**한다.** Postgres 를 읽어 계산하고 JSON 으로 준다. 예측(앙상블·몬테카를로)과 꿈해몽(kiwipiepy·ChromaDB)은 **기존 코드를 이식**한다 — 재작성하지 않는다.

**소유한다.** `backend/**`, [[api-contract]] 의 구현.

**하지 않는다.** DB 쓰기(롤이 막는다). 스키마 마이그레이션. 외부 크롤링. 스케줄링. **worker 의 존재를 알지 못한다** — `/internal/*` 를 프록시하지 않는다.

**응답 필드에 `probability` `win_rate` `accuracy` `confidence` `hit_rate` 를 쓰지 않는다.** 조합의 성향을 사실로만 서술한다. 이것은 스타일이 아니라 정책이다 ([[forbidden-expressions]]).

## frontend — 세션 C

**한다.** Next.js App Router 로 서버 렌더링, SEO 메타데이터, GA4·네이버 애널리틱스.

**소유한다.** `frontend/**`(신규 앱), `docs/wiki/20-design/**`, `docs/wiki/30-seo/**`.

**하지 않는다.** DB 직접 접근. **비즈니스 계산** — 빈도·패턴·HOT/COLD 를 브라우저에서 다시 집계하지 않는다. 서버와 숫자가 달라지면 어느 쪽이 맞는지 아무도 모른다. `frontend_old/` 수정(참조만).

---

## 왜 이렇게 나누는가

**권한으로 강제되는 경계가 하나 있다.** backend 는 `app_reader` 롤로 접속하므로 DB 에 쓰려 하면 Postgres 가 거부한다. 규율이 아니라 권한이 막는다 — 규율은 6개월 뒤 "조회수를 기록하면 편할 텐데" 앞에서 협상 가능해지지만, `GRANT SELECT` 만 받은 롤은 협상하지 않는다 ([[0003-worker-writes-backend-reads]]).

**backend 에 쓰기 요구가 생기면 worker 에게 HTTP 로 던지지 않는다.** worker 는 쓰기 서비스가 아니라 배치 잡 러너다. 답은 소유권 기반 롤 확장(`app_user` + 자기 스키마)이거나 Postgres outbox 테이블이다. 자세한 것은 [[0003-worker-writes-backend-reads]] 의 "백엔드에 쓰기 요구가 생기면" 절.

**worker 의 트리거는 루프백에만 있다.** 공개 웹서버에 수동 실행 엔드포인트를 노출하지 않는다 ([[0004-manual-trigger-on-worker]]).

---

## 계약을 바꾸려면

`10-contracts/` 는 위키의 나머지와 지위가 다르다.

> 일반 페이지: 코드와 어긋나면 **위키가 틀린 것**이다.
> 계약 페이지: 계약과 어긋나면 **코드가 틀린 것**이다.

바꾸려면 **영향도 조사 → 사용자 승인 → 계약 수정 → `log.md` 기록** 순서를 지킨다. 말없이 바꾸지 않는다. 계약이 흔들리면 세 세션이 동시에 재작업하고, 병렬화의 이득이 전부 사라진다.

**다른 세션의 작업이 필요한 변경이라면 코드를 쓰기 전에 위키부터 쓴다.** 위키가 세 세션의 유일한 통신 수단이다.

---

## 전 세션 공통

- 루트 `CLAUDE.md` + 자기 디렉토리 `CLAUDE.md` 를 모두 따른다. 충돌하면 자기 디렉토리가 이긴다.
- 실행법·트러블슈팅은 자기 디렉토리 `README.md`.
- **`.env` 로 시작하는 파일을 Claude 가 읽지 않는다.** `env.sample` 만 읽는다. (프로그램은 읽는다.)
- **금지 표현**을 코드·주석·UI 문구·API 필드명 어디에도 쓰지 않는다 ([[forbidden-expressions]]).
- 주석은 **무엇을 하는지가 아니라 왜 그렇게 했는지**를 쓴다.

관련: [[db-schema]] · [[api-contract]] · [[worker-jobs]] · [[env-vars]] · [[forbidden-expressions]] · [[0001-monorepo-3-sessions]]
