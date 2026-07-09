---
type: seo
title: "애널리틱스 — GA4 · 네이버 애널리틱스와 App Router page_view 함정"
description: "접속수·유입경로·체류시간 측정. Next.js App Router 클라이언트 라우팅에서 page_view가 최초 진입만 잡히는 함정과 해법 코드."
tags: [seo, analytics, pitfall]
owner: frontend
status: stable
sources: ["raw:작업지시서초안_보완.md#6.4", "raw:작업지시서초안_보완.md#13.3"]
created: 2026-07-09
updated: 2026-07-09
---

# 애널리틱스

측정 목표는 셋이다(보완판 6.4).

1. **접속수** — 얼마나 들어오는가
2. **유입 경로** — 어디서(검색·블로그·직접) 오는가
3. **페이지별 체류시간** — 어느 페이지에 오래 머무는가

GA4 와 네이버 애널리틱스를 함께 쓴다. GA4 는 전반 지표와 유입 채널 분해, 네이버 애널리틱스는 국내 유입(네이버 검색·블로그) 분해에 유용하다. 두 측정 ID 는 `NEXT_PUBLIC_GA_ID` / `NEXT_PUBLIC_NAVER_ANALYTICS_ID` 환경변수로 주입한다([[env-vars]]).

이 페이지는 **`pitfall`** 이다. 아래 "App Router 함정"을 밟으면 링크 이동 페이지뷰가 통째로 누락돼, 데이터가 며칠 쌓인 뒤에야 이상을 눈치채고 크게 시간을 잃는다.

---

## GA4 지표 매핑

측정 목표를 GA4 이벤트/차원에 매핑한다.

| 목표 | GA4 |
|------|-----|
| 접속수 | `page_view` 이벤트 |
| 유입 경로 | `session_source` / `session_medium`, referrer |
| 페이지별 체류시간 | `user_engagement` 이벤트의 `engagement_time_msec` |

체류시간은 GA4 에서 페이지 단위로 자동 집계되지 않으므로, `page_view` 가 페이지 전환마다 정확히 발생해야 `user_engagement` 도 페이지에 올바르게 귀속된다. 즉 아래 함정을 해결하지 않으면 **체류시간 지표까지 함께 망가진다.**

---

## ★ App Router 함정 (page_view 최초 진입만 집계)

### 증상

배포 후 GA4 실시간 보고서에서 사용자가 사이트를 돌아다니는데도 페이지뷰가 **처음 들어온 한 페이지만** 잡힌다. 내부 링크로 이동한 `/lotto`, `/lotto/round/1184`, `/lotto/stat/*` 등은 세션 수는 있는데 페이지뷰·체류시간이 비어 있다. 네이버 애널리틱스도 똑같이 최초 진입만 기록한다.

### 원인

Next.js App Router 는 **클라이언트 사이드 라우팅**이다. 링크 이동 시 전체 문서를 새로 로드하지 않고 클라이언트에서 라우팅한다. 그런데 GA4 의 기본 `gtag` 스니펫(과 네이버 애널리틱스 스크립트)은 **스크립트가 로드되는 최초 문서 진입 때 딱 한 번** `page_view` 를 보낸다. 이후 클라이언트 라우팅에는 아무 이벤트도 발생하지 않는다. 전통적인 MPA 를 전제로 만들어진 스니펫이라서 그렇다.

### 해법

`usePathname()` 과 `useSearchParams()` 를 **구독**하는 클라이언트 컴포넌트를 두고, 경로가 바뀔 때마다 `page_view` 를 **수동 전송**한다. 네이버 애널리틱스도 같은 훅에서 함께 처리한다.

스크립트 자체는 `send_page_view: false` 로 자동 전송을 끄고, 수동 전송으로 일원화한다(그러지 않으면 최초 진입이 이중 집계된다).

**1) 스크립트 로드 — `next/script`, `strategy="afterInteractive"`**

```tsx
// app/analytics/AnalyticsScripts.tsx  (서버 컴포넌트에서 렌더 가능)
import Script from "next/script";

const GA_ID = process.env.NEXT_PUBLIC_GA_ID;
const NAVER_ID = process.env.NEXT_PUBLIC_NAVER_ANALYTICS_ID;

export function AnalyticsScripts() {
  return (
    <>
      {GA_ID && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
            strategy="afterInteractive"
          />
          <Script id="ga-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              // 자동 page_view 끄기 — 라우팅마다 수동 전송으로 일원화
              gtag('config', '${GA_ID}', { send_page_view: false });
            `}
          </Script>
        </>
      )}
      {NAVER_ID && (
        <Script
          src="//wcs.naver.net/wcslog.js"
          strategy="afterInteractive"
        />
      )}
    </>
  );
}
```

`strategy="afterInteractive"` 를 쓴다. **`beforeInteractive` 는 LCP 를 해친다** — 측정 스크립트는 화면 표시를 막을 이유가 없다.

**2) 경로 변경 구독 — 수동 전송 클라이언트 컴포넌트**

```tsx
// app/analytics/PageViewTracker.tsx
"use client";
import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const GA_ID = process.env.NEXT_PUBLIC_GA_ID;
const NAVER_ID = process.env.NEXT_PUBLIC_NAVER_ANALYTICS_ID;

export function PageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const query = searchParams.toString();
    const url = pathname + (query ? `?${query}` : "");

    // GA4 — 경로 변경마다 수동 page_view
    if (GA_ID && typeof window.gtag === "function") {
      window.gtag("event", "page_view", {
        page_path: url,
        page_location: window.location.href,
        page_title: document.title,
      });
    }

    // 네이버 애널리틱스 — 라우팅마다 재호출해야 집계됨
    if (NAVER_ID && typeof window.wcs_do === "function") {
      window.wcs = window.wcs || {};
      window.wcs.inflow?.();
      const account: Record<string, string> = { type: "0", account: NAVER_ID };
      window.wcs.event = account; // 라이브러리 버전에 따라 API 차이 — 확인 필요
      window.wcs_do();
    }
  }, [pathname, searchParams]);

  return null;
}
```

**3) `<Suspense>` 로 감싸기 — 필수**

`useSearchParams()` 를 쓰는 컴포넌트는 렌더링 시 클라이언트 사이드로 밀려나므로(CSR bailout), 이를 **`<Suspense>` 경계로 감싸지 않으면 그 상위 라우트 전체가 클라이언트 렌더링으로 떨어지고 빌드가 실패하거나 정적 생성이 깨진다.** 이는 Next.js 의 알려진 제약이다.

```tsx
// app/layout.tsx
import { Suspense } from "react";
import { AnalyticsScripts } from "./analytics/AnalyticsScripts";
import { PageViewTracker } from "./analytics/PageViewTracker";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <AnalyticsScripts />
        <Suspense fallback={null}>
          <PageViewTracker />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
```

> `Suspense` 로 감싸는 것은 Next.js 공식 문서가 요구하는 사항이다. 다만 위 **네이버 애널리틱스의 SPA 재호출 API(`wcs`/`wcs_do` 재호출 형태)는 라이브러리 버전에 따라 인터페이스가 달라 실제 콘솔에서 이벤트 도달을 확인해야 한다.** GA4 부분은 표준적이고 안정적이지만, 네이버 부분은 실측 검증 전까지 신뢰 수준을 낮춰 본다.

---

## 검증 방법

- **GA4**: 실시간 보고서를 열고 내부 링크로 3~4개 페이지를 이동하며 페이지뷰가 이동마다 증가하는지 확인. 최초 진입만 잡히면 함정 미해결.
- **네이버 애널리틱스**: 사이트 등록 후 로그 수집까지 지연이 있으므로, 브라우저 네트워크 탭에서 `wcslog.js` 호출이 라우팅마다 발생하는지 먼저 확인.
- 측정 ID 미주입(`NEXT_PUBLIC_GA_ID` 공란) 시 스크립트가 렌더링되지 않아야 한다 — 위 코드의 `GA_ID &&` 가드가 그것을 보장한다.

측정 ID·소유확인 값을 발급받는 절차와 사람이 해야 하는 단계는 [[search-console-registration]] 에 있다.

## 관련 페이지

- [[metadata-strategy]] — 렌더링 전략, 스크립트 로드 전략과 함께 보는 LCP 고려
- [[search-console-registration]] — GA4/네이버 측정 ID 발급, 소유확인
- [[adsense-readiness]] — 애드센스도 `next/script`·CLS 원칙 공유
- [[env-vars]] — `NEXT_PUBLIC_GA_ID` / `NEXT_PUBLIC_NAVER_ANALYTICS_ID`
