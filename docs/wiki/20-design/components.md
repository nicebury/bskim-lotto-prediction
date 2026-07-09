---
type: design
title: "컴포넌트 사양"
description: "번호 볼·카드·헤더·추천 캐러셀·통계 카드·가이드 카드·광고 슬롯의 props·상태·마크업 규약."
tags: [design]
owner: frontend
status: stable
sources: ["raw:작업지시서초안_보완.md#5", "raw:메인샘플.png", "frontend/src/components/LottoBall.jsx:1"]
created: 2026-07-09
updated: 2026-07-09
---

# 컴포넌트 사양

홈 화면을 이루는 재사용 컴포넌트의 사양이다. 색·크기 값은 토큰([[design-tokens]])에서 가져오고, 단별 배치는 [[responsive-rules]] 를 따르며, 접근성 요구는 [[accessibility]] 에 상세하다. 이 페이지는 각 컴포넌트가 **무엇을 받고(props) 어떤 상태를 갖고 어떻게 마크업되는지**를 정한다.

신규 프론트는 Next.js 지만 기존 `frontend/src/components/LottoBall.jsx` 의 구간 매핑 로직은 그대로 유효하다.

---

## LottoBall — 번호 볼

한 개의 로또 번호를 원형 볼로 렌더링한다. 색은 동행복권 공식 5구간을 따른다(시안 색 아님 — 근거 [[0009-official-ball-colors-over-mockup]]).

시그니처:

```tsx
<LottoBall number={13} />                 // 일반
<LottoBall number={16} bonus />           // 보너스 변형
<LottoBall number={7} size="sm" />        // 크기 변형
```

- `number: number` (1~45) — 필수. 이 값이 색 구간과 표시 숫자를 동시에 결정한다.
- `bonus?: boolean` — 보너스 변형. 볼 우상단에 `+` 배지를 얹는다.
- `size?: 'sm' | 'md' | 'lg'` — 크기 변형. 기본 `md`. 모바일에서도 최소 지름 36px + 44px 히트 영역([[responsive-rules]]).

구간→색 매핑은 순수 함수다:

```ts
function ballRange(n: number): 1|2|3|4|5 {
  if (n <= 10) return 1;   // 1~10  노랑 --ball-1-10
  if (n <= 20) return 2;   // 11~20 파랑 --ball-11-20
  if (n <= 30) return 3;   // 21~30 빨강 --ball-21-30
  if (n <= 40) return 4;   // 31~40 회색 --ball-31-40
  return 5;                // 41~45 초록 --ball-41-45
}
```

**색은 정보의 유일한 전달자가 아니다(WCAG 1.4.1).** 볼에는 항상 숫자가 있고, 스크린리더용 `aria-label` 에 구간을 명시한다. 형식은 정확히 다음이다:

```tsx
aria-label={`${number}번, ${lo}~${hi} 구간`}   // 예: "13번, 11~20 구간"
```

보너스는 `"16번, 11~20 구간, 보너스"` 로 붙인다. 밝은 볼(노랑·초록) 위 숫자는 `--ball-fg-dark` 를 써 대비를 확보한다([[accessibility]]). 상태는 없다(순수 표시 컴포넌트).

---

## Card — 카드

콘텐츠 컨테이너의 기본 골격. 최신 회차 결과·D-day·뉴스·통계·가이드가 모두 이 위에 선다.

- 배경 `--color-surface`, 테두리 `--color-border`, 모서리 `--radius-card`(16px), 그림자 `--shadow-card`.
- 호버 시 `--shadow-card-hover` + 미세한 상승(`translateY(-2px)`). `prefers-reduced-motion` 에서 이동을 끈다.
- 시맨틱: 독립적으로 이해되는 카드는 `<article>`, 페이지 구획은 `<section>` + 제목(`<h2>`/`<h3>`)으로 감싼다([[accessibility]] 헤딩 계층).

props 는 얇게: `title`, `action`(더보기 링크 등), `children`. 상태를 갖지 않는다.

---

## Header — 헤더

로고 + 내비게이션 + 검색 + 다크 토글. 데스크톱과 모바일에서 형태가 갈린다([[responsive-rules]] 헤더 전환).

- **데스크톱**: 가로 `<nav>` (로또 · 번호통계 · 번호추천 · 꿈해몽 · 뉴스 · 가이드) + 검색 입력 + 테마 토글 버튼.
- **모바일**: nav → 햄버거 버튼이 여는 **드로어**. 검색 → 아이콘이 여는 **전체화면 오버레이**.

시그니처(상태를 가진 클라이언트 컴포넌트):

```tsx
<Header />
// 내부 상태
//   drawerOpen: boolean   — 햄버거 드로어 열림
//   searchOpen: boolean   — 검색 오버레이 열림
//   theme: 'light'|'dark'|'system'  — 다크 토글 (localStorage 지속)
```

드로어·오버레이는 열릴 때 포커스를 안으로 가두고(focus trap), `Esc` 로 닫히며, 현재 페이지 링크에 `aria-current="page"` 를 준다. 햄버거·검색 버튼은 `aria-expanded` 와 `aria-controls` 를 갖는다. `type="button"` 을 명시한다. 상세는 [[accessibility]].

다크 토글은 `prefers-color-scheme` 을 기본값으로 읽고, 사용자가 누르면 `data-theme` 를 `<html>` 에 박아 자동값을 덮는다([[design-tokens]] 다크 세트).

---

## RecommendCarousel — 추천번호 캐러셀

"오늘의 추천 번호" 5장(완전 랜덤 · 최근 HOT · 최근 COLD · 홀짝 균형 · 번호대 균형)을 가로로 넘긴다. 각 카드는 6개 볼 + "다시 생성" 버튼.

- 데스크톱: 여러 장 노출 + 좌우 화살표.
- 모바일: `scroll-snap` 터치 스와이프, 한 장씩 정렬.

```css
.carousel-track {
  display: flex;
  gap: var(--space-4);
  overflow-x: auto;
  scroll-snap-type: x mandatory;
}
.carousel-item { scroll-snap-align: start; flex: 0 0 auto; }
```

시그니처:

```tsx
<RecommendCarousel items={cards} onRegenerate={(mode) => …} />
```

- `items` — 5개 추천 세트. 각 항목은 `mode`, `label`, `numbers: number[]`.
- `onRegenerate(mode)` — "다시 생성" 콜백. 결과는 매번 달라진다.

상태: 현재 인덱스, 각 카드의 재생성 로딩 여부. 자동 재생을 넣는다면 `prefers-reduced-motion: reduce` 에서 타이머를 걸지 않는다([[responsive-rules]]). 좌우 화살표·"다시 생성"은 44px 히트 영역. 번호 볼은 LottoBall 을 그대로 쓴다.

문구 주의: 이 컴포넌트 어디에도 "당첨 확률 / 고확률 / 예상 적중률" 을 쓰지 않는다. "재미용 시뮬레이션 · 당첨을 보장하지 않습니다" 고지를 캐러셀 하단에 둔다.

---

## StatCard — 통계 카드

주요 통계 4종(많이 나온 TOP5 · 안 나온 TOP5 · 번호 출현 빈도 · 패턴 분석)을 담는다. Card 위에 얹는다.

- TOP5 류: 순위 + 볼 + 회수 막대. 회수 숫자는 `tabular-nums`.
- 번호 출현 빈도: 45개 막대차트. **모바일에서는 상위 5개 + "전체 보기" 링크로 축약**하고 전체 차트는 통계 상세 페이지의 가로 스크롤 컨테이너로 보낸다([[responsive-rules]] 차트 축약).
- 패턴 분석: 홀짝 비율 · 고저 비율 · 평균 합계 · 연속번호 출현. `probability`·`win_rate` 같은 표현을 쓰지 않고 분포를 서술한다.

props: `title`, `window`(20/50/100/all), `data`, `moreHref`. 상태: 로딩(스켈레톤), 에러, 빈 데이터. 로딩 시 CLS 를 막기 위해 슬롯 크기를 미리 예약한다.

---

## GuideCard — 가이드 카드

로또 가이드 5종(당첨확인 방법 · 당첨금 수령 · 통계 보는 법 · 자동 vs 수동 · 건전한 복권 이용). 파스텔 배경 + 제목 + 한 줄 설명 + "자세히 보기" 링크.

- 각 카드는 `<article>`, 링크 전체가 클릭 타겟이면 카드 자체를 `<a>` 로 감싸거나 제목 링크에 stretched-link 패턴을 쓴다.
- 배경 파스텔은 서비스 색과 충돌하지 않는 중립 톤을 쓰되, 필요 시 `--svc-*-bg` 계열을 재활용한다([[design-tokens]]).

props: `title`, `summary`, `href`, `accent?`. 상태 없음(정적 콘텐츠, SSG 대상).

---

## AdSlot — 광고 슬롯

애드센스 승인 전에는 **아무것도 렌더링하지 않는다**(작업지시서 6.5). 클라이언트 환경변수 `NEXT_PUBLIC_ADSENSE_CLIENT` 가 비어 있으면 광고 코드를 넣지 않는다.

```tsx
export function AdSlot({ slot }: { slot: string }) {
  const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;
  if (!client) return null;         // 미승인·미설정 시 미렌더링
  return <ins className="ad-slot" data-ad-client={client} data-ad-slot={slot} />;
}
```

- 렌더링하지 않더라도 **`min-height` 를 예약**해 승인 후 광고가 들어와도 레이아웃이 밀리지 않게 한다(CLS — [[responsive-rules]]).
- "준비 중" 페이지(연금복권·스피또)에는 광고를 넣지 않는다.
- `null` 반환 시에도 자리 표시가 필요하면 빈 `.ad-slot`(min-height 만 있는 상자)을 대신 둔다. 다만 빈 상자에 "광고" 라벨을 붙이지 않는다.

props: `slot`(광고 슬롯 ID). 상태: 렌더 여부(환경변수에 의존)만.
