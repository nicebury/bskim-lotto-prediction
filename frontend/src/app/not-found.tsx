import Link from 'next/link'

import type { Metadata } from 'next'

import { Footer } from '@/components/Footer'
import { Header } from '@/components/Header'
import { SITE_NAME } from '@/lib/env'

export const metadata: Metadata = {
  title: '페이지를 찾을 수 없습니다',
  description: '요청하신 페이지가 존재하지 않거나 이동되었습니다.',
  // 404 는 색인 대상이 아니다.
  robots: { index: false, follow: true },
}

/**
 * 404. 존재하지 않는 회차 번호(`/lotto/round/99999`)로 들어오는 경우가 가장 흔하다.
 * 막다른 길로 두지 않고 주요 진입점으로 돌려보낸다.
 *
 * ⚠ **헤더·푸터를 여기서 직접 그린다.** 이 파일은 루트에 있어 공개 셸
 *   (`(site)/layout.tsx`)의 바깥이다 — 어느 그룹에도 매칭되지 않는 주소로 들어오면
 *   루트 레이아웃만 적용되기 때문이다. 셸을 그룹으로 내린 대가이고(2026-08-28),
 *   그 대신 운영자 화면에 면책 문구가 따라붙지 않는다.
 * ⚠ 여기 크롬을 바꾸면 `(site)/layout.tsx` 도 함께 봐야 한다. 두 곳이 갈라지면 404 만
 *   다른 머리를 달게 된다.
 */
export default function NotFound() {
  return (
    <>
      <a className="skip-link" href="#main">
        본문 바로가기
      </a>
      <Header siteName={SITE_NAME} />
      <main id="main">
        <NotFoundBody />
      </main>
      <Footer siteName={SITE_NAME} />
    </>
  )
}

function NotFoundBody() {
  return (
    <div className="container section">
      <h1>페이지를 찾을 수 없습니다</h1>
      <div className="prose" style={{ marginTop: 'var(--space-4)' }}>
        <p>
          요청하신 페이지가 존재하지 않거나 주소가 변경되었습니다. 회차 번호를 입력하셨다면 아직
          추첨되지 않은 회차일 수 있습니다.
        </p>
      </div>
      <div className="hero-cta">
        <Link className="btn btn-primary" href="/lotto/latest">
          최신 당첨결과 보기
        </Link>
        <Link className="btn btn-secondary" href="/">
          홈으로
        </Link>
      </div>
    </div>
  )
}
