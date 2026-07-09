---
type: decision
title: "ADR 0002 — 프론트엔드는 Next.js App Router"
description: "SEO 와 애드센스 심사를 위해 서버 렌더링이 필요하다. Vite CSR SPA 를 폐기한다"
tags: [decision, seo]
owner: frontend
status: stable
sources: ["raw:작업지시초안.md#4.1", "raw:작업지시서초안_보완.md#6.1"]
created: 2026-07-09
updated: 2026-07-09
---

# ADR 0002 — 프론트엔드는 Next.js App Router

## 결정

신규 프론트엔드를 Next.js App Router 로 작성한다. 기존 `frontend/`(Vite + React 18 + plain JSX, CSR SPA)는 신규 완성 후 삭제한다.

## 맥락

이 서비스의 성패는 검색 유입에 달려 있다. 사이트명 "행운상자" 는 일반명사 조합이라 브랜드 검색을 기대할 수 없다 ([[trademark-check]]). 유입은 전적으로 회차·통계 롱테일 키워드(`로또 1231회 당첨번호`, `로또 오래 안 나온 번호`)가 담당한다. 여기에 애드센스 승인이 걸려 있다.

## 왜 서버 렌더링이 필요한가

**검색엔진이 읽을 HTML 이 있어야 하기 때문이다.**

기존 구조는 `index.html` 하나에 JS 번들을 붙이고, 브라우저가 API 를 호출해 본문을 그린다. 크롤러가 JS 를 실행하기는 하지만, 렌더링 큐는 별도이고 지연되며 보장되지 않는다. 회차 상세 페이지가 1,231개인데 각각이 "JS 를 실행해야만 내용이 보이는 빈 껍데기" 라면, 색인이 언제 될지 알 수 없다.

애드센스 심사는 더 직접적이다. 심사자가 보는 것은 "API 데이터만 표로 출력하는 사이트", "아이콘만 있는 메인홈" 이다. 초안 11.2 가 명시적으로 피하라고 적은 상태다. 본문 텍스트가 서버에서 완성되어야 한다.

**두 번째 이유는 프레임워크가 SEO 를 기본기로 갖고 있다는 점이다.** `generateMetadata`, `sitemap.ts`, `robots.ts`, `generateStaticParams` 는 별도 라이브러리 없이 존재한다. 기존 저장소는 `backend/app/routers/seo.py` 에서 sitemap 과 robots 를 서버가 뱉고 있었다 — 프론트의 관심사를 백엔드가 떠맡은 것이다. 이 역전을 바로잡는다.

**세 번째는 회차 페이지의 성격이다.** 과거 회차는 사실상 불변이다. SSG 로 굽고 ISR 로 갱신하면, 1,231개 페이지가 정적 파일이 되어 CDN 에서 즉시 나간다. LCP 가 좋아지고, Core Web Vitals 는 그 자체로 SEO 요소다.

## 렌더링을 쓰지 않는 곳

번호 추천과 꿈해몽은 결과가 매번 다르다. 서버 렌더링이 무의미하고, ISR 캐시를 오염시킨다.

다만 **페이지 본문 — 설명, 추천 기준, 면책 고지, 사용법 — 은 서버 렌더링한다.** 인터랙션 결과만 클라이언트에서 그린다. 초안 4.1 의 "아이콘만 있고 설명 본문이 없는 홈 화면" 을 피하는 지점이 정확히 여기다.

## 기각한 대안

**현행 Vite + React 유지 + prerender 플러그인.** 기존 컴포넌트와 CSS 를 재활용할 수 있다. 그러나 초안 4.1 이 "피해야 할 방향" 으로 `index.html` 하나짜리 CSR SPA 를 명시적으로 지목했다. prerender 로 정적 경로는 구울 수 있지만 `/lotto/round/{n}` 처럼 1,231개로 늘어나는 동적 경로와 ISR 재검증은 직접 구현해야 한다. 결국 Next.js 를 다시 만드는 일이 된다.

**Astro.** 콘텐츠 중심 정적 사이트에 최적이고 가이드·꿈해몽 페이지에 강하다. 그러나 추천 시뮬레이터처럼 상태가 많은 화면은 island 로 따로 구성해야 하고, 팀에 학습 비용이 든다. 이 프로젝트에는 정적 콘텐츠와 인터랙션이 반반씩 있어 이점이 상쇄된다.

## 결과

- TypeScript 를 쓴다. 기존 프론트는 plain JSX 였다. [[api-contract]] 의 응답 타입을 타입으로 강제하는 편이 계약 준수에 유리하다.
- `.claude/skills/ui-ux-pro-max` 는 "Vite + React 18 plain JSX + 순수 CSS, Next/TS 미사용" 을 전제로 쓰여 있다. **개정이 필요하다.**
- 서버 컴포넌트와 클라이언트 컴포넌트의 환경변수가 다르다 ([[env-vars]]).
- 애널리틱스에 App Router 고유의 함정이 있다 ([[analytics]]).

## 되돌리려면

되돌리지 않는다. CSR 로 회귀하면 이 서비스의 유일한 유입 경로가 사라진다.

관련: [[0001-monorepo-3-sessions]] · [[metadata-strategy]] · [[analytics]] · [[api-contract]]
