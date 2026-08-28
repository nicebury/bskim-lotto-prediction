import type { Metadata } from 'next'
import { Suspense } from 'react'

import './globals.css'

import { AnalyticsScripts } from '@/components/analytics/AnalyticsScripts'
import { PageViewTracker } from '@/components/analytics/PageViewTracker'
import { ThemeScript } from '@/components/ThemeScript'
import {
  GOOGLE_SITE_VERIFICATION,
  NAVER_SITE_VERIFICATION,
  SITE_NAME,
  SITE_URL,
} from '@/lib/env'
import { pretendard } from '@/lib/fonts'

/**
 * 루트 메타데이터.
 *
 * - `metadataBase` 를 두면 OG 이미지 등 상대경로가 자동으로 절대화된다.
 * - `title.template` 이 사이트명을 자동 접미한다. 개별 페이지는 순수 제목만 넘긴다.
 * - `title.default` 는 홈에 쓰이며 접미사가 붙지 않는다.
 *
 * ⚠ title·description 어디에도 예측·보장으로 읽히는 표현을 쓰지 않는다. "당첨번호"는
 *   과거 결과의 **사실**이므로 허용된다. → docs/wiki/40-domain/forbidden-expressions.md
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — 로또 6/45 당첨결과·번호 통계·번호 추천`,
    template: `%s | ${SITE_NAME}`,
  },
  description:
    '최신 로또 당첨결과, 번호 출현 통계, 복권 뉴스, 통계와 AI 기반 번호추천을 한 곳에서 확인하세요.',
  applicationName: SITE_NAME,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'ko_KR',
    siteName: SITE_NAME,
    url: SITE_URL,
    title: `${SITE_NAME} — 로또 6/45 당첨결과·번호 통계·번호 추천`,
    description:
      '최신 로또 당첨결과, 번호 출현 통계, 복권 뉴스, 통계와 AI 기반 번호추천을 한 곳에서 확인하세요.',
    /*
      공유 카드 이미지. metadataBase 기준으로 절대화된다.
      width/height 를 명시해야 카카오톡·트위터가 자리를 미리 잡는다(공유 카드의 CLS).
      각 페이지가 openGraph 를 덮어쓰더라도 images 는 이 기본값이 상속된다.
    */
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: `${SITE_NAME} — 로또 6/45 당첨결과와 번호 통계`,
      },
    ],
  },
  twitter: { card: 'summary_large_image' },
  // 값이 비어 있으면 키 자체를 넣지 않는다 — 빈 content 메타태그는 검증 실패를 부른다.
  verification: {
    ...(GOOGLE_SITE_VERIFICATION ? { google: GOOGLE_SITE_VERIFICATION } : {}),
    ...(NAVER_SITE_VERIFICATION ? { other: { 'naver-site-verification': NAVER_SITE_VERIFICATION } } : {}),
  },
  robots: { index: true, follow: true },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // pretendard.variable 이 --font-pretendard 를 주입한다. tokens.css 의 --font-sans 가 그것을 읽는다.
    <html lang="ko" className={pretendard.variable} suppressHydrationWarning>
      <head>
        {/* 첫 페인트 전에 data-theme 을 박아 다크모드 FOUC 를 막는다. */}
        <ThemeScript />
      </head>
      <body>
        <AnalyticsScripts />
        {/*
          useSearchParams() 를 쓰는 컴포넌트는 <Suspense> 로 감싸야 한다. 감싸지 않으면
          이 레이아웃 아래 모든 라우트가 클라이언트 렌더링으로 떨어져 정적 생성이 깨진다.
        */}
        <Suspense fallback={null}>
          <PageViewTracker />
        </Suspense>

        {/*
          ⚠ 헤더·푸터·구조화 데이터는 여기 없다. `(site)/layout.tsx` 로 옮겼다 —
            운영자 화면(`admin/**`)에 푸터의 면책 문구가 따라붙으면 안 되기 때문이다
            (계약: "면책·가이드 문구를 넣지 않는다"). 그쪽 주석에 경위를 적었다.
        */}
        {children}
      </body>
    </html>
  )
}
