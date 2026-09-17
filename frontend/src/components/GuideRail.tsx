'use client'

import { useEffect, useState } from 'react'

/**
 * 가이드 상세의 **오른쪽 목차 레일**(1100px 이상에서만 보인다).
 *
 * ── 왜 필요한가 ────────────────────────────────────────────────────
 * 2026-09-17 사용자 지적: "텍스트 정렬이 왼쪽으로 치우쳐 있고 너무 정적 페이지 같다".
 * 본문을 읽기 좋은 폭(62ch)으로 묶어 두었더니 1280px 화면에서 **오른쪽 절반이 통째로
 * 비었다.** 글줄을 늘리면 읽기 어려워지므로, 빈 자리를 **길잡이**로 채웠다 — 지금 어느
 * 절을 읽는 중인지, 얼마나 읽었는지가 스크롤과 함께 움직인다.
 *
 * ── ⚠ 머리의 목차 칩과 같은 목록이다 ───────────────────────────────
 * 페이지의 `TOC` 상수 하나를 둘이 함께 쓴다. 좁은 화면에서는 칩이, 넓은 화면에서는 레일이
 * 보인다(`guide-doc.css`). 목록을 따로 두면 한쪽만 고쳐지는 날이 온다.
 *
 * ── ⚠ JS 가 없어도 링크는 동작한다 ─────────────────────────────────
 * 서버 렌더링된 `<a href="#id">` 라서 하이드레이션 전에도 누르면 해당 절로 간다.
 * JS 가 하는 일은 **현재 위치 표시와 진행 막대**뿐이다 — 장식이 망가져도 길은 남는다.
 */
export function GuideRail({ items }: { items: readonly { id: string; label: string }[] }) {
  const [active, setActive] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const sections = items
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => el !== null)
    if (sections.length === 0) return

    let frame = 0

    /*
     * ⚠ IntersectionObserver 가 아니라 스크롤 위치로 판정한다.
     *   절 길이가 제각각이라 "화면에 보이는 절" 이 동시에 둘셋이 되는데, 그중 무엇을 현재로
     *   칠지 규칙을 따로 만들어야 한다. **화면 위쪽 35% 선을 지난 마지막 절**이라는 한 줄
     *   규칙이 더 예측 가능하다 — 사람이 읽는 자리도 대개 그 높이다.
     * ⚠ rAF 로 한 프레임에 한 번만 계산한다. 스크롤 이벤트는 프레임보다 자주 온다.
     */
    const measure = () => {
      frame = 0
      const line = window.innerHeight * 0.35
      let current: string | null = null
      for (const el of sections) {
        if (el.getBoundingClientRect().top <= line) current = el.id
      }
      setActive(current)

      // 진행률은 첫 절의 시작부터 마지막 절의 끝까지로 잰다. 머리·FAQ 는 '읽기' 가 아니다.
      const first = sections[0].getBoundingClientRect().top + window.scrollY
      const lastEl = sections[sections.length - 1]
      const last = lastEl.getBoundingClientRect().bottom + window.scrollY
      const span = Math.max(1, last - first - window.innerHeight * 0.5)
      const ratio = (window.scrollY + line - first) / span
      setProgress(Math.min(1, Math.max(0, ratio)))
    }

    const onScroll = () => {
      if (frame === 0) frame = requestAnimationFrame(measure)
    }

    measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [items])

  return (
    <aside className="gd-rail" aria-label="이 글의 순서">
      <p className="gd-rail-title">이 글의 순서</p>

      {/*
        읽은 비율. 순수 시각 보조라 접근성 트리에서 뺀다 — 낭독기 사용자에게는 목록의
        `aria-current` 가 현재 위치를 알린다. 스크롤마다 수치를 읽어 주면 소음이다.
      */}
      <div className="gd-rail-progress" aria-hidden="true">
        <span style={{ transform: `scaleX(${progress})` }} />
      </div>

      <ol className="gd-rail-list">
        {items.map((item, index) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              data-active={active === item.id ? '' : undefined}
              aria-current={active === item.id ? 'location' : undefined}
            >
              <span className="gd-rail-num" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              {item.label}
            </a>
          </li>
        ))}
      </ol>

      <a className="gd-rail-top" href="#">
        맨 위로
      </a>
    </aside>
  )
}
