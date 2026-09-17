import { AdSenseLoader } from '@/components/analytics/AdSenseLoader'
import { Footer } from '@/components/Footer'
import { MobileTabBar } from '@/components/MobileTabBar'
import { Header } from '@/components/Header'
import { JsonLd, organizationLd, webSiteLd } from '@/components/JsonLd'
import { SITE_NAME, SITE_URL } from '@/lib/env'

/**
 * 공개 화면의 셸 — 헤더·본문·푸터.
 *
 * ── ⚠ 왜 루트가 아니라 여기인가 ─────────────────────────────────────
 * 운영자 화면(`app/admin/**`)에는 이 셸이 **붙으면 안 된다.** 계약이 "면책·가이드 문구를
 * 넣지 않는다 — 공개 화면이 아니다" 라고 정했는데, 헤더·푸터를 루트 레이아웃에 두면
 * 푸터의 면책 문구가 운영자 화면까지 따라온다(실측으로 확인하고 옮겼다, 2026-08-28).
 *
 * 라우트 그룹 `(site)` 는 **URL 에 나타나지 않는다.** `/(site)/lotto` 가 아니라 `/lotto`
 * 그대로다 — 주소를 하나도 바꾸지 않고 셸만 갈랐다.
 *
 * ⚠ 새 공개 페이지는 반드시 `(site)/` 안에 만든다. 밖에 두면 헤더·푸터 없이 뜬다.
 * ⚠ `robots.ts` · `sitemap.ts` · `icon.svg` 는 **루트에 남는다.** 그 파일들은 URL 규약이
 *   고정돼 있어 그룹 안으로 들어가면 경로가 깨진다.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* 키보드 사용자가 내비게이션을 건너뛰고 본문으로 갈 수 있게 한다. */}
      <a className="skip-link" href="#main">
        본문 바로가기
      </a>

      <Header siteName={SITE_NAME} />

      {/* 페이지 최상위 콘텐츠는 <main> 하나다. */}
      <main id="main">{children}</main>

      <Footer siteName={SITE_NAME} />

      {/*
        ⚠ 공개 화면에만 둔다. 운영자 화면(`admin/**`)은 이 셸 밖이므로 자동으로 빠진다.
        ⚠ 푸터 **뒤**에 둔다. 고정 배치라 자리는 무관하지만, 읽는 순서(탭·스크린리더)에서
          본문과 푸터를 다 지난 뒤에 오는 것이 맞다 — 바로가기는 보조 수단이다.
      */}
      <MobileTabBar />

      {/*
        ⚠ 애드센스 로더는 **공개 화면에만** 둔다. 루트 레이아웃에 두면 운영자 화면에도
          들어가고, **자동 광고는 로더 하나만 있으면 페이지 어디든 광고를 붙인다** —
          수동 슬롯을 안 둔 것만으로는 막히지 않는다(계약: 운영자 화면에 광고 금지).
      */}
      <AdSenseLoader />

      {/* 사이트 단위 구조화 데이터. 공개 화면에서만 한 번 렌더링한다. */}
      <JsonLd data={[organizationLd(SITE_NAME, SITE_URL), webSiteLd(SITE_NAME, SITE_URL)]} />
    </>
  )
}
