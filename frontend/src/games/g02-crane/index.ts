import { GAMES } from '@/games/core/catalog'
import type {
  GameContext,
  GameInput,
  GameInstance,
  GameModule,
  GamePhase,
  ParticleField,
} from '@/games/core/types'

import {
  ANIMALS,
  drawAnimalBall,
  drawAttempts,
  drawBlank,
  drawButton,
  drawLamps,
  drawMagnet,
  paintBackdrop,
} from './art'
import {
  ASCEND_SPEED,
  BALL_COUNT,
  BALL_R,
  BLANK_COUNT,
  BLANK_POOL,
  BUTTON_CX,
  BUTTON_CY,
  BUTTON_R,
  CARRY_SPEED,
  CHUTE_CX,
  DESCEND_FLOOR_Y,
  DESCEND_SPEED,
  FALL_SPEED,
  GLASS_B,
  GLASS_T,
  GRAB_OFFSET,
  GRAB_TOUCH,
  GRAB_WINDOW,
  MAG_HOME_Y,
  MAG_MAX_X,
  MAG_MIN_X,
  MAG_SPEED,
  MAX_ATTEMPTS,
  MIN_GAP,
  PILE_L,
  PILE_R,
  RELAX_ITERATIONS,
  RELAX_PULL,
  ROW_Y,
  SLIP_Y_FAR,
  SLIP_Y_NEAR,
  STAGE_H,
  STAGE_W,
  TRAY_Y,
  slotX,
} from './layout'

/**
 * G02 · 크레인 뽑기.
 *
 * → 사양서: docs/wiki/20-design/game-g02-crane.md
 * → 계약:   docs/wiki/10-contracts/playground-game-contract.md
 *
 * 좌우로 오가는 집게를 눌러 멈추고, 한 번 더 눌러 내려 **동물 볼**을 집는다.
 * 배출구에 넣으면 볼이 깨지며 **그때 번호가 나온다.**
 *
 * ── ★ 이 게임의 단 하나의 약속 ─────────────────────────────────────
 * **판정은 전부 거리로 결정된다. 확률이 한 줄도 없다.** 떨어뜨리는 것조차 "가운데를
 * 벗어났다" 는 결정론적 결과다. 실제 인형뽑기의 집게 힘 조작은 사행성 규제 대상이고,
 * 사용자가 "조작당했다" 고 느끼는 첫 번째 이유다. 로또 사이트에서 그 정서를 건드리면
 * 서비스 전체의 신뢰를 잃는다.
 * 그래서 **조준선을 항상 그린다** — 어디를 겨누는지 보이지 않으면 정직한 판정도 조작으로
 * 읽힌다.
 *
 * ── 은닉형이라는 것의 의미 (2026-09-08 개편) ───────────────────────
 * 볼에는 번호가 없다. 동물 얼굴만 있다. 번호는 **깨지는 순간** `pool.awardHidden()` 이
 * 정한다. 사용자에게 사전 정보가 없으므로 남은 풀에서 뽑아도 모순이 없고,
 * **중복이 구조적으로 불가능하다**(계약 "세 유형" 표).
 */

const meta = GAMES.find((g) => g.slug === 'crane')
if (meta === undefined) {
  // catalog 와 폴더가 어긋난 상태다. 조용히 넘어가면 원인을 찾기 어렵다.
  throw new Error("catalog.ts 에 'crane' 항목이 없습니다")
}

/**
 * 한 판의 진행 단계.
 *
 * `ready → swing → aimed → descend → close → ascend →`
 * `(carry → open → fall → crack | slip | miss) → swing … → over | done`
 */
type Step =
  | 'ready'
  | 'swing'
  | 'aimed'
  | 'descend'
  | 'magnetize'
  | 'ascend'
  | 'slip'
  | 'carry'
  | 'release'
  | 'fall'
  | 'crack'
  | 'over'
  | 'done'

/** 집었을 때의 품질. `loose` 는 올라가다 놓친다. */
type Grip = 'firm' | 'loose'

interface Ball {
  /** `ANIMALS` 인덱스. **번호가 아니다** — 번호는 깨질 때 처음 정해진다. */
  kind: number
  slot: number
  x: number
  y: number
  /** 렌더 보간용 직전 위치. */
  px: number
  py: number
  /** 이 볼이 쉬어야 할 높이(줄 높이 + 지터). */
  baseY: number
  vy: number
  falling: boolean
  /** 착지 순간의 찌그러짐. 0 이면 원형. */
  squash: number
  /**
   * 이 볼은 꽝인가. **볼을 만들 때 정해진다** — 집는 순간 굴리지 않는다.
   * ⚠ 겉모습은 보통 볼과 **완전히 같다.** 구분되면 집기 전에 알게 되어 재미가 사라진다.
   */
  blank: boolean
}

const HINT_START = '빨간 버튼을 눌러 시작하세요'
const HINT_STOP = '원하는 볼 위에서 멈추세요'
const HINT_DROP = '한 번 더 눌러 자석을 내립니다'
const HINT_DOWN = '자석이 내려갑니다'
const HINT_HOLD = '붙었어요!'
const HINT_SLIP = '가운데를 살짝 벗어났어요'
const HINT_MISS = '빗나갔어요. 다시 해볼까요?'
const HINT_BLANK = '꽝이에요! 다시 해볼까요?'

/** 자석이 붙는 데 걸리는 시간(초). 붙는 순간을 눈으로 확인할 수 있어야 한다. */
const MAGNETIZE_TIME = 0.2
/** 자력을 끊는 시간. 붙을 때보다 짧아야 "탁 놓았다" 로 읽힌다. */
const RELEASE_TIME = 0.14
/** 깨짐과 번호 공개. `primary` 를 누르면 즉시 건너뛴다. */
const CRACK_TIME = 1.0
/**
 * 꽝은 **더 길게** 머문다.
 * ⚠ 같은 길이면 "무슨 일이 났는지" 를 읽기 전에 사라진다. 소득이 없는 결과일수록 왜
 *   그런지 보여 줘야 납득한다(G01 의 "꽝인지 뭔지 확인이 안 돼" 와 같은 교훈).
 */
const BLANK_TIME = 1.4
const MISS_TIME = 0.5
/** 새 볼의 낙하 가속(px/s²). */
const REFILL_GRAVITY = 900
/** 버튼 눌림 애니메이션 길이(초). */
const PRESS_TIME = 0.12

const game: GameModule = {
  meta,
  create(ctx: GameContext): GameInstance {
    const { draw: kit, palette, pool, rng, emit } = ctx

    /* ── 상태 ────────────────────────────────────────────── */

    const balls: Ball[] = []
    /** 집게에 들려 있는 볼. 더미 배열 밖에 두어 완화·집기 판정에서 자동으로 빠진다. */
    let carried: Ball | null = null
    let grip: Grip = 'firm'

    let step: Step = 'ready'
    let stepT = 0

    let magX = (MAG_MIN_X + MAG_MAX_X) / 2
    let magY = MAG_HOME_Y
    let prevClawX = magX
    let prevClawY = magY
    let magDir: 1 | -1 = 1
    /** 0 = 열림, 1 = 닫힘. */
    let power = 0
    let prevPower = 0

    /**
     * 하강 시작 순간에 확정한 목표.
     *
     * ⚠ 내려가는 도중에 다시 판정하지 않는다. 더미가 미세하게 흔들려 목표가 바뀌면
     *   사용자에게는 "조준한 것과 다른 게 집혔다" 로 보인다.
     */
    let target: Ball | null = null
    let descendStopY = DESCEND_FLOOR_Y
    /**
     * 이번 시도에서 볼이 손을 떠나는 높이. **빗나간 정도에 따라 달라진다.**
     * 창 밖으로 물었을 때만 쓴다(`grip === 'loose'`).
     */
    let slipY = SLIP_Y_FAR

    let attempts = 0
    /** 화면 흔들림 남은 시간. `reducedMotion` 이면 영영 0 이다. */
    let shake = 0
    /** 깨진 뒤 공개할 번호. `0` 이면 표시하지 않는다. */
    let revealValue = 0
    /** 이번에 깨진 것이 꽝이었는가. 번호 공개 대신 꽝 연출을 그린다. */
    let revealBlank = false
    /** 버튼 눌림 애니메이션 남은 시간. */
    let pressT = 0

    let lastHint = ''
    let lastPhase: GamePhase | null = null
    let started = false

    const particles: ParticleField = kit.particles(ctx.quality.level === 'low' ? 40 : 120)

    /** 리필 자리 탐색용. **루프 안에서 새로 만들지 않으려고** 하나를 재사용한다. */
    const usedSlots = new Set<number>()

    /*
      ★ 꽝 봉투 — **확률을 굴리지 않는다.**
      `BLANK_POOL` 장짜리 봉투에 꽝 `BLANK_COUNT` 장을 넣고 섞어, 볼을 만들 때마다 한 장씩
      꺼낸다. 그래서 한 판의 꽝 수에 **상한이 있고**, 연달아 터지는 일이 구조적으로 드물다.
      확률을 굴리면 운 나쁜 판에서 꽝만 다섯 번 나올 수 있고, 그것이 정확히
      [[0014-number-playground]] 가 막으려던 "조작당했다" 는 정서다.
      → G01 의 "12발에 꽝 두 장을 넣은 봉투" 와 같은 방식이다.
    */
    let blanksLeft = BLANK_COUNT
    let envelopeLeft = BLANK_POOL

    /** 봉투에서 한 장 꺼낸다. 남은 장수에 비례해 뽑으므로 총량이 보장된다. */
    function drawBlankCard(): boolean {
      if (blanksLeft <= 0) return false
      if (envelopeLeft <= 0) return false
      const isBlank = rng.next() < blanksLeft / envelopeLeft
      envelopeLeft -= 1
      if (isBlank) blanksLeft -= 1
      return isBlank
    }

    /* ── 배경 캐시 ───────────────────────────────────────── */

    let backdrop: HTMLCanvasElement | null = null
    /** 캐시를 구울 때 쓴 배율. 화면이 바뀌면(리사이즈·창 이동) 달라진다. */
    let backdropScale = 0
    /** 마지막으로 구운 시각(ms). 주기적으로 다시 구워 테마 전환을 흡수한다. */
    let backdropAtMs = -1
    /**
     * 배경 굽기를 이미 시도했는가.
     *
     * ⚠ 이 플래그가 없으면 오프스크린을 못 만드는 환경에서 **매 프레임 캔버스를 새로
     *   만들고 버린다.** 실패는 캐시되지 않으므로 `backdrop === null` 조건만으로는 재시도가
     *   영원히 반복된다. 실패한 환경일수록 그 비용을 감당할 수 없다.
     */
    let backdropTried = false

    /** 캐시를 다시 구울 주기(ms). 계약이 정한 1~2초 범위. */
    const BACKDROP_REFRESH_MS = 1500

    /**
     * 정적 배경을 오프스크린에 구워 둔다(계약 시각 언어 규칙 1).
     *
     * ⚠ **배율을 고정하지 않는다.** 논리 크기(360×430)로 구우면 고배율 화면에서 배경만
     *   흐리게 뭉갠다. 그렇다고 화면 배율을 직접 읽는 것은 계약이 금지한다 — 여섯 세션이
     *   각자 DPR 을 다루면 그중 하나는 반드시 흐려지기 때문이다.
     *   **호스트가 걸어 둔 변환행렬을 읽으면 된다.** 게임이 배율을 정하는 것이 아니라
     *   호스트가 정한 것을 받아 쓰는 것이라 금지 취지에 어긋나지 않는다.
     *   → 계약 "오프스크린 캐시의 배율 — `getTransform()` 을 읽는다"
     *
     * ⚠ **캐시 무효화 신호에 팔레트를 넣을 수 없다.** `ctx.palette` 는 `create()` 시점의
     *   스냅샷이라 테마가 바뀌어도 그 객체는 변하지 않는다. 그래서 주기적으로 다시 굽는다 —
     *   `DrawKit` 으로 그린 부분(비네트·그림자)은 그때 최신 팔레트를 따라온다.
     */
    function buildBackdrop(scale: number, timeMs: number): void {
      backdropTried = true
      backdropScale = scale
      backdropAtMs = timeMs
      if (typeof document === 'undefined') {
        backdrop = null
        return
      }
      /** ⚠ 캔버스를 재사용한다. 1.5초마다 새로 만들면 그것만으로 GC 를 부른다. */
      const cv = backdrop ?? document.createElement('canvas')
      const w = Math.round(STAGE_W * scale)
      const h = Math.round(STAGE_H * scale)
      if (cv.width !== w || cv.height !== h) {
        cv.width = w
        cv.height = h
      }
      const cc = cv.getContext('2d')
      if (cc === null) {
        backdrop = null
        return
      }
      cc.setTransform(scale, 0, 0, scale, 0, 0)
      paintBackdrop(cc, kit, palette)
      backdrop = cv
    }

    /** 호스트가 건 변환행렬에서 배율을 읽는다. 구형 사파리 방어 포함. */
    function readScale(c: CanvasRenderingContext2D): number {
      if (typeof c.getTransform !== 'function') return 1
      const m = c.getTransform()
      return m.a > 0 ? m.a : 1
    }

    /* ── 볼 ──────────────────────────────────────────────── */

    function makeBall(slot: number, falling: boolean): Ball {
      const baseY = ROW_Y + rng.range(-2, 2)
      const y = falling ? GLASS_T + 26 : baseY
      return {
        /** ⚠ 동물은 rng 로 고른다. 번호와 아무 관계가 없다 — 얼굴이 번호를 암시하면 안 된다. */
        kind: rng.int(0, ANIMALS.length - 1),
        slot,
        x: slotX(slot),
        y,
        px: slotX(slot),
        py: y,
        baseY,
        vy: 0,
        falling,
        squash: 0,
        blank: drawBlankCard(),
      }
    }

    for (let i = 0; i < BALL_COUNT; i += 1) balls.push(makeBall(i, false))

    /** 집힌 자리에 새 볼을 떨어뜨린다. 항상 여섯 개를 유지한다. */
    function refill(): void {
      usedSlots.clear()
      for (const b of balls) usedSlots.add(b.slot)
      for (let i = 0; i < BALL_COUNT; i += 1) {
        if (usedSlots.has(i)) continue
        balls.push(makeBall(i, true))
        return
      }
    }

    /**
     * 지금 집게 아래에서 가장 가까운 볼과 그 거리.
     *
     * 조준선 표시와 실제 집기가 **같은 함수**를 쓴다 — 두 벌로 나누면 언젠가 어긋나고,
     * 그 순간 화면이 거짓말을 한다.
     */
    function nearest(x: number): { ball: Ball; dist: number } | null {
      let best: Ball | null = null
      let dist = Infinity
      for (const b of balls) {
        // 공중에 뜬 새 볼은 집을 수 없다. 집히면 볼이 순간이동한 것처럼 보인다.
        if (b.falling) continue
        const d = Math.abs(x - b.x)
        if (d < dist) {
          dist = d
          best = b
        }
      }
      return best === null ? null : { ball: best, dist }
    }

    /* ── HUD 로 보내는 말 ────────────────────────────────── */

    /**
     * ⚠ 같은 문구를 반복해 보내지 않는다. 매 프레임 emit 하면 React 가 매번 렌더하고,
     *   `aria-live` 영역이 계속 갱신돼 스크린리더가 같은 말을 반복한다.
     */
    function setHint(text: string): void {
      if (text === lastHint) return
      lastHint = text
      emit({ type: 'hint', text })
    }

    /**
     * 진행 단계를 호스트에 알린다 — **버튼은 호스트가 그린다.**
     *
     * 캔버스에 그린 버튼은 보조기술에 완전히 투명하고, 페이지를 스크롤하거나 판을 다시
     * 만드는 일은 애초에 캔버스가 할 수 없다(계약의 `phase` 이벤트).
     */
    function setPhase(phase: GamePhase, title?: string, text?: string): void {
      if (phase === lastPhase) return
      lastPhase = phase
      emit({ type: 'phase', phase, title, text })
    }

    /* ── 단계 전환 ───────────────────────────────────────── */

    function startGame(): void {
      step = 'swing'
      stepT = 0
      setPhase('playing')
      setHint(HINT_STOP)
    }

    function startDescend(): void {
      const near = nearest(magX)
      if (near !== null && near.dist <= GRAB_TOUCH) {
        target = near.ball
        /*
          ★ 판정은 여기 한 줄이 전부다. 확률이 없다.
            창 안이면 집고, 닿기는 했지만 벗어났으면 올라가다 놓친다.
        */
        grip = near.dist <= GRAB_WINDOW ? 'firm' : 'loose'
        descendStopY = target.y - GRAB_OFFSET
        /*
          놓칠 때 **얼마나 빗나갔는지가 높이로 보인다.** 창 바로 밖이면 거의 다 올라간 뒤에
          떨어지고, 가장자리를 겨우 걸쳤으면 조금 올라가다 만다. 같은 실패라도 "거의 될
          뻔했다" 와 "많이 빗나갔다" 가 구분되어야 다음 시도를 어떻게 고칠지 알 수 있다.
        */
        const over = (near.dist - GRAB_WINDOW) / Math.max(0.001, GRAB_TOUCH - GRAB_WINDOW)
        slipY = kit.lerp(SLIP_Y_NEAR, SLIP_Y_FAR, kit.clamp(over, 0, 1))
      } else {
        target = null
        descendStopY = DESCEND_FLOOR_Y
      }
      step = 'descend'
      stepT = 0
      setHint(HINT_DOWN)
      /*
        ⚠ **결과를 기다리지 않고 먼저** 울린다(계약: 효과음 규칙). 집히는지 확인한 뒤에
          소리를 내면 손끝과 귀가 어긋나 조작이 굼떠 보인다.
        크레인에서 `shoot` 에 해당하는 능동적 행동은 "멈춤" 이 아니라 **"내림"** 이다 —
          멈추는 것은 조준일 뿐 아직 아무것도 시작되지 않았다.
      */
      emit({ type: 'sfx', name: 'shoot' })

      attempts += 1
      /** 빗나가도 기회는 소모된다 — 그래야 9번이라는 숫자에 의미가 생긴다. */
      emit({ type: 'attempt', used: attempts, total: MAX_ATTEMPTS })
      /*
        ⚠ 남은 기회를 **말로도 알린다**(계약 "남은 기회는 캔버스 안에도 그린다").
          유리창 안 띠에 그린 숫자는 보조기술에 완전히 투명하고, 호스트 HUD 는 아직
          `attempt` 를 쓰지 않는다(`GameCanvas` 가 조용히 버린다). 화면을 보지 않는
          사용자에게는 이 한 줄이 남은 기회를 아는 유일한 통로다.
        ⚠ 보내는 자리가 **내리는 순간**인 것이 중요하다. 획득 `status` 는 호스트가 볼이
          깨질 때 보내므로 1초 이상 뒤다 — 같은 `aria-live` 영역을 서로 덮어쓰지 않는다.
      */
      emit({ type: 'status', text: `남은 기회 ${MAX_ATTEMPTS - attempts}번` })
    }

    /** 자력이 최대가 된 순간. 붙었으면 더미에서 빼낸다. */
    function finishMagnetize(): void {
      power = 1
      if (target !== null) {
        const i = balls.indexOf(target)
        if (i >= 0) balls.splice(i, 1)
        carried = target
        target = null
        emit({ type: 'haptic', ms: 20 })
        setHint(grip === 'firm' ? HINT_HOLD : HINT_SLIP)
      }
      step = 'ascend'
      stepT = 0
    }

    /**
     * 놓친다 — 올라가는 도중에 손을 떠난다.
     *
     * ⚠ 빈손으로 올라오는 것과 **시각적으로 달라야** 한다. 그래야 "닿긴 했는데 가운데를
     *   못 맞췄구나" 를 배운다. 잡지도 못한 것과 잡았다 놓친 것이 같아 보이면 사용자는
     *   무엇을 고쳐야 할지 알 수 없다.
     */
    function slipNow(): void {
      const b = carried
      carried = null
      power = 0
      if (b !== null) {
        b.falling = true
        b.vy = 0
        b.px = b.x
        b.py = b.y
        balls.push(b)
      }
      step = 'slip'
      stepT = 0
      setHint(HINT_SLIP)
      emit({ type: 'sfx', name: 'miss' })
    }

    /** 볼이 받이에 닿은 순간. **여기가 번호가 처음 존재하는 지점이다.** */
    function crackNow(): void {
      const b = carried
      step = 'crack'
      stepT = 0
      if (b === null) return

      if (b.blank) {
        /*
          ★ 꽝. **번호를 뽑지 않는다** — `pool` 을 아예 건드리지 않으므로 풀이 줄지 않는다.
            시도(기회)만 소모된다.
          ⚠ 연출을 번호 공개보다 **크고 길게** 한다. G01 이 "꽝인지 뭔지 확인이 안 돼" 라는
            지적을 받고 먼저 겪은 교훈이다.
        */
        revealBlank = true
        revealValue = 0
        setHint(HINT_BLANK)
        emit({ type: 'sfx', name: 'blank' })
        emit({ type: 'haptic', ms: 20 })
        emit({ type: 'status', text: '꽝이 나왔습니다. 번호를 얻지 못했어요.' })
        if (!ctx.reducedMotion) {
          shake = 0.22
          particles.burst(CHUTE_CX, TRAY_Y, 16, palette.danger, 140)
        }
        refill()
        return
      }

      if (!ctx.reducedMotion) {
        shake = 0.16
        // 껍질 조각. 볼과 같은 색이라 "저게 깨졌다" 로 읽힌다.
        particles.burst(CHUTE_CX, TRAY_Y, 12, palette.svc[ANIMALS[b.kind % ANIMALS.length].svc], 120)
      }

      const res = pool.awardHidden()
      if (res.ok) {
        revealValue = res.value
        revealBlank = false
        emit({ type: 'haptic', ms: 40 })
        /*
          ⚠ **완주하는 한 개에는 `hit` 을 보내지 않는다**(계약: 효과음 규칙).
            곧 `clear` 팡파르가 울리는데 겹치면 서로 뭉개지고, 마지막 한 개는 어차피
            팡파르가 말해 준다.
        */
        if (!res.complete) emit({ type: 'sfx', name: 'hit' })
        if (!ctx.reducedMotion) particles.burst(CHUTE_CX, TRAY_Y, 14, palette.success, 130)
      }
      // 볼이 하나 빠졌으므로 채운다. 자석이 배출구에 있는 지금이라야 경로가 겹치지 않는다.
      refill()
    }

    /**
     * 한 번의 시도가 끝났다. 계속할지 끝낼지 여기서 정한다.
     *
     * ⚠ **끝 판정을 한 곳에 모은다.** 성공·실패·놓침 세 경로가 각자 판단하면 그중 하나는
     *   반드시 빠뜨려, 기회를 다 쓰고도 게임이 계속되거나 6개를 모으고도 안 끝난다.
     */
    function afterAttempt(): void {
      carried = null
      revealValue = 0
      revealBlank = false
      power = 0

      if (pool.complete) {
        step = 'done'
        stepT = 0
        setHint('')
        /*
          ⚠ 완료 문구는 **보내지 않는다.** 호스트 `defaultCopy` 가 채운다(계약 2026-09-16).
            2026-09-10 에는 "게임이 고정 문구를 보낸다" 였으나 **그 규약은 폐기됐다** —
            같은 문장을 여섯 곳에 복사해 두면 하나를 고칠 때 나머지 다섯이 남는다.
            완료 화면에는 **게임마다 달라야 할 것이 없다**(실패와 다른 점이다).
        */
        setPhase('cleared')
        emit({ type: 'sfx', name: 'clear' })
        return
      }
      if (attempts >= MAX_ATTEMPTS) {
        step = 'over'
        stepT = 0
        setHint('')
        /*
          ⚠ 실패는 **`text` 만** 덮는다(계약 2026-09-16). 제목은 호스트 기본값을 쓰고,
            게임이 채우는 것은 *게임마다 달라야 하는 것* 뿐이다 — 여기서는 **몇 개를
            모았는지**다. 계약이 예로 든 바로 그 항목이고, 9번을 다 쓴 사람에게 화면에
            남는 유일한 성과이기도 하다.
        */
        setPhase(
          'failed',
          undefined,
          `번호 ${pool.awarded.length}개를 모았습니다. 다시 도전해 보세요.`,
        )
        /*
          ⚠ 실패는 **말로도 알린다.** 획득은 호스트가 `pool` 콜백에서 `status` 를 보내 주지만
            (그래서 게임이 또 보내면 같은 영역을 덮어써 오히려 정보가 준다), *기회를 다 썼다*
            는 호스트가 알 수 없다. 오버레이는 `aria-live` 가 아니라 그냥 떠 있을 뿐이라
            화면을 보지 않는 사용자에게는 게임이 조용히 멈춘 것으로 느껴진다.
        */
        emit({
          type: 'status',
          text: `9번 기회를 모두 썼습니다. 번호 ${pool.awarded.length}개를 모았습니다.`,
        })
        emit({ type: 'sfx', name: 'fail' })
        return
      }
      step = 'swing'
      stepT = 0
      setHint(HINT_STOP)
    }

    /* ── 갱신 ────────────────────────────────────────────── */

    /**
     * 떨어지는 볼이 더미를 헤집는다.
     *
     * ⚠ **떨어지는 쪽은 밀리지 않는다.** 낙하 x 가 흔들리면 목표 슬롯을 벗어나고, 착지 후
     *   되돌아오느라 더미가 한참 출렁인다. 자리를 비켜 주는 것은 놓여 있는 쪽이다.
     */
    function partForFalling(): void {
      for (const f of balls) {
        if (!f.falling) continue
        for (const o of balls) {
          if (o === f || o.falling) continue
          const dy = Math.abs(o.y - f.y)
          if (dy >= MIN_GAP) continue
          const need = Math.sqrt(MIN_GAP * MIN_GAP - dy * dy)
          const dx = o.x - f.x
          const adx = Math.abs(dx)
          if (adx >= need) continue
          const dir = adx < 0.001 ? 1 : Math.sign(dx)
          o.x += dir * (need - adx)
        }
      }
    }

    /**
     * 더미 재정렬 — 1차원 완화.
     *
     * ⚠ **순서가 결과를 바꾼다.** 목표 x 로 당기는 것이 먼저고 겹침 해소가 나중이다.
     *   반대로 하면 방금 벌려 놓은 간격을 복귀가 곧바로 다시 좁힌다.
     */
    function relaxPile(dt: number): void {
      for (const b of balls) {
        if (b.falling) continue
        b.x = kit.approach(b.x, slotX(b.slot), RELAX_PULL * dt)
        b.x = kit.clamp(b.x, PILE_L, PILE_R)
      }

      let falling = false
      for (const b of balls) {
        if (b.falling) {
          falling = true
          break
        }
      }
      /** 떨어지는 볼이 있을 때만 밀림이 **연쇄**한다. 정상 상태에서는 세 번이면 남는다. */
      const iterations = falling ? RELAX_ITERATIONS * 9 : RELAX_ITERATIONS

      for (let iter = 0; iter < iterations; iter += 1) {
        for (let i = 0; i < balls.length; i += 1) {
          const a = balls[i]
          if (a.falling) continue
          for (let j = i + 1; j < balls.length; j += 1) {
            const b = balls[j]
            if (b.falling) continue
            const d = b.x - a.x
            const ad = Math.abs(d)
            if (ad >= MIN_GAP) continue
            const push = (MIN_GAP - ad) / 2
            // 완전히 겹쳤을 때(d = 0) 방향이 정해지지 않는다. 임의로 오른쪽을 잡는다.
            const dir = ad < 0.001 ? 1 : Math.sign(d)
            a.x -= dir * push
            b.x += dir * push
          }
        }
        partForFalling()
        /*
          ⚠ **매 반복 끝에 벽으로 되돌린다.** 밀림이 연쇄하면 끝 볼이 배치 범위 밖으로 밀려
            나가는데(실측 x=44.2, 한계 47), 그러면 벽에 막혀야 할 힘이 밖으로 새어 안쪽
            간격이 벌어지지 않는다. 벽을 지켜야 연쇄가 안쪽으로 전파된다.
        */
        for (const b of balls) {
          if (b.falling) continue
          b.x = kit.clamp(b.x, PILE_L, PILE_R)
        }
      }
    }

    function updateBalls(dt: number): void {
      for (const b of balls) {
        b.px = b.x
        b.py = b.y
        if (b.squash > 0) b.squash = Math.max(0, b.squash - dt * 4)
        /*
          ⚠ `falling`(아직 제자리에 닿지 않음)과 **움직이는 중**은 다르다. 한 번 닿은 뒤
            튀어 오르는 볼은 화면에 멀쩡히 보이므로 **집을 수 있어야 한다.** 예전에는 튐이
            끝날 때까지 `falling` 을 유지했는데, 그동안 그 볼을 겨눠도 집게가 무시해서
            "창 안을 맞췄는데 빈손" 이 나왔다 — 사용자에게는 조작으로 읽히는 바로 그 상황이다.
            (헤드리스 검증에서 아홉 번 중 한 번꼴로 재현됐다.)
        */
        const moving = b.falling || b.vy !== 0
        if (!moving) continue

        /*
          ⚠ 떨어지는 동안 **제자리를 찾아간다.**
            놓친 볼은 자석이 있던 x 에서 손을 떠나는데, 그 자리는 슬롯이 아니다. 수직으로만
            떨어뜨리면 이웃 바로 옆에 착지해 **볼끼리 파고든다**(실측 36.9px, 지름 42).
            착지 순간에 밀어내려 해도 벽 쪽 볼은 더 밀릴 데가 없어 풀리지 않는다.
            떨어지는 중에 미리 제 슬롯으로 돌아오면 그 상황 자체가 생기지 않는다.
        */
        if (b.falling) b.x = kit.approach(b.x, slotX(b.slot), 140 * dt)

        b.vy += REFILL_GRAVITY * dt
        b.y += b.vy * dt
        if (b.y < b.baseY) continue

        b.y = b.baseY
        /** 닿는 순간 **집을 수 있는 상태가 된다.** 남은 튐은 연출일 뿐이다. */
        b.falling = false
        /*
          한 번만 튄다. 반발 계수를 낮게 잡아 두 번째 튐이 곧바로 멈춤 조건에 걸린다 —
          플래그를 따로 두지 않아도 무한 바운스가 생기지 않는다.
          ⚠ 움직임 최소화에서는 튀지 않는다. 튐은 장식이지 게임의 본체가 아니다.
        */
        if (!ctx.reducedMotion && b.vy > 200) {
          b.vy = -b.vy * 0.26
          b.squash = 0.7
        } else {
          b.vy = 0
        }
      }
      relaxPile(dt)
    }

    function fixedUpdate(dt: number): void {
      if (!started) {
        started = true
        /*
          ⚠ `ready` 는 **첫 스텝에서** 보낸다. `create` 안에서 보내면 호스트가 아직 콜백을
            연결하기 전이라 오버레이가 뜨지 않는다.
        */
        emit({ type: 'attempt', used: 0, total: MAX_ATTEMPTS })

        /*
          ★ **이미 끝난 판으로 시작될 수 있다**(2026-09-10).
            호스트는 완주 기록이 남아 있으면 획득 번호를 `pool` 에 미리 채운 채로 게임을
            만든다. 그때 `ready` 를 보내면 이미 6개를 모은 사람에게 "시작" 버튼을 내밀게 되고,
            눌러도 더 모을 것이 없는 판이 돌아간다.
            시작하기 전에 풀을 확인하고 곧바로 완료 화면으로 간다.
            → 계약 "이미 끝난 판으로 시작될 때". **여섯 게임이 같게 한다.**
        */
        if (pool.complete) {
          step = 'done'
          /* ⚠ 완료 문구를 보내지 않는 이유는 `afterAttempt` 의 같은 자리에 적어 두었다. */
          setPhase('cleared')
          return
        }

        /*
          ⚠ `ready` 에는 문구를 **보내지 않는다.** 호스트가 게임 제목과 `tagline` 으로 채운다
            (`GameStage` 의 `defaultCopy`). 게임마다 따로 쓰면 여섯 개가 제각각이 된다.
        */
        setPhase('ready')
        setHint(HINT_START)
      }

      prevClawX = magX
      prevClawY = magY
      prevPower = power
      if (carried !== null) {
        carried.px = carried.x
        carried.py = carried.y
      }
      stepT += dt
      if (shake > 0) shake = Math.max(0, shake - dt)
      if (pressT > 0) pressT = Math.max(0, pressT - dt)

      switch (step) {
        case 'ready':
        case 'over':
        case 'done':
          /*
            멈춰 있지만 **화면은 계속 그린다.** 빈 캔버스에 버튼만 뜨면 무엇을 시작하는지,
            무엇이 끝났는지 알 수 없다.
          */
          break

        case 'swing': {
          magX += magDir * MAG_SPEED * dt
          /*
            핑퐁. 경계를 넘은 만큼 되접어야 프레임이 튀어도 왕복 폭이 줄지 않는다.
            단순히 경계에 붙이기만 하면 저사양 기기에서 집게가 끝에 눌어붙는다.
          */
          if (magX > MAG_MAX_X) {
            magX = MAG_MAX_X - (magX - MAG_MAX_X)
            magDir = -1
          } else if (magX < MAG_MIN_X) {
            magX = MAG_MIN_X + (MAG_MIN_X - magX)
            magDir = 1
          }
          break
        }

        case 'aimed':
          // 사용자의 두 번째 입력을 기다린다. 시간 제한을 두지 않는다.
          break

        case 'descend': {
          magY += DESCEND_SPEED * dt
          if (magY >= descendStopY) {
            magY = descendStopY
            step = 'magnetize'
            stepT = 0
          }
          break
        }

        case 'magnetize': {
          power = kit.clamp(stepT / MAGNETIZE_TIME, 0, 1)
          if (stepT >= MAGNETIZE_TIME) finishMagnetize()
          break
        }

        case 'ascend': {
          magY -= ASCEND_SPEED * dt
          if (carried !== null) {
            carried.x = magX
            carried.y = magY + GRAB_OFFSET
            /** 느슨하게 잡았으면 다 올라오기 전에 손을 떠난다. */
            if (grip === 'loose' && magY <= slipY) {
              slipNow()
              break
            }
          }
          if (magY <= MAG_HOME_Y) {
            magY = MAG_HOME_Y
            if (carried !== null) {
              carried.y = magY + GRAB_OFFSET
              step = 'carry'
            } else {
              step = 'slip'
              setHint(HINT_MISS)
              emit({ type: 'sfx', name: 'miss' })
            }
            stepT = 0
          }
          break
        }

        /** 놓쳤거나 빈손이다. 볼이 제자리로 떨어지는 동안 잠깐 기다린다. */
        case 'slip': {
          if (magY > MAG_HOME_Y) {
            magY = Math.max(MAG_HOME_Y, magY - ASCEND_SPEED * dt)
          } else if (stepT >= MISS_TIME) {
            afterAttempt()
          }
          break
        }

        case 'carry': {
          magX = kit.approach(magX, CHUTE_CX, CARRY_SPEED * dt)
          if (carried !== null) {
            carried.x = magX
            carried.y = magY + GRAB_OFFSET
          }
          if (magX === CHUTE_CX) {
            step = 'release'
            stepT = 0
          }
          break
        }

        case 'release': {
          power = kit.clamp(1 - stepT / RELEASE_TIME, 0, 1)
          if (stepT >= RELEASE_TIME) {
            power = 0
            step = 'fall'
            stepT = 0
          }
          break
        }

        case 'fall': {
          if (carried === null) {
            // 방어. 들고 있던 것이 사라졌다면 더 떨어뜨릴 것이 없다.
            afterAttempt()
            break
          }
          carried.y += FALL_SPEED * dt
          if (carried.y >= TRAY_Y) {
            carried.y = TRAY_Y
            crackNow()
          }
          break
        }

        case 'crack': {
          // 집게를 왕복 구간으로 돌려놓는다. 연출이 끝나자마자 순간이동하면 어색하다.
          magX = kit.approach(magX, MAG_MAX_X, CARRY_SPEED * dt)
          if (stepT >= (revealBlank ? BLANK_TIME : CRACK_TIME)) {
            magDir = -1
            afterAttempt()
          }
          break
        }
      }

      updateBalls(dt)
      if (!ctx.reducedMotion) particles.update(dt)
    }

    /* ── 입력 ────────────────────────────────────────────── */

    /**
     * `primary` 하나로 전부 조작한다.
     *
     * ⚠ 포인터 좌표를 쓰지 않는다. 캔버스 어디를 눌러도, 캔버스 위 오버레이 버튼을 눌러도,
     *   스페이스를 눌러도 **똑같이 동작한다.** 좌표를 요구하면 키보드로는 완주할 수 없다.
     * ⚠ 캔버스 안의 빨간 버튼은 **무엇을 눌러야 하는지 보여주는 장치**이지 히트 영역이
     *   아니다. 히트 영역을 버튼으로 좁히면 화면 아무 데나 누르던 사람이 갑자기 막힌다.
     */
    function handle(input: GameInput): void {
      if (input.kind !== 'action') return
      if (input.action !== 'primary' || input.phase !== 'down') return

      pressT = PRESS_TIME

      if (step === 'ready') {
        startGame()
        return
      }
      if (step === 'swing') {
        step = 'aimed'
        stepT = 0
        setHint(HINT_DROP)
        return
      }
      if (step === 'aimed') {
        startDescend()
        return
      }
      /*
        연출을 기다리는 두 단계에서는 누르면 건너뛴다. 여섯 개를 모으는 동안 같은 연출을
        여섯 번 보게 되므로, 두 번째부터는 기다림이 곧 답답함이 된다.
      */
      if (step === 'crack' || step === 'slip') afterAttempt()
    }

    /* ── 그리기 ──────────────────────────────────────────── */

    /**
     * 깨진 뒤의 결과 — 번호이거나 꽝이다.
     *
     * ⚠ **호출 순서가 곧 가독성이다.** 파티클·조준선보다 **맨 마지막에** 그린다. G01 이
     *   꽝을 파티클보다 먼저 그렸다가 연기와 십자선에 글자가 가려진 적이 있다.
     */
    function drawReveal(c: CanvasRenderingContext2D): void {
      if (step !== 'crack') return

      if (revealBlank) {
        drawBlank(
          c,
          kit,
          palette,
          CHUTE_CX,
          TRAY_Y,
          kit.clamp(stepT / BLANK_TIME, 0, 1),
          ctx.reducedMotion,
        )
        return
      }

      if (revealValue === 0) return
      const t = kit.clamp(stepT / CRACK_TIME, 0, 1)
      /*
        ⚠ 움직임 최소화에서는 **페이드로만** 알린다(계약의 네 가지 중 하나). 번호를 아예
          감추면 정보가 사라지므로 끄는 것이 아니라 바꾼다.
      */
      const rise = ctx.reducedMotion ? 0 : kit.easeOutCubic(t) * 42
      const grow = ctx.reducedMotion ? 1 : 0.6 + kit.easeOutCubic(Math.min(1, t * 3)) * 0.4
      const alpha = t < 0.2 ? t / 0.2 : 1 - kit.easeOutCubic((t - 0.2) / 0.8) * 0.9
      c.save()
      c.globalAlpha = kit.clamp(alpha, 0, 1)
      kit.ball(c, CHUTE_CX, TRAY_Y - 30 - rise, BALL_R * grow, revealValue)
      c.restore()
    }

    /** 버튼 라벨은 **다음에 할 일**이다. 상태를 설명하지 않는다. */
    function buttonLabel(): { label: string; enabled: boolean } {
      if (step === 'swing' || step === 'ready') return { label: '멈춤', enabled: step === 'swing' }
      if (step === 'aimed') return { label: '내림', enabled: true }
      return { label: '…', enabled: false }
    }

    function drawGame(c: CanvasRenderingContext2D, alpha: number, timeMs: number): void {
      /*
        배율이 달라졌거나(리사이즈·창 이동) 주기가 지났으면 다시 굽는다.
        실패한 환경에서는 한 번만 시도하고 그 뒤로는 매 프레임 직접 그린다.
      */
      const scale = readScale(c)
      if (
        !backdropTried ||
        Math.abs(scale - backdropScale) > 0.01 ||
        timeMs - backdropAtMs > BACKDROP_REFRESH_MS
      ) {
        buildBackdrop(scale, timeMs)
      }

      if (backdrop !== null) {
        c.drawImage(backdrop, 0, 0, STAGE_W, STAGE_H)
      } else {
        // 오프스크린을 만들지 못한 환경. 느리지만 화면이 비는 것보다는 낫다.
        paintBackdrop(c, kit, palette)
      }

      /*
        ⚠ 배경은 흔들지 않는다. 화면 전체를 밀면 가장자리가 비어 검은 띠가 생긴다.
          기계 내용물만 흔들면 "쿵" 하는 느낌은 그대로다.
      */
      const sx = shake > 0 ? Math.sin(shake * 90) * shake * 14 : 0
      const sy = shake > 0 ? Math.cos(shake * 74) * shake * 9 : 0
      c.save()
      c.translate(sx, sy)

      drawLamps(c, palette, timeMs, ctx.reducedMotion)

      const cx = kit.lerp(prevClawX, magX, alpha)
      const cy = kit.lerp(prevClawY, magY, alpha)

      for (const b of balls) {
        drawAnimalBall(
          c,
          kit,
          palette,
          kit.lerp(b.px, b.x, alpha),
          kit.lerp(b.py, b.y, alpha),
          b.kind,
          !b.falling,
          b.squash,
        )
      }

      if (carried !== null) {
        drawAnimalBall(
          c,
          kit,
          palette,
          kit.lerp(carried.px, carried.x, alpha),
          kit.lerp(carried.py, carried.y, alpha),
          carried.kind,
          false,
        )
      }

      drawMagnet(c, kit, palette, cx, cy, kit.lerp(prevPower, power, alpha), timeMs)

      if (!ctx.reducedMotion) particles.draw(c)
      drawReveal(c)

      const btn = buttonLabel()
      drawButton(c, kit, palette, btn.label, btn.enabled, pressT / PRESS_TIME)
      drawAttempts(c, kit, palette, attempts, MAX_ATTEMPTS)

      c.restore()
    }

    return {
      fixedUpdate,
      draw: drawGame,
      handle,
      destroy() {
        backdrop = null
        backdropTried = false
        backdropScale = 0
        backdropAtMs = -1
        particles.clear()
      },
    }
  },
}

export default game
