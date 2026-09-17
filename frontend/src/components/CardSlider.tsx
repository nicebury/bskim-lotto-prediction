'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * 카드 가로 슬라이더 — 손가락으로 밀어 넘긴다.
 *
 * ── ⚠ 종전 결정을 뒤집었다 ─────────────────────────────────────────
 * 002 R12 는 **"모바일에서는 가로 스크롤을 쓰지 않고 세로로 쌓는다"** 고 정했다. 근거는
 * "40대+ 사용자에게 옆으로 숨은 카드는 발견성이 낮다" 였다. 2026-08-31 에 사용자가
 * **카드 슬라이드 방식을 명시적으로 요청**해 뒤집는다.
 *
 * 발견성 문제는 그대로 남아 있으므로, 그 결정이 걱정했던 것을 신호로 막는다 —
 * **다음 카드가 반쯤 보이게** 폭을 잡고(잘린 것이 보이는 것이 가장 강한 신호다),
 * 좌우 화살표와 위치 점을 함께 둔다. `ScrollArea` 에서 쓴 규칙과 같다.
 *
 * ── ⚠ 스크롤 컨테이너가 아니라 목록이다 ────────────────────────────
 * 안에 링크·버튼이 있어 키보드로 이미 닿는다. 그래서 `ScrollArea` 처럼 컨테이너에
 * `tabIndex={0}` 을 주지 않는다 — 주면 포커스가 빈 상자에 한 번 더 멈춘다.
 *
 * ⚠ `scroll-snap-type: x mandatory` 는 CSS 에 있다. 여기서는 **몇 번째 카드인지**만 센다.
 */
export function CardSlider({
  label,
  compact = false,
  children,
}: {
  /** 이 슬라이더가 무엇의 목록인지. 화살표 `aria-label` 에 쓴다. */
  label: string
  /**
   * 카드를 한 단계 좁게 둔다.
   *
   * ⚠ **폭은 슬라이더마다 다를 수 있어야 한다.** `.slider-track > li` 하나로 묶어 두면
   *   영상만 줄이려 해도 추천 번호·가이드까지 함께 줄어든다. 그래서 기본 폭은 그대로
   *   두고, 좁혀야 하는 쪽만 이 선택지를 켠다.
   *
   * 영상 카드가 첫 사용처다(2026-09-02 사용자 요청). 16:9 썸네일이 붙어 있어 폭이 그대로
   * 높이가 되고, 다른 카드보다 눈에 띄게 컸다. 좁히면 한 화면에 더 들어와 **여섯 편을
   * 넘겨 보는 것**이 자연스러워진다.
   */
  compact?: boolean
  children: React.ReactNode
}) {
  const track = useRef<HTMLUListElement>(null)
  const [canLeft, setCanLeft] = useState(false)
  const [canRight, setCanRight] = useState(false)
  const [index, setIndex] = useState(0)
  const [count, setCount] = useState(0)

  /**
   * 양 끝 도달 여부와 현재 카드 번호를 다시 잰다.
   *
   * ⚠ 1px 여유는 소수점 스크롤 위치 때문이다 — 끝까지 밀어도 값이 딱 떨어지지 않아
   *   화살표가 남는 일이 있다.
   */
  const sync = useCallback(() => {
    const el = track.current
    if (!el) return
    setCanLeft(el.scrollLeft > 1)
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)

    const items = Array.from(el.children) as HTMLElement[]
    setCount(items.length)
    if (items.length === 0) return
    // 왼쪽 가장자리에 가장 가까운 카드를 '현재' 로 본다. snap 이 그 자리에 맞춰 준다.
    let nearest = 0
    let best = Infinity
    items.forEach((item, i) => {
      const d = Math.abs(item.offsetLeft - el.scrollLeft)
      if (d < best) {
        best = d
        nearest = i
      }
    })
    setIndex(nearest)
  }, [])

  useEffect(() => {
    const el = track.current
    if (!el) return
    sync()
    /*
      ⚠ 마운트 직후 한 번으로는 부족하다. 폰트가 늦게 붙거나 창 폭이 바뀌면 넘침 여부와
        카드 위치가 달라진다. 트랙과 첫 카드를 함께 본다.
    */
    const observer = new ResizeObserver(sync)
    observer.observe(el)
    if (el.firstElementChild) observer.observe(el.firstElementChild)
    return () => observer.disconnect()
  }, [sync])

  /** 카드 한 장 폭만큼 민다. snap 이 나머지를 맞춘다. */
  const nudge = (direction: 1 | -1) => {
    const el = track.current
    if (!el) return
    const first = el.firstElementChild as HTMLElement | null
    const step = first ? first.getBoundingClientRect().width + 16 : el.clientWidth * 0.8
    el.scrollBy({ left: step * direction, behavior: 'smooth' })
  }

  /** 점을 눌러 그 카드로 간다. 화살표를 여러 번 누르지 않아도 되게. */
  const goTo = (i: number) => {
    const el = track.current
    const item = el?.children[i] as HTMLElement | undefined
    if (!el || !item) return
    el.scrollTo({ left: item.offsetLeft, behavior: 'smooth' })
  }

  const overflowing = canLeft || canRight

  return (
    <div
      className="slider"
      data-compact={compact ? '' : undefined}
      data-more-left={canLeft ? '' : undefined}
      data-more-right={canRight ? '' : undefined}
    >
      {/*
        화살표. `ScrollArea` 와 같은 규격이라야 같은 기능으로 읽힌다.
        ⚠ 남은 쪽에만 그린다 — 끝에 닿았는데 남아 있으면 눌러도 아무 일이 없어 고장으로 읽힌다.
      */}
      {canLeft && (
        <button
          type="button"
          className="slider-nav is-prev"
          aria-label={`${label} 이전 카드 보기`}
          onClick={() => nudge(-1)}
        >
          <Chevron direction="left" />
        </button>
      )}
      {canRight && (
        <button
          type="button"
          className="slider-nav is-next"
          aria-label={`${label} 다음 카드 보기`}
          onClick={() => nudge(1)}
        >
          <Chevron direction="right" />
        </button>
      )}

      <ul className="slider-track" ref={track} onScroll={sync}>
        {children}
      </ul>

      {/*
        위치 점.
        ⚠ 장식이 아니라 **몇 장 중 몇 번째인지** 알리는 장치다. 그래서 눌러서 이동도 된다.
        ⚠ 넘치지 않으면(카드가 다 보이면) 그리지 않는다 — 점 하나만 뜬 슬라이더는 우습다.
      */}
      {overflowing && count > 1 && (
        <div className="slider-dots" role="tablist" aria-label={`${label} 위치`}>
          {Array.from({ length: count }, (_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`${i + 1}번째 카드로 이동`}
              className="slider-dot"
              data-active={i === index ? '' : undefined}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function Chevron({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={direction === 'left' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} />
    </svg>
  )
}
