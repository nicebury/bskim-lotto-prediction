import { ballRange } from '@/lib/lotto'

import { GAMES } from '@/games/core/catalog'
import type {
  GameContext,
  GamePhase,
  GameInput,
  GameInstance,
  GameModule,
  ParticleField,
} from '@/games/core/types'

import {
  BALL_R,
  BIN_COUNT,
  BIN_FLOOR,
  DROP_MAX_X,
  DROP_MIN_X,
  DROP_SPEED,
  DROP_Y,
  binCenterX,
  createPegs,
  updateWobble,
} from './layout'
import { createBall, resetBall, stepBall } from './physics'
import {
  BIN_BALL_Y,
  BLANK_BREAK,
  BREAK_AT,
  addRipple,
  createBackdrop,
  createRipples,
  drawBackdrop,
  ensureBackdropScale,
  drawBins,
  drawBlankReveal,
  drawDropper,
  drawFallingBall,
  drawHeadline,
  drawPegs,
  drawRevealBall,
  updateRipples,
} from './render'

/**
 * G05 · 플린코 낙하.
 *
 * → 사양서: docs/wiki/20-design/game-g05-plinko.md
 * → 계약:   docs/wiki/10-contracts/playground-game-contract.md
 *
 * **떨어뜨릴 위치를 정해 볼을 놓으면, 못을 튕기며 내려가 하단 아홉 개 빈 중 하나의 번호를 얻는다.**
 *
 * ── ★ 왜 45칸이 아니라 9빈인가 ─────────────────────────────────────
 * 기획 원문은 "하단 45칸 중 하나에 안착" 이었다. 그러나 45칸을 360px 폭에 그리면 **칸당 8px**
 * 이라 숫자가 보이지 않는다. 그래서 **하단 9개 빈(각 40px)** 으로 바꾸고 **매 낙하마다 아홉
 * 빈에 번호를 새로 붙인다.** 이렇게 하면 40px 빈에 숫자가 시원하게 들어가고, "내가 위치를
 * 정했다" 는 기여감은 그대로이며, 예약형이 되어 **중복이 구조적으로 사라진다.**
 *
 * ── 번호 획득 (계약의 예약형) ──────────────────────────────────────
 * 매 낙하 **직전** 꽝 셋을 뽑고 `reserveMany(6)` 로 **번호 빈 여섯에만** 값을 붙인다.
 * 안착하면 그 빈의 토큰을 `commit`, **나머지 다섯은 `release`.**
 * 게임은 1~45 를 직접 만들지 않는다 — 호스트가 준 토큰과 값만 다룬다.
 *
 * ── ★ 2026-09-17 · 기회 아홉 번과 꽝 셋 (사용자 지시) ──────────────
 * ① **기회는 아홉 번**이다. 다 쓰고 여섯을 못 채우면 `failed`.
 * ② **아홉 칸 중 셋은 꽝**이고 **조준 전에 보인다.** 꽝에 들어가면 기회만 쓰고 번호는 없다.
 * ③ **흔들리는 못이 넷, 첫 낙하부터**다(`layout.ts`).
 *
 * 셋은 한 덩어리다. 기회만 제한하면 조준할 이유가 없어 지루하고, 꽝만 넣으면 몇 번을
 * 떨어뜨리든 손해가 없어 긴장이 없다.
 *
 * ── ⚠ 유지보수 시 주의 ─────────────────────────────────────────────
 * ① `meta` 는 반드시 `catalog.ts` 에서 가져온다. 여기서 새로 적으면 목록·상세 페이지와
 *    값이 갈린다.
 * ② 못 좌표는 `layout.ts` 하나만 고친다. 물리와 렌더가 같은 배열을 본다.
 * ③ 캔버스 안 글자색은 `palette.text` 가 아니라 `palette.ballFg` 다 — 이 게임만 배경이
 *    항상 어둡기 때문이다. 이유는 `render.ts` 머리말에 적어 두었다.
 */

const meta = GAMES.find((g) => g.slug === 'plinko')
if (meta === undefined) {
  // catalog 와 폴더가 어긋난 상태다. 조용히 넘어가면 원인을 찾기 어렵다.
  throw new Error("catalog.ts 에 'plinko' 항목이 없습니다")
}

/**
 * **기회 아홉 번** (2026-09-17 · 사용자 지시).
 *
 * ⚠ 소모하는 자리는 `drop()` **하나뿐**이다. 예약을 받지 못해 다시 놓게 하는 경우는
 *   사용자 잘못이 아니므로 소모하지 않는다 — `land()` 의 재시도 분기를 본다.
 */
const MAX_ATTEMPTS = 9
/** 아홉 칸 중 꽝의 개수. 나머지 여섯 칸에만 번호를 예약한다. */
const BLANK_COUNT = 3
/** 번호가 붙는 빈의 개수. `reserveMany` 에 넘기는 값이다. */
const NUMBER_BINS = BIN_COUNT - BLANK_COUNT

/** 빨려 들어가 → 깨지고 → 번호가 나오기까지 걸리는 시간. */
const REVEAL_ANIM = 0.55
/** 공개 후 다음 조준까지 머무는 총 시간. 획득을 눈으로 확인할 여유를 준다. */
const REVEAL_HOLD = 1.1
/** 꽝 연출의 길이. */
const BLANK_ANIM = 0.4
/**
 * 꽝을 보여주고 머무는 총 시간.
 *
 * ⚠ 획득(1.1초)보다 **짧다.** 소득이 없는 일에 오래 머물면 기회가 아홉 번뿐인 판에서
 *   시간만 버리는 느낌이 든다.
 */
const BLANK_HOLD = 0.75
/** 안착 흔들림의 초기 세기(px). 움직임 최소화에서는 0 이다. */
const SHAKE_START = 5
/** 완료 축하 컨페티를 이 간격(초)으로 터뜨린다. */
const DONE_CONFETTI_GAP = 0.9

/**
 * 게임 **내부** 진행 상태. 호스트에 보내는 `GamePhase` 와 이름이 비슷하지만 다른 것이다 —
 * 이쪽은 물리와 그리기를 가르고, 저쪽은 호스트가 어떤 오버레이를 그릴지를 정한다.
 */
type Phase = 'ready' | 'aiming' | 'dropping' | 'reveal' | 'blank' | 'done'

const game: GameModule = {
  meta,

  create(ctx: GameContext): GameInstance {
    const { stage, pool, rng, palette, input, draw, emit, reducedMotion, quality } = ctx
    /** 이 게임의 강조색. `catalog.ts` 의 `accent: 'dream'` 과 같은 값이다. */
    const accent = palette.svc[meta.accent]

    const pegs = createPegs()
    const ripples = createRipples()
    const backdrop = createBackdrop(stage, palette, rng)
    /*
      파티클 상한은 품질에 맞춘다([[playground]] 의 성능 표: 상한 120, low 면 40).
      ⚠ 워치독은 게임이 시작된 뒤에 내려가지만, 배열은 여기서 한 번만 잡는다. 도중에 다시
        할당하면 그 순간 프레임이 튄다 — 느려진 상황에서 하기에 가장 나쁜 일이다.
      ⚠ 움직임 최소화면 파티클을 아예 쓰지 않으므로 최소 크기로 잡는다.
    */
    const particles: ParticleField = draw.particles(
      reducedMotion ? 1 : quality.level === 'low' ? 40 : 120,
    )

    const ball = createBall()

    /** 시뮬레이션 누적 시간(초). 못 흔들림·끼임 판정이 전부 이 시각을 쓴다. */
    let sim = 0
    /*
      ⚠ 시작은 **`'ready'`** 다. 호스트가 "게임시작" 오버레이를 그리고, 그 버튼이
        `pressAction('primary')` 로 들어와 판이 시작된다(계약: 진행 단계와 오버레이).
    */
    let phase: Phase = 'ready'
    let dropX = stage.width / 2

    /** 첫 `fixedUpdate` 에서 한 번만 하는 일이 있다. */
    let started = false
    /**
     * 호스트에 마지막으로 알린 단계.
     *
     * ⚠ 같은 값을 다시 보내지 않으려고 둔다. 매 라운드 부르는 자리에서 거르지 않으면
     *   호스트의 상태 갱신이 초당 여러 번 돈다(계약의 경고).
     */
    let toldPhase: GamePhase | null = null

    /**
     * 빈별 예약 토큰. 인덱스가 곧 빈 번호다. 꽝 빈과 아직 안 잡은 빈은 `null`.
     *
     * ⚠ 예약 배열(6개)을 그대로 들고 있지 않고 **빈 인덱스로 펼쳐 둔다.** 꽝이 생기면서
     *   예약 순번과 빈 번호가 어긋났기 때문이다 — `reservations[bin]` 으로 집으면 꽝
     *   왼쪽의 빈은 맞고 오른쪽은 한 칸씩 밀린 값을 준다.
     */
    const binToken: (number | null)[] = new Array<number | null>(BIN_COUNT).fill(null)
    /** 빈에 보이는 번호. 예약을 못 받았거나 이미 반납한 빈은 `null`. */
    const binValues: (number | null)[] = new Array<number | null>(BIN_COUNT).fill(null)
    /**
     * 꽝 빈인가.
     *
     * ⚠ **`binValues[i] === null` 로 대신하지 않는다.** 예약을 못 받은 빈도 `null` 인데
     *   그것은 사고(풀 고갈)이고 꽝은 규칙이다. 둘을 한 상태로 합치면 `land()` 에서
     *   "기회를 소모하는가" 가 갈리지 않는다.
     */
    const binBlank: boolean[] = new Array<boolean>(BIN_COUNT).fill(false)

    /**
     * 쓴 기회. HUD 와 캔버스 상단 표시가 이 값을 본다.
     *
     * ⚠ 2026-09-17 까지는 낙하 수를 세는 `round` 가 따로 있었으나 **지웠다.** 난이도 곡선이
     *   "3회차부터" 를 버리고 상시가 되면서 읽는 곳이 사라졌고, 남겨 두면 `attempts` 와
     *   미묘하게 어긋나는 두 번째 진실이 된다 — 재시도에서 `attempts` 만 되돌리기 때문이다.
     */
    let attempts = 0

    let landedBin = -1
    let landedValue = 0
    /**
     * 깨지는 무지 볼의 색.
     *
     * ⚠ 공개 연출 도중에는 `binValues` 를 이미 비운 상태라(반납한 번호를 화면에 남기지
     *   않는다) 색을 그때 다시 계산할 수 없다. 획득하는 순간 붙잡아 둔다.
     */
    let landedColor = ''
    let revealT = 0
    /** 이번 공개에서 이미 깨졌는가. 파편을 한 번만 터뜨리려고 둔다. */
    let broke = false
    let shake = 0
    let doneT = 0
    let confettiAt = 0
    /**
     * 축하 연출을 할 것인가.
     *
     * ⚠ **복원된 판에서는 하지 않는다.** 호스트가 `sessionStorage` 의 완주 기록을 되살려
     *   이미 끝난 판으로 `create` 할 수 있는데(계약: "이미 끝난 판으로 시작될 때"), 그때
     *   컨페티가 터지면 **완료 오버레이 뒤에서 방금 뭔가 일어난 것처럼** 보인다. 축하는
     *   이 판에서 실제로 여섯 번째를 모았을 때만 한다.
     */
    let celebrate = false

    /**
     * 호스트에 진행 단계를 알린다.
     *
     * ⚠ **문구를 보내지 않는다.** 호스트가 여섯 게임 공용 기본값을 갖고 있다(계약: 팝업
     *   문구는 호스트가 기본값을 갖는다). 게임이 채우는 것은 "게임마다 달라야 하는 것" 뿐인데
     *   이 게임에는 그런 것이 없다 — 기회 제한이 없어 실패 단계 자체가 없고, 시작 안내는
     *   `meta.tagline` 이 이미 정확히 말한다.
     */
    function sayPhase(next: GamePhase, text?: string): void {
      if (toldPhase === next) return
      toldPhase = next
      emit(text === undefined ? { type: 'phase', phase: next } : { type: 'phase', phase: next, text })
    }

    /** 남은 기회. 캔버스 안 표시와 `status` 문구가 **같은 값**을 봐야 한다. */
    function attemptsLeft(): number {
      return MAX_ATTEMPTS - attempts
    }

    /* ── 예약과 획득 ─────────────────────────────────────────── */

    /** 살아 있는 예약을 전부 되돌린다. 화면에서 사라진 번호가 풀에 잠기면 안 된다. */
    function releaseAll(): void {
      for (let i = 0; i < BIN_COUNT; i += 1) {
        const token = binToken[i]
        if (token !== null) pool.release(token)
        binToken[i] = null
        binValues[i] = null
      }
    }

    /**
     * 꽝 셋을 새로 뽑는다.
     *
     * ⚠ **매 낙하마다 다시 뽑는다.** 한 판 내내 고정하면 그 세 칸만 피하면 되는 외우기
     *   문제가 된다.
     * ⚠ **제약 없이 무작위다.** 붙어 나오면(3·4·5) 회피가 쉽고 흩어지면(0·4·8) 어려운데,
     *   그 변동성 자체가 "이번 판은 운이 좋다" 가 되는 자리다. 고르게 펴려면 그 제약이
     *   왜 필요한지를 실측으로 보여야 하는데 지금은 그럴 근거가 없다.
     * ⚠ 거절 샘플링이라 `BLANK_COUNT < BIN_COUNT` 인 동안만 끝난다. 3 대 9 라 평균 반복은
     *   네 번 남짓이다.
     */
    function pickBlanks(): void {
      binBlank.fill(false)
      let placed = 0
      while (placed < BLANK_COUNT) {
        const i = rng.int(0, BIN_COUNT - 1)
        if (binBlank[i]) continue
        binBlank[i] = true
        placed += 1
      }
    }

    /**
     * 다음 낙하를 준비한다 — 아홉 빈에 번호를 새로 붙인다.
     *
     * ⚠ **값을 정렬하지 않는다.** 왼쪽부터 오름차순으로 놓으면 색 띠가 무지개처럼 보여 예쁘고
     *   조준의 의미도 커진다. 그러나 빈 분포가 완전 균등이 아닌 이상 **모이는 번호가 1~45 의
     *   특정 구간으로 쏠린다.** "모든 빈이 동등하므로 보정할 것이 없다" 는 근거가 성립하려면
     *   빈↔값 대응이 무작위여야 한다. 정렬은 그 전제를 깨뜨린다.
     * ⚠ `reserveMany` 는 부족하면 **가능한 만큼만** 준다. 6개까지만 획득하므로 최소 39개가
     *   남아 실제로는 늘 아홉 개지만, 계약이 그렇게 정의한 이상 방어해 둔다.
     */
    function beginAim(): void {
      releaseAll()
      sayPhase('playing')
      pickBlanks()
      /*
        ⚠ **꽝 칸에는 예약을 잡지 않는다.** 잡아 두면 그 번호가 낙하 내내 풀에 잠기는데,
          꽝으로 안착하면 어차피 곧바로 반납할 값이다. 그래서 `reserveMany(6)` 이다.
        ⚠ 예약 순번(`k`)과 빈 번호(`i`)는 **다르다.** 꽝을 건너뛰며 채우기 때문이다.
      */
      const picked = pool.reserveMany(NUMBER_BINS)
      let k = 0
      for (let i = 0; i < BIN_COUNT; i += 1) {
        if (binBlank[i]) continue
        const r = picked[k]
        k += 1
        // 풀이 말라 못 받은 빈은 비워 둔다. 안착하면 기회를 되돌리고 다시 놓게 한다.
        if (r === undefined) continue
        binToken[i] = r.token
        binValues[i] = r.value
      }
      landedBin = -1
      landedValue = 0
      landedColor = accent
      phase = 'aiming'
      emit({ type: 'hint', text: '떨어뜨릴 자리를 정하고 놓아 보세요.' })
    }

    /** 볼을 놓는다. 조준 중일 때만 받는다 — 낙하 중 연타로 볼이 겹치지 않게 한다. */
    function drop(): void {
      if (phase !== 'aiming') return
      /*
        기회를 다 썼으면 놓을 수 없다. 정상 흐름에서는 `afterReveal()` 이 먼저 판을 끝내므로
        여기까지 오지 않지만, 입력은 어느 시점에나 들어올 수 있으므로 한 번 더 막는다.
      */
      if (attemptsLeft() <= 0) return
      resetBall(ball, dropX, DROP_Y, rng, sim)
      attempts += 1
      emit({ type: 'attempt', used: attempts, total: MAX_ATTEMPTS })
      /* 사용자의 능동적 행동. 결과를 기다리지 않고 **누른 순간** 울린다(계약). */
      emit({ type: 'sfx', name: 'shoot' })
      phase = 'dropping'
    }

    /**
     * 빈에 안착했다.
     *
     * ⚠ `commit` 이 실패하면(`stale`·`full`) **번호를 지어내지 않는다.** 예약을 모두 되돌리고
     *   조준부터 다시 한다. 실패는 사실상 일어나지 않지만, 일어났을 때 화면에 없는 번호를
     *   주는 것보다 한 번 더 떨어뜨리게 하는 편이 정직하다.
     */
    function land(bin: number): void {
      /*
        ★ 꽝 (2026-09-17).

        기회는 `drop()` 에서 이미 소모됐고 **여기서 되돌리지 않는다** — 꽝은 사고가 아니라
        규칙이다. 아래 "예약을 받지 못한 빈" 과 갈리는 지점이 정확히 여기다.
      */
      if (binBlank[bin]) {
        releaseAll()
        landedBin = bin
        landedValue = 0
        landedColor = accent
        revealT = 0
        phase = 'blank'
        broke = false
        shake = reducedMotion ? 0 : SHAKE_START
        // 획득(20·40)보다 약하게. 진동의 세기가 곧 결과의 크기로 읽힌다.
        emit({ type: 'haptic', ms: 10 })
        emit({ type: 'sfx', name: 'blank' })
        /*
          ⚠ 꽝은 호스트가 대신 읽어 줄 것이 없다(획득 때는 호스트가 "N번째 번호 X번" 을
            읽어서 게임이 비켜 준다). 그래서 이 자리에서 바로 알리고, 계약이 요구한 대로
            **남은 기회 숫자를 말로 함께** 준다 — 캔버스 안 표시는 보조기술에 투명하다.
        */
        emit({ type: 'status', text: `꽝입니다. 남은 기회 ${attemptsLeft()}번.` })
        return
      }

      const token = binToken[bin]
      if (token === null) {
        /*
          예약을 받지 못한 빈이다(풀 고갈). **사용자 잘못이 아니므로 기회를 되돌린다.**
          사실상 일어나지 않지만(최대 6개만 획득하므로 늘 39개 이상 남는다), 일어났을 때
          기회만 축내는 것이 가장 나쁜 결말이다.
        */
        attempts -= 1
        emit({ type: 'attempt', used: attempts, total: MAX_ATTEMPTS })
        emit({ type: 'sfx', name: 'blank' })
        emit({ type: 'retry', reason: 'out' })
        beginAim()
        return
      }

      const claim = pool.commit(token)
      if (!claim.ok) {
        // 같은 이유로 기회를 되돌린다. 화면에 없는 번호를 주는 것보다 다시 놓게 하는 편이 정직하다.
        attempts -= 1
        emit({ type: 'attempt', used: attempts, total: MAX_ATTEMPTS })
        emit({ type: 'sfx', name: 'blank' })
        emit({ type: 'retry', reason: 'out' })
        beginAim()
        return
      }

      /*
        나머지 다섯은 즉시 반납한다. 다음 낙하에서 다시 뽑힐 수 있어야 한다.
        ⚠ 반납한 번호를 화면에 남겨 두지 않는다. 이미 풀로 돌아간 번호가 빈에 그대로 보이면
          **화면이 거짓말을 한다.** 공개 연출은 안착한 볼 하나에 집중시킨다.
      */
      for (let i = 0; i < BIN_COUNT; i += 1) {
        const other = binToken[i]
        if (other !== null && other !== token) pool.release(other)
        binToken[i] = null
        binValues[i] = null
      }

      landedBin = bin
      landedValue = claim.value
      landedColor = palette.ball[ballRange(claim.value)]
      revealT = 0
      phase = 'reveal'

      broke = false
      shake = reducedMotion ? 0 : SHAKE_START
      emit({ type: 'haptic', ms: claim.complete ? 40 : 20 })
      /*
        ⚠ 완주일 때 `hit` 를 보내지 않는다 — 팡파르(`clear`)와 겹치면 뭉개진다(계약).
          `clear` 는 공개 연출이 끝나는 자리에서 보낸다. 번호가 아직 드러나지도 않았는데
          팡파르가 먼저 울리면 소리가 화면을 앞질러 간다.
      */
      if (!claim.complete) emit({ type: 'sfx', name: 'hit' })
    }

    /** 공개 연출이 끝났다. 완료·실패면 판을 멈추고, 아니면 다음 조준으로 넘어간다. */
    function afterReveal(): void {
      if (pool.complete) {
        phase = 'done'
        doneT = 0
        confettiAt = 0
        celebrate = true
        // 판이 끝났으니 꽝 표시도 치운다. 남겨 두면 끝난 판에 규칙이 계속 떠 있다.
        binBlank.fill(false)
        emit({ type: 'sfx', name: 'clear' })
        sayPhase('cleared')
        emit({ type: 'hint', text: '아래에서 모은 번호를 확인해 보세요.' })
        return
      }

      /*
        ★ 실패 판정 (2026-09-17).

        ⚠ **연출이 끝난 이 자리**에서 한다. 투하하는 순간에 판정하면 아홉 번째 볼이 아직
          내려가는 중인데 실패 오버레이가 덮여 **마지막 한 번의 결과를 보지 못한다.**
      */
      if (attemptsLeft() <= 0) {
        phase = 'done'
        doneT = 0
        celebrate = false
        binBlank.fill(false)
        // 마지막이 꽝이었다면 그 자리에 그릴 번호 볼이 없다. 자리 자체를 비운다.
        if (landedValue === 0) landedBin = -1
        /*
          ⚠ `clear` 와 마찬가지로 **연출이 끝나는 자리**에서 보낸다. 결과가 드러나기도 전에
            실패음이 울리면 소리가 화면을 앞질러 간다.
        */
        emit({ type: 'sfx', name: 'fail' })
        /*
          ⚠ `title` 은 호스트 기본값('6개 번호 모으기 실패')을 그대로 쓰고 **`text` 만
            덮는다.** 몇 개를 모았는지는 게임만 알기 때문이다 — 계약이 "게임이 채우는 것은
            게임마다 달라야 하는 것 뿐" 이라고 못 박았다.
        */
        sayPhase('failed', `${pool.awarded.length}개를 모았습니다. 다시 도전해 보세요.`)
        return
      }

      beginAim()
      /*
        ⚠ 획득 순간이 아니라 **여기서** 상태를 알린다. 호스트가 이미 획득 시점에
          "N번째 번호 X번을 모았습니다" 를 aria-live 로 읽는데, 같은 순간에 게임이 또
          내보내면 그 문장을 덮어써 번호가 읽히지 않는다. 한 박자 뒤에 다음 할 일을 말한다.
      */
      emit({ type: 'status', text: `다음 볼을 놓을 수 있습니다. 남은 기회 ${attemptsLeft()}번.` })
    }

    /* ── 입력 ────────────────────────────────────────────────── */

    /**
     * 캔버스를 손가락으로 끌고 있는가.
     *
     * ⚠ 이 깃발이 필요한 이유: 캔버스 `pointerdown` 은 `pointer down` **과** `action primary
     *   down` 을 **둘 다** 보낸다. 깃발이 없으면 손을 대는 순간 바로 떨어져 조준이 불가능하다.
     *   반대로 캔버스 밖 DOM 조작 버튼은 `action` 만 보내므로 그때는 즉시 놓아야 한다.
     */
    let dragging = false

    function handle(ev: GameInput): void {
      /*
        ⚠ **`ready` 분기를 맨 앞에 둔다.** 오버레이의 "게임시작" 은 `pressAction('primary')`
          로 들어오는데, 이것을 아래 투하 경로가 먼저 집으면 시작하자마자 볼이 떨어진다.
          포인터로 캔버스를 눌러 시작한 경우도 같아서 두 채널을 한자리에서 막는다.
      */
      if (phase === 'ready') {
        const isStart =
          (ev.kind === 'action' && ev.action === 'primary' && ev.phase === 'down') ||
          (ev.kind === 'pointer' && ev.phase === 'down')
        if (isStart) {
          dragging = false
          beginAim()
        }
        return
      }

      if (ev.kind === 'pointer') {
        if (ev.phase === 'down') {
          dragging = true
          if (phase === 'aiming') dropX = draw.clamp(ev.x, DROP_MIN_X, DROP_MAX_X)
        } else if (ev.phase === 'move') {
          if (dragging && phase === 'aiming') dropX = draw.clamp(ev.x, DROP_MIN_X, DROP_MAX_X)
        } else {
          // up / cancel — 손을 뗀 자리에 떨어뜨린다. 끌어서 조준하고 놓는 동작이 하나로 이어진다.
          if (dragging) {
            dragging = false
            if (phase === 'aiming') dropX = draw.clamp(ev.x, DROP_MIN_X, DROP_MAX_X)
            drop()
          }
        }
        return
      }

      if (ev.action !== 'primary' || ev.phase !== 'down') return
      // 키보드와 DOM 버튼. 포인터로 끌고 있는 중이면 그쪽이 `up` 에서 처리한다.
      if (!dragging) drop()
    }

    /* ── 루프 ────────────────────────────────────────────────── */

    function fixedUpdate(dt: number): void {
      /*
        ★ 첫 스텝에서 한 번만 하는 일 (계약: "이미 끝난 판으로 시작될 때").

        ⚠ 호스트는 `sessionStorage` 의 완주 기록을 30분 동안 복원해 **이미 6개를 모은 풀**로
          `create` 를 부를 수 있다. 그때 `ready` 를 보내면 더 모을 것이 없는 사람에게
          "게임시작" 을 내밀게 되고, 눌러도 아무것도 얻지 못하는 판이 돌아간다.
        ⚠ `phase` 만 보내고 내부 상태를 진행 중으로 두면 **오버레이 뒤에서 판이 계속 굴러간다.**
          그래서 내부 상태도 `'done'` 으로 멈춰 둔다.
        ⚠ `create` 가 아니라 여기서 하는 이유: `create` 시점에는 호스트가 아직 이벤트를 받을
          준비가 되지 않았을 수 있다. 계약이 첫 `fixedUpdate` 를 자리로 못 박았다.
      */
      if (!started) {
        started = true
        emit({ type: 'attempt', used: 0, total: MAX_ATTEMPTS })
        if (pool.complete) {
          phase = 'done'
          sayPhase('cleared')
          emit({ type: 'hint', text: '아래에서 모은 번호를 확인해 보세요.' })
        } else {
          /*
            ⚠ `ready` 의 `text` 는 **덮는다.** 호스트 기본값은 `meta.tagline` 인데, 시작
              화면에서 가장 먼저 알아야 할 것이 "기회가 아홉 번" 과 "셋은 꽝" 이다. 이것을
              모르고 시작하면 세 번째 낙하쯤에서야 규칙을 알아차린다(2026-09-17).
          */
          sayPhase('ready', `기회는 ${MAX_ATTEMPTS}번, 아홉 칸 중 ${BLANK_COUNT}칸은 꽝입니다.`)
        }
      }

      sim += dt

      /*
        난이도 곡선 — 못 넷이 좌우로 움직인다(`layout.ts` 의 `WOBBLE_PEGS`).
        ⚠ 2026-09-17 부터 **첫 낙하부터** 켜져 있다. 기회가 아홉 번으로 제한되면서, 앞의
          두 번이 "판이 고정된 연습 구간" 이 되면 난이도가 한 판 안에서 들쭉날쭉해진다.
      */
      updateWobble(pegs, sim)
      updateRipples(ripples, dt)
      if (!reducedMotion) particles.update(dt)
      // 흔들림 감쇠. 약 0.2초면 잦아든다.
      if (shake > 0) {
        shake *= 0.86
        if (shake < 0.2) shake = 0
      }

      switch (phase) {
        case 'ready': {
          // 시작 전. 배경과 판만 보여준다 — 오버레이 뒤에서 무언가 움직이면 고장으로 읽힌다.
          break
        }

        case 'aiming': {
          // 꾹 누름 폴링. 키보드만으로 완주할 수 있어야 한다(계약의 완료 기준).
          if (input.down('left')) dropX -= DROP_SPEED * dt
          if (input.down('right')) dropX += DROP_SPEED * dt
          dropX = draw.clamp(dropX, DROP_MIN_X, DROP_MAX_X)
          break
        }

        case 'dropping': {
          const r = stepBall(ball, pegs, rng, dt, sim)
          if (r.hitPeg >= 0) {
            addRipple(ripples, pegs.x[r.hitPeg], pegs.y[r.hitPeg], r.hitPower)
          }
          if (r.landedBin >= 0) land(r.landedBin)
          break
        }

        case 'reveal': {
          revealT += dt
          /*
            깨지는 순간에 파편을 터뜨린다.
            ⚠ 착지하는 순간이 아니다 — 착지와 공개 사이에 볼이 빨려 들어가는 마디가 있고,
              그때 파편이 날면 아직 멀쩡한 볼에서 조각이 튀는 그림이 된다.
            ⚠ 색은 **깨지는 무지 볼의 색**이다. 얻은 번호의 구간색과 같으므로 색이 먼저
              새어 나갈 걱정이 없다 — 이미 빈에 그 색으로 보이고 있었다.
          */
          if (!broke && revealT >= REVEAL_ANIM * BREAK_AT) {
            broke = true
            if (!reducedMotion) {
              particles.burst(
                binCenterX(landedBin),
                BIN_BALL_Y,
                quality.level === 'low' ? 5 : 14,
                landedColor,
                120,
              )
            }
          }
          if (revealT >= REVEAL_HOLD) afterReveal()
          break
        }

        case 'blank': {
          // 꽝. 파편도 컨페티도 없다 — 연출은 `render.ts` 의 `drawBlankReveal` 하나가 맡는다.
          revealT += dt
          if (revealT >= BLANK_HOLD) afterReveal()
          break
        }

        case 'done': {
          doneT += dt
          if (celebrate && !reducedMotion && doneT - confettiAt >= DONE_CONFETTI_GAP) {
            confettiAt = doneT
            particles.burst(
              rng.range(stage.width * 0.25, stage.width * 0.75),
              stage.height * 0.32,
              quality.level === 'low' ? 4 : 10,
              accent,
              130,
            )
          }
          break
        }
      }
    }

    function draw2d(c: CanvasRenderingContext2D, alpha: number, timeMs: number): void {
      c.save()
      // 안착 충격. 움직임 최소화에서는 `shake` 가 0 이라 아무 일도 일어나지 않는다.
      if (shake > 0) {
        c.translate(Math.sin(sim * 61) * shake, Math.cos(sim * 47) * shake * 0.6)
      }

      /*
        ⚠ 배경 캐시는 **화면 배율을 따라간다.** 고정 배율로 두면 큰 화면·고DPR 에서 캐시를
          확대해 쓰게 되어 배경만 흐릿해진다. 안에서 쿨다운과 차이 판정을 하므로 매 프레임
          불러도 실제 재생성은 드물게 일어난다.
      */
      ensureBackdropScale(c, backdrop, stage, palette, rng, timeMs)
      drawBackdrop(c, backdrop, stage, palette, timeMs, reducedMotion)
      drawPegs(c, pegs, ripples, palette, accent)
      drawBins(
        c,
        draw,
        palette,
        binValues,
        binBlank,
        // 연출이 그 자리를 대신 그리므로 빈의 볼(또는 ✕)은 숨긴다.
        landedBin,
        // 강조 링은 **번호를 얻은 빈에만** 두른다 — 꽝에 강조를 두르면 소득으로 읽힌다.
        phase === 'reveal' || (phase === 'done' && landedValue > 0) ? landedBin : -1,
        phase === 'reveal' ? draw.clamp(revealT / REVEAL_ANIM, 0, 1) : 1,
        accent,
        stage.width,
      )

      drawDropper(c, draw, accent, dropX, phase === 'aiming', timeMs, reducedMotion)

      if (phase === 'dropping') {
        // 고정 60Hz 물리를 120Hz 화면에서도 매끄럽게 — 마지막 스텝 사이를 보간해 그린다.
        drawFallingBall(
          c,
          draw,
          draw.lerp(ball.prevX, ball.x, alpha),
          draw.lerp(ball.prevY, ball.y, alpha),
        )
      } else if (phase === 'blank' && landedBin >= 0) {
        drawBlankReveal(
          c,
          draw,
          palette,
          binCenterX(landedBin),
          BIN_FLOOR - BALL_R,
          revealT / BLANK_ANIM,
          reducedMotion,
        )
      } else if (
        /*
          ⚠ `done` 에서 `landedValue > 0` 을 함께 본다. 마지막 낙하가 꽝이면 그릴 번호가
            없는데(값이 0), 조건을 빼면 **0번 볼**을 그리게 된다.
        */
        (phase === 'reveal' || (phase === 'done' && landedValue > 0)) &&
        landedBin >= 0
      ) {
        drawRevealBall(
          c,
          draw,
          accent,
          binCenterX(landedBin),
          BIN_FLOOR - BALL_R,
          landedValue,
          landedColor,
          phase === 'done' ? 1 : revealT / REVEAL_ANIM,
          reducedMotion,
        )
      }

      if (!reducedMotion) particles.draw(c)

      drawHeadline(c, draw, palette, stage, headline(), attemptsLeft(), accent)
      c.restore()
    }

    /** 캔버스 상단 한 줄. 금지 표현을 쓰지 않는다 — "모으기" 만 말한다. */
    function headline(): string {
      switch (phase) {
        case 'ready':
          return '자리를 정해 볼을 놓으세요'
        case 'aiming':
          return '떨어뜨릴 자리를 정하세요'
        case 'dropping':
          return '내려가는 중…'
        case 'blank':
          /*
            ⚠ 여기서는 결과를 감추지 않는다. 꽝 칸은 **조준 전부터 보이고** 있었으므로
              볼이 그 칸에 들어간 순간 사용자는 이미 안다. "들어갔어요!" 로 기대를
              끌었다가 꽝을 알리면 놀리는 것이 된다.
          */
          return '꽝이에요'
        case 'reveal':
          /*
            ⚠ 깨지기 **전에는 번호를 말하지 않는다.** 헤드라인이 먼저 번호를 불러 버리면
              색 힌트형의 전제(번호는 깨지는 순간 처음 드러난다)가 글자로 새어 나간다.
          */
          return revealT < REVEAL_ANIM * BREAK_AT ? '들어갔어요!' : `${landedValue}번을 모았어요`
        case 'done':
          // 완주와 실패가 같은 내부 상태를 쓴다. 가르는 것은 `celebrate` 다.
          return celebrate ? '번호 6개를 모았어요' : '기회를 다 썼어요'
      }
    }

    /* ── 시작 ────────────────────────────────────────────────── */

    /*
      이어하기로 이미 6개를 채운 상태로 들어올 수 있다(호스트가 `sessionStorage` 에서 복원해
      `pool` 에 미리 넣어 준다). 그때는 조준 화면을 띄우지 않는다 — 더 놓을 자리가 없다.
    */
    /*
      ⚠ 여기서 아무것도 `emit` 하지 않는다. 시작 판정은 **첫 `fixedUpdate`** 가 한다
        (위 주석 참조). `phase` 는 선언에서 이미 `'ready'` 다.
    */

    return {
      fixedUpdate,
      draw: draw2d,
      handle,
      onPause() {
        // 누르고 있던 것을 놓은 것으로 본다. 돌아왔을 때 표식이 한쪽으로 흐르지 않게.
        dragging = false
      },
      destroy() {
        /*
          ⚠ 살아 있는 예약을 반드시 되돌린다. 호스트도 `releaseAll()` 로 한 번 더 막지만
            (계약의 불변식 넷 중 하나), 양쪽이 다 지키는 편이 안전하다.
        */
        releaseAll()
        particles.clear()
      },
    }
  },
}

export default game
