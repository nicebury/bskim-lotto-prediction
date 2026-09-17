/**
 * G04 얼음판 컬링 — 그리기.
 *
 * → 사양서: docs/wiki/20-design/game-g04-curling.md "아트 디렉션"
 * → 계약:   docs/wiki/10-contracts/playground-game-contract.md "DrawKit"
 *
 * ── ⚠ 레이어를 둘로 나눠 캐시한다 ─────────────────────────────────
 * 이 게임은 화면에 **볼이 45개** 있다. 매 프레임 그리면 `fillText` 45번 + 방사 그라디언트
 * 45개가 되어 중저가 폰에서 그것만으로 프레임 예산을 넘긴다. 그런데 45칸은 **한 판에 많아야
 * 아홉 번**밖에 변하지 않는다(기회가 9번이다) — 캐시가 정확히 맞는 상황이다.
 *
 *   ① 배경 레이어 : 얼음·스크래치·격자·아웃 라인·비네트 (거의 안 변한다)
 *   ② 볼 레이어   : 45칸 (뒤집힐 때만 변한다)
 *
 * ── ⚠ 캐시 무효화 신호 셋 ─────────────────────────────────────────
 * 1. **화면 배율** — 호스트가 건 변환 행렬에서 읽는다(계약 "오프스크린 캐시의 배율").
 *    논리 크기로 캐시하면 고배율 화면에서 이 두 장만 뭉개져 보인다.
 * 2. **뒤집힌 칸 수 / 공개 중인 칸** — 즉시 다시 그린다.
 * 3. **팔레트** — `ctx.palette` 는 `create()` 시점의 스냅샷이라 테마가 바뀌어도 그 객체는
 *    변하지 않는데, `DrawKit` 은 최신 팔레트를 본다. 그대로 두면 캐시된 두 장만 옛 테마로
 *    남는다. 1초에 한 번 다시 읽고 **색이 실제로 달라졌을 때만** 캐시를 버린다.
 *
 * ── ★ 2026-09-17 전면 개편 ────────────────────────────────────────
 * 은닉형이 되면서 그리는 것이 통째로 바뀌었다.
 *   · 45칸은 **뒷면**(`mysteryBall`)이고, 뒤집힌 칸만 번호나 꽝을 보인다
 *   · **행별 구간색을 지웠다** — 색을 미리 깔면 그 행의 번호대를 알려 주는 셈이다
 *   · 얻은 칸에 **장애물 링**을 둘러 "여기 맞으면 튕긴다" 를 그림으로 말한다
 *   · **남은 기회**와 **조작 시연**이 새로 들어왔다
 */

import { readPalette } from '@/games/core/palette'

import type { GameContext, Palette, ParticleField } from '@/games/core/types'

import {
  ATTEMPT_ROW,
  BALL_R,
  BOARD,
  HIT_MARGIN_X,
  HIT_MARGIN_Y,
  BOARD_PULL_LO,
  BOARD_PULL_HI,
  LANE,
  MAX_ATTEMPTS,
  OUT_LINE_Y,
  PARTICLE_MAX,
  POWER_BAR,
  PULL_MAX,
  SCRATCH_COUNT,
  STAGE,
  START,
  STONE_R,
  boardIndex,
  cellCenter,
} from './layout'
import type { CellState } from './layout'
import type { Stone } from './physics'

export type Phase = 'aim' | 'slide' | 'reveal' | 'retry' | 'done'

/**
 * 한 칸을 뒤집는 연출.
 *
 * ⚠ `value` 가 `null` 이면 **꽝**이다. 번호 0 이라는 뜻이 아니다 — 0 을 센티널로 쓰면
 *   언젠가 누가 그것을 번호로 그린다.
 */
export interface RevealView {
  row: number
  col: number
  value: number | null
  /** 0 → 1 진행. */
  t: number
}

/** 렌더러가 그리는 데 필요한 전부. 게임 상태를 그대로 넘기지 않고 **읽기용으로만** 추린다. */
export interface View {
  phase: Phase
  stone: Stone
  angle: number
  pull: number
  /** 조준 중 예상 궤적(보드 진입 전까지). */
  path: readonly { x: number; y: number }[]
  trail: readonly { x: number; y: number }[]
  /**
   * 45칸의 상태.
   *
   * ⚠ 장애물 목록을 따로 받지 않는다 — 장애물은 `kind === 'awarded'` 인 칸 그 자체라,
   *   두 벌로 들고 있으면 언젠가 한쪽만 갱신되어 **화면과 물리가 어긋난다.**
   */
  cells: readonly CellState[]
  reveal: RevealView | null
  /** 헛투구 표시 위치와 진행(0→1). */
  missAt: { x: number; y: number } | null
  missT: number
  /** 선에 걸쳤다면 그 칸. 판정 영역을 함께 보여 준다. */
  missCell: { row: number; col: number } | null
  /** 화면 흔들림 세기(px). `reducedMotion` 이면 게임이 0 으로 준다. */
  shake: number
  /** 드래그 중인가. 고무줄을 그릴지 판단한다. */
  dragging: boolean
  /** 남은 기회. 캔버스 안에도 그린다(계약). */
  attemptsLeft: number
  /** 첫 투구 전 조작 시연을 보일 것인가. */
  showTutorial: boolean
  tutorialT: number
}

export interface Renderer {
  draw(c: CanvasRenderingContext2D, view: View, alpha: number, timeMs: number): void
  /**
   * 색종이. `reducedMotion` 이면 게임이 부르지 않는다.
   * @param kind 색을 게임이 고르지 않는 이유는 위 팔레트 주석과 같다 — 게임이 든 팔레트는
   *             테마가 바뀌어도 그대로라, 다크로 바꾼 뒤 터지는 색만 옛 테마가 된다.
   */
  burst(x: number, y: number, kind: 'award' | 'wall' | 'peg'): void
  update(dt: number): void
  destroy(): void
}

/** 오프스크린 한 장과 그것이 유효한 조건. */
interface Layer {
  canvas: HTMLCanvasElement | null
  ctx: CanvasRenderingContext2D | null
  key: string
}

function makeLayer(): Layer {
  return { canvas: null, ctx: null, key: '' }
}

/**
 * 오프스크린을 준비한다. 크기가 그대로면 지우기만 하고 다시 쓴다.
 *
 * ⚠ **캔버스를 매번 새로 만들지 않는다.** 버퍼 재할당은 값이 비싸고, 자주 새로 만들면
 *   그것만으로 GC 를 부른다.
 */
function prepare(layer: Layer, w: number, h: number, scale: number): CanvasRenderingContext2D | null {
  const pw = Math.max(1, Math.round(w * scale))
  const ph = Math.max(1, Math.round(h * scale))

  if (layer.canvas === null) {
    layer.canvas = document.createElement('canvas')
    layer.ctx = layer.canvas.getContext('2d')
  }
  const g = layer.ctx
  if (g === null || layer.canvas === null) return null

  if (layer.canvas.width !== pw || layer.canvas.height !== ph) {
    layer.canvas.width = pw
    layer.canvas.height = ph
  }
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.clearRect(0, 0, pw, ph)
  // 이후 그리기는 전부 논리 좌표로 한다. 배율은 여기서 한 번만 다룬다.
  g.setTransform(scale, 0, 0, scale, 0, 0)
  return g
}

export function createRenderer(ctx: GameContext): Renderer {
  const kit = ctx.draw

  /**
   * 현재 테마의 색.
   *
   * ⚠ **`ctx.palette` 를 그대로 쓰면 다크모드가 캔버스 안까지 따라오지 않는다.** 그것은
   *   `create()` 시점의 스냅샷이고, 호스트는 테마가 바뀌어도 그 객체를 갈아 주지 않는다
   *   (계약은 "새 객체를 준다" 고 적혀 있지만 `GameCanvas` 는 지역 변수만 바꾼다).
   *   2026-09-08 실측: 페이지는 어두워지는데 캔버스만 흰 얼음으로 남았다.
   * ⚠ 매 프레임 부르지 않는다 — `getComputedStyle` 은 프레임 예산에 부담이 된다.
   */
  let p: Palette = ctx.palette
  let paletteAt = Number.NEGATIVE_INFINITY
  /** 팔레트가 실제로 바뀐 횟수. **캐시 무효화 신호는 시간이 아니라 이것이다.** */
  let paletteRev = 0
  let paletteKey = ''

  /** 캐시를 다시 그려야 할 만큼 색이 달라졌는가. 실제로 캔버스에 쓰는 색만 본다. */
  function paletteFingerprint(x: Palette): string {
    return `${x.bg}|${x.surface}|${x.surface2}|${x.border}|${x.text}|${x.textMuted}|${x.info}|${x.danger}|${x.svc.stats}|${x.ball[1]}|${x.ball[5]}|${x.ballFg}|${x.ballFgDark}|${x.fontSans}`
  }

  const bgLayer = makeLayer()
  const ballLayer = makeLayer()
  const particles: ParticleField = kit.particles(PARTICLE_MAX)

  /**
   * 얼음 스크래치 — **시드를 고정해 한 번만 계산한다**(사양서).
   *
   * ⚠ 캐시를 다시 그릴 때마다 난수를 새로 뽑으면 스크래치가 통째로 바뀌어 화면이 깜빡인다.
   *   그리고 배경 연출은 `fork()` 한 독립 스트림을 쓴다 — 물리와 같은 스트림을 소비하면
   *   같은 시드로도 결과가 달라져 재현성이 깨진다(계약).
   */
  const decorRng = ctx.rng.fork()
  const scratches = Array.from({ length: SCRATCH_COUNT }, () => {
    const x = decorRng.range(LANE.left + 6, LANE.right - 6)
    const y = decorRng.range(BOARD.bottom + 10, LANE.bottom - 20)
    const len = decorRng.range(30, 110)
    const tilt = decorRng.range(-0.16, 0.16)
    return { x, y, len, tilt }
  })
  /** 레인 밖 바닥의 세로 결(장식 2겹 중 한 겹). 역시 한 번만 뽑는다. */
  const grains = Array.from({ length: 14 }, () => ({
    x: decorRng.range(0, STAGE.width),
    y: decorRng.range(0, STAGE.height),
    h: decorRng.range(40, 160),
  }))

  /** 배율이 바뀌면(리사이즈·창 이동) 두 레이어를 다시 만든다. */
  function readScale(c: CanvasRenderingContext2D): number {
    if (typeof c.getTransform !== 'function') return 1
    const m = c.getTransform()
    return m.a > 0 ? m.a : 1
  }

  /* ──────────────────────────────────────────────────────────
   * 배경 레이어
   * ────────────────────────────────────────────────────────── */

  function paintBackground(g: CanvasRenderingContext2D) {
    // 규칙 1 — 세로 그라디언트 한 장.
    const base = g.createLinearGradient(0, 0, 0, STAGE.height)
    base.addColorStop(0, p.surface2)
    base.addColorStop(1, p.bg)
    g.fillStyle = base
    g.fillRect(0, 0, STAGE.width, STAGE.height)

    // 장식 겹 ①: 레인 밖 바닥의 세로 결. 위에서 내려다본 화면이라 패럴랙스 대신 정적 결로 깊이를 만든다.
    g.save()
    g.globalAlpha = 0.05
    g.strokeStyle = p.text
    g.lineWidth = 2
    for (const gr of grains) {
      if (gr.x > LANE.left - 6 && gr.x < LANE.right + 6) continue
      g.beginPath()
      g.moveTo(gr.x, gr.y)
      g.lineTo(gr.x, gr.y + gr.h)
      g.stroke()
    }
    g.restore()

    // 얼음 레인.
    const laneH = LANE.bottom - LANE.top
    g.fillStyle = p.surface
    g.fillRect(LANE.left, LANE.top, LANE.right - LANE.left, laneH)

    // 장식 겹 ②: 위가 차갑고 아래가 맑은 청색조. 얼음이라는 재질을 색으로만 말한다.
    g.save()
    g.globalAlpha = 0.14
    g.fillStyle = p.info
    g.fillRect(LANE.left, LANE.top, LANE.right - LANE.left, laneH * 0.45)
    g.globalAlpha = 0.06
    g.fillRect(LANE.left, LANE.top + laneH * 0.45, LANE.right - LANE.left, laneH * 0.55)
    g.restore()

    /*
      스크래치(사양서). 얼음에 눌린 자국이라 아주 옅다.
      ⚠ 검은 선으로 고정하면 **다크 테마에서 통째로 사라진다**(어두운 얼음 위 검은 선).
        글자색을 α0.06 으로 쓰면 라이트에서는 어둡게, 다크에서는 밝게 나와 두 테마 모두에서
        같은 정도로 보인다.
    */
    g.save()
    g.globalAlpha = 0.06
    g.strokeStyle = p.text
    g.lineWidth = 2
    g.lineCap = 'round'
    for (const s of scratches) {
      g.beginPath()
      g.moveTo(s.x - s.len / 2, s.y - (s.len / 2) * s.tilt)
      g.lineTo(s.x + s.len / 2, s.y + (s.len / 2) * s.tilt)
      g.stroke()
    }
    g.restore()

    /*
      좌우 벽 — 스톤이 튕기는 곳이라 **다른 선보다 진하게** 그린다.
      ⚠ 각도 한계를 45° 로 넓힌 뒤로 벽은 **장식이 아니라 전략**이 됐다(2026-09-17). 벽을
        써서 돌아 들어가는 투구가 실제 선택지이므로, 여기가 튕기는 면이라는 것이 한눈에
        읽혀야 한다.
    */
    g.strokeStyle = p.textMuted
    g.lineWidth = 3
    g.beginPath()
    g.moveTo(LANE.left, LANE.top)
    g.lineTo(LANE.left, LANE.bottom)
    g.moveTo(LANE.right, LANE.top)
    g.lineTo(LANE.right, LANE.bottom)
    g.stroke()

    paintBoardFrame(g)
    paintOutLine(g)
    paintStartMark(g)

    kit.vignette(g, STAGE, 0.18)
  }

  /**
   * 보드의 칸 배경과 격자. 칸의 내용은 다른 레이어다.
   *
   * ⚠ **행별 구간색을 깔지 않는다**(2026-09-17 에 제거). 전에는 행마다 볼 구간색을 α0.10 으로
   *   깔아 "색만 봐도 번호대가 읽히게" 했는데, 그것은 칸에 번호가 적혀 있던 시절의 장치다.
   *   번호를 감춘 지금 같은 색을 깔면 **뒷면인 척하면서 번호대를 알려 주는** 셈이라, 계약이
   *   말하는 "화면이 하는 거짓말" 에 정확히 해당한다.
   */
  function paintBoardFrame(g: CanvasRenderingContext2D) {
    g.fillStyle = p.surface
    g.fillRect(BOARD.left, BOARD.top, BOARD.width, BOARD.height)

    g.strokeStyle = p.border
    g.lineWidth = 1
    g.beginPath()
    for (let col = 1; col < BOARD.cols; col += 1) {
      const x = BOARD.left + col * BOARD.cellW
      g.moveTo(x, BOARD.top)
      g.lineTo(x, BOARD.bottom)
    }
    for (let row = 1; row < BOARD.rows; row += 1) {
      const y = BOARD.top + row * BOARD.cellH
      g.moveTo(BOARD.left, y)
      g.lineTo(BOARD.right, y)
    }
    g.stroke()

    g.lineWidth = 2
    g.strokeStyle = p.textMuted
    g.strokeRect(BOARD.left, BOARD.top, BOARD.width, BOARD.height)
  }

  /** 아웃 라인 — 넘어가면 그 자리에서 끝이다. 규칙을 그림으로 말한다. */
  function paintOutLine(g: CanvasRenderingContext2D) {
    g.save()
    g.setLineDash([6, 5])
    g.strokeStyle = p.danger
    g.globalAlpha = 0.6
    g.lineWidth = 2
    g.beginPath()
    g.moveTo(LANE.left - 8, OUT_LINE_Y)
    g.lineTo(LANE.right + 8, OUT_LINE_Y)
    g.stroke()
    g.restore()
    kit.text(g, '아웃', LANE.left - 12, OUT_LINE_Y, {
      size: 10,
      weight: 700,
      align: 'right',
      color: p.danger,
      alpha: 0.75,
    })
  }

  /** 스톤이 출발하는 자리. 조준의 기준점이라 항상 보여야 한다. */
  function paintStartMark(g: CanvasRenderingContext2D) {
    g.save()
    g.setLineDash([3, 4])
    g.strokeStyle = p.textMuted
    g.globalAlpha = 0.55
    g.lineWidth = 1.5
    g.beginPath()
    g.arc(START.x, START.y, STONE_R + 7, 0, Math.PI * 2)
    g.stroke()
    g.restore()
  }

  /* ──────────────────────────────────────────────────────────
   * 볼 레이어 — 보드 영역만큼만 만든다(200×207)
   * ────────────────────────────────────────────────────────── */

  /**
   * 꽝 칸 — 뒤집었더니 번호가 없었다.
   *
   * ⚠ **색만으로 말하지 않는다.** 붉게만 칠하면 색각 이상이 있는 사용자에게 그냥 다른 칸이다.
   *   "꽝" 이라는 글자가 정보의 본체이고 색은 거들 뿐이다.
   * ⚠ 장애물이 아니라는 것도 그림으로 구분된다 — 얻은 칸에는 도드라진 링이 있고 여기는 없다.
   */
  function paintBlankCell(g: CanvasRenderingContext2D, x: number, y: number) {
    g.save()
    g.globalAlpha = 0.85
    g.fillStyle = p.surface2
    g.beginPath()
    g.arc(x, y, BALL_R, 0, Math.PI * 2)
    g.fill()
    g.globalAlpha = 0.5
    g.strokeStyle = p.danger
    g.lineWidth = 1.5
    g.beginPath()
    g.arc(x, y, BALL_R - 0.75, 0, Math.PI * 2)
    g.stroke()
    g.restore()
    kit.text(g, '꽝', x, y, {
      size: BALL_R * 1.05,
      weight: 700,
      align: 'center',
      color: p.danger,
      alpha: 0.9,
    })
  }

  /**
   * 얻은 칸 — 번호 볼 + **장애물 링**.
   *
   * ⚠ 링이 그냥 장식이 아니다. 이 칸은 스톤을 튕겨 내므로 **다음 투구의 지형**이고, 그것을
   *   모르면 사용자는 왜 스톤이 엉뚱하게 튀는지 알 수 없다. 볼보다 조금 큰 원을 둘러
   *   "여기는 부딪히는 자리" 를 그림으로 말한다.
   */
  function paintAwardedCell(g: CanvasRenderingContext2D, x: number, y: number, value: number) {
    kit.ball(g, x, y, BALL_R, value)
    g.save()
    g.globalAlpha = 0.45
    g.strokeStyle = p.textMuted
    g.lineWidth = 1.5
    g.beginPath()
    g.arc(x, y, BALL_R + 1.5, 0, Math.PI * 2)
    g.stroke()
    g.restore()
  }

  function paintCells(g: CanvasRenderingContext2D, view: View) {
    for (let row = 0; row < BOARD.rows; row += 1) {
      for (let col = 0; col < BOARD.cols; col += 1) {
        // 공개 연출 중인 칸은 오버레이가 솟아오르게 그린다. 두 번 그리면 겹쳐 보인다.
        if (view.reveal !== null && view.reveal.row === row && view.reveal.col === col) continue
        const cell = view.cells[boardIndex(row, col)]
        if (cell === undefined) continue
        const c0 = cellCenter(row, col)
        const x = c0.x - BOARD.left
        const y = c0.y - BOARD.top

        if (cell.kind === 'awarded') paintAwardedCell(g, x, y, cell.value)
        else if (cell.kind === 'blank') paintBlankCell(g, x, y)
        else {
          /*
            ⚠ 뒷면은 `DrawKit.mysteryBall` 로 그린다 — 직접 원을 그리지 않는 이유는 은닉형
              게임 셋(G01·G02·G04)이 **같은 뒷면**을 보여야 하기 때문이다. 게임마다 다른
              물음표를 그리면 그것만으로 세 개의 다른 제품이 된다(계약의 시각 언어 규칙).
          */
          kit.mysteryBall(g, x, y, BALL_R)
        }
      }
    }
  }

  /* ──────────────────────────────────────────────────────────
   * 매 프레임 그리는 것
   * ────────────────────────────────────────────────────────── */

  /** 스톤 — 화강암 원 + 손잡이 + 접지 그림자. */
  function paintStone(c: CanvasRenderingContext2D, x: number, y: number, angle: number) {
    // 규칙 2 — 지면 그림자로 부유감을 없앤다.
    kit.softShadow(c, x, y + 5, STONE_R * 1.0, STONE_R * 0.52, 0.2)

    c.save()
    c.fillStyle = p.textMuted
    c.beginPath()
    c.arc(x, y, STONE_R, 0, Math.PI * 2)
    c.fill()

    /*
      ⚠ 저사양(`quality.level === 'low'`)에서는 방사 그라디언트를 건너뛴다. 스톤은 한 개뿐
        이라 큰 부담은 아니지만, 워치독이 이미 프레임을 잃었다고 판정한 상황에서 아낄 수
        있는 것은 전부 아낀다.
    */
    if (ctx.quality.level === 'high') {
      const hi = c.createRadialGradient(
        x - STONE_R * 0.4,
        y - STONE_R * 0.45,
        STONE_R * 0.1,
        x,
        y,
        STONE_R,
      )
      hi.addColorStop(0, 'rgba(255,255,255,0.55)')
      hi.addColorStop(0.55, 'rgba(255,255,255,0.12)')
      hi.addColorStop(1, 'rgba(0,0,0,0.22)')
      c.fillStyle = hi
      c.beginPath()
      c.arc(x, y, STONE_R, 0, Math.PI * 2)
      c.fill()
    }

    c.lineWidth = 1.5
    c.strokeStyle = 'rgba(0,0,0,0.28)'
    c.beginPath()
    c.arc(x, y, STONE_R - 0.75, 0, Math.PI * 2)
    c.stroke()

    // 규칙 3 — 좌상단 림라이트.
    c.lineWidth = 1.5
    c.strokeStyle = 'rgba(255,255,255,0.35)'
    c.beginPath()
    c.arc(x, y, STONE_R - 2.5, Math.PI * 1.1, Math.PI * 1.7)
    c.stroke()

    // 손잡이. 진행(조준) 방향을 가리켜 각도를 몸으로 읽게 한다.
    c.translate(x, y)
    c.rotate(angle)
    c.fillStyle = p.svc.stats
    kit.roundRect(c, -2, -STONE_R * 0.62, 4, STONE_R * 0.62, 2)
    c.fill()
    c.beginPath()
    c.arc(0, 0, STONE_R * 0.34, 0, Math.PI * 2)
    c.fill()
    c.strokeStyle = 'rgba(255,255,255,0.4)'
    c.lineWidth = 1
    c.beginPath()
    c.arc(0, 0, STONE_R * 0.34 - 1, Math.PI * 1.1, Math.PI * 1.7)
    c.stroke()
    c.restore()
  }

  /**
   * 지나간 자국.
   *
   * ⚠ 흰색으로 그리면 밝은 테마의 얼음(거의 흰색) 위에서 사라지고, 검게 그리면 어두운
   *   테마에서 사라진다. **토큰 색(`info`)을 옅게** 쓰면 두 테마 모두에서 보인다.
   */
  function paintTrail(c: CanvasRenderingContext2D, trail: readonly { x: number; y: number }[]) {
    if (trail.length < 2) return
    c.save()
    c.strokeStyle = p.info
    c.lineCap = 'round'
    c.lineJoin = 'round'
    for (let i = 1; i < trail.length; i += 1) {
      const a = trail[i - 1]
      const b = trail[i]
      if (a === undefined || b === undefined) continue
      c.globalAlpha = 0.2 * (i / trail.length)
      c.lineWidth = STONE_R * 1.1 * (0.4 + 0.6 * (i / trail.length))
      c.beginPath()
      c.moveTo(a.x, a.y)
      c.lineTo(b.x, b.y)
      c.stroke()
    }
    c.restore()
  }

  /**
   * 당김 표시 — 고무줄과 손잡이.
   *
   * ⚠ **스톤은 제자리에 둔다.** 스톤 자체를 뒤로 물리면 조준의 기준점이 움직여, 얼마나
   *   당겼는지를 눈이 아니라 기억으로 재야 한다. 고정된 시작점 원(`paintStartMark`)에서
   *   손잡이까지의 거리가 곧 세기이고, 그 길이가 화면에 그대로 보인다.
   */
  function paintPullBand(c: CanvasRenderingContext2D, x: number, y: number, dirX: number, dirY: number, pull: number) {
    const bx = x - dirX * pull
    const by = y - dirY * pull

    c.save()
    c.strokeStyle = p.svc.stats
    c.globalAlpha = 0.75
    c.lineWidth = 3
    c.lineCap = 'round'
    c.beginPath()
    c.moveTo(x, y)
    c.lineTo(bx, by)
    c.stroke()

    // 손잡이 — 당기는 지점이 어디인지 점으로 못 박는다.
    c.globalAlpha = 0.9
    c.fillStyle = p.svc.stats
    c.beginPath()
    c.arc(bx, by, 5, 0, Math.PI * 2)
    c.fill()
    c.restore()
  }

  /** 조준 보조 — 예상 궤적 점선, 방향 화살표, 당김 고무줄. */
  function paintAim(c: CanvasRenderingContext2D, view: View) {
    const { stone, angle, pull, path } = view

    if (path.length > 1) {
      c.save()
      c.setLineDash([4, 7])
      c.strokeStyle = p.text
      c.globalAlpha = 0.32
      c.lineWidth = 2
      c.beginPath()
      const first = path[0]
      if (first !== undefined) {
        c.moveTo(first.x, first.y)
        for (let i = 1; i < path.length; i += 1) {
          const q = path[i]
          if (q !== undefined) c.lineTo(q.x, q.y)
        }
      }
      c.stroke()
      c.restore()
    }

    // 방향 화살표. 세기가 셀수록 길어져 두 값을 한눈에 읽게 한다.
    const dirX = Math.sin(angle)
    const dirY = -Math.cos(angle)
    const len = 26 + (pull / PULL_MAX) * 26
    const tipX = stone.x + dirX * len
    const tipY = stone.y + dirY * len
    c.save()
    c.strokeStyle = p.svc.stats
    c.fillStyle = p.svc.stats
    c.lineWidth = 3
    c.lineCap = 'round'
    c.beginPath()
    c.moveTo(stone.x + dirX * (STONE_R + 3), stone.y + dirY * (STONE_R + 3))
    c.lineTo(tipX, tipY)
    c.stroke()
    c.translate(tipX, tipY)
    c.rotate(angle)
    c.beginPath()
    c.moveTo(0, -7)
    c.lineTo(5.5, 4)
    c.lineTo(-5.5, 4)
    c.closePath()
    c.fill()
    c.restore()

    /*
      당김 고무줄 — 드래그 중에만 그린다. 키보드로 조준할 때는 뒤로 당기는 동작 자체가
      없어서, 없는 손을 그리면 오히려 헷갈린다.
    */
    if (view.dragging && pull > 0) paintPullBand(c, stone.x, stone.y, dirX, dirY, pull)
  }

  /**
   * ★ 조작 시연 — "당겼다 놓는다" 를 손으로 보여 준다 (2026-09-17 신설).
   *
   * ⚠ **문구로 설명하지 않고 동작으로 보여 준다.** 캔버스 아래 `hint` 로도 같은 말을 하지만,
   *   글을 읽지 않고 바로 손을 대는 사용자가 더 많다. 2초 주기로 아래로 당겼다가 놓는
   *   동작을 반복하면, 설명을 읽지 않아도 무엇을 해야 하는지 알 수 있다.
   * ⚠ `reducedMotion` 이면 **움직이지 않는 화살표와 문구**로 대체한다(계약: 장식 애니메이션만
   *   끄고 게임 자체는 그대로). 정보가 사라지지 않는 것이 핵심이다.
   */
  function paintTutorial(c: CanvasRenderingContext2D, view: View) {
    const label = '당겼다 놓기'
    const labelY = START.y + 62

    if (ctx.reducedMotion) {
      c.save()
      c.globalAlpha = 0.8
      c.strokeStyle = p.svc.stats
      c.lineWidth = 3
      c.lineCap = 'round'
      c.beginPath()
      c.moveTo(START.x, START.y + STONE_R + 8)
      c.lineTo(START.x, START.y + STONE_R + 38)
      c.stroke()
      c.beginPath()
      c.moveTo(START.x - 6, START.y + STONE_R + 30)
      c.lineTo(START.x, START.y + STONE_R + 40)
      c.lineTo(START.x + 6, START.y + STONE_R + 30)
      c.stroke()
      c.restore()
      kit.text(c, label, START.x, labelY, {
        size: 12,
        weight: 700,
        align: 'center',
        color: p.textMuted,
      })
      return
    }

    /*
      한 주기 2초: 0~1.1초 당기고, 1.1~1.35초 놓아 튕기고, 나머지는 쉰다.
      ⚠ **쉬는 구간을 둔다.** 끊임없이 움직이면 조준 중인 사용자의 시선을 계속 빼앗는다.
    */
    const cycle = view.tutorialT % 2
    const pullAt = 34

    if (cycle < 1.1) {
      const t = kit.easeOutCubic(cycle / 1.1)
      const d = pullAt * t
      paintPullBand(c, START.x, START.y, 0, -1, d)
      // 당기는 손 — 손잡이 아래에 반투명 원으로 표시한다.
      c.save()
      c.globalAlpha = 0.25
      c.fillStyle = p.svc.stats
      c.beginPath()
      c.arc(START.x, START.y + d, 13, 0, Math.PI * 2)
      c.fill()
      c.restore()
      kit.text(c, label, START.x, labelY, {
        size: 12,
        weight: 700,
        align: 'center',
        color: p.textMuted,
        alpha: 0.9,
      })
      return
    }

    if (cycle < 1.35) {
      // 놓았다 — 위로 뻗는 선이 한 번 번쩍인다.
      const t = (cycle - 1.1) / 0.25
      c.save()
      c.globalAlpha = 0.8 * (1 - t)
      c.strokeStyle = p.svc.stats
      c.lineWidth = 4
      c.lineCap = 'round'
      c.beginPath()
      c.moveTo(START.x, START.y - STONE_R)
      c.lineTo(START.x, START.y - STONE_R - 40 * t)
      c.stroke()
      c.restore()
    }
  }

  /**
   * ★ 남은 기회 (2026-09-17 신설).
   *
   * ⚠ 계약이 *"기회 제한이 있는 게임은 캔버스 상단에 직접 그린다"* 고 하지만 이 게임의
   *   상단에는 자리가 없다(아웃 라인 바로 아래가 보드다). 보드와 스톤 **사이**는 시선이
   *   반드시 지나는 길이라 오히려 눈에 잘 들어온다.
   * ⚠ **색만으로 전하지 않는다.** 남은 기회는 **채운 원**, 쓴 기회는 **빈 원**이다 — 모양이
   *   다르므로 색각 이상이 있어도, 흑백으로 인쇄해도 읽힌다.
   */
  function paintAttempts(c: CanvasRenderingContext2D, left: number) {
    const dotR = 4
    const gap = 17
    const total = MAX_ATTEMPTS
    const width = (total - 1) * gap
    const startX = ATTEMPT_ROW.x + ATTEMPT_ROW.w - width - dotR
    const y = ATTEMPT_ROW.y

    kit.text(c, '남은 기회', ATTEMPT_ROW.x, y, {
      size: 11,
      weight: 700,
      align: 'left',
      color: p.textMuted,
    })

    c.save()
    for (let i = 0; i < total; i += 1) {
      const x = startX + i * gap
      c.beginPath()
      c.arc(x, y, dotR, 0, Math.PI * 2)
      if (i < left) {
        c.globalAlpha = 0.95
        c.fillStyle = p.svc.stats
        c.fill()
      } else {
        c.globalAlpha = 0.5
        c.strokeStyle = p.textMuted
        c.lineWidth = 1.5
        c.stroke()
      }
    }
    c.restore()
  }

  /** 세로 파워 바 + 보드 도달 구간 눈금. */
  function paintPowerBar(c: CanvasRenderingContext2D, pull: number) {
    const { x, y, w, h } = POWER_BAR
    const ratio = kit.clamp(pull / PULL_MAX, 0, 1)

    c.save()
    kit.roundRect(c, x, y, w, h, w / 2)
    c.fillStyle = p.surface2
    c.fill()
    c.lineWidth = 1
    c.strokeStyle = p.border
    c.stroke()

    // 아래에서 위로 찬다 — 세게 칠수록 멀리 간다는 방향 감각과 화면 방향을 일치시킨다.
    if (ratio > 0) {
      const fh = Math.max(w, h * ratio)
      kit.roundRect(c, x, y + h - fh, w, fh, w / 2)
      c.fillStyle = p.svc.stats
      c.fill()
    }

    // 보드에 드는 구간 눈금.
    c.strokeStyle = p.text
    c.globalAlpha = 0.55
    c.lineWidth = 1.5
    for (const mark of [BOARD_PULL_LO, BOARD_PULL_HI]) {
      const my = y + h - h * (mark / PULL_MAX)
      c.beginPath()
      c.moveTo(x - 4, my)
      c.lineTo(x + w + 4, my)
      c.stroke()
    }
    c.restore()

    kit.text(c, '세기', x + w / 2, y - 12, {
      size: 11,
      weight: 700,
      color: p.textMuted,
    })
  }

  /**
   * 칸이 뒤집히는 연출 — 번호 또는 꽝.
   *
   * ⚠ `reducedMotion` 이면 **솟아오르지 않고 페이드**한다(계약의 넷 중 하나). 물리와 이동은
   *   그대로 두되 이런 연출만 바꾼다.
   */
  function paintReveal(c: CanvasRenderingContext2D, reveal: RevealView) {
    const center = cellCenter(reveal.row, reveal.col)
    const t = kit.clamp(reveal.t, 0, 1)
    const pulse = Math.sin(Math.PI * t)
    /* 꽝은 성과가 아니므로 강조색을 쓰지 않는다. 같은 색으로 빛나면 얻은 줄 안다. */
    const accent = reveal.value === null ? p.danger : p.svc.stats

    c.save()
    const cx = BOARD.left + reveal.col * BOARD.cellW
    const cy = BOARD.top + reveal.row * BOARD.cellH
    c.globalAlpha = 0.18 + 0.3 * pulse
    c.fillStyle = accent
    c.fillRect(cx, cy, BOARD.cellW, BOARD.cellH)
    c.globalAlpha = 0.55 + 0.45 * pulse
    c.lineWidth = 2
    c.strokeStyle = accent
    c.strokeRect(cx + 1, cy + 1, BOARD.cellW - 2, BOARD.cellH - 2)
    c.restore()

    if (ctx.reducedMotion) {
      const alpha = kit.clamp(t * 3, 0, 1)
      if (reveal.value === null) {
        c.save()
        c.globalAlpha = alpha
        paintBlankCell(c, center.x, center.y)
        c.restore()
      } else {
        kit.ball(c, center.x, center.y, BALL_R, reveal.value, { alpha })
      }
      return
    }

    /*
      ⚠ 솟는 높이와 커지는 정도를 **칸 크기에 매어 둔다.** 고정값을 쓰면 무대나 칸 높이를
        바꿨을 때 볼이 두 칸 위로 튀어 올라 어느 칸에서 나온 것인지 알 수 없게 된다.
    */
    const lift = BOARD.cellH * 0.8 * pulse
    const r = BALL_R * (1 + 0.7 * pulse)
    kit.softShadow(c, center.x, center.y + 9, r * 0.8, r * 0.34, 0.18 * (1 - pulse * 0.5))

    if (reveal.value === null) {
      /*
        꽝은 볼이 아니라 **글자**로 키운다. 볼 모양으로 솟아오르면 그 실루엣만으로 번호를
        얻은 줄 알고, 글자를 읽고 나서야 아니라는 것을 안다 — 그 반 초가 불쾌하다.
      */
      c.save()
      c.globalAlpha = 0.9
      c.fillStyle = p.surface2
      c.beginPath()
      c.arc(center.x, center.y - lift, r, 0, Math.PI * 2)
      c.fill()
      c.lineWidth = 2
      c.strokeStyle = p.danger
      c.globalAlpha = 0.7
      c.beginPath()
      c.arc(center.x, center.y - lift, r - 1, 0, Math.PI * 2)
      c.stroke()
      c.restore()
      kit.text(c, '꽝', center.x, center.y - lift, {
        size: r * 1.1,
        weight: 700,
        align: 'center',
        color: p.danger,
      })
      return
    }

    kit.ball(c, center.x, center.y - lift, r, reveal.value, { ring: p.svc.stats })
  }

  /**
   * 헛투구 — 멈춘 자리에 ✕.
   *
   * ⚠ **선에 걸친 경우에는 "여기까지 들어왔어야 한다" 를 함께 그린다.** 예상 궤적은 보드
   *   진입 전까지만 그리므로, 이것이 없으면 사용자에게는 아무 근거 없이 실패한 것이 되어
   *   다음 투구를 조절할 방법이 없다 — 실력이 아니라 순전히 운이 된다. 걸친 칸의 판정
   *   영역과 스톤이 실제로 선 자리를 함께 보여 주면 **어느 쪽으로 얼마나** 어긋났는지가
   *   한눈에 읽힌다.
   */
  function paintMissMark(
    c: CanvasRenderingContext2D,
    at: { x: number; y: number },
    t: number,
    cell: { row: number; col: number } | null,
  ) {
    const fade = 1 - kit.clamp(t, 0, 1)
    const s = 9

    if (cell !== null) {
      const left = BOARD.left + cell.col * BOARD.cellW
      const top = BOARD.top + cell.row * BOARD.cellH
      c.save()
      // 걸친 칸 전체 — 어느 칸을 노린 것이었는지.
      c.globalAlpha = 0.5 * fade
      c.strokeStyle = p.danger
      c.lineWidth = 2
      c.strokeRect(left + 1, top + 1, BOARD.cellW - 2, BOARD.cellH - 2)
      // 판정 영역 — 여기 안에 멈췄어야 했다.
      c.globalAlpha = 0.85 * fade
      c.setLineDash([3, 3])
      c.strokeStyle = p.svc.stats
      c.lineWidth = 1.5
      c.strokeRect(
        left + HIT_MARGIN_X,
        top + HIT_MARGIN_Y,
        BOARD.cellW - HIT_MARGIN_X * 2,
        BOARD.cellH - HIT_MARGIN_Y * 2,
      )
      c.restore()
    }

    c.save()
    c.globalAlpha = 0.35 * fade
    c.fillStyle = p.danger
    c.beginPath()
    c.arc(at.x, at.y, STONE_R + 4, 0, Math.PI * 2)
    c.fill()
    c.globalAlpha = 0.95 * fade
    c.strokeStyle = p.danger
    c.lineWidth = 3.5
    c.lineCap = 'round'
    c.beginPath()
    c.moveTo(at.x - s, at.y - s)
    c.lineTo(at.x + s, at.y + s)
    c.moveTo(at.x + s, at.y - s)
    c.lineTo(at.x - s, at.y + s)
    c.stroke()
    c.restore()
  }

  const renderer: Renderer = {
    burst(x, y, kind) {
      /*
        ⚠ 세 가지를 색과 양으로 가른다 — 획득은 강조색으로 크게, 벽은 얼음색으로 작게,
          장애물은 그 중간이다. 같은 색으로 터뜨리면 무엇이 일어났는지 눈으로 구분되지 않는다.
      */
      if (kind === 'award') particles.burst(x, y, 18, p.svc.stats, 120)
      else if (kind === 'peg') particles.burst(x, y, 10, p.textMuted, 90)
      else particles.burst(x, y, 8, p.info, 70)
    },

    update(dt) {
      particles.update(dt)
    },

    draw(c, view, alpha, timeMs) {
      if (timeMs - paletteAt > 1000) {
        p = readPalette()
        paletteAt = timeMs
        const next = paletteFingerprint(p)
        if (next !== paletteKey) {
          paletteKey = next
          paletteRev += 1
        }
      }
      const scale = readScale(c)

      // ① 배경 — 배율과 팔레트가 그대로면 다시 그리지 않는다.
      const bgKey = `${scale}|${paletteRev}`
      if (bgLayer.key !== bgKey) {
        const g = prepare(bgLayer, STAGE.width, STAGE.height, scale)
        if (g !== null) {
          paintBackground(g)
          bgLayer.key = bgKey
        }
      }
      if (bgLayer.canvas !== null) {
        c.drawImage(bgLayer.canvas, 0, 0, STAGE.width, STAGE.height)
      }

      /*
        흔들림은 배경까지 흔들리면 화면이 통째로 흔들려 어지럽다. 배경을 먼저 깔고 **그 위
        요소들만** 흔든다. `reducedMotion` 이면 게임이 `shake` 를 0 으로 준다.
      */
      c.save()
      if (view.shake > 0) {
        const s = view.shake
        c.translate(Math.sin(timeMs / 24) * s, Math.cos(timeMs / 19) * s * 0.6)
      }

      /*
        ② 스톤이 지나간 자국은 **45칸보다 먼저** 그린다.
        ⚠ 순서를 뒤집으면 보드를 가로지른 자국이 볼 위를 덮어 숫자가 흐려진다. 자국은 얼음에
          눌린 흔적이라 판 위에 있는 볼보다 아래에 있는 것이 물리적으로도 맞다.
      */
      paintTrail(c, view.trail)

      /*
        ③ 45칸 — 뒤집힌 칸 수가 바뀔 때만 다시 그린다.
        ⚠ 키에 **뒤집힌 칸 수**(얻은 것 + 꽝)를 쓴다. 획득 수만 세면 꽝이 하나 열려도 캐시가
          그대로라 **화면에 꽝이 나타나지 않는다.**
      */
      let flipped = 0
      for (const cell of view.cells) if (cell.kind !== 'hidden') flipped += 1
      const revealKey = view.reveal === null ? '-' : `${view.reveal.row},${view.reveal.col}`
      const ballKey = `${scale}|${flipped}|${revealKey}|${paletteRev}`
      if (ballLayer.key !== ballKey) {
        const g = prepare(ballLayer, BOARD.width, BOARD.height, scale)
        if (g !== null) {
          paintCells(g, view)
          ballLayer.key = ballKey
        }
      }
      if (ballLayer.canvas !== null) {
        c.drawImage(ballLayer.canvas, BOARD.left, BOARD.top, BOARD.width, BOARD.height)
      }

      // ④ 남은 기회. 판이 끝난 뒤에도 그대로 둔다 — 몇 번 만에 끝냈는지가 결과의 일부다.
      paintAttempts(c, view.attemptsLeft)

      // ⑤ 스톤. 계약대로 위치를 보간해 그린다.
      const sx = kit.lerp(view.stone.px, view.stone.x, alpha)
      const sy = kit.lerp(view.stone.py, view.stone.y, alpha)

      /*
        ⚠ 공개 연출 중에는 스톤을 그리지 않는다. 스톤이 멈춘 칸 바로 위에서 볼이 솟아오르는데
          그 아래 스톤이 남아 있으면 무엇을 얻었는지가 가려진다.
      */
      if (view.phase !== 'reveal') {
        const heading = view.phase === 'slide' ? Math.atan2(view.stone.vx, -view.stone.vy) : view.angle
        paintStone(c, sx, sy, heading)
      }

      if (view.reveal !== null) paintReveal(c, view.reveal)
      if (view.missAt !== null) paintMissMark(c, view.missAt, view.missT, view.missCell)

      // ⑥ 조준 보조는 조준할 때만. 미끄러지는 중에 궤적선이 남아 있으면 결과를 오해한다.
      if (view.phase === 'aim') {
        paintAim(c, view)
        paintPowerBar(c, view.pull)
        /*
          ⚠ 시연은 **맨 마지막에** 그린다. 조준선·파워 바 아래에 깔리면 손 모양이 선에 가려
            무엇을 흉내 내는지 알 수 없다 — "무슨 일이 났는지 알리는 연출은 맨 마지막에"
            (log 2026-09-10, G01 이 겪은 것과 같은 이유).
          ⚠ 드래그 중에는 그리지 않는다. 이미 손을 대고 있는 사람에게 손을 흔들 이유가 없고,
            진짜 고무줄과 시연 고무줄이 겹쳐 둘 다 읽히지 않는다.
        */
        if (view.showTutorial && !view.dragging) paintTutorial(c, view)
      }

      particles.draw(c)
      c.restore()
    },

    destroy() {
      particles.clear()
      /*
        ⚠ 캔버스 버퍼를 명시적으로 0 으로 줄여 놓는다. 재시작 때마다 인스턴스가 새로 생기는데
          옛 레이어가 GC 될 때까지 큰 버퍼 두 장이 살아 있으면 저사양 기기에서 눈에 띈다.
      */
      for (const layer of [bgLayer, ballLayer]) {
        if (layer.canvas !== null) {
          layer.canvas.width = 0
          layer.canvas.height = 0
        }
        layer.canvas = null
        layer.ctx = null
        layer.key = ''
      }
    },
  }

  return renderer
}
