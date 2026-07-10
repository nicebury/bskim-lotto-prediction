'use client'

import { useCallback, useEffect } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'

/**
 * 모달 공통 동작 — Esc 닫기 · 포커스 가두기 · 포커스 복원 · 배경 스크롤 잠금.
 *
 * 헤더의 드로어·검색 오버레이와 본문의 대화상자가 같은 규칙을 따라야 하므로 한 곳에 둔다.
 *
 * `Esc` 는 항상 닫는다. "닫기 버튼으로만 닫힌다" 는 요구가 있어도 Esc 는 남긴다 —
 * 키보드 사용자가 대화상자에 갇히면 안 된다. 막을 수 있는 것은 **배경 클릭**이지 Esc 가
 * 아니다(→ 호출부가 backdrop 에 onClick 을 걸지 말지 정한다).
 */
export function useModalBehavior(
  ref: React.RefObject<HTMLElement | null>,
  onClose: () => void,
) {
  const handleClose = useCallback(onClose, [onClose])

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const node = ref.current
    if (!node) return

    // 열리자마자 첫 포커스 가능한 요소로 이동한다. 스크린리더가 모달 안에 있음을 알린다.
    const focusables = () => Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE))
    focusables()[0]?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleClose()
        return
      }
      if (event.key !== 'Tab') return

      // 포커스 트랩: Tab 이 모달 밖으로 새어 나가지 않게 양 끝을 이어 붙인다.
      const items = focusables()
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    // 배경이 스크롤되면 모달 안에 있다는 감각이 깨진다.
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prevOverflow
      // 닫으면 포커스를 연 버튼으로 되돌린다. 안 그러면 포커스가 <body> 로 떨어진다.
      opener?.focus?.()
    }
  }, [ref, handleClose])
}
