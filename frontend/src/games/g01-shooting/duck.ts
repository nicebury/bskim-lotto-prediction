import type { DrawKit, Palette } from '@/games/core/types'

import { LANE_Y } from './scene'

/**
 * G01 오리 사격장 — 오리 모델과 조준선.
 *
 * → 사양서: docs/wiki/20-design/game-g01-shooting.md "아트 디렉션"
 *
 * ⚠ 오리는 **코드로 그린다.** 이미지 자산이 없고, 스프라이트를 만들면 다크모드에서 색이
 *   따라가지 않는다. 타원·원·삼각형·아크만으로 형태가 읽히면 충분하다.
 */

/** 히트박스 타원. 사양서 고정값이고 조준 관용(aim assist)을 주지 않는다. */
export const DUCK_RX = 22
export const DUCK_RY = 15

export type DuckState =
  /** 컨베이어 위를 지나간다. 유일하게 맞힐 수 있는 상태다. */
  | 'run'
  /** 맞아서 선반으로 날아가는 중. 이 상태에서는 다시 맞지 않는다. */
  | 'fly'
  /** 선반에 도착했다. 더 이상 그리지 않는다. */
  | 'done'

export interface Duck {
  lane: number
  /** 논리 좌표. 화면 밖 -40 ~ 400 을 순환한다. */
  x: number
  /** 직전 스텝의 x. 렌더 보간(alpha)에 쓴다. */
  prevX: number
  /** 위아래로 살짝 흔들리는 양. 물리와 판정이 어긋나지 않게 fixedUpdate 에서 계산한다. */
  bob: number
  prevBob: number
  /** 흔들림 위상. 오리마다 달라야 여섯 마리가 한 몸처럼 움직이지 않는다. */
  phase: number
  /**
   * 점프 진행도. `-1` 이면 점프 중이 아니다.
   *
   * ⚠ **점프는 히트박스도 함께 올린다.** 그림만 올리면 "분명히 맞췄는데 안 맞는" 판정이
   *   되고, 반대로 히트박스만 올리면 허공을 맞히게 된다. 판정과 그리기가 같은 값을 본다.
   */
  jumpT: number
  /** 다음 점프까지 남은 시간(초). */
  jumpCd: number
  /** 이 오리를 맞혔을 때 꽝이었는가. 날아가는 동안 `꽝` 을 띄운다. */
  blank: boolean
  state: DuckState
  /** `fly` 진행도 0~1. */
  t: number
  /** `fly` 시작 좌표. 여기서 선반까지 보간한다. */
  fromX: number
  fromY: number
  /** 도착할 선반 슬롯. `awardHidden()` 이 준 값이다. */
  slot: number
  /** 공개된 번호. `run` 상태에서는 0(아직 존재하지 않는다). */
  value: number
}

/** 오리 여섯 마리를 **한 번만** 만든다. 이후로는 이 배열을 재사용한다(GC 방지). */
export function createDucks(): Duck[] {
  const ducks: Duck[] = []
  for (let k = 0; k < 6; k += 1) {
    ducks.push({
      lane: 0,
      x: 0,
      prevX: 0,
      bob: 0,
      prevBob: 0,
      phase: 0,
      jumpT: -1,
      jumpCd: 0,
      blank: false,
      state: 'done',
      t: 0,
      fromX: 0,
      fromY: 0,
      slot: 0,
      value: 0,
    })
  }
  return ducks
}

/** 점프 높이(px). 맨 윗줄 오리가 조준 범위를 벗어나지 않는 선에서 최대치다. */
export const JUMP_H = 24
/** 한 번 뛰는 데 걸리는 시간(초). */
export const JUMP_TIME = 0.52

/**
 * 점프로 올라간 높이(음수 = 위).
 *
 * ⚠ **판정과 그리기가 이 함수 하나를 공유한다.** 두 곳에서 따로 계산하면 언젠가 어긋나고,
 *   그때 생기는 버그("맞췄는데 안 맞음")는 재현이 어렵다.
 */
export function jumpOffset(d: Duck): number {
  if (d.jumpT < 0) return 0
  return -Math.sin(d.jumpT * Math.PI) * JUMP_H
}

/** 판정용 y. 레인 중심 + 흔들림 + 점프. */
export function duckHitY(d: Duck): number {
  return LANE_Y[d.lane] + d.bob + jumpOffset(d)
}

/** 보간된 그리기 y. 판정과 같은 요소를 쓰되 흔들림만 보간한다. */
export function duckDrawY(d: Duck, alpha: number, lerp: DrawKit['lerp']): number {
  return LANE_Y[d.lane] + lerp(d.prevBob, d.bob, alpha) + jumpOffset(d)
}

/**
 * 오리 한 마리.
 *
 * @param facing  +1 이면 오른쪽을 본다. -1 이면 좌우 반전한다.
 * @param hurt    맞은 뒤인가. 눈이 `×` 로 바뀌고 몸이 기울어진다.
 * @param spin    `fly` 중 회전각(라디안).
 */
export function drawDuck(
  c: CanvasRenderingContext2D,
  draw: DrawKit,
  p: Palette,
  x: number,
  y: number,
  facing: number,
  hurt: boolean,
  spin: number,
): void {
  c.save()
  c.translate(x, y)
  if (spin !== 0) c.rotate(spin)
  if (facing < 0) c.scale(-1, 1)

  // 꼬리 삼각형. 몸통보다 먼저 그려 뒤에 깔린다.
  c.fillStyle = p.svc.reco
  c.beginPath()
  c.moveTo(-DUCK_RX + 2, -2)
  c.lineTo(-DUCK_RX - 9, -11)
  c.lineTo(-DUCK_RX - 1, 4)
  c.closePath()
  c.fill()

  // 몸통.
  c.fillStyle = p.svc.reco
  c.beginPath()
  c.ellipse(0, 0, DUCK_RX, DUCK_RY, 0, 0, Math.PI * 2)
  c.fill()

  // 배 쪽 그늘. 광원이 좌상단이므로 어두운 쪽은 우하단이다.
  c.globalAlpha = 0.12
  c.fillStyle = p.text
  c.beginPath()
  c.ellipse(2, 5, DUCK_RX - 4, DUCK_RY - 6, 0, 0, Math.PI * 2)
  c.fill()
  c.globalAlpha = 1

  // 머리. 사양서가 지정한 상대 위치(+14, -12).
  c.fillStyle = p.svc.reco
  c.beginPath()
  c.arc(14, -12, 10, 0, Math.PI * 2)
  c.fill()

  // 부리. 몸통과 같은 호박색이면 묻히므로 한 단계 짙은 주황을 쓴다.
  c.fillStyle = p.warning
  c.beginPath()
  c.moveTo(22, -12)
  c.lineTo(33, -9)
  c.lineTo(22, -6)
  c.closePath()
  c.fill()

  // 날개. 2차 베지어 한 줄이면 접힌 날개로 읽힌다.
  c.strokeStyle = p.text
  c.globalAlpha = 0.35
  c.lineWidth = 2
  c.beginPath()
  c.moveTo(-9, -2)
  c.quadraticCurveTo(2, -12, 11, -1)
  c.stroke()
  c.globalAlpha = 1

  // 눈. 맞았으면 `×` 로 바꾼다 — 색이 아니라 형태로 상태를 전한다.
  if (hurt) {
    c.strokeStyle = p.text
    c.lineWidth = 1.8
    c.lineCap = 'round'
    c.beginPath()
    c.moveTo(15, -16)
    c.lineTo(20, -11)
    c.moveTo(20, -16)
    c.lineTo(15, -11)
    c.stroke()
  } else {
    c.fillStyle = p.text
    c.beginPath()
    c.arc(18, -14, 2, 0, Math.PI * 2)
    c.fill()
    c.fillStyle = p.onAccent
    c.beginPath()
    c.arc(18.6, -14.7, 0.8, 0, Math.PI * 2)
    c.fill()
  }

  // 상단 림라이트(시각 언어 규칙 3). 광원은 항상 좌상단.
  c.globalAlpha = 0.35
  c.strokeStyle = p.surface
  c.lineWidth = 1.5
  c.beginPath()
  c.ellipse(0, 0, DUCK_RX - 2, DUCK_RY - 2, 0, Math.PI * 1.12, Math.PI * 1.72)
  c.stroke()
  c.globalAlpha = 1

  c.restore()
}

/**
 * 조준선.
 *
 * ⚠ 쿨다운 중에는 흐려지고 안쪽 링이 차오른다. **다음 발이 언제 나가는지 조준선만 보고
 *   알 수 있어야 한다** — 시선을 하단 게이지로 내리면 오리를 놓친다.
 *
 * @param scale 확대 배율. 누른 직후 크게 나타났다가 1 로 좁혀지는 "줌인" 연출에 쓴다.
 *              ⚠ **판정에는 영향을 주지 않는다.** 히트박스는 언제나 조준선의 *중심점* 하나다
 *              — 크기가 명중률을 바꾸면 그것은 숨은 확률이 되고, 사양서가 금지한 조준 관용
 *              (aim assist)과 같은 것이 된다.
 */
/** 조준 십자의 반지름. **확대하지 않는다** — 아래 주석의 이유. */
export const CROSS_R = 14

/**
 * 조준점.
 *
 * ── ★ 2026-09-17 재설계 — 원이 닫혀야 쏠 수 있다 ──────────────────
 * 종전에는 누른 직후 **십자 전체가 3.4배로 커졌다가 좁혀졌고**, 그것은 순수한 장식이었다.
 * 히트박스는 언제나 중심 한 점이라 누르자마자 떼도 불이익이 없었다. 중간에 원을 *산포
 * 범위*로 만들어 보기도 했지만 **탄이 나가기는 하므로** 여전히 "그냥 클릭해도 발사된다"
 * 로 느껴졌다 — 흩어져 빗나간 것은 "운이 나빴다" 로 읽혀 조작을 바꿀 이유가 못 된다.
 *
 * 지금은 **조준이 끝나기 전에는 발사 자체가 되지 않는다.** 그래서 이 원은 확률이 아니라
 * **남은 시간**을 뜻한다 — 원이 십자에 닿는 순간이 곧 쏠 수 있게 되는 순간이다.
 *
 * ⚠ **두 상태가 색으로 갈린다.** 조준 중에는 흐린 보조색, 끝나면 빨강이다. 색만으로
 *   전하지 않기 위해 **모양도 함께 바뀐다** — 점선 원이 사라지고 중심 점이 굵어진다.
 * ⚠ **십자 자체는 크기를 고정한다.** 십자까지 함께 커지면 "조준점이 크다" 로만 읽히고
 *   *무엇이* 줄어드는지가 보이지 않는다. 십자는 겨눈 한 점, 원은 남은 시간 —
 *   **역할이 다른 둘을 한 덩어리로 키우면 둘 다 뜻을 잃는다.**
 *
 * @param ring  남은 조준 거리(px). 0이면 조준 완료이고 발사할 수 있다
 * @param flash 조준이 막 끝난 순간의 번쩍임 0~1. 음수면 없음
 */
export function drawCrosshair(
  c: CanvasRenderingContext2D,
  p: Palette,
  x: number,
  y: number,
  ready: number,
  busy: boolean,
  ring = 0,
  flash = -1,
): void {
  const r = CROSS_R
  const aiming = ring > 0.5
  // 조준 중에는 흐린 보조색 — "아직 이 총은 준비되지 않았다" 를 색으로도 말한다.
  const main = aiming ? p.textMuted : p.danger
  c.save()
  c.globalAlpha = busy ? 0.45 : 1

  /*
    남은 조준 거리를 보여주는 원. 십자에 닿으면 사라진다.
    ⚠ 점선으로 그린다 — 실선이면 "표적을 가두는 테두리" 로 읽혀 **안에 넣으면 맞는다**는
      엉뚱한 뜻이 된다. 점선은 아직 확정되지 않았다는 신호다.
  */
  if (aiming) {
    const outer = r + ring
    // 옅은 채움으로 "면" 을 만든다. 선만 있으면 범위가 아니라 또 하나의 원으로 보인다.
    c.globalAlpha = (busy ? 0.45 : 1) * 0.1
    c.fillStyle = main
    c.beginPath()
    c.arc(x, y, outer, 0, Math.PI * 2)
    c.fill()

    c.globalAlpha = (busy ? 0.45 : 1) * 0.75
    c.strokeStyle = main
    c.lineWidth = 1.5
    c.setLineDash([5, 5])
    c.beginPath()
    c.arc(x, y, outer, 0, Math.PI * 2)
    c.stroke()
    c.setLineDash([])

    /*
      좁혀지는 방향을 알려 주는 표식 네 개. 원과 십자 사이를 잇는 짧은 선이라
      **원이 십자로 빨려 들어간다**는 것이 정지 화면에서도 읽힌다.
    */
    c.globalAlpha = (busy ? 0.45 : 1) * 0.55
    c.lineWidth = 2
    c.lineCap = 'round'
    const tick = Math.min(7, ring * 0.4)
    for (let i = 0; i < 4; i += 1) {
      const a = (Math.PI / 2) * i + Math.PI / 4
      const ux = Math.cos(a)
      const uy = Math.sin(a)
      c.beginPath()
      c.moveTo(x + ux * outer, y + uy * outer)
      c.lineTo(x + ux * (outer - tick), y + uy * (outer - tick))
      c.stroke()
    }
    c.globalAlpha = busy ? 0.45 : 1
  }

  /*
    조준이 막 끝난 순간의 링. 밖으로 퍼지며 사라진다.
    ⚠ 이것이 **"지금 떼면 된다" 를 알리는 유일한 능동 신호**다. 원이 조용히 사라지기만
      하면 눈이 오리를 쫓는 동안 그 순간을 놓친다.
  */
  if (flash >= 0) {
    c.save()
    c.globalAlpha = (1 - flash) * 0.9
    c.strokeStyle = p.danger
    c.lineWidth = 3 * (1 - flash) + 1
    c.beginPath()
    c.arc(x, y, r + flash * 18, 0, Math.PI * 2)
    c.stroke()
    c.restore()
  }

  c.strokeStyle = main
  c.lineWidth = 2
  c.beginPath()
  c.arc(x, y, r, 0, Math.PI * 2)
  c.stroke()

  // 쿨다운 진행 링. 시계 방향으로 차면 발사 가능.
  if (ready < 1) {
    c.globalAlpha = 0.9
    c.strokeStyle = p.textMuted
    c.lineWidth = 3
    c.beginPath()
    c.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ready)
    c.stroke()
    c.globalAlpha = busy ? 0.45 : 1
  }

  c.strokeStyle = main
  c.lineWidth = 2
  c.lineCap = 'round'
  c.beginPath()
  c.moveTo(x - r - 6, y)
  c.lineTo(x - 5, y)
  c.moveTo(x + 5, y)
  c.lineTo(x + r + 6, y)
  c.moveTo(x, y - r - 6)
  c.lineTo(x, y - 5)
  c.moveTo(x, y + 5)
  c.lineTo(x, y + r + 6)
  c.stroke()

  /*
    중심 점. 조준이 끝나면 **또렷하게 커진다** — 색이 바뀌는 것과 함께, 색을 구분하지 못하는
    사람에게도 "준비됐다" 가 형태로 전달된다(계약: 색만으로 정보를 전달하지 않는다).
  */
  c.fillStyle = main
  c.beginPath()
  c.arc(x, y, aiming ? 1.8 : 3.4, 0, Math.PI * 2)
  c.fill()

  c.restore()
}
