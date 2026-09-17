import type { Rng } from '@/games/core/types'

import {
  BALL_R,
  BIN_FLOOR,
  BIN_TOP,
  BIN_W,
  DIVIDER_HALF,
  binIndexAt,
  PEG_R,
  PEG_ROWS,
  PEG_FIRST_Y,
  PEG_ROW_GAP,
  STAGE,
  type PegLayout,
} from './layout'

/**
 * G05 플린코 — **볼 물리**.
 *
 * → 사양서: docs/wiki/20-design/game-g05-plinko.md "물리와 수치"
 *
 * ── 이 파일이 지켜야 하는 것 ───────────────────────────────────────
 * 사양서의 완료 기준 첫 줄이 **"볼이 못 사이에 끼여 멈추는 경우가 100회 낙하 중 0회"** 다.
 * 플린코에서 끼임은 이론적 위험이 아니라 실제로 자주 나는 사고다 — 못 두 개 사이에 볼이
 * 정확히 얹히면 두 침투 해소가 서로를 상쇄해 볼이 그 자리에서 떨린다. 그래서 방어를
 * **두 겹**으로 둔다(같은 못 반복 충돌 + 정체 감시).
 *
 * ⚠ **루프 안에서 객체를 만들지 않는다.** 벡터는 전부 숫자 필드다. 미니게임에서 GC
 *   스파이크는 곧 프레임 끊김이다.
 */

/** 중력. 사양서 값. */
const GRAVITY = 1400
/** 최대 낙하 속도. 이걸 두지 않으면 한 스텝에 못을 통과해 버린다(터널링). */
const MAX_FALL = 900
/** 수평 감쇠. `dt` 가 항상 1/60 이므로 "프레임당" 과 "스텝당" 이 같다. */
const AIR_DRAG = 0.995
/** 못 반발계수. */
const PEG_RESTITUTION = 0.55
/** 벽·칸막이 반발계수. */
const WALL_RESTITUTION = 0.5
/** 반사에 쓰는 법선을 이만큼(rad) 비튼다. 끼임 방지 + 자연스러운 산포. */
const NORMAL_JITTER = 0.08

/** 같은 못과 이 시간 안에 3회 부딪히면 끼임으로 본다. */
const STUCK_WINDOW = 0.15
const STUCK_CONTACTS = 3
/** 끼임을 풀 때 옆으로 밀어 주는 속도. */
const STUCK_KICK = 60

/**
 * 정체 감시 — 두 번째 방어선.
 *
 * 같은 못이 아니라 **못 두 개 사이**에 얹혀 번갈아 부딪히면 위 방어가 발동하지 않는다.
 * 그래서 "이만큼의 시간 동안 이만큼도 못 내려갔으면" 을 따로 본다.
 */
const STALL_WINDOW = 1.2
const STALL_MIN_DROP = 10
const STALL_KICK = 90

/** 내부 칸막이는 x = 40, 80, … 320 의 8개. 양 끝(0, 360)은 벽이 대신한다. */
const DIVIDER_LAST = 8

export interface Ball {
  x: number
  y: number
  vx: number
  vy: number
  /** 직전 스텝 위치. 렌더 보간(`alpha`)에 쓴다. */
  prevX: number
  prevY: number
  /** 마지막으로 부딪힌 못. 같은 못 반복 충돌을 세려고 둔다. */
  lastPeg: number
  contacts: number
  contactsSince: number
  /** 정체 감시용. */
  stallSince: number
  stallY: number
}

export function createBall(): Ball {
  return {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    prevX: 0,
    prevY: 0,
    lastPeg: -1,
    contacts: 0,
    contactsSince: 0,
    stallSince: 0,
    stallY: 0,
  }
}

/**
 * 볼을 투하 위치에 놓는다.
 *
 * ⚠ 초기 `vx` 에 **아주 작은 흔들림**을 준다. 0 으로 두면 짝수 행 못(빈 중앙 위)에 정확히
 *   수직으로 떨어졌을 때 법선이 위를 향해 볼이 제자리에서 튀어오른다. 실제로 재현되는
 *   상황이라 원천에서 막는다.
 */
export function resetBall(ball: Ball, x: number, y: number, rng: Rng, sim: number): void {
  ball.x = x
  ball.y = y
  ball.prevX = x
  ball.prevY = y
  ball.vx = rng.range(-14, 14)
  ball.vy = 0
  ball.lastPeg = -1
  ball.contacts = 0
  ball.contactsSince = sim
  ball.stallSince = sim
  ball.stallY = y
}

/** 한 스텝의 결과. 안착했으면 빈 번호를, 아니면 `-1` 을 돌려준다. */
export interface StepResult {
  /** 안착한 빈. `-1` 이면 아직 낙하 중. */
  landedBin: number
  /** 이 스텝에 부딪힌 못. 링 확산 연출에 쓴다. `-1` 이면 없음. */
  hitPeg: number
  /** 부딪힌 세기(0~1). 연출 강도에 쓴다. */
  hitPower: number
}

const result: StepResult = { landedBin: -1, hitPeg: -1, hitPower: 0 }

/**
 * 볼을 한 스텝 굴린다.
 *
 * @param sim 게임 시작부터의 시뮬레이션 시간(초). 끼임·정체 판정의 기준시각이다
 * @returns 매번 **같은 객체**를 돌려준다. 호출부가 붙들지 말고 즉시 읽는다(할당 회피)
 */
export function stepBall(ball: Ball, pegs: PegLayout, rng: Rng, dt: number, sim: number): StepResult {
  result.landedBin = -1
  result.hitPeg = -1
  result.hitPower = 0

  ball.prevX = ball.x
  ball.prevY = ball.y

  ball.vy += GRAVITY * dt
  if (ball.vy > MAX_FALL) ball.vy = MAX_FALL
  ball.vx *= AIR_DRAG

  ball.x += ball.vx * dt
  ball.y += ball.vy * dt

  collideWalls(ball)
  collidePegs(ball, pegs, rng, sim)
  if (ball.y > BIN_TOP - BALL_R - DIVIDER_HALF) collideDividers(ball)

  guardStall(ball, rng, sim)

  /*
    안착 판정.
    ⚠ `>=` 로 바닥을 넘어선 순간 잡는다. "바닥에 닿아 튀는" 연출은 넣지 않는다 — 빈 안에서
      튀어 옆 칸으로 넘어가면 이미 공개된 번호가 바뀌어 **화면이 거짓말을 한다.**
    ⚠ 화면 아래로 새어 나간 경우(있어서는 안 되지만)도 같은 가지로 흡수한다. 볼이 사라져
      게임이 영영 멈추는 것보다 낫다.
  */
  if (ball.y + BALL_R >= BIN_FLOOR || ball.y > STAGE.height) {
    ball.y = BIN_FLOOR - BALL_R
    ball.vx = 0
    ball.vy = 0
    result.landedBin = binIndexAt(ball.x)
  }

  return result
}

/** 좌우 벽. */
function collideWalls(ball: Ball): void {
  if (ball.x < BALL_R) {
    ball.x = BALL_R
    if (ball.vx < 0) ball.vx = -ball.vx * WALL_RESTITUTION
  } else if (ball.x > STAGE.width - BALL_R) {
    ball.x = STAGE.width - BALL_R
    if (ball.vx > 0) ball.vx = -ball.vx * WALL_RESTITUTION
  }
}

/**
 * 못 충돌.
 *
 * ⚠ 86개를 전부 검사하지 않는다. 볼의 y 로 행을 역산해 **앞뒤 한 행씩만** 본다. 한 스텝에
 *   볼이 최대 15px(900px/s ÷ 60) 움직이므로 행 간격 29px 을 건너뛸 수 없다.
 */
function collidePegs(ball: Ball, pegs: PegLayout, rng: Rng, sim: number): void {
  const minDist = BALL_R + PEG_R
  const rowFloat = (ball.y - PEG_FIRST_Y) / PEG_ROW_GAP
  const from = Math.max(0, Math.floor(rowFloat) - 1)
  const to = Math.min(PEG_ROWS - 1, Math.floor(rowFloat) + 1)
  if (from > to) return

  for (let row = from; row <= to; row += 1) {
    const start = pegs.rowStart[row]
    const end = pegs.rowStart[row + 1]
    for (let i = start; i < end; i += 1) {
      const dx = ball.x - pegs.x[i]
      const dy = ball.y - pegs.y[i]
      const d2 = dx * dx + dy * dy
      if (d2 >= minDist * minDist) continue

      const dist = Math.sqrt(d2)
      /*
        ⚠ 정확히 못 중심에 겹치면 법선이 0/0 이 되어 NaN 이 퍼진다. 한 번 NaN 이 되면 볼이
          화면에서 사라지고 원인을 찾기가 매우 어렵다. 위쪽 법선으로 못 박아 탈출시킨다.
      */
      let nx: number
      let ny: number
      if (dist < 0.0001) {
        nx = 0
        ny = -1
      } else {
        nx = dx / dist
        ny = dy / dist
      }

      // ① 침투 해소는 **원래 법선**으로. 비튼 법선으로 밀면 못 안쪽으로 들어갈 수 있다.
      ball.x = pegs.x[i] + nx * minDist
      ball.y = pegs.y[i] + ny * minDist

      // ② 반사는 살짝 비튼 법선으로. 이것이 산포를 자연스럽게 하고 끼임도 줄인다.
      const a = rng.range(-NORMAL_JITTER, NORMAL_JITTER)
      const ca = Math.cos(a)
      const sa = Math.sin(a)
      const rx = nx * ca - ny * sa
      const ry = nx * sa + ny * ca
      const dot = ball.vx * rx + ball.vy * ry
      // 이미 못에서 멀어지는 중이면 다시 반사하지 않는다(진동 방지).
      if (dot < 0) {
        ball.vx = (ball.vx - 2 * dot * rx) * PEG_RESTITUTION
        ball.vy = (ball.vy - 2 * dot * ry) * PEG_RESTITUTION
        result.hitPeg = i
        result.hitPower = Math.min(1, Math.abs(dot) / 500)
      }

      guardSamePeg(ball, i, rng, sim)
      // 한 스텝에 한 못만 처리한다. 두 못을 연속 처리하면 위치가 두 번 밀려 튀어 오른다.
      return
    }
  }
}

/**
 * 하단 칸막이.
 *
 * **반지름 `DIVIDER_HALF` 의 세로 선분**으로 푼다. 사각형으로 풀면 모서리에서 법선이 급변해
 * 볼이 튕기는 방향이 부자연스럽고, 무엇보다 칸막이 **끝(위쪽 반원)** 에 얹히는 경우를
 * 매끄럽게 다루지 못한다 — 볼이 가장 자주 닿는 곳이 바로 거기다.
 */
function collideDividers(ball: Ball): void {
  const minDist = BALL_R + DIVIDER_HALF
  const near = Math.round(ball.x / BIN_W)
  for (let i = near - 1; i <= near + 1; i += 1) {
    if (i < 1 || i > DIVIDER_LAST) continue
    const px = i * BIN_W
    const py = ball.y < BIN_TOP ? BIN_TOP : ball.y > BIN_FLOOR ? BIN_FLOOR : ball.y
    const dx = ball.x - px
    const dy = ball.y - py
    const d2 = dx * dx + dy * dy
    if (d2 >= minDist * minDist) continue

    const dist = Math.sqrt(d2)
    const nx = dist < 0.0001 ? (ball.vx >= 0 ? 1 : -1) : dx / dist
    const ny = dist < 0.0001 ? 0 : dy / dist
    ball.x = px + nx * minDist
    ball.y = py + ny * minDist
    const dot = ball.vx * nx + ball.vy * ny
    if (dot < 0) {
      ball.vx = (ball.vx - 2 * dot * nx) * WALL_RESTITUTION
      ball.vy = (ball.vy - 2 * dot * ny) * WALL_RESTITUTION
    }
    return
  }
}

/** 끼임 방어 ① — 같은 못과 짧은 시간에 여러 번. 사양서가 못 박은 규칙이다. */
function guardSamePeg(ball: Ball, peg: number, rng: Rng, sim: number): void {
  if (peg !== ball.lastPeg || sim - ball.contactsSince > STUCK_WINDOW) {
    ball.lastPeg = peg
    ball.contacts = 1
    ball.contactsSince = sim
    return
  }
  ball.contacts += 1
  if (ball.contacts >= STUCK_CONTACTS) {
    ball.vx += rng.sign() * STUCK_KICK
    ball.contacts = 0
    ball.contactsSince = sim
  }
}

/**
 * 끼임 방어 ② — 정체 감시.
 *
 * 못 **두 개 사이**에 얹혀 번갈아 부딪히면 ①이 발동하지 않는다(매번 다른 못이므로). 그래서
 * 높이가 실제로 줄고 있는지를 따로 본다. 아래로 밀어 주는 것까지 함께 하는 이유는, 옆으로만
 * 밀면 같은 높이의 옆 못으로 옮겨 앉을 뿐이기 때문이다.
 */
function guardStall(ball: Ball, rng: Rng, sim: number): void {
  if (sim - ball.stallSince < STALL_WINDOW) return
  // y 는 아래로 갈수록 커진다. 기준점보다 이만큼 더 내려왔으면 정상 낙하다.
  if (ball.y - ball.stallY > STALL_MIN_DROP) {
    // 정상적으로 내려가는 중이다. 기준을 지금으로 옮긴다.
    ball.stallSince = sim
    ball.stallY = ball.y
    return
  }
  ball.vx += rng.sign() * STALL_KICK
  ball.vy += STALL_KICK
  ball.stallSince = sim
  ball.stallY = ball.y
}
