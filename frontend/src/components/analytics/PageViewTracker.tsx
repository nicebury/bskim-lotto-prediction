'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect } from 'react'

import { GA_ID, NAVER_ANALYTICS_ID } from '@/lib/env'

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
    wcs?: { inflow?: (domain?: string) => void; event?: Record<string, string> }
    wcs_do?: () => void
  }
}

/**
 * ★ App Router page_view 함정의 해법.
 *
 * Next.js App Router 는 클라이언트 사이드 라우팅이다. 링크 이동 시 문서를 새로 로드하지
 * 않으므로 GA4 기본 스니펫(과 네이버 애널리틱스)은 **최초 진입 때 한 번만** page_view 를
 * 보낸다. 그러면 내부 링크로 이동한 페이지는 세션은 잡히는데 페이지뷰가 비고,
 * `user_engagement` 가 페이지에 귀속되지 않아 **페이지별 체류시간 지표까지 함께 망가진다.**
 *
 * 그래서 경로가 바뀔 때마다 여기서 수동 전송한다.
 * → docs/wiki/30-seo/analytics.md
 *
 * ⚠ `useSearchParams()` 를 쓰는 컴포넌트는 CSR bailout 대상이다. <Suspense> 경계로 감싸지
 *   않으면 상위 라우트 전체가 클라이언트 렌더링으로 떨어지고 정적 생성이 깨진다.
 *   레이아웃에서 반드시 <Suspense> 로 감싼다.
 *
 * ⚠ 네이버의 SPA 재호출 API 는 라이브러리 버전에 따라 인터페이스가 다르다. GA4 부분은
 *   표준적이고 안정적이지만, 네이버는 실제 콘솔에서 이벤트 도달을 확인해야 한다.
 */
export function PageViewTracker() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    const query = searchParams.toString()
    const url = pathname + (query ? `?${query}` : '')

    if (GA_ID && typeof window.gtag === 'function') {
      window.gtag('event', 'page_view', {
        page_path: url,
        page_location: window.location.href,
        page_title: document.title,
      })
    }

    if (NAVER_ANALYTICS_ID && typeof window.wcs_do === 'function') {
      window.wcs = window.wcs || {}
      window.wcs.inflow?.()
      window.wcs.event = { type: '0', account: NAVER_ANALYTICS_ID }
      window.wcs_do()
    }
  }, [pathname, searchParams])

  return null
}
