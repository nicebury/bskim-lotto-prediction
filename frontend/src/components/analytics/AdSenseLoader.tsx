'use client'

import Script from 'next/script'
import { usePathname } from 'next/navigation'

import { isAdFreePath } from '@/lib/ad-slots'
import { ADSENSE_CLIENT } from '@/lib/env'

/**
 * 애드센스 로더.
 *
 * ── ⚠ 로더를 어디에 두는가가 곧 광고 정책이다 ──────────────────────
 * **자동 광고는 이 스크립트 하나만 있으면 페이지 어디든 광고를 붙인다.** 수동 슬롯
 * (`AdSlot`)을 두지 않은 것만으로는 막히지 않는다. 그래서 "이 화면에 광고를 넣지 않는다"
 * 는 규칙은 전부 **로더를 렌더링하지 않는 것**으로 지켜야 한다.
 *
 *   ① **운영자 화면**(`/admin`) — 계약이 광고를 금지한다. 셸이 달라(`app/(site)` 밖)
 *      자동으로 빠지지만, `isAdFreePath` 에도 넣어 두 겹으로 막는다.
 *   ② **정책 페이지·얇은 페이지** — `/terms` `/privacy` `/disclaimer` `/contact` `/guide`.
 *      근거는 lib/ad-slots.ts 에 적혀 있다.
 *
 * ⚠ **`AnalyticsScripts` 에서 떼어 냈다**(2026-09-01). 그것은 루트 레이아웃에 있어
 *   운영자 화면에도 들어갔다. 애널리틱스는 그래도 되지만 광고는 아니다.
 *
 * ⚠ **경로를 보려고 클라이언트 컴포넌트가 됐다**(2026-09-01). 레이아웃은 서버에서
 *   `pathname` 을 알 수 없다(Next.js 15). `afterInteractive` 스크립트는 어차피 브라우저에서
 *   주입되므로 손해가 없고, 애드센스 크롤러는 광고를 게재하기 위해 JS 를 실행하므로
 *   심사에도 지장이 없다.
 *
 * ⚠ **완전한 차단은 아니다.** 클라이언트 라우팅으로 다른 페이지에서 넘어오면 로더는 이미
 *   로드된 뒤이고, 이 컴포넌트가 언마운트돼도 이미 실행된 스크립트는 사라지지 않는다.
 *   막히는 것은 **직접 진입**(검색·외부 링크·크롤러)이다. 애드센스 크롤러는 URL 을 직접
 *   방문하므로 심사 관점에서는 이쪽이 중요하다. 확실히 하려면 **대시보드에서도 같은 URL 을
 *   제외**한다 — 코드와 대시보드 양쪽에 두는 것이 맞다.
 *
 * ⚠ 승인 전에는 `NEXT_PUBLIC_ADSENSE_CLIENT` 가 비어 아무것도 렌더링하지 않는다
 *   (→ docs/wiki/30-seo/adsense-readiness.md 5.1).
 * ⚠ `afterInteractive` 다. `beforeInteractive` 는 LCP 를 해친다.
 */
export function AdSenseLoader() {
  const pathname = usePathname()

  if (!ADSENSE_CLIENT) return null
  if (isAdFreePath(pathname)) return null

  return (
    <Script
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
      strategy="afterInteractive"
      crossOrigin="anonymous"
    />
  )
}
