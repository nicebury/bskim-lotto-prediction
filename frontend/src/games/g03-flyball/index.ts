import { GAMES } from '@/games/core/catalog'
import { readPalette } from '@/games/core/palette'
import { ballRange } from '@/lib/lotto'
import type {
  GameContext,
  GameInput,
  GameInstance,
  GameModule,
  GamePhase,
  Palette,
  Reservation,
} from '@/games/core/types'

import {
  BALL_R,
  BREAK_SEC,
  CAM_LEAD,
  CHANCES,
  DIFFICULTY_SPAN,
  FLASH_GREAT,
  FLASH_PERFECT,
  GROUND_Y,
  HIT_H,
  HIT_X,
  HUGE_METERS,
  LONG_METERS,
  MILESTONE_SEC,
  MIN_METERS,
  MISS_GRACE,
  MISS_SEC,
  PITCHER_X,
  PITCH_JITTER,
  PITCH_JITTER_CAP,
  PITCH_T_FROM,
  PITCH_T_TO,
  RELEASE_H,
  RESULT_SEC,
  SHAKE_GOOD,
  SHAKE_GREAT,
  SHAKE_PERFECT,
  SHAKE_SEC,
  SHAKE_WEAK,
  SLOWMO_RATE,
  SLOWMO_SEC,
  STOP_GOOD,
  STOP_GREAT,
  STOP_PERFECT,
  STOP_WEAK,
  SWING_SEC,
  WIND_SEC,
  WIN_GOOD,
  WIN_PERFECT,
  WORLD_LEN,
  angleOf,
  gravityOf,
  judgeLabel,
  judgeOf,
  speedOf,
  type Judge,
} from './constants'
import {
  createBatted,
  launchBatted,
  metersOf,
  pitchAt,
  predictMeters,
  screenYOf,
  stepBatted,
} from './physics'
import { createScene } from './scene'

/**
 * G03 · 로또볼 홈런 — 본체.
 *
 * → 사양서: docs/wiki/20-design/game-g03-flyball.md
 * → 계약:   docs/wiki/10-contracts/playground-game-contract.md
 *
 * ── 한 문장 ────────────────────────────────────────────────────────
 * **내가 눌러 공을 부르고**, 타격 존을 지날 때 **다시 눌러 때린다.** 60m 를 넘겨야
 * 번호를 얻고, 150m 를 넘으면 장타다.
 *
 * ── 한 타석 ────────────────────────────────────────────────────────
 * `set`(내가 누를 때까지 기다린다) → 탭 → `wind` → `pitch`(공이 온다) → 탭 →
 * `stop`(히트스톱) → `fly`(타구·최대 4.2초) → `result` → 다시 `set`.
 * 기회 9번을 다 쓰면 `failed`, 여섯 개를 모으면 `cleared`.
 *
 * ── ⚠ 왜 탭이 둘인가 (2026-09-17) ──────────────────────────────────
 * 공이 알아서 계속 오면 **내 리듬이 아니라 게임의 리듬**이라 기다리는 동안 딴생각이 나고
 * 그러다 대충 누르게 된다. 내가 한 타석을 열면 그 순간부터 온 신경이 공에 간다.
 * 09-10 에 버린 두 번째 탭은 *게이지를 기다리는* 탭이었고 이것은 **시작하는** 탭이라
 * 성격이 정반대다.
 *
 * ── ⚠ 번호를 미리 보여주지 않는다 ──────────────────────────────────
 * 매 타석 전에 `pool.reserve()` 로 하나 잡지만 **값을 그리지 않는다.** 공에는 그 값의
 * 구간 색만 칠한다(계약의 색 힌트형).
 *
 * ── ⚠ 이 게임이 지키는 것 ──────────────────────────────────────────
 * · 번호를 스스로 고르지 않는다. `pool` 이 준 예약 토큰만 다룬다(계약 원칙 2).
 * · 색을 스스로 정하지 않는다. 전부 팔레트에서 온다(→ `create` 안의 `live` 주석).
 * · 난수는 `ctx.rng` 만 쓰고, 배경 연출은 `fork()` 한 독립 스트림을 쓴다.
 * · 자기 폴더 밖 파일을 고치지 않는다. `core/` 와 `lib/lotto` 는 읽기만 한다.
 *
 * ── ⚠ 좌표 두 가지가 섞여 있다 ─────────────────────────────────────
 * 월드에 붙은 것(공·타자·투수·눈금·파티클)은 **월드 x** 로 다루고 그릴 때 카메라를 뺀다.
 * 화면에 붙은 것(기회 점·비거리 배지·판정 문구)은 처음부터 화면 좌표다.
 */

const meta = GAMES.find((g) => g.slug === 'flyball')
if (meta === undefined) {
  // catalog 와 폴더가 어긋난 상태다. 조용히 넘어가면 원인을 찾기 어렵다.
  throw new Error("catalog.ts 에 'flyball' 항목이 없습니다")
}

/* ── 화면 고정 HUD 배치 ──────────────────────────────────────── */

/** 남은 기회 점. 왼쪽 위에 가로로 늘어놓는다. */
const CHIP_X = 14
const CHIP_Y = 20
const CHIP_R = 5
const CHIP_GAP = 13

/** 비거리 배지. */
const BADGE_W = 104
const BADGE_H = 28
const BADGE_Y = 8

/** 불꽃 꼬리에 쓸 지난 위치 개수. 비거리가 늘어 종전(10)보다 길게 잡는다. */
const TRAIL = 16

/** 카메라가 갈 수 있는 가장 오른쪽. */
const CAM_MAX = WORLD_LEN - meta.stage.width

/** 볼 껍질 조각 개수. */
const SHARDS = 6

/** 임팩트 링이 퍼지는 시간(초). */
const IMPACT_SEC = 0.36

/** 판정 문구가 떠 있는 시간(초). */
const LABEL_SEC = 0.9

/** 스윙한 자리 표식이 남는 시간(초). */
const MARK_SEC = 0.8

type Step = 'ready' | 'set' | 'wind' | 'pitch' | 'stop' | 'fly' | 'result' | 'over'

const game: GameModule = {
  meta,

  create(ctx: GameContext): GameInstance {
    const { stage, pool, draw, rng } = ctx

    /*
      ★ 테마를 따라가는 팔레트.

      ⚠ **`ctx.palette` 를 직접 쓰면 다크 토글이 캔버스 안까지 오지 않는다.** 호스트
        (`GameCanvas`)는 `watchPalette` 로 **자기 지역 변수**만 갈아 끼우고, `create` 에
        넘긴 객체는 그 시점의 스냅샷 그대로다. `DrawKit` 은 `() => palette` 클로저라 최신
        색을 보므로 **`draw.*` 로 그린 것만 테마를 따라가고, 게임이 직접 칠한 하늘·잔디·
        흙·관중석·기회 점은 옛 색에 남는다** — 화면이 반씩 갈린다.

      ⚠ 그래서 **직접 다시 읽는다.** G04·G06 이 먼저 쓴 우회다. `readPalette()` 는
        `core/` 의 읽기 전용 함수이므로 소유 경계를 넘지 않는다.
      ⚠ **매 프레임 읽지 않는다.** 진짜 비용은 `scene` 의 오프스크린 캐시를 다시 굽는
        쪽이다. 테마 전환은 사람이 누르는 일이라 1초 지연이 보이지 않는다.
    */
    let live: Palette = ctx.palette
    let paletteT = 0
    const PALETTE_POLL_SEC = 1

    const scene = createScene({
      stage,
      draw,
      palette: () => live,
      // ⚠ 배경은 반드시 fork 한 스트림을 쓴다. 물리 난수를 소비하면 재현성이 깨진다(계약).
      bgRng: rng.fork(),
      reducedMotion: ctx.reducedMotion,
      quality: ctx.quality,
    })

    const batted = createBatted()
    const particles = draw.particles(90)

    let step: Step = 'ready'
    /** 현재 단계에 머문 시간(초). 연출 타이밍은 전부 이 값으로 잰다. */
    let stepT = 0
    /** 첫 `fixedUpdate` 에서 한 번만 도는 초기화. */
    let started = false

    /** 이번 타석의 예약. **값을 화면에 그리지 않는다** — 색만 쓴다. */
    let slot: Reservation | null = null

    let chancesLeft = CHANCES
    /** 투구가 타격점에 닿는 시각(초). 난이도가 이 값을 조인다. */
    let pitchDur = PITCH_T_FROM
    /** 릴리스부터의 경과. `pitch` 단계에서만 흐른다. */
    let pitchT = 0
    /** 이번 투구에 이미 스윙했는가. 연타로 두 번 판정되는 것을 막는다. */
    let swung = false
    /**
     * 배트 회전 진행도.
     * `0~1` 스윙 · `1~2.2` 되돌아옴 · `2.2` 이상 대기 자세(→ `scene.drawBatter`).
     */
    let swingT = 3

    let judge: Judge = 'miss'
    /** 히트스톱 남은 시간. 0 보다 크면 **물리만** 멈춘다. */
    let stopT = 0
    let shakeT = 0
    let shakeAmp = 0
    /** 임팩트 링 진행(초). 큰 값이면 그리지 않는다. */
    let impactT = 99
    /** 흰 플래시 남은 시간과 그 총길이. */
    let flashT = 0
    let flashSpan = 1
    /**
     * 슬로모션 누적기. `SLOWMO_RATE` 씩 더해 1 을 넘을 때만 물리를 한 스텝 돌린다.
     *
     * ⚠ **`dt` 를 줄여서 늦추지 않는다.** 계약이 *"dt 는 항상 1/60"* 이라고 못 박았고,
     *   스텝 크기를 바꾸면 적분 결과가 튜닝 때 돌린 전수 시뮬레이션과 달라진다.
     *   **스텝을 건너뛰면** 크기가 그대로라 비거리가 정확히 같다.
     */
    let slowT = 0
    let slowAcc = 0

    /**
     * ★ 이번 타구가 몇 미터까지 갈지 — **발사 순간에 이미 안다.**
     *
     * ⚠ 화면에 보여주지 않는다. 오직 연출을 미리 걸기 위한 값이다(→ `physics.predictMeters`).
     */
    let predicted = 0

    /** 직전 결과 — 결과 화면과 배지가 읽는다. */
    let lastMeters = 0
    let lastValue = 0
    let lastGained = false
    /** 볼이 깨지는 연출 진행(초). */
    let breakT = 99
    /** 스윙한 순간 공이 있던 월드 x. 얼마나 이르거나 늦었는지 보여 준다. */
    let markX = 0
    let markT = 99

    /** 비행 중 마일스톤 — 각각 한 번만 터진다. */
    let hitLine = false
    let hitLong = false
    let hitHuge = false
    let lineGlowT = 99
    let milestone = ''
    let milestoneT = 99

    let camX = 0
    let prevCamX = 0

    /** 타구 이력(불꽃 꼬리용). 링버퍼라 매 스텝 할당이 없다. */
    const trailX = new Float32Array(TRAIL)
    const trailH = new Float32Array(TRAIL)
    let trailAt = 0
    let trailLen = 0

    /*
      ⚠ 마지막으로 보낸 문구를 기억해 **같은 값을 다시 보내지 않는다.** `emit` 은 결국
        React 상태 갱신으로 이어지므로 매 스텝 부르면 초당 60번 리렌더가 걸린다.
    */
    let lastHint = ''
    let lastStatus = ''
    let lastPhase: GamePhase | '' = ''

    function sayHint(text: string): void {
      if (text === lastHint) return
      lastHint = text
      ctx.emit({ type: 'hint', text })
    }

    function sayStatus(text: string): void {
      if (text === lastStatus) return
      lastStatus = text
      ctx.emit({ type: 'status', text })
    }

    /**
     * 진행 단계를 호스트에 알린다.
     *
     * ⚠ **`'playing'` 을 보내지 않으면 시작 오버레이가 영영 사라지지 않는다.** 호스트는
     *   `phase !== 'playing'` 인 동안 캔버스 위에 오버레이를 덮어 둔다(2026-09-10 에 실제로
     *   그렇게 나갔다). 보내는 자리는 **판이 실제로 시작되는 지점**이어야 한다.
     * ⚠ `'playing'` 만 중복을 걸러 낸다. 매 타석마다 부르는 자리라 거르지 않으면 호스트의
     *   상태 갱신이 계속 돈다.
     */
    function sayPhase(phase: GamePhase, title?: string, text?: string): void {
      if (phase === 'playing' && lastPhase === 'playing') return
      lastPhase = phase
      ctx.emit({ type: 'phase', phase, title, text })
    }

    /**
     * 이번 투구가 타격점에 닿기까지의 시간(초).
     *
     * 획득 수에 따라 공이 빨라진다 — 판정 창과 물리는 끝까지 그대로다(사양서).
     *
     * ★ **매 투구마다 흔든다.** 이것이 없으면 탭에서 타격점까지가 늘 같은 시간이라
     *   **몇 번 치면 리듬을 외워 공을 보지 않고도 맞힌다** — 타이밍 게임이 아니라 리듬 암기
     *   게임이 된다(사용자 지적 "너무 쉬워"의 진짜 원인).
     * ⚠ 흔들림은 **유효 창보다 커야** 리듬만으로는 맞힐 수 없다(→ `PITCH_JITTER` 주석).
     * ⚠ 반드시 `ctx.rng` 를 쓴다 — 같은 시드면 같은 투구가 재현된다. 브라우저 표준 난수는
     *   계약이 금지하고, **검증 게이트는 주석까지 문자열로 훑으므로 경고문에도 그 이름을
     *   적지 않는다**(2026-09-10 에 다른 게임이 먼저 밟은 함정이다).
     */
    function pitchDuration(): number {
      const t = draw.clamp(pool.awarded.length / DIFFICULTY_SPAN, 0, 1)
      const base = draw.lerp(PITCH_T_FROM, PITCH_T_TO, t)
      const jitter = Math.min(PITCH_JITTER, base * PITCH_JITTER_CAP)
      return base + rng.range(-jitter, jitter)
    }

    /** 지금 공이 월드에서 움직이는 속도(px/s). 타격 존 폭의 근거다. */
    function ballSpeed(): number {
      return (PITCHER_X - HIT_X) / pitchDur
    }

    /** 살아 있는 예약을 되돌린다. 놓친 공의 번호는 다음 타석에 다시 나올 수 있다. */
    function releaseSlot(): void {
      if (slot === null) return
      pool.release(slot.token)
      slot = null
    }

    /** 판이 끝났다. 호스트가 오버레이와 버튼을 그린다. */
    function finish(cleared: boolean): void {
      releaseSlot()
      step = 'over'
      stepT = 0
      sayHint('')
      ctx.emit({ type: 'sfx', name: cleared ? 'clear' : 'fail' })
      /*
        ⚠ **문구를 게임이 정하지 않는다**(계약 2026-09-16). 호스트가 `defaultCopy()` 로
          여섯 게임 공통 문구를 갖는다. 게임이 덮는 것은 **"게임마다 달라야 하는 것" 뿐**이고,
          여기서는 실패했을 때 몇 개를 모았는지다.
      */
      if (cleared) {
        sayPhase('cleared')
      } else {
        sayPhase('failed', undefined, `${pool.awarded.length}개를 모았습니다. 다시 도전해 보세요.`)
      }
    }

    /**
     * 새 타석 — 예약을 잡고 **내가 누를 때까지 기다린다.**
     *
     * ⚠ 예약을 **던지기 전에** 잡는다. 공에 칠할 색이 그 예약값에서 나오기 때문이다.
     *   투수가 공을 들고 선 `set` 단계부터 색이 보여야 "이번엔 파란 볼이네" 가 성립한다.
     */
    function beginTurn(): void {
      if (pool.complete) {
        finish(true)
        return
      }
      if (chancesLeft <= 0) {
        finish(false)
        return
      }

      releaseSlot()
      slot = pool.reserve()
      if (slot === null) {
        /*
          남은 번호가 없다 — 슬롯이 6개뿐이라 실제로는 일어나지 않는다(45개 중 최대 6개만
          빠진다). 그래도 판을 멈추지 않고 닫는다. 여기서 무한 대기에 빠지는 것이 가장 나쁘다.
        */
        finish(pool.complete)
        return
      }

      pitchDur = pitchDuration()
      pitchT = 0
      swung = false
      swingT = 3
      breakT = 99
      impactT = 99
      markT = 99
      lastMeters = 0
      camX = 0
      prevCamX = 0
      hitLine = false
      hitLong = false
      hitHuge = false
      lineGlowT = 99
      milestoneT = 99
      step = 'set'
      stepT = 0
      /*
        ★ 여기서 오버레이가 걷힌다. `beginTurn` 은 앞쪽에서 `finish` 로 빠질 수 있으므로
          **실제로 타석이 열리는 이 자리**에서 알려야 한다 — 함수 첫 줄에서 알리면 끝난
          판에도 `'playing'` 을 보내 완료 오버레이를 지워 버린다.
      */
      sayPhase('playing')
      sayHint('눌러서 공을 던지게 하세요.')
    }

    /** 내가 눌렀다 → 투수가 던진다. */
    function pitchNow(): void {
      step = 'wind'
      stepT = 0
      pitchT = 0
      ctx.emit({ type: 'sfx', name: 'shoot' })
      sayHint('타격 존에 공이 올 때 눌러서 스윙하세요.')
    }

    /** 기회 하나를 쓴다. 헛스윙·놓침·60m 미만·획득이 모두 여기를 지난다. */
    function useChance(): void {
      chancesLeft = Math.max(0, chancesLeft - 1)
      ctx.emit({ type: 'attempt', used: CHANCES - chancesLeft, total: CHANCES })
    }

    /** 스윙. 판정은 **입력 즉시** 난다 — 배트 회전은 그림일 뿐이다. */
    function swing(): void {
      if (swung) return
      swung = true
      swingT = 0

      const delta = pitchT - pitchDur
      judge = judgeOf(delta)

      // 친 자리 표식 — 얼마나 이르거나 늦었는지 눈으로 보여 준다.
      markX = pitchAt(pitchT, pitchDur).x
      markT = 0

      if (judge === 'miss') {
        useChance()
        ctx.emit({ type: 'sfx', name: 'miss' })
        ctx.emit({ type: 'haptic', ms: 10 })
        lastGained = false
        lastMeters = 0
        sayStatus(`헛스윙. 남은 기회 ${chancesLeft}번.`)
        releaseSlot()
        step = 'result'
        stepT = 0
        return
      }

      const angle = angleOf(delta)
      const v0 = speedOf(delta)
      const g = gravityOf(delta)
      launchBatted(batted, angle, v0, g)
      /*
        ★ 장타가 될 타구인지 **지금** 정한다. 사용자 요구가 *"200을 넘기는 장타는 치는 공이
          뜨는 순간부터 불이 붙어도 좋겠다"* 였는데, 착지를 기다려서는 그 순간이 이미 지난다.
      */
      predicted = predictMeters(angle, v0, g)
      trailLen = 0
      trailAt = 0

      /*
        타격감을 한꺼번에 건다(사양서). 판정이 좋을수록 전부 커진다 — 히트스톱만 길게
        하거나 흔들림만 키우면 "묵직함" 이 아니라 "버벅임" 으로 읽힌다.
      */
      stopT =
        judge === 'perfect'
          ? STOP_PERFECT
          : judge === 'great'
            ? STOP_GREAT
            : judge === 'good'
              ? STOP_GOOD
              : STOP_WEAK
      shakeAmp = ctx.reducedMotion
        ? 0
        : judge === 'perfect'
          ? SHAKE_PERFECT
          : judge === 'great'
            ? SHAKE_GREAT
            : judge === 'good'
              ? SHAKE_GOOD
              : SHAKE_WEAK
      shakeT = shakeAmp > 0 ? SHAKE_SEC : 0
      impactT = 0

      /*
        ★ 잘 맞은 순간을 **0.1초 안에** 알려 준다. 그래야 그 뒤 4초의 비행을 기대하며 본다.
        ⚠ `reducedMotion` 이면 플래시를 걸지 않는다 — 화면 전체가 번쩍이는 것은 계약이 말한
          "장식" 중에서도 가장 부담이 큰 쪽이다.
      */
      if (!ctx.reducedMotion && (judge === 'perfect' || judge === 'great')) {
        flashSpan = judge === 'perfect' ? FLASH_PERFECT : FLASH_GREAT
        flashT = flashSpan
      }
      // 완벽에만 슬로모션. 히트스톱이 끝난 뒤 `fly` 로 넘어가면서 걸린다.
      slowT = !ctx.reducedMotion && judge === 'perfect' ? SLOWMO_SEC : 0
      slowAcc = 0

      ctx.emit({ type: 'sfx', name: 'shoot' })
      ctx.emit({ type: 'haptic', ms: judge === 'perfect' || judge === 'great' ? 40 : 20 })

      if (!ctx.reducedMotion && slot !== null) {
        const n =
          ctx.quality.level === 'low' ? 8 : judge === 'perfect' ? 26 : judge === 'great' ? 20 : 14
        particles.burst(
          HIT_X,
          screenYOf(HIT_H, GROUND_Y, BALL_R),
          n,
          live.ball[ballRange(slot.value)],
          judge === 'perfect' ? 190 : 120,
        )
      }

      step = 'stop'
      stepT = 0
    }

    /** 공이 타격점을 지나쳐 갔다. 스윙하지 않았으므로 기회만 없어진다. */
    function missed(): void {
      useChance()
      ctx.emit({ type: 'sfx', name: 'miss' })
      lastGained = false
      lastMeters = 0
      sayStatus(`놓쳤어요. 남은 기회 ${chancesLeft}번.`)
      releaseSlot()
      step = 'result'
      stepT = 0
    }

    /**
     * 타구가 착지했다. 60m 문턱으로 갈린다.
     *
     * ⚠ **기회는 어느 쪽이든 소모한다.** 잘 맞혀도 줄어들기 때문에 9번 안에 여섯 번을
     *   넘겨야 한다는 긴장이 생긴다.
     */
    function land(): void {
      lastMeters = metersOf(batted)
      const current = slot

      if (!ctx.reducedMotion) {
        // 착지 먼지. 멀리 날아갔을수록 크게 인다.
        const heavy = lastMeters >= LONG_METERS
        particles.burst(
          batted.x,
          screenYOf(0, GROUND_Y, BALL_R),
          ctx.quality.level === 'low' ? 5 : heavy ? 16 : 10,
          live.textMuted,
          heavy ? 140 : 90,
        )
      }

      if (current !== null && lastMeters >= MIN_METERS) {
        const result = pool.commit(current.token)
        slot = null
        if (result.ok) {
          lastGained = true
          lastValue = result.value
          breakT = 0
          useChance()
          ctx.emit({ type: 'sfx', name: 'hit' })
          ctx.emit({ type: 'haptic', ms: 40 })
          sayStatus(
            `${result.value}번을 얻었습니다. ${lastMeters}미터. 남은 기회 ${chancesLeft}번.`,
          )
          if (!ctx.reducedMotion) {
            particles.burst(
              batted.x,
              screenYOf(0, GROUND_Y, BALL_R),
              ctx.quality.level === 'low' ? 6 : 14,
              live.ball[ballRange(result.value)],
              130,
            )
          }
          step = 'result'
          stepT = 0
          return
        }
        /*
          `commit` 이 실패했다 — 호스트와 어긋난 상태(이미 release 됐거나 슬롯이 찼다).
          판을 멈추지 말고 소득 없는 타구로 처리한다. 판이 죽는 것보다 한 번 버리는 편이 낫다.
        */
      }

      releaseSlot()
      lastGained = false
      useChance()
      ctx.emit({ type: 'sfx', name: 'blank' })
      sayStatus(`${lastMeters}미터. ${MIN_METERS}미터를 넘겨야 해요. 남은 기회 ${chancesLeft}번.`)
      step = 'result'
      stepT = 0
    }

    /**
     * 비행 중 마일스톤.
     *
     * ⚠ **지나간 순간에만 한 번씩** 터뜨린다. 매 프레임 조건을 검사해 계속 그리면 문구가
     *   깜빡이고 연출이 겹쳐 걸린다. 그래서 깃발을 따로 둔다.
     */
    function checkMilestones(m: number): void {
      if (!hitLine && m >= MIN_METERS) {
        hitLine = true
        // 기준선을 넘는 순간 선이 한 번 빛난다 — 착지 전에 "이건 성공" 을 알려 준다.
        lineGlowT = 0
      }
      if (!hitLong && m >= LONG_METERS) {
        hitLong = true
        milestone = '장타!'
        milestoneT = 0
        ctx.emit({ type: 'haptic', ms: 20 })
      }
      if (!hitHuge && m >= HUGE_METERS) {
        hitHuge = true
        milestone = '초대형 타구!'
        milestoneT = 0
        ctx.emit({ type: 'haptic', ms: 40 })
      }
    }

    /** 대기·연출을 건너뛰고 다음으로. 탭이 헛돌지 않게 한다. */
    function advance(): void {
      if (step === 'ready') {
        beginTurn()
        return
      }
      if (step === 'set') {
        pitchNow()
        return
      }
      if (step === 'pitch') {
        swing()
        return
      }
      if (step === 'result') {
        // 연출을 끝까지 보지 않아도 되게 한다. 아홉 번 치는 동안 이 대기가 가장 지루하다.
        beginTurn()
      }
      /*
        ⚠ `wind` 에서는 아무것도 하지 않는다. 받으면 던지자마자 두 번째 탭이 그대로
          헛스윙으로 먹혀, **빠르게 두 번 누르는 사람이 매번 기회를 잃는다.**
      */
    }

    /* ── 그리기 ───────────────────────────────────────────────── */

    /**
     * 번호가 **없는** 볼. 날아오는 공과 타구가 이것으로 그려진다.
     *
     * ⚠ `draw.ball()` 을 쓰지 않는 유일한 자리다. 그 함수는 숫자를 반드시 그리는데,
     *   여기서는 숫자를 보여주면 안 된다(색 힌트형). 대신 **채움·하이라이트·안쪽 링을
     *   `ball()` 과 똑같은 규칙으로** 그려 같은 볼로 보이게 한다.
     */
    function drawPlainBall(
      c: CanvasRenderingContext2D,
      x: number,
      y: number,
      r: number,
      color: string,
    ): void {
      c.save()

      c.fillStyle = color
      c.beginPath()
      c.arc(x, y, r, 0, Math.PI * 2)
      c.fill()

      // 좌상단 광원(규칙 3).
      const hx = x - r * 0.35
      const hy = y - r * 0.35
      const hl = c.createRadialGradient(hx, hy, 0, hx, hy, r * 1.1)
      hl.addColorStop(0, 'rgba(255,255,255,0.55)')
      hl.addColorStop(1, 'rgba(255,255,255,0)')
      c.fillStyle = hl
      c.beginPath()
      c.arc(x, y, r, 0, Math.PI * 2)
      c.fill()

      c.lineWidth = 1
      c.strokeStyle = 'rgba(0,0,0,0.18)'
      c.beginPath()
      c.arc(x, y, r - 0.5, 0, Math.PI * 2)
      c.stroke()

      /*
        야구공 실밥 두 줄. 이것이 "이건 야구공이다" 를 말하는 유일한 표시다.

        ⚠ **호의 중심을 공 밖 멀리 둔다**(2026-09-17). 종전에는 중심이 `±1.15r`, 반지름이
          `1.35r` 이라 **두 호가 공 한가운데서 만나** 세로로 긴 타원이 생겼고, 확대해 보면
          공이 아니라 **눈알처럼** 보였다(실측). 중심을 `±1.9r`, 반지름을 `1.6r` 로 밀면
          호가 좌우 가장자리에 얕게 걸려 진짜 실밥 곡선이 된다.
      */
      c.lineWidth = 1.3
      c.strokeStyle = 'rgba(0,0,0,0.26)'
      c.beginPath()
      c.arc(x - r * 1.9, y, r * 1.6, -0.52, 0.52)
      c.stroke()
      c.beginPath()
      c.arc(x + r * 1.9, y, r * 1.6, Math.PI - 0.52, Math.PI + 0.52)
      c.stroke()

      c.restore()
    }

    /**
     * 불꽃 꼬리. 안타 이상의 타구에만 붙고 **비거리가 늘수록 길고 진해진다.**
     *
     * ⚠ 길이를 판정이 아니라 **지금까지 날아간 거리**로 정한다. 그래야 150m·250m 를 지날 때
     *   꼬리가 눈에 띄게 자라 "점점 멀리 간다" 가 그림으로 전해진다.
     */
    function drawFlame(c: CanvasRenderingContext2D, p: Palette, cam: number, m: number): void {
      if (judge === 'weak' || judge === 'miss' || trailLen < 3) return
      /*
        ★ **장타가 될 타구는 뜨는 순간부터 최대로 탄다**(사용자 요구). 그렇지 않은 타구만
          날아간 거리에 비례해 자란다.
        ⚠ 판정이 아니라 **예상 비거리**로 가른다 — 안타 구간의 위쪽도 200m 를 넘을 수 있어
          판정과 장타 여부가 정확히 일치하지 않는다.
      */
      const grow = predicted >= LONG_METERS ? 1 : draw.clamp(m / LONG_METERS, 0.35, 1)
      const count =
        ctx.quality.level === 'low' ? 5 : Math.min(trailLen, Math.round(TRAIL * grow) + 2)
      c.save()
      /*
        ★ 장타에는 공 자체에 불의 기운을 씌운다. 꼬리만으로는 "뒤에 뭔가 따라온다" 이지
          **"공이 탄다"** 가 아니다.
      */
      if (predicted >= LONG_METERS && trailLen > 0) {
        const head = (trailAt - 1 + TRAIL) % TRAIL
        const hx = trailX[head] - cam
        const hy = screenYOf(trailH[head], GROUND_Y, BALL_R)
        const halo = c.createRadialGradient(hx, hy, BALL_R * 0.4, hx, hy, BALL_R * 2.4)
        halo.addColorStop(0, p.ball[1])
        halo.addColorStop(0.5, p.svc.reco)
        halo.addColorStop(1, 'rgba(0,0,0,0)')
        c.globalAlpha = predicted >= HUGE_METERS ? 0.75 : 0.55
        c.fillStyle = halo
        c.beginPath()
        c.arc(hx, hy, BALL_R * 2.4, 0, Math.PI * 2)
        c.fill()
        c.globalAlpha = 1
      }
      for (let i = 1; i < count; i += 1) {
        const idx = (trailAt - i + TRAIL * 2) % TRAIL
        const t = i / count
        /*
          뒤로 갈수록 작아지고 옅어진다. 색은 앞이 노랑(가장 뜨거운 쪽), 뒤가 주황이다 —
          거꾸로 두면 불이 아니라 연기로 보인다.
          ⚠ **`palette.warning` 을 불꽃에 쓰지 않는다**(2026-09-10 함정). 그 토큰은 연한 배경
            위 경고 **글자용**이라 라이트 모드에서 어두운 갈색이다.
        */
        c.globalAlpha = (1 - t) * 0.6 * grow
        c.fillStyle = t < 0.4 ? p.ball[1] : p.svc.reco
        c.beginPath()
        c.arc(
          trailX[idx] - cam,
          screenYOf(trailH[idx], GROUND_Y, BALL_R),
          BALL_R * (1 - t * 0.7) * grow,
          0,
          Math.PI * 2,
        )
        c.fill()
      }
      c.restore()
    }

    /** 임팩트 연출 — 퍼지는 링 2겹 + 방사 선. 타격감의 절반이 여기서 나온다. */
    function drawImpact(c: CanvasRenderingContext2D, p: Palette, cam: number): void {
      if (impactT > IMPACT_SEC) return
      const t = draw.clamp(impactT / IMPACT_SEC, 0, 1)
      const x = HIT_X - cam
      const y = screenYOf(HIT_H, GROUND_Y, BALL_R)
      const strength =
        judge === 'perfect' ? 1 : judge === 'great' ? 0.82 : judge === 'good' ? 0.6 : 0.4
      const ease = draw.easeOutCubic(t)

      c.save()
      c.globalAlpha = (1 - t) * 0.9
      c.strokeStyle = p.surface
      c.lineWidth = 3 * (1 - t) + 1
      c.beginPath()
      c.arc(x, y, 8 + ease * 62 * strength, 0, Math.PI * 2)
      c.stroke()
      c.globalAlpha = (1 - t) * 0.5
      c.lineWidth = 2
      c.beginPath()
      c.arc(x, y, 4 + ease * 36 * strength, 0, Math.PI * 2)
      c.stroke()

      // 방사 선 6개. 링만 있으면 물결처럼 보이고, 선이 있어야 "때렸다" 가 된다.
      c.globalAlpha = (1 - t) * 0.75
      c.lineWidth = 2
      c.lineCap = 'round'
      c.beginPath()
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2 + 0.3
        const r0 = 10 + ease * 28 * strength
        const r1 = r0 + 13 * strength
        c.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0)
        c.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1)
      }
      c.stroke()
      c.restore()
    }

    /**
     * 볼이 깨지며 번호가 드러난다.
     *
     * ⚠ `reducedMotion` 이면 조각 없이 **페이드 교체**만 한다(계약의 넷 중 넷째).
     */
    function drawBreak(c: CanvasRenderingContext2D, p: Palette, cam: number): void {
      if (breakT > BREAK_SEC || !lastGained) return
      const t = draw.clamp(breakT / BREAK_SEC, 0, 1)
      const x = batted.x - cam
      const y = screenYOf(0, GROUND_Y, BALL_R)

      if (!ctx.reducedMotion) {
        const spread = draw.easeOutCubic(Math.min(1, t * 2.2))
        c.save()
        c.globalAlpha = Math.max(0, 1 - t * 1.8)
        c.fillStyle = p.ball[ballRange(lastValue)]
        for (let i = 0; i < SHARDS; i += 1) {
          const a = (i / SHARDS) * Math.PI * 2 + 0.4
          const d = spread * 34
          c.save()
          c.translate(x + Math.cos(a) * d, y + Math.sin(a) * d - spread * 12)
          c.rotate(a + spread * 3)
          // 껍질 조각 = 둥근 부채꼴. 삼각형으로 그리면 유리 파편처럼 보인다.
          c.beginPath()
          c.arc(0, 0, BALL_R * 0.72, -0.7, 0.7)
          c.lineTo(0, 0)
          c.closePath()
          c.fill()
          c.restore()
        }
        c.restore()
      }

      /*
        번호 볼이 튀어나온다 — 커졌다가 제자리로. `easeOutCubic` 하나로 만드는 오버슈트다.
        ⚠ 숫자는 반드시 `draw.ball()` 로 그린다(규칙 4). 사이트 전체가 쓰는 그 볼이라야
          방금 얻은 것이 무엇인지 한눈에 이어진다.
      */
      const pop = draw.easeOutCubic(Math.min(1, t * 3))
      const scale = ctx.reducedMotion ? 1 : 1 + (1 - pop) * 0.7
      c.save()
      c.globalAlpha = ctx.reducedMotion ? Math.min(1, t * 3) : 1
      c.translate(x, y - (ctx.reducedMotion ? 0 : pop * 10))
      c.scale(scale, scale)
      draw.ball(c, 0, 0, BALL_R + 4, lastValue)
      c.restore()
    }

    /** 남은 기회 · 비거리 배지 · 판정 문구 · 마일스톤. 화면에 고정된 것들이다. */
    function drawHud(c: CanvasRenderingContext2D, p: Palette): void {
      /*
        남은 기회.
        ⚠ 숫자("7/9")가 아니라 **점**으로 그린다. 남은 양이 길이로 보여야 "이제 얼마 안
          남았다" 가 세지 않아도 느껴진다. 계약대로 `attempt` 이벤트도 함께 보낸다.
      */
      c.save()
      c.lineWidth = 1.5
      for (let i = 0; i < CHANCES; i += 1) {
        const x = CHIP_X + i * CHIP_GAP
        const left = i < chancesLeft
        c.globalAlpha = left ? 0.95 : 0.3
        c.beginPath()
        c.arc(x, CHIP_Y, CHIP_R, 0, Math.PI * 2)
        if (left) {
          c.fillStyle = p.surface
          c.fill()
          c.strokeStyle = p.danger
        } else {
          c.strokeStyle = p.textMuted
        }
        c.stroke()
      }
      c.restore()

      /*
        비거리 배지. 비행 중과 결과에만 띄운다.
        ⚠ 투구 중에 띄우면 지난 타석의 숫자가 남아 "지금 저게 뭐지" 가 된다.
      */
      const showBadge = step === 'stop' || step === 'fly' || (step === 'result' && lastMeters > 0)
      if (showBadge) {
        const live_m = step === 'result' ? lastMeters : metersOf(batted)
        const long = live_m >= LONG_METERS
        c.save()
        c.globalAlpha = 0.94
        draw.roundRect(c, stage.width / 2 - BADGE_W / 2, BADGE_Y, BADGE_W, BADGE_H, BADGE_H / 2)
        // 장타부터는 배지 자체가 강조색이 된다 — 숫자를 읽지 않아도 상황이 전해진다.
        c.fillStyle = long ? p.svc.lotto : p.surface
        c.fill()
        c.strokeStyle = long ? p.svc.lotto : p.border
        c.lineWidth = 1
        c.stroke()
        c.restore()
        draw.text(c, `${live_m} m`, stage.width / 2, BADGE_Y + BADGE_H / 2, {
          size: 16,
          weight: 700,
          color: long ? p.onAccent : live_m >= MIN_METERS ? p.text : p.textMuted,
        })
      }

      /*
        판정 문구. 때린 직후 잠깐만 크게 띄운다.
        ⚠ 금지 표현을 피해 **거리와 판정만** 말한다(계약의 금지 식별자 표).
          ⚠ 이 주석에 그 낱말들을 **그대로 적지 않는다.** 검증 게이트는 문자열만 보므로
            경고문 때문에 검사가 붉게 뜨면 아무도 그것을 믿지 않게 된다.
      */
      if (step !== 'ready' && step !== 'over' && impactT < LABEL_SEC) {
        const t = draw.clamp(impactT / LABEL_SEC, 0, 1)
        const label = judgeLabel(judge)
        if (label !== '') {
          c.save()
          c.globalAlpha = 1 - t * t
          draw.text(c, label, stage.width / 2, 74 - draw.easeOutCubic(t) * 12, {
            size: judge === 'perfect' ? 28 : judge === 'great' ? 24 : 20,
            weight: 700,
            color: judge === 'perfect' || judge === 'great' ? p.svc.lotto : p.text,
          })
          c.restore()
        }
      }

      /*
        ★ 마일스톤 — 비행 **중간에** 뜬다. 판정 문구(임팩트 직후)와 시간이 겹치지 않으므로
          두 글자가 서로를 가리지 않는다.
      */
      if (milestoneT < MILESTONE_SEC) {
        const t = draw.clamp(milestoneT / MILESTONE_SEC, 0, 1)
        c.save()
        c.globalAlpha = Math.min(1, (1 - t) * 2.2)
        draw.text(c, milestone, stage.width / 2, 116 - draw.easeOutCubic(t) * 16, {
          size: 26,
          weight: 700,
          color: p.svc.reco,
        })
        c.restore()
      }

      // 헛스윙·짧은 타구의 안내. 결과 단계에서만.
      if (step === 'result' && !lastGained) {
        draw.text(
          c,
          lastMeters > 0 ? `${MIN_METERS}m 를 넘겨야 번호를 얻어요` : '타이밍을 맞춰 보세요',
          stage.width / 2,
          146,
          { size: 12, weight: 600, color: p.textMuted },
        )
      }
    }

    return {
      fixedUpdate(dt) {
        /*
          ⚠ **첫 스텝에서 한 번만** 도는 초기화. `create` 안에서 `emit` 하면 호스트가 아직
            콜백을 붙이기 전일 수 있다. 계약이 이 자리를 지정했다.
        */
        if (!started) {
          started = true
          ctx.emit({ type: 'attempt', used: 0, total: CHANCES })

          /*
            ★ 호스트가 완주 기록을 복원했다면 **이미 끝난 판**이다. `ready` 를 보내면 더
              모을 것이 없는 사람에게 "시작" 을 내밀게 된다(계약: 이미 끝난 판으로 시작될 때).
          */
          if (pool.complete) {
            finish(true)
            return
          }

          /*
            ⚠ 제목은 호스트 기본(`meta.title`)을 쓰고 **보조 문구만 덮는다.** 기본값인
              `meta.tagline` 은 "무엇을 하는 게임인가" 를 말하는데, 시작 직전에 필요한 것은
              **어떻게 조작하고 무엇이 성공인가**다.
          */
          sayPhase(
            'ready',
            undefined,
            `눌러서 공을 부르고, 타격 존에 올 때 다시 눌러 때리세요. ${MIN_METERS}m 를 넘기면 번호를 얻어요.`,
          )
          return
        }

        /*
          ⚠ 팔레트 폴링은 **`step` 과 무관하게 먼저** 돈다. 시작 오버레이가 떠 있는 동안
            (`ready`)이나 판이 끝난 뒤(`over`)에도 테마를 토글할 수 있고, 그 화면들이야말로
            오래 떠 있다. 아래 단계별 `return` 뒤에 두면 그때는 갱신되지 않는다.
        */
        paletteT += dt
        if (paletteT >= PALETTE_POLL_SEC) {
          paletteT = 0
          live = readPalette()
        }

        stepT += dt
        if (shakeT > 0) shakeT = Math.max(0, shakeT - dt)
        if (flashT > 0) flashT = Math.max(0, flashT - dt)
        if (impactT < 99) impactT += dt
        if (breakT < 99) breakT += dt
        if (markT < 99) markT += dt
        if (lineGlowT < 99) lineGlowT += dt
        if (milestoneT < 99) milestoneT += dt
        if (swingT < 3) swingT += dt / SWING_SEC
        particles.update(dt)

        /*
          히트스톱 — **물리만** 멈춘다.
          ⚠ 그리기는 계속 돌아야 한다. 완전히 멈추면 "정지" 가 아니라 프레임 드랍으로 보인다.
        */
        if (stopT > 0) {
          stopT = Math.max(0, stopT - dt)
          if (stopT === 0 && step === 'stop') {
            step = 'fly'
            stepT = 0
          }
          return
        }

        if (step === 'ready' || step === 'over' || step === 'set') return

        if (step === 'wind') {
          if (stepT >= WIND_SEC) {
            step = 'pitch'
            stepT = 0
            pitchT = 0
          }
          return
        }

        if (step === 'pitch') {
          pitchT += dt
          /*
            ⚠ 스윙하지 않은 채로 유예를 넘기면 놓친 것이다. 스윙했는데 헛친 경우는
              `swing()` 이 이미 처리했으므로 여기 오지 않는다.
          */
          if (!swung && pitchT > pitchDur + MISS_GRACE) missed()
          return
        }

        if (step === 'fly') {
          /*
            ★ 슬로모션 — **스텝을 건너뛴다.** `dt` 를 줄이지 않는 이유는 위 `slowT` 주석에 있다.
          */
          let run = true
          if (slowT > 0) {
            slowT = Math.max(0, slowT - dt)
            slowAcc += SLOWMO_RATE
            if (slowAcc >= 1) slowAcc -= 1
            else run = false
          }

          if (run) {
            stepBatted(batted, dt)

            trailX[trailAt] = batted.x
            trailH[trailAt] = batted.h
            trailAt = (trailAt + 1) % TRAIL
            if (trailLen < TRAIL) trailLen += 1

            // 카메라는 타구를 **정확히** 따라간다(지연 없음). 놓치면 착지점을 볼 수 없다.
            prevCamX = camX
            camX = draw.clamp(batted.x - CAM_LEAD, 0, CAM_MAX)

            checkMilestones(metersOf(batted))
            if (batted.landed) land()
          }
          return
        }

        if (step === 'result') {
          const wait = lastGained ? BREAK_SEC + 0.15 : lastMeters > 0 ? RESULT_SEC : MISS_SEC
          if (stepT >= wait) beginTurn()
        }
      },

      draw(c, alpha, timeMs) {
        const p = live
        const cam = draw.lerp(prevCamX, camX, alpha)

        /*
          타격 순간의 화면 흔들림. 월드만 흔들고 HUD 는 흔들지 않는다 — 기회 점과 거리가
          같이 떨리면 읽을 수 없다. `reducedMotion` 이면 `shakeAmp` 가 애초에 0 이다.
        */
        let sx = 0
        let sy = 0
        if (shakeT > 0) {
          const k = (shakeT / SHAKE_SEC) ** 2
          sx = Math.sin(timeMs * 0.11) * shakeAmp * k
          sy = Math.cos(timeMs * 0.13) * shakeAmp * 0.7 * k
        }

        c.save()
        c.translate(sx, sy)

        scene.drawBackdrop(c, cam)
        scene.drawField(c, cam, MIN_METERS, lineGlowT)

        /*
          ★ 타격 존 — 이 게임이 타이밍 게임이라는 유일한 증거다.
          ⚠ `set`·`wind`·`pitch` 에서만 그린다. 타구가 날아가는 동안에도 그리면 카메라가
            흐르면서 띠가 화면을 가로질러 흘러간다.
        */
        if (step === 'set' || step === 'wind' || step === 'pitch') {
          const sp = ballSpeed()
          const ballX = step === 'pitch' ? pitchAt(pitchT, pitchDur).x : PITCHER_X
          const half = WIN_GOOD * sp
          const inZone = step === 'pitch' && Math.abs(ballX - HIT_X) <= half
          scene.drawZone(c, cam, half, WIN_PERFECT * sp, step === 'set' ? 0.5 : 1, inZone)
        }

        // 투수 — 와인드업 동안만 팔을 돌린다. `set` 에서는 공을 쥐고 선 자세다.
        const wind =
          step === 'wind' ? draw.clamp(stepT / WIND_SEC, 0, 1) : step === 'set' || step === 'ready' ? 0 : 1
        scene.drawPitcher(c, cam, wind, step === 'set' || step === 'ready')

        /*
          타자의 대기 흔들림.
          ⚠ `reducedMotion` 이면 멈춘다 — 물리가 아니라 장식이다.
        */
        const bob =
          ctx.reducedMotion || (step !== 'pitch' && step !== 'set')
            ? 0
            : Math.sin(timeMs * 0.008) * 1.2
        scene.drawBatter(c, cam, swingT, bob)

        // 날아오는 공 — 번호 없이 색만.
        if ((step === 'wind' || step === 'pitch' || step === 'set') && slot !== null) {
          const at = pitchAt(step === 'pitch' ? pitchT : 0, pitchDur)
          const bx = (step === 'set' || step === 'wind' ? PITCHER_X - 8 : at.x) - cam
          const by = screenYOf(step === 'set' || step === 'wind' ? RELEASE_H : at.h, GROUND_Y, BALL_R)
          draw.softShadow(c, bx, GROUND_Y + 1, BALL_R * 0.9, 3, 0.16)
          drawPlainBall(c, bx, by, BALL_R, p.ball[ballRange(slot.value)])
        }

        // 타구 — 불꽃이 먼저, 공이 나중. 순서를 바꾸면 불이 공을 덮는다.
        if (step === 'stop' || step === 'fly' || step === 'result') {
          const bx = draw.lerp(batted.prevX, batted.x, alpha)
          const bh = draw.lerp(batted.prevH, batted.h, alpha)
          const px = bx - cam
          const py = screenYOf(bh, GROUND_Y, BALL_R)

          const flying = step !== 'result' || (!lastGained && lastMeters > 0)
          if (flying) {
            const lift = draw.clamp(1 - bh / 260, 0.18, 1)
            draw.softShadow(c, px, GROUND_Y + 1, BALL_R * lift, 3.2 * lift, 0.2 * lift)
            if (!ctx.reducedMotion) drawFlame(c, p, cam, metersOf(batted))
            /*
              ⚠ 볼이 깨지는 동안에는 원래 공을 그리지 않는다. `drawBreak` 가 조각과 번호
                볼을 그리므로, 여기서 또 그리면 깨진 껍질 위에 멀쩡한 공이 겹친다.
            */
            drawPlainBall(
              c,
              px,
              py,
              BALL_R,
              slot !== null ? p.ball[ballRange(slot.value)] : p.textMuted,
            )
          }
        }

        drawImpact(c, p, cam)
        drawBreak(c, p, cam)

        /*
          ⚠ 파티클은 **월드 x** 로 뿌려 두었다. 카메라만큼 밀어 그려야 때린 자리에 남는다.
            화면 좌표로 뿌리면 카메라가 흐르는 동안 함께 흘러 공중에 뜬 것처럼 보인다.
        */
        c.save()
        c.translate(-cam, 0)
        particles.draw(c)
        c.restore()

        // 스윙한 자리 표식 — 존 위에 남아 "얼마나 빗나갔나" 를 보여 준다.
        if (markT < MARK_SEC) {
          scene.drawSwingMark(c, cam, markX, 1 - markT / MARK_SEC, judge !== 'miss')
        }

        c.restore()

        /*
          ★ 흰 플래시는 **흔들림 밖**에서 그린다. 화면 전체를 덮는 사각형이라 같이 흔들리면
            가장자리에 빈 띠가 생긴다.
        */
        if (flashT > 0) {
          c.save()
          c.globalAlpha = (flashT / flashSpan) * 0.55
          c.fillStyle = p.surface
          c.fillRect(0, 0, stage.width, stage.height)
          c.restore()
        }

        drawHud(c, p)
      },

      handle(input: GameInput) {
        /*
          ⚠ `primary` 의 **누름**만 본다. 캔버스 탭과 스페이스·엔터, 그리고 호스트 오버레이의
            "시작" 버튼이 전부 같은 신호로 들어온다(계약). 그래서 이 한 줄로 세 경로가
            동시에 지원되고, **키보드만으로 완주할 수 있다.**
        */
        if (input.kind !== 'action') return
        if (input.action !== 'primary' || input.phase !== 'down') return
        advance()
      },

      destroy() {
        /*
          호스트도 `releaseAll()` 을 부르지만 여기서도 되돌린다. `release` 는 없는 토큰에
          대해 아무 일도 하지 않으므로 두 번 불러도 안전하고, 게임 쪽 정리 책임을 코드로
          남겨 두면 나중에 호스트 구현이 바뀌어도 예약이 새지 않는다.
        */
        releaseSlot()
        particles.clear()
      },
    }
  },
}

export default game
