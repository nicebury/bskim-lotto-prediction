import {
  DRAG_K,
  GRAVITY,
  HIT_H,
  HIT_X,
  PITCHER_X,
  PX_PER_M,
  RELEASE_H,
  WORLD_LEN,
} from './constants'

/**
 * 투구 궤적과 타구 비행.
 *
 * → 사양서: docs/wiki/20-design/game-g03-flyball.md "물리"
 *
 * ── 좌표 약속 ──────────────────────────────────────────────────────
 * `x` 는 **월드 x**, `h` 는 **지면 위 높이로 위가 +** 다. 화면 좌표(아래가 +y)와 뒤집혀
 * 있는데, 중력·착지 판정이 전부 "높이" 로 서술되기 때문이다. 뒤집기는 그리기 직전 한 번만
 * 한다(`screenYOf`).
 *
 * ── ⚠ 투구와 타구는 **다른 물리**다 ────────────────────────────────
 * 투구는 물리가 아니라 **타이밍 장치**다. 그래서 적분하지 않고 `t/T` 로 위치를 직접 구한다.
 * 그래야 "공이 타격점을 지나는 시각" 이 정확히 `T` 로 고정되고, 판정이 프레임 오차 없이
 * 재현된다. 적분해서 던지면 난이도를 올릴 때마다 `T` 를 다시 측정해야 한다.
 * 타구만 진짜로 적분한다.
 */

/* ── 투구 ────────────────────────────────────────────────────── */

/** 투구가 처지는 정도(px). 직선으로 오면 종이비행기처럼 보인다. */
const PITCH_SAG = 16

/**
 * 투구의 현재 위치.
 *
 * @param t 릴리스부터의 경과 시간(초)
 * @param T 타격점에 닿는 시각(초). 난이도가 이 값을 조인다
 *
 * ⚠ `t > T` 여도 계속 같은 속도로 왼쪽으로 흐른다 — 놓친 공이 포수 쪽으로 지나가는
 *   그림이 있어야 "놓쳤다" 가 눈에 보인다.
 */
export function pitchAt(t: number, T: number): { x: number; h: number } {
  const p = t / T
  const x = PITCHER_X + (HIT_X - PITCHER_X) * p
  /*
    처짐은 `sin(pi·p)` 라 시작과 끝에서 0 이다. 즉 릴리스 높이와 타격점 높이는 정확히
    맞고 중간만 아래로 부푼다. ⚠ `p > 1` 이면 sin 이 음수가 되어 위로 솟는데, 지나간
    공이 살짝 떠오르는 것은 오히려 자연스러워 그대로 둔다.
  */
  const h = RELEASE_H + (HIT_H - RELEASE_H) * p - PITCH_SAG * Math.sin(Math.PI * p)
  return { x, h }
}

/* ── 타구 ────────────────────────────────────────────────────── */

export interface Batted {
  /** 월드 x. */
  x: number
  /** 지면 위 높이(위가 +). */
  h: number
  vx: number
  vy: number
  /** 착지했는가. 착지 지점이 곧 비거리다. */
  landed: boolean
  /**
   * 이 타구에 걸리는 중력(px/s²).
   *
   * ⚠ **타구마다 다르다.** 빗맞은 공은 무겁게 떨어진다(→ `WEAK_GRAVITY_SCALE`). 전역 상수를
   *   그대로 쓰지 않고 타구에 실어 두는 이유는, 한 판 안에서 값이 바뀌는데 적분 함수가
   *   전역을 읽으면 **어떤 중력으로 날아간 공인지 코드에서 추적할 수 없기** 때문이다.
   */
  gravity: number
  /** 렌더 보간용 직전 좌표. */
  prevX: number
  prevH: number
}

export function createBatted(): Batted {
  return {
    x: HIT_X,
    h: HIT_H,
    vx: 0,
    vy: 0,
    landed: true,
    gravity: GRAVITY,
    prevX: HIT_X,
    prevH: HIT_H,
  }
}

/** 타격. 각도(rad)·초속도(px/s)·이 타구의 중력으로 던진다. */
export function launchBatted(b: Batted, angleRad: number, v0: number, gravity: number): void {
  b.x = HIT_X
  b.h = HIT_H
  b.vx = Math.cos(angleRad) * v0
  b.vy = Math.sin(angleRad) * v0
  b.landed = false
  b.gravity = gravity
  b.prevX = b.x
  b.prevH = b.h
}

/**
 * ★ 이 타구가 **몇 미터까지 갈지** 미리 계산한다.
 *
 * ⚠ 화면에 미리 보여주려는 것이 **아니다.** 결과를 먼저 알려 주면 4초의 비행이 확인 절차가
 *   되어 버린다. 이 값은 오직 **연출을 미리 거는 데** 쓴다 — 장타가 될 타구는 *뜨는 순간부터*
 *   불이 붙어야 하는데(사용자 요구), 그러려면 착지를 기다릴 수 없기 때문이다.
 * ⚠ 판정으로 갈음하지 않는 이유: 안타(`good`) 구간의 위쪽도 200m 를 넘을 수 있어
 *   **판정과 장타 여부가 정확히 일치하지 않는다.** 물리가 결정론적이므로 그냥 미리 풀면 된다.
 * ⚠ 비용은 타석당 한 번, 길어야 250스텝이다. 매 프레임 도는 것이 아니다.
 */
export function predictMeters(angleRad: number, v0: number, gravity: number): number {
  let x = 0
  let h = HIT_H
  let vx = Math.cos(angleRad) * v0
  let vy = Math.sin(angleRad) * v0
  const dt = 1 / 60
  for (let i = 0; i < 2000; i += 1) {
    vx -= DRAG_K * vx * dt
    vy -= DRAG_K * vy * dt
    vy -= gravity * dt
    x += vx * dt
    h += vy * dt
    if (h <= 0) break
  }
  return Math.round(x / PX_PER_M)
}

/**
 * 한 스텝(항상 1/60초) 적분한다. 착지하면 `landed` 가 선다.
 *
 * ── 적분 순서와 그 이유 ────────────────────────────────────────────
 * 반암시적 오일러(속도를 먼저 갱신하고 그 속도로 위치를 옮긴다)를 쓴다. 명시적 오일러보다
 * 에너지가 덜 새어 포물선이 부풀지 않고, 고정 타임스텝이라 결과가 항상 같다.
 * 튜닝 때 돌린 전수 시뮬레이션도 **정확히 이 순서**로 계산했다 — 순서를 바꾸면 검산 결과
 * (최대 **125m** · 2026-09-16 재검산)가 더는 유효하지 않다.
 *
 * ⚠ **구르기를 넣지 않는다.** 야구의 비거리는 착지 지점까지다. 굴러간 만큼을 더하면
 *   낮게 깔린 타구가 홈런보다 멀리 나가는 이상한 일이 생긴다.
 */
export function stepBatted(b: Batted, dt: number): void {
  b.prevX = b.x
  b.prevH = b.h
  if (b.landed) return

  b.vx -= DRAG_K * b.vx * dt
  b.vy -= DRAG_K * b.vy * dt
  b.vy -= b.gravity * dt

  b.x += b.vx * dt
  b.h += b.vy * dt

  /*
    월드 끝의 보이지 않는 벽.
    ⚠ **실측 최대는 753px** 이라 정상 플레이에서는 닿지 않는다(1/60 고정 스텝 · 이 함수와
      같은 적분 순서로 `d = -0.18~+0.18` 전수 검산, 월드 벽 접촉 0건). 그래도 두는 이유는
      상수를 나중에 만졌을 때 공이 화면 밖으로 사라져 판이 영영 끝나지 않는 사고를 막기
      위해서다.
    ⚠ 여기 적혀 있던 **1017px 은 옛 초속도(`300 + 720×power`) 시절의 값**이다. 2026-09-10 에
      40m 기준선을 화면 안으로 들이려고 `PX_PER_M` 을 8 → 6 으로 낮추며 초속도도 함께
      낮췄는데(`252 + 606`) 이 주석만 남아 있었다 — `WORLD_LEN` 이 860 이므로 1017 이 맞다면
      **벽에 닿아 비거리가 잘린다**는 뜻이 되어, 읽는 사람을 엉뚱한 곳으로 보낸다.
  */
  if (b.x >= WORLD_LEN) {
    b.x = WORLD_LEN
    b.landed = true
    return
  }

  if (b.h <= 0) {
    b.h = 0
    b.landed = true
  }
}

/** 비거리(px). 타격점부터 잰다. */
export function distancePxOf(b: Batted): number {
  return Math.max(0, b.x - HIT_X)
}

/** 비거리(m). 화면에 보이는 값은 언제나 이것이다. */
export function metersOf(b: Batted): number {
  return Math.round(distancePxOf(b) / PX_PER_M)
}

/** 높이(위가 +) → 화면 y. 뒤집기는 여기 한 곳에서만 한다. */
export function screenYOf(h: number, groundY: number, radius: number): number {
  return groundY - radius - h
}
