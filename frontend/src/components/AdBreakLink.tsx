import Link from 'next/link'

import { isAdFreePath } from '@/lib/ad-slots'
import { ADSENSE_CLIENT } from '@/lib/env'

/**
 * **전면 광고가 낄 수 있는 이동**에 쓰는 링크.
 *
 * ── 왜 필요한가 ────────────────────────────────────────────────────
 * 애드센스 **전면 광고(Vignette)** — 화면을 덮고 뜨며 닫기 버튼이 있는 그 광고 — 는
 * **브라우저가 실제로 문서를 새로 불러올 때**를 신호로 뜬다. 그런데 App Router 의 내부
 * 이동은 전부 클라이언트 라우팅이라 문서가 새로 로드되지 않는다. **링크를 눌러도 애드센스는
 * 페이지가 바뀐 것을 모르고, 전면 광고는 뜨지 않는다.**
 *
 * `frontend/CLAUDE.md` 에 적힌 GA4 함정과 **같은 구조**다. 다른 점은 GA4 에는 우리가 부를
 * 함수(`gtag('event','page_view')`)가 있지만, **자동 광고에는 그런 API 가 없다** —
 * 스크립트가 스스로 판단한다. 그래서 우회로는 하나뿐이다: 그 이동만 **평범한 `<a>`** 로
 * 두어 문서를 새로 불러오게 한다.
 *
 * ── ⚠ 공짜가 아니다 ────────────────────────────────────────────────
 * `<a>` 이동은 JS 번들과 CSS 를 다시 받는다(체감 0.3~1초). **사이트 전체에 쓰면 App Router
 * 를 쓰는 의미가 사라진다.** 그래서 이 컴포넌트는 **깊이 들어가는 이동 한두 곳에만** 쓴다 —
 * 사용자가 "다른 화면으로 넘어간다" 고 이미 인지하고 있어 잠깐의 로딩이 어색하지 않은 자리다.
 *
 * ── 광고가 꺼져 있으면 손해가 전혀 없다 ────────────────────────────
 * `NEXT_PUBLIC_ADSENSE_CLIENT` 가 비면 **그냥 `<Link>`** 다. 즉 승인 전인 지금은 동작이
 * 완전히 같고, 승인 후 환경변수를 채우는 순간 이 자리들만 하드 내비게이션으로 바뀐다.
 * **광고를 켜는 날 코드를 다시 손댈 필요가 없게** 하려고 미리 심어 둔다.
 *
 * ⚠ **서버 컴포넌트다.** `usePathname()` 을 쓰지 않는다 — 판단에 필요한 것은 '지금 어디인가'
 *   가 아니라 '어디로 가는가' 뿐이고, `ADSENSE_CLIENT` 는 빌드 시점 상수다. 클라이언트
 *   컴포넌트로 만들면 이 링크를 쓰는 화면이 통째로 클라이언트 경계를 넘는다(`StatNav` 가
 *   바로 그것을 피하려고 서버 컴포넌트로 남아 있다).
 *
 * ⚠ **광고를 붙이지 않는 경로로 가는 링크는 그대로 `<Link>`** 다. 거기서는 전면 광고가 뜰
 *   일이 없으니 느리게 만들 이유도 없다.
 */
export function AdBreakLink({
  href,
  children,
  className,
  ...rest
}: {
  href: string
  children: React.ReactNode
  className?: string
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  const hardNavigation = Boolean(ADSENSE_CLIENT) && !isAdFreePath(href)

  if (!hardNavigation) {
    return (
      <Link href={href} className={className} {...rest}>
        {children}
      </Link>
    )
  }

  /*
    ⚠ `<Link>` 가 아니므로 프리페치가 없다. 그것이 이 컴포넌트의 목적이다 — 프리페치된
      이동은 문서를 새로 불러오지 않는다.
  */
  return (
    <a href={href} className={className} {...rest}>
      {children}
    </a>
  )
}
