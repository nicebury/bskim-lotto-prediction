'use client'

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'

/** 팝오버와 화면 가장자리 사이에 남길 여백(px). */
const EDGE_MARGIN = 12

/**
 * 통계 카드 옆의 도움말.
 *
 * `<details>` 가 아니라 버튼+영역으로 만든 이유는 **카드 제목 줄에 인라인으로** 놓기
 * 위해서다. `<details>` 는 블록 요소라 제목과 같은 줄에 두면 레이아웃이 흔들린다.
 *
 * 접힌 상태에서도 내용이 DOM 에 있다 — 검색엔진과 스크린리더가 읽을 수 있어야 하고,
 * 이 설명 자체가 페이지의 콘텐츠 가치다(→ docs/wiki/30-seo/adsense-readiness.md).
 * 그래서 `hidden` 대신 CSS 로 접는다.
 *
 * ⚠ 팝오버는 `.help-tip`(인라인 버튼)을 기준으로 `left: 0` 에 절대배치된다. 버튼이 제목
 *   줄 오른쪽에 있으면 폭 293px(=78vw @375) 짜리 팝오버가 그대로 **화면 밖으로 나간다** —
 *   375px 에서 최대 203px 잘렸다 — 빈도 화면의 팝오버는 절반 이상이 화면 밖이었다(2026-08-21 실측). 순수 CSS 로는 "버튼이
 *   오른쪽에 있는가" 를 알 수 없어(앵커 포지셔닝은 아직 못 쓴다) 열릴 때 재서 민다.
 *   `left` 가 아니라 `transform` 을 쓰는 이유는 리플로우 없이 움직이기 위해서다.
 */
export function HelpTip({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const bodyRef = useRef<HTMLSpanElement>(null)
  const id = useId()

  /**
   * 팝오버가 화면 밖으로 나가지 않도록 가로 이동량을 다시 계산한다.
   *
   * 먼저 이동량을 0 으로 되돌리고 재는 이유: 이전 계산이 남아 있으면 그만큼 이미 밀린
   * 위치를 재게 되어 값이 누적된다(화면을 넓혔다 좁히면 반대쪽으로 삐져나간다).
   * 오른쪽을 먼저 맞추고 왼쪽을 나중에 보정한다 — 팝오버가 화면보다 넓은 극단에서는
   * 왼쪽 끝을 살리는 편이 글을 읽기 시작할 수 있어 낫다.
   */
  const clamp = useCallback(() => {
    const el = bodyRef.current
    if (!el) return
    el.style.setProperty('--tip-shift', '0px')
    const rect = el.getBoundingClientRect()
    const limit = document.documentElement.clientWidth - EDGE_MARGIN
    let shift = 0
    if (rect.right > limit) shift = limit - rect.right
    if (rect.left + shift < EDGE_MARGIN) shift = EDGE_MARGIN - rect.left
    el.style.setProperty('--tip-shift', `${Math.round(shift)}px`)
  }, [])

  // 열리는 순간 위치를 잡는다. 페인트 전에 끝나야 팝오버가 잘못된 자리에서 한 번
  // 깜빡이지 않으므로 useEffect 가 아니라 useLayoutEffect 다.
  useLayoutEffect(() => {
    if (open) clamp()
  }, [open, clamp])

  // 열려 있는 동안에만 화면 크기 변화를 따라간다. 닫힌 팝오버는 clip-path 로 감춰져 있어
  // 위치가 틀려도 보이지 않고, 리스너를 상시로 걸면 화면당 9개가 동시에 붙는다.
  useEffect(() => {
    if (!open) return
    window.addEventListener('resize', clamp)
    return () => window.removeEventListener('resize', clamp)
  }, [open, clamp])

  return (
    <span className="help-tip">
      <button
        type="button"
        className="help-tip-btn"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span aria-hidden="true">?</span>
        <span className="sr-only">{title} 설명 {open ? '접기' : '펼치기'}</span>
      </button>
      <span className="help-tip-body" id={id} ref={bodyRef} data-open={open ? '' : undefined}>
        {children}
      </span>
    </span>
  )
}
