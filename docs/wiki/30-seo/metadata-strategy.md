---
type: seo
title: "메타데이터 전략 — generateMetadata / sitemap / robots / 렌더링"
description: "Next.js App Router 라우트별 title·description·canonical·OG 규칙과 sitemap.ts / robots.ts, 페이지별 렌더링 전략"
tags: [seo]
owner: frontend
status: stable
sources: ["raw:작업지시초안.md#12", "raw:작업지시서초안_보완.md#6", "backend/app/routers/seo.py"]
created: 2026-07-09
updated: 2026-07-09
---

# 메타데이터 전략

프론트엔드(Next.js App Router)의 모든 라우트는 고유한 메타데이터를 서버에서 렌더링한다. 검색엔진이 브라우저 JS 실행 없이 HTML 본문과 메타 태그를 바로 읽을 수 있어야 한다(초안 4.1). 사이트명은 **행운상자** — `NEXT_PUBLIC_SITE_NAME` 한 곳에서만 관리하고 하드코딩하지 않는다([[env-vars]]).

이 페이지는 title/description/canonical/OG 규칙과 `sitemap.ts`·`robots.ts`, 라우트별 렌더링 전략을 정한다. JSON-LD 구조화 데이터는 [[structured-data]], 애널리틱스 스크립트 주입은 [[analytics]], 검색엔진 소유확인 메타태그는 [[search-console-registration]] 을 본다.

---

## generateMetadata 규칙

각 라우트 세그먼트의 `page.tsx`(또는 `layout.tsx`)에서 `generateMetadata` 를 export 한다. 정적 페이지는 `export const metadata` 상수로 충분하고, 회차·꿈해몽처럼 파라미터에 따라 달라지는 페이지는 `async generateMetadata({ params })` 로 동적 생성한다.

원칙:

- **모든 페이지가 고유한 `title` 과 `description`** 을 갖는다(초안 12.1). 템플릿만 반복되는 중복 메타를 만들지 않는다.
- `title` 은 루트 `layout.tsx` 의 `title.template` 으로 사이트명을 자동 접미한다. 예: `template: "%s | 행운상자"`. 개별 페이지는 접미사 없는 순수 제목만 넘긴다.
- `description` 은 검색결과 스니펫에 그대로 노출되므로 그 페이지의 검색 의도 하나를 한 문장으로 담는다(초안 12.3 "각 페이지는 특정 검색 의도 하나를 명확히 담당").
- `canonical` 을 항상 지정한다. 쿼리스트링(정렬·페이지·필터)이 붙는 통계·목록 페이지에서 중복 URL 이 색인되는 것을 막는다.
- 절대 URL 의 오리진은 `NEXT_PUBLIC_SITE_URL` 을 쓴다. `metadataBase` 를 루트 레이아웃에 설정하면 OG 이미지 등 상대경로가 자동으로 절대화된다.

### 금지 표현 (title/description 포함 전 범위)

당첨 확률, 고확률, 예상 적중률, 1등 예측, 당첨 보장 등 예측·보장으로 읽히는 표현을 **메타데이터에도 절대 쓰지 않는다.** 이것은 이 프로젝트의 핵심 정책이다(초안 8.3·17장). 전체 목록과 권장 대체 표현은 [[forbidden-expressions]]. 아래 예시 문구는 모두 "당첨번호"(과거 결과 사실)·"통계"·"재미용" 어휘만 쓰고 예측 어휘를 배제했다.

---

## URL 별 title / description 패턴

초안 5.1 의 URL 구조를 기준으로 한다. 예시 문구는 초안 12.2 를 따르되 사이트명을 **행운상자**로 치환했다.

### 홈 / 대시보드

```text
/            Title: 행운상자 — 로또 6/45 당첨결과·번호 통계·재미용 추천
             Description: 최신 로또 당첨결과, 번호 출현 통계, 복권 뉴스, 재미용 번호 추천을 한 곳에서 확인하세요.
/lotto       Title: 로또 6/45 대시보드 — 최신 당첨결과와 번호 통계
             Description: 최신 회차 당첨번호, 최근 20회 HOT·COLD 번호, 출현 빈도, 패턴 요약을 한눈에 봅니다.
```

홈의 `title` 은 `title.default`(레이아웃)로 지정해 접미사를 붙이지 않는다.

### 회차 상세 `/lotto/round/{roundNo}` — SEO 유입 핵심

**빌드 시에는 최근 300회차만 굽는다.** 1,231건을 전부 구우면 빌드가 백엔드에 1,231개 요청을 순간에 쏟아붓고, 그 부하 때문에 **같은 빌드 안의 다른 요청이 타임아웃한다** — 실제로 추천 API(몬테카를로 50,000회, 동시 2건이면 16초)가 밀려나 `/lotto/recommend` 가 "데이터가 부족합니다" 폴백으로 구워졌다. 나머지는 `dynamicParams` 로 첫 요청 때 생성되고, 과거 회차는 사실상 불변이라 그 뒤로 오래 캐시된다. **사이트맵에는 전부 싣는다** — 색인은 빌드와 무관하다.

> 정적 생성은 백엔드에 부하를 옮기는 일이다. 페이지 수가 아니라 **동시 요청 수**를 보고 상한을 정한다.

```text
Title:       제1184회 로또 당첨번호와 1등 당첨금 | 행운상자
Description: 제1184회 로또 당첨번호, 보너스 번호, 1등 당첨자 수, 당첨금, 번호 패턴 분석을 확인해보세요.
canonical:   {SITE_URL}/lotto/round/1184
```

회차 번호와 추첨일을 실제 값으로 채운다. "당첨번호"·"당첨금"은 과거 결과 사실이므로 허용된다(예측 표현이 아님). 회차별 페이지는 누적될수록 SEO 자산이 되므로(초안 8.1) 동일 템플릿만 반복하지 말고 그 회차의 패턴 분석 문장을 본문에 포함한다.

### 통계 `/lotto/stat/*`

```text
/lotto/stat/hot-cold
  Title:       최근 20회 로또 많이 나온 번호와 안 나온 번호 | 행운상자
  Description: 최근 20회 로또 당첨번호를 기준으로 많이 나온 번호, 적게 나온 번호, 오래 안 나온 번호, 출현 빈도를 확인해보세요.
/lotto/stat/frequency
  Title:       로또 번호별 출현 빈도 통계 | 행운상자
/lotto/stat/pattern
  Title:       로또 홀짝·고저·합계·연속번호 패턴 통계 | 행운상자
```

**`window` 를 쿼리스트링으로 받지 않는다.** 서버 컴포넌트가 `searchParams` 를 읽는 순간 그 라우트는 dynamic 이 되어 ISR 이 깨지고, `?window=50` 같은 중복 URL 이 색인 대상이 된다. 대신 서버가 네 구간(20/50/100/all)을 모두 가져와 **각각의 패널을 렌더링해** 클라이언트 탭 컴포넌트에 넘기고, 전환은 클라이언트 상태로만 한다. canonical 은 쿼리 없는 기본 URL 하나뿐이고, JS 가 꺼져 있어도 기본 구간(최근 20회)의 본문은 서버 렌더링된 채로 보인다.

> 구현 주의: 서버 컴포넌트는 클라이언트 컴포넌트에 **함수(render prop)를 넘길 수 없다** — 직렬화되지 않아 `Functions cannot be passed directly to Client Components` 로 빌드가 죽는다. 이미 렌더링된 엘리먼트를 넘기면 그 내용은 서버 컴포넌트인 채로 전달된다. `frontend/src/components/StatWindowTabs.tsx` 참조.

### 추천 `/lotto/recommend`

```text
Title:       로또 번호 추천 시뮬레이터 | 행운상자
Description: 랜덤, 번호대 균형, 최근 통계 참고 방식으로 재미용 로또 번호를 생성하고 조합 성향을 분석해보세요.
```

"재미용 시뮬레이션"임을 description 에 명시한다. 생성 결과 자체는 CSR 이라 색인 대상이 아니고, 색인되는 것은 설명·기준·면책 본문이다.

### 꿈해몽 `/dream`, `/dream/{keyword}`

**슬러그는 한글 그대로다** — `/dream/돼지`. 로마자로 바꾸지 않는다([[api-contract]]). `new URL()` 과 브라우저가 퍼센트 인코딩을 알아서 처리한다.

```text
/dream/돼지
  Title:       돼지 꿈 로또 번호 추천 | 재미용 꿈해몽 번호 생성
  Description: 돼지 꿈을 키워드로 재미용 로또 번호를 생성해보세요. 꿈과 당첨 사이에는 인과관계가 없으며 당첨을 보장하지 않습니다.
```

키워드별 페이지는 롱테일 SEO 확장의 핵심이다(초안 20장). "돼지꿈이면 당첨"처럼 인과를 확정 표현하지 않는다.

**키워드별 해몽 풀이 본문을 지어내지 않는다.** 백엔드는 표제어(`word`)만 준다. 없는 데이터를 창작해 페이지를 부풀리면 그것이 곧 저품질 콘텐츠이고 [[adsense-readiness]] 의 기준에 정면으로 어긋난다. 각 페이지는 그 키워드로 번호를 만드는 도구와 꿈해몽 일반에 대한 설명을 제공한다.

**사전 표제어가 4,800개가 넘는다.** 전부 `generateStaticParams` 로 구우면 빌드가 감당하지 못하고, 대다수는 검색 유입이 없는 희귀 표제어다. 앞쪽 **200개만 사전 생성**하고 나머지는 `dynamicParams` 로 첫 요청 때 만든다. **사이트맵에는 전부 싣는다** — 색인은 빌드와 무관하다. 무엇이 빌드에서 빠졌는지는 조용히 넘기지 말고 빌드 로그에 남긴다.

### 가이드·정책

```text
/guide/how-to-check   Title: 로또 당첨번호 확인 방법 | 행운상자
/guide/prize-claim    Title: 로또 당첨금 수령 방법 | 행운상자
/privacy              Title: 개인정보처리방침 | 행운상자
/terms                Title: 이용약관 | 행운상자
/disclaimer           Title: 면책 고지 | 행운상자
/contact              Title: 문의 | 행운상자
```

---

## Open Graph / Twitter

루트 레이아웃에서 공통 OG 기본값(사이트명·로케일·타입·기본 이미지)을 설정하고, 각 페이지는 `title`/`description`/`url` 만 덮어쓴다.

- `openGraph.locale`: `ko_KR`
- `openGraph.siteName`: `NEXT_PUBLIC_SITE_NAME`(행운상자)
- `openGraph.type`: 홈·대시보드는 `website`, 가이드·뉴스·꿈해몽은 `article`
- `openGraph.images`: `metadataBase` 기준 절대화. CLS 방지를 위해 `width`/`height` 를 명시(1200×630 권장)
- `twitter.card`: `summary_large_image`

OG 문구에도 금지 표현을 넣지 않는다(공유 문구는 초안 10.3 도 참조).

---

## app/sitemap.ts

`sitemap.xml` 은 정적 URL + 동적 URL(회차·뉴스)로 구성한다. Next.js 의 파일 규약 `app/sitemap.ts` 를 쓴다.

- 정적 URL: `/`, `/lotto`, `/lotto/stat/*`, `/guide/*`, `/privacy`, `/terms`, `/disclaimer`, `/contact`.
- 동적 URL: 백엔드 `GET /api/meta/sitemap-entries`(보완판 8.2 계약) 를 호출해 전체 회차 상세 URL 과 뉴스 URL 을 `lastmod` 와 함께 채운다. 회차가 1,200+ 건이므로 정적 나열이 아니라 API 로 받아 매핑한다.
- `lastmod` 는 각 엔트리의 `draw_date`/발행일을 쓴다. `changeFrequency`·`priority` 는 회차 상세 `yearly`/`0.6`, 홈 `weekly`/`1.0` 수준으로 둔다(기존 백엔드 `backend/app/routers/seo.py` 의 값과 정합).

> **참고**: 기존 백엔드(`backend/app/routers/seo.py`)는 sitemap 을 서버가 직접 XML 로 생성했다. 목표 구조에서는 **sitemap 생성 책임이 프론트(`app/sitemap.ts`)로 이동**하고, 백엔드는 URL 목록 데이터(`/api/meta/sitemap-entries`)만 제공한다. 도메인 오리진은 `NEXT_PUBLIC_SITE_URL` 로 프론트가 조립한다.

sitemap 을 서치콘솔·서치어드바이저에 제출하는 절차는 [[search-console-registration]].

---

## app/robots.ts

Next.js 파일 규약 `app/robots.ts` 로 생성한다.

- `User-agent: *` 에 `Allow: /`.
- `Disallow`: 백엔드 API 프록시 경로나 내부 경로가 프론트에 노출된다면 차단. 순수 프론트 라우트만 있으면 최소한으로 유지.
- `sitemap`: `{NEXT_PUBLIC_SITE_URL}/sitemap.xml` 을 명시.

---

## 비공개 프리뷰 라우트 (색인 제외)

디자인 시안처럼 **사람은 URL 로 볼 수 있어야 하지만 검색에는 노출하지 않을** 라우트가 있다. 첫 사례는 새 메인 시안 `/v2`([[home-v2-concept]]) 다.

세 가지를 함께 해야 하고, 하나만으로는 규정 위반이 남는다.

1. **페이지 `metadata.robots` 가 정본이다.**
   ```ts
   robots: { index: false, follow: false, googleBot: { index: false, follow: false } }
   ```
   루트 레이아웃이 `robots: { index: true, follow: true }` 를 선언하므로 페이지에서 통째로 덮어써야 한다.

2. **`alternates.canonical` 을 반드시 명시한다.** 생략하면 루트의 `canonical: '/'` 를 상속해 **그 페이지가 자기를 홈이라고 주장한다.** noindex 와 겹치면 크롤러가 모순된 신호를 받는다.

3. **`sitemap.ts` 에 넣지 않는다.** 현행 `sitemap.ts` 는 정적 URL 을 화이트리스트로 나열하므로 아무것도 하지 않으면 자동으로 빠진다.

### `robots.txt` 에 `Disallow` 를 넣지 않는다

직관과 반대지만, 크롤을 막으면 크롤러가 **`noindex` 메타를 읽지 못한다.** 그러면 다른 곳에 링크가 하나라도 있을 때 본문 없이 URL 만 색인되는 최악의 결과가 나온다. 정확한 조합은 **"크롤 허용 + 페이지 noindex"** 다.

대신 **기존 페이지 어디에서도 프리뷰 라우트로 링크하지 않는다.** 발견 경로는 직접 URL 입력뿐이다.

> 더 강한 보증이 필요하면 `next.config.ts` 의 `headers()` 로 해당 경로에 `X-Robots-Tag: noindex, nofollow` 를 붙일 수 있다. 다만 그것은 기존 파일 수정이므로 별도 판단 사항이다.

---

## 렌더링 전략 (보완판 6.1)

어느 페이지를 SSG/ISR/CSR 로 렌더링하고 `revalidate` 주기를 얼마로 둘지의 정본이다. 검색엔진이 읽어야 하는 본문은 반드시 서버 렌더링한다.

| 페이지 | 방식 | revalidate |
|--------|------|-----------|
| `/`, `/lotto` | ISR | 추첨 후 갱신 (1시간) |
| `/lotto/round/{n}` | SSG + ISR | 과거 회차는 사실상 불변 → 긴 주기 |
| `/lotto/latest` | ISR | 짧게 (10분) |
| `/lotto/stat/*` | ISR | 주 1회 |
| `/news` | ISR | 수집 주기에 맞춤 |
| `/guide/*`, `/privacy`, `/terms`, `/disclaimer`, `/contact` | SSG | 정적 |
| `/lotto/recommend`, `/dream` | SSG 셸 + 클라이언트 인터랙션 | 생성 결과는 CSR |

추천·꿈해몽은 결과가 매번 달라 SSR 이 무의미하다. 다만 **페이지 본문(설명·기준·면책·가이드)은 서버 렌더링**해야 검색엔진이 읽는다. 초안 4.1 의 "아이콘만 있고 설명 본문이 없는 홈 화면"을 피하는 지점이 여기다. 이 정적 본문 확보가 [[adsense-readiness]] 의 콘텐츠 품질 기준과도 직결된다.

---

## 관련 페이지

- [[structured-data]] — JSON-LD 타입별 적용
- [[analytics]] — GA4·네이버 애널리틱스 스크립트 주입과 SPA page_view 함정
- [[adsense-readiness]] — 승인 전 체크리스트
- [[search-console-registration]] — 소유확인·사이트맵 제출
- [[forbidden-expressions]] — 금지 표현 정본
- [[env-vars]] — `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_SITE_NAME`
