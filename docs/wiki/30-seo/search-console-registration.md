---
type: seo
title: "검색엔진 등록 — 서치콘솔 · 서치어드바이저 절차"
description: "Google Search Console과 네이버 서치어드바이저의 소유확인·사이트맵 제출 절차. 사람이 하는 단계와 코드가 하는 단계를 분리."
tags: [seo]
owner: frontend
status: stable
sources: ["raw:작업지시서초안_보완.md#6.3", "raw:작업지시서초안_보완.md#13.3"]
created: 2026-07-09
updated: 2026-07-09
---

# 검색엔진 등록 절차

Google Search Console 과 네이버 서치어드바이저에 사이트를 등록해 색인을 유도하고 검색 노출을 관리한다. 국내 유입에는 네이버 등록이 필수다(보완판 6.3).

두 플랫폼 모두 **HTML 메타태그 방식으로 소유확인**한다. 소유확인 값은 `GOOGLE_SITE_VERIFICATION` / `NAVER_SITE_VERIFICATION` 환경변수로 `app/layout.tsx` 에 주입한다([[env-vars]]). 사이트맵 생성은 [[metadata-strategy]](`app/sitemap.ts`)을 본다.

아래는 **사람이 하는 단계(콘솔에서 계정·값 확보)** 와 **코드가 하는 단계(메타태그 주입·사이트맵 노출)** 를 분리한 체크리스트다.

---

## 코드가 하는 단계 — 소유확인 메타태그 주입

Next.js 는 `metadata.verification` 필드로 소유확인 메타태그를 표준 렌더링한다. 루트 레이아웃에서 환경변수를 읽어 주입한다.

```tsx
// app/layout.tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL!),
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION,
    other: {
      "naver-site-verification": process.env.NAVER_SITE_VERIFICATION ?? "",
    },
  },
};
```

- Google 은 `verification.google` 로 `<meta name="google-site-verification" ...>` 을 렌더링한다.
- 네이버는 표준 필드가 없으므로 `verification.other` 로 `<meta name="naver-site-verification" ...>` 을 렌더링한다.
- 값이 비면 태그가 빈 값으로 나가므로, **콘솔에서 값을 발급받은 뒤 `.env` 를 채우고 재배포**하는 순서다. 값을 코드에 하드코딩하지 않는다.

> 값은 시크릿이 아니라 공개 메타태그로 노출되는 값이지만, 프로젝트 규약상 모든 환경 의존값은 `.env`/`env.sample` 로 관리한다([[env-vars]]). Claude 는 `.env` 를 읽지 않으며, 새 키가 필요하면 `frontend/env.sample` 에 키+주석만 추가하고 사용자에게 갱신을 요청한다.

---

## Google Search Console

### 사람이 하는 단계

- [ ] [Google Search Console](https://search.google.com/search-console) 접속 → 속성 추가
- [ ] 속성 유형 **URL 접두어**로 사이트 URL(`https://<도메인>`) 입력
- [ ] 소유확인 방법 **HTML 태그** 선택 → 제공된 `content` 값 복사
- [ ] `frontend/.env` 의 `GOOGLE_SITE_VERIFICATION` 에 값 입력 (사용자가 수행)
- [ ] 재배포 후 콘솔에서 **확인** 클릭
- [ ] 소유확인 완료 후 **Sitemaps** 메뉴에서 `sitemap.xml` 제출
- [ ] (선택) URL 검사 도구로 주요 페이지 색인 요청

### 코드가 하는 단계

- [x] `metadata.verification.google` 로 메타태그 주입(위)
- [x] `app/sitemap.ts` 가 `{SITE_URL}/sitemap.xml` 을 노출 ([[metadata-strategy]])
- [x] `app/robots.ts` 에 `Sitemap:` 라인 포함

---

## 네이버 서치어드바이저

### 사람이 하는 단계

- [ ] [네이버 서치어드바이저](https://searchadvisor.naver.com) 접속 → 웹마스터 도구 → 사이트 등록
- [ ] 사이트 URL(`https://<도메인>`) 입력
- [ ] 소유확인 방법 **HTML 태그** 선택 → `content` 값 복사
- [ ] `frontend/.env` 의 `NAVER_SITE_VERIFICATION` 에 값 입력 (사용자가 수행)
- [ ] 재배포 후 **소유확인** 진행
- [ ] 소유확인 후 **사이트맵 제출**: `sitemap.xml`
- [ ] **RSS 제출**: 뉴스/콘텐츠 RSS 피드가 있으면 함께 제출 (없으면 사이트맵만)

### 코드가 하는 단계

- [x] `metadata.verification.other["naver-site-verification"]` 로 메타태그 주입(위)
- [x] 사이트맵 노출(Google 과 공용)
- [ ] RSS 피드 라우트(`app/rss.xml/route.ts` 등)는 **확인 필요** — 뉴스 콘텐츠 구현 시점에 결정. 현재 미구현이면 RSS 제출 단계는 건너뛴다.

> **status 주의**: RSS 피드 제공은 뉴스 큐레이션(초안 2차 구현)에 종속된다. MVP 시점에 RSS 라우트가 없으면 네이버에는 사이트맵만 제출하고 RSS 는 후속으로 미룬다. 이 부분은 뉴스 기능 확정 후 재확인이 필요하다.

---

## 계정 발급 체크리스트 (보완판 13.3)

사이트 등록과 함께 확보해야 하는 계정/값. 전부 **사람이** 발급하고 `.env` 에 채운다.

- [ ] Google Search Console 속성 + 소유확인 값(`GOOGLE_SITE_VERIFICATION`)
- [ ] 네이버 서치어드바이저 등록 + 소유확인 값(`NAVER_SITE_VERIFICATION`)
- [ ] GA4 속성 → 측정 ID(`NEXT_PUBLIC_GA_ID`) — [[analytics]]
- [ ] 네이버 애널리틱스 등록 → 스크립트 ID(`NEXT_PUBLIC_NAVER_ANALYTICS_ID`) — [[analytics]]

애드센스 신청은 색인·콘텐츠가 확보된 뒤다([[adsense-readiness]]).

---

## 순서 정리

1. 배포 도메인 확정 → `NEXT_PUBLIC_SITE_URL` 설정
2. 사이트 최초 배포(메타 주입 코드 포함, 소유확인 값은 아직 공란이어도 됨)
3. 각 콘솔에서 소유확인 값 발급 → `.env` 채움 → 재배포
4. 소유확인 완료 → 사이트맵(및 RSS) 제출
5. GA4·네이버 애널리틱스 ID 발급 → `.env` 채움 → 재배포 → 측정 확인([[analytics]])

## 관련 페이지

- [[metadata-strategy]] — `app/sitemap.ts` / `app/robots.ts`, `metadataBase`
- [[analytics]] — 측정 ID 발급과 page_view 함정
- [[structured-data]] — 색인 품질(리치 결과)
- [[adsense-readiness]] — 색인·콘텐츠 확보 후 신청
- [[env-vars]] — 소유확인·측정 환경변수 정본
