# 행운상자 위키 — 색인

로또 6/45 정보·통계 대시보드 **행운상자**의 공유 지식체계. 세 개의 Claude Code 세션(워커 · 백엔드 · 프론트엔드)이 이 위키만 읽고 서로를 모른 채 개발한다.

**처음이라면 [SCHEMA.md](SCHEMA.md) 를 먼저 읽는다.** 규약이 거기 있다.

---

## 어디부터 읽을까

| 상황 | 읽을 것 |
|------|--------|
| **어떤 세션이든 시작할 때** | [component-boundaries](10-contracts/component-boundaries.md) ← 여기부터 |
| 이 프로젝트가 처음 | [SCHEMA](SCHEMA.md) → [0001](00-decisions/0001-monorepo-3-sessions.md) |
| 워커 세션 시작 | [worker-jobs](10-contracts/worker-jobs.md) · [db-schema](10-contracts/db-schema.md) · [naver-search-api](90-external/naver-search-api.md) |
| 백엔드 세션 시작 | [api-contract](10-contracts/api-contract.md) · [db-schema](10-contracts/db-schema.md) · [prediction-algorithm](40-domain/prediction-algorithm.md) |
| 프론트 세션 시작 | [api-contract](10-contracts/api-contract.md) · [design-tokens](20-design/design-tokens.md) · [metadata-strategy](30-seo/metadata-strategy.md) |
| 로컬 환경 구축 | [local-setup](50-ops/local-setup.md) |
| UI 문구·필드명을 정할 때 | [forbidden-expressions](40-domain/forbidden-expressions.md) |

---

## 00-decisions — 결정 기록 (ADR)

되돌리려면 사용자 확인이 필요하다. 각 페이지의 절반 이상이 **왜** 그렇게 정했는지에 할애돼 있다.

- [0001 — 모노레포 유지, 3개 세션으로 분리](00-decisions/0001-monorepo-3-sessions.md) — 계약이 한 커밋에서 검증되어야 하므로 저장소를 쪼개지 않는다
- [0002 — 프론트엔드는 Next.js App Router](00-decisions/0002-nextjs-app-router.md) — 유입이 전적으로 검색이라 서버 렌더링이 필수
- [0003 — 워커가 쓰고, 백엔드는 읽기만 한다](00-decisions/0003-worker-writes-backend-reads.md) — 규율은 잊히고 권한은 잊히지 않는다
- [0004 — 수동 트리거는 워커에 두고 외부에 노출하지 않는다](00-decisions/0004-manual-trigger-on-worker.md) — 루프백 + X-Job-Key. 관리자 UI 없음
- [0005 — SQLite 를 Postgres 로 이관한다](00-decisions/0005-postgres-migration.md) — 두 프로세스가 동시 접근하고 롤 분리가 필요하다
- [0006 — ChromaDB 를 파일로 유지한다](00-decisions/0006-keep-chromadb-not-pgvector.md) — 정적이고 작은 사전에 pgvector 는 과잉
- [0007 — 사이트명은 '행운상자'](00-decisions/0007-site-name-haengunsangja.md) — '복권'을 빼서 판매 사이트 오인을 피한다
- [0008 — Python 3.13 + torch>=2.13 핀, 상한도 건다](00-decisions/0008-python-313-torch-pin.md) — 상한 없는 requires-python 이 과거 사고의 원인
- [0009 — 볼 색상은 시안이 아니라 공식 규칙](00-decisions/0009-official-ball-colors-over-mockup.md) — 학습된 색-구간 매핑을 깨면 신뢰를 잃는다
- [0010 — DB 명명 표준화, API 필드는 유지](00-decisions/0010-db-naming-standard.md) — 공개 계약을 DB 스키마에 결합시키지 않는다

## 10-contracts — 세션 간 계약 ★

**여기가 단일 진실 출처다.** 계약과 코드가 어긋나면 **코드가 틀린 것**이다. 바꾸려면 영향도 조사 → 사용자 승인 → `log.md` 기록.

- [component-boundaries](10-contracts/component-boundaries.md) — ★ **세션이 가장 먼저 읽는다.** 누가 무엇을 소유하고 무엇을 하지 않는가
- [db-schema](10-contracts/db-schema.md) — Postgres DDL, **DB↔API 매핑표**, 롤 권한. `ALTER DEFAULT PRIVILEGES` 함정
- [db-naming-standard](10-contracts/db-naming-standard.md) — 표준단어·도메인 접미어·제약 명명규칙. 새 컬럼을 만들 때 읽는다
- [api-contract](10-contracts/api-contract.md) — 백엔드 REST 엔드포인트와 **표현 규약**(확률 필드명 금지)
- [worker-jobs](10-contracts/worker-jobs.md) — `lotto`·`news` 잡의 크론·락·수동 트리거 스펙
- [env-vars](10-contracts/env-vars.md) — 컴포넌트별 `env.sample`, **`.env` 열람 금지**, 사용자에게 요청할 미확정 값

## 20-design — 디자인 시스템

- [design-tokens](20-design/design-tokens.md) — 색·타이포·간격·radius·shadow CSS 변수. 라이트/다크 두 세트
- [responsive-rules](20-design/responsive-rules.md) — 브레이크포인트 3단, mobile-first, 터치 타겟 44px, CLS 방지
- [components](20-design/components.md) — 볼·카드·헤더·캐러셀·광고 슬롯 사양
- [accessibility](20-design/accessibility.md) — a11y 체크리스트. 색만으로 정보를 전달하지 않기

## 30-seo — 검색·광고·분석

- [metadata-strategy](30-seo/metadata-strategy.md) — `generateMetadata`, `sitemap.ts`, `robots.ts`, 라우트별 렌더링 전략
- [structured-data](30-seo/structured-data.md) — JSON-LD 타입별 적용. FAQPage 는 실제 FAQ 가 보일 때만
- [analytics](30-seo/analytics.md) — ⚠ **App Router 에서 page_view 가 최초 진입만 잡히는 함정**과 해법
- [adsense-readiness](30-seo/adsense-readiness.md) — 승인 전 콘텐츠 기준, 광고 배치 규칙, 미승인 시 미렌더링
- [search-console-registration](30-seo/search-console-registration.md) — 서치콘솔·서치어드바이저 등록 절차

## 40-domain — 도메인 지식

- [forbidden-expressions](40-domain/forbidden-expressions.md) — ★ **전 세션 구속.** 금지 표현과 그 이유
- [lotto-rules](40-domain/lotto-rules.md) — 6/45 규칙, 등위 판정, 추첨 일정, 볼 5구간
- [prediction-algorithm](40-domain/prediction-algorithm.md) — 앙상블 4모듈 + 몬테카를로. **문서-코드 불일치 기록**
- [dream-pipeline](40-domain/dream-pipeline.md) — kiwipiepy → ChromaDB → tier별 조합. 첫 요청 20초 함정

## 50-ops — 운영

- [local-setup](50-ops/local-setup.md) — WSL Docker Postgres, uv, Next.js. 포트 8003/8005/3000
- [migration-sqlite-to-postgres](50-ops/migration-sqlite-to-postgres.md) — 1,231행 1회 이관. 검증 SQL 과 롤백
- [wsl-drvfs-pitfall](50-ops/wsl-drvfs-pitfall.md) — ⚠ `/mnt/d` 에서 디렉토리 rename 시 파일이 사라진 것처럼 보인다. `rm -rf` 하기 전에 읽는다
- [deployment](50-ops/deployment.md) — ⚠ **미정.** 결정해야 할 질문 목록

## 90-external — 외부 의존

- [naver-search-api](90-external/naver-search-api.md) — 일일 쿼터 **25,000**. 당일 필터와 3중 중복 제거. ⚠ 재배포 약관은 미확인
- [dhlottery-blocked](90-external/dhlottery-blocked.md) — 공식 API 차단 이력과 네이버 위젯 대체 구현
- [trademark-check](90-external/trademark-check.md) — ⚠ **KIPRIS 상표 검색·도메인 미확인**

---

## 지금 열려 있는 미결 항목

`tbd` 태그가 붙은 페이지들이다. 이 항목들이 Phase 를 막는다.

| 막는 것 | 필요한 것 | 페이지 |
|--------|----------|-------|
| 공개 (막지는 않음) | 네이버 뉴스 **재배포 약관·출처 표기** 확인 | [naver-search-api](90-external/naver-search-api.md) |
| 도메인 구매 | KIPRIS 상표 검색 | [trademark-check](90-external/trademark-check.md) |
| Phase 4 | GA4 · 네이버 애널리틱스 · 서치콘솔 계정 | [analytics](30-seo/analytics.md) |
| Phase 5 | 배포 환경 결정 · ChromaDB 보관 방법 | [deployment](50-ops/deployment.md) |

**Phase 1(worker) · Phase 2(backend) · Phase 3(frontend) 를 막는 것은 없다.** Postgres 롤과 `.env_*` 는 준비됐고(2026-07-09), 네이버 API 키와 일일 쿼터(25,000)도 확인되어 `news` 잡이 확정 크론으로 동작한다.

**Phase 1(worker) 은 구현·검증 완료다** (2026-07-09). 스키마 적용, 1,231회차 이관, 두 잡의 수동 트리거가 백엔드 없이 단독 검증됐다.

---

## 유지보수

```bash
# 구조 lint — 고아 페이지, 깨진 위키링크, 크기 초과, frontmatter 누락
python3 ~/.claude/skills/llm-wiki/scripts/wiki_lint.py docs/wiki/

# 규모 통계 — 색인 샤딩 시점 판단
python3 ~/.claude/skills/llm-wiki/scripts/wiki_stats.py docs/wiki/

# 역링크 찾기
grep -rl "\[\[db-schema\]\]" docs/wiki/
```

현재 **평면 색인**이다. 페이지가 150개를 넘거나 이 파일이 300줄을 넘으면 `indexes/` 로 샤딩한다.
