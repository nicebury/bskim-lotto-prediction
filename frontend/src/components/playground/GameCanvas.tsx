'use client'

import { useEffect, useRef, useState } from 'react'

import { GAME_LOADERS } from '@/games/core/loaders'
import { createDrawKit } from '@/games/core/draw'
import { createInput } from '@/games/core/input'
import { createLoop } from '@/games/core/loop'
import { createNumberPool } from '@/games/core/pool'
import { createRng, createSeed } from '@/games/core/rng'
import { readPalette, watchPalette } from '@/games/core/palette'
import type {
  GameAction,
  GameEvent,
  GameInstance,
  GameMeta,
  GamePhase,
  Palette,
  SfxName,
} from '@/games/core/types'

/**
 * 호스트가 캔버스 밖에서 게임을 건드리는 통로 (2026-09-08 추가).
 *
 * ⚠ **이것 하나뿐이다.** 게임 내부 상태를 호스트가 직접 만지면 계약이 무너진다.
 *   오버레이의 "시작" 버튼은 키보드의 스페이스와 **같은 입력**을 흘려보낼 뿐이다.
 */
export interface GameControls {
  press(action: GameAction): void
}

/**
 * 캔버스 어댑터 — `core/` 의 조각들을 조립해 게임 하나를 돌린다.
 *
 * → docs/wiki/10-contracts/playground-game-contract.md
 *
 * ⚠ **`ssr: false` 로 지연 로드된다**(`GameStage`). 이 파일과 게임 모듈은 첫 페이로드에
 *   들어가지 않는다.
 *
 * ── 이 컴포넌트가 지는 책임 ────────────────────────────────────────
 * rAF · DPR · 리사이즈 · 가시성 · 입력 정규화 · 번호 중복 방지 · 팔레트 재수집 · 파괴.
 * **게임은 `fixedUpdate` · `draw` · `handle` 만 구현한다.**
 */
export default function GameCanvas({
  meta,
  initialNumbers,
  onAward,
  onStatus,
  onHint,
  onPhase,
  onControls,
  onSfx,
}: {
  meta: GameMeta
  /** 복원된 번호. pool 에 미리 채운다(물리 상태는 복원하지 않는다). */
  initialNumbers: number[]
  onAward: (value: number, slot: number, complete: boolean) => void
  onStatus: (text: string) => void
  onHint: (text: string) => void
  /** 게임이 단계를 알려 온다. 호스트가 오버레이(시작·실패·완료)를 그린다. */
  onPhase?: (phase: GamePhase, title?: string, text?: string) => void
  /** 조작 통로를 넘겨준다. 언마운트 시 `null` 을 준다. */
  onControls?: (controls: GameControls | null) => void
  /**
   * 효과음 요청.
   *
   * ⚠ 실제 재생기는 **호스트(`GameStage`)가 소유한다.** 여기서 만들면 다시하기 때마다
   *   `AudioContext` 가 새로 생겨 기기 한도(브라우저당 6개 안팎)를 금방 먹는다.
   */
  onSfx?: (name: SfxName) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [failed, setFailed] = useState(false)

  /*
    ⚠ 콜백을 ref 로 붙든다. effect 의 의존성에 넣으면 부모가 리렌더될 때마다 게임이
      **처음부터 다시 시작**한다 — 90초를 플레이한 판이 사라진다.
  */
  const cb = useRef({ onAward, onStatus, onHint, onPhase, onControls, onSfx })
  cb.current = { onAward, onStatus, onHint, onPhase, onControls, onSfx }

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null) return

    let disposed = false
    let instance: GameInstance | null = null
    let stopPalette: (() => void) | null = null
    let loop: ReturnType<typeof createLoop> | null = null
    let input: ReturnType<typeof createInput> | null = null

    /*
      ⚠ 시드는 재시작마다 새로 뽑는다. 개발 중에는 `?seed=12345` 로 고정할 수 있다 —
        "플린코가 특정 시드에서 못에 끼인다" 같은 버그를 그대로 재현하기 위한 것이다.
    */
    const params = new URLSearchParams(window.location.search)
    const fixed = Number(params.get('seed'))
    const seed = Number.isFinite(fixed) && fixed > 0 ? fixed >>> 0 : createSeed()

    const rng = createRng(seed)
    const pool = createNumberPool(
      rng,
      (value, slot, complete) => {
        cb.current.onAward(value, slot, complete)
        /*
          ⚠ 획득을 **말로도** 알린다. 캔버스 안의 연출은 보조기술에 전혀 전달되지 않는다.
            게임이 자기 `emit({type:'status'})` 를 보내더라도, 번호 자체는 여기서 보장한다.
        */
        cb.current.onStatus(
          complete
            ? `${value}번을 모아 번호 6개가 완성되었습니다.`
            : `${slot + 1}번째 번호 ${value}번을 모았습니다.`,
        )
      },
      initialNumbers,
    )

    let palette: Palette = readPalette()
    const draw = createDrawKit(() => palette)
    /** ⚠ 테마가 바뀌면 새 팔레트를 준다. 다크모드가 캔버스 안까지 따라온다. */
    stopPalette = watchPalette((next) => {
      palette = next
    })

    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    input = createInput(canvas, meta.stage, (ev) => instance?.handle?.(ev))

    /*
      오버레이 버튼 → 게임. `pressAction` 은 키보드의 누름/뗌과 같은 경로로 들어가므로
      게임은 그것이 DOM 버튼인지 스페이스바인지 알 필요가 없다(계약: 입력 절).
    */
    cb.current.onControls?.({
      press(action) {
        input?.pressAction(action, 'down')
        input?.pressAction(action, 'up')
      },
    })

    loop = createLoop({
      canvas,
      stage: meta.stage,
      getInstance: () => instance,
      onQualityDrop: () => {
        /* 조용히 내린다. 사용자에게 "느립니다" 라고 알릴 이유가 없다. */
      },
    })

    const emit = (event: GameEvent) => {
      switch (event.type) {
        case 'status':
          cb.current.onStatus(event.text)
          break
        case 'hint':
          cb.current.onHint(event.text)
          break
        case 'haptic':
          /** ⚠ iOS 는 조용히 무시한다. 폴백이 필요 없다. */
          navigator.vibrate?.(event.ms)
          break
        case 'retry':
          cb.current.onHint(
            event.reason === 'duplicate'
              ? '이미 모은 번호예요. 한 번 더!'
              : event.reason === 'out'
                ? '벗어났어요. 다시 해 보세요.'
                : '조금 모자랐어요. 다시 해 보세요.',
          )
          break
        case 'sfx':
          /** ⚠ 음소거 판단은 호스트가 한다. 게임은 무슨 일이 났는지만 말한다. */
          cb.current.onSfx?.(event.name)
          break
        case 'phase':
          /*
            ⚠ 게임이 이 이벤트를 한 번도 보내지 않으면 호스트는 계속 `'playing'` 으로 보고
              오버레이를 그리지 않는다. 단계를 쓰지 않는 게임은 아무것도 하지 않아도 된다.
          */
          /*
            ★ **오버레이가 걷히는 순간 캔버스에 포커스를 준다** (2026-09-17 · 스페이스로
              화면이 스크롤된다는 제보에서).

            `input.ts` 는 `keydown` 을 **캔버스에만** 걸고 거기서 `preventDefault` 한다.
            그래서 스페이스·방향키가 막히는 것은 **캔버스에 포커스가 있을 때뿐**이다. 그런데
            사용자가 게임에 들어오는 가장 흔한 경로는 오버레이의 "게임시작" 버튼 클릭인데,
            그 버튼은 눌리자마자 **언마운트되어 포커스가 `body` 로 떨어진다.** 그 상태에서
            스페이스를 누르면 게임이 아니라 **페이지가 스크롤된다** — 던지려고 누른 키가
            화면을 밀어 버리니 조작 자체가 성립하지 않는다.

            ⚠ `preventScroll: true` 가 반드시 필요하다. 이것 없이 `focus()` 하면 브라우저가
              캔버스를 보이게 하려고 스크롤하는데, `GameStage.scrollTo()` 가 헤더·탭바를
              빼고 잡아 둔 위치가 그 순간 흐트러진다. 고치려는 증상을 스스로 다시 만드는 셈이다.
            ⚠ 마운트 시점에는 주지 않는다. 페이지에 막 들어온 사람의 포커스를 뺏으면
              스크린리더가 제목·소개를 읽기 전에 게임 화면으로 끌려간다. **사용자가 "게임시작"
              을 눌러 명시적으로 시작한 이 순간**이라야 포커스 이동이 예상 가능한 동작이다.
            ⚠ 여섯 게임 공통이다 — 특정 게임의 사정이 아니라 호스트의 입력 경로 문제다.
          */
          if (event.phase === 'playing') canvasRef.current?.focus({ preventScroll: true })
          cb.current.onPhase?.(event.phase, event.title, event.text)
          break
        case 'attempt':
          /* HUD 의 시도 표시는 v1 에서 쓰지 않는다. 게임이 보내도 조용히 넘긴다. */
          break
      }
    }

    GAME_LOADERS[meta.slug]()
      .then((mod) => {
        if (disposed) return
        instance = mod.default.create({
          stage: meta.stage,
          pool,
          rng,
          palette,
          input: input!.state,
          draw,
          emit,
          reducedMotion,
          quality: loop!.quality,
        })
        loop!.start()
      })
      .catch(() => {
        if (!disposed) setFailed(true)
      })

    return () => {
      disposed = true
      cb.current.onControls?.(null)
      loop?.destroy()
      input?.destroy()
      instance?.destroy?.()
      /*
        ⚠ **게임이 죽어도 예약이 새지 않게** 한다. 계약의 불변식 넷 중 하나이고, 호스트가
          지키기로 되어 있다.
      */
      pool.releaseAll()
      stopPalette?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 마운트당 한 판. 재시작은 key 로 한다.
  }, [meta.slug])

  if (failed) {
    return (
      <div className="pg-canvas-failed">
        <p>게임을 불러오지 못했습니다. 새로고침해 주세요.</p>
      </div>
    )
  }

  return (
    /*
      ⚠ `role="application"` — 캔버스 안에서 방향키가 페이지 스크롤이 아니라 게임 조작임을
        보조기술에 알린다.
      ⚠ `tabIndex={0}` + **보이는 포커스 링**(CSS). 키보드만으로 완주할 수 있어야 한다.
      ⚠ `touch-action: none` 과 `overscroll-behavior: contain` 은 CSS 에 있다 — 더블탭 확대와
        드래그 중 페이지 스크롤을 막는다(iOS).
    */
    <canvas
      ref={canvasRef}
      className="pg-canvas"
      role="application"
      aria-label={`${meta.title} 게임 화면. ${meta.keyGuide}`}
      tabIndex={0}
    />
  )
}
