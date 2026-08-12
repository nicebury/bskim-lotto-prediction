/**
 * 리퀴드 글래스 헤더와 모바일 하단 독.
 *
 * **둘 다 서버 컴포넌트다.** 링크뿐이라 상태가 없고, 유리 질감은 `backdrop-filter` 가
 * 만든다 — JS 를 한 줄도 쓰지 않는다. 헤더가 스크롤에 따라 모양을 바꾸지 않는 것은
 * 의도다. 이 화면에서 움직이는 것은 격자 하나뿐이어야 한다.
 *
 * ⚠ 이 라우트는 전역 헤더를 감춘다(→ _styles/shell.css). 그래서 전역 내비게이션
 *   전체와 **"기존 화면으로" 링크를 반드시 여기에 둔다.** 두 시안을 오가며 비교하는 것이
 *   이 페이지의 목적이기도 하다.
 *
 * 테마 토글은 두지 않는다 — 이 시안은 다크 고정이고, 끌 수 없는 토글은 고장으로 읽힌다.
 * 회차 검색은 헤더에서 뺐다. 좁은 글래스 바에 입력 필드를 넣으면 유리 질감 위에서 대비가
 * 무너지고, 검색은 `/lotto` 에서 바로 할 수 있다.
 */
import Link from 'next/link'

import { SITE_NAME } from '@/lib/env'
import { NAV_ITEMS } from '@/lib/site'

export function HbHeader() {
  return (
    <header className="hb-header">
      <div className="hb-header-inner">
        <Link className="hb-brand" href="/v2">
          <span className="hb-brand-mark" aria-hidden="true">
            6/45
          </span>
          {SITE_NAME}
          {/* 이 화면이 시안이라는 사실을 숨기지 않는다. */}
          <span className="hb-brand-tag">시안</span>
        </Link>

        <nav className="hb-nav" aria-label="주요 메뉴">
          {NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>

        <Link className="hb-back" href="/">
          기존 화면으로
        </Link>
      </div>
    </header>
  )
}

/* ────────────────────────────────────────────────────────────
 * 하단 독 아이콘 — 17px 에서 읽히도록 획을 굵고 단순하게 그렸다.
 * 기존 `components/icons.tsx` 의 24px 글리프는 이 크기에서 뭉갠다.
 * 모두 `currentColor` 를 쓰므로 색은 독이 정한다.
 * ──────────────────────────────────────────────────────────── */

const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

const DOCK_ITEMS = [
  {
    href: '/lotto',
    label: '로또',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="8.2" {...STROKE} />
        <path d="M8.6 12.2h6.8" {...STROKE} />
      </svg>
    ),
  },
  {
    href: '/lotto/stat',
    label: '통계',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M5 19V11M12 19V5.5M19 19v-5.5" {...STROKE} />
      </svg>
    ),
  },
  {
    href: '/lotto/recommend',
    label: '번호추천',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 4.6l2.1 4.6 4.9.6-3.6 3.4.9 4.9-4.3-2.4-4.3 2.4.9-4.9L5 9.8l4.9-.6z" {...STROKE} />
      </svg>
    ),
  },
  {
    href: '/dream',
    label: '꿈해몽',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M19 13.4A7.2 7.2 0 019.9 5a7.6 7.6 0 102 15 7.3 7.3 0 007.1-6.6z" {...STROKE} />
      </svg>
    ),
  },
  {
    href: '/news',
    label: '뉴스',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <rect x="4" y="5.5" width="16" height="13" rx="2.2" {...STROKE} />
        <path d="M7.5 9.5h6M7.5 13h9M7.5 15.8h5" {...STROKE} />
      </svg>
    ),
  },
] as const

export function HbDock() {
  return (
    // 헤더 내비와 같은 목적지를 가리키므로 랜드마크 이름을 구분해 준다.
    <nav className="hb-dock" aria-label="바로가기">
      {DOCK_ITEMS.map((item) => (
        <Link key={item.href} href={item.href}>
          {item.icon}
          {item.label}
        </Link>
      ))}
    </nav>
  )
}
