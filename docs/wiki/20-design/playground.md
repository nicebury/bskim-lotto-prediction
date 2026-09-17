---
type: design
title: "번호놀이터 — 페이지 설계와 전역 연결"
description: "/playground 목록·상세 라우트, 결과 화면, 진행 보존, 메뉴·타일·사이트맵·광고 연결"
tags: [design, seo, a11y, adsense]
owner: frontend
status: stable
sources: ["raw:work_order/task5_game.md", "frontend/src/components/NumberActions.tsx:27", "frontend/src/lib/reco-store.ts:1", "frontend/src/lib/ad-slots.ts:111"]
created: 2026-09-08
updated: 2026-09-08
---

# 번호놀이터 — 페이지 설계와 전역 연결

게임 자체의 계약은 [[playground-game-contract]] 에 있다. 이 페이지는 **게임을 감싸는 껍데기** —
라우트, 결과 화면, 메뉴, 광고, 진행 보존을 다룬다. 전부 선행 세션이 게임 착수 **전에** 끝낸다.

## 화면 흐름

```
헤더/타일/하단바 "번호놀이터"
      ↓
/playground            게임 6개 선택 (서버 렌더)
      ↓
/playground/{slug}     게임 플레이 → 번호 6개 → 결과 패널
      ↓
/lotto/analyze?numbers=…   기존 분석 화면 (새 코드 0줄)
```

## /playground — 목록

서버 컴포넌트. `core/catalog.ts` 의 `GameMeta` 여섯 개만 읽는다(게임 코드는 딸려오지 않는다).

```
Breadcrumb(홈 > 번호놀이터)
<h1>번호놀이터</h1>
<p>게임을 즐기며 번호 6개를 모아 보세요. 모은 번호는 바로 분석·저장·공유할 수 있습니다.</p>
<GameGrid />                      6카드: 제목 · tagline · "약 90초" · accent 색 · 인라인 SVG 썸네일
<section>이렇게 즐기세요</section>   3단계 설명 (SSR 텍스트, 분량 확보)
<section>자주 묻는 질문</section>    3문항
<Disclaimer>{DISCLAIMER.playground}</Disclaimer>
<AdSlot slot="playground-list" />  목록에만 광고. 6카드 아래
```

**번들 경계가 여기서 갈린다.** `catalog.ts`(데이터)와 `loaders.ts`(코드)를 분리한 이유가
이것이다 — 목록 페이지에 게임 여섯 개가 딸려 들어가면 안 된다.
검증: `next build` 후 `/playground` 의 First Load JS 가 기존 페이지 대비 **+5KB 이내**.

## /playground/[slug] — 플레이

```tsx
export function generateStaticParams() { return GAMES.map(g => ({ slug: g.slug })) }
export async function generateMetadata({ params }) { /* catalog 에서 title/tagline */ }

export default async function Page({ params }) {
  const meta = findGame(slug) ?? notFound()      // 사이트맵에 없는 URL 이 200 을 내면 안 된다
  return (
    <div className="container">
      <Breadcrumb items={[홈, 번호놀이터, meta.title]} />
      <h1>{meta.title}</h1>
      <p className="muted">{meta.intro}</p>       {/* ★ JS 꺼도 보이는 본문 */}

      <GameStage slug={meta.slug} />              {/* 'use client' */}

      <section aria-labelledby="howto">
        <h2 id="howto">조작 방법</h2>
        <ol>{meta.howTo.map(...)}</ol>            {/* ★ SSR 텍스트 */}
        <p className="muted">{meta.keyGuide}</p>
      </section>
      <section>{/* 다른 게임 3개 링크 — 내부링크 */}</section>
      <Disclaimer>{DISCLAIMER.playground}</Disclaimer>
    </div>
  )
}
```

### ⚠ dynamic import 경계 — Next 15 의 함정

**서버 컴포넌트에서는 `ssr: false` 를 쓸 수 없다.** 이 프로젝트에는 `next/dynamic` 사용
사례가 아직 하나도 없으니 이것이 첫 사례다. 그래서 경계를 클라이언트 컴포넌트에 둔다.

```tsx
'use client'
// 1) 캔버스 어댑터를 지연 로드
const GameCanvas = dynamic(() => import('./GameCanvas'), {
  ssr: false,
  loading: () => <div className="pg-canvas-skeleton" aria-hidden />,   // ★ 같은 박스
})
// 2) 게임 모듈은 GameCanvas 안에서 GAME_LOADERS[slug]() 로 → slug 당 별도 청크
```

### CLS 0 — 스켈레톤과 캔버스가 같은 박스를 쓴다

```css
.pg-stage {
  width: 100%; max-width: 420px; margin-inline: auto;
  aspect-ratio: var(--pg-ar);            /* GameStage 가 인라인 style 로 주입 */
  max-block-size: min(70svh, 620px);
}
```

`--pg-ar` 은 서버가 아는 값(`meta.stage.width / height`)이다. **첫 HTML 부터 정확한 자리가
잡히므로** 캔버스가 늦게 로드돼도 레이아웃이 밀리지 않는다.

`<noscript>` 로 안내한다 — "이 게임은 자바스크립트가 필요합니다. 번호가 필요하시면
[번호추천](/lotto/recommend)을 이용하세요."

### ✅ 해결됨 — 캔버스 아래가 잘리던 문제 (2026-09-08 발견 → 2026-09-16 호스트 수정)

**증상.** 375×667 에서 `.pg-stage` 의 실측 박스가 343×467 인데 `aspect-ratio: 360/640` 이
요구하는 높이는 610px 이었다. `max-block-size: min(70svh, 620px)` 가 이겨서 **폭은 그대로 둔 채
높이만 잘렸고**(`aspect-ratio` 는 크기 제약에 지는 성질이다), `core/loop.ts` 가 `rect.width` 로만
균일 스케일하므로 **아래 143px 이 화면 밖으로 나갔다.** G05 는 그 구간이 통째로 하단 9개 빈이라
번호가 하나도 보이지 않았다.

**해결.** 2026-09-16 호스트 일괄 수정으로 무대 높이가
`clamp(260px, calc(100svh - var(--pg-chrome)), 660px)` 이 되었다 — 화면 높이의 비율이 아니라
**게임이 아닌 것들을 뺀 값**이다. 높이가 먼저 걸리고 `aspect-ratio` 가 폭을 줄이는 구조라
잘림이 사라졌다.

⚠ **대신 반대 방향의 제약이 생겼다.** 세로로 긴 무대일수록 **그려지는 폭이 좁아진다.**
그래서 계약이 `stage.height` 를 **420~450 으로 못 박았다.** G05 는 640 → 430 으로 줄여
390×760 에서 358px 폭(빈 하나 39.8px)을 되찾았다. 실측: 잘림 0px, 캔버스 바닥 633 vs 탭바 703.

## 결과 화면

`pool.complete` 가 되면 캔버스는 3초 축하 연출 후 정지하고, **캔버스 아래에 결과 패널이
펼쳐진다.** 모달이 아니다 — 모달은 포커스 트랩과 캔버스가 얽히고, 스크롤·스크린샷 공유를 방해한다.

```tsx
<h2>번호 6개를 모았어요</h2>
<BallRow numbers={[...awarded].sort((a,b)=>a-b)} />
<NumberActions
  numbers={awarded}
  strategyLabel={`번호놀이터 · ${meta.title}`}   // 공유 문구·저장 이미지 제목·aria-label
  subtitle="게임으로 모은 재미용 번호"
  sourcePath={`/playground/${slug}`}            // ★ 공유 링크가 이 게임으로 돌아온다
/>
<Disclaimer>{DISCLAIMER.playground}</Disclaimer>
<div>[다시하기] [다른 게임 보기]</div>
```

- **`NumberActions` 를 그대로 쓴다.** 분석·복사·저장·공유 네 버튼이 이미 구현돼 있다.
  "분석" 은 내부에서 `analyzeHref()` → `GET /api/lotto/analyze?numbers=…` 로 간다.
  **놀이터가 백엔드에 닿는 유일한 지점이고, 새 코드가 0줄이다.**
- 획득 순서가 아니라 **오름차순**으로 보여준다(사이트 다른 화면과 같다).
- 다시하기 = 새 시드 + 새 pool + `create()` 재호출. 컴포넌트 `key` 를 올려 인스턴스를 통째로 교체한다.

## 진행 중 이탈·새로고침

`sessionStorage` 를 쓴다. 근거는 [[number-analysis-page]] 와 `reco-store.ts` 가 세운 것과 같다 —
탭 수명과 정확히 일치하고, 하드 내비게이션에서도 살아남는다.

```ts
// key: `lucky:playground:${slug}`
type SavedRun = { v: 1; numbers: number[]; complete: boolean; at: number }
```

- **획득할 때마다 저장한다.** 버튼을 누를 때가 아니다 — 뒤로가기·스와이프는 버튼을 거치지 않는다.
- ⚠ **완료된 기록을 복원해도 캔버스를 내리지 않는다**(2026-09-10 수정). 예전에는 결과 패널만
  띄웠는데, 게임 페이지에 들어온 사람에게 **게임이 없고 "다시하기" 만 있는 화면**이 되어
  30분 동안 고장처럼 보였다. 이제 캔버스를 항상 띄우고, 이미 끝난 판은 게임이 `cleared`
  오버레이로 알린다 → [[playground-game-contract]] "이미 끝난 판으로 시작될 때"

  90초를 플레이해 얻은 번호라면 추천보다 훨씬 아프다.
- 복원: `complete` 면 게임을 띄우지 않고 **결과 패널을 먼저** 보여준다. 미완이면 획득 번호만
  pool 에 주입하고 게임은 처음부터 시작한다.
  ⚠ **물리 상태는 복원하지 않는다.** 여섯 게임에 직렬화 계약까지 요구하면 계약이 두 배로
  복잡해지고 버그는 여섯 배가 된다.
- 30분 초과한 미완 기록은 버린다.
- 읽기·쓰기를 전부 `try/catch` 로 감싼다 — 사파리 시크릿 모드는 쓰기에서 예외를 던진다.
- **`beforeunload` 확인창을 쓰지 않는다.** 모바일에서 동작이 들쭉날쭉하고 이탈만 늘린다.

## 전역 연결 — 선행 단계에서 일괄 처리

게임 세션은 이 파일들을 **열지 않는다.**

| 파일 | 변경 | 주의 |
|------|------|------|
| `src/lib/site.ts` | `NAV_ITEMS` 에서 **`/lotto` 제거** 후 `번호추천` 뒤에 `{href:'/playground', label:'번호놀이터'}` 삽입 · `FOOTER_SERVICE_LINKS` 신설 · `SERVICE_TILES` 의 `pension` 타일을 `{href:'/playground', accent:'play', title:'번호놀이터', summary:'게임으로 번호 모으기'}` 로 교체 · `DISCLAIMER.playground` 신설 | 타일은 6개 그대로. `/lotto` 는 홈 타일과 푸터에 남는다 |
| `src/styles/components.css` `.header-nav a` | 1024px 실측 후 필요하면 `padding-inline: var(--space-2); font-size: 1rem` | ⚠ **아래 헤더 내비 폭 항목 참조** |
| `src/components/Footer.tsx` | `NAV_ITEMS` → `FOOTER_SERVICE_LINKS` 로 교체. 접이식 배지의 `NAV_ITEMS.length` 도 함께 | `/lotto` 의 전역 링크를 지킨다 |
| `src/components/MobileTabBar.tsx` | `TABS` 에 `{href:'/playground', label:'놀이터', icon:PlayIcon}` 추가(5개) + "네 개만 둔다" 주석을 **왜 다섯이 되었는지**로 갱신 | `.tabbar` 의 `repeat(4,1fr)` → `repeat(5,1fr)`. 375px 기준 75px/항목이라 44px 타깃 여유 |
| `src/styles/tokens.css` | `--svc-play` · `--svc-play-bg` 신설(다크 세트 포함) | 기존 5색과 겹치지 않는 청록 계열. 파스텔 위 `--color-text-muted` 대비 4.5:1 이상 확인 |
| `src/components/icons.tsx` | `SERVICE_ICONS.play` = 게임패드 글리프(24 격자, stroke 1.8) | `ServiceIconKey` 가 자동 확장된다 |
| `src/app/sitemap.ts` | `/playground`(weekly, 0.7) + 6개 상세(monthly, 0.6) | `catalog.ts` 를 map |
| `src/lib/ad-slots.ts` | `AdSlotName` 에 `'playground-list'` 추가 · `isAdFreePath` 에 규칙 한 줄 | 아래 광고 항목 참조 |
| `src/app/globals.css` | `@import '../styles/playground.css';` 한 줄 | `components.css` 뒤에 둔다 |

### ⚠ 헤더 내비 폭 — 1024px 에서 실측 필수

`.header-nav` 는 **`@media (min-width: 1024px)` 에서만 `display: flex`** 다. 그 아래 폭에서는
헤더 내비가 아예 없고 햄버거 드로어만 있으므로, **위험 구간은 1024px 부근 하나뿐이다.**

`.header-nav a` 는 `font-size: 1.08rem`(약 17.3px) · `padding-inline: 12px`, 링크 사이 `gap: 4px`,
nav 앞에 `margin-left: 24px`. 1024px 화면에서 컨테이너 안쪽 폭은 `1024 − 48 = 976px` 이고
여기서 로고와 우측 액션(검색 입력 + 다크 토글)이 차지하는 몫을 뺀 나머지가 nav 예산이다.

현재 7항목 22글자의 nav 폭은 약 572px 로 추정된다. **"번호놀이터"(5글자)를 그냥 더하면
약 114px 이 늘어 넘칠 공산이 크다.**

그래서 **`/lotto`("로또", 2글자)를 헤더에서 뺀다**(사용자 결정, 2026-09-08).
약 63px 이 줄어 순증이 약 51px 로 완화된다. 추정상 아슬아슬하게 들어가지만 **추정은 추정이다 —
선행 단계에서 1024px·1100px 실폭을 반드시 눈으로 확인한다.** 넘치면 다음 순서로 조인다.

1. 1024~1199px 구간에서 `font-size: 1rem`, `padding-inline: var(--space-2)`
2. 그래도 넘치면 `영상` 또는 `뉴스` 를 드로어 전용으로 내린다

#### /lotto 를 헤더에서 빼도 되는 이유

`href="/lotto"` 로 가는 **하드코딩된 링크가 코드에 하나도 없다.** 전부 상수 배열을 거친다 —
`NAV_ITEMS`(헤더·드로어·푸터)와 `SERVICE_TILES`(홈 첫 타일), 그리고 `sitemap.ts`.
영향 범위가 이 셋으로 닫혀 있다.

성격으로 봐도 `/lotto` 는 최신 회차·통계·뉴스를 모은 **대시보드**이고, 그 구성요소인
번호통계·번호추천이 이미 헤더에 따로 있다. 헤더에서 상위와 하위가 나란히 서 있던 셈이다.

**다만 푸터에는 남긴다.** `/lotto` 는 사이트맵 priority 0.9 로 홈 다음가는 페이지다
(`title: 로또 6/45 대시보드 — 최신 당첨결과와 번호 통계`). 전역 링크를 완전히 잃으면
내부링크가 홈 타일 하나로 줄어든다. 헤더와 푸터가 지금은 `NAV_ITEMS` 를 함께 쓰므로
**푸터용 목록을 분리**한다.

```ts
/** 헤더·드로어용. 폭이 한정되어 있어 상위 대시보드(/lotto)는 뺐다. */
export const NAV_ITEMS = [ /* 번호통계 · 번호추천 · 번호놀이터 · 꿈해몽번호 · 영상 · 뉴스 · 가이드 */ ] as const

/** 푸터 '서비스' 그룹. 폭 제약이 없으므로 대시보드까지 전부 싣는다. */
export const FOOTER_SERVICE_LINKS = [{ href: '/lotto', label: '로또' }, ...NAV_ITEMS] as const
```

⚠ `Footer.tsx` 는 `NAV_ITEMS.length` 를 접이식 배지 숫자로도 쓰고 있다. 목록을 바꾸면
그 숫자도 함께 바뀌므로 `FOOTER_SERVICE_LINKS.length` 로 맞춘다.
⚠ `MobileTabBar` 의 `href` 는 `NAV_ITEMS` 의 것과 같아야 한다는 규약이 있다(같은 화면이
메뉴에 따라 다른 주소로 열리면 색인이 갈라진다). 하단 바에는 `/lotto` 가 없으므로 영향 없다.

### 광고 — 게임 화면에는 넣지 않는다

목록에는 광고를 두고 **상세(게임 화면)에는 두지 않는다.** 캔버스와 "다시하기" 근처의 광고는
오클릭 유도로 읽힌다 — [[forbidden-expressions]] 의 *"다시 생성 버튼 주변에 광고를 배치하지
않는다"* 와 같은 이유다.

⚠ `isAdFreePath` 는 `AD_FREE_EXACT` 와 `AD_FREE_PREFIX` 두 목록으로 동작하는데,
**"`/playground/` 로 시작하되 `/playground` 자체는 아님" 은 이 둘로 표현할 수 없다.**
함수에 규칙 한 줄을 더해야 한다.

⚠ 승인 후 **자동 광고**를 켤 때 놀이터 상세를 제외 경로로 등록해야 한다. `AdSenseLoader` 가
`(site)` 레이아웃 전체에 있어 코드로는 막히지 않는다 — 애드센스 대시보드 설정이므로
[[deployment]] 에 절차로 남긴다.

## 접근성 — 캔버스는 보조기술에 보이지 않는다

캔버스 내부는 스크린리더에 **완전히 투명하다.** 그래서 상태를 전부 DOM 으로 뺀다.

- 진행 6칸은 사이트의 `LottoBall` 을 그대로 쓴다 → "17번, 11~20 구간" 까지 읽힌다.
- 획득 시 `aria-live="polite"` 로 "세 번째 번호 17번을 모았습니다".
- 캔버스는 `role="application"` + `aria-label` + `tabindex=0` + **보이는 포커스 링**.
  키보드 조작 안내(`meta.keyGuide`)는 캔버스 바로 아래에 **항상 노출**한다(숨기지 않는다).
- 색만으로 상태를 전하지 않는다 — 획득 칸은 흐리게 **+ 체크 표시**, 실패는 색 **+ 문구**.
- 게임을 할 수 없는 사용자에게는 같은 결과를 주는 경로가 이미 있다 → `/lotto/recommend` 링크를
  상세 하단에 둔다. **"게임 건너뛰고 번호 받기" 버튼은 만들지 않는다** — 게임 자체를
  무의미하게 만든다. 사이트 안의 다른 길을 안내하는 것이 정직한 답이다.

## iOS 사파리 함정

| 항목 | 대응 |
|------|------|
| 더블탭 확대로 오조작 | 캔버스 `touch-action: none`, DOM 버튼 `touch-action: manipulation` |
| 캔버스 드래그가 페이지를 스크롤 | `overscroll-behavior: contain` + `pointermove` 에서 `preventDefault`. ⚠ 리스너를 **`{ passive: false }`** 로 등록해야 실효 |
| 100vh 가 주소창 때문에 잘림 | `svh`/`dvh` 사용. `base.css` 가 이미 `100dvh` 를 쓴다 |
| 홈 인디케이터가 조작 버튼을 가림 | `padding-bottom: env(safe-area-inset-bottom)` + 탭바 높이(56px) 여백 |
| 긴 누름 시 콜아웃 메뉴 | `-webkit-touch-callout: none`, `user-select: none` |
| 사운드 | **넣는다. 단 기본은 음소거다**(2026-09-10 변경). 종전에는 "자동재생 정책 + 무음 스위치" 를 이유로 빼 두었는데, **"시작" 버튼이 생기면서 사용자 제스처 문제가 사라졌고**, 무음 스위치는 음소거 버튼으로 덮는다. 규약은 [[playground-game-contract]] "효과음" 절. 진동(`navigator.vibrate`)은 그대로 병행한다 |

## 성능 — 계약으로 강제하는 것

| 함정 | 대응 |
|------|------|
| `ctx.shadowBlur` 가 모바일 GPU 에서 극단적으로 느리다 | **루프 안에서 사용 금지.** `draw.softShadow()`(단색 타원)만 |
| 매 프레임 `createLinearGradient` | `draw.bgGradient` 가 내부 캐시 |
| 정적 배경을 매 프레임 다시 그림 | 오프스크린 캔버스에 1회 그리고 `drawImage` |
| 파티클 무한 생성 | 풀링. 상한 120, `quality==='low'` 면 40 |
| GC 스파이크 | 루프 안에서 객체 리터럴·배열 생성 금지. 벡터는 숫자 필드로 |

목표: 중저가 안드로이드에서 55fps 이상. 워치독이 `low` 로 내려 최소 40fps 는 지킨다.

## 아트 디렉션 공통

게임별 묘사는 각 사양서에 있다. 전 게임이 공유하는 것은 [[playground-game-contract]] 의
**시각 언어 4대 규칙**(배경 3층 · 접지 그림자 · 좌상단 광원 림라이트 · 숫자는 `ball()` 로만)이다.
이 네 줄을 각 게임 세션 프롬프트에 그대로 복사한다. 이것이 여섯 게임이 한 제품으로 보이게 하는
유일한 장치다.

## ✅ 선행 2단계 완료 — 셸·전역 연결 (2026-09-08)

### ★ 헤더 내비 폭 — 실측 결과

설계가 "추정은 추정이다, 반드시 눈으로 확인한다" 고 적어 둔 항목이다. **넘치지 않았고 조이지 않아도 됐다.**

| 폭 | nav 폭 | 줄 수 | 요소 겹침 | 링크 잘림 |
|---|---|---|---|---|
| 1024px | 565px | 1 | 없음 | 없음 |
| 1100px | 589px | 1 | 없음 | 없음 |
| 1200~1440px | 589px | 1 | 없음 | 없음 |

추정치(약 623px)보다 실제가 작았다. `/lotto` 를 뺀 것이 계산대로 들었고, **1024px 에서는 flex 가 565px 로 압축되면서도 링크 텍스트가 하나도 잘리지 않았다.** 따라서 이 문서가 예비해 둔 조이기(① 폰트·패딩 축소 ② 영상·뉴스를 드로어로) 는 **적용하지 않았다.** 메뉴를 더 늘릴 때 다시 재야 한다.

### 계약에 없어 선행 세션이 정한 것

| 항목 | 결정 | 근거 |
|---|---|---|
| `SERVICE_ICONS.play` 를 stroke 로 | **`fill` 로 만들었다** | 이 문서는 "stroke 1.8" 로 적었지만 `icons.tsx` 의 서비스 아이콘 여섯은 **전부 `fill` 실루엣**이다(파일 첫 주석의 규약). 한 줄에 나란히 서는 타일에서 하나만 선 그림이면 그것만 얇게 튄다 |
| `ServiceTiles.tsx` | **비활성 분기를 걷어냈다** | 전역 연결 표에 없는 파일인데, 여섯 타일이 전부 링크가 되면서 `href: null` 분기가 **도달 불가능해지고 타입이 `never` 로 깨졌다.** 복원 방법을 주석에 남기고 `.tile.is-disabled`·`.tile-badge` CSS 는 남겼다 |
| 진행 저장 | **`run-store.ts` 로 분리** | 이 문서는 `SavedRun` 타입만 정했다. `reco-store.ts` 와 같은 모양으로 두되, 놀이터는 slug 별 키라 파일을 나눴다 |
| 게임 카드 썸네일 | ~~`SERVICE_ICONS` 재사용~~ → **게임별 SVG 로 교체(2026-09-10)** | 임시로 서비스 글리프(별·6/45 …)를 돌려 썼으나 **게임 내용을 가리키지 않아** 목록에서 무엇을 고르는지 알 수 없었다. 실제 게임 화면을 캡처해 각각을 다시 그렸다 → `components/playground/GameThumb.tsx` |
| 게임 시작 방식 | **들어오면 바로 시작** | 처음에는 "게임 시작" 버튼을 뒀다가 걷어냈다. 게임 페이지에 들어온 사람은 게임을 하러 온 것이라 한 번 더 누르게 하는 것은 마찰이다. 링크를 눌러 온 것 자체가 명시적 상호작용이다(`reducedMotion` 을 게임에 적용하지 않는 근거와 같은 논리). **예외는 이미 6개를 다 모은 기록이 복원될 때** — 그때는 결과부터 보여준다 |
| `--svc-play` 색값 | `#0f8a89` / 파스텔 `#dbf4f2` / 다크 `#0b2828` | 청록 hue 179 로 초록(152)·파랑(217) 양쪽과 25도 이상 떨어졌다. 흰 글리프 대비 4.19, 파스텔 위 muted 4.85 로 기존 토큰 기준선(4.69~4.89) 안 |

### 검증

- `typecheck` · `build` 통과. `/playground` First Load JS **107kB**(기존 정적 페이지 105kB 대비 **+2kB**) — 이 문서가 정한 "+5KB 이내" 를 만족한다. 목록이 게임 코드를 딸고 오지 않는다는 뜻이다
- 캔버스 실측: 표시 358×557, 버퍼 716×1114(DPR 2), **비율 0.643 = 360/560 정확 일치**. `--pg-ar` 로 첫 HTML 부터 자리가 잡혀 CLS 가 없다
- 라우트: 목록·게임 6개 200, 없는 slug 404. 사이트맵에 7개 등재
- 광고: `isAdFreePath` 가 `/playground` 는 허용, `/playground/*` 는 차단(유닛 11항목 통과)
- axe 라이트·다크 `/playground`·`/playground/shooting`·홈·추천 **위반 0**
- 375px 가로 넘침 없음. 하단 탭바 5칸(홈·통계·분석추천·놀이터·꿈해몽)

⚠ **게임 세션과 실제로 병렬이었다.** 이 단계 작업(13:57~14:13) 중에 G01·G05 세션이 자기 폴더를 고쳤고(14:14~14:16), 충돌 없이 빌드가 통과했다. `core/` 는 1단계 이후 한 번도 수정되지 않았다 — 동결이 지켜졌다.

---

## ⚠ 캔버스가 세로로 잘린다 — G04 가 발견 (2026-09-08)

선행 2단계 검증은 *"캔버스 실측: 표시 358×557 … 비율 0.643 = 360/560 정확 일치"* 로 닫혔다.
그 검증은 **stage 높이 560 인 게임 하나로만** 이뤄졌다. 560 은 `.pg-stage` 의
`max-block-size: min(70svh, 620px)` 안에 들어가 잘릴 일이 없다. **높은 게임에서만 드러난다.**

`stage` 높이가 큰 다섯 게임(G01 560 · G02 600 · G04 620 · G05 640 · G06 560)이 영향을 받는다.

### 실측 (G04, stage 360×620)

| 뷰포트 | 캔버스 CSS | 가로 배율 | **실제로 보이는 논리 높이** |
|---|---|---|---|
| 1280×900 (데스크톱) | 420×620 | 1.167 | **531** / 620 |
| 390×844 (iPhone 14) | 358×591 | 0.994 | 594 / 620 |
| 375×667 (iPhone SE) | 343×467 | 0.953 | **490** / 620 |

### 원인 하나, 증상 둘

`.pg-canvas` 가 `width:100%; height:100%` 로 스테이지 박스를 꽉 채우는데, 그 박스는
`aspect-ratio` 와 `max-block-size` 를 **둘 다** 받는다. 높이 제한이 이기는 순간 캔버스의
실제 비율이 `stage` 비율과 달라지고, 그때 호스트의 두 좌표 변환이 서로 어긋난다.

1. **렌더가 아래에서 잘린다.** `loop.ts` 는 가로만 본다 — `s = rect.width / stage.width`.
   세로로 넘치는 만큼은 그냥 화면 밖이다.
2. **포인터 좌표가 렌더 위치와 다르다.** `input.ts` 는 세로를 세로대로 환산한다 —
   `(y / rect.height) * stage.height`. 데스크톱에서 **스톤이 그려진 자리를 눌렀는데 게임은
   85px 아래를 눌렀다고 받았고**, 조금만 끌어도 세기가 최대로 튀어 매번 아웃이 났다.
   조준형 게임에서는 이것이 곧 **조작 불가**다.

### 해법 — 레터박스

캔버스를 박스에 맞춰 늘리지 말고 **`stage` 비율을 유지한 채 박스 안에 넣는다.** 남는 자리는
여백으로 둔다. 그러면 두 변환이 다시 일치해 증상 둘이 한 번에 사라진다.

```css
/* .pg-canvas — 박스를 채우는 대신 비율을 지킨다 */
inline-size: auto; block-size: auto;
max-inline-size: 100%; max-block-size: 100%;
aspect-ratio: var(--pg-ar, 360 / 560);
margin: auto;              /* 부모를 grid/flex 로 두고 가운데 정렬 */
```

⚠ **G04 는 임시 방어를 자기 폴더 안에 넣어 두었다.** 캔버스 픽셀 크기로 어긋난 정도를
역산해 포인터 y 를 보정한다(`index.ts` 의 `pointerScaleY`). **호스트가 위 레터박스를 적용하면
보정값이 저절로 1 이 되어 무해해진다** — 실제로 비율이 맞는 해상도(390×760 · 1280×900)에서는
이미 1 이다.

> **2026-09-16 후속.** 당시 "iPhone SE 는 어떤 배치로도 덮을 수 없다" 고 적었는데, 그것은
> 무대 620 을 전제한 말이었다. 계약이 이후 *"`stage.height` 는 420~450 안에서 끝낸다"* 를
> 정했고 **G04 가 무대를 430 으로 줄이면서 SE 까지 조작 가능해졌다**(보드 칸 30→23px,
> 물리 재조정). 390×760 과 1280×900 에서는 **잘림 자체가 사라졌다.**
> 잘림의 원인은 그대로이므로 레터박스는 여전히 옳은 수정이다 — 무대를 줄이는 것은 게임마다
> 치러야 하는 비용(칸이 작아지고 물리를 다시 맞춰야 한다)이기 때문이다.

## ⚠ 테마가 캔버스 안까지 따라오지 않는다 — G04 가 발견 (2026-09-08)

계약은 *"마운트 시 1회 수집하고, 테마 변경 시 재수집해 **게임에 새 객체를 준다**"* 고 적었다.
`GameCanvas` 는 `watchPalette` 로 지역 변수만 갱신하고, 게임에 넘긴 `ctx.palette` 는
`create()` 시점의 스냅샷 그대로다. `DrawKit` 은 `() => palette` 클로저라 최신 색을 보므로
**볼만 테마를 따라가고, 게임이 직접 그린 배경·레인·판은 옛 테마로 남는다.**
실측: 페이지는 어두워지는데 캔버스만 흰 얼음이었다.

고치는 쪽은 호스트다 — `instance` 에 새 팔레트를 전달하는 경로(예: `GameInstance.onPalette?`)를
계약에 더하거나, `ctx.palette` 를 getter 로 두면 된다. 그전까지 G04 는 `readPalette()` 를
1초에 한 번 직접 읽어 쓰고, **색이 실제로 달라졌을 때만** 레이어 캐시를 버린다.

> **2026-09-16.** **G01 도 같은 방식으로 막았다**(`readPalette()` 1초 폴링). 그 과정에서
> 원인을 코드로 확인했다 — `GameCanvas` 가 `create()` 에 `palette` 를 **값으로** 넘기므로
> `watchPalette` 가 갱신하는 것은 호스트 지역 변수뿐이고, 게임이 매 프레임 `ctx.palette` 를
> 다시 읽어도 **같은 객체**다. 검증은 플레이 중 `data-theme` 을 바꾸고 캔버스 픽셀을 읽는
> 방식이 확실하다(폴링을 끄면 값이 그대로여서 반증까지 된다).
> **남은 네 게임(G02·G03·G05·G06)은 아직 미대응일 수 있다.**

---

## 게임 카드 썸네일 (2026-09-10)

목록에서 **무엇을 고르는지 그림으로 알 수 있어야 한다**(사용자 요청). 2단계에서 임시로 쓴 서비스 글리프는 색만 구분했을 뿐 "오리 사격장" 옆의 별이 게임을 가리키지 않았다.

### 왜 캔버스 스냅샷이 아니라 SVG 인가

진짜 화면을 찍어 넣는 두 방법 모두 막힌다.

| 방법 | 왜 안 되는가 |
|---|---|
| 런타임 렌더 | 목록에서 게임 모듈을 불러야 한다 → **번들 경계가 무너진다**("First Load +5KB 이내" 위반) |
| 빌드 타임 PNG | headless 브라우저가 빌드에 끼어들고, 여섯 장 × 라이트/다크 = 열두 장을 만들어 최적화해야 한다 → **의존성을 늘리지 않는다는 선**을 넘는다([[0014-number-playground]]) |

인라인 SVG 는 **서버 HTML 에 그대로 실려 JS 가 0**이고, `currentColor` 라 다크모드가 저절로 따라온다. 그림이 단순한 대신 그 셋을 다 지킨다.

### 규격

- `viewBox="0 0 120 68"`, 카드 상단 전체 폭. `aspect-ratio` 로 높이를 예약해 카드 여섯이 글자 수와 무관하게 같은 리듬으로 선다
- **색은 `currentColor` 하나.** 농담은 `opacity` 로만 낸다 — 여섯이 한 벌로 보여야 한다
- 배경은 `--svc-{accent}-bg` 파스텔, 그림은 `--svc-{accent}` 진한 색. 둘 다 CSS 가 정하므로 SVG 는 색을 모른다
- `aria-hidden` — 제목과 설명이 바로 옆에 있으므로 그림은 장식이다

### ⚠ 그림은 실제 게임을 보고 그린다

크레인 썸네일을 처음에 **캡슐**(위아래 반쪽이 갈린 모양)로 그렸다가 실제 화면을 보고 **동물 볼**(귀 달린 얼굴)로 고쳤다. `catalog` 의 소개도 "동물 볼" 이다. **목록 그림이 실제와 다르면 직관적으로 보여 주려던 목적 자체가 무너진다.** 게임이 바뀌면 썸네일도 함께 본다.

---

## 문구 규칙

**"재미용" · "모으기" 만 쓴다.** 점수·랭킹·배당·적중 같은 말을 쓰지 않는다
([[forbidden-expressions]]). 게임 안내 문구도 마찬가지다 — "6마리를 맞혀 번호를 모으세요" 는
되고 "높은 점수에 도전하세요" 는 되지 않는다.

관련: [[playground-game-contract]] · [[0014-number-playground]] · [[responsive-rules]] · [[accessibility]] · [[components]] · [[forbidden-expressions]] · [[adsense-readiness]]
