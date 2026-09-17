import { GAMES } from '@/games/core/catalog'
import { readPalette } from '@/games/core/palette'
import type { GameContext, GameInput, GameInstance, GameModule, Palette } from '@/games/core/types'

import {
  createDucks,
  drawCrosshair,
  drawDuck,
  duckDrawY,
  duckHitY,
  DUCK_RX,
  DUCK_RY,
  JUMP_TIME,
  type Duck,
} from './duck'
import {
  AIM_MAX_X,
  AIM_MAX_Y,
  AIM_MIN_X,
  AIM_MIN_Y,
  bakeScene,
  buildSkyline,
  COUNTER_Y,
  drawBackdrop,
  drawBelt,
  drawCounter,
  drawStand,
  LANE_DIR,
  LANE_SPEED,
  LANE_Y,
  sceneKey,
  SHELF_CY,
  SHELF_R,
  shelfX,
  WRAP_LEFT,
  WRAP_RIGHT,
  WRAP_SPAN,
  type SceneCache,
} from './scene'

/**
 * G01 · 오리 사격장 — 은닉형.
 *
 * → 사양서: docs/wiki/20-design/game-g01-shooting.md
 * → 계약:   docs/wiki/10-contracts/playground-game-contract.md
 *
 * ── 한 문장 ────────────────────────────────────────────────────────
 * **12발 실탄으로 오리 여섯 마리를 맞혀** 번호 6개를 모은다.
 *
 * ── 왜 은닉형인가 ──────────────────────────────────────────────────
 * 번호가 **맞힌 순간에 처음 존재한다.** 사용자에게 사전 정보가 없으므로 호스트가 남은 풀에서
 * 뽑아도 모순이 없고, 그래서 **중복이 구조적으로 불가능하다.** 게임은 `pool.awardHidden()`
 * 만 부르고 1~45 를 직접 다루지 않는다(계약: 번호는 게임이 만들지 않는다).
 *
 * ── ⚠ 2026-09-08 규칙 변경 (사용자 요청) ───────────────────────────
 * 사양서의 "무제한 재장전 · 실패 개념 없음" 을 **실패가 있는 12발 한 판**으로 바꿨다.
 *   · 탄약 12발, 재장전 없음. 다 쓰고 6개를 못 채우면 실패다.
 *   · 맞혀도 **꽝**이 나올 수 있다. 12발 중 꽝은 정확히 두 번뿐이고 순서만 섞는다 —
 *     확률로 굴리지 않는 이유는 아래 `outcomes` 주석에 적었다.
 *   · 맞은 오리는 날아간 뒤 **다시 등장한다.** 없애 버리면 꽝 두 번에 오리가 넷만 남아
 *     번호 6개를 채우는 것이 **수학적으로 불가능**해진다.
 *   · 오리 속도를 20% 올리고 **랜덤 점프**를 넣었다. 한자리에서 기다리기만 하는 전략이
 *     통하지 않게 하는 장치다.
 * 이 변경은 [[0014-number-playground]] 의 "모은 번호를 잃게 하지 않는다"·"확률형 실패를
 * 만들지 않는다" 와 어긋난다. 사용자의 명시적 결정이고 `docs/wiki/log.md` 에 남겼다.
 *
 * ── 화면 밖 버튼은 호스트가 그린다 ─────────────────────────────────
 * 시작·다시하기·번호보기는 `emit({type:'phase'})` 로 단계만 알리고 실제 버튼은 호스트가
 * 캔버스 위 DOM 오버레이로 그린다. 캔버스에 그린 버튼은 보조기술에 보이지 않고, 페이지를
 * 스크롤하거나 판을 다시 만드는 일은 캔버스가 할 수 없기 때문이다.
 */

const meta = GAMES.find((g) => g.slug === 'shooting')
if (meta === undefined) {
  // catalog 와 폴더가 어긋난 상태다. 조용히 넘어가면 원인을 찾기 어렵다.
  throw new Error("catalog.ts 에 'shooting' 항목이 없습니다")
}

/* ────────────────────────────────────────────────────────────
 * 수치
 * ──────────────────────────────────────────────────────────── */

/** 한 판에 주어지는 전부. **재장전은 없다.** */
const AMMO_MAX = 12
/**
 * 12발 중 꽝의 개수.
 *
 * ⚠ **확률로 굴리지 않는다.** 매번 25% 로 굴리면 운이 나쁜 판에서 꽝만 다섯 번 나올 수 있고,
 *   그때 사용자는 조작당했다고 느낀다([[0014-number-playground]] 가 크레인에서 확률형 실패를
 *   금지한 것과 같은 이유). 꽝 두 장을 넣은 봉투를 섞어 뽑으면 **최대 꽝 수가 보장**된다 —
 *   열두 발을 다 맞히면 번호 열 개를 얻으므로 6개는 반드시 채워진다.
 */
const BLANK_COUNT = 2
/** 연사 방지. 이 시간이 지나야 다음 발이 나간다. */
const COOLDOWN = 0.35
/** 키보드 조준 속도. 가장 빠른 레인(최대 131px/s)보다 충분히 빠르다. */
const KEY_AIM_SPEED = 300
/**
 * 조준이 끝나는 데 걸리는 시간(초). **이 시간을 채워야 발사할 수 있다.**
 *
 * ⚠ 종전 주석은 "순수 시각 효과이고 다 좁혀지기 전에 떼도 불이익이 없다" 였다.
 *   **2026-09-17 에 뒤집혔다** — 바로 그 성질 때문에 누르자마자 떼는 것이 언제나 최적이었고
 *   조준이라는 행위가 생략됐다. 이제 다 좁혀지기 전에 떼면 **발사되지 않는다**(→ `AIM_RING_MAX`).
 * ⚠ **이것은 조준 관용(aim assist)이 아니다.** 관용은 빗나간 탄을 몰래 맞게 해 주는 것이고,
 *   이쪽은 조건을 채우기 전에는 쏘지 못하게 하는 것이다. 맞고 안 맞고는 여전히 겨눈 자리로만
 *   갈린다.
 * ⚠ 이 값이 난이도를 정한다. 길수록 오리를 놓치기 쉽다 — 흔들림 진폭과 함께 손잡이 둘 중 하나다.
 */
const AIM_ZOOM_TIME = 0.7
/**
 * 조준 중임을 보여주는 바깥 원의 최대 반지름(px). 좁혀지면서 0 으로 간다.
 *
 * ── ★ 2026-09-17 — 조준이 끝나기 전에는 **아예 발사되지 않는다** ────
 * 이 값은 두 번 바뀌었고, 두 번째가 현행이다.
 *
 * ① 처음에는 줌이 **순수 장식**이었다. 히트박스가 언제나 중심 한 점이라 누르자마자 떼도
 *    불이익이 없었고, 그래서 **조준이라는 행위가 통째로 생략됐다.**
 * ② 그래서 원을 **산포 범위**로 만들어 덜 좁힌 채 쏘면 흩어지게 했다. 그런데도
 *    *"여전히 그냥 클릭해도 바로 발사된다"* 는 지적이 돌아왔다 — **탄이 나가기는 하기
 *    때문이다.** 흩어져서 빗나간 것과 애초에 안 나간 것은 손끝에서 전혀 다르게 느껴지고,
 *    전자는 "운이 나빴다" 로 읽혀 조작을 바꿀 이유가 되지 못한다.
 * ③ 지금은 **조준이 끝나기 전에 떼면 발사 자체가 실패**한다(탄약도 줄지 않는다).
 *    규칙이 "확률이 나빠진다" 가 아니라 "아직 못 쏜다" 이면 배울 것이 하나뿐이다 —
 *    **기다렸다 뗀다.**
 *
 * ⚠ 그래서 이 값은 이제 **판정에 쓰이지 않는다.** 순수하게 "얼마나 남았는지" 를 보여준다.
 *   판정은 `aimZoom >= 1` 하나로 갈린다.
 */
const AIM_RING_MAX = 34
/** 조준이 덜 끝났는데 뗐을 때 뜨는 안내의 지속 시간(초). */
const HOLD_FX_TIME = 1.1
/** 조준이 막 완료된 순간의 번쩍임 지속 시간(초). "지금 떼면 된다" 를 알린다. */
const READY_FLASH_TIME = 0.32
/**
 * 조준 흔들림의 진폭(px).
 *
 * ── 왜 흔드는가 ────────────────────────────────────────────────────
 * 스코프를 든 손은 멈추지 않는다. 조준점이 못처럼 박혀 있으면 "겨눈다" 는 행위가 사라지고
 * 남는 것은 오리가 지나가기를 기다리는 일뿐이다. 조금 흔들리면 **언제 쏘느냐**가 다시
 * 실력이 된다.
 *
 * ⚠ 흔들림은 **판정에도 그대로 적용된다.** 보이는 자리와 맞는 자리가 다르면 그것은 숨은
 *   확률이고, 사용자는 조작당했다고 느낀다. 조준점이 있는 곳이 곧 탄이 가는 곳이다.
 * ── ⚠ 왜 3.2 → 4.5 → 5.4 를 거쳐 11 까지 왔나 ─────────────────────
 * 세 번 올리고도 *"흔들리는 게 별로 영향이 없어 보인다"* 는 말을 들었다. 값이 작아서만이
 * 아니라 **두 가지가 겹쳐 실효 이탈을 깎고 있었기 때문**이다.
 *
 * ① **발사 시점의 `amp` 는 언제나 1이다.** `SWAY_SETTLE` 이 조준 중 진폭을 2.2배로 키우지만,
 *    2026-09-17 개정으로 **조준이 끝나야(`aimZoom = 1`) 발사되므로** 그 증폭이 걸린 상태로는
 *    애초에 쏠 수가 없다. 증폭은 판정에 단 한 번도 관여하지 않는다 — 순수한 시각 효과다.
 * ② **사인 둘이 서로 상쇄한다.** `0.6·sin a + 0.4·sin b` 의 최댓값은 1이지만 전형값(RMS)은
 *    **0.51** 이다. 즉 화면에서 실제로 보는 이탈은 대개 **진폭의 절반**이다.
 *
 * 그래서 5.4px 일 때 전형 이탈이 2.8px, 히트박스 가로 반경 22px 의 **12%** 밖에 되지 않았다.
 * 겨냥이 조금 어긋나도 그대로 맞으니 흔들림이 없는 것과 다르지 않았다.
 *
 * ⚠ **이 값을 조정할 때는 "진폭 ÷ 2 가 실효값" 으로 어림한다.** 진폭 그대로를 히트박스와
 *   비교하면 매번 과대평가하게 되고, 그것이 세 번이나 모자라게 잡은 원인이다.
 *   현재 전형 5.6/3.6px · 최대 11/7px — 히트박스의 약 25% / 50% 다.
 * ⚠ **정확히 겨누면 여전히 맞는다.** 최대 이탈(11·7)이 히트박스(22·15)보다 작기 때문이다.
 *   어려워진 것은 *대충 겨누는 것*이지 *제대로 겨누는 것*이 아니다.
 * ⚠ 더 올릴 때는 **클램프 밖으로 새지 않는지** 함께 본다. 흔들림은 클램프된 `cross` 위에
 *   얹히므로, 조준 중 최대 진폭까지 더한 값이 조준 범위를 넘으면 조준점이 화면 밖이나
 *   선반·카운터 위로 올라간다. 현재는 x 6.4~353.6 · y 118.8~359.2 로 전부 안쪽이다.
 */
const SWAY_X = 11
const SWAY_Y = 7
/**
 * 누른 직후의 흔들림 배수.
 *
 * 조준이 좁혀지는 동안 더 크게 흔들리고 점점 가라앉는다 — 스코프가 자리를 잡는 느낌이다.
 * ⚠ 이것은 **눈에 보이는** 차이다. 숨은 명중 보정이 아니라 "기다리면 조준이 안정된다" 는
 *   사실을 화면으로 보여 준다.
 * ⚠ 2026-09-17 부터 **그 구간에는 어차피 발사되지 않으므로** 이 배수는 판정에 영향을 주지
 *   않는다. 남은 역할은 하나다 — 아직 준비되지 않았다는 것을 손이 아니라 **눈으로** 알리는 것.
 * ⚠ 그래서 기본 진폭을 11px 로 올리면서 이 배수는 **1.2 → 0.6 으로 낮췄다.** 판정에 무관한
 *   시각 효과가 조준점을 화면 밖이나 선반·카운터 위로 밀어내면 그쪽이 더 큰 손해다.
 *   진폭이 두 배가 됐으므로 배수를 절반으로 줄여도 조준 중 흔들림은 종전보다 크다.
 */
const SWAY_SETTLE = 0.6
/** 맞은 오리가 선반까지 날아가는 시간. */
const FLY_TIME = 0.5
/** 움직임 최소화일 때. 연출을 없애지 않고 짧은 페이드로 줄인다. */
const FLY_TIME_REDUCED = 0.12
/** `mysteryBall` → `ball(n)` 교체 시간. */
const REVEAL_TIME = 0.3
/** 날아간 오리가 다시 들어오기까지. 너무 짧으면 같은 자리에서 계속 튀어나온 것처럼 보인다. */
const RESPAWN_DELAY = 0.45
/** 빗나감 표시가 남아 있는 시간. */
const MISS_TIME = 0.38
/**
 * 꽝 연출이 남아 있는 시간.
 *
 * ⚠ **길게 잡는다.** 처음에는 오리가 날아가는 0.5초 동안 작은 글씨로만 띄웠는데,
 *   "이게 뭐지" 하고 넘어가 버려 꽝인지 아닌지 알 수 없다는 지적을 받았다(2026-09-10).
 *   무슨 일이 일어났는지 **읽을 시간**이 필요하다.
 */
const BLANK_FX_TIME = 1.35
/**
 * 빗나가면 그 레인이 놀라 빨라진다.
 *
 * ⚠ 사양서의 `1.06` 에서 **낮췄다.** 무제한 재장전이던 시절에는 벌칙이 벌칙일 뿐이었지만,
 *   12발 한 판에 실패가 생기면서 **하향 나선**이 됐다 — 못 맞히는 사람일수록 오리가 빨라져
 *   더 못 맞힌다. 실측에서 네 판 중 세 판이 "하나 모자라서 실패" 로 끝났다.
 */
const MISS_SPEEDUP = 1.02
/** 명중할 때마다 전 레인이 빨라진다. */
const HIT_SPEEDUP = 1.05
/**
 * 속도 상한(초기값 배수).
 *
 * ⚠ 사양서는 빗나감 1.5배·명중 1.45배로 상한을 따로 적었지만, 나뉘어 있으면 "명중했는데
 *   레인이 느려지는" 모순(빗나감으로 1.5까지 오른 뒤 명중 시 1.45로 깎임)이 생긴다.
 *   단일 상한으로 둔다.
 * ⚠ 값도 1.5 → 1.32 로 낮췄다. 기본 속도가 이미 20% 올라간 데다(사양서 대비) 12발 한 판에
 *   실패까지 생겨, 종전 상한으로는 뒷심이 붙는 것이 아니라 그냥 못 맞히는 게임이 됐다.
 */
const SPEED_CAP = 1.32
/** 점프 간격(초). 오리마다 따로 돌아 여섯 마리가 동시에 뛰지 않는다. */
const JUMP_CD_MIN = 2.2
const JUMP_CD_MAX = 5.5

/** 오리 몸통 아래 접지 그림자의 y 오프셋(벨트 위). */
const SHADOW_DY = 23

type Phase = 'ready' | 'playing' | 'failed' | 'cleared'

interface ShelfSlot {
  /** 아직 비었으면 0. */
  value: number
  /** 물음표 → 번호 교체 진행도 0~1. */
  reveal: number
  filled: boolean
}

const game: GameModule = {
  meta,

  create(ctx: GameContext): GameInstance {
    const { stage, pool, draw, input, rng } = ctx

    /* ── 팔레트 ─────────────────────────────────────────────
       ★ **`ctx.palette` 는 `create()` 시점의 스냅샷이다.** 호스트(`GameCanvas`)가 `watchPalette`
       로 갱신하는 것은 자기 지역 변수뿐이고, 이미 만들어 넘긴 컨텍스트 객체는 옛 색을 계속
       가리킨다. 그래서 매 프레임 `ctx.palette` 를 다시 읽어도 소용이 없다 — 같은 객체다.

       `DrawKit` 만은 `() => palette` 클로저라 최신 색을 본다. 그 결과 **볼만 테마를 따라가고
       무대(배경·차양·컨베이어·카운터)는 옛 테마로 남는다.** 플레이 중 테마를 바꾸면
       라이트 무대 위에 다크 볼이 놓인다. G04 가 먼저 부딪혀 [[playground]] 에 적어 둔
       결함이고, 고치는 쪽은 호스트지만 그때까지 게임이 스스로 막는다.

       ⚠ 폴링으로 읽는 이유: 테마 변경을 게임에 전달하는 통로가 계약에 없다(`GameInstance`
         에 `onPalette` 가 없다). `types.ts` 는 동결이라 넣을 수도 없으므로, 자기 폴더 안에서
         할 수 있는 유일한 방법이 주기적으로 직접 읽는 것이다.
       ⚠ 1초에 한 번이면 충분하다. `readPalette()` 는 `getComputedStyle` 로 20여 개 변수를
         읽는다 — 매 프레임 부르면 그 자체가 프레임 예산을 먹는다. 테마 전환은 사람이
         누르는 일이라 1초 지연이 보이지 않는다. */
    const PALETTE_POLL = 1
    let palette: Palette = ctx.palette
    let paletteAge = 0

    /* ── 배경 ───────────────────────────────────────────────
       형태는 한 번만 뽑고 색만 다시 굽는다. 테마를 바꿔도 스카이라인이 그대로 남는다.
       ⚠ 배경 난수는 fork 다. 물리 스트림을 소비하면 같은 시드로도 결과가 달라진다. */
    const skyline = buildSkyline(stage, rng.fork())
    let cache: SceneCache = bakeScene(skyline, palette)

    /* ── 오리 ───────────────────────────────────────────────
       여섯 마리를 **한 번만** 만들고 이후로는 재사용한다(GC 방지).
       ⚠ 맞아도 사라지지 않고 다시 들어온다 — 위 헤더 주석의 이유. */
    const ducks = createDucks()
    for (let k = 0; k < ducks.length; k += 1) {
      const d = ducks[k]
      d.lane = k % LANE_Y.length
      const pos = Math.floor(k / LANE_Y.length)
      // 레인마다 위상을 어긋내 세 줄이 한 몸처럼 움직이지 않게 한다.
      d.x = WRAP_LEFT + ((d.lane * 70 + pos * 120) % WRAP_SPAN)
      d.prevX = d.x
      d.phase = k * 1.1
      d.bob = 0
      d.prevBob = 0
      d.jumpT = -1
      d.jumpCd = rng.range(JUMP_CD_MIN, JUMP_CD_MAX)
      d.blank = false
      d.t = 0
      d.value = 0
      d.slot = 0
      d.state = 'run'
    }

    /* ── 선반 ───────────────────────────────────────────────
       세션 복원으로 이미 획득한 번호가 있으면 처음부터 채워 둔다. */
    const shelf: ShelfSlot[] = []
    for (let i = 0; i < 6; i += 1) shelf.push({ value: 0, reveal: 0, filled: false })
    pool.awarded.forEach((value, i) => {
      if (i < shelf.length) shelf[i] = { value, reveal: 1, filled: true }
    })

    /*
      명중 결과 봉투. `true` = 번호, `false` = 꽝. 순서만 섞는다(Fisher-Yates).
      ⚠ 확률이 아니라 개수를 고정하는 이유는 위 `BLANK_COUNT` 주석 참조.
    */
    const outcomes: boolean[] = []
    for (let i = 0; i < AMMO_MAX; i += 1) outcomes.push(i >= BLANK_COUNT)
    for (let i = outcomes.length - 1; i > 0; i -= 1) {
      const j = rng.int(0, i)
      const tmp = outcomes[i]
      outcomes[i] = outcomes[j]
      outcomes[j] = tmp
    }
    let outcomeIdx = 0

    /** 레인별 속도 배수. 초기 1.0 에서 상한까지만 오른다. */
    const laneMul = [1, 1, 1]
    /** 벨트 줄무늬·톱니의 누적 이동량. 레인 속도를 그대로 먹는다. */
    const beltOffset = [0, 0, 0]

    /*
      조준선. **타입을 명시한다.** `LANE_Y` 가 `as const` 라 `LANE_Y[1]` 의 타입이 리터럴로
      좁혀지고, 그대로 두면 `cross.y` 에 다른 수를 넣을 수 없다.
    */
    const cross: { x: number; y: number } = { x: stage.width / 2, y: LANE_Y[1] }
    /**
     * 지금 무엇으로 조준하고 있는가.
     *
     * ── ⚠ 왜 평소에는 조준점을 숨기는가 ──────────────────────────
     * 모바일에서는 **손가락이 곧 조준점**이라 항상 떠 있는 십자선이 오히려 방해가 된다.
     * 누르는 동안에만 보여 주면 화면이 깨끗하고, 어디를 겨누는지는 누른 그 순간에만 알면 된다.
     * 키보드 사용자에게는 손가락이 없으므로 키를 한 번이라도 누르면 계속 보인다.
     */
    let aimMode: 'none' | 'pointer' | 'key' = 'none'
    /** 조준점 좁힘 진행도 0~1. 1이면 원래 크기다. */
    let aimZoom = 1
    /** 흔들림 위상. 조준 중에만 흐른다. */
    let swayT = 0
    let cooldown = 0
    let ammo = AMMO_MAX
    let elapsed = 0
    let phase: Phase = pool.complete ? 'cleared' : 'ready'
    /** 빗나감 표시. `t < 0` 이면 없음. */
    const missFx = { t: -1, x: 0, y: 0 }
    /** 꽝 폭발. `t < 0` 이면 없음. */
    const blankFx = { t: -1, x: 0, y: 0 }
    /** 조준이 덜 끝났는데 뗐을 때의 안내. `t < 0` 이면 없음. */
    const holdFx = { t: -1, x: 0, y: 0 }
    /** 조준이 막 끝난 순간의 번쩍임. `t < 0` 이면 없음. */
    let readyFlash = -1
    /**
     * 스페이스를 누르고 있는가.
     *
     * ⚠ 키보드도 **누른 채 조준 → 떼면 발사**다. 포인터만 기다리게 하고 키보드는 즉시
     *   쏘게 두면 규칙이 둘이 되고, 그쪽이 더 쉬워진다. 방향키로 조준점을 옮기는 것과
     *   스페이스로 조준하는 것을 갈라야 해서 이 상태가 필요하다.
     */
    let keyHold = false
    /** 화면 흔들림. 빗나갈 때만 살짝 준다. 움직임 최소화면 항상 0 이다. */
    let shake = 0

    /** 파티클은 장식이다. 움직임 최소화면 아예 만들지 않는다(계약: 파티클 0). */
    const sparks = draw.particles(ctx.reducedMotion ? 1 : 110)

    const laneSpeed = (l: number) => LANE_SPEED[l] * laneMul[l]

    function setPhase(next: Phase, title?: string, text?: string): void {
      phase = next
      ctx.emit({ type: 'phase', phase: next, title, text })
    }

    /*
      첫 단계 알림.
      ⚠ 완료 상태(세션 복원)면 문구를 넘기지 않는다 — 호스트의 기본값이 여섯 게임 공통이다.
        시작 화면의 보조 문구만 이 게임 고유(탄약 수)라 여기서 채운다.
    */
    /*
      ⚠ 시작 화면의 보조 문구에 **조작법을 적는다**(2026-09-17 사용자 요청). 캔버스 아래
        "조작 방법" 목록이 이미 있지만, 시작 버튼을 누르는 사람의 눈은 팝업에 있다 — 거기
        없으면 읽지 않은 채로 판이 시작되고, 그러면 누르자마자 떼는 조작이 굳어 버린다.
      ⚠ 두 문장을 넘기지 않는다. 팝업이 캔버스를 덮으므로 길어지면 게임 화면을 가린다.
    */
    if (phase === 'cleared') setPhase('cleared')
    else
      setPhase(
        'ready',
        undefined,
        '화면을 누른 채 기다리면 조준점이 좁혀집니다. 다 좁혀진 뒤 손을 떼야 발사돼요.',
      )
    ctx.emit({ type: 'attempt', used: 0, total: AMMO_MAX })

    /** 조준선이 어느 레인을 겨누고 있는가. 빗나감 페널티를 줄 레인을 고른다. */
    function nearestLane(y: number): number {
      let best = 0
      let bestD = Infinity
      for (let l = 0; l < LANE_Y.length; l += 1) {
        const d = Math.abs(y - LANE_Y[l])
        if (d < bestD) {
          bestD = d
          best = l
        }
      }
      return best
    }

    /** 오리를 레인 입구로 되돌린다. 들어오는 위치를 조금 흩어 두 마리가 겹치지 않게 한다. */
    function respawn(d: Duck): void {
      const back = rng.range(0, 70)
      d.x = LANE_DIR[d.lane] > 0 ? WRAP_LEFT - back : WRAP_RIGHT + back
      d.prevX = d.x
      d.bob = 0
      d.prevBob = 0
      d.jumpT = -1
      d.jumpCd = rng.range(JUMP_CD_MIN, JUMP_CD_MAX)
      d.blank = false
      d.t = 0
      d.value = 0
      d.state = 'run'
    }

    function fire(): void {
      ammo -= 1
      cooldown = COOLDOWN
      /*
        ⚠ 명중 여부와 **무관하게** 먼저 울린다. 방아쇠를 당긴 사실 자체에 대한 반응이라
          결과를 기다리면 손끝과 귀가 어긋난다.
        ⚠ 음소거 판단은 호스트가 한다. 게임은 무슨 일이 났는지만 말한다.
      */
      ctx.emit({ type: 'sfx', name: 'shoot' })
      ctx.emit({ type: 'attempt', used: AMMO_MAX - ammo, total: AMMO_MAX })

      /*
        히트스캔. 조준선이 히트박스 타원 안에 있으면 그 프레임에 명중이다.
        ⚠ 판정 y 는 `duckHitY`(레인 + 흔들림 + 점프)다. 그리기와 같은 함수를 쓴다.
        ⚠ 여러 마리가 겹쳐 있으면 **앞에 그려지는 쪽**을 맞힌 것으로 본다.
      */
      /*
        ⚠ 흔들린 **실제** 조준점으로 판정한다. 화면에 보이는 그 자리가 곧 탄이 가는 자리다.
        ⚠ 여기 닿았다는 것은 이미 조준이 끝났다는 뜻이다(`shoot` 이 걸러낸다). 그래서 산포
          같은 보정이 낄 자리가 없다 — 겨눈 곳으로 정확히 나간다.
      */
      const aim = aimPoint()
      let hit = -1
      for (let k = 0; k < ducks.length; k += 1) {
        const d = ducks[k]
        if (d.state !== 'run') continue
        if (draw.ellipseHit(aim.x, aim.y, d.x, duckHitY(d), DUCK_RX, DUCK_RY)) {
          hit = k
          break
        }
      }

      if (hit < 0) {
        // 빗나감. 표시를 남기고 그 레인의 오리가 놀라 빨라진다.
        missFx.t = 0
        missFx.x = aim.x
        missFx.y = aim.y
        if (!ctx.reducedMotion) {
          shake = 3.2
          sparks.burst(aim.x, aim.y, 8, palette.textMuted, 60)
        }
        const l = nearestLane(aim.y)
        laneMul[l] = Math.min(laneMul[l] * MISS_SPEEDUP, SPEED_CAP)
        ctx.emit({ type: 'haptic', ms: 10 })
        ctx.emit({ type: 'sfx', name: 'miss' })
        checkOut()
        return
      }

      const d = ducks[hit]
      const isNumber = outcomes[outcomeIdx] ?? true
      outcomeIdx += 1

      d.state = 'fly'
      d.t = 0
      d.fromX = d.x
      d.fromY = duckHitY(d)
      d.blank = !isNumber

      if (!isNumber) {
        /*
          꽝. 오리는 위로 날아가고 그 자리에서 **폭탄이 터진다.**
          ⚠ 폭발 좌표를 화면 안으로 당겨 둔다. 오리는 화면 밖 40px 까지 나가 있을 수 있어서,
            그대로 쓰면 큰 글자가 잘려 정작 "꽝" 을 못 읽는다.
        */
        blankFx.t = 0
        blankFx.x = draw.clamp(d.fromX, 84, stage.width - 84)
        blankFx.y = draw.clamp(d.fromY, 132, 356)
        if (!ctx.reducedMotion) {
          shake = 7
          sparks.burst(blankFx.x, blankFx.y, 26, palette.warning, 210)
          sparks.burst(blankFx.x, blankFx.y, 16, palette.textMuted, 140)
        }
        // 빗나감(10ms)보다 세게 울린다 — 같은 세기면 손끝으로 구분되지 않는다.
        ctx.emit({ type: 'haptic', ms: 40 })
        ctx.emit({ type: 'sfx', name: 'blank' })
        ctx.emit({ type: 'status', text: '꽝입니다. 번호를 얻지 못했어요.' })
        checkOut()
        return
      }

      const res = pool.awardHidden()
      if (!res.ok) {
        // 슬롯이 이미 찼다. 정상 경로가 아니므로 꽝처럼 흘려보낸다.
        d.blank = true
        checkOut()
        return
      }

      d.slot = res.slot
      d.value = res.value

      // 명중하면 전 레인이 빨라진다. 이것이 이 게임의 난이도 곡선이다.
      for (let l = 0; l < laneMul.length; l += 1) {
        laneMul[l] = Math.min(laneMul[l] * HIT_SPEEDUP, SPEED_CAP)
      }

      if (!ctx.reducedMotion) sparks.burst(d.fromX, d.fromY, 16, palette.svc.reco, 120)
      ctx.emit({ type: 'haptic', ms: 20 })
      /*
        ⚠ 완주면 획득음을 **생략한다.** 두 소리가 겹치면 팡파르가 뭉개지고, 마지막 한 개는
          어차피 팡파르가 "다 모았다" 를 말해 준다.
      */
      ctx.emit({ type: 'sfx', name: res.complete ? 'clear' : 'hit' })
      ctx.emit({
        type: 'status',
        text: res.complete
          ? `${res.value}번을 맞혔습니다. 번호 6개를 모두 모았습니다.`
          : `${res.value}번을 맞혔습니다. ${pool.slotsLeft}개 남았습니다.`,
      })

      if (res.complete) {
        /*
          ⚠ 완료 문구를 게임이 정하지 않는다. 호스트의 기본값("6개 공을 모두 모았습니다")을
            쓰면 여섯 게임이 같은 말을 한다 — 게임마다 따로 쓰면 제각각이 된다.
            게임이 채워야 하는 것은 **게임마다 달라야 하는 것**(실패 시 모은 개수)뿐이다.
        */
        setPhase('cleared')
      } else {
        checkOut()
      }
    }

    /** 탄이 떨어졌는데 아직 6개가 아니면 그 판은 거기서 끝난다. */
    function checkOut(): void {
      if (phase !== 'playing') return
      if (ammo > 0 || pool.complete) return
      ctx.emit({ type: 'sfx', name: 'fail' })
      /*
        ⚠ **제목은 보내지 않는다.** 호스트 `defaultCopy()` 가 여섯 게임 공통 제목을 갖고
          있고, 게임이 채우는 것은 *게임마다 달라야 하는 것* 뿐이다(계약 2026-09-16 정본).
          같은 문구를 여섯 군데에 복사해 두면 하나를 고칠 때 나머지 다섯이 남는다 —
          실제로 "번호분석" → "번호확인" 을 바꿀 때 그 일이 났다.
          몇 개를 모았는지는 이 판에서만 아는 값이라 `text` 로만 덮는다.
      */
      setPhase('failed', undefined, `${pool.awarded.length}개를 모았습니다. 다시 도전해 보세요.`)
    }

    function startRun(): void {
      if (phase === 'ready') {
        setPhase('playing')
        ctx.emit({
          type: 'hint',
          text: `${AMMO_MAX}발 탄약. 조준점이 다 좁혀진 뒤에 떼세요 — 그 전에 떼면 발사되지 않습니다.`,
        })
        ctx.emit({
          type: 'status',
          text: `${AMMO_MAX}발 탄약으로 오리를 맞히세요. 조준점이 다 좁혀져야 발사됩니다.`,
        })
      }
    }

    /**
     * 실제 발사.
     *
     * ⚠ **포인터는 뗄 때** 여기 들어온다(누를 때가 아니다). 모바일에서 누르는 순간 발사하면
     *   손가락이 닿은 첫 지점으로 쏘게 되어 조준이 불가능하다. 누른 채 끌어 맞추고 떼는 것이
     *   작은 화면에서 유일하게 정확한 방법이다.
     */
    function shoot(): void {
      if (phase !== 'playing') return
      if (ammo <= 0) return
      /*
        ⚠ `> 0` 이 아니라 **작은 여유값**과 비교한다.
        쿨다운은 `1/60` 을 스물한 번 빼서 0 에 닿는데, 부동소수 오차 때문에 정확히 0 이 되지
        않고 1e-17 이 남는다. 그 상태에서 `> 0` 으로 막으면 정확히 쿨다운 주기에 맞춰 누르는
        사용자만 한 발 걸러 무시당한다.
      */
      if (cooldown > 1e-4) return
      /*
        ★ **조준이 끝나기 전에는 발사되지 않는다**(2026-09-17 사용자 요청).
        ⚠ **탄약을 소모하지 않는다.** 실패는 "아직 못 쏜다" 이지 벌칙이 아니다. 여기서 탄이
          줄면 규칙을 모르는 첫 판에 12발을 빈손으로 날리게 되고, 그건 배우기 전에 지는 것이다.
        ⚠ 쿨다운도 걸지 않는다. 바로 다시 눌러 조준할 수 있어야 한다.
      */
      if (!aimReady()) {
        holdFx.t = 0
        holdFx.x = cross.x
        holdFx.y = cross.y
        ctx.emit({ type: 'haptic', ms: 10 })
        ctx.emit({
          type: 'status',
          text: '아직 조준 중입니다. 조준점이 좁혀진 뒤에 손을 떼세요.',
        })
        return
      }
      cooldown = 0
      fire()
    }

    /**
     * 실제로 탄이 나가는 지점 — 손이 둔 자리(`cross`)에 흔들림을 얹은 값.
     *
     * ⚠ **그리기와 판정이 이 함수 하나를 공유한다.** 두 곳에서 따로 계산하면 언젠가
     *   어긋나고, 그때 생기는 "분명히 맞췄는데 안 맞음" 은 재현이 어렵다.
     * ⚠ 주파수가 서로 배수가 아닌 사인 둘을 겹친다. 하나만 쓰면 규칙적으로 왕복해 기계처럼
     *   보이고, 사용자가 주기를 외워 버린다.
     */
    function aimPoint(): { x: number; y: number } {
      if (aimMode === 'none') return cross
      const amp = 1 + (1 - aimZoom) * SWAY_SETTLE
      const dx = (Math.sin(swayT * 4.7) * 0.6 + Math.sin(swayT * 7.3 + 1.3) * 0.4) * SWAY_X * amp
      const dy = (Math.sin(swayT * 3.9 + 0.7) * 0.6 + Math.sin(swayT * 6.1 + 2.1) * 0.4) * SWAY_Y * amp
      return { x: cross.x + dx, y: cross.y + dy }
    }

    /**
     * 지금 조준 원의 반지름. **남은 조준 시간을 눈에 보이게 하는 값이다.**
     *
     * ⚠ **선형이다. `easeOutCubic` 을 쓰지 않는다.** 그 곡선은 초반이 빨라 0.25초 만에
     *   원이 34 → 9px 로 줄었다 — 거의 다 된 것처럼 보이는데 실제로는 아직 못 쏘는 상태라
     *   화면이 거짓말을 한다. 선형이면 **남은 거리가 곧 남은 시간**이다.
     */
    function aimRing(): number {
      return AIM_RING_MAX * (1 - aimZoom)
    }

    /** 조준이 끝났는가. 발사 가능 여부는 이 하나로 갈린다. */
    function aimReady(): boolean {
      return aimZoom >= 1
    }

    function aimTo(x: number, y: number): void {
      cross.x = draw.clamp(x, AIM_MIN_X, AIM_MAX_X)
      cross.y = draw.clamp(y, AIM_MIN_Y, AIM_MAX_Y)
    }

    /** 하단 카운터의 탄약 표시. 남은 탄을 캔버스 안에서도 읽을 수 있게 한다. */
    function drawAmmo(c: CanvasRenderingContext2D, p: Palette): void {
      const shellW = 12
      const gap = 10
      const total = AMMO_MAX * shellW + (AMMO_MAX - 1) * gap
      const x0 = (stage.width - total) / 2
      /*
        ⚠ 오프셋이 카운터 높이(80px)에 맞춰져 있다. 탄피 18px + 글자 한 줄이 들어가고
          바닥까지 22px 이 남는다 — 무대나 `COUNTER_Y` 를 다시 만지면 여기도 함께 본다.
      */
      const y = COUNTER_Y + 18

      for (let i = 0; i < AMMO_MAX; i += 1) {
        const x = x0 + i * (shellW + gap)
        draw.roundRect(c, x, y, shellW, 18, 3)
        if (i < ammo) {
          c.fillStyle = p.warning
          c.fill()
          // 탄피 상단 림라이트. 남은 탄이 한눈에 도드라진다.
          c.globalAlpha = 0.4
          c.strokeStyle = p.surface
          c.lineWidth = 1.5
          c.beginPath()
          c.moveTo(x + 2, y + 2)
          c.lineTo(x + shellW - 2, y + 2)
          c.stroke()
          c.globalAlpha = 1
        } else {
          /*
            쓴 탄. 테두리만 1px 로 그리면 나무 바탕에 묻혀 **"몇 발 남았는지" 가 아니라
            "탄이 몇 개뿐인지" 로 읽힌다.** 옅은 판을 깔아 빈 자리로 보이게 한다.
          */
          c.globalAlpha = 0.5
          c.fillStyle = p.surface
          c.fill()
          c.globalAlpha = 1
          c.strokeStyle = p.textMuted
          c.lineWidth = 1
          c.stroke()
        }
      }

      draw.text(c, `남은 탄 ${ammo}발`, 24, COUNTER_Y + 52, {
        size: 13,
        align: 'left',
        color: ammo === 0 ? p.danger : p.textMuted,
      })
      draw.text(c, `모은 번호 ${pool.awarded.length} / 6`, stage.width - 24, COUNTER_Y + 52, {
        size: 13,
        align: 'right',
        color: p.text,
      })
    }

    /**
     * 꽝 폭발 — 만화식 별 + 큰 글자 + 설명 한 줄.
     *
     * ── ⚠ 왜 이렇게 크고 오래 남는가 ────────────────────────────────
     * 처음에는 날아가는 오리 위에 16px 짜리 "꽝" 을 0.5초 띄웠다. 그 결과 **꽝인지 아닌지
     * 알 수 없다**는 지적을 받았다 — 눈이 오리를 쫓는 동안 글자는 이미 사라져 있다.
     * 그래서 셋을 함께 준다.
     *   ① 터지는 순간의 충격파(0.3초)  ② 튀어나오는 별 + 큰 글자  ③ **무엇을 잃었는지** 한 줄
     * 마지막 18% 구간에서만 흐려진다. 그 전에는 또렷하게 남아 읽을 시간을 준다.
     */
    function drawBlank(c: CanvasRenderingContext2D, p: Palette, timeMs: number): void {
      if (blankFx.t < 0) return
      const t = blankFx.t
      const { x, y } = blankFx
      const alpha = t > 0.82 ? 1 - (t - 0.82) / 0.18 : 1

      // 충격파 링. 터진 직후에만 짧게 퍼진다. 움직임 최소화면 생략한다.
      if (!ctx.reducedMotion) {
        const ringT = draw.clamp(t / 0.3, 0, 1)
        if (ringT < 1) {
          const e = draw.easeOutCubic(ringT)
          c.save()
          c.globalAlpha = alpha * (1 - e) * 0.9
          c.strokeStyle = p.warning
          c.lineWidth = 5 * (1 - e) + 1
          c.beginPath()
          c.arc(x, y, 16 + e * 96, 0, Math.PI * 2)
          c.stroke()
          c.restore()
        }
      }

      c.save()
      c.globalAlpha = alpha
      c.translate(x, y)
      // 튀어나왔다 자리를 잡는다. 움직임 최소화면 크기 변화 없이 그대로 뜬다.
      const pop = draw.easeOutCubic(draw.clamp(t / 0.16, 0, 1))
      const settle = draw.easeOutCubic(draw.clamp((t - 0.16) / 0.22, 0, 1))
      c.scale(
        ctx.reducedMotion ? 1 : 0.45 + pop * 0.9 - settle * 0.28,
        ctx.reducedMotion ? 1 : 0.45 + pop * 0.9 - settle * 0.28,
      )
      if (!ctx.reducedMotion) c.rotate(Math.sin(timeMs / 260) * 0.05)

      /*
        만화식 폭발 별을 **두 겹**으로 그린다. 바깥은 주황, 안쪽은 노랑 — 한 겹이면 평평해
        보이고, 두 겹이면 불꽃처럼 읽힌다.

        ⚠ 바깥을 `--color-warning` 으로 칠하지 않는다. 그 토큰은 **연한 배경 위 경고 글자용**
          이라 라이트에서 어두운 갈색으로 나온다. 실제로 그렇게 칠했더니 별이 갈색 덩어리가
          되고 그 위 어두운 글자가 통째로 묻혔다(2026-09-10 실측).
        ⚠ 안쪽 노랑은 공식 볼 1구간 색이다. 사이트가 **그 색 위에는 `ballFgDark`** 를 쓰도록
          이미 정해 두었으므로, 글자 대비가 라이트·다크 양쪽에서 보장된다.
      */
      const spikes = 12
      const star = (outer: number, inner: number) => {
        c.beginPath()
        for (let i = 0; i < spikes * 2; i += 1) {
          const a = (Math.PI / spikes) * i - Math.PI / 2
          const r = i % 2 === 0 ? outer : inner
          const sx = Math.cos(a) * r
          const sy = Math.sin(a) * r * 0.86
          if (i === 0) c.moveTo(sx, sy)
          else c.lineTo(sx, sy)
        }
        c.closePath()
      }

      star(78, 48)
      c.fillStyle = p.svc.reco
      c.fill()
      // 별을 배경에서 떼어 놓는 테두리. 어두운 배경에서도 형태가 산다.
      c.lineWidth = 3
      c.lineJoin = 'round'
      c.strokeStyle = p.surface
      c.stroke()

      star(60, 38)
      c.fillStyle = p.ball[1]
      c.fill()

      c.fillStyle = p.ballFgDark
      c.font = `800 46px ${p.fontSans}`
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.fillText('꽝', 0, -2)
      c.restore()

      // 설명 한 줄. "꽝" 만으로는 **무엇을 잃었는지** 알 수 없다.
      c.save()
      c.globalAlpha = alpha
      const label = '번호를 얻지 못했어요'
      c.font = `600 13px ${p.fontSans}`
      const w = c.measureText(label).width + 20
      const ly = y + 84
      draw.roundRect(c, x - w / 2, ly - 12, w, 24, 12)
      c.fillStyle = p.surface
      c.fill()
      c.strokeStyle = p.border
      c.lineWidth = 1
      c.stroke()
      c.fillStyle = p.text
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.fillText(label, x, ly)
      c.restore()
    }

    /**
     * 조준이 덜 끝났는데 뗐을 때의 안내.
     *
     * ⚠ **캔버스 안에, 조준했던 자리 옆에 띄운다.** 캔버스 아래 `hint` 줄에도 같은 말이
     *   있지만 그때 눈은 오리와 조준점에 있다 — 화면 밖 글자는 읽히지 않는다.
     * ⚠ 탄약이 줄지 않았다는 사실을 함께 말한다. 그 말이 없으면 "한 발 손해 봤다" 고
     *   오해하고, 그 오해가 다음에도 급하게 쏘게 만든다.
     */
    function drawHold(c: CanvasRenderingContext2D, p: Palette): void {
      if (holdFx.t < 0) return
      const t = holdFx.t
      // 마지막 25% 에서만 흐려진다. 그 전에는 또렷하게 남아 읽을 시간을 준다.
      const alpha = t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1
      const line1 = '조준 중이었어요'
      const line2 = '조준점이 좁혀진 뒤에 떼세요 (탄약은 그대로)'

      c.save()
      c.globalAlpha = alpha
      c.font = `600 13px ${p.fontSans}`
      const w = Math.max(c.measureText(line1).width, c.measureText(line2).width) + 24
      // 조준점 위에 띄우되, 화면 밖으로 나가지 않게 가둔다.
      const bx = draw.clamp(holdFx.x, w / 2 + 6, stage.width - w / 2 - 6)
      const by = draw.clamp(holdFx.y - 52, 22, COUNTER_Y - 50)

      draw.roundRect(c, bx - w / 2, by - 20, w, 40, 10)
      c.fillStyle = p.surface
      c.fill()
      c.strokeStyle = p.textMuted
      c.lineWidth = 1.5
      c.stroke()

      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.fillStyle = p.text
      c.font = `700 13px ${p.fontSans}`
      c.fillText(line1, bx, by - 8)
      c.fillStyle = p.textMuted
      c.font = `500 12px ${p.fontSans}`
      c.fillText(line2, bx, by + 10)
      c.restore()
    }

    /** 빗나감 표시 — 확산하는 링 + `×`. 맞았는지 아닌지가 즉시 읽혀야 한다. */
    function drawMiss(c: CanvasRenderingContext2D, p: Palette): void {
      if (missFx.t < 0) return
      const e = draw.easeOutCubic(missFx.t)
      const r = 8 + e * 24
      c.save()
      c.globalAlpha = (1 - e) * 0.9
      c.strokeStyle = p.textMuted
      c.lineWidth = 2.5
      c.beginPath()
      c.arc(missFx.x, missFx.y, r, 0, Math.PI * 2)
      c.stroke()

      const s = 7
      c.lineWidth = 3
      c.lineCap = 'round'
      c.beginPath()
      c.moveTo(missFx.x - s, missFx.y - s)
      c.lineTo(missFx.x + s, missFx.y + s)
      c.moveTo(missFx.x + s, missFx.y - s)
      c.lineTo(missFx.x - s, missFx.y + s)
      c.stroke()
      c.restore()
    }

    const instance: GameInstance = {
      fixedUpdate(dt) {
        elapsed += dt

        /*
          테마 폴링. 위 `PALETTE_POLL` 주석의 이유로 스냅샷을 스스로 갱신한다.
          ⚠ `draw` 가 아니라 여기서 부른다. `draw` 는 프레임마다 여러 번 불릴 수 있고
            (보간 렌더), `fixedUpdate` 는 1/60 로 고정이라 호출 빈도를 셈할 수 있다.
          ⚠ 값이 같아도 객체는 새로 온다. 그래도 그대로 교체한다 — 초당 하나짜리 할당보다,
            어떤 색이 바뀌었는지 일일이 비교하다 하나를 빠뜨리는 쪽이 훨씬 비싸다.
            실제로 다시 굽는 판단은 `draw` 의 `sceneKey` 비교가 한다.
        */
        paletteAge += dt
        if (paletteAge >= PALETTE_POLL) {
          paletteAge = 0
          palette = readPalette()
        }

        // 키보드 조준. 포인터가 없는 사용자도 세 줄을 모두 오갈 수 있어야 한다.
        let kx = 0
        let ky = 0
        if (input.down('left')) kx -= 1
        if (input.down('right')) kx += 1
        if (input.down('up')) ky -= 1
        if (input.down('down')) ky += 1
        if (kx !== 0 || ky !== 0) {
          /*
            ⚠ 방향키를 누르면 조준점을 **계속 보이게** 한다. 포인터와 달리 키보드에는
              "누르고 있는 손가락" 이 없어, 숨겨 두면 어디를 겨누는지 알 방법이 없다.
            ⚠ 포인터로 누르고 있는 중이면 그쪽이 우선이다 — 두 입력이 조준점을 뺏고 뺏기면
              화면이 튄다.
          */
          if (aimMode !== 'pointer') {
            aimMode = 'key'
            /*
              ⚠ **스페이스를 누르고 있는 중이면 `aimZoom` 을 건드리지 않는다.** 방향키로
                조준점을 미세 조정하는 동안 조준이 처음으로 되돌아가면, 겨냥을 고칠수록
                못 쏘게 되는 모순이 된다. 조준 중이 아닐 때만 1로 둬서 원 없이 이동한다.
            */
            if (!keyHold) aimZoom = 1
          }
          // 대각선이 빨라지지 않게 정규화한다.
          const len = Math.hypot(kx, ky)
          aimTo(cross.x + (kx / len) * KEY_AIM_SPEED * dt, cross.y + (ky / len) * KEY_AIM_SPEED * dt)
        }

        // 조준 진행. 포인터를 누르고 있거나 스페이스를 누르고 있는 동안만 좁혀진다.
        if ((aimMode === 'pointer' || keyHold) && aimZoom < 1) {
          aimZoom = Math.min(1, aimZoom + dt / AIM_ZOOM_TIME)
          // 막 끝난 순간 한 번 번쩍여 "지금 떼면 된다" 를 알린다.
          if (aimZoom >= 1) readyFlash = 0
        }
        if (readyFlash >= 0) {
          readyFlash += dt / READY_FLASH_TIME
          if (readyFlash >= 1) readyFlash = -1
        }
        if (holdFx.t >= 0) {
          holdFx.t += dt / HOLD_FX_TIME
          if (holdFx.t >= 1) holdFx.t = -1
        }
        // 흔들림은 조준 중에만 흐른다. 쉬는 동안 위상이 흘러가면 다시 잡을 때 튄다.
        if (aimMode !== 'none') swayT += dt

        if (cooldown > 0) cooldown = Math.max(0, cooldown - dt)
        if (missFx.t >= 0) {
          missFx.t += dt / MISS_TIME
          if (missFx.t >= 1) missFx.t = -1
        }
        if (blankFx.t >= 0) {
          blankFx.t += dt / BLANK_FX_TIME
          if (blankFx.t >= 1) blankFx.t = -1
        }
        if (shake > 0) shake = Math.max(0, shake - dt * 26)

        for (let l = 0; l < LANE_Y.length; l += 1) {
          beltOffset[l] += LANE_DIR[l] * laneSpeed(l) * dt
        }

        for (const d of ducks) {
          if (d.state === 'run') {
            d.prevX = d.x
            d.prevBob = d.bob
            d.x += LANE_DIR[d.lane] * laneSpeed(d.lane) * dt
            /*
              화면 밖 40px 에서 반대편으로 재진입한다.

              ⚠ **`prevX` 를 함께 옮겨야 한다.** 그리기는 `lerp(prevX, x, alpha)` 로 두 값
                사이를 보간하는데, 되돌린 쪽만 옮기면 그 프레임에 **399 → −40 을 잇는 선분**
                위 어딘가가 나온다 — 오리가 화면 한가운데 한 프레임 나타났다 사라진다.
                레인당 4~8초에 한 번, 여섯 마리면 대략 1초에 한 번 꼴이라 "간간이 깜빡인다"
                로 보였다(2026-09-17 사용자 보고).
                순간이동은 위치를 **두 값 다** 옮겨야 보간에도 순간이동으로 남는다.
            */
            if (d.x > WRAP_RIGHT) {
              d.x -= WRAP_SPAN
              d.prevX -= WRAP_SPAN
            } else if (d.x < WRAP_LEFT) {
              d.x += WRAP_SPAN
              d.prevX += WRAP_SPAN
            }
            d.bob = Math.sin(elapsed * 2.4 + d.phase) * 3

            /*
              랜덤 점프. 가만히 기다렸다 쏘는 전략을 깨는 장치다.
              ⚠ 점프는 판정 y 도 함께 올린다(`duckHitY`). 그림만 올리면 "맞췄는데 안 맞는"
                판정이 된다.
            */
            if (d.jumpT >= 0) {
              d.jumpT += dt / JUMP_TIME
              if (d.jumpT >= 1) {
                d.jumpT = -1
                d.jumpCd = rng.range(JUMP_CD_MIN, JUMP_CD_MAX)
              }
            } else if (phase === 'playing') {
              d.jumpCd -= dt
              if (d.jumpCd <= 0) d.jumpT = 0
            }
          } else if (d.state === 'fly') {
            d.t += dt / (ctx.reducedMotion ? FLY_TIME_REDUCED : FLY_TIME)
            if (d.t >= 1 + RESPAWN_DELAY) {
              respawn(d)
            } else if (d.t >= 1 && !d.blank && !shelf[d.slot].filled) {
              // 도착하는 순간부터 물음표가 번호로 바뀌기 시작한다.
              shelf[d.slot] = { value: d.value, reveal: 0, filled: true }
            }
          }
        }

        for (const s of shelf) {
          if (s.filled && s.reveal < 1) s.reveal = Math.min(1, s.reveal + dt / REVEAL_TIME)
        }

        sparks.update(dt)
      },

      draw(c, alpha, timeMs) {
        /*
          ⚠ `ctx.palette` 가 아니라 **스스로 갱신하는 `palette`** 를 쓴다. 전자는 create
            시점에 굳은 객체라 테마를 바꿔도 변하지 않는다(위 PALETTE_POLL 주석).
        */
        const p = palette
        const low = ctx.quality.level === 'low'

        // 테마가 바뀌었으면 실루엣을 다시 굽는다. 형태는 그대로라 스카이라인은 유지된다.
        const key = sceneKey(p)
        if (cache.key !== key) cache = bakeScene(skyline, p)

        c.save()
        if (shake > 0) {
          // 빗나감의 타격감. 움직임 최소화면 shake 가 0 이라 아무 일도 없다.
          c.translate(Math.sin(timeMs / 18) * shake, Math.cos(timeMs / 23) * shake * 0.6)
        }

        // 패럴랙스는 조준선의 중심 이탈을 따른다. 움직임 최소화면 0(계약: 패럴랙스 정지).
        const aimShift = ctx.reducedMotion ? 0 : cross.x - stage.width / 2
        drawBackdrop(c, draw, stage, p, cache, aimShift)
        drawStand(c, draw, stage, p, timeMs, low)

        // 선반의 볼. 슬롯 위치가 고정이라 획득 순서와 무관하게 화면이 흔들리지 않는다.
        for (let i = 0; i < shelf.length; i += 1) {
          const s = shelf[i]
          const x = shelfX(i)
          if (!s.filled) {
            /*
              빈 자리.
              ⚠ **`surface2` 를 깔던 것을 글자색 저알파로 바꿨다.** 실측에서 라이트 모드의
                빈 칸 여섯 개가 거의 보이지 않았다 — `surface2` 는 라이트에서 흰색에 가까워
                흰 배경 위에 흰 원을 그린 꼴이었고, "여섯 칸을 채운다" 는 목표가 화면에서
                사라졌다. 글자색을 α0.07 로 깔면 **라이트에서는 옅은 회색, 다크에서는 옅은
                밝은 판**이 되어 양쪽에서 같은 정도로 읽힌다.
              ⚠ 색만으로 전하지 않는다. 채워진 칸은 볼(숫자 포함)이 되고 빈 칸은 테두리
                원이라 형태가 이미 다르다.
            */
            c.globalAlpha = 0.07
            c.fillStyle = p.text
            c.beginPath()
            c.arc(x, SHELF_CY, SHELF_R - 1, 0, Math.PI * 2)
            c.fill()
            c.globalAlpha = 1
            c.strokeStyle = p.border
            c.lineWidth = 1.5
            c.beginPath()
            c.arc(x, SHELF_CY, SHELF_R - 1, 0, Math.PI * 2)
            c.stroke()
            continue
          }
          draw.softShadow(c, x, SHELF_CY + SHELF_R + 3, SHELF_R - 2, 3, 0.16)
          if (s.reveal < 1) {
            draw.mysteryBall(c, x, SHELF_CY, SHELF_R, { alpha: 1 - s.reveal })
            draw.ball(c, x, SHELF_CY, SHELF_R, s.value, { alpha: s.reveal })
          } else {
            draw.ball(c, x, SHELF_CY, SHELF_R, s.value)
          }
        }

        // 컨베이어 세 줄. 오리보다 먼저 그려 뒤에 깔린다.
        for (let l = 0; l < LANE_Y.length; l += 1) drawBelt(c, stage, p, l, beltOffset[l])

        for (const d of ducks) {
          if (d.state === 'run') {
            const x = draw.lerp(d.prevX, d.x, alpha)
            const y = duckDrawY(d, alpha, draw.lerp)
            // 접지 그림자(시각 언어 규칙 2). 그림자는 벨트에 남고 오리만 뛴다.
            draw.softShadow(c, x, LANE_Y[d.lane] + SHADOW_DY, DUCK_RX - 4, 4, 0.18)
            drawDuck(c, draw, p, x, y, LANE_DIR[d.lane], false, 0)
          } else if (d.state === 'fly' && d.t < 1) {
            const e = draw.easeOutCubic(d.t)
            /*
              번호를 문 오리는 선반으로, 꽝은 위로 날아간다.
              ⚠ 움직임 최소화면 호를 그리지 않고 짧게 페이드아웃한다(계약: 공개 연출을 페이드로).
            */
            // 꽝은 폭발에 밀려 위로 튕겨 나간다. 번호를 문 오리는 선반으로 간다.
            const tx = d.blank ? d.fromX + LANE_DIR[d.lane] * 70 : shelfX(d.slot)
            const ty = d.blank ? -60 : SHELF_CY
            const x = draw.lerp(d.fromX, tx, e)
            const arc = ctx.reducedMotion || d.blank ? 0 : Math.sin(e * Math.PI) * 46
            const y = draw.lerp(d.fromY, ty, e) - arc
            const spin = ctx.reducedMotion ? 0 : e * Math.PI * 1.6 * LANE_DIR[d.lane]
            c.save()
            c.globalAlpha = 1 - e * 0.85
            drawDuck(c, draw, p, x, y, LANE_DIR[d.lane], true, spin)
            c.restore()
          }
        }

        drawMiss(c, p)
        sparks.draw(c)

        drawCounter(c, stage, p)
        drawAmmo(c, p)

        /*
          ⚠ 조준점은 **조준 중일 때만** 그린다. 손가락을 떼면 사라지고, 다시 누르면 크게
            나타나 좁혀진다. 평소에 십자선이 떠 있으면 모바일에서 손가락과 겹쳐 방해가 된다.
        */
        if (aimMode !== 'none' && phase === 'playing') {
          const aim = aimPoint()
          drawCrosshair(
            c,
            p,
            aim.x,
            aim.y,
            cooldown > 0 ? 1 - cooldown / COOLDOWN : 1,
            ammo <= 0,
            // 바깥 점선 원 = 조준이 끝나기까지 남은 거리. 0이 되어야 발사할 수 있다.
            aimRing(),
            readyFlash,
          )
        }

        /*
          ⚠ 꽝은 **가장 마지막에** 그린다. 파티클·조준선 아래에 두면 연기와 십자선이 글자를
            가려 정작 "꽝" 을 못 읽는다 — 실제로 조준선이 별 한가운데를 지나갔다.
        */
        drawBlank(c, p, timeMs)
        // 조준 안내도 꽝과 같은 이유로 맨 위다 — 조준선·파티클에 가리면 읽을 수 없다.
        drawHold(c, p)

        c.restore()
      },

      handle(ev: GameInput) {
        if (ev.kind === 'pointer') {
          if (ev.phase === 'down') {
            // 누르는 순간 조준점이 크게 나타나 0.7초에 걸쳐 원래 크기로 좁혀진다.
            aimMode = 'pointer'
            aimZoom = 0
            aimTo(ev.x, ev.y)
            return
          }
          if (ev.phase === 'move') {
            if (aimMode === 'pointer') aimTo(ev.x, ev.y)
            return
          }
          // up · cancel
          if (aimMode !== 'pointer') return
          /*
            ⚠ **발사 판정을 먼저 하고 리셋한다.** 순서를 뒤집으면 `aimZoom` 이 1로 돌아간
              뒤에 `shoot()` 이 불려 **조준이 끝났는지 알 수 없게 된다** — 언제 떼도 발사가
              되어 이 규칙 전체가 무력해진다.
            ⚠ **취소는 발사하지 않는다.** `pointercancel` 은 iOS 스와이프·통화 알림처럼
              사용자가 의도하지 않은 중단에서 온다. 그때 한 발이 나가면 탄을 도둑맞은 셈이다.
          */
          if (ev.phase === 'up') shoot()
          aimMode = 'none'
          aimZoom = 1
          return
        }

        if (ev.action !== 'primary') return

        if (ev.phase === 'down') {
          // 오버레이의 "게임시작" 버튼도 이 경로로 들어온다.
          if (phase === 'ready') {
            startRun()
            return
          }
          /*
            ⚠ 캔버스 `pointerdown` 은 `pointer down` 과 `action primary down` 을 **둘 다**
              보낸다(계약: 입력 절). 포인터 쪽은 위 분기가 이미 처리했으므로 여기서 또
              다루면 조준이 두 번 초기화된다. 키보드만 받는다.
          */
          if (ev.source !== 'key') return
          aimMode = 'key'
          keyHold = true
          aimZoom = 0
          return
        }

        /*
          스페이스를 뗐다 — 키보드의 발사 시점이다.
          ⚠ `keyHold` 를 확인한다. 시작 버튼을 누를 때 온 `down` 은 위에서 `startRun()` 으로
            빠져 `keyHold` 를 켜지 않으므로, 그 버튼의 `up` 으로 **판이 시작하자마자 한 발이
            나가는** 일이 없다.
        */
        if (ev.source !== 'key' || !keyHold) return
        keyHold = false
        shoot()
        aimZoom = 1
      },

      destroy() {
        sparks.clear()
      },
    }



    return instance
  },
}

export default game
