# 행운상자

로또 6/45 당첨결과·번호 통계·복권 뉴스·재미용 번호 추천을 제공하는 **정보형 대시보드**.

> 이 서비스는 복권을 판매하지 않고 당첨을 보장하지 않는다. 번호 추천은 과거 당첨번호 통계와 랜덤 알고리즘을 활용한 참고용·재미용 시뮬레이션이다.

---

## 구조

세 개의 독립 컴포넌트를 한 저장소에 둔다. Claude Code 세션도 셋으로 나뉘어 각 디렉토리에서 병렬로 작업한다.

```
worker/    수집 전용. 외부 소스 → Postgres 쓰기. 배치·스케줄·수동 트리거   :8003
backend/      웹 API 전용. Postgres 읽기 → REST. 예측·꿈해몽 계산            :8005
frontend/     Next.js App Router. 렌더링·SEO·애널리틱스                     :3000
docs/wiki/    LLM Wiki — 세 세션이 공유하는 지식체계
docs/raw/     원본 기획·시안 (읽기 전용)
frontend_old/ 구 Vite 앱. 참조용 아카이브. Phase 3 완료 후 삭제 예정
work_order/   구 작업지시서 아카이브
```

워커가 DB 에 **쓰고**, 백엔드는 읽기 전용 롤로 **읽기만** 한다. 셋의 유일한 접점은 `docs/wiki/10-contracts/` 의 계약이다.

---

## 시작하기

**먼저 [`docs/wiki/index.md`](docs/wiki/index.md) 를 읽는다.** 설계·계약·절차가 전부 거기 있다.

| 하려는 일 | 읽을 곳 |
|----------|--------|
| 로컬 환경 구축 | [`docs/wiki/50-ops/local-setup.md`](docs/wiki/50-ops/local-setup.md) |
| 워커 개발 | `worker/README.md` |
| 백엔드 개발 | `backend/README.md` |
| 프론트 개발 | `frontend/README.md` |
| 왜 이렇게 만들었나 | [`docs/wiki/00-decisions/`](docs/wiki/00-decisions/) (ADR) |

각 컴포넌트의 `.env` 는 그 디렉토리의 `env.sample` 을 복사해 만든다. 하나의 `.env` 를 공유하지 않는다.

---

## 기술 스택

| 컴포넌트 | 스택 |
|---------|------|
| worker | Python 3.13 · uv · FastAPI · APScheduler · httpx · psycopg · Alembic |
| backend | Python 3.13 · uv · FastAPI · psycopg · numpy · kiwipiepy · sentence-transformers · ChromaDB |
| frontend | Next.js App Router · TypeScript |
| DB | PostgreSQL (관계형) + ChromaDB 파일 (꿈해몽 임베딩) |

데이터 소스는 **네이버 검색 위젯**(당첨번호)과 **네이버 검색 API**(뉴스)다. 동행복권 공식 API 는 차단 상태다 — [`docs/wiki/90-external/dhlottery-blocked.md`](docs/wiki/90-external/dhlottery-blocked.md).

---

## 진행 현황

| Phase | 내용 | 상태 |
|-------|------|------|
| 0 | 위키 구축 · 계약 확정 · 저장소 재편 | ✅ 완료 |
| 1 | Postgres 스키마 · 이관 · worker | 대기 (DB 접속정보 필요) |
| 2 | backend | 대기 |
| 3 | frontend | 대기 |
| 4 | SEO 등록 · 애널리틱스 · 애드센스 | 대기 |
| 5 | 배포 | 미정 |

**막혀 있는 항목**은 [`docs/wiki/index.md`](docs/wiki/index.md) 하단의 "지금 열려 있는 미결 항목" 표에 있다.

---

## 라이선스

MIT
