/**
 * G04 얼음판 컬링 — 스톤 물리.
 *
 * → 사양서: docs/wiki/20-design/game-g04-curling.md "물리와 수치"
 *
 * ── ⚠ 예측 궤적과 실제 궤적이 같은 함수를 쓴다 ─────────────────────
 * 조준 중에 보여 주는 점선은 `stepStone` 을 그대로 돌려서 만든다. 예측을 해석식으로 따로
 * 짜면(거리 = v²/2a) **벽과 장애물 반사에서 반드시 어긋난다** — 반사가 속도 크기를 바꾸므로
 * 남은 거리가 해석적으로 풀리지 않는다. 보여 준 선과 실제 결과가 다르면 그것은 화면이 하는
 * 거짓말이다.
 */

import {
  ANGLE_MAX,
  LANE,
  OUT_LINE_Y,
  PEG_E,
  PEG_R,
  PULL_MAX,
  STONE_R,
  STOP_SPEED,
  V0_BASE,
  V0_GAIN,
  WALL_E,
} from './layout'

/**
 * ★ 이미 얻은 칸 — 스톤이 튕기는 장애물 (2026-09-17 신설).
 *
 * ⚠ **이것이 재투 규약을 대신한다.** 예전에는 이미 모은 번호 칸에 멈추면 "그 투구를 없던
 *   것으로" 되돌렸는데, 그것은 일이 벌어진 뒤에 무르는 방식이라 화면과 규칙이 어긋나는
 *   순간(스톤은 거기 멈춰 있는데 결과는 없다)이 생겼다. 아예 **물리적으로 들어가지 못하게**
 *   하면 무를 일 자체가 없다.
 */
export interface Peg {
  readonly x: number
  readonly y: number
}

/**
 * 스톤과 장애물이 닿는 거리.
 *
 * ⚠ 시각 반지름(`BALL_R`)이 아니라 **물리 반지름(`PEG_R`)** 을 쓴다. 1px 차이가 "이미 얻은
 *   칸에는 절대 멈출 수 없다" 를 기하학적으로 보장한다(→ `layout.ts` 의 `PEG_R` 주석).
 */
const PEG_HIT_DIST = STONE_R + PEG_R

export interface Stone {
  x: number
  y: number
  /** 직전 스텝의 위치. 렌더 보간(`alpha`)에 쓴다. */
  px: number
  py: number
  vx: number
  vy: number
  /**
   * 이번 스텝에 무엇에 부딪혔는가. 햅틱·파티클·효과음 신호로만 쓴다.
   *
   * ⚠ 벽과 장애물을 **가른다.** 둘은 사용자에게 뜻이 전혀 다르다 — 벽은 활용하는 것이고
   *   장애물은 막힌 것이다. 같은 진동·같은 색으로 알리면 무엇이 일어났는지 구분되지 않는다.
   */
  hit: 'wall' | 'peg' | null
}

/** `'out'` = 아웃 라인을 통과했다. 정지를 기다리지 않고 그 자리에서 끝낸다. */
export type StepResult = 'moving' | 'stopped' | 'out'

export function createStone(x: number, y: number): Stone {
  return { x, y, px: x, py: y, vx: 0, vy: 0, hit: null }
}

/** 당김 길이를 유효 범위로 자른다. 호출부가 어디서든 이 함수만 통과시키면 된다. */
export function clampPull(pull: number): number {
  if (pull < 0) return 0
  return pull > PULL_MAX ? PULL_MAX : pull
}

/** 조준 각도를 수직 기준 ±45° 로 자른다. 레인을 벗어나는 헛발질을 막는다. */
export function clampAngle(angle: number): number {
  if (angle < -ANGLE_MAX) return -ANGLE_MAX
  return angle > ANGLE_MAX ? ANGLE_MAX : angle
}

/**
 * 드래그 벡터 → 조준 각도.
 *
 * @param dx `시작점 − 포인터`. 뒤로 당긴 만큼 앞으로 나간다.
 * ⚠ 포인터가 스톤보다 **위**에 있으면(아래로 당긴 셈) 각도가 뒤집히는데, 클램프가 ±45° 로
 *   잘라 주므로 위쪽으로 발사된다. 스톤이 사용자 쪽으로 날아오는 일은 없다.
 */
export function aimAngleFromDrag(dx: number, dy: number): number {
  return clampAngle(Math.atan2(dx, -dy))
}

/** 조준값 → 초기 속도. `pull` 0~72 가 v0 194~482 px/s 에 대응한다(layout 검산). */
export function launchVelocity(angle: number, pull: number): { vx: number; vy: number } {
  const v0 = V0_BASE + clampPull(pull) * V0_GAIN
  return { vx: Math.sin(angle) * v0, vy: -Math.cos(angle) * v0 }
}

/**
 * 장애물 충돌을 풀어 준다. 부딪혔으면 `true`.
 *
 * ⚠ **겹침을 먼저 밀어낸 뒤 속도를 반사한다.** 반사만 하면 다음 스텝에서도 여전히 겹쳐
 *   있어 매 프레임 반사가 걸리고, 스톤이 장애물 안에서 부르르 떠는 화면이 된다.
 * ⚠ **다가오는 중일 때만 반사한다**(`vn < 0`). 이미 멀어지는 중인데 또 뒤집으면 스톤이
 *   장애물에 붙어 왕복한다.
 */
function resolvePegs(s: Stone, pegs: readonly Peg[]): boolean {
  let bumped = false
  for (const peg of pegs) {
    const dx = s.x - peg.x
    const dy = s.y - peg.y
    const dist = Math.hypot(dx, dy)
    if (dist >= PEG_HIT_DIST) continue

    /*
      정확히 중심이 겹친 경우(dist 0)는 법선을 정할 수 없다. 스톤이 온 방향의 반대로
      밀어내면 되는데, 속도마저 0 이면 위로 민다 — 어느 쪽이든 한 프레임이면 풀린다.
    */
    let nx: number
    let ny: number
    if (dist > 0.0001) {
      nx = dx / dist
      ny = dy / dist
    } else {
      const speed = Math.hypot(s.vx, s.vy)
      nx = speed > 0 ? -s.vx / speed : 0
      ny = speed > 0 ? -s.vy / speed : -1
    }

    s.x = peg.x + nx * PEG_HIT_DIST
    s.y = peg.y + ny * PEG_HIT_DIST

    const vn = s.vx * nx + s.vy * ny
    if (vn < 0) {
      const j = (1 + PEG_E) * vn
      s.vx -= j * nx
      s.vy -= j * ny
    }
    bumped = true
  }
  return bumped
}

/**
 * 한 스텝 진행. `dt` 는 항상 1/60 이다(계약).
 *
 * ⚠ 감속을 **속도 반대 방향으로 일정량** 뺀다(선형 마찰). 지수 감쇠(`v *= 0.98`)를 쓰면
 *   스톤이 영원히 조금씩 움직여 정지 판정이 흐려지고, 무엇보다 얼음처럼 보이지 않는다.
 * ⚠ 벽 반사는 **벽에 수직인 성분만** 줄인다. 속도 전체를 줄이면 벽을 스친 스톤이 갑자기
 *   서 버려 사용자가 원인을 알 수 없다. 각도를 45° 까지 연 뒤로는 벽을 **의도적으로** 쓰는
 *   투구가 생겼으므로, 이 성질이 전보다 훨씬 중요해졌다.
 */
export function stepStone(
  s: Stone,
  dt: number,
  friction: number,
  pegs: readonly Peg[] = [],
): StepResult {
  s.px = s.x
  s.py = s.y
  s.hit = null

  const speed = Math.hypot(s.vx, s.vy)
  if (speed <= STOP_SPEED) {
    s.vx = 0
    s.vy = 0
    return 'stopped'
  }

  const nextSpeed = speed - friction * dt
  /*
    ⚠ 남은 속도만큼 **비율로** 줄인다. 성분별로 빼면 대각선으로 갈 때 감속량이 √2 배가 되어
      각도에 따라 정지 거리가 달라진다 — 조준 각도가 세기에 간섭하면 사용자는 원인을 영영
      찾지 못한다. 각도 한계가 45° 로 넓어져 대각선 투구가 흔해진 지금은 더욱 그렇다.
  */
  const k = nextSpeed > 0 ? nextSpeed / speed : 0
  s.vx *= k
  s.vy *= k

  s.x += s.vx * dt
  s.y += s.vy * dt

  const min = LANE.left + STONE_R
  const max = LANE.right - STONE_R
  if (s.x < min) {
    s.x = min
    s.vx = -s.vx * WALL_E
    s.hit = 'wall'
  } else if (s.x > max) {
    s.x = max
    s.vx = -s.vx * WALL_E
    s.hit = 'wall'
  }

  /*
    ⚠ 장애물은 벽 **뒤에** 푼다. 벽에 밀려난 위치가 장애물과 겹칠 수 있는데, 순서를 뒤집으면
      그 겹침이 다음 프레임까지 남는다. 벽은 스톤을 레인 안으로 되돌리는 것이 확정이므로
      마지막에 장애물을 풀어야 두 제약이 모두 만족된다.
    ⚠ 벽과 장애물을 한 프레임에 같이 맞으면 **장애물로 기록한다.** 사용자가 눈으로 보는 것은
      볼에 맞고 튄 장면이고, 그쪽이 결과에 직접 영향을 준 사건이다.
  */
  if (resolvePegs(s, pegs)) s.hit = 'peg'

  /*
    ⚠ 정지를 기다리지 않고 **선을 넘는 순간** 끝낸다. 화면에 아웃 라인을 그려 놓고 그
      위에서 계속 미끄러지면 그림과 규칙이 어긋나 보인다.
  */
  if (s.y < OUT_LINE_Y) return 'out'
  return nextSpeed <= STOP_SPEED ? 'stopped' : 'moving'
}

/**
 * 조준 중 보여 줄 예상 궤적.
 *
 * ⚠ **보드에 닿기 전까지만** 돌려준다(`stopAtY`). 정지 지점까지 그리면 어느 칸에 멈출지가
 *   화면에 적혀 있는 것과 같아져, 첫 투구부터 원하는 칸을 정확히 맞히게 된다. 방향은 보여
 *   주고 **거리는 파워 바로 가늠하게** 하는 것이 난이도 곡선과 맞다.
 * ⚠ 장애물을 넘기지 않는 것은 의도한 것이다. 장애물은 전부 보드 **안**에 있어서 예측이
 *   끝나는 지점보다 뒤에 있다 — 넘겨도 한 번도 쓰이지 않는다.
 *
 * @param stopAtY 이 y 위로 올라가면 중단한다(보드 하단).
 * @returns 3스텝마다 하나씩 담은 점 목록. 점선용이라 촘촘할 필요가 없다.
 */
export function predictPath(
  startX: number,
  startY: number,
  angle: number,
  pull: number,
  friction: number,
  stopAtY: number,
): { x: number; y: number }[] {
  const probe = createStone(startX, startY)
  const v = launchVelocity(angle, pull)
  probe.vx = v.vx
  probe.vy = v.vy

  const out: { x: number; y: number }[] = []
  const dt = 1 / 60
  /** 4초면 어떤 세기로도 멈춘다. 무한 루프 방어. */
  const maxSteps = 240

  for (let i = 0; i < maxSteps; i += 1) {
    const r = stepStone(probe, dt, friction)
    if (i % 3 === 0) out.push({ x: probe.x, y: probe.y })
    if (probe.y <= stopAtY) break
    if (r !== 'moving') break
  }
  return out
}
