'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useId, useRef, useState } from 'react'

import { NAV_ITEMS } from '@/lib/site'
import { LogoMark } from './LogoMark'
import { useModalBehavior } from './useModalBehavior'

/**
 * 헤더 — 로고 + 내비 + 검색 + 다크 토글.
 *
 * 데스크톱은 가로 nav, 모바일은 햄버거 드로어와 전체화면 검색 오버레이로 접힌다.
 * 드로어·오버레이는 열릴 때 포커스를 안으로 가두고, Esc 로 닫히며, 닫으면 포커스를
 * 연 버튼으로 되돌린다. → docs/wiki/20-design/accessibility.md
 *
 * ⚠ 검색은 **사이트 전체 검색이 아니라 회차 번호 이동**이다. 전체 검색 페이지(`/search`)는
 *   URL 구조(초안 5.1)에 없다. 동작하지 않는 검색창을 만들지 않으려는 선택이고, 그래서
 *   JSON-LD WebSite 에도 potentialAction 을 넣지 않는다(→ 30-seo/structured-data.md).
 */
export function Header({ siteName }: { siteName: string }) {
  const pathname = usePathname()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  // 라우팅으로 페이지가 바뀌면 열려 있던 오버레이를 닫는다.
  // 이걸 빼면 드로어에서 링크를 눌러도 드로어가 그대로 남는다.
  useEffect(() => {
    setDrawerOpen(false)
    setSearchOpen(false)
  }, [pathname])

  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link className="logo" href="/">
          <LogoMark />
          {siteName}
        </Link>

        <nav className="header-nav" aria-label="주요 메뉴">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isCurrent(pathname, item.href) ? 'page' : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="header-actions">
          <RoundSearchForm className="header-search" />

          <button
            type="button"
            className="icon-btn header-search-toggle"
            aria-label="검색 열기"
            aria-expanded={searchOpen}
            aria-controls="search-overlay"
            onClick={() => setSearchOpen(true)}
          >
            <SearchIcon />
          </button>

          <ThemeToggle />

          <button
            type="button"
            className="icon-btn header-menu-toggle"
            aria-label="메뉴 열기"
            aria-expanded={drawerOpen}
            aria-controls="mobile-drawer"
            onClick={() => setDrawerOpen(true)}
          >
            <MenuIcon />
          </button>
        </div>
      </div>

      {drawerOpen && <Drawer pathname={pathname} onClose={() => setDrawerOpen(false)} />}
      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} />}
    </header>
  )
}

/** `/lotto` 는 `/lotto/round/1184` 의 상위다. 정확 일치와 접두어 일치를 모두 본다. */
function isCurrent(pathname: string, href: string): boolean {
  if (pathname === href) return true
  // '/lotto' 가 '/lotto/stat' 의 현재 항목까지 차지하지 않도록, 더 구체적인 항목이 있으면 양보한다.
  if (!pathname.startsWith(`${href}/`)) return false
  return !NAV_ITEMS.some(
    (item) => item.href !== href && item.href.startsWith(`${href}/`) && isCurrent(pathname, item.href),
  )
}

/* ────────────────────────────────────────────────────────────
 * 드로어 (모바일 내비)
 * ──────────────────────────────────────────────────────────── */

function Drawer({ pathname, onClose }: { pathname: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useModalBehavior(ref, onClose)

  return (
    <>
      {/* 배경은 클릭으로 닫히지만, 키보드 사용자는 Esc 를 쓴다. 그래서 button 이 아니라 div 다. */}
      <div className="drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <div
        id="mobile-drawer"
        ref={ref}
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label="주요 메뉴"
      >
        <div className="drawer-head">
          <span className="logo">메뉴</span>
          <button type="button" className="icon-btn" aria-label="메뉴 닫기" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        <nav aria-label="모바일 메뉴">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isCurrent(pathname, item.href) ? 'page' : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </>
  )
}

/* ────────────────────────────────────────────────────────────
 * 검색 (회차 번호 이동)
 * ──────────────────────────────────────────────────────────── */

function SearchOverlay({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useModalBehavior(ref, onClose)

  return (
    <div
      id="search-overlay"
      ref={ref}
      className="search-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="회차 검색"
    >
      <div className="search-overlay-head">
        <RoundSearchForm autoFocus />
        <button type="button" className="icon-btn" aria-label="검색 닫기" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>
      <p className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
        회차 번호를 입력하면 해당 회차의 당첨번호 페이지로 이동합니다.
      </p>
    </div>
  )
}

function RoundSearchForm({
  className,
  autoFocus = false,
}: {
  className?: string
  autoFocus?: boolean
}) {
  const router = useRouter()
  const inputId = useId()
  const [value, setValue] = useState('')

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const roundNo = Number.parseInt(value.trim(), 10)
    // 음수·0·문자는 라우팅하지 않는다. 존재하지 않는 회차는 상세 페이지가 404 로 처리한다.
    if (!Number.isFinite(roundNo) || roundNo < 1) return
    router.push(`/lotto/round/${roundNo}`)
  }

  return (
    <form className={className} onSubmit={onSubmit} role="search">
      <label className="sr-only" htmlFor={inputId}>
        회차 번호 검색
      </label>
      <input
        id={inputId}
        className="input"
        type="search"
        inputMode="numeric"
        placeholder="회차 번호 (예: 1184)"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => setValue(e.target.value)}
      />
      <button type="submit" className="icon-btn" aria-label="회차 검색">
        <SearchIcon />
      </button>
    </form>
  )
}

/* ────────────────────────────────────────────────────────────
 * 테마 토글
 * ──────────────────────────────────────────────────────────── */

type Theme = 'light' | 'dark' | 'system'

function ThemeToggle() {
  // 서버는 사용자의 localStorage 를 모른다. 초기값을 'system' 으로 두고 mount 후에 채워야
  // 서버 HTML 과 클라이언트 첫 렌더가 일치한다(hydration mismatch 방지).
  const [theme, setTheme] = useState<Theme>('system')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    try {
      const saved = localStorage.getItem('theme')
      if (saved === 'dark' || saved === 'light') setTheme(saved)
    } catch {
      /* localStorage 접근 불가 — OS 설정을 따른다 */
    }
  }, [])

  const toggle = () => {
    // 'system' 상태에서 누르면 현재 보이는 것의 반대로 간다.
    const current =
      theme === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : theme
    const next: Theme = current === 'dark' ? 'light' : 'dark'

    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
    try {
      localStorage.setItem('theme', next)
    } catch {
      /* 저장 실패해도 이번 세션의 토글은 동작한다 */
    }
  }

  // mount 전에는 라벨을 확정할 수 없다. 중립 라벨을 쓴다.
  const label = !mounted
    ? '테마 전환'
    : theme === 'dark'
      ? '라이트 모드로 전환'
      : '다크 모드로 전환'

  return (
    <button type="button" className="icon-btn" aria-label={label} onClick={toggle}>
      <ThemeIcon />
    </button>
  )
}

/* ────────────────────────────────────────────────────────────
 * 아이콘 — 옆에 aria-label 이 있는 버튼 안이므로 접근성 트리에서 숨긴다.
 * ──────────────────────────────────────────────────────────── */

const ICON_PROPS = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

function SearchIcon() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  )
}

function MenuIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

function ThemeIcon() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  )
}
