import Link from 'next/link'

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '페이지를 찾을 수 없습니다',
  description: '요청하신 페이지가 존재하지 않거나 이동되었습니다.',
  // 404 는 색인 대상이 아니다.
  robots: { index: false, follow: true },
}

/**
 * 404. 존재하지 않는 회차 번호(`/lotto/round/99999`)로 들어오는 경우가 가장 흔하다.
 * 막다른 길로 두지 않고 주요 진입점으로 돌려보낸다.
 */
export default function NotFound() {
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
