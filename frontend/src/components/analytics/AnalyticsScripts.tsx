import Script from 'next/script'

import { GA_ID, NAVER_ANALYTICS_ID } from '@/lib/env'

/**
 * 측정·광고 스크립트 로드. 서버 컴포넌트에서 렌더 가능하다.
 *
 * ⚠ `strategy="afterInteractive"` 를 쓴다. `beforeInteractive` 는 LCP 를 해친다 —
 *   측정 스크립트가 화면 표시를 막을 이유가 없다.
 *
 * ⚠ GA4 는 `send_page_view: false` 로 자동 전송을 끈다. App Router 는 클라이언트
 *   라우팅이라 기본 스니펫이 **최초 진입 때 한 번만** page_view 를 보내고, 링크로 이동한
 *   페이지는 통째로 누락된다. 전송은 PageViewTracker 가 수동으로 일원화한다.
 *   자동 전송을 켜 둔 채 수동 전송을 더하면 최초 진입이 이중 집계된다.
 *   → docs/wiki/30-seo/analytics.md
 *
 * 측정 ID 가 비어 있으면 스크립트를 아예 렌더링하지 않는다.
 */
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
              gtag('config', '${GA_ID}', { send_page_view: false });
            `}
          </Script>
        </>
      )}

      {NAVER_ANALYTICS_ID && (
        <Script src="//wcs.naver.net/wcslog.js" strategy="afterInteractive" />
      )}

      {/*
        애드센스 로더도 승인 전에는 렌더링하지 않는다. ads.txt 역시 승인 후에 추가한다.
        → docs/wiki/30-seo/adsense-readiness.md
      */}
    </>
  )
}

/*
 * ⚠ 애드센스 로더는 이 파일에 없다. **경로에 따라 렌더링 여부가 달라져야 해서**
 *   `AdSenseLoader.tsx` 로 옮겼다(2026-09-01) — 정책 페이지와 얇은 페이지에는 로더를
 *   내보내지 않는다. 여기 두면 클라이언트 컴포넌트가 되어 GA 초기화까지 함께 끌려간다.
 */
