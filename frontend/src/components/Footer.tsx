import Link from 'next/link'

import { GUIDES, NAV_ITEMS, POLICY_PAGES } from '@/lib/site'

/**
 * 푸터. 정책 페이지 4종으로 가는 링크가 여기 있다 — 애드센스 심사자가 가장 먼저 찾는
 * 곳이다(→ docs/wiki/30-seo/adsense-readiness.md).
 *
 * 링크 그룹은 데스크톱에서 다열, 모바일에서 세로 스택으로 접힌다.
 * 각 그룹의 제목은 <h2> 다 — 시각적으로 작지만 헤딩 계층을 비우지 않는다.
 */
export function Footer({ siteName }: { siteName: string }) {
  const year = new Date().getFullYear()

  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand">
            <Link className="logo" href="/">
              <span className="logo-mark" aria-hidden="true">
                행
              </span>
              {siteName}
            </Link>
            <p>
              로또 당첨결과, 번호 통계, 복권 뉴스, 재미용 번호 추천 정보를 제공하는 복권 데이터
              대시보드입니다.
            </p>
          </div>

          <nav className="footer-col" aria-labelledby="footer-service">
            <h2 id="footer-service">서비스</h2>
            <ul>
              {NAV_ITEMS.map((item) => (
                <li key={item.href}>
                  <Link href={item.href}>{item.label}</Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav className="footer-col" aria-labelledby="footer-guide">
            <h2 id="footer-guide">가이드</h2>
            <ul>
              {GUIDES.map((guide) => (
                <li key={guide.slug}>
                  <Link href={`/guide/${guide.slug}`}>{guide.title}</Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav className="footer-col" aria-labelledby="footer-policy">
            <h2 id="footer-policy">정보</h2>
            <ul>
              {POLICY_PAGES.map((page) => (
                <li key={page.href}>
                  <Link href={page.href}>{page.label}</Link>
                </li>
              ))}
              <li>
                <Link href="/sitemap.xml">사이트맵</Link>
              </li>
            </ul>
          </nav>
        </div>

        {/*
          면책 고지는 푸터에도 상시 노출한다. 사용자가 어느 페이지에 있든 이 서비스가
          복권을 판매하지 않고 당첨을 보장하지 않는다는 사실을 볼 수 있어야 한다.
        */}
        <div className="footer-bottom">
          <p className="footer-disclaimer">
            본 사이트는 복권 관련 정보와 통계를 제공하는 서비스이며, 추천번호는 참고용·재미용
            시뮬레이션입니다. 당첨을 보장하지 않으며, 실제 복권 구매 여부와 책임은 이용자 본인에게
            있습니다. 19세 미만은 복권을 구매할 수 없습니다.
          </p>
          <p style={{ marginTop: 'var(--space-3)' }}>
            © {year} {siteName}. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}
