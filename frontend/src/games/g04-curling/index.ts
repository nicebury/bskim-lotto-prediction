/**
 * G04 · 얼음판 컬링 — 스톤을 당겼다 놓아 45칸 보드의 칸을 뒤집는다.
 *
 * → 사양서: docs/wiki/20-design/game-g04-curling.md
 * → 계약:   docs/wiki/10-contracts/playground-game-contract.md
 *
 * ── ★ 2026-09-17 전면 개편 — 보드형에서 은닉형으로 ─────────────────
 * 전에는 45칸에 번호가 **적혀 있었고**(보드형) 여섯 게임 중 유일한 예외였다. 계약이
 * 2026-09-10 에 *"여섯 게임 전부, 번호는 손에 넣는 순간 처음 드러난다"* 고 정한 뒤로도
 * 이 게임만 그대로였는데, 그것을 바로잡았다. 이제 칸은 전부 뒷면이고 스톤이 멈춘 칸만
 * 뒤집힌다(`pool.awardHidden`).
 *
 * 그 결과 규칙 셋이 함께 바뀌었다.
 *   ① **재투가 사라졌다.** 이미 얻은 칸은 무르는 대신 **장애물**이 되어 스톤을 튕긴다 —
 *      일이 벌어진 뒤 되돌리는 것이 아니라 애초에 일어나지 않게 한다.
 *   ② **꽝이 생겼다.** 45칸 중 9칸. 뒤집으면 번호가 아니라 꽝이다.
 *   ③ **기회가 9번이다.** 다 쓰고도 6개를 못 모으면 `failed`.
 *
 * ⚠ 바뀌지 않은 기준 하나 — **화면이 거짓말하지 않는다.** 전에는 "스톤이 17번 칸에 멈췄는데
 *   33번을 주지 않는다" 였고, 지금은 "뒤집힌 칸이 보여 준 번호는 반드시 그 투구로 얻은 것"
 *   이다. 규칙이 바뀌어도 이 기준은 그대로다.
 *
 * 파일은 넷으로 나눠 두었다.
 *   layout.ts  기하·물리 상수와 그 **검산**   physics.ts 스톤 물리·장애물 반사·궤적 예측
 *   render.ts  그리기(레이어 캐시)            index.ts   상태 머신(이 파일)
 */

import { GAMES } from '@/games/core/catalog'
import type {
  GameContext,
  GameInput,
  GameInstance,
  GameModule,
  GamePhase,
} from '@/games/core/types'

import {
  AIM_INITIAL_PULL,
  BLANK_COUNT,
  BOARD,
  CELL_COUNT,
  FRICTION,
  KEY_ANGLE_RATE,
  KEY_PULL_RATE,
  MAX_ATTEMPTS,
  PULL_MIN,
  RETRY_SEC,
  REVEAL_SEC,
  STAGE,
  START,
  TRAIL_MAX,
  boardIndex,
  cellAt,
  cellCenter,
  isCellHit,
} from './layout'
import type { CellState } from './layout'
import {
  aimAngleFromDrag,
  clampAngle,
  clampPull,
  createStone,
  launchVelocity,
  predictPath,
  stepStone,
} from './physics'
import type { Peg } from './physics'
import { createRenderer } from './render'
import type { Phase, RevealView, View } from './render'

/**
 * ⚠ `meta` 는 `catalog.ts` 에서 가져온다. 여기서 새로 적으면 목록 페이지와 상세 페이지가
 *   서로 다른 값을 보여준다.
 */
const meta = GAMES.find((g) => g.slug === 'curling')
if (meta === undefined) {
  // catalog 와 폴더가 어긋난 상태다. 조용히 넘어가면 원인을 찾기 어렵다.
  throw new Error("catalog.ts 에 'curling' 항목이 없습니다")
}

/** 자국을 남기는 간격(물리 스텝). 매 스텝 기록하면 초당 60개를 만들고 버린다. */
const TRAIL_EVERY = 3

const game: GameModule = {
  meta,

  create(ctx: GameContext): GameInstance {
    const renderer = createRenderer(ctx)
    const stone = createStone(START.x, START.y)

    let phase: Phase = ctx.pool.complete ? 'done' : 'aim'
    /** 수직 기준 각도(rad). 오른쪽이 +. */
    let angle = 0
    /** 당김 길이(px). 이것이 곧 세기다. */
    let pull = AIM_INITIAL_PULL
    let dragging = false
    /** 이번 투구의 마찰. 발사 순간에 정해진다. */
    let friction = FRICTION

    /**
     * 45칸의 상태. **게임이 소유한다.**
     *
     * ⚠ 보드형이던 시절에는 `pool.board()` 가 칸마다 번호를 알려 주었다. 은닉형인 지금
     *   풀은 칸이라는 개념 자체를 모르므로(요청은 "번호 하나를 달라" 뿐이다) 칸의 상태를
     *   게임이 들고 있어야 한다.
     */
    const cells: CellState[] = Array.from({ length: CELL_COUNT }, () => ({
      kind: 'hidden' as const,
      value: 0,
    }))

    /**
     * ★ 꽝 칸의 자리. **시작할 때 정해 두고 숨긴다.**
     *
     * ⚠ 멈춘 뒤에 "꽝일까?" 를 그때그때 굴리지 않는다. 그러면 같은 칸을 두 번 맞혔을 때 한 번은
     *   꽝, 한 번은 번호가 나올 수 있어 **판이 기억을 갖지 않는다** — 사용자가 화면에서 읽은
     *   정보("저 칸은 꽝이었다")가 다음 투구에 쓸모없어진다.
     * ⚠ Fisher-Yates 로 섞어 앞에서 끊는다. `while (set.size < n) set.add(rng.int(...))` 는
     *   같은 값이 계속 나오면 루프가 길어지고, 무엇보다 **난수 소비 횟수가 시드마다 달라져**
     *   계약이 요구하는 재현성(같은 시드 = 같은 판)이 흔들린다. 섞기는 소비 횟수가 고정이다.
     */
    const blankAt = ((): ReadonlySet<number> => {
      const order = Array.from({ length: CELL_COUNT }, (_, i) => i)
      for (let i = order.length - 1; i > 0; i -= 1) {
        const j = ctx.rng.int(0, i)
        const a = order[i]
        const b = order[j]
        if (a !== undefined && b !== undefined) {
          order[i] = b
          order[j] = a
        }
      }
      return new Set(order.slice(0, BLANK_COUNT))
    })()

    /**
     * ★ 장애물 — 이미 얻은 칸의 중심 좌표.
     *
     * ⚠ 획득할 때마다 **한 번만** 갱신한다. 매 프레임 `cells` 를 훑어 만들면 초당 60번
     *   45칸을 돌면서 배열을 새로 할당한다. 미니게임에서 GC 스파이크는 곧 프레임 끊김이다.
     */
    const pegs: Peg[] = []

    /**
     * ★ 쓴 기회. **발사하는 순간 센다.**
     *
     * ⚠ 결과가 난 뒤가 아니라 발사 시점에 세는 이유는, 결과 종류(획득·꽝·보드 밖·아웃)마다
     *   따로 세면 한 군데를 빠뜨렸을 때 **기회가 줄지 않는 경로**가 조용히 생기기 때문이다.
     *   "던졌으면 한 번" 이 규칙이고, 던지지 않은 헛손질(`short`)만 예외다.
     */
    let attemptsUsed = 0

    let path: readonly { x: number; y: number }[] = []
    /** 조준값이 바뀌었으니 궤적을 다시 계산해야 한다. */
    let pathDirty = true

    const trail: { x: number; y: number }[] = []
    let trailTick = 0

    let reveal: RevealView | null = null
    /** 헛투구(보드 밖·아웃·선에 걸침) 표시 위치와 진행. */
    let missAt: { x: number; y: number } | null = null
    let missT = 0
    /**
     * 선에 걸쳤을 때 **어느 칸에** 걸쳤는가.
     *
     * ⚠ 이것이 있어야 화면에 "여기까지 들어왔어야 한다" 를 그려 줄 수 있다. 예상 궤적은
     *   보드 진입 전까지만 그리므로, 이 표시가 없으면 사용자에게는 **아무 근거 없이 실패한
     *   것**이 되어 조절할 방법이 없다.
     */
    let missCell: { row: number; col: number } | null = null
    /** 현재 단계가 시작된 뒤 흐른 시간(초). */
    let timer = 0
    let shake = 0

    /**
     * ★ 조작 시연을 보여 줄 것인가 (2026-09-17 신설 · 사용자 요청).
     *
     * ⚠ **"시작 화면만 보면 당겨서 던지는 게임인 줄 알 수 없다"** 는 지적에서 나왔다. 그런데
     *   호스트는 `phase !== 'playing'` 인 동안 캔버스를 **오버레이로 덮으므로**, 시작 화면에
     *   그리는 것은 아무도 보지 못한다. 그래서 "게임시작" 을 누른 **직후부터 첫 투구 전까지**
     *   보여 준다 — 사용자가 처음으로 캔버스를 마주하는 그 순간이다.
     * ⚠ 한 번 던지면 끈다. 조작을 아는 사람에게 계속 손을 흔들면 시야만 가린다.
     */
    let showTutorial = true
    /** 시연 애니메이션의 누적 시간(초). */
    let tutorialT = 0

    /**
     * 아직 "게임시작" 을 누르기 전인가.
     *
     * ⚠ 호스트의 시작 버튼은 `primary` 액션을 그대로 흘려보낸다 — 게임이 보기엔 스페이스바와
     *   같은 입력이다(계약). 그래서 걸러 두지 않으면 **시작을 누른 그 입력이 첫 투구가 되어**
     *   조준할 틈도 없이 스톤이 날아간다. 첫 `primary` 는 시작 신호로만 쓰고 삼킨다.
     */
    let awaitingStart = !ctx.pool.complete

    /**
     * 포인터 y 보정 계수. **정상 상태에서는 1 이고 아무 일도 하지 않는다.**
     *
     * ⚠ 호스트의 좌표 변환 두 개가 어긋나 있어 넣은 방어다.
     *   · 렌더: `loop.ts` 가 **가로 기준**으로만 배율을 잡는다 — `s = rect.width / stage.width`
     *   · 입력: `input.ts` 가 **세로는 세로대로** 비율 환산한다 — `(y / rect.height) * stage.height`
     *   캔버스의 실제 비율이 `stage` 비율과 같으면 두 값이 일치하는데, 호스트가 높이를
     *   잘라내는 순간 어긋난다. 2026-09-08 실측: 스톤이 그려진 자리를 눌렀는데 게임은 그보다
     *   85px 아래를 눌렀다고 받아 **조준이 아예 불가능했다.**
     *
     * 호스트가 캔버스를 레터박스로 맞추면 이 값이 저절로 1 이 되어 무해해진다.
     * → docs/wiki/20-design/playground.md
     */
    let pointerScaleY = 1

    /*
      ⚠ 뷰 객체를 **한 번 만들어 재사용**한다. 매 프레임 새로 만들면 초당 60개의 객체가
        생기고, 미니게임에서 GC 스파이크는 곧 프레임 끊김이다.
    */
    const view: View = {
      phase,
      stone,
      angle,
      pull,
      path,
      trail,
      cells,
      reveal,
      missAt,
      missT,
      missCell,
      shake,
      dragging,
      attemptsLeft: MAX_ATTEMPTS,
      showTutorial,
      tutorialT,
    }

    /**
     * 호스트 오버레이 상태. **직전 값과 같으면 보내지 않는다** — 매 프레임 보내면 호스트의
     * 상태 갱신이 초당 예순 번 돈다(계약).
     *
     * ⚠ `title`·`text` 는 **비우는 것이 기본**이다. 호스트가 여섯 게임 공통 문구를 갖고 있어서,
     *   게임마다 따로 쓰면 그것만으로 여섯 개의 다른 제품이 된다. 계약이 허용하는 것은
     *   "게임마다 달라야 하는 것" 뿐이고, 이 게임에서는 **실패했을 때 몇 개를 모았는지** 하나다.
     */
    let sentPhase: GamePhase | null = null
    function setPhase(next: GamePhase, text?: string) {
      if (sentPhase === next) return
      sentPhase = next
      if (text === undefined) ctx.emit({ type: 'phase', phase: next })
      else ctx.emit({ type: 'phase', phase: next, text })
    }

    /** 남은 기회를 호스트 HUD 에 알린다. 캔버스 안에도 그리지만 그쪽은 보조기술에 투명하다. */
    function emitAttempts() {
      ctx.emit({ type: 'attempt', used: attemptsUsed, total: MAX_ATTEMPTS })
    }

    /** 첫 투구가 실제로 시작되는 지점에서만 부른다. */
    function beginPlay() {
      awaitingStart = false
      setPhase('playing')
    }

    /* ── 조준 ─────────────────────────────────────────────── */

    function refreshPath() {
      /*
        ⚠ 예상 궤적은 **보드 하단까지만** 그린다. 정지 지점까지 그리면 어느 칸에 멈출지가
          화면에 적혀 있는 것과 같아져, 이 게임의 유일한 조작인 세기 조절이 의미를 잃는다.
      */
      path = predictPath(START.x, START.y, angle, pull, FRICTION, BOARD.bottom)
      pathDirty = false
    }

    function applyDrag(px: number, py: number) {
      // 당김 벡터는 `시작점 − 포인터`. 뒤로 당긴 만큼 앞으로 나간다.
      const dx = START.x - px
      const dy = START.y - py
      angle = aimAngleFromDrag(dx, dy)
      pull = clampPull(Math.hypot(dx, dy))
      pathDirty = true
    }

    function updateAim(dt: number) {
      /*
        드래그 중에는 키 입력을 받지 않는다. 두 조작이 같은 값을 동시에 밀면 손가락을 뗄 때
        엉뚱한 세기로 날아간다.
      */
      if (dragging) {
        if (pathDirty) refreshPath()
        return
      }

      const before = angle + pull
      if (ctx.input.down('left')) angle = clampAngle(angle - KEY_ANGLE_RATE * dt)
      if (ctx.input.down('right')) angle = clampAngle(angle + KEY_ANGLE_RATE * dt)
      if (ctx.input.down('up')) pull = clampPull(pull + KEY_PULL_RATE * dt)
      if (ctx.input.down('down')) pull = clampPull(pull - KEY_PULL_RATE * dt)
      if (angle + pull !== before) pathDirty = true

      if (pathDirty) refreshPath()
    }

    /* ── 발사 ─────────────────────────────────────────────── */

    function launch() {
      if (phase !== 'aim' || ctx.pool.complete) return
      /* 오버레이 뒤에서 판이 굴러가지 않도록 이중으로 막는다. */
      if (awaitingStart) return

      /*
        ⚠ 너무 약한 당김은 **발사하지 않는다.** 캔버스를 그냥 톡 누른 것(pull ≈ 0)까지
          투구로 세면, 화면을 눌러 봤을 뿐인 사용자가 영문 모를 기회 소모를 당한다.
          기회가 9번뿐인 지금은 이 방어가 전보다 훨씬 중요하다.
      */
      if (pull < PULL_MIN) {
        ctx.emit({ type: 'retry', reason: 'short' })
        ctx.emit({ type: 'status', text: '조금 더 당겨 주세요.' })
        ctx.emit({ type: 'haptic', ms: 10 })
        ctx.emit({ type: 'sfx', name: 'miss' })
        return
      }

      /*
        ⚠ **기회는 여기서 한 번만 센다**(→ `attemptsUsed` 주석). 결과가 무엇이든 던진 것은
          던진 것이다.
      */
      attemptsUsed += 1
      emitAttempts()

      /*
        같은 세기를 그대로 되풀이하는 것만으로 끝까지 가지 못하게 얼음에 미세 편차를 준다.
        ⚠ 편차 폭을 획득 수에 매어 둔 것은 **초반을 관대하게** 하기 위해서다. 아직 감을 잡는
          첫 투구에 10% 가 흔들리면 무엇이 틀렸는지 배울 수가 없다.
      */
      const k = ctx.pool.awarded.length
      friction = FRICTION * ctx.rng.range(1 - 0.02 * k, 1 + 0.02 * k)

      const v = launchVelocity(angle, pull)
      stone.x = START.x
      stone.y = START.y
      stone.px = START.x
      stone.py = START.y
      stone.vx = v.vx
      stone.vy = v.vy
      stone.hit = null

      trail.length = 0
      trailTick = 0
      missAt = null
      missCell = null
      // 첫 투구를 던졌다. 조작을 아는 사람에게 계속 손을 흔들지 않는다.
      showTutorial = false
      // 지난 투구의 안내를 지운다. 새 결과가 나오면 그때 다시 채운다.
      ctx.emit({ type: 'hint', text: '' })
      ctx.emit({ type: 'sfx', name: 'shoot' })
      phase = 'slide'
    }

    function updateSlide(dt: number) {
      const result = stepStone(stone, dt, friction, pegs)

      trailTick += 1
      if (trailTick % TRAIL_EVERY === 0) {
        trail.push({ x: stone.x, y: stone.y })
        if (trail.length > TRAIL_MAX) trail.shift()
      }

      /*
        ⚠ 벽과 장애물을 **다르게** 알린다. 벽은 활용하는 것이고 장애물은 막힌 것이라, 같은
          진동·같은 색으로 내면 무엇이 일어났는지 손끝으로 구분할 수 없다.
      */
      if (stone.hit === 'wall') {
        ctx.emit({ type: 'haptic', ms: 10 })
        if (!ctx.reducedMotion) renderer.burst(stone.x, stone.y, 'wall')
      } else if (stone.hit === 'peg') {
        ctx.emit({ type: 'haptic', ms: 20 })
        if (!ctx.reducedMotion) renderer.burst(stone.x, stone.y, 'peg')
      }

      if (result === 'out') {
        // 아웃 라인을 넘었다. 정지를 기다리지 않는다.
        whiff('너무 세게 던졌어요. 세기를 조금 낮춰 보세요.')
        return
      }
      if (result === 'stopped') settle()
    }

    /* ── 정지 판정 ────────────────────────────────────────── */

    function settle() {
      const cell = cellAt(stone.x, stone.y)

      if (cell === null) {
        /*
          ⚠ **왜 벗어났는지를 말로 알린다.** 파워 바와 궤적선은 화면을 보는 사용자에게만
            전달된다. 못 미쳤는지 넘어갔는지 옆으로 샜는지를 구분해 주지 않으면 키보드·
            스크린리더 사용자는 세기를 어느 쪽으로 고쳐야 할지 알 방법이 전혀 없다.
        */
        const message =
          stone.y >= BOARD.bottom
            ? '못 미쳤어요. 세기를 조금 올려 보세요.'
            : stone.y < BOARD.top
              ? '너무 세게 던졌어요. 세기를 조금 낮춰 보세요.'
              : '보드 옆으로 벗어났어요. 방향을 틀어 보세요.'
        whiff(message)
        return
      }

      const index = boardIndex(cell.row, cell.col)
      const state = cells[index]
      if (state === undefined) {
        // 상태 배열과 칸 수가 어긋난 상태다. 게임을 멈추느니 헛투구로 넘긴다.
        whiff('다시 던져 주세요.')
        return
      }

      /*
        ⚠ 이미 얻은 칸에는 **기하학적으로 멈출 수 없다**(→ `layout.ts` 의 `PEG_R`). 그래도
          방어를 남기는 이유는, 나중에 칸 크기나 반지름을 건드렸을 때 이 불변식이 조용히
          깨지면 원인을 찾기 어려운 버그가 되기 때문이다. 여기 걸리면 수치가 틀린 것이다.
      */
      if (state.kind === 'awarded') {
        whiff('이미 모은 칸이에요. 다른 곳을 노려 보세요.')
        return
      }

      /*
        ★ **칸 가운데에 제대로 멈췄는가** (2026-09-17 신설 · 사용자 지시).

        ⚠ **꽝·획득 판정보다 먼저 본다.** 순서를 뒤집으면 선에 걸친 투구가 꽝 칸을 열어
          버리거나(그 칸의 정체가 공짜로 드러난다) 번호를 하나 소비한다. 걸친 투구는
          **아무것도 열지 않고** 끝나야 다음 투구에 같은 칸을 제대로 노릴 수 있다.
        ⚠ 그래서 `state` 를 건드리지 않고, `awardHidden()` 도 부르지 않는다.
        ⚠ 어느 칸에 걸쳤는지 함께 넘긴다 — 화면이 그 칸의 판정 영역을 보여 줘야 사용자가
          "조금 덜 당기면 되겠다" 를 배운다.
      */
      if (!isCellHit(stone.x, stone.y, cell)) {
        whiff('칸 선에 걸쳤어요. 가운데에 세워야 열립니다.', cell)
        return
      }

      /*
        ★ 꽝. 이미 뒤집혀 있던 칸이든 이번에 처음 뒤집는 칸이든 결과는 같다.
        ⚠ **공개된 꽝 칸을 장애물로 만들지 않는다.** 장애물로 두면 화면에 남은 위험이 하나씩
          사라져 판이 갈수록 쉬워진다. 꽝은 피해야 할 자리로 **계속 거기 있어야** 긴장이 산다.
      */
      if (state.kind === 'blank' || blankAt.has(index)) {
        state.kind = 'blank'
        reveal = { row: cell.row, col: cell.col, value: null, t: 0 }
        timer = 0
        phase = 'reveal'

        ctx.emit({ type: 'haptic', ms: 20 })
        ctx.emit({ type: 'sfx', name: 'blank' })
        ctx.emit({ type: 'status', text: `꽝이에요. ${remainWord()}` })
        if (!ctx.reducedMotion) shake = 4
        return
      }

      /*
        ★ 은닉형의 핵심 한 줄. 번호는 **이 순간 처음 존재한다** — 칸에 미리 붙어 있지 않으므로
          남은 풀에서 뽑아도 화면과 모순되지 않고, 중복이 구조적으로 불가능하다(계약).
      */
      const claimed = ctx.pool.awardHidden()

      if (claimed.ok) {
        state.kind = 'awarded'
        state.value = claimed.value
        // 이 칸은 이제 장애물이다. 다음 투구부터 스톤이 튕긴다.
        const center = cellCenter(cell.row, cell.col)
        pegs.push({ x: center.x, y: center.y })

        reveal = { row: cell.row, col: cell.col, value: claimed.value, t: 0 }
        timer = 0
        phase = 'reveal'

        ctx.emit({ type: 'haptic', ms: 40 })
        ctx.emit({ type: 'sfx', name: 'hit' })
        if (!ctx.reducedMotion) renderer.burst(center.x, center.y, 'award')
        return
      }

      // 'full' — 슬롯이 이미 찼다. 여기까지 올 일이 없지만 조용히 끝낸다.
      phase = 'done'
    }

    /**
     * 헛투구 — 보드 밖에 서거나 아웃 라인을 넘었다.
     *
     * ⚠ **기회는 이미 발사 때 소모했다.** 여기서 또 세지 않는다.
     * ⚠ 이름이 `fail` 이 아니라 `whiff` 인 것은, 계약의 `failed` **단계**(판 전체의 실패)와
     *   헷갈리지 않기 위해서다. 이 함수는 한 투구가 빗나간 것일 뿐이다.
     */
    function whiff(spoken: string, cell: { row: number; col: number } | null = null) {
      ctx.emit({ type: 'retry', reason: 'out' })
      ctx.emit({ type: 'status', text: `${spoken} ${remainWord()}` })
      ctx.emit({ type: 'haptic', ms: 20 })
      ctx.emit({ type: 'sfx', name: 'miss' })
      missAt = { x: stone.x, y: stone.y }
      missCell = cell
      missT = 0
      timer = 0
      // 계약: `reducedMotion` 이면 화면 흔들림 0.
      shake = ctx.reducedMotion ? 0 : 5
      phase = 'retry'
    }

    /**
     * 남은 기회를 말로. 화면 안 표시는 보조기술에 투명하므로 **숫자를 말로 함께 준다**(계약).
     */
    function remainWord(): string {
      const left = Math.max(0, MAX_ATTEMPTS - attemptsUsed)
      return left > 0 ? `남은 기회 ${left}번.` : '기회를 모두 썼어요.'
    }

    /**
     * 판이 끝났는지 보고, 끝났으면 마무리한다.
     *
     * ⚠ **완료를 먼저 본다.** 마지막 기회로 여섯 번째를 얻은 경우 두 조건이 동시에 참인데,
     *   그때는 성공이다. 순서를 뒤집으면 다 모으고도 실패 화면을 보게 된다.
     */
    function finishIfOver(): boolean {
      if (ctx.pool.complete) {
        /*
          ⚠ 완료를 **말로** 다시 알리지 않는다. 호스트가 여섯 번째 획득에서 이미 읽힌다.
          ⚠ 반면 `phase` 는 **게임만 보낼 수 있다.** 이것을 보내야 호스트가 "다시하기 ·
            번호확인" 오버레이를 띄운다. 문구는 호스트 기본값을 쓴다.
        */
        phase = 'done'
        ctx.emit({ type: 'sfx', name: 'clear' })
        setPhase('cleared')
        return true
      }

      if (attemptsUsed >= MAX_ATTEMPTS) {
        phase = 'done'
        ctx.emit({ type: 'sfx', name: 'fail' })
        /*
          ⚠ 제목은 호스트 기본값("6개 번호 모으기 실패")을 쓰고 **보조 문구만** 덮는다.
            몇 개를 모았는지는 게임마다 다른 정보라 계약이 허용하는 예외에 해당한다.
        */
        const got = ctx.pool.awarded.length
        setPhase('failed', `${got}개를 모았습니다. 다시 도전해 보세요.`)
        return true
      }

      return false
    }

    /** 다음 투구를 위해 스톤을 시작점으로 되돌린다. 조준값은 **그대로 둔다.** */
    function resetStone() {
      stone.x = START.x
      stone.y = START.y
      stone.px = START.x
      stone.py = START.y
      stone.vx = 0
      stone.vy = 0
      stone.hit = null
      trail.length = 0
      /*
        ⚠ 조준값(각도·세기)을 초기화하지 않는 것은 의도한 것이다. 방금 던진 세기에서 조금만
          옮기고 싶은 것이 보통이고, 특히 키보드 사용자는 매번 0 에서 다시 올려야 한다면
          한 판에 조준만 30초를 쓴다.
      */
      pathDirty = true
    }

    /* ── 게임 인스턴스 ────────────────────────────────────── */

    const instance: GameInstance = {
      fixedUpdate(dt) {
        renderer.update(dt)
        if (shake > 0) shake = Math.max(0, shake - dt * 22)
        if (showTutorial && phase === 'aim' && !awaitingStart) tutorialT += dt

        switch (phase) {
          case 'aim':
            updateAim(dt)
            break

          case 'slide':
            updateSlide(dt)
            break

          case 'reveal':
            timer += dt
            if (reveal !== null) reveal.t = Math.min(1, timer / REVEAL_SEC)
            if (timer >= REVEAL_SEC) {
              reveal = null
              if (!finishIfOver()) {
                resetStone()
                phase = 'aim'
              }
            }
            break

          case 'retry':
            timer += dt
            missT = Math.min(1, timer / RETRY_SEC)
            if (timer >= RETRY_SEC) {
              missAt = null
              missCell = null
              if (!finishIfOver()) {
                resetStone()
                phase = 'aim'
              }
            }
            break

          case 'done':
            break
        }
      },

      draw(c, alpha, timeMs) {
        /*
          ⚠ 매 프레임 다시 잰다. 리사이즈·회전·주소창 접힘으로 캔버스 비율이 수시로 바뀌는데,
            그때마다 조준이 어긋나면 원인을 찾을 수 없는 종류의 버그가 된다.
        */
        const cw = c.canvas.width
        const ch = c.canvas.height
        pointerScaleY = cw > 0 && ch > 0 ? (STAGE.width / STAGE.height) * (ch / cw) : 1

        view.phase = phase
        view.angle = angle
        view.pull = pull
        view.path = path
        view.reveal = reveal
        view.missAt = missAt
        view.missT = missT
        view.missCell = missCell
        view.shake = shake
        view.dragging = dragging
        view.attemptsLeft = Math.max(0, MAX_ATTEMPTS - attemptsUsed)
        view.showTutorial = showTutorial && !awaitingStart
        view.tutorialT = tutorialT
        renderer.draw(c, view, alpha, timeMs)
      },

      handle(input: GameInput) {
        if (input.kind === 'pointer') {
          if (input.phase === 'down') {
            if (phase !== 'aim') return
            /*
              오버레이가 캔버스를 덮고 있어 여기까지 오지 않는 것이 보통이지만, 덮이지 않는
              경로가 생기더라도 조준 없이 날아가지 않도록 시작 신호로만 받는다.
            */
            if (awaitingStart) {
              beginPlay()
              return
            }
            dragging = true
            applyDrag(input.x, input.y * pointerScaleY)
            return
          }
          if (input.phase === 'move') {
            if (dragging) applyDrag(input.x, input.y * pointerScaleY)
            return
          }
          /*
            up 과 cancel 을 같게 다룬다(계약). iOS 스와이프에서 cancel 이 자주 오는데, 그때
            발사되어도 억울하지 않은 이유는 살짝 스친 정도면 당김이 최소치에 못 미쳐
            `short` 로 걸러지기 때문이다.
          */
          if (dragging) {
            dragging = false
            launch()
          }
          return
        }

        if (input.phase === 'down' && input.action === 'primary') {
          /*
            ⚠ 캔버스를 누르면 호스트가 `pointer down` 을 먼저 보내고 **이어서** 이 action 을
              보낸다. 그때는 방금 드래그가 시작된 참이라 발사하면 안 된다. 반면 캔버스 밖
              DOM 버튼과 스페이스·엔터는 pointer 없이 이것만 온다 — 이 한 줄이 그 둘을 가른다.
          */
          if (dragging) return
          /* ★ 시작 버튼이 보낸 첫 입력이다. 삼키고 판을 연다(계약: 시작은 primary 로 온다). */
          if (awaitingStart) {
            beginPlay()
            return
          }
          launch()
        }
      },

      onPause() {
        /*
          ⚠ 탭이 가려지는 순간 손가락을 뗀 것으로 본다. 남겨 두면 돌아왔을 때 드래그가
            이어진 것처럼 굴어 키 조작이 먹지 않는다.
        */
        dragging = false
      },

      destroy() {
        renderer.destroy()
      },
    }

    // 첫 조준선을 미리 계산해 둔다. 첫 프레임부터 궤적이 보여야 무엇을 하는 게임인지 안다.
    refreshPath()
    ctx.emit({
      type: 'hint',
      text: '아래로 당겼다 놓으면 미끄러집니다. 칸 가운데에 세워야 열려요.',
    })
    emitAttempts()

    /*
      ★ **이미 끝난 판으로 열릴 수 있다**(계약: "이미 끝난 판으로 시작될 때").
      호스트는 완주 기록이 `sessionStorage` 에 남은 30분 동안 획득 번호를 `pool` 에 미리 채운
      채로 `create` 한다. 그때 `ready` 를 보내면 **더 얻을 것이 없는 사람에게 "게임시작" 을
      내밀고**, 눌러도 아무것도 나오지 않는 판이 돌아간다. 내부 상태(`phase`)도 이미 `done`
      으로 시작하므로 오버레이 뒤에서 스톤이 혼자 움직이지도 않는다.
    */
    if (ctx.pool.complete) {
      setPhase('cleared')
    } else {
      setPhase('ready')
    }

    return instance
  },
}

export default game
