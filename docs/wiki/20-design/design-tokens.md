---
type: design
title: "디자인 토큰"
description: "행운상자 UI 의 색·타이포·간격·radius·shadow CSS 커스텀 프로퍼티 단일 출처. 라이트/다크 두 세트."
tags: [design]
owner: frontend
status: stable
sources: ["raw:작업지시서초안_보완.md#5", "raw:메인샘플.png", "frontend/src/styles.css:4"]
created: 2026-07-09
updated: 2026-07-09
---

# 디자인 토큰

이 페이지는 행운상자 프론트엔드가 쓰는 **모든 디자인 값의 단일 출처**다. 색·타이포·간격·모서리·그림자를 CSS 커스텀 프로퍼티로 선언한다. 컴포넌트 CSS 는 여기 선언된 변수만 참조하고, 원시 hex/px 를 직접 박지 않는다.

값의 근거는 시안(`docs/raw/메인샘플.png`)과 디자인 가이드(작업지시서 5.1)다. 라이트 세트는 가이드가 명시한 값을 그대로 옮겼고, 다크 세트는 기존 구현(`frontend/src/styles.css`)의 다크 팔레트를 이 이름 체계로 재매핑한 것이다. 시안은 데스크톱 라이트 화면만 보여주지만 헤더에 다크 토글이 있으므로(5.3) 두 세트를 모두 정의한다.

레이아웃이 이 토큰을 어떻게 재배치하는지는 [[responsive-rules]], 각 컴포넌트가 어떤 토큰을 쓰는지는 [[components]], 색 대비·색 단독 정보 전달 금지는 [[accessibility]] 를 본다.

---

## 토큰 이름 짓는 규칙

토큰이 200개가 되면 토큰이 없는 것과 같다. 이름은 **역할(role)** 을 담고, 컴포넌트 이름을 담지 않는다. `--card-bg` 가 아니라 `--color-surface` 다. 카드·모달·헤더가 모두 같은 표면색을 공유하기 때문이다.

접두어로 카테고리를 고정한다.

- `--color-*` — 색. `--color-{역할}[-{변형}]`. 변형은 `hover` / `soft` / `strong` / `muted` / `subtle`.
- `--ball-*` — 번호 볼 5구간 색. `--ball-{하한}-{상한}`.
- `--svc-*` — 홈 6타일 서비스별 고정 색. `--svc-{서비스}` (글리프) / `--svc-{서비스}-bg` (파스텔 배경).
- `--font-*`, `--fs-*`, `--fw-*` — 폰트 패밀리 / 글자 크기 / 굵기.
- `--space-*` — 간격 스케일. 4px 배수.
- `--radius-*` — 모서리. `sm` / `card` / `pill`.
- `--shadow-*` — 그림자 고도. `card` / `card-hover` / `pop`.

의미가 있는 색은 역할 이름으로만 쓴다. `--color-primary` 를 "파랑"이라 부르지 않는다. 다크 모드에서 파랑이 아니게 되기 때문이다.

---

## 라이트 세트 (기본)

```css
:root {
  color-scheme: light dark;

  /* ── Color · Surface ──────────────────────────── */
  --color-bg:            #F7F8FC;  /* 페이지 배경 (5.1) */
  --color-surface:       #FFFFFF;  /* 카드 배경 (5.1) */
  --color-surface-2:     #FAFBFD;  /* 카드 내부 보조 면·표 헤더 */
  --color-border:        #EAECF0;
  --color-border-strong: #D0D5DD;

  /* ── Color · Text ─────────────────────────────── */
  --color-text:          #1A1D2E;  /* 본문 (5.1) */
  --color-text-muted:    #6B7280;  /* 보조 설명·날짜 (5.1) */
  --color-text-subtle:   #98A2B3;  /* 3차 텍스트·placeholder */

  /* ── Color · Brand ────────────────────────────── */
  --color-primary:       #3B4FD8;  /* CTA·강조 숫자(D-day)·링크 (5.1) */
  --color-primary-hover: #2E40BE;
  --color-primary-soft:  #EEF0FB;  /* 히어로 그라디언트 시작 (5.1) */
  --color-primary-soft2: #F5F0FC;  /* 히어로 그라디언트 끝 (5.1) */

  /* ── Color · Semantic (상태 표시) ──────────────── */
  --color-success:       #16A34A;
  --color-success-soft:  #DCFCE7;
  --color-warning:       #D97706;
  --color-warning-soft:  #FEF3C7;
  --color-danger:        #DC2626;
  --color-danger-soft:   #FEE2E2;
  --color-info:          #0284C7;
  --color-info-soft:     #E0F2FE;

  /* ── Ball · 동행복권 공식 5구간 ────────────────── */
  /* 시안 색이 아니라 공식 규칙. 근거: [[0009-official-ball-colors-over-mockup]] */
  --ball-1-10:   #FBC400;  /* 1~10  노랑 */
  --ball-11-20:  #69C8F2;  /* 11~20 파랑 */
  --ball-21-30:  #FF7272;  /* 21~30 빨강 */
  --ball-31-40:  #AAAAAA;  /* 31~40 회색 */
  --ball-41-45:  #B0D840;  /* 41~45 초록 */
  --ball-fg:       #FFFFFF; /* 진한 볼(파랑·빨강·회색) 위 숫자 */
  --ball-fg-dark:  #1A1D2E; /* 밝은 볼(노랑·초록) 위 숫자 — 대비 확보 */

  /* ── Service · 홈 6타일 고정 색 ────────────────── */
  --svc-lotto:      #22A968;  --svc-lotto-bg:   #DFF5EA;  /* 로또 6/45 = 그린 */
  --svc-stats:      #7C5CFC;  --svc-stats-bg:   #ECE7FE;  /* 번호 통계 = 퍼플 */
  --svc-reco:       #F59E0B;  --svc-reco-bg:    #FEF0D6;  /* 번호 추천 = 오렌지 */
  --svc-dream:      #EC4899;  --svc-dream-bg:   #FCE3EF;  /* 꿈해몽 = 핑크 */
  --svc-news:       #3B82F6;  --svc-news-bg:    #E1ECFE;  /* 복권 뉴스 = 블루 */
  --svc-pension:    #9AA4B2;  --svc-pension-bg: #EDEFF3;  /* 연금복권 = 그레이(준비중) */

  /* ── Typography ───────────────────────────────── */
  --font-sans:
    'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont,
    'Segoe UI', 'Noto Sans KR', Roboto, system-ui, sans-serif;

  --fs-hero: clamp(1.75rem, 1.1rem + 3.2vw, 2.5rem); /* 히어로 헤드라인 */
  --fs-h1:   1.6rem;
  --fs-h2:   1.15rem;
  --fs-h3:   1rem;
  --fs-body: 0.95rem;
  --fs-sm:   0.85rem;
  --fs-xs:   0.78rem;

  --fw-regular:  400;
  --fw-medium:   500;
  --fw-semibold: 600;
  --fw-bold:     700;
  --fw-black:    800;

  /* ── Spacing (4px 배수) ───────────────────────── */
  --space-1:  4px;
  --space-2:  8px;
  --space-3:  12px;
  --space-4:  16px;
  --space-5:  20px;
  --space-6:  24px;
  --space-8:  32px;
  --space-12: 48px;
  --space-16: 64px;

  /* ── Radius ───────────────────────────────────── */
  --radius-sm:   8px;
  --radius-card: 16px;   /* 카드 (5.1) */
  --radius-pill: 999px;

  /* ── Shadow (라이트: 낮은 대비 소프트 섀도우) ──── */
  --shadow-card:       0 1px 3px rgb(26 29 46 / 0.06), 0 1px 2px rgb(26 29 46 / 0.04);
  --shadow-card-hover: 0 4px 12px -2px rgb(26 29 46 / 0.10), 0 2px 6px -2px rgb(26 29 46 / 0.05);
  --shadow-pop:        0 12px 28px -8px rgb(26 29 46 / 0.14);

  /* ── Motion ───────────────────────────────────── */
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --dur-fast: 120ms;
  --dur:      200ms;
}
```

숫자는 자리 흔들림을 막기 위해 `font-variant-numeric: tabular-nums` 를 전역 적용한다(5.1). D-day 카운트다운·통계 회수·회차 번호·당첨금이 모두 자리 정렬을 요구하기 때문이다.

```css
body {
  font-family: var(--font-sans);
  font-variant-numeric: tabular-nums;   /* 또는 font-feature-settings: 'tnum' on */
  background: var(--color-bg);
  color: var(--color-text);
}
```

Pretendard 는 웹폰트 서브셋으로 자체 호스팅한다(5.1). CDN 의존을 피하고, 한글 글리프만 서브셋해 로드를 줄인다. 시스템 폰트 폴백 스택을 반드시 남겨 폰트 로딩 전에도 레이아웃이 서게 한다(CLS 방지 — [[responsive-rules]]).

---

## 다크 세트

`prefers-color-scheme` 을 기본 신호로 쓰고, 헤더의 수동 토글이 이를 덮어쓴다(5.3). 토글 구현은 `:root[data-theme="dark"]` 를 함께 걸어 자동/수동 양쪽이 동작하게 한다.

```css
@media (prefers-color-scheme: dark) {
  :root { /* 아래 다크 오버라이드 */ }
}
:root[data-theme="dark"] { /* 동일 오버라이드 (수동 토글) */ }
:root[data-theme="light"] { /* 라이트 강제 시 원복 */ }
```

다크 오버라이드 값(근거: `frontend/src/styles.css:59` 다크 블록을 이 이름 체계로 재매핑):

```css
/* 다크 오버라이드 공통 본문 */
--color-bg:            #0B0D12;
--color-surface:       #121620;
--color-surface-2:     #161B27;
--color-border:        #232A3A;
--color-border-strong: #2F3849;

--color-text:          #E6E9EF;
--color-text-muted:    #9AA4B2;
--color-text-subtle:   #6B7280;

--color-primary:       #7C8CFF;  /* 어두운 배경에서 명도 올림 */
--color-primary-hover: #9AA8FF;
--color-primary-soft:  #1E1B4B;
--color-primary-soft2: #241C4E;

--color-success-soft:  #052E16;
--color-warning-soft:  #451A03;
--color-danger-soft:   #450A0A;
--color-info-soft:     #0C2A3A;

--shadow-card:       0 1px 2px rgb(0 0 0 / 0.5);
--shadow-card-hover: 0 4px 12px rgb(0 0 0 / 0.45);
--shadow-pop:        0 12px 28px rgb(0 0 0 / 0.5);
```

**볼 5구간 색(`--ball-*`)과 서비스 색(`--svc-*`)은 다크에서 바꾸지 않는다.** 볼 색은 학습된 색-구간 매핑이라(→ [[accessibility]]) 다크에서 변형하면 규칙이 깨진다. 서비스 색은 파스텔 배경(`-bg`)만 어둡게 낮추고 글리프 색은 유지한다. 필요 시 `-bg` 변형만 다크 값으로 덮는다.

밝은 볼(노랑 `--ball-1-10`, 초록 `--ball-41-45`) 위 숫자는 라이트/다크 공통으로 `--ball-fg-dark` 를 쓴다. 흰 숫자를 얹으면 대비가 WCAG AA 에 미달한다(상세: [[accessibility]] · [[components]]).

---

## 사용 원칙

- 컴포넌트 CSS 에 hex/px 리터럴을 쓰지 않는다. 새 값이 필요하면 여기서 토큰을 먼저 만든다.
- 반투명 파생색이 필요하면 `color-mix(in oklab, var(--color-primary) 20%, transparent)` 로 토큰에서 유도한다. 새 hex 를 만들지 않는다.
- 상태색(`--color-success` 등)은 상태 표시에만 쓴다. 브랜드 강조에 초록을 끌어다 쓰지 않는다.
- 간격은 `--space-*` 스케일에서만 고른다. 임의의 `13px` 여백을 만들지 않는다.
