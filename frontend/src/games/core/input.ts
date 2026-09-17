import type { GameAction, GameInput, InputState, StageSize } from './types'

/**
 * 입력 정규화 — **두 채널로 온다**.
 *
 * → docs/wiki/10-contracts/playground-game-contract.md "입력" 절
 *
 * 포인터와 키보드를 하나로 뭉개면 조준형(좌표 필요)과 타이밍형(누름만 필요)이 둘 다
 * 불편해진다. 그래서 `pointer`(좌표 포함)와 `action`(의미만) 두 갈래로 보낸다.
 *
 * ⚠ 좌표는 **논리 좌표로 변환되어** 도착한다. 게임이 `getBoundingClientRect` 를 부를 일이 없다.
 * ⚠ 게임 코드에 `devicePixelRatio` 가 등장하면 반려한다 — 여섯 세션이 각자 다루면 그중
 *   하나는 반드시 흐릿하게 나온다.
 */

/** 방향키·WASD → action. 대소문자와 한글 자판(KeyW 등 code 기반)을 함께 받는다. */
const KEY_ACTIONS: Record<string, GameAction> = {
  Space: 'primary',
  Enter: 'primary',
  NumpadEnter: 'primary',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  KeyA: 'left',
  KeyD: 'right',
  KeyW: 'up',
  KeyS: 'down',
}

export interface InputHost {
  readonly state: InputState
  /** 캔버스 밖 DOM 버튼이 부른다. 클릭도 `action primary` 로 들어간다. */
  pressAction(action: GameAction, phase: 'down' | 'up'): void
  destroy(): void
}

/**
 * @param canvas 이벤트를 받을 캔버스
 * @param stage  논리 좌표계 크기
 * @param emit   게임에 전달할 콜백. 게임이 `handle` 을 구현하지 않았으면 호스트가 버린다
 */
export function createInput(
  canvas: HTMLCanvasElement,
  stage: StageSize,
  emit: (input: GameInput) => void,
): InputHost {
  const held = new Set<GameAction>()
  const pointer = { active: false, x: 0, y: 0 }
  /** ⚠ **멀티터치는 첫 포인터만** 전달한다. 두 손가락 확대 시도 중 오발사를 막는다. */
  let primaryId: number | null = null

  /** CSS 픽셀 → 논리 좌표. 캔버스가 커지든 작아지든 게임은 같은 좌표를 본다. */
  function toStage(e: PointerEvent): { x: number; y: number } {
    const r = canvas.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return { x: 0, y: 0 }
    return {
      x: ((e.clientX - r.left) / r.width) * stage.width,
      y: ((e.clientY - r.top) / r.height) * stage.height,
    }
  }

  function setHeld(action: GameAction, downNow: boolean, source: 'pointer' | 'key') {
    const was = held.has(action)
    if (downNow === was) return
    if (downNow) held.add(action)
    else held.delete(action)
    emit({ kind: 'action', phase: downNow ? 'down' : 'up', action, source })
  }

  const onPointerDown = (e: PointerEvent) => {
    if (primaryId !== null) return
    primaryId = e.pointerId
    /*
      ⚠ `setPointerCapture` 를 down 에서 건다 → 컬링 드래그가 캔버스 밖으로 나가도 끊기지
        않는다. 실패해도(브라우저가 거절) 게임은 동작하므로 조용히 넘긴다.
    */
    try {
      canvas.setPointerCapture(e.pointerId)
    } catch {
      /* 무시 */
    }
    const p = toStage(e)
    pointer.active = true
    pointer.x = p.x
    pointer.y = p.y
    emit({ kind: 'pointer', phase: 'down', x: p.x, y: p.y, id: e.pointerId })
    setHeld('primary', true, 'pointer')
  }

  const onPointerMove = (e: PointerEvent) => {
    if (primaryId !== null && e.pointerId !== primaryId) return
    /*
      ⚠ **캔버스 드래그가 페이지를 스크롤하지 않게 막는다.** 리스너를 `{ passive: false }`
        로 등록해야 `preventDefault` 가 실효한다(iOS).
    */
    if (pointer.active) e.preventDefault()
    const p = toStage(e)
    pointer.x = p.x
    pointer.y = p.y
    emit({ kind: 'pointer', phase: 'move', x: p.x, y: p.y, id: e.pointerId })
  }

  /** ⚠ `pointercancel` 은 `up` 과 같게 취급한다. iOS 스와이프에서 자주 발생한다. */
  const endPointer = (e: PointerEvent, phase: 'up' | 'cancel') => {
    if (primaryId !== null && e.pointerId !== primaryId) return
    primaryId = null
    const p = toStage(e)
    pointer.active = false
    pointer.x = p.x
    pointer.y = p.y
    emit({ kind: 'pointer', phase, x: p.x, y: p.y, id: e.pointerId })
    setHeld('primary', false, 'pointer')
  }

  const onPointerUp = (e: PointerEvent) => endPointer(e, 'up')
  const onPointerCancel = (e: PointerEvent) => endPointer(e, 'cancel')

  const onKeyDown = (e: KeyboardEvent) => {
    const action = KEY_ACTIONS[e.code]
    if (action === undefined) return
    /** ⚠ 길게 누를 때 오는 반복 이벤트는 버린다. 발사가 연사가 되면 안 된다. */
    if (e.repeat) return
    /** ⚠ 스페이스·방향키는 페이지를 스크롤시킨다. 반드시 막는다. */
    e.preventDefault()
    setHeld(action, true, 'key')
  }

  const onKeyUp = (e: KeyboardEvent) => {
    const action = KEY_ACTIONS[e.code]
    if (action === undefined) return
    e.preventDefault()
    setHeld(action, false, 'key')
  }

  /*
    ⚠ 캔버스가 포커스를 잃으면 누르고 있던 것을 전부 놓은 것으로 본다. 안 그러면 집게가
      영영 한쪽으로 흐른다.
  */
  const onBlur = () => {
    for (const a of [...held]) setHeld(a, false, 'key')
    if (pointer.active) {
      pointer.active = false
      primaryId = null
    }
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove, { passive: false })
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', onPointerCancel)
  canvas.addEventListener('keydown', onKeyDown)
  canvas.addEventListener('keyup', onKeyUp)
  canvas.addEventListener('blur', onBlur)

  return {
    state: {
      down: (action) => held.has(action),
      pointer,
    },
    pressAction(action, phase) {
      setHeld(action, phase === 'down', 'pointer')
    },
    destroy() {
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerCancel)
      canvas.removeEventListener('keydown', onKeyDown)
      canvas.removeEventListener('keyup', onKeyUp)
      canvas.removeEventListener('blur', onBlur)
      held.clear()
    },
  }
}
