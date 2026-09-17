import { ballRange } from '@/lib/lotto'

import type { DrawKit, Palette, Rng, StageSize } from '@/games/core/types'

import {
  BALL_R,
  BIN_BALL_R,
  BIN_COUNT,
  BIN_FLOOR,
  BIN_H,
  BIN_TOP,
  BIN_W,
  DROP_MAX_X,
  DROP_MIN_X,
  DROP_Y,
  PEG_FIRST_Y,
  PEG_R,
  PEG_ROW_GAP,
  binCenterX,
  type PegLayout,
} from './layout'

/**
 * G05 플린코 — **그리기**.
 *
 * → 사양서: docs/wiki/20-design/game-g05-plinko.md "아트 디렉션"
 *
 * ── 시각 언어 4대 규칙(계약) 을 이 파일이 어떻게 지키는가 ─────────
 * 1. 배경 = 그라디언트 + 비네트 + 별. **오프스크린에 한 번 그려 캐시하고 `drawImage` 만 한다.**
 * 2. 접지 그림자 — 볼과 빈이 `softShadow` 를 갖는다.
 * 3. 좌상단 광원 림라이트 — 못·컵 상단에 밝은 호를 얹는다.
 * 4. 숫자는 **반드시** `draw.ball()` 로만 그린다. 다만 이 게임에서 숫자가 나오는 곳은
 *    **볼이 깨진 뒤 한 곳뿐**이다 — 빈에는 계약대로 구간 색만 보인다(색 힌트형).
 *
 * ── ⚠ 여섯 게임 중 유일한 다크 톤이다 ──────────────────────────────
 * 그런데 게임 코드에는 hex 리터럴을 둘 수 없다(계약의 검증 게이트). 그래서 **팔레트에서
 * 파생**한다 — `primary`→`info` 그라디언트 위에 검정 α0.76 을 덮는다. 라이트에서든
 * 다크에서든 결과가 짙은 남색이 되는 것이 이 방식의 요점이다. 라이트 테마 토큰을 그대로
 * 쓰면 배경이 밝아져 다크 톤이라는 설계가 사라진다.
 *
 * ⚠ 배경이 **항상 어둡기 때문에** 캔버스 안 글자는 `palette.text` 가 아니라 `palette.ballFg`
 *   (진한 볼 위 글자 = 흰색)를 쓴다. `text` 를 쓰면 라이트 테마에서 검은 글자가 검은 배경에
 *   얹혀 아무것도 보이지 않는다.
 */

/**
 * 배경 캐시 배율.
 *
 * ⚠ **고정값으로 두면 안 된다.** 무대가 논리 360px 인데 화면에 그려지는 폭은 기기마다 다르고
 *   DPR 까지 곱해진다. 2 로 고정해 두면 큰 화면·고DPR 에서 캐시를 확대해 쓰게 되어 배경만
 *   흐릿해진다. `getTransform().a`(호스트가 건 논리→실픽셀 배율)를 읽어 따라간다.
 * ⚠ 매 프레임 다시 그리면 그것대로 프레임을 먹으므로, 차이가 클 때만 그리고 쿨다운을 둔다.
 */
const BACKDROP_SCALE_MIN = 1.5
const BACKDROP_SCALE_MAX = 3
/** 이만큼 어긋나야 다시 그린다. */
const BACKDROP_SCALE_EPS = 0.3
/** 다시 그린 뒤 이 시간(ms) 안에는 또 그리지 않는다 — 리사이즈 중 연속 재할당을 막는다. */
const BACKDROP_REDRAW_COOLDOWN = 1500
/** 배경 그라디언트를 덮는 검정. 이 값이 "짙은 남색" 을 만든다. */
const DARKEN = 0.76
const STAR_COUNT = 60
/** 이 개수만 매 프레임 다시 그려 반짝인다. 나머지는 캐시 이미지에 박혀 있다. */
const TWINKLE_COUNT = 12

export interface Backdrop {
  /** 캐시 이미지. 캔버스를 만들 수 없는 환경이면 `null` — 그때는 매 프레임 직접 그린다. */
  image: HTMLCanvasElement | null
  /** 반짝임용 별. 캐시에 이미 그려진 별 중 일부와 같은 자리다. */
  twinkle: Float32Array
  /** 캐시를 그릴 때 쓴 배율. 화면 배율과 벌어지면 다시 그린다. */
  scale: number
  /** 마지막으로 다시 그린 시각(ms). 쿨다운 판정에 쓴다. */
  redrawnAt: number
  /** 별 좌표를 재현하려고 들고 있는 독립 스트림의 시드. */
  starSeed: number
}

/**
 * 배경 캐시를 만든다.
 *
 * ⚠ 별 좌표는 `rng.fork()` 로 뽑는다. 물리와 같은 스트림을 쓰면 배경이 난수를 60개 소비해
 *   **같은 시드로도 낙하 결과가 달라진다** — 재현성이 이 게임의 디버깅 수단이므로 지켜야 한다.
 */
export function createBackdrop(stage: StageSize, palette: Palette, rng: Rng): Backdrop {
  const twinkle = new Float32Array(TWINKLE_COUNT * 4)
  /*
    ⚠ 별 좌표는 `rng.fork()` 로 뽑는다. 물리와 같은 스트림을 쓰면 배경이 난수를 60개 소비해
      **같은 시드로도 낙하 결과가 달라진다** — 재현성이 이 게임의 디버깅 수단이므로 지켜야 한다.
    ⚠ 시드를 따로 보관하는 이유: 배율이 바뀌어 다시 그릴 때 **같은 별자리**가 나와야 한다.
      매번 새 fork 를 하면 리사이즈할 때마다 하늘이 바뀌어 고장으로 읽힌다.
  */
  const starSeed = Math.floor(rng.fork().next() * 4294967296) >>> 0

  const backdrop: Backdrop = {
    image: null,
    twinkle,
    scale: 0,
    redrawnAt: 0,
    starSeed,
  }
  renderBackdrop(backdrop, stage, palette, rng, BACKDROP_SCALE_MIN)
  if (backdrop.image === null) fillTwinkle(forkFromSeed(rng, starSeed), stage, twinkle)
  return backdrop
}

/**
 * 같은 시드에서 같은 별자리를 다시 만든다.
 *
 * ⚠ `Rng` 인터페이스에는 "시드로 새 스트림 만들기" 가 없고 `fork()` 뿐이다. `fork` 는 부모를
 *   한 번 소비하므로 여기서 쓰면 재현성이 깨진다. 그래서 **부모를 건드리지 않는 로컬 스트림**
 *   을 직접 만든다 — `core/rng.ts` 와 같은 mulberry32 지만 자기 폴더의 사본이다
 *   (계약: 프리미티브가 더 필요하면 자기 폴더에 로컬 함수로 둔다).
 */
function forkFromSeed(_parent: Rng, seed: number): Rng {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const self: Rng = {
    next,
    int: (min, maxInclusive) => min + Math.floor(next() * (maxInclusive - min + 1)),
    range: (min, max) => min + next() * (max - min),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    sign: () => (next() < 0.5 ? -1 : 1),
    gauss: () => {
      let sum = 0
      for (let i = 0; i < 12; i += 1) sum += next()
      return sum - 6
    },
    fork: () => forkFromSeed(self, (next() * 4294967296) >>> 0),
  }
  return self
}

/** 캐시 이미지를 주어진 배율로 만든다. 실패하면 `image` 를 `null` 로 둔다. */
function renderBackdrop(
  backdrop: Backdrop,
  stage: StageSize,
  palette: Palette,
  rng: Rng,
  scale: number,
): void {
  if (typeof document === 'undefined') return
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(stage.width * scale)
  canvas.height = Math.round(stage.height * scale)
  const oc = canvas.getContext('2d')
  if (oc === null) return
  oc.scale(scale, scale)
  paintBackdrop(oc, stage, palette, forkFromSeed(rng, backdrop.starSeed), backdrop.twinkle)
  backdrop.image = canvas
  backdrop.scale = scale
}

/**
 * 화면 배율과 캐시 배율이 벌어졌으면 다시 그린다. **`draw` 첫머리에서 부른다.**
 *
 * @param timeMs 호스트가 주는 누적 시간. 쿨다운 판정에 쓴다
 */
export function ensureBackdropScale(
  c: CanvasRenderingContext2D,
  backdrop: Backdrop,
  stage: StageSize,
  palette: Palette,
  rng: Rng,
  timeMs: number,
): void {
  if (backdrop.image === null) return
  /*
    ⚠ `getTransform().a` 는 호스트가 건 **논리 좌표 → 실제 픽셀** 배율이다. DPR 이 이미 곱해져
      있으므로 게임이 DPR 을 직접 읽을 필요가 없다(계약이 금지한 일이기도 하다).
  */
  const want = Math.min(
    BACKDROP_SCALE_MAX,
    Math.max(BACKDROP_SCALE_MIN, c.getTransform().a || BACKDROP_SCALE_MIN),
  )
  if (Math.abs(want - backdrop.scale) < BACKDROP_SCALE_EPS) return
  if (timeMs - backdrop.redrawnAt < BACKDROP_REDRAW_COOLDOWN) return
  backdrop.redrawnAt = timeMs
  renderBackdrop(backdrop, stage, palette, rng, want)
}

/**
 * 실제 배경을 그린다. **오프스크린에 한 번만** 부른다.
 *
 * ⚠ `draw.bgGradient` 를 쓰지 않는다. 그 캐시는 `CanvasGradient` 를 컨텍스트 구분 없이
 *   보관하는데, 오프스크린과 본 캔버스는 다른 컨텍스트다. 한 번만 그리는 그림이라 캐시의
 *   이점도 없다.
 */
function paintBackdrop(
  c: CanvasRenderingContext2D,
  stage: StageSize,
  palette: Palette,
  bgRng: Rng,
  twinkle: Float32Array,
): void {
  const g = c.createLinearGradient(0, 0, 0, stage.height)
  g.addColorStop(0, palette.primary)
  g.addColorStop(1, palette.info)
  c.fillStyle = g
  c.fillRect(0, 0, stage.width, stage.height)

  // 두 테마 모두에서 짙은 남색이 되도록 눌러 준다.
  c.fillStyle = `rgba(0,0,0,${DARKEN})`
  c.fillRect(0, 0, stage.width, stage.height)

  // 별. 위쪽에 촘촘하고 아래로 갈수록 성기게 — 판이 있는 아래쪽에서 시선을 뺏지 않는다.
  for (let i = 0; i < STAR_COUNT; i += 1) {
    const x = bgRng.range(0, stage.width)
    const y = bgRng.range(0, stage.height) * bgRng.range(0.35, 1)
    const r = bgRng.range(0.5, 1.5)
    const a = bgRng.range(0.2, 0.7)
    c.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`
    c.beginPath()
    c.arc(x, y, r, 0, Math.PI * 2)
    c.fill()
    if (i < TWINKLE_COUNT) {
      twinkle[i * 4] = x
      twinkle[i * 4 + 1] = y
      twinkle[i * 4 + 2] = r
      twinkle[i * 4 + 3] = a
    }
  }

  // 판 뒤쪽에 은은한 후광. 못이 떠 있지 않고 무언가에 박혀 있는 느낌을 준다.
  const glow = c.createRadialGradient(
    stage.width / 2,
    PEG_FIRST_Y + 190,
    20,
    stage.width / 2,
    PEG_FIRST_Y + 190,
    260,
  )
  glow.addColorStop(0, 'rgba(255,255,255,0.07)')
  glow.addColorStop(1, 'rgba(255,255,255,0)')
  c.fillStyle = glow
  c.fillRect(0, 0, stage.width, stage.height)

  // 비네트(규칙 1). 가장자리를 눌러 시선을 판으로 모은다.
  const cx = stage.width / 2
  const cy = stage.height / 2
  const rr = Math.hypot(cx, cy)
  const v = c.createRadialGradient(cx, cy, rr * 0.5, cx, cy, rr)
  v.addColorStop(0, 'rgba(0,0,0,0)')
  v.addColorStop(1, 'rgba(0,0,0,0.4)')
  c.fillStyle = v
  c.fillRect(0, 0, stage.width, stage.height)
}

function fillTwinkle(bgRng: Rng, stage: StageSize, twinkle: Float32Array): void {
  for (let i = 0; i < TWINKLE_COUNT; i += 1) {
    twinkle[i * 4] = bgRng.range(0, stage.width)
    twinkle[i * 4 + 1] = bgRng.range(0, stage.height * 0.6)
    twinkle[i * 4 + 2] = bgRng.range(0.5, 1.5)
    twinkle[i * 4 + 3] = bgRng.range(0.2, 0.7)
  }
}

export function drawBackdrop(
  c: CanvasRenderingContext2D,
  backdrop: Backdrop,
  stage: StageSize,
  palette: Palette,
  timeMs: number,
  reducedMotion: boolean,
): void {
  if (backdrop.image !== null) {
    c.drawImage(backdrop.image, 0, 0, stage.width, stage.height)
  } else {
    // 캐시가 없는 최악의 경우. 최소한 배경색은 채워 캔버스가 검게 남지 않게 한다.
    c.fillStyle = palette.primary
    c.fillRect(0, 0, stage.width, stage.height)
    c.fillStyle = `rgba(0,0,0,${DARKEN})`
    c.fillRect(0, 0, stage.width, stage.height)
  }

  /*
    미세 반짝임. 별 12개만 다시 그린다.
    ⚠ 움직임 최소화에서는 끈다 — 계약이 정한 넷 중 "배경 패럴랙스 정지" 에 해당한다.
  */
  if (reducedMotion) return
  const t = timeMs / 1000
  for (let i = 0; i < TWINKLE_COUNT; i += 1) {
    const a = backdrop.twinkle[i * 4 + 3] * (0.55 + 0.45 * Math.sin(t * 1.7 + i * 1.9))
    if (a <= 0.02) continue
    c.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`
    c.beginPath()
    c.arc(backdrop.twinkle[i * 4], backdrop.twinkle[i * 4 + 1], backdrop.twinkle[i * 4 + 2], 0, Math.PI * 2)
    c.fill()
  }
}

/* ────────────────────────────────────────────────────────────
 * 못
 * ──────────────────────────────────────────────────────────── */

/** 못 충돌 링. 사양서의 "충돌 시 0.2초 링 확산". */
const RIPPLE_LIFE = 0.2
const RIPPLE_MAX = 12

export interface Ripples {
  x: Float32Array
  y: Float32Array
  life: Float32Array
  power: Float32Array
  head: number
}

export function createRipples(): Ripples {
  return {
    x: new Float32Array(RIPPLE_MAX),
    y: new Float32Array(RIPPLE_MAX),
    life: new Float32Array(RIPPLE_MAX),
    power: new Float32Array(RIPPLE_MAX),
    head: 0,
  }
}

/** ⚠ 풀링이다. 상한을 넘으면 가장 오래된 것을 덮어쓴다 — 객체를 새로 만들지 않는다. */
export function addRipple(r: Ripples, x: number, y: number, power: number): void {
  r.x[r.head] = x
  r.y[r.head] = y
  r.life[r.head] = RIPPLE_LIFE
  r.power[r.head] = power
  r.head = (r.head + 1) % RIPPLE_MAX
}

export function updateRipples(r: Ripples, dt: number): void {
  for (let i = 0; i < RIPPLE_MAX; i += 1) {
    if (r.life[i] > 0) r.life[i] -= dt
  }
}

export function drawPegs(
  c: CanvasRenderingContext2D,
  pegs: PegLayout,
  ripples: Ripples,
  palette: Palette,
  accent: string,
): void {
  c.save()

  // ① 링 확산을 못보다 먼저 깔아 못이 링에 덮이지 않게 한다.
  for (let i = 0; i < RIPPLE_MAX; i += 1) {
    const life = ripples.life[i]
    if (life <= 0) continue
    const t = 1 - life / RIPPLE_LIFE
    const radius = PEG_R + 2 + t * 12
    c.globalAlpha = (1 - t) * (0.25 + ripples.power[i] * 0.45)
    c.strokeStyle = accent
    c.lineWidth = 2
    c.beginPath()
    c.arc(ripples.x[i], ripples.y[i], radius, 0, Math.PI * 2)
    c.stroke()
  }
  c.globalAlpha = 1

  /*
    ② 못 본체.

    ⚠ **못을 흰색 불투명으로 그리면 판이 "흰 점 도트무늬" 가 된다.** 86개가 화면의 절반을
      덮기 때문이다. 375px 실측에서 정작 주인공인 볼과 빈이 그 무늬에 묻혔다. 그래서 채움을
      α0.66 까지 낮추고, 아래쪽에 어두운 반달을 얹어 **밝기 대신 입체로** 읽히게 했다.
      크기(r=4.5)는 사양서 값이라 건드리지 않는다 — 밝기만으로 해결되는 문제다.
  */
  for (let i = 0; i < pegs.count; i += 1) {
    const x = pegs.x[i]
    const y = pegs.y[i]

    // 접지 그림자(규칙 2). 못은 판에 박혀 있으므로 아주 얕게.
    c.globalAlpha = 0.4
    c.fillStyle = 'rgba(0,0,0,1)'
    c.beginPath()
    c.ellipse(x, y + PEG_R * 1.05, PEG_R * 0.95, PEG_R * 0.42, 0, 0, Math.PI * 2)
    c.fill()

    c.globalAlpha = 0.66
    c.fillStyle = palette.ballFg
    c.beginPath()
    c.arc(x, y, PEG_R, 0, Math.PI * 2)
    c.fill()

    // 아래쪽 반달을 어둡게 — 광원이 좌상단이므로 그림자는 우하단에 진다(규칙 3).
    c.globalAlpha = 0.3
    c.fillStyle = 'rgba(0,0,0,1)'
    c.beginPath()
    c.arc(x, y + PEG_R * 0.22, PEG_R * 0.86, 0, Math.PI)
    c.fill()

    // 좌상단 광원. 점 하나가 못을 금속처럼 보이게 한다.
    c.globalAlpha = 0.72
    c.fillStyle = 'rgba(255,255,255,1)'
    c.beginPath()
    c.arc(x - PEG_R * 0.3, y - PEG_R * 0.36, PEG_R * 0.32, 0, Math.PI * 2)
    c.fill()
    c.globalAlpha = 1
  }

  /*
    흔들리는 못에 강조 링. **색이 아니라 형태로도** 구분되게 한다(계약: 색만으로 전달 금지).
    ⚠ 2026-09-17 부터 첫 낙하에서도 흔들리므로 조건 없이 그린다.
  */
  for (const w of pegs.wobble) {
    c.strokeStyle = accent
    c.lineWidth = 1.6
    c.globalAlpha = 0.85
    c.beginPath()
    c.arc(pegs.x[w.index], pegs.y[w.index], PEG_R + 3.5, 0, Math.PI * 2)
    c.stroke()
  }

  c.restore()
}

/* ────────────────────────────────────────────────────────────
 * 하단 빈
 * ──────────────────────────────────────────────────────────── */

/** 빈 안 번호 볼의 중심 y. 컵 위쪽에 얹혀 잘리지 않는다. */
export const BIN_BALL_Y = BIN_TOP + 25

/**
 * 꽝 표식의 반지름.
 *
 * ⚠ 번호 볼(`BIN_BALL_R` = 13)보다 **작게** 잡는다. 같은 크기로 그리면 "무언가 들어 있는
 *   칸" 으로 읽혀, 한눈에 세어야 하는 "번호 여섯 · 꽝 셋" 이 흐려진다.
 */
const BLANK_MARK_R = 10

/**
 * **꽝 표식** — 어두운 원 + ✕.
 *
 * ⚠ **색만으로 알리지 않는다**(계약·프로젝트 규칙). 어둡게만 칠하면 저채도 화면이나
 *   색각 이상에서 번호 칸과 구분되지 않으므로, ✕ 라는 **형태**를 함께 준다.
 * ⚠ ✕ 를 글자(`draw.text`)로 그리지 않는다. 폰트에 따라 자리·굵기가 달라지고, 캔버스
 *   글자는 크기가 작아질수록 뭉갠다. 선 두 개로 직접 긋는다.
 */
function blankMark(
  c: CanvasRenderingContext2D,
  palette: Palette,
  x: number,
  y: number,
  r: number,
  alpha: number,
): void {
  c.save()
  c.globalAlpha = alpha

  c.fillStyle = 'rgba(0,0,0,0.45)'
  c.beginPath()
  c.arc(x, y, r, 0, Math.PI * 2)
  c.fill()

  c.strokeStyle = 'rgba(255,255,255,0.22)'
  c.lineWidth = 1
  c.beginPath()
  c.arc(x, y, r, 0, Math.PI * 2)
  c.stroke()

  const d = r * 0.45
  c.strokeStyle = palette.ballFg
  c.globalAlpha = alpha * 0.75
  c.lineWidth = 2.2
  c.lineCap = 'round'
  c.beginPath()
  c.moveTo(x - d, y - d)
  c.lineTo(x + d, y + d)
  c.moveTo(x + d, y - d)
  c.lineTo(x - d, y + d)
  c.stroke()

  c.restore()
}

/**
 * 아홉 개의 빈. 사다리꼴 컵 + 상단 구간색 띠 + **무지 색 볼**.
 *
 * ⚠ **번호를 그리지 않는다**(계약: 색 힌트형). 예약된 값은 `ballRange` 를 거쳐 **색으로만**
 *   나타나고, 번호 자체는 볼이 빈에 들어가 깨지는 순간 처음 드러난다.
 * ⚠ 그래서 `values` 는 "그릴 숫자" 가 아니라 **"어느 구간인지 알아내기 위한 값"** 이다.
 *   이 배열을 화면에 직접 쓰는 코드가 생기면 그 순간 계약 위반이다.
 *
 * ⚠ **꽝 칸은 `values[i] === null` 로 판별하지 않는다.** 예약을 받지 못한 빈도 `null` 인데
 *   그것은 사고이고 꽝은 규칙이라, 같은 그림을 그리면 사용자가 사고를 규칙으로 읽는다.
 *   꽝은 `blanks[i]` 로만 판별한다.
 *
 * @param values     빈별 예약 값. `null` 이면 예약을 받지 못한 빈이다(사실상 발생하지 않는다)
 * @param blanks     꽝 칸인가. 조준 **전에** 보여 피해서 노릴 수 있게 한다(2026-09-17)
 * @param hideIndex  이 빈의 볼은 그리지 않는다 — 깨지는 연출이 그 자리를 대신하기 때문이다
 * @param glowIndex  방금 번호가 나온 빈. 강조 링을 두른다
 * @param glowT      강조 진행도 0~1
 */
export function drawBins(
  c: CanvasRenderingContext2D,
  draw: DrawKit,
  palette: Palette,
  values: readonly (number | null)[],
  blanks: readonly boolean[],
  hideIndex: number,
  glowIndex: number,
  glowT: number,
  accent: string,
  stageWidth: number,
): void {
  c.save()

  /*
    빈 구역을 얕은 단으로 깔아 못 판과 분리한다.
    ⚠ 이것이 없으면 못 86개의 무늬 속에 컵이 섞여 "여기가 도착 지점" 이라는 것이 읽히지 않는다.
  */
  c.fillStyle = 'rgba(0,0,0,0.28)'
  c.fillRect(0, BIN_TOP - 6, stageWidth, BIN_H + 26)
  c.fillStyle = 'rgba(255,255,255,0.14)'
  c.fillRect(0, BIN_TOP - 6, stageWidth, 1)

  for (let i = 0; i < BIN_COUNT; i += 1) {
    const left = i * BIN_W
    const cx = binCenterX(i)
    const value = values[i] ?? null
    const blank = blanks[i] === true

    // 사다리꼴 컵. 아래가 좁아 "받는 그릇" 으로 읽힌다.
    c.beginPath()
    c.moveTo(left + 3.5, BIN_TOP)
    c.lineTo(left + BIN_W - 3.5, BIN_TOP)
    c.lineTo(left + BIN_W - 7.5, BIN_FLOOR)
    c.lineTo(left + 7.5, BIN_FLOOR)
    c.closePath()
    /*
      ⚠ 꽝 칸은 컵 자체를 **더 어둡게** 깐다. 볼만 다르게 그리면 아홉 칸이 한 줄로 늘어선
        판에서 "여기는 다르다" 가 충분히 빨리 읽히지 않는다 — 조준 전에 한눈에 보여야
        피해서 노릴 수 있다.
    */
    c.fillStyle = blank ? 'rgba(0,0,0,0.34)' : 'rgba(255,255,255,0.14)'
    c.fill()
    c.strokeStyle = blank ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.3)'
    c.lineWidth = 1
    c.stroke()

    // 상단 구간색 띠. 번호를 가리지 않으면서 구간을 한 번 더 말해 준다.
    if (value !== null && !blank) {
      c.fillStyle = palette.ball[ballRange(value)]
      c.globalAlpha = 0.9
      c.fillRect(left + 3.5, BIN_TOP, BIN_W - 7, 3)
      c.globalAlpha = 1
    }

    if (blank) {
      // 꽝 표식. 볼이 아니라 **빈 자리에 찍힌 ✕** 로 보이게 볼보다 작고 납작하게 그린다.
      if (i !== hideIndex) blankMark(c, palette, cx, BIN_BALL_Y, BLANK_MARK_R, 1)
    } else if (value !== null && i !== hideIndex) {
      draw.softShadow(c, cx, BIN_BALL_Y + BIN_BALL_R * 0.95, BIN_BALL_R * 0.8, BIN_BALL_R * 0.3, 0.28)
      hintBall(c, cx, BIN_BALL_Y, BIN_BALL_R, palette.ball[ballRange(value)])
    }
  }

  // 칸막이. 컵 위에 얹어 그려 경계를 또렷하게 한다.
  c.fillStyle = 'rgba(255,255,255,0.32)'
  for (let i = 1; i < BIN_COUNT; i += 1) {
    const x = i * BIN_W
    draw.roundRect(c, x - 2.5, BIN_TOP, 5, BIN_H, 2.5)
    c.fill()
  }

  // 강조 링. 방금 번호를 얻은 빈을 알린다 — 색만이 아니라 굵기 변화로도 보인다.
  if (glowIndex >= 0 && glowT > 0) {
    const left = glowIndex * BIN_W
    c.strokeStyle = accent
    c.lineWidth = 2.5
    c.globalAlpha = Math.min(1, glowT)
    draw.roundRect(c, left + 3, BIN_TOP - 2, BIN_W - 6, BIN_H + 4, 6)
    c.stroke()
    c.globalAlpha = 1
  }

  c.restore()
}

/* ────────────────────────────────────────────────────────────
 * 투하 장치와 볼
 * ──────────────────────────────────────────────────────────── */

/**
 * **무지 볼** — 번호 없이 구간 색만 보여주는 볼.
 *
 * → 계약: "★ 번호를 미리 보여주지 않는다 — 색 힌트형"
 *
 * ── 왜 필요한가 ────────────────────────────────────────────────────
 * 빈에 번호를 적어 두면 **놀이가 조준 문제로 좁아진다.** 원하는 번호가 한 자리에 고정돼
 * 있으니 그 자리만 맞히면 끝이고, 못 맞히면 원하지 않는 번호를 억지로 받는다. 색만 보여주면
 * "이번엔 파란 볼이네" 정도의 기대가 남고, 번호는 얻는 순간 처음 드러난다.
 *
 * ⚠ **색은 반드시 `ballRange(예약된 값)` 에서 온다.** 색을 무작위로 칠하고 번호를 따로 뽑으면
 *   그 순간 화면이 거짓말이 된다. 계약의 판정 기준 한 줄이 이것이다 —
 *   *화면에 보이는 색이 실제로 받게 될 번호의 구간과 같은가.*
 * ⚠ `draw.ball()` 을 쓰지 않는 이유는 그것이 **숫자를 그리기 때문**이다. 조형(구간색 채움 ·
 *   좌상단 하이라이트 · 안쪽 링)은 그대로 따라가 사이트의 볼과 같은 물건으로 보이게 한다.
 */
function hintBall(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  alpha = 1,
): void {
  c.save()
  c.globalAlpha = alpha

  c.fillStyle = color
  c.beginPath()
  c.arc(x, y, r, 0, Math.PI * 2)
  c.fill()

  // 좌상단 광원(규칙 3). `draw.ball()` 과 같은 자리·같은 세기로 둬야 한 제품으로 보인다.
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

  c.restore()
}

/**
 * 물음표 볼을 **배경에서 떼어 놓는다** — 이 게임에만 필요한 로컬 프리미티브.
 *
 * ⚠ `draw.mysteryBall` 은 `palette.surface2` 로 채운다. 다른 다섯 게임은 배경이 밝아 그것이
 *   맞지만, **이 게임만 배경이 항상 짙은 남색**이다. 다크 테마의 `surface-2` 토큰은 그
 *   배경과 거의 같은 짙은 남회색이라, 375px 실측에서 **낙하 중인 볼이 보이지 않았다.**
 *   (검증 게이트가 문자열만 보므로 주석에도 색 값 자체를 적지 않는다.)
 *
 * `core/` 는 동결이므로 `mysteryBall` 을 고치지 않는다. 계약이 정한 대로 자기 폴더에 로컬
 * 함수를 둔다 — 옅은 후광 + 흰 림라이트를 둘러 두 테마 모두에서 볼이 뜨게 한다.
 * 링 색을 강조색이 아니라 흰색으로 둔 것은, 강조색(분홍)을 **조준 UI 전용**으로 남겨
 * "지금 내가 정하는 것" 과 "이미 떨어진 것" 을 색으로 가르기 위해서다.
 */
function litMysteryBall(
  c: CanvasRenderingContext2D,
  draw: DrawKit,
  x: number,
  y: number,
  r: number,
  alpha = 1,
): void {
  c.save()
  c.globalAlpha = alpha * 0.16
  c.fillStyle = 'rgba(255,255,255,1)'
  c.beginPath()
  c.arc(x, y, r + 5, 0, Math.PI * 2)
  c.fill()
  c.globalAlpha = 1
  c.restore()

  draw.mysteryBall(c, x, y, r, { alpha })

  c.save()
  c.globalAlpha = alpha * 0.85
  c.strokeStyle = 'rgba(255,255,255,1)'
  c.lineWidth = 1.6
  c.beginPath()
  c.arc(x, y, r + 0.8, 0, Math.PI * 2)
  c.stroke()
  c.restore()
}

/**
 * 투하 레일·표식·조준선.
 *
 * ⚠ 조준선은 **점선**으로 그린다. 실선이면 못까지 이어진 물리적 통로처럼 보여 "여기로
 *   똑바로 떨어진다" 는 잘못된 기대를 준다. 이 게임은 위치만 내가 정하고 결과는 튕김이 정한다.
 */
export function drawDropper(
  c: CanvasRenderingContext2D,
  draw: DrawKit,
  accent: string,
  dropX: number,
  aiming: boolean,
  timeMs: number,
  reducedMotion: boolean,
): void {
  /*
    ⚠ 무대가 430 으로 짧아져 위쪽 여유가 얼마 없다. 레일을 헤드라인(y=18) 아래,
      대기 볼(y=62, r=7) 위에 끼워 넣는다.
  */
  const railY = DROP_Y - 26

  c.save()
  // 레일.
  c.strokeStyle = 'rgba(255,255,255,0.28)'
  c.lineWidth = 3
  c.lineCap = 'round'
  c.beginPath()
  c.moveTo(DROP_MIN_X, railY)
  c.lineTo(DROP_MAX_X, railY)
  c.stroke()

  if (aiming) {
    // 조준 점선.
    c.setLineDash([4, 7])
    c.strokeStyle = accent
    c.globalAlpha = 0.55
    c.lineWidth = 2
    /*
      ⚠ 판이 짧아져 볼과 첫 못 행 사이가 38px 뿐이다. 거기서 끊으면 점선이 눈금처럼 보여
        "여기로 떨어진다" 가 읽히지 않는다. 못 두 행을 가로질러 내려긋되 α를 낮춰 못을
        가리지 않게 한다.
    */
    c.beginPath()
    c.moveTo(dropX, DROP_Y + BALL_R + 3)
    c.lineTo(dropX, PEG_FIRST_Y + PEG_ROW_GAP * 1.6)
    c.stroke()
    c.setLineDash([])
    c.globalAlpha = 1

    // 표식(아래를 향한 삼각형). 살짝 위아래로 숨쉰다.
    const bob = reducedMotion ? 0 : Math.sin(timeMs / 260) * 1.6
    const ty = railY + 5 + bob
    c.fillStyle = accent
    c.beginPath()
    c.moveTo(dropX, ty + 9)
    c.lineTo(dropX - 7, ty)
    c.lineTo(dropX + 7, ty)
    c.closePath()
    c.fill()

    // 대기 중인 볼. 아직 번호가 없으므로 물음표 볼이다.
    draw.softShadow(c, dropX, DROP_Y + BALL_R + 4, BALL_R * 0.85, BALL_R * 0.3, 0.3)
    litMysteryBall(c, draw, dropX, DROP_Y, BALL_R)
  }
  c.restore()
}

/**
 * 낙하 중인 볼.
 *
 * @param alpha 렌더 보간 계수. 고정 60Hz 물리를 120Hz 화면에서도 매끄럽게 보이게 한다
 */
export function drawFallingBall(
  c: CanvasRenderingContext2D,
  draw: DrawKit,
  x: number,
  y: number,
): void {
  draw.softShadow(c, x, BIN_FLOOR + 4, BALL_R * 0.9, BALL_R * 0.32, 0.22)
  litMysteryBall(c, draw, x, y, BALL_R)
}

/**
 * 안착 연출 — **볼이 깨지며 번호가 드러난다**.
 *
 * → 계약: "번호 자체는 얻는 순간 **볼이 깨지며** 드러난다"
 *
 * 세 마디로 읽힌다.
 * 1. `0 ~ BREAK_AT` — 떨어진 물음표 볼이 빈의 무지 볼 자리로 빨려 들어가며 작아진다.
 * 2. `BREAK_AT` — **깨진다.** 무지 볼이 네 조각으로 갈라져 밖으로 튄다.
 * 3. `BREAK_AT ~ 1` — 그 안에서 번호 볼이 팝으로 커지며 나온다. 링이 한 겹 퍼진다.
 *
 * ⚠ 움직임 최소화에서는 **깨짐·이동·팝 없이 크로스페이드만** 한다. 계약이 정한 넷 중
 *   "번호 공개 연출을 페이드로 대체" 가 이것이다. 물리와 이동 자체는 끄지 않는다.
 * ⚠ 깨지기 **전에는 번호를 한 픽셀도 그리지 않는다.** 미리 비치면 색 힌트형의 전제가 무너진다.
 *
 * @param x          빈의 중심 x
 * @param dropY      낙하한 볼이 멈춘 y
 * @param value      얻은 번호. `BREAK_AT` 이후에만 쓰인다
 * @param hintColor  깨지는 무지 볼의 색. 얻은 번호의 구간색과 **같다**
 * @param t          진행도 0~1
 */
/**
 * 진행도 이 지점에서 **무지 볼이 깨진다.**
 *
 * ⚠ `index.ts` 가 같은 값을 본다 — 깨지는 순간에 파편 파티클을 터뜨리고, 그 전까지는
 *   헤드라인이 번호를 말하지 않는다. 두 곳에 따로 적으면 반드시 어긋난다.
 */
export const BREAK_AT = 0.34

export function drawRevealBall(
  c: CanvasRenderingContext2D,
  draw: DrawKit,
  accent: string,
  x: number,
  dropY: number,
  value: number,
  hintColor: string,
  t: number,
  reducedMotion: boolean,
): void {
  const p = draw.clamp(t, 0, 1)

  if (reducedMotion) {
    // 무지 볼 → 번호 볼 크로스페이드. 자리도 크기도 움직이지 않는다.
    const f = draw.clamp(p / BREAK_AT, 0, 1)
    draw.softShadow(c, x, BIN_BALL_Y + BIN_BALL_R * 0.95, BIN_BALL_R * 0.8, BIN_BALL_R * 0.3, 0.28)
    if (f < 1) hintBall(c, x, BIN_BALL_Y, BIN_BALL_R, hintColor, 1 - f)
    if (f > 0) draw.ball(c, x, BIN_BALL_Y, BIN_BALL_R, value, { alpha: f })
    return
  }

  draw.softShadow(c, x, BIN_BALL_Y + BIN_BALL_R * 0.95, BIN_BALL_R * 0.8, BIN_BALL_R * 0.3, 0.28)

  if (p < BREAK_AT) {
    // ① 빨려 들어가기. 무지 볼은 그대로 있고 떨어진 볼만 다가가며 작아진다.
    const e = draw.easeOutCubic(p / BREAK_AT)
    hintBall(c, x, BIN_BALL_Y, BIN_BALL_R, hintColor)
    litMysteryBall(c, draw, x, draw.lerp(dropY, BIN_BALL_Y, e), BALL_R * (1 - e * 0.55), 1 - e * 0.5)
    return
  }

  const q = (p - BREAK_AT) / (1 - BREAK_AT)

  // ② 깨진 조각. 네 개의 부채꼴이 밖으로 튀며 옅어진다.
  const shardT = draw.clamp(q / 0.5, 0, 1)
  if (shardT < 1) {
    c.save()
    c.globalAlpha = (1 - shardT) * 0.9
    c.fillStyle = hintColor
    const spread = 4 + shardT * 14
    for (let i = 0; i < 4; i += 1) {
      const a0 = (i * Math.PI) / 2 + Math.PI / 4
      const cxs = x + Math.cos(a0) * spread
      const cys = BIN_BALL_Y + Math.sin(a0) * spread
      c.beginPath()
      c.moveTo(cxs, cys)
      c.arc(cxs, cys, BIN_BALL_R * (1 - shardT * 0.35), a0 - Math.PI / 4, a0 + Math.PI / 4)
      c.closePath()
      c.fill()
    }
    c.restore()
  }

  // ③ 번호 볼. 살짝 넘겼다 돌아오는 한 번의 오버슈트에서 "나왔다" 는 느낌이 난다.
  /*
    ⚠ 시작 크기를 너무 작게 잡으면 **숫자가 4px 짜리로 한 프레임 찌그러져 보인다**(실측에서
      잡았다). `draw.ball` 의 글자 크기는 반지름에 비례하므로, 팝의 시작점은 숫자가 이미
      읽히는 크기여야 한다. 넘기는 맛은 크기 차이가 아니라 오버슈트가 낸다.
  */
  const e = draw.easeOutCubic(q)
  const r = BIN_BALL_R * (0.62 + 0.38 * e) + Math.sin(e * Math.PI) * 2.4
  draw.ball(c, x, BIN_BALL_Y, r, value, { alpha: Math.min(1, q * 4) })

  if (q > 0.1) {
    const rt = (q - 0.1) / 0.9
    c.save()
    c.globalAlpha = (1 - rt) * 0.7
    c.strokeStyle = accent
    c.lineWidth = 2.5
    c.beginPath()
    c.arc(x, BIN_BALL_Y, BIN_BALL_R + 3 + rt * 18, 0, Math.PI * 2)
    c.stroke()
    c.restore()
  }
}

/**
 * 꽝 연출의 마디가 갈리는 지점. 획득의 `BREAK_AT` 과 **같은 값**을 쓴다 — 빨려 들어가는
 * 첫 마디까지는 두 결과가 똑같이 보여야 하기 때문이다.
 */
export const BLANK_BREAK = BREAK_AT

/**
 * **꽝 연출** — 깨지지 않고 꺼진다.
 *
 * → 사양서: "꽝 연출 — 깨지지 않고 꺼진다"
 *
 * ⚠ 획득 연출과 **다른 모양**이어야 한다. 번호가 없으니 깨질 것도 없고, 파편을 터뜨리면
 *   "번호가 나왔다" 의 신호가 섞인다.
 * ⚠ 호출하는 쪽이 이 연출을 **획득보다 짧게**(1.1초 → 0.75초) 끊는다. 소득이 없는 일에
 *   오래 머물면 기회가 아홉 번뿐인 판에서 시간만 버리는 느낌이 든다.
 */
export function drawBlankReveal(
  c: CanvasRenderingContext2D,
  draw: DrawKit,
  palette: Palette,
  x: number,
  dropY: number,
  t: number,
  reducedMotion: boolean,
): void {
  const p = draw.clamp(t, 0, 1)

  if (reducedMotion) {
    // 맥동도 링도 없이 표식만 남긴다. 떨어진 볼은 자리를 옮기지 않고 사라진다.
    blankMark(c, palette, x, BIN_BALL_Y, BLANK_MARK_R, 1)
    return
  }

  if (p < BLANK_BREAK) {
    // ① 빨려 들어가기. **획득과 똑같은 마디다** — 결과가 갈리는 것은 그 다음이다.
    const e = draw.easeOutCubic(p / BLANK_BREAK)
    blankMark(c, palette, x, BIN_BALL_Y, BLANK_MARK_R, 1)
    litMysteryBall(c, draw, x, draw.lerp(dropY, BIN_BALL_Y, e), BALL_R * (1 - e * 0.55), 1 - e * 0.5)
    return
  }

  // ② 꺼진다. ✕ 가 한 번 크게 맥동했다 제자리로 돌아온다.
  const q = (p - BLANK_BREAK) / (1 - BLANK_BREAK)
  const pulse = Math.sin(Math.min(1, q * 1.6) * Math.PI)
  blankMark(c, palette, x, BIN_BALL_Y, BLANK_MARK_R * (1 + pulse * 0.45), 1)

  /*
    옅은 링이 한 겹 퍼진다. ⚠ 획득의 강조 링과 달리 **무채색**이다 — 강조색(분홍)은
    "얻었다" 와 조준 UI 에 묶어 두고, 소득이 없는 결과에는 쓰지 않는다.
  */
  if (q < 0.8) {
    const rt = q / 0.8
    c.save()
    c.globalAlpha = (1 - rt) * 0.35
    c.strokeStyle = 'rgba(255,255,255,1)'
    c.lineWidth = 2
    c.beginPath()
    c.arc(x, BIN_BALL_Y, BLANK_MARK_R + 2 + rt * 14, 0, Math.PI * 2)
    c.stroke()
    c.restore()
  }
}

/**
 * 캔버스 상단의 짧은 안내 **한 줄**.
 *
 * ⚠ 진행 상황("모은 번호 3/6")을 여기에 그리지 않는다. 호스트가 캔버스 **바로 아래**에
 *   사이트의 `LottoBall` 여섯 칸으로 이미 그리고 있어(계약: 접근성 절) 중복이고, 무대가
 *   430 으로 짧아진 지금은 그 한 줄이 판을 밀어낸다.
 * ⚠ 스크린리더용 문구는 `status` 이벤트로 따로 나간다 — 캔버스 안 글자는 보조기술에 투명하다.
 */
export function drawHeadline(
  c: CanvasRenderingContext2D,
  draw: DrawKit,
  palette: Palette,
  stage: StageSize,
  headline: string,
  attemptsLeft: number,
  accent: string,
): void {
  draw.text(c, headline, stage.width / 2, 18, {
    size: 14,
    weight: 700,
    color: palette.ballFg,
    alpha: 0.92,
  })

  /*
    남은 기회 (2026-09-17).

    계약이 못 박았다 — `attempt` 이벤트는 그대로 보내지만 **호스트 HUD 가 아직 쓰지 않으므로**
    기회 제한이 있는 게임은 캔버스 상단에 직접 그린다.

    ⚠ 헤드라인은 **가운데 정렬**이고 이것은 오른쪽 끝이라 겹치지 않는다. 헤드라인 문구를
      길게 고칠 때 이 여백을 다시 확인한다.
    ⚠ 셋 이하에서 강조색으로 바꾸되 **색만으로 알리지 않는다** — 숫자가 늘 함께 있다.
    ⚠ 캔버스 안 글자는 보조기술에 투명하다. 같은 숫자를 `status` 이벤트로도 말한다(`index.ts`).
  */
  const low = attemptsLeft <= 3
  draw.text(c, `남은 기회 ${attemptsLeft}`, stage.width - 8, 18, {
    size: 11,
    weight: 700,
    align: 'right',
    color: low ? accent : palette.ballFg,
    alpha: low ? 1 : 0.62,
  })
}
