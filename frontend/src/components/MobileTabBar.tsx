'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * 모바일 하단 바로가기 바.
 *
 * ── 왜 있는가 ──────────────────────────────────────────────────────
 * 모바일에서 다른 화면으로 가려면 위로 스크롤해 햄버거를 열어야 했다. 자주 오가는 네 곳은
 * **엄지 닿는 자리**에 두는 편이 낫다(2026-08-31 사용자 요청).
 *
 * ⚠ **다섯 개까지만 둔다.** 여기 다 넣으면 햄버거와 같아지고, 좁은 화면에서 라벨이 뭉개진다.
 *   전체 메뉴는 여전히 헤더 햄버거에 있다.
 *
 *   ⚠ 2026-09-08 에 넷에서 **다섯**이 되었다(번호놀이터). 375px 에서 항목당 75px 이라
 *     44×44 터치 타깃에 여전히 여유가 있고, 놀이터는 홈 타일·헤더에만 두면 모바일에서
 *     들어가는 길이 사실상 햄버거뿐이 된다 — 하단 바가 가장 자주 쓰이는 길이다.
 *     **여섯 번째는 넣지 않는다.** 375px 에서 62px 이 되어 라벨 세 글자가 깨진다.
 *
 * ⚠ **데스크톱에서는 그리지 않는다**(CSS `display: none`). 위에 내비가 이미 있고, 하단
 *   고정 바는 넓은 화면에서 화면만 먹는다.
 *
 * ── ⚠ 지켜야 할 것 ─────────────────────────────────────────────────
 * - **현재 위치를 `aria-current="page"` 로 알린다.** 색만으로 표시하면 화면을 보지 않는
 *   사용자에게 아무 정보도 아니다.
 * - **본문 아래에 여백을 만든다.** 고정 바가 마지막 내용을 가리면 그것을 영영 못 본다
 *   (`body { padding-bottom }` — CSS).
 * - **iOS 홈 인디케이터를 피한다.** `env(safe-area-inset-bottom)` 를 더하지 않으면 바가
 *   그 아래 깔려 눌리지 않는다.
 * - 아이콘만 두지 않는다. **글자를 함께** 둔다 — 아이콘만으로 뜻이 전해지는 경우는 드물다.
 */

/**
 * 네 자리.
 *
 * ⚠ `href` 가 `NAV_ITEMS` 의 것과 **같아야 한다.** 다르면 같은 화면이 메뉴에 따라 다른
 *   주소로 열려 색인이 갈라진다. 다만 라벨은 짧게 줄인다 — 하단 바는 폭이 좁다.
 */
const TABS = [
  { href: '/', label: '홈', icon: HomeIcon },
  { href: '/lotto/stat', label: '통계', icon: ChartIcon },
  { href: '/lotto/recommend', label: '분석추천', icon: SparkIcon },
  // 헤더 NAV_ITEMS 와 같은 순서 — 꿈해몽이 분석추천 바로 뒤(2026-09-17).
  { href: '/dream', label: '꿈해몽', icon: MoonIcon },
  { href: '/playground', label: '놀이터', icon: PlayIcon },
] as const

export function MobileTabBar() {
  const pathname = usePathname()

  /**
   * 현재 탭 판정.
   *
   * ⚠ 홈(`/`)은 **정확히 일치**할 때만이다. `startsWith` 로 보면 모든 주소가 홈으로
   *   잡힌다. 나머지는 하위 경로(`/lotto/stat/pattern`)도 그 탭으로 본다.
   * ⚠ 운영자 화면(`/admin`)에서는 어느 탭도 켜지지 않는다 — 그 편이 정직하다.
   */
  const isCurrent = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`)

  return (
    <nav className="tabbar" aria-label="바로가기">
      {TABS.map(({ href, label, icon: Icon }) => {
        const current = isCurrent(href)
        return (
          <Link
            key={href}
            href={href}
            className="tabbar-item"
            data-active={current ? '' : undefined}
            aria-current={current ? 'page' : undefined}
          >
            <Icon />
            <span>{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

/* ────────────────────────────────────────────────────────────
 * 아이콘 — 24 격자, stroke, currentColor.
 *
 * ⚠ `components/icons.tsx` 의 규격(`STROKE_BASE`)과 같은 굵기를 쓴다. 여기 따로 두는
 *   것은 하단 바 전용 모양(집·달)이라서다. 트로피·달력은 쓰지 않는다(components.md).
 * ──────────────────────────────────────────────────────────── */

const BASE = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

function HomeIcon() {
  return (
    <svg {...BASE}>
      <path d="M3 10.5L12 3l9 7.5" />
      <path d="M5.5 9.5V20h13V9.5" />
      <path d="M9.5 20v-5.5h5V20" />
    </svg>
  )
}

function ChartIcon() {
  return (
    <svg {...BASE}>
      <path d="M4 20h16" />
      <rect x="5.5" y="11" width="3.5" height="6" rx="1" />
      <rect x="10.5" y="6.5" width="3.5" height="10.5" rx="1" />
      <rect x="15.5" y="9" width="3.5" height="8" rx="1" />
    </svg>
  )
}

/** 정밀 분석 추천. 반짝임 — 계산이 아니라 '골라 준다' 는 느낌을 준다. */
function SparkIcon() {
  return (
    <svg {...BASE}>
      <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" />
      <path d="M18 15.5l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8z" />
    </svg>
  )
}

/**
 * 번호놀이터 — 게임패드.
 * ⚠ `icons.tsx` 의 `PlayIcon`(fill 실루엣)과 **다른 그림이다.** 이 파일의 아이콘은 전부
 *   stroke 규격이라(위 `BASE`) 같은 모양을 선으로 다시 그렸다. 타일과 하단 바는 서로 다른
 *   맥락이고, 각자의 줄 안에서 일관되는 것이 우선이다.
 */
function PlayIcon() {
  return (
    <svg {...BASE}>
      <rect x="2.5" y="7.5" width="19" height="10" rx="4.5" />
      <path d="M7 11v3" />
      <path d="M5.5 12.5h3" />
      <path d="M15.5 11.5h.01" />
      <path d="M18 13.5h.01" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg {...BASE}>
      <path d="M20 13.5A8 8 0 1 1 10.5 4a6.5 6.5 0 0 0 9.5 9.5z" />
    </svg>
  )
}
