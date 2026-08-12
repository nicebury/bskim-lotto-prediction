'use client'

/**
 * 격자의 상태 전환기 — 마킹 ↔ 히트맵.
 *
 * ── 왜 IntersectionObserver 인가 (CSS scroll-driven animations 이 아니라) ──
 * 1. 전역 규약이 `prefers-reduced-motion` 에서 `animation-duration: 0ms !important` 를
 *    강제한다(src/styles/base.css). scroll-driven 방식은 이때 **진행률 매핑까지 죽어**
 *    "스크롤해도 히트맵이 나오지 않는" 정보 소실이 된다. IO + transition 은 같은 규칙
 *    아래에서 즉시 최종 상태로 스냅하므로 정보가 남는다.
 * 2. 필요한 것이 연속 스크럽이 아니라 **이산 상태 전환**이다.
 *
 * ── children 슬롯을 쓰는 이유 ──
 * 서버 컴포넌트는 클라이언트 컴포넌트에 함수(render prop)를 넘길 수 없다. 대신 서버가
 * 렌더한 엘리먼트를 `children` 으로 받으면 RSC 페이로드로 직렬화되어 그대로 전달된다.
 * 그래서 격자·통계 패널은 서버 컴포넌트인 채로 이 안에 들어온다.
 *
 * 관찰 대상은 children 안에 있어 ref 를 붙일 수 없으므로, 서버 마크업이 심어 둔
 * `[data-hb-sentinel]` 을 DOM 에서 찾아 관찰한다.
 */

import { useEffect, useRef, useState } from 'react'

type Phase = 'mark' | 'heat'

export function HbPhaseScope({ children }: { children: React.ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<Phase>('mark')

  useEffect(() => {
    const sentinel = rootRef.current?.querySelector('[data-hb-sentinel]')
    if (!sentinel) return

    const io = new IntersectionObserver(
      ([entry]) => setPhase(entry.isIntersecting ? 'heat' : 'mark'),
      /*
        위아래를 45% 씩 깎아 뷰포트 한가운데 10% 밴드만 남긴다. 통계 섹션이 화면
        중앙에 들어올 때 전환되므로, 사용자가 격자를 보고 있는 동안 바뀐다.
        (섹션 상단이 화면에 살짝 걸치자마자 바뀌면 무슨 일이 일어났는지 못 본다.)
      */
      { rootMargin: '-45% 0px -45% 0px', threshold: 0 },
    )
    io.observe(sentinel)
    return () => io.disconnect()
  }, [])

  return (
    <div ref={rootRef} className="hb-stage" data-phase={phase}>
      {children}
    </div>
  )
}
