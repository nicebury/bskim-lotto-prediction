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

이 페이지는 title/description/canonical/OG 규칙과 `sitemap.ts`·`robots.ts`, 라우트별 렌더링 전략을 정한다. JSON-LD 구조화 데이터는 [[structured-data]], 애널리틱스 스크립트 주입은 [[analytics]], 검색엔진 소유확인 메타태그는 [[search-console-registration]] 을 본다. `robots.ts` 가 **어떤 봇을 왜 막는지**(그리고 왜 검색 크롤러는 절대 막지 않는지)는 [[crawling-defense]] 에 있다.

---

## generateMetadata 규칙

각 라우트 세그먼트의 `page.tsx`(또는 `layout.tsx`)에서 `generateMetadata` 를 export 한다. 정적 페이지는 `export const metadata` 상수로 충분하고, 회차·꿈해몽처럼 파라미터에 따라 달라지는 페이지는 `async generateMetadata({ params })` 로 동적 생성한다.

원칙:

- **모든 페이지가 고유한 `title` 과 `description`** 을 갖는다(초안 12.1). 템플릿만 반복되는 중복 메타를 만들지 않는다.
- `title` 은 루트 `layout.tsx` 의 `title.template` 으로 사이트명을 자동 접미한다. 예: `template: "%s | 행운상자"`. 개별 페이지는 접미사 없는 순수 제목만 넘긴다.
- `description` 은 검색결과 스니펫에 그대로 노출되므로 그 페이지의 검색 의도 하나를 한 문장으로 담는다(초안 12.3 "각 페이지는 특정 검색 의도 하나를 명확히 담당").
- `canonical` 을 항상 지정한다. 쿼리스트링(정렬·페이지·필터)이 붙는 통계·목록 페이지에서 중복 URL 이 색인되는 것을 막는다.
- 절대 URL 의 오리진은 `NEXT_PUBLIC_SITE_URL` 을 쓴다. `metadataBase` 를 루트 레이아웃에 설정하면 OG 이미지 등 상대경로가 자동으로 절대화된다.

### ★ 함정 — dynamic 라우트에서 `<meta>` 가 `<body>` 에 앉는다

Next 15.2 부터 **메타데이터는 기본이 스트리밍**이다. 셸(`<head>`)을 먼저 흘려보낸 뒤 `<meta>` 를 스트림 뒤쪽에 꽂는데, 그러면 그 태그가 **`<body>` 안에 들어간다.** 정적으로 미리 렌더되는 라우트는 영향이 없고, **dynamic 라우트(우리 경우 `searchParams` 를 읽는 `/news`)만** 이렇게 된다.

실측(2026-08-21):

- `/news` 의 `<meta name="description">` 이 `</head>` 뒤에 위치했고, **JS 실행 후에도 `<head>` 로 옮겨지지 않았다**(React 가 hoist 해 주지 않는다).
- Lighthouse SEO 가 `/news` 만 **91점**(다른 라우트 100점). 감사 항목은 `meta-description`.
- Next 는 이 문제를 UA 목록(`htmlLimitedBots`)으로 우회한다 — 목록에 걸린 UA 에게만 예전처럼 `<head>` 를 채워 응답한다. 기본 목록에는 JS 를 실행하지 않는 봇(Bingbot·Slackbot·Twitterbot·**Yeti**(네이버) 등)이 들어 있고 **Googlebot 은 일부러 빠져 있다**(JS 를 실행하므로). Lighthouse 12 는 UA 에서 `Chrome-Lighthouse` 를 빼서 일반 모바일 크롬과 구분되지 않으므로 이 카브아웃에 걸리지 않는다.

**해법 두 가지를 함께 쓴다.**

1. `next.config.ts` 에 `htmlLimitedBots: /.*/` — 모든 UA 에게 메타데이터를 **블로킹**으로 준다. 우리 메타데이터는 전부 정적 객체이거나 이미 받아 둔 값으로 만들기 때문에 대가가 사실상 없다. ⚠ 앞으로 `generateMetadata` 안에서 느린 조회를 하면 그만큼 TTFB 가 늦어진다 — 그때는 이 설정이 아니라 그 조회를 고친다.
2. dynamic 라우트의 **페이지 컴포넌트에서 `await` 하지 않는다.** 데이터 대기는 `<Suspense>` 안의 자식이 맡는다. `/news` 가 그 형태다(셸은 즉시 반환, `NewsResults` 가 조회). ⚠ 여기서 다시 `await` 를 쓰면 조용히 되돌아간다.

검증 방법: `curl -s <URL> | grep -o '<meta name="description"'` 의 위치가 `</head>` 앞인지 본다. 절차는 `frontend/README.md`.

---

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

### 회차 상세 `/lotto/round/{n}`

색인 대상 URL 1,287개 중 **1,238개(96%)가 회차 상세**다. 사이트맵 규모 자체는 문제가 아니지만(구글 한도 50,000 URL 의 2.6%), 이 페이지들이 서로 닮으면 사이트 전체가 그렇게 평가된다.

2026-08-28 실측: 1238회와 1237회를 비교하니 **서로 다른 낱말 36개 / 겹치는 낱말 186개**. 본문의 84%가 공통 문구였다. 당첨번호·날짜라는 사실 데이터가 있어 얇다고 단정할 수는 없지만, 96%를 차지하는 페이지가 그 상태인 것은 위험하다.

**대응: 회차마다 다른 본문을 붙였다**(`RoundNumberHistory`, → [[components]]). 그 회차 여섯 번호가 **그 회차까지** 몇 번 나왔는지·몇 위인지·직전 출현 이후 몇 회를 쉬었는지를 적는다. 결과는 서로 다른 낱말 **77개** / 겹치는 226개, 본문 1,150 → 1,786자.

⚠ 페이지를 사이트맵에서 빼는 대신 **값어치를 올리는 쪽**을 골랐다. 회차 상세는 "1238회 당첨번호" 같은 검색 수요가 실제로 있는 페이지라 빼면 잃는 것이 크다. 꿈 소재를 4,802 → 30 으로 줄인 것과 반대 방향의 결정이고, 갈린 기준은 **그 URL 에 고유한 사실이 있는가**다.

### 영상 `/videos`, `/videos/{id}`

```
/videos
  Title:       로또 당첨번호 영상
  Description: 로또 추첨 방송과 당첨번호 확인 영상을 모았습니다. 영상마다 그 회차의
               당첨번호와 당첨금을 함께 볼 수 있습니다.

/videos/{id}   ← 회차를 붙일 수 있을 때만 색인
  Title:       제1238회 로또 당첨번호 영상
  Description: 제1238회 로또 추첨 영상과 함께 그 회차의 당첨번호, 1등 당첨금, 번호 구성을
               확인하세요.
```

⚠ **제목·설명을 우리가 짓는다.** 영상 제목을 그대로 `<title>` 에 쓰지 않는다. 수집 단계에서 금지 표현을 거르지만([[forbidden-expressions]]), 걸러지지 않은 표현이 검색 결과와 브라우저 탭에 우리 사이트 이름과 나란히 뜨는 것은 다른 문제다. 제목은 본문에 원문 그대로 둔다 — **보여주되 우리 이름으로 내세우지 않는다.**

⚠ **회차를 붙일 수 없는 영상은 `noindex`** 다(`game !== 'lotto'` 이거나 `round === null`). 그런 페이지에 남는 것은 임베드 하나뿐이라 우리 고유 본문이 없다. 페이지는 그대로 열린다.

⚠ **사이트맵에는 목록만 싣는다.** 개별 영상은 30일 안에 갱신되거나 삭제되므로([[youtube-data-api]]) 실어 두면 404 가 쌓인다. 꿈 소재와 반대 방향의 결정처럼 보이지만 기준은 같다 — **그 URL 이 오래 살아 있고 고유한 사실을 담는가.**

### 꿈해몽 `/dream`, `/dream/{keyword}`

**슬러그는 한글 그대로다** — `/dream/돼지`. 로마자로 바꾸지 않는다([[api-contract]]). `new URL()` 과 브라우저가 퍼센트 인코딩을 알아서 처리한다.

```text
/dream/돼지
  Title:       돼지 꿈 로또 번호 추천 | 꿈해몽 번호 생성
  Description: 돼지 꿈은 재물과 복이 들어온다는 대표적인 길몽으로 전해집니다. 전해 오는 해석을 바탕으로
               참고용 로또 번호를 추천해 드립니다. 꿈과 당첨 사이에는 인과관계가 없으며 당첨을 보장하지 않습니다.
```

키워드별 페이지는 롱테일 SEO 확장의 핵심이다(초안 20장). "돼지꿈이면 당첨"처럼 인과를 확정 표현하지 않는다.

**해몽 풀이는 손으로 쓴 것만 붙인다**(2026-08-27 갱신, [[0013-dream-meanings-in-frontend]]). 백엔드는 표제어(`word`)만 주므로, 4,800여 표제어 전부에 풀이를 **기계로 만들어 붙이지 않는다** — 그렇게 부풀린 페이지가 곧 저품질 콘텐츠이고 [[adsense-readiness]] 의 기준에 정면으로 어긋난다.

색인 대상 **30개** 소재에만 `frontend/src/lib/dream-meanings.ts` 에 손으로 쓴 민간 해석(요약·유래·갈리는 지점)을 둔다. 이것이 없으면 서른 장이 **표제어만 바뀐 같은 문서**가 되므로, 색인하기로 한 이상 반드시 있어야 하는 텍스트다. 색인 목록(`DREAM_INDEXED_KEYWORDS`)과 `/dream` 의 미리보기 개수 모두 이 파일에서 끌어오므로 **셋이 어긋날 수 없다.** `description` 도 이 요약 한 줄을 앞세워 페이지마다 갈라 놓는다 — 검색 결과에 뜨는 문장이 같으면 서른 장이 한 문서로 읽힌다.

⚠ 화면에 **민간 해석이라고 밝히고**, "이 꿈을 꾸면 좋은 일이 생긴다" 를 넘어 추첨 결과로 잇지 않는다([[forbidden-expressions]]). 풀이가 없는 소재는 그 절 자체를 렌더링하지 않는다.

**사전 표제어가 4,800개가 넘지만 색인 대상은 선별한 소수뿐이다** (2026-08-19 변경).

종전에는 4,802개를 **전부** 사이트맵에 실었다. 롱테일 SEO 를 노린 것이었지만 전제가 어긋나 있었다 — 백엔드는 표제어와 번호만 주고 해몽 풀이 본문은 주지 않으며, 없는 내용을 **지어내지 않기로** 이미 정했다(바로 위 문단). 그러면 4,802개는 서로 거의 같은 얇은 페이지이고, 그것이 사이트맵의 **79%** 를 차지하면 사이트 전체가 저품질로 평가될 위험이 색인 이득보다 크다. [[adsense-readiness]] 의 콘텐츠 최소 기준도 같은 것을 본다.

그래서 **검색 수요가 실제로 있는 길몽·재물운 키워드 10개만** 색인한다(`frontend/src/lib/site.ts` 의 `DREAM_INDEXED_KEYWORDS` — 돼지·똥·대통령·조상·용·불·물·뱀·호랑이·돈). 규칙은 셋이다.

1. **사이트맵에는 선별 키워드만 싣는다.** 사전에 실제로 있는 슬러그인지 확인하고 넣는다(사라진 표제어를 실으면 크롤러가 404 를 받는다).
2. **선별 밖 키워드는 `robots: { index: false, follow: true }`.** 페이지는 그대로 열리고 번호 생성도 정상 동작한다 — 검색에만 내보내지 않는다. `follow: true` 인 것은 그 페이지의 내부 링크까지 막을 이유가 없어서다.
3. **사전 생성도 선별 목록에 맞춘다.** 색인하지 않을 페이지를 수백 개 굽는 것은 빌드 시간과 백엔드 부하만 쓴다. 나머지는 `dynamicParams` 로 첫 요청 때 만든다. 무엇이 빠졌는지는 조용히 넘기지 말고 빌드 로그에 남긴다.

> 결과: 사이트맵이 6,058 → **1,266** URL 로 줄었다(회차 1,232 + 정적 24 + 꿈 10).
>
> **2026-08-27 갱신:** 예고한 대로 "고유 본문을 확보한 뒤" 목록을 넓혔다. 손으로 쓴 민간 해석을 30개 소재에 붙이고 색인 대상도 30개로 늘렸다(꿈 10 → 30, 사이트맵 1,287 URL). **순서를 지켰다** — 본문이 먼저이고 색인이 나중이다.

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

디자인 시안처럼 **사람은 URL 로 볼 수 있어야 하지만 검색에는 노출하지 않을** 라우트가 있다. 첫 사례는 새 메인 시안 `/v2`([[home-v2-concept]]) 였다.

> ⚠ **`/v2` 는 2026-08-21 에 삭제됐다**(사용자 지시). 아래 절차는 다음에 프리뷰 라우트를 만들 때를 위한 규약으로 남긴다 — 사례가 사라졌다고 규칙까지 지울 이유는 없다.

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
