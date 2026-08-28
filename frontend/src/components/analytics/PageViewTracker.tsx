'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect } from 'react'

import { GA_ID, NAVER_ANALYTICS_ID } from '@/lib/env'

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
    wcs?: { inflow?: (domain?: string) => void }
    /** 네이버 wcslog.js 가 읽어 가는 전역 설정 객체. `wa` 가 계정 ID 다. */
    wcs_add?: Record<string, string>
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
 * ⚠ 네이버는 **`wcs_add["wa"]` 에 계정 ID 를 넣은 뒤** `wcs_do()` 를 불러야 한다. 이게
 *   공식 스니펫의 형태이고, 빠지면 스크립트는 멀쩡히 로드되는데 **집계가 한 건도 잡히지
 *   않는다**(어디에도 에러가 나지 않아 알아채기 어렵다). 종전 코드가 `wcs.event` 에
 *   account 를 넣고 있었는데 그건 전환 이벤트용 인터페이스라 페이지뷰에 쓰이지 않는다.
 * ⚠ 그래도 네이버는 GA4 만큼 표준적이지 않다 — 측정 ID 를 채운 뒤 **네이버 애널리틱스
 *   콘솔에서 실제 도달을 한 번 확인해야** 완료로 볼 수 있다.
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
      // 계정 ID 를 먼저 심는다. 이 줄이 없으면 wcs_do() 는 아무 데도 보내지 않는다.
      window.wcs_add = window.wcs_add || {}
      window.wcs_add.wa = NAVER_ANALYTICS_ID
      // 유입 경로(검색어·참조 페이지) 수집. 도메인을 주지 않으면 현재 호스트를 쓴다.
      window.wcs?.inflow?.()
      window.wcs_do()
    }
  }, [pathname, searchParams])

  return null
}
