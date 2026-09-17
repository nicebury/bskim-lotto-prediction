import type { DrawKit, Palette } from '@/games/core/types'
import { ballRange } from '@/lib/lotto'

import { BIRD_R, PIPE_W, RING_BALL_R, RING_LINE, RING_R } from './constants'

/**
 * G06 오브젝트 그리기 — 파이프·링·새.
 *
 * → 사양서 "아트 디렉션" 절 / 계약 "시각 언어 4대 규칙"
 *
 * ── ⚠ 그라디언트를 매 프레임 만들지 않는다 ─────────────────────────
 * 파이프는 화면 위를 계속 흐르지만, **좌표를 옮기는 대신 `translate` 를 쓰면** 0 기준으로
 * 한 번 만든 그라디언트를 그대로 재사용할 수 있다(그라디언트 좌표는 현재 변환을 따른다).
 * 파이프가 셋씩 보이는 화면에서 매 프레임 `createLinearGradient` 를 세 번 부르면 그것만으로
 * 프레임을 먹는다.
 *
 * ⚠ `CanvasGradient` 는 만든 컨텍스트에 종속이다. 여기서 캐시하는 것들은 **메인 캔버스
 *   컨텍스트에서만** 만들어지고 쓰인다(오프스크린은 `scenery.ts` 가 따로 다룬다).
 */

/** 파이프 끝단 캡. 좌우로 이만큼 넓다 — 굵기 변화가 파이프에 원근을 준다. */
const CAP_OVER = 5
const CAP_H = 18
/** 파이프 위쪽은 화면 밖까지 이어져야 한다. 둥근 모서리가 화면 안에 보이면 떠 있는 것처럼 보인다. */
const PIPE_OVERSHOOT = 26

export interface Renderer {
  /** 파이프 한 쌍(위·아래). `x` 는 화면 좌표. */
  pipe(c: CanvasRenderingContext2D, x: number, gapCenter: number, gap: number, groundY: number): void
  /**
   * 링 — **번호 링과 꽝 링 두 가지를 한 함수가 그린다.**
   *
   * ⚠ **`reveal` 이 false 인 동안 숫자를 절대 그리지 않는다.** 계약이 2026-09-10 에
   *   못 박은 색 힌트형 규칙이다 — 여섯 게임 전부, 번호는 손에 넣는 순간 처음 드러난다.
   *   미리 보여주면 놀이가 "저 7번을 맞히는 조준 문제" 로 좁아지고, 못 맞히면 원하지 않는
   *   번호를 억지로 받는다.
   *
   * ⚠ **꽝 링(`value === null`)은 일부러 다르게 생겼다**(2026-09-17). 색 힌트형이 숨기라고
   *   한 것은 *번호*이지 *어느 링이 번호 링인지*가 아니다. 링 20개 중 6개만 번호를 주는
   *   구조에서는 오히려 색 링이 다가오는 것이 보여야 긴장이 생긴다 — 꽝만 줄줄이 지나가는
   *   동안 아무 신호가 없으면 그것이 곧 지루함이다.
   *
   * @param value  구간 **색**을 정하는 데만 쓴다. `null` 이면 꽝 링이다
   * @param reveal 통과해서 볼이 깨졌다. 이때부터 숫자를 그린다
   * @param scale  통과 연출용 확대(1 = 평소)
   * @param alpha  통과 연출용 페이드
   */
  ring(
    c: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    value: number | null,
    timeMs: number,
    scale: number,
    alpha: number,
    reveal: boolean,
  ): void
  /**
   * 캔버스 안 HUD — 좌상단 비행 거리, 우상단 남은 기회.
   *
   * ⚠ **캔버스에 그리는 이유**: 계약대로 `attempt` 이벤트를 보내도 호스트 HUD 가 아직
   *   쓰지 않는다("남은 기회는 캔버스 안에도 그린다" 절). 거리 역시 호스트가 모르는 값이다.
   * ⚠ 캔버스 글자는 보조기술에 **완전히 투명하다.** 같은 내용이 `status` 로도 나가야 하며
   *   여기 있는 것은 보는 사용자를 위한 중복이다.
   *
   * @param metres    현재 누적 비행 거리(m)
   * @param left      남은 기회
   * @param total     전체 기회
   */
  hud(
    c: CanvasRenderingContext2D,
    stageW: number,
    metres: number,
    left: number,
    total: number,
  ): void
  /**
   * 로또볼 캐릭터.
   * @param wing   날개 각도(rad)
   * @param bodyNumber 몸통에 새길 번호. `null` 이면 아직 하나도 못 모았다는 뜻
   */
  bird(
    c: CanvasRenderingContext2D,
    x: number,
    y: number,
    vy: number,
    wing: number,
    bodyNumber: number | null,
  ): void
  /** 새의 접지 그림자(시각 언어 규칙 2). 높이에 따라 작고 옅어진다. */
  birdShadow(c: CanvasRenderingContext2D, x: number, y: number, groundY: number): void
  /** 테마가 바뀌었다. 구워 둔 그라디언트를 버린다. */
  invalidate(): void
}

export function createRenderer(getPalette: () => Palette, draw: DrawKit): Renderer {
  /** 파이프 몸통·캡의 원통 음영. 만든 컨텍스트를 함께 기억해 다른 캔버스에서 재사용하지 않는다. */
  let bodyGrad: CanvasGradient | null = null
  let capGrad: CanvasGradient | null = null

  /**
   * 원통 음영 한 벌.
   * ⚠ **광원은 항상 좌상단이다**(시각 언어 규칙 3). 왼쪽 28% 지점에 하이라이트 띠를 두고
   *   오른쪽으로 갈수록 어둡게 떨어뜨린다. 이 한 겹이 납작한 사각형을 관으로 만든다.
   */
  function cylinder(c: CanvasRenderingContext2D, from: number, to: number): CanvasGradient {
    const g = c.createLinearGradient(from, 0, to, 0)
    g.addColorStop(0, 'rgba(255,255,255,0.10)')
    g.addColorStop(0.28, 'rgba(255,255,255,0.34)')
    g.addColorStop(0.55, 'rgba(255,255,255,0)')
    g.addColorStop(1, 'rgba(0,0,0,0.22)')
    return g
  }

  function pipeBlock(c: CanvasRenderingContext2D, y: number, h: number) {
    if (h <= 0) return
    draw.roundRect(c, 0, y, PIPE_W, h, 9)
    c.fillStyle = getPalette().svc.lotto
    c.fill()
    draw.roundRect(c, 0, y, PIPE_W, h, 9)
    c.fillStyle = bodyGrad as CanvasGradient
    c.fill()
  }

  function pipeCap(c: CanvasRenderingContext2D, y: number) {
    draw.roundRect(c, -CAP_OVER, y, PIPE_W + CAP_OVER * 2, CAP_H, 8)
    c.fillStyle = getPalette().svc.lotto
    c.fill()
    draw.roundRect(c, -CAP_OVER, y, PIPE_W + CAP_OVER * 2, CAP_H, 8)
    c.fillStyle = capGrad as CanvasGradient
    c.fill()
  }

  return {
    pipe(c, x, gapCenter, gap, groundY) {
      if (bodyGrad === null) bodyGrad = cylinder(c, 0, PIPE_W)
      if (capGrad === null) capGrad = cylinder(c, -CAP_OVER, PIPE_W + CAP_OVER)

      const top = gapCenter - gap / 2
      const bottom = gapCenter + gap / 2

      c.save()
      /*
        ⚠ x 만 옮긴다. 이렇게 해야 위에서 캐시한 그라디언트가 파이프를 따라온다 —
          좌표에 x 를 더해 그리면 그라디언트는 제자리에 남아 파이프가 흐를 때마다 음영이
          미끄러지는 이상한 화면이 된다.
      */
      c.translate(x, 0)

      // 위 파이프: 화면 위쪽 밖에서 간극 상단까지.
      pipeBlock(c, -PIPE_OVERSHOOT, top + PIPE_OVERSHOOT - CAP_H * 0.5)
      pipeCap(c, top - CAP_H)

      // 아래 파이프: 간극 하단에서 지면까지.
      pipeBlock(c, bottom + CAP_H * 0.5, groundY - bottom - CAP_H * 0.5)
      pipeCap(c, bottom)

      c.restore()
    },

    ring(c, cx, cy, value, timeMs, scale, alpha, reveal) {
      /*
        ⚠ 링 색은 **공식 5구간**을 따른다([[0009-official-ball-colors-over-mockup]]).
          게임마다 색을 새로 정하면 사용자가 사이트 전체에서 학습한 색-구간 대응이 깨진다.
        ⚠ 이 색이 **거짓말이 되지 않는 근거**: 색을 정하는 `value` 가 곧 통과했을 때 받을
          번호다(이미 `reserve()` 로 풀에서 빠져 있다). 색을 따로 뽑고 번호를 나중에 정하면
          그 순간 거짓이 된다.
      */
      const p = getPalette()
      /*
        ⚠ 꽝 링은 **무채색**이다. 구간 색이 하나도 섞이지 않아야 "여기엔 없다" 가 한눈에
          읽힌다. 색을 옅게만 하면 회색 구간(31~40)과 구별되지 않는다 — 그 구간 색이
          실제로 회색이기 때문이다.
      */
      const blank = value === null
      const color = blank ? p.border : p.ball[ballRange(value)]
      /*
        미세 맥동. 링이 살아 있는 물체로 보여 눈이 먼저 그리로 간다.
        ⚠ **꽝 링은 맥동하지 않는다.** 스무 개가 줄줄이 지나가는데 전부 꿈틀거리면 정작
          번호 링이 다가올 때 눈이 그것을 골라내지 못한다. 움직임은 신호일 때만 값이 있다.
      */
      const pulse = blank ? 0 : Math.sin(timeMs / 380) * 1.6
      const r = (RING_R + pulse) * scale

      c.save()
      c.globalAlpha = alpha

      // 안쪽 유리. 링 안이 '통과할 자리' 임을 면으로 알려 준다.
      c.fillStyle = blank ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.15)'
      c.beginPath()
      c.arc(cx, cy, r - RING_LINE * 0.5, 0, Math.PI * 2)
      c.fill()

      // ⚠ 꽝 링은 테두리도 얇다(6 → 3). 굵기 자체가 "중요하지 않다" 는 신호다.
      c.lineWidth = blank ? RING_LINE * 0.5 : RING_LINE
      c.strokeStyle = color
      c.beginPath()
      c.arc(cx, cy, r, 0, Math.PI * 2)
      c.stroke()

      // 좌상단 림라이트(규칙 3). 링 위쪽만 밝게 덧그린다.
      c.lineWidth = 2
      c.strokeStyle = 'rgba(255,255,255,0.45)'
      c.beginPath()
      c.arc(cx, cy, r - RING_LINE * 0.5, Math.PI * 1.05, Math.PI * 1.7)
      c.stroke()

      if (blank) {
        /*
          꽝 링 한가운데는 **비운다.** 볼을 그리면 "저기 뭔가 들어 있다" 로 읽혀, 통과하고
          나서 아무 일도 없을 때 속은 느낌이 된다. 가는 테두리 원 하나로 자리만 표시한다.
        */
        c.lineWidth = 1.5
        c.strokeStyle = color
        c.globalAlpha = alpha * 0.7
        c.beginPath()
        c.arc(cx, cy, RING_BALL_R * 0.55 * scale, 0, Math.PI * 2)
        c.stroke()
      } else if (reveal) {
        /** ⚠ 숫자는 반드시 `ball()` 로만 그린다(규칙 4). 사이트 전체가 쓰는 그 볼이어야 한다. */
        draw.ball(c, cx, cy, RING_BALL_R * scale, value)
      } else {
        blankBall(c, cx, cy, RING_BALL_R * scale, color)
      }
      c.restore()
    },

    birdShadow(c, x, y, groundY) {
      /*
        높을수록 작고 옅다. 이 한 겹이 없으면 새가 배경 위에 붙은 스티커처럼 보인다.
        ⚠ 캔버스 흐림 효과는 쓰지 않는다 — 모바일 GPU 에서 극단적으로 느리다.
          (그 속성 이름을 주석에도 적지 않는다. 검증 게이트가 문자열만 보기 때문이다.)
      */
      const t = draw.clamp((groundY - y) / groundY, 0, 1)
      const shrink = 1 - t * 0.45
      draw.softShadow(c, x, groundY - 5, BIRD_R * shrink, 4.5 * shrink, 0.2 * (1 - t * 0.5))
    },

    bird(c, x, y, vy, wing, bodyNumber) {
      const palette = getPalette()
      /*
        기울기. 날갯짓 직후에는 위를 보고, 떨어지는 동안 점점 아래를 향한다.
        ⚠ 사양서의 −0.25 / +0.35 를 상·하한으로 쓴다. 속도에 비례시키면 값이 저절로
          그 사이를 오가므로 별도 상태가 필요 없다.
      */
      const angle = draw.clamp(vy * 0.0006, -0.25, 0.35)

      c.save()
      c.translate(x, y)
      c.rotate(angle)

      // 뒤쪽 날개 — 몸통보다 먼저 그려 몸통 뒤에 깔린다.
      drawWing(c, palette, -2, 1, 9, 5.5, wing * 0.9, 0.55)

      if (bodyNumber === null) {
        /*
          아직 하나도 못 모았다. 물음표 볼로 둔다.
          ⚠ 몸통에 **직전에 모은 번호**를 새기는 것이 이 캐릭터의 규칙이다 — 획득 순간
            몸통이 바뀌어, 캔버스를 보는 사용자에게 즉각적인 피드백이 된다.
        */
        draw.mysteryBall(c, 0, 0, BIRD_R)
      } else {
        draw.ball(c, 0, 0, BIRD_R, bodyNumber)
      }

      /*
        몸통 윤곽.
        ⚠ `ball()` 이 그리는 안쪽 링만으로는 **밝은 볼(노랑·초록)과 아직 못 모았을 때의
          물음표 볼이 밝은 하늘에 묻힌다.** 실측에서 확인한 문제다. 한 겹을 더 얹어
          어떤 배경에서도 새의 실루엣이 서게 한다.
      */
      c.save()
      c.globalAlpha = 0.45
      c.strokeStyle = palette.textMuted
      c.lineWidth = 1.5
      c.beginPath()
      c.arc(0, 0, BIRD_R - 0.5, 0, Math.PI * 2)
      c.stroke()
      c.restore()

      // 부리. 진행 방향(오른쪽)으로 짧게 낸다.
      c.fillStyle = palette.warning
      c.beginPath()
      c.moveTo(BIRD_R - 3, -1)
      c.lineTo(BIRD_R + 6, 2.5)
      c.lineTo(BIRD_R - 3, 6)
      c.closePath()
      c.fill()

      /*
        눈 둘.
        ⚠ **`ballFg` / `ballFgDark` 를 쓴다.** 이 둘은 테마와 무관하게 서로 대비되도록
          정의된 쌍이라(볼 위 글자색), 라이트·다크 어느 쪽에서도 눈이 사라지지 않는다.
          `text`·`surface` 를 쓰면 다크모드에서 흰자와 눈동자가 뒤집힌다.
        ⚠ y 를 −10 에 둔 것은 몸통 숫자와 겹치지 않게 하기 위해서다. 숫자는 중앙에
          `0.95r` 크기로 그려지므로 그 위쪽 경계가 대략 −6.6 이다.
      */
      for (const ex of [-5.5, 4.5]) {
        c.fillStyle = palette.ballFg
        c.beginPath()
        c.arc(ex, -10, 3.4, 0, Math.PI * 2)
        c.fill()
        c.fillStyle = palette.ballFgDark
        c.beginPath()
        c.arc(ex + 1, -10, 1.7, 0, Math.PI * 2)
        c.fill()
      }

      // 다리. 아래로 짧게 늘어뜨린다 — 이것 하나로 '떠 있는 공' 이 '나는 새' 가 된다.
      c.strokeStyle = palette.warning
      c.lineWidth = 2
      c.lineCap = 'round'
      for (const lx of [-4, 3]) {
        c.beginPath()
        c.moveTo(lx, BIRD_R - 3)
        c.lineTo(lx - 1, BIRD_R + 4)
        c.stroke()
      }

      // 앞쪽 날개 — 몸통 위에 겹쳐 깊이를 만든다.
      drawWing(c, palette, -1, 3, 10.5, 6, wing, 0.9)

      c.restore()
    },

    hud(c, stageW, metres, left, total) {
      const p = getPalette()

      /*
        ⚠ **배경판을 깐다.** 하늘이 밝은 구간(그라디언트 아래쪽)에서는 흰 글씨가 사라지고
          구름 위에서는 어두운 글씨가 사라진다. 실측에서 새 몸통이 하늘에 묻혔던 것과 같은
          문제라, 같은 해법(불투명 판 + 얇은 테두리)을 쓴다.
        ⚠ 높이 22, 상단 여백 8 — 안내 패널(`y = 50`, 높이 52)의 위쪽 끝(24)에 닿지 않는다.
          두 개가 겹치면 충돌 안내와 남은 기회를 동시에 읽을 수 없다.
      */
      function plate(x: number, w: number): void {
        c.save()
        c.globalAlpha = 0.78
        draw.roundRect(c, x, 8, w, 22, 11)
        c.fillStyle = p.surface
        c.fill()
        c.globalAlpha = 1
        draw.roundRect(c, x, 8, w, 22, 11)
        c.lineWidth = 1
        c.strokeStyle = p.border
        c.stroke()
        c.restore()
      }

      // ── 좌상단: 비행 거리 ──────────────────────────────────
      const label = `${metres}m`
      // 자릿수가 늘어도 판이 글자를 자르지 않도록 폭을 글자 수에서 만든다.
      const distW = Math.max(56, 26 + label.length * 9)
      plate(10, distW)
      draw.text(c, label, 10 + distW / 2, 23, {
        size: 13,
        weight: 700,
        color: p.text,
      })

      /*
        ── 우상단: 남은 기회를 **점으로** ──────────────────────
        ⚠ 숫자("3/9")보다 점이 빠르게 읽히고, **줄어드는 것이 눈에 들어온다.** 이 게임은
          손이 바쁜 게임이라 HUD 를 읽는 데 쓸 수 있는 시간이 한 순간뿐이다.
        ⚠ 점 개수는 `total` 을 따른다. 9 를 상수로 박으면 기회 수를 바꿀 때 여기가 남는다.
      */
      const dotR = 3.2
      const dotGap = 9
      const dotsW = (total - 1) * dotGap + dotR * 2
      const plateW = dotsW + 20
      const plateX = stageW - 10 - plateW
      plate(plateX, plateW)

      for (let i = 0; i < total; i += 1) {
        const x = plateX + 10 + dotR + i * dotGap
        const alive = i < left
        c.save()
        /*
          ⚠ 남은 것은 채우고 쓴 것은 **테두리만** 남긴다. 쓴 것을 아예 지우면 전체가 몇
            번이었는지 알 수 없어, 마지막 하나가 남았다는 사실이 전달되지 않는다.
        */
        c.beginPath()
        c.arc(x, 19, dotR, 0, Math.PI * 2)
        if (alive) {
          // 마지막 한 번은 경고색으로. 색만으로 전달하지 않으려고 개수도 함께 줄어든다.
          c.fillStyle = left <= 1 ? p.danger : p.svc.news
          c.fill()
        } else {
          c.globalAlpha = 0.5
          c.lineWidth = 1.2
          c.strokeStyle = p.textMuted
          c.stroke()
        }
        c.restore()
      }
    },

    invalidate() {
      bodyGrad = null
      capGrad = null
    },
  }
}

/**
 * 무지 볼 — **번호가 없는 볼**.
 *
 * ⚠ `draw.ball()` 은 숫자를 반드시 그리므로 색 힌트형에는 쓸 수 없다. 그래서 같은 생김새를
 *   여기서 다시 그린다 — 계약이 말한 *"중복이 충돌보다 싸다"* 에 해당한다. 채움 → 좌상단
 *   하이라이트 → 안쪽 링까지 `ball()` 과 같은 순서라 같은 재질로 보인다.
 * ⚠ 숫자만 없다. 있으면 그 자체가 계약 위반이다.
 */
function blankBall(
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
 * 날개 한 장.
 * ⚠ 회전 중심을 어깨(몸통 안쪽)에 둔다. 타원 중심을 돌리면 날개가 몸에서 떨어져 돈다.
 */
function drawWing(
  c: CanvasRenderingContext2D,
  palette: Palette,
  ox: number,
  oy: number,
  rx: number,
  ry: number,
  angle: number,
  alpha: number,
) {
  c.save()
  c.globalAlpha = alpha
  c.translate(ox, oy)
  c.rotate(angle)
  c.fillStyle = palette.surface
  c.beginPath()
  c.ellipse(-rx * 0.7, 0, rx, ry, 0, 0, Math.PI * 2)
  c.fill()
  // 날개 윗면 림라이트. 광원은 좌상단이다.
  c.strokeStyle = 'rgba(255,255,255,0.4)'
  c.lineWidth = 1.2
  c.beginPath()
  c.ellipse(-rx * 0.7, 0, rx, ry, 0, Math.PI * 1.05, Math.PI * 1.85)
  c.stroke()
  // 아래쪽 경계. 흰 날개가 밝은 볼 위에서 사라지지 않게 한다.
  c.globalAlpha = alpha * 0.35
  c.strokeStyle = palette.textMuted
  c.lineWidth = 1
  c.beginPath()
  c.ellipse(-rx * 0.7, 0, rx, ry, 0, 0, Math.PI)
  c.stroke()
  c.restore()
}
