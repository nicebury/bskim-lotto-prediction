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
| 백엔드 세션 시작 | [api-contract](10-contracts/api-contract.md) · [db-schema](10-contracts/db-schema.md) · [prediction-algorithm](40-domain/prediction-algorithm.md) · [api-contract-analysis](10-contracts/api-contract-analysis.md) |
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
- [0011 — 상세페이지 이미지는 빌드타임 큐레이션](00-decisions/0011-build-time-image-curation.md) — 런타임 호출·워커 수집이 아니라 사람이 골라 커밋한다
- [0012 — 몬테카를로 추천은 한 번에 하나만](00-decisions/0012-serialize-monte-carlo.md) — 동시 실행이 n² 로 무너진다. 알고리즘이 아니라 실행 방식을 고친다
- [0013 — 꿈 소재별 해몽 풀이는 프론트 상수로 둔다](00-decisions/0013-dream-meanings-in-frontend.md) — 색인 대상 10개뿐인 원고를 위해 계약을 늘리지 않는다
- [0014 — 번호놀이터 게임](00-decisions/0014-number-playground.md) — 미니게임 6종으로 번호를 뽑는다. 순수 Canvas, 결과 미저장, 게임마다 세션 분리

## 10-contracts — 세션 간 계약 ★

**여기가 단일 진실 출처다.** 계약과 코드가 어긋나면 **코드가 틀린 것**이다. 바꾸려면 영향도 조사 → 사용자 승인 → `log.md` 기록.

- [component-boundaries](10-contracts/component-boundaries.md) — ★ **세션이 가장 먼저 읽는다.** 누가 무엇을 소유하고 무엇을 하지 않는가
- [db-schema](10-contracts/db-schema.md) — Postgres DDL, **DB↔API 매핑표**, 롤 권한. `ALTER DEFAULT PRIVILEGES` 함정
- [db-naming-standard](10-contracts/db-naming-standard.md) — 표준단어·도메인 접미어·제약 명명규칙. 새 컬럼을 만들 때 읽는다
- [api-contract](10-contracts/api-contract.md) — 백엔드 REST 엔드포인트와 **표현 규약**(확률 필드명 금지). 회차·추천·꿈해몽·뉴스·사이트맵
- [api-contract-admin](10-contracts/api-contract-admin.md) — 운영자 전용 계약. 아이디+비밀번호+**OTP 2단계**, 커서 페이징. 2026-09-08 에 위에서 분리
- [api-contract-stats](10-contracts/api-contract-stats.md) — 통계 전용 계약. `window`·**기간 조회**·구간 메타·정렬 규약. 2026-08-18 에 위에서 분리
- [api-contract-analysis](10-contracts/api-contract-analysis.md) — ✅ **구현 완료**(2026-09-03). 조합 분석 계약(`GET /api/lotto/analyze`). 번호별 지표·조합 패턴(AC값·이월수)·**과거 회차 대조**·가정 집계. 2026-09-01 에 프론트가 화면 요구에서 역산해 먼저 적었고, 백엔드 구현 뒤 프론트의 클라이언트 계산(`lib/analyze.ts`)을 걷어냈다
- [worker-jobs](10-contracts/worker-jobs.md) — `lotto`·`news`·`video_*` 잡의 크론·락·수동 트리거 스펙. 2026-08-28 에 영상 잡 3종 추가
- [env-vars](10-contracts/env-vars.md) — 컴포넌트별 `env.sample`, **`.env` 열람 금지**, 사용자에게 요청할 미확정 값
- [playground-game-contract](10-contracts/playground-game-contract.md) — ★ 번호놀이터 게임 모듈 계약. 게임 세션 6개의 유일한 접점. NumberPool·좌표계·소유 경계

## 20-design — 디자인 시스템

- [design-tokens](20-design/design-tokens.md) — 색·타이포·간격·radius·shadow CSS 변수. 라이트/다크 두 세트
- [responsive-rules](20-design/responsive-rules.md) — 브레이크포인트 3단, mobile-first, 터치 타겟 44px, CLS 방지
- [components](20-design/components.md) — 볼·카드·헤더·캐러셀·광고 슬롯 사양
- [number-analysis-page](20-design/number-analysis-page.md) — ⏳ **draft.** `/lotto/analyze` 4블록 구성. **돌아왔을 때 뽑은 번호를 지키는 방법**(sessionStorage)과 색인 금지 정책
- [accessibility](20-design/accessibility.md) — a11y 체크리스트. 색만으로 정보를 전달하지 않기
- [home-v3-trust-data](20-design/home-v3-trust-data.md) — ✕ **미채택 시안. 코드는 2026-09-02 에 삭제됐고 git 에도 없다.** 40~60대·모바일 조건에서 내린 결정(본문 17px·헤어라인 조판·강조색 잠금)과 함정 3건만 참고용으로 남긴다
- [home-v2-concept](20-design/home-v2-concept.md) — ✕ **미채택 시안. 코드는 2026-08-21 에 삭제됐다**(`24ad827` 에 남아 있다). 격리 기법(`body:has()` 스코프·트랙 넘침)만 참고용으로 남긴다
- [playground](20-design/playground.md) — 번호놀이터 페이지 설계. 라우트·결과 화면·진행 보존·메뉴/광고 연결. ✅ **헤더 내비 폭 실측 완료** — 1024px 에서 nav 565px·1줄·잘림 없음. `/lotto` 를 뺀 것으로 충분했고 예비해 둔 조이기(폰트·패딩 축소, 영상/뉴스 드로어 이동)는 쓰지 않았다. 메뉴를 더 늘리면 다시 잰다
- [game-g01-shooting](20-design/game-g01-shooting.md) — G01 오리 사격장 작업 지시서(은닉형)
- [game-g02-crane](20-design/game-g02-crane.md) — G02 크레인 뽑기 작업 지시서(예약형). ★ 가장 먼저 착수해 계약을 실전 검증한다
- [game-g03-flyball](20-design/game-g03-flyball.md) — G03 **로또볼 홈런** 작업 지시서(색힌트형·타이밍). **✅ 2026-09-10 전면 재설계 완료** — 게이지 두 번 → **야구 타격 한 번**, 번호 숨김(색만 노출), 기회 9번·40m 문턱
- [game-g04-curling](20-design/game-g04-curling.md) — G04 얼음판 컬링 작업 지시서. 유일한 보드형 45칸, 중복 시 재투
- [game-g05-plinko](20-design/game-g05-plinko.md) — G05 플린코 낙하 작업 지시서. 45칸이 아니라 9빈인 이유. **✅ 2026-09-16 구현 완료** — 색 힌트형 전환(번호 대신 구간색, 깨져야 나온다)·stage 640→430·9행 재설계. 못 배치는 1,800회 실측으로 확정(벽 위에 못을 얹는다)
- [game-g06-ringdash](20-design/game-g06-ringdash.md) — G06 링 통과 비행 작업 지시서. ⚠ 이탈 방지가 최대 과제

## 30-seo — 검색·광고·분석

- [metadata-strategy](30-seo/metadata-strategy.md) — `generateMetadata`, `sitemap.ts`, `robots.ts`, 라우트별 렌더링 전략
- [structured-data](30-seo/structured-data.md) — JSON-LD 타입별 적용. FAQPage 는 실제 FAQ 가 보일 때만
- [analytics](30-seo/analytics.md) — ⚠ **App Router 에서 page_view 가 최초 진입만 잡히는 함정**과 해법
- [adsense-readiness](30-seo/adsense-readiness.md) — 승인 전 콘텐츠 기준, 광고 배치 규칙, 미승인 시 미렌더링
- [search-console-registration](30-seo/search-console-registration.md) — 서치콘솔·서치어드바이저 등록 절차

## 40-domain — 도메인 지식

- [forbidden-expressions](40-domain/forbidden-expressions.md) — ★ **전 세션 구속.** 금지 표현과 그 이유
- [lotto-rules](40-domain/lotto-rules.md) — 6/45 규칙, 등위 판정, 추첨 일정, 볼 5구간
- [prediction-algorithm](40-domain/prediction-algorithm.md) — 앙상블 4모듈 + 몬테카를로. **문서-코드 불일치 기록**, 비용 실측과 동시성 함정
- [dream-pipeline](40-domain/dream-pipeline.md) — kiwipiepy → ChromaDB → tier별 조합. 첫 요청 20초 함정

## 50-ops — 운영

- [local-setup](50-ops/local-setup.md) — WSL Docker Postgres, uv, Next.js. 포트 8003/8005/3000
- [migration-sqlite-to-postgres](50-ops/migration-sqlite-to-postgres.md) — 1,231행 1회 이관. 검증 SQL 과 롤백
- [wsl-drvfs-pitfall](50-ops/wsl-drvfs-pitfall.md) — ⚠ `/mnt/d` 에서 디렉토리 rename 시 파일이 사라진 것처럼 보인다. `rm -rf` 하기 전에 읽는다
- [deployment](50-ops/deployment.md) — ⚠ **미정.** 결정해야 할 질문 목록
- [크롤링 방어](50-ops/crawling-defense.md) — 당첨번호는 막을 대상이 아니다. 진짜 열린 곳은 HTML 이 아니라 공개된 백엔드 API 다

## 90-external — 외부 의존

- [naver-search-api](90-external/naver-search-api.md) — 일일 쿼터 **25,000**. 신선도 필터와 3중 중복 제거. ⚠ 재배포 약관은 미확인
- [youtube-data-api](90-external/youtube-data-api.md) — ⚠ **`search.list` 하루 100회 · 데이터 30일 보관 제한.** 쇼츠 판별 불가와 RSS 를 쓰지 않는 이유
- [dhlottery-blocked](90-external/dhlottery-blocked.md) — ⚠ **수집 정책 미결.** 네이버 `robots.txt` 전면 금지 확인, 백필 중단. 위젯이 등위별·판매점까지 준다는 사실도 여기
- [trademark-check](90-external/trademark-check.md) — ⚠ **KIPRIS 상표 검색·도메인 미확인**
- [pexels-image-usage](90-external/pexels-image-usage.md) — Pexels License 사실, 빌드타임 큐레이션, 인물 배제. 저작권 최종 판단은 사용자

---

## 지금 열려 있는 미결 항목

`tbd` 태그가 붙은 페이지들이다. 이 항목들이 Phase 를 막는다.

| 막는 것 | 필요한 것 | 페이지 |
|--------|----------|-------|
| **등위별(`lotto_prize`) · 판매점 수집** | ⚠ **수집 정책·법적 검토.** 네이버 `robots.txt` 가 전면 금지(`Disallow: /`)임을 확인. 데이터베이스제작자 권리 검토 필요. (1등 정보 백필은 완료) | [dhlottery-blocked](90-external/dhlottery-blocked.md) |
| 공개 (막지는 않음) | 네이버 뉴스 **재배포 약관·출처 표기** 확인 | [naver-search-api](90-external/naver-search-api.md) |
| **뉴스 32일 결손 복구** | ⚠ **1회성 백필 여부 판단.** 워커가 멈춘 2026-07-16~08-16 뉴스가 0건이고 크론으로는 채워지지 않는다. 백필은 위 재배포 약관 판단에 걸린다 | [naver-search-api](90-external/naver-search-api.md) |
| **영상 수집 시작** | `YOUTUBE_API_KEY` 발급. Cloud Console → YouTube Data API v3 활성화 → API 키(제한 걸기) | [youtube-data-api](90-external/youtube-data-api.md) · [env-vars](10-contracts/env-vars.md) |
| 공개 (막지는 않음) | 유튜브 30일 보관 정책의 "갱신" 정의, 애드센스와 III.G.1.d 해석 | [youtube-data-api](90-external/youtube-data-api.md) |
| 도메인 구매 | KIPRIS 상표 검색 | [trademark-check](90-external/trademark-check.md) |
| Phase 4 | ⚠ **사용자만 채울 수 있는 값 6종.** GA4 측정 ID · 네이버 애널리틱스 ID · 구글/네이버 소유확인 문자열 · 도메인(`NEXT_PUBLIC_SITE_URL`) · 문의 메일 · (승인 후) 애드센스 클라이언트. **코드는 전부 준비돼 있고 목 값으로 동작을 검증했다**(2026-08-21) — 값만 `.env_frontend` 에 넣으면 된다 | [analytics](30-seo/analytics.md) · [env-vars](10-contracts/env-vars.md) |
| Phase 5 | 배포 환경 결정 · ChromaDB 보관 방법 | [deployment](50-ops/deployment.md) |

Postgres 롤은 준비됐고(2026-07-09), 네이버 API 키와 일일 쿼터(25,000)도 확인되어 `news` 잡이 확정 크론으로 동작한다.

**Phase 1(worker) 은 구현·검증 완료다** (2026-07-09). 스키마 적용, 1,231회차 이관, 두 잡의 수동 트리거가 백엔드 없이 단독 검증됐다.

**Phase 2(backend) 는 구현·검증 완료다** (2026-07-09). [[api-contract]] 의 전 엔드포인트가 200 을 반환하고, `sets=3&seed=1` 두 호출이 바이트 단위로 같으며, `app_reader` 의 쓰기가 권한으로 거부된다. 단위 40 + 통합 27 테스트 통과. 개발 DB(1,231회차·뉴스 75건)에 직접 붙어 전 엔드포인트 200 을 확인했다. 기동 시 접속 롤이 `app_reader` 이고 쓰기 권한이 없음을 백엔드가 스스로 검증한다.

**백엔드는 V2(002) 이후 전면 재검증됐다** (2026-08-12). 계약의 전 엔드포인트를 개발 DB(1,232회차·뉴스 172건)에 붙여 응답 키·정렬·필드 정의·금지 필드명까지 자동 검사해 **위반 0건**. 이 과정에서 **추천 API 가 동시 요청에서 n² 로 무너지던 원인을 찾아 고쳤다** — 동시 4건 62.6초 → 10.1초([[0012-serialize-monte-carlo]]). 알고리즘은 건드리지 않았고 `seed` 결과가 수정 전과 바이트 단위로 같다. 테스트 94개 통과. **003 통계 개편의 백엔드 선행 5건도 구현·검증했다** (2026-08-18) — 기간 조회(`from_round`~`to_round`)와 구간 메타 4종, `hot-cold` 의 `top`, 신규 `GET /stats/number/{n}`·`GET /rounds/index`, `pattern` 의 `sum_histogram`·`consecutive_counts`. 전부 추가만 하는 하위호환 변경이고 워커·DB 는 건드리지 않았다. 계약 전수 자동검사 위반 0건, 테스트 145개 통과.

**백엔드가 2026-08-28 계약 변경 세 건을 전부 구현했다.** 계약 선언 19개 엔드포인트 대비 **누락 0·계약에 없는 구현 0**. **계약 전수검사를 테스트로 만들어 저장소에 남겼다**(`tests/test_contract_conformance.py`) — 종전에는 한 번 돌리고 버려 다시 돌릴 수 없었다. 모든 응답에서 금지 필드명·DB 컬럼명 누출·비KST 시각을 훑어 **위반 0건**.

**① 유튜브 영상 계약을 구현했다** (2026-08-28). `GET /api/videos` · `GET /api/videos/{id}` 가 200 을 반환한다 — 워커가 `lotto_video` 마이그레이션을 이미 돌려 놓아 **실제 스키마에 대해** 검증했고(0행, `app_reader` SELECT 정상), `ALTER DEFAULT PRIVILEGES` 함정에는 걸리지 않았다. 계약이 이 리소스에만 건 제약 셋(**캐시 24시간 상한** · **표시 조건 WHERE** · **`shorts_hint` boolean 금지**)을 전부 코드로 강제했고 테스트가 잡는다. 회차 연결은 **백엔드가 `game='lotto'` 일 때만** 조인해 담기로 정했다 — 프론트에 맡기면 그 검사를 잊을 위험이 옮겨갈 뿐 사라지지 않는다. **② 꿈해몽에 `exclude`(최대 39)와 `from_text` 를 더했다**(프론트 요청 2건). `_stem_to_noun` 이 만든 비단어(`크함`·`꾸음`)를 검색 후보에서 걸렀다 — 전부 하위호환이다. `dream-pipeline.md` 의 백엔드 요청 블록 둘은 완료 기록으로 닫았다.

**③ 운영자 전용 수집 로그 API 를 구현했다**(`/api/admin/login`·`/logout`·`/job-logs`). 계약을 다시 훑다가 빠뜨린 것을 발견해 채웠다. ⚠ **`ADMIN_TOKEN`·`ADMIN_SESSION_SECRET` 을 사용자가 채워야 화면이 열린다**(`openssl rand -hex 32` 를 두 번, 서로 다른 값으로). 비어 있는 동안 `/api/admin/*` 는 503 이고 공개 API 는 정상이다 — 빈 값을 통과시키지 않는 이유는 `compare_digest("", "")` 가 **True** 이기 때문이다.

**Phase 3(frontend) 는 구현 완료다** (2026-07-09). 초안 5.1 의 URL 22개, 애드센스 정책 페이지 4종, [[api-contract]] 정합. 백엔드가 없어도 빌드·렌더가 통과하고(조회 실패 시 폴백), 계약을 그대로 흉내낸 목 백엔드로 렌더링을 확인했다. 남은 것은 Phase 4 의 측정 ID·도메인이다.

**375px 실측 방법을 확보했다** (2026-08-12). 종전에 "헤드리스 브라우저 설치에 `sudo` 가 필요해 불가"로 남겼던 항목이다. Windows 크롬 헤드리스는 `--window-size=375` 를 줘도 **창을 512px 아래로 줄이지 않아**(실측 `VIEWPORT=512x1102`) 정상 레이아웃이 잘린 것처럼 보인다. 512 창 안에 폭 375 짜리 `<iframe>` 을 띄운 로컬 HTML 을 캡처하면 그 안쪽이 정확히 375 CSS px 뷰포트가 된다 — 설치가 필요 없다. 절차는 [log.md](log.md) 의 2026-08-12 항목 참조.

**Lighthouse·접근성·375px 을 전부 실측했고 미결이 아니다** (2026-08-21). 헤드리스 크롬은 WSL 에 설치하지 않고 **Windows 쪽 node·크롬을 `cmd.exe /c` 로** 부른다(절차: `frontend/README.md`). 14개 페이지 **SEO 100 · 접근성 100 · 모범사례 100 · CLS 0.000**, 성능 83~92. axe(WCAG 2.2 AA) 20개 페이지 × 라이트·다크 위반 0건, 375px 가로 넘침 0건. ⚠ 그 과정에서 **측정 자체의 함정 둘**을 확인했다 — `next dev` 가 켜져 있으면 `next start` 가 개발용 청크를 서빙해 성능 수치가 무의미해지고, 백엔드가 꺼져 있으면 통계 화면이 껍데기만 렌더돼 아무것도 검증하지 못한다(목 백엔드로 데이터를 넣자 결함이 새로 드러났다).

**워커가 33일 멈춰 있었고 복구했다** (2026-08-18). 잡 이력이 7/15 20:29 에서 끊겨 있었다 — 크론 버그가 아니라 개발 PC 에서 워커 프로세스가 떠 있지 않았던 것이다. 기동하자 계약의 catch-up 이 즉시 발화해 **1233~1237 다섯 회차를 전부 수집**했고 다섯 회차 모두 독립 언론 보도와 일치했다. **DB 기준 회차가 1,232 → 1,237 로 바뀌었다** — 백엔드·프론트가 003 통계 화면을 검증할 때 이 수를 쓴다. 뉴스는 263건(7/15 → 8/18). 다만 **2026-07-16~08-16 의 뉴스 32일치는 영구 결손**이다: `news` 는 catch-up 대상이 아니고 신선도 필터가 하루 넘은 기사를 버려 크론으로 메워지지 않는다. 뉴스 목록에 그 구멍이 보이면 수집 코드의 버그가 아니다. 계약의 "놓친 뉴스는 다음 주기에 어차피 검색된다" 는 서술은 **틀린 것으로 확인돼 정정**했다([[worker-jobs]]).

**새 메인 시안 `/v2` 는 삭제됐다** (2026-08-21). 2026-08-12 에 비교용으로 만들었으나 사용자가 쓰지 않기로 했고(2026-08-18) 삭제를 지시했다. 삭제 전 전수 조사에서 v2 는 `@/lib/*` 를 쓰기만 하는 leaf 였고 바깥에서 참조하는 곳이 0건이라 라우트 하나(`/v2`)만 사라졌다 — 공유 청크 해시까지 동일. 코드는 `24ad827` 에 남아 있다. 거기서 얻은 **격리 기법과 함정 두 가지**(`body:has()` 스코프 오버라이드, grid 암시적 트랙이 max-content 로 넘치는 문제)는 재사용 가치가 있어 [[home-v2-concept]] 에 남겼다.

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
