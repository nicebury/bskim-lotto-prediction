# CLAUDE.md — 세션 C: 프론트엔드

루트 `CLAUDE.md` 의 규칙이 여기에도 적용된다. 아래는 이 세션만의 제약이다.
실행법·트러블슈팅은 `README.md`, 설계 근거는 `docs/wiki/` 에 있다.

## 책임

Next.js App Router 로 화면을 렌더링하고, SEO 메타데이터와 애널리틱스를 붙인다.

## 소유

- `frontend/**` (신규 Next.js 앱)
- `docs/wiki/20-design/**`, `docs/wiki/30-seo/**`

## 절대 하지 않는 것

- DB 직접 접근
- **비즈니스 계산.** 빈도·패턴·HOT/COLD 를 브라우저에서 다시 집계하지 않는다. 서버와 숫자가 달라지면 어느 쪽이 맞는지 아무도 모른다
- `worker/` 또는 `backend/` 의 코드 수정
- `frontend_old/` 수정 — **참조만.** 삭제는 Phase 3 완료 후 사용자 확인을 거친다
- 애드센스 승인 전 광고 코드 삽입

## 매 턴 지킬 것

- **금지 표현을 UI 문구·`title`·`description` 어디에도 쓰지 않는다.** 추천 결과 화면에는 면책 고지를 반드시 붙인다
- **볼 색상은 동행복권 공식 5구간.** 시안(`docs/raw/메인샘플.png`)의 볼 색을 따르지 않는다. 색만으로 구간을 전달하지 않는다 — `aria-label` 에 구간을 명시한다
- **mobile-first CSS.** 기본이 모바일이고 `min-width` 로 확장한다. `body` 는 절대 가로로 스크롤되지 않는다
- **터치 타겟 최소 44×44px**
- **CLS 방지.** 볼·차트·뉴스 썸네일·광고 슬롯에 `min-height` 또는 `aspect-ratio` 를 예약한다
- **서버용 `API_BASE_URL` 과 브라우저용 `NEXT_PUBLIC_API_BASE_URL` 을 섞지 않는다.** `NEXT_PUBLIC_*` 은 번들에 박혀 공개된다 — 비밀값을 넣지 않는다
- **환경변수 파일은 `.env_frontend` 다.** Next.js 는 이 이름을 자동으로 읽지 않으므로 `next.config.ts` 최상단에서 `dotenv` 로 명시 로드한다. 이걸 빼면 모든 변수가 에러 없이 `undefined` 가 된다 → `docs/wiki/10-contracts/env-vars.md`
- `NEXT_PUBLIC_ADSENSE_CLIENT` 가 비면 광고 컴포넌트는 `null` 을 반환한다
- 사이트명을 하드코딩하지 않는다. `NEXT_PUBLIC_SITE_NAME` 하나만 쓴다

## 함정 — 반드시 읽는다

App Router 는 클라이언트 라우팅이라 **GA4 기본 스니펫이 최초 진입 때만 `page_view` 를 보낸다.**
링크로 이동한 페이지는 집계되지 않아 "페이지별 체류시간" 이 측정되지 않는다.
`usePathname()` 구독 컴포넌트에서 수동 전송해야 한다 → `docs/wiki/30-seo/analytics.md`

## 먼저 읽을 위키

| 문서 | 내용 |
|------|------|
| `docs/wiki/10-contracts/component-boundaries.md` | ★ **가장 먼저.** 소유 경계와 세션 간 접점 |
| `docs/wiki/10-contracts/api-contract.md` | 부를 엔드포인트와 응답 스키마 |
| `docs/wiki/20-design/design-tokens.md` | 색·타이포·간격 |
| `docs/wiki/20-design/responsive-rules.md` | 브레이크포인트 3단 |
| `docs/wiki/20-design/components.md` | 볼·카드·헤더·캐러셀 사양 |
| `docs/wiki/20-design/accessibility.md` | a11y 체크리스트 |
| `docs/wiki/30-seo/*` | 메타데이터·구조화데이터·애널리틱스·애드센스 |
| `docs/wiki/40-domain/forbidden-expressions.md` | 금지 표현 |

URL 구조는 `docs/raw/작업지시초안.md` 5.1 절 그대로 따른다.

## 완료 기준

주요 페이지가 **JS 를 끈 상태에서도** 본문 텍스트를 보여준다 (`curl` 로 HTML 확인).
Lighthouse SEO 100, CLS < 0.1. 모바일 375px 폭에서 가로 스크롤 없음.
