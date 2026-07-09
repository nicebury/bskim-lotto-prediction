---
type: design
title: "웹 접근성 체크리스트"
description: "시맨틱 HTML·헤딩 계층·ARIA·키보드·색 대비·색 단독 정보 금지(1.4.1)·reduced-motion·이미지 대체텍스트 실행 규칙."
tags: [design, a11y]
owner: frontend
status: stable
sources: ["raw:작업지시서초안_보완.md#5", "raw:메인샘플.png"]
created: 2026-07-09
updated: 2026-07-09
---

# 웹 접근성 체크리스트

접근성은 기능 완성 후 붙이는 것이 아니라 **첫 구현 단계부터** 반영한다. 이 페이지는 세션 C 가 컴포넌트를 만들 때마다 훑는 실행 가능한 체크리스트다. 컴포넌트별 마크업은 [[components]], 반응형·터치·모션 관련 요구는 [[responsive-rules]], 색 값은 [[design-tokens]] 를 함께 본다.

Lighthouse 접근성·SEO 점수는 세션 C 완료 기준(작업지시서 7.3)에 포함된다.

---

## 시맨틱 HTML

용도에 맞는 태그를 쓴다. `<div>` 를 남발하지 않는다.

- 페이지 최상위 콘텐츠는 `<main>` 하나.
- 헤더는 `<header>`, 내비게이션은 `<nav>`, 푸터는 `<footer>`.
- 홈의 각 구획(히어로 · 6타일 · 3분할 · 통계 · 캐러셀 · 가이드)은 `<section>` 이고, 각각 제목을 갖는다.
- 독립적으로 이해되는 카드(뉴스 항목 · 가이드 카드 · 회차 결과)는 `<article>`.
- 날짜·추첨일·D-day 는 `<time dateTime="2026-07-11">`. 기계가 읽을 수 있게 `dateTime` 을 준다.
- 목록은 `<ul>`/`<ol>`. 추천 세트·뉴스 목록·통계 순위를 `<div>` 나열로 만들지 않는다.

---

## 헤딩 계층

`h1 → h2 → h3` 순서를 건너뛰지 않는다.

- 페이지당 `<h1>` 은 하나. 홈에서는 히어로 헤드라인이 `<h1>`.
- 각 `<section>` 의 제목은 `<h2>`(예: "주요 통계", "오늘의 추천 번호", "로또 가이드").
- 카드 내부 소제목은 `<h3>`.
- 시각적으로 제목을 숨겨야 하는 구획(예: 아이콘 6타일 그리드)에도 스크린리더용 제목을 두고 `.sr-only` 로 감춘다. 계층을 비우지 않는다.

---

## ARIA — 언제 쓰고 언제 안 쓰나

**기본 시맨틱으로 충분하면 ARIA 를 쓰지 않는다.** `<button>` 에 `role="button"` 을 붙이지 않는다. ARIA 는 네이티브 시맨틱이 부족한 상호작용에만 더한다.

쓰는 곳:

- 햄버거·검색 토글 버튼: `aria-expanded`(열림 상태) + `aria-controls`(여는 대상 id).
- 현재 페이지 nav 링크: `aria-current="page"`.
- 탭 UI(통계 window 전환 등): `role="tab"` / `aria-selected` / `aria-controls`.
- 비동기 상태 알림(추천 재생성 중·완료): `aria-live="polite"` 영역.
- 아이콘만 있는 버튼: `aria-label` 로 이름을 준다(예: 검색 아이콘 → `aria-label="검색 열기"`).
- 번호 볼: `aria-label="13번, 11~20 구간"` (아래 색 단독 정보 금지 참조).

안 쓰는 곳: 이미 텍스트 라벨이 보이는 버튼, 네이티브 `<nav>`/`<main>`/`<footer>`, 시맨틱 목록.

---

## 키보드 내비게이션

마우스 없이 전부 조작 가능해야 한다.

- 모든 상호작용 요소는 Tab 순서에 들어오고 논리적 순서를 따른다. `tabindex` 양수 값을 쓰지 않는다.
- 버튼은 `type="button"` 을 명시한다(폼 안에서 의도치 않은 submit 방지).
- `:focus-visible` 스타일을 반드시 준다. 포커스 링을 `outline: none` 으로 지우지 않는다.
- 햄버거 드로어·검색 오버레이는 열릴 때 포커스를 안으로 가두고(focus trap), `Esc` 로 닫고, 닫으면 포커스를 연 버튼으로 되돌린다.
- 캐러셀은 좌우 화살표 버튼으로 키보드 이동이 가능해야 한다. 스와이프 전용이면 안 된다.

```css
:where(a, button, input, select, [tabindex]):focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
```

---

## 색 대비 (WCAG AA)

본문 텍스트/배경 대비는 WCAG AA(일반 텍스트 4.5:1, 큰 텍스트 3:1) 이상.

- `--color-text` on `--color-surface`, `--color-text-muted` on `--color-bg` 는 AA 를 통과한다([[design-tokens]]).
- `--color-text-subtle` 은 3차 정보(placeholder·비활성)에만 쓰고 본문에 쓰지 않는다.
- CTA 버튼: 흰 텍스트 on `--color-primary`(#3B4FD8) 는 통과.
- 다크 세트에서 `--color-primary` 를 밝게 올린 이유가 이것이다 — 어두운 배경에서 링크 대비를 확보하기 위함.

---

## 색만으로 정보를 전달하지 않기 (WCAG 1.4.1) ★핵심 함정

**번호 볼의 색 구간이 정확히 이 함정이다.** 볼 색(1~10 노랑 … 41~45 초록)은 구간을 시각적으로 알려주지만, 색을 구분하지 못하는 사용자(색각 이상·저시력·흑백 출력)에게는 아무 정보가 아니다.

따라서 색은 **보조** 채널이고 정보는 항상 다른 채널로도 전달한다.

- 볼에는 **항상 숫자가 보인다.** 색 없이도 어떤 번호인지 읽힌다.
- 스크린리더에는 `aria-label="13번, 11~20 구간"` 으로 구간을 **말로** 준다([[components]] LottoBall).
- 상태 배지(크롤 성공/실패, 추첨 D-day 등)도 색만으로 구분하지 않는다. 아이콘·텍스트를 함께 둔다.
- 통계 차트의 계열 구분도 색 + 라벨/패턴을 함께 쓴다.

밝은 볼 위 숫자 대비도 여기서 나온다. 노랑(`--ball-1-10`)·초록(`--ball-41-45`) 위에 흰 숫자를 얹으면 대비가 AA 에 미달한다. 이 두 구간은 `--ball-fg-dark`(어두운 글자)를 써 숫자가 색 없이도 또렷하게 읽히게 한다([[design-tokens]]).

---

## reduced-motion

`@media (prefers-reduced-motion: reduce)` 를 존중한다.

- 캐러셀 자동 재생, 볼 등장 팝 애니메이션, 카드 호버 이동, 스켈레톤 시머를 끄거나 줄인다.
- CSS 뿐 아니라 JS 애니메이션도 `matchMedia('(prefers-reduced-motion: reduce)')` 로 감지해 타이머 자체를 걸지 않는다([[responsive-rules]] prefers-reduced-motion).
- 모션을 껐을 때 정보가 사라지면 안 된다. 애니메이션은 장식이지 정보 전달 수단이 아니다.

---

## 이미지 alt vs aria-hidden

- 의미 있는 이미지(뉴스 썸네일, 회차 판매점 사진 등)는 내용을 서술하는 `alt` 를 준다.
- 순수 장식(히어로 일러스트, 배경 그라디언트, 아이콘 타일의 글리프처럼 옆 텍스트가 이미 설명하는 것)은 `alt=""` 또는 `aria-hidden="true"` 로 접근성 트리에서 숨긴다.
- 이모지 아이콘이 유일한 의미 전달자면 `role="img"` + `aria-label` 을 주고, 옆 텍스트가 이미 있으면 `aria-hidden="true"`.
- SVG 로고: 서비스명을 담으면 `role="img"` + `<title>`, 텍스트 로고 옆 장식이면 `aria-hidden`.

빈 `alt` 를 빠뜨려 파일명이 읽히는 일이 없게 한다 — 장식 이미지에도 `alt=""` 를 명시한다.
