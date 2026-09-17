import type { GameInstance, StageSize } from './types'

/**
 * 게임 루프 — **고정 타임스텝 + 렌더 보간**.
 *
 * → docs/wiki/10-contracts/playground-game-contract.md "게임 루프" 절
 *
 * rAF · DPR · 리사이즈 · 가시성 · 품질 워치독을 **전부 호스트가** 한다. 게임은
 * `fixedUpdate(dt)` 와 `draw(c, alpha, timeMs)` 만 구현한다.
 *
 * ⚠ **왜 고정 타임스텝인가.** 저사양 폰에서 프레임이 튀어도 물리가 달라지지 않는다 —
 *   컬링 스톤이 30fps 에서 두 배로 미끄러지는 사고를 원천 차단한다.
 */

/** 16.667ms 고정. 게임이 받는 `dt` 는 **항상** 이 값(초 단위)이다. */
const STEP_MS = 1000 / 60
/** 한 프레임에 최대 5스텝. 그 이상은 버린다 — 따라잡으려다 더 느려지는 나선을 막는다. */
const MAX_STEPS = 5
/** 탭 복귀 직후 누적치 폭발 방지. */
const CLAMP_MS = 250
/** 최근 이만큼의 프레임 시간을 보고 품질을 판정한다. */
const WATCH_FRAMES = 90
/** 평균이 이 값을 넘으면 품질을 한 단계 내린다(약 42fps). */
const WATCH_LIMIT_MS = 24

export interface LoopHandle {
  start(): void
  stop(): void
  /** 현재 품질 등급. 워치독이 내리면 바뀐다. */
  readonly quality: { readonly level: 'high' | 'low' }
  destroy(): void
}

export interface LoopOptions {
  canvas: HTMLCanvasElement
  stage: StageSize
  /** 매 프레임 현재 인스턴스를 묻는다. 재시작 시 교체되므로 참조를 붙들지 않는다. */
  getInstance(): GameInstance | null
  /** 품질이 내려갔을 때 한 번 알린다. */
  onQualityDrop?(): void
}

/**
 * DPR 상한.
 *
 * ⚠ 3배 이상 화면에서 캔버스 픽셀이 9배가 되면 저사양 기기가 버티지 못한다. 코어가 적은
 *   기기는 더 낮춘다 — 선명함보다 프레임이 먼저다.
 */
function pickDpr(): number {
  if (typeof window === 'undefined') return 1
  const raw = window.devicePixelRatio || 1
  const cores = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency ?? 8) : 8
  const cap = cores <= 4 ? 1.5 : 2
  return Math.min(raw, cap)
}

export function createLoop(options: LoopOptions): LoopHandle {
  const { canvas, stage, getInstance, onQualityDrop } = options
  const c = canvas.getContext('2d', { alpha: false })

  const quality = { level: 'high' as 'high' | 'low' }
  let raf = 0
  let running = false
  /** 물리 누적 시간. 남은 만큼 다음 프레임으로 넘긴다. */
  let acc = 0
  let last = 0
  /** 시작부터의 누적 밀리초. **일시정지 동안 멈춘다.** */
  let timeMs = 0
  let dpr = 1

  const frames: number[] = []
  let frameSum = 0

  /**
   * 캔버스 버퍼 크기와 좌표계를 다시 잡는다.
   *
   * ⚠ **매 리사이즈마다 `setTransform` 을 다시 건다.** 논리 좌표가 불변이므로 게임은
   *   아무것도 하지 않아도 된다.
   */
  function resize() {
    if (c === null) return
    const rect = canvas.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return

    dpr = pickDpr()
    const w = Math.round(rect.width * dpr)
    const h = Math.round(rect.height * dpr)
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    // 논리 좌표(stage) → 실제 픽셀. 게임은 언제나 stage 좌표로만 그린다.
    const s = rect.width / stage.width
    c.setTransform(s * dpr, 0, 0, s * dpr, 0, 0)
  }

  /*
    ⚠ 0.5px 미만 변화는 무시한다 — iOS 주소창 애니메이션 중 초당 60회 재할당을 막는다.
      캔버스 크기 재할당은 버퍼를 새로 만드는 일이라 값이 비싸다.
  */
  let lastW = 0
  let lastH = 0
  const observer =
    typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver((entries) => {
          const r = entries[0]?.contentRect
          if (r === undefined) return
          if (Math.abs(r.width - lastW) < 0.5 && Math.abs(r.height - lastH) < 0.5) return
          lastW = r.width
          lastH = r.height
          resize()
        })
      : null
  observer?.observe(canvas)

  function watchdog(frameMs: number) {
    if (quality.level === 'low') return
    frames.push(frameMs)
    frameSum += frameMs
    if (frames.length < WATCH_FRAMES) return
    frameSum -= frames.shift() as number
    /*
      ⚠ 한 번 내리고 **되돌리지 않는다.** 오르내리며 깜빡이는 편이 더 나쁘다 — 파티클이
        나타났다 사라지는 화면은 고장으로 읽힌다.
    */
    if (frameSum / frames.length > WATCH_LIMIT_MS) {
      quality.level = 'low'
      onQualityDrop?.()
    }
  }

  function frame(now: number) {
    if (!running) return
    raf = requestAnimationFrame(frame)

    const instance = getInstance()
    if (instance === null || c === null) {
      last = now
      return
    }

    let elapsed = now - last
    last = now
    if (elapsed > CLAMP_MS) elapsed = CLAMP_MS
    watchdog(elapsed)

    acc += elapsed
    let steps = 0
    while (acc >= STEP_MS && steps < MAX_STEPS) {
      instance.fixedUpdate(STEP_MS / 1000)
      acc -= STEP_MS
      timeMs += STEP_MS
      steps += 1
    }
    /** ⚠ 남은 누적이 한도를 넘으면 버린다. 안 버리면 다음 프레임이 또 5스텝을 돈다. */
    if (steps === MAX_STEPS) acc = 0

    instance.draw(c, acc / STEP_MS, timeMs)
  }

  /*
    ⚠ **`visibilitychange` 만 신호로 쓴다.** `blur` 는 iOS 에서 오탐이 많아(주소창 탭,
      알림 배너) 멀쩡히 보고 있는데 게임이 멈춘다.
  */
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      if (running) {
        running = false
        cancelAnimationFrame(raf)
        getInstance()?.onPause?.()
      }
    } else if (!running) {
      handle.start()
      getInstance()?.onResume?.()
    }
  }
  document.addEventListener('visibilitychange', onVisibility)

  const handle: LoopHandle = {
    start() {
      if (running) return
      running = true
      resize()
      /** ⚠ `last` 를 지금으로 맞춘다. 안 하면 정지 시간이 통째로 누적치에 들어온다. */
      last = performance.now()
      acc = 0
      raf = requestAnimationFrame(frame)
    },
    stop() {
      if (!running) return
      running = false
      cancelAnimationFrame(raf)
    },
    quality,
    destroy() {
      handle.stop()
      observer?.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
    },
  }

  return handle
}
