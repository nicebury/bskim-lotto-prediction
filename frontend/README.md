# frontend — Next.js App Router

화면 렌더링, SEO 메타데이터, 애널리틱스. DB 를 모르고 비즈니스 계산을 하지 않는다.

제약과 규칙은 `CLAUDE.md`, 디자인 시스템은 [`../docs/wiki/20-design/`](../docs/wiki/20-design/), SEO 는 [`../docs/wiki/30-seo/`](../docs/wiki/30-seo/), 부를 API 는 [`../docs/wiki/10-contracts/api-contract.md`](../docs/wiki/10-contracts/api-contract.md).

구 Vite 앱은 `../frontend_old/` 에 있다. **참조만 하고 수정하지 않는다.**

---

## 셋업

```bash
cd frontend
cp env.sample .env_frontend   # 이미 있다면 덮어쓰지 않는다
npm install
npm run dev                   # http://localhost:3000
```

백엔드(`:8005`)가 떠 있어야 데이터가 나온다. **떠 있지 않아도 빌드와 렌더는 통과한다** — 모든 조회 함수가 실패 시 `null`(목록은 빈 봉투)을 반환하고 화면은 폴백 문구를 보여준다. 세 세션이 병렬로 개발하기 때문에 이 성질이 필요하다.

### `.env_frontend` 를 읽게 만들기 — 반드시 필요하다

Next.js 가 자동으로 읽는 파일명은 `.env`, `.env.local`, `.env.development[.local]`, `.env.production[.local]` **네 가지로 고정**돼 있고 설정으로 바꿀 수 없다. `.env_frontend` 는 그냥 무시된다 — 경고도 에러도 없이 모든 변수가 `undefined` 가 된다.

`next.config.ts` 최상단에서 `dotenv` 로 직접 로드한다. 이 파일은 dev·build 양쪽에서 가장 먼저 실행되므로, 여기서 `process.env` 를 채우면 `NEXT_PUBLIC_*` 인라인 치환도 서버 컴포넌트의 `process.env` 조회도 정상 동작한다.

`next.config.ts` 를 거치지 않는 도구(테스트 러너, 독립 스크립트)는 이 로더를 타지 않으므로 거기서도 같은 호출이 필요하다.

## 환경변수 — 두 가지를 섞지 않는다

| 변수 | 누가 읽나 | 공개 여부 |
|------|----------|----------|
| `API_BASE_URL` | 서버 컴포넌트, 라우트 핸들러 | 비공개 |
| `NEXT_PUBLIC_API_BASE_URL` | 브라우저 | **번들에 박힘. 공개** |

`NEXT_PUBLIC_*` 은 빌드 시점에 문자열로 치환된다. 런타임에 바꿀 수 없고, 비밀값을 넣으면 유출된다. 클라이언트 컴포넌트에서 접두어 없는 변수를 읽으면 `undefined` 다.

환경변수는 [`src/lib/env.ts`](src/lib/env.ts) **한 곳에서만** 읽는다. 전체 목록은 `env.sample` 과 [`env-vars`](../docs/wiki/10-contracts/env-vars.md).

---

## 구조

```
src/
  app/                    App Router. 디렉토리가 곧 URL
    layout.tsx              루트 레이아웃 · 메타데이터 · JSON-LD · 애널리틱스
    sitemap.ts robots.ts    Next.js 파일 규약
    lotto/ dream/ guide/ …  페이지
  components/             재사용 컴포넌트 ('use client' 는 상호작용이 필요한 것만)
    analytics/              GA4 · 네이버 스크립트와 수동 page_view 전송
  lib/
    env.ts                  환경변수 단일 출처
    api.ts api-types.ts     백엔드 계약의 구현과 타입
    lotto.ts                볼 구간 · KST 추첨 일정 (게임 규칙. 통계 계산 아님)
    traits.ts               조합 성향을 한국어 문장으로
    site.ts                 내비 · 타일 · 가이드 · 면책 문구
    korean.ts               조사 처리 (은/는, 을/를)
  styles/
    tokens.css              디자인 토큰 (색·타이포·간격). 단일 출처
    base.css                리셋 · 접근성 · 레이아웃 프리미티브
    components.css          컴포넌트 스타일
```

CSS 는 커스텀 프로퍼티 기반이다. 컴포넌트 CSS 에 hex/px 리터럴을 쓰지 않고 `tokens.css` 의 변수만 참조한다.

---

## URL 구조

`docs/raw/작업지시초안.md` 5.1 절을 그대로 따른다. 회차 상세(`/lotto/round/{n}`)가 SEO 유입의 핵심이므로 SSG + ISR 로 굽는다.

렌더링 전략표는 [`metadata-strategy`](../docs/wiki/30-seo/metadata-strategy.md).

**꿈 키워드 슬러그는 한글이다**(`/dream/돼지`). 표제어가 4,800개가 넘어 빌드 시에는 앞쪽 200개만 굽고 나머지는 `dynamicParams` 로 첫 요청 때 만든다. 사이트맵에는 전부 싣는다.

---

## 검증

```bash
npm run typecheck
npm run build

# JS 없이도 본문이 보이는가 — 검색엔진이 보는 것
npm run start &
curl -s http://localhost:3000/lotto/recommend | grep -c '추천번호는 왜 참고용이어야 할까요'

# 금지 표현 자가 점검 (검출되면 문맥이 '금지 목록 서술'인지 '실제 사용'인지 확인)
grep -rnE '당첨 ?확률|고확률|예상 ?적중|적중률|1등 예측|당첨 ?보장|필승|명당' src/
grep -rnE '\b(probability|win_rate|accuracy|confidence|hit_rate)\b' src/
```

**주요 페이지가 JS 를 끈 상태에서 본문 텍스트를 보여줘야 한다.** 이것이 이 프로젝트가 Next.js 를 쓰는 유일한 이유다.

모바일 375px 폭에서 가로 스크롤이 없어야 하고, Lighthouse SEO 100 / CLS < 0.1 이어야 한다. 헤드리스 브라우저 실측에는 시스템 라이브러리가 필요하다(`sudo npx playwright install-deps chromium`).

---

## 반드시 알아야 할 함정

**애널리틱스가 첫 페이지만 집계한다.** App Router 는 클라이언트 라우팅이라 GA4 기본 스니펫이 최초 진입 때 한 번만 `page_view` 를 보낸다. 링크로 이동한 페이지는 잡히지 않아 "페이지별 체류시간" 측정이 무너진다. `usePathname()` 을 구독하는 클라이언트 컴포넌트에서 수동 전송한다(`components/analytics/PageViewTracker.tsx`). 그 컴포넌트는 `useSearchParams()` 를 쓰므로 **반드시 `<Suspense>` 로 감싼다** — 감싸지 않으면 정적 생성이 깨진다.

→ [`../docs/wiki/30-seo/analytics.md`](../docs/wiki/30-seo/analytics.md)

**서버 컴포넌트는 클라이언트 컴포넌트에 함수를 넘길 수 없다.** render prop 을 넘기면 `Functions cannot be passed directly to Client Components` 로 빌드가 죽는다. 이미 렌더링된 엘리먼트를 넘긴다(`components/StatWindowTabs.tsx`).

**`cache: 'no-store'` 를 쓰면 그 라우트가 통째로 dynamic 이 된다.** 홈이 매 요청마다 서버 렌더링되고 ISR 이 사라진다. POST 는 어차피 캐시 대상이 아니므로 `next: { revalidate }` 만 남긴다.

**볼 색상은 시안을 따르지 않는다.** `docs/raw/메인샘플.png` 의 볼 색은 동행복권 공식 5구간 규칙과 어긋난다 — [`0009`](../docs/wiki/00-decisions/0009-official-ball-colors-over-mockup.md).

**광고는 승인 전까지 렌더링하지 않는다.** `NEXT_PUBLIC_ADSENSE_CLIENT` 가 비면 `AdSlot` 은 자리(`min-height`)만 예약하고 광고 코드를 넣지 않는다. `ads.txt` 는 승인 후에 만든다.

**금지 표현.** 당첨 확률·고확률·예상 적중률 같은 표현을 UI 문구에도 `<title>` 에도 쓰지 않는다 — [`forbidden-expressions`](../docs/wiki/40-domain/forbidden-expressions.md).
