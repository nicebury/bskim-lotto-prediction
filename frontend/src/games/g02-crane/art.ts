import type { DrawKit, Palette, ServiceAccent } from '@/games/core/types'

import {
  BALL_R,
  BUTTON_CX,
  BUTTON_CY,
  BUTTON_R,
  CAB_H,
  CAB_R,
  CAB_W,
  CAB_X,
  CAB_Y,
  CHUTE_L,
  CHUTE_R,
  GAUGE_X,
  GAUGE_Y,
  GLASS_B,
  GLASS_L,
  GLASS_R,
  GLASS_T,
  HEAD_B,
  LAMP_Y,
  MAG_H,
  MAG_W,
  PANEL_T,
  RAIL_Y,
  STAGE_H,
  STAGE_W,
  TRAY_Y,
} from './layout'

/**
 * G02 크레인 뽑기 — 그리기.
 *
 * → 사양서 "아트 디렉션": docs/wiki/20-design/game-g02-crane.md
 *
 * ── ⚠ 이 파일이 지키는 것 ──────────────────────────────────────────
 * 계약의 **시각 언어 4대 규칙**(→ playground-game-contract.md "DrawKit").
 *   1. 정적 배경은 오프스크린에 한 번 그려 캐시하고 `drawImage` 로만 쓴다
 *   2. 모든 물체는 지면에 `softShadow` 를 갖는다
 *   3. 상단에 밝은 림라이트. **광원은 항상 좌상단**
 *   4. 숫자는 반드시 `kit.ball()` 로만 그린다
 *
 * ⚠ **색 리터럴을 쓰지 않는다.** 색은 전부 `palette` 에서 온다. 반투명 덧칠만 `rgba()` 로
 *   한다 — 흰색·검정 오버레이는 어떤 테마에서도 같은 역할(밝게/어둡게)을 하므로 토큰이
 *   필요 없고, 오히려 토큰을 쓰면 다크모드에서 하이라이트가 사라진다.
 *   (⚠ 게이트가 문자열만 보므로 **주석에도 색 코드를 적지 않는다.**)
 * ⚠ 루프 안에서 캔버스 흐림 그림자 속성을 쓰지 않는다. 모바일 GPU 에서 극단적으로 느리다.
 */

/* ────────────────────────────────────────────────────────────
 * 동물 — 볼에 번호 대신 얼굴이 있다
 *
 * ⚠ 번호가 **붙지 않은** 볼이므로 공식 5구간 색을 쓰지 않는다(계약: *번호가 붙은*
 *   볼·캡슐·링·칸만 5구간). 대신 `palette.svc` 여섯 색을 그대로 쓴다.
 * ⚠ 깨진 뒤 나오는 번호 볼은 `kit.ball()` 이 그린다. **거기서부터는 공식 색이다.**
 * ──────────────────────────────────────────────────────────── */

type EarKind = 'pointy' | 'floppy' | 'long' | 'round' | 'beak'

interface Animal {
  readonly ear: EarKind
  readonly svc: ServiceAccent
}

/** 여섯 종. 귀 모양과 색이 둘 다 달라 **색만으로 구분하지 않는다**(접근성). */
export const ANIMALS: readonly Animal[] = [
  { ear: 'pointy', svc: 'play' },
  { ear: 'floppy', svc: 'reco' },
  { ear: 'long', svc: 'dream' },
  { ear: 'round', svc: 'news' },
  { ear: 'pointy', svc: 'lotto' },
  { ear: 'beak', svc: 'stats' },
]

/* ────────────────────────────────────────────────────────────
 * 정적 배경
 * ──────────────────────────────────────────────────────────── */

/**
 * 카펫·외장·유리창·배출구·조작 패널을 **한 번에** 그린다.
 *
 * ⚠ 여기서 `kit.bgGradient()` 를 부르면 안 된다. `DrawKit` 은 그라디언트를 내부 캐시하는데
 *   `CanvasGradient` 는 **그것을 만든 컨텍스트에 묶여 있다.** 오프스크린에서 만든 것이
 *   캐시에 들어가면 이후 메인 캔버스가 그 캐시를 꺼내 쓰면서 배경이 통째로 사라진다.
 */
export function paintBackdrop(c: CanvasRenderingContext2D, kit: DrawKit, p: Palette): void {
  const base = c.createLinearGradient(0, 0, 0, STAGE_H)
  base.addColorStop(0, p.surface2)
  base.addColorStop(1, p.bg)
  c.fillStyle = base
  c.fillRect(0, 0, STAGE_W, STAGE_H)

  paintCarpet(c, p)
  paintCabinet(c, kit, p)
  paintHeader(c, kit, p)
  paintGlass(c, kit, p)
  paintChute(c, kit, p)
  paintPanel(c, kit, p)

  kit.vignette(c, { width: STAGE_W, height: STAGE_H }, 0.22)
}

/** 오락실 카펫 — 마름모 격자. */
function paintCarpet(c: CanvasRenderingContext2D, p: Palette): void {
  const cell = 24
  c.save()
  c.globalAlpha = 0.06
  c.strokeStyle = p.text
  c.lineWidth = 1
  c.beginPath()
  /*
    ⚠ 마름모는 격자선 두 벌(↗ ↘)로 만든다. 개별 마름모를 하나씩 그리면 경로가 수백 개가
      되는데, 대각선은 화면 폭+높이 만큼만 있으면 충분하다.
  */
  for (let d = -STAGE_H; d < STAGE_W + STAGE_H; d += cell) {
    c.moveTo(d, 0)
    c.lineTo(d + STAGE_H, STAGE_H)
    c.moveTo(d, STAGE_H)
    c.lineTo(d + STAGE_H, 0)
  }
  c.stroke()
  c.restore()
}

/**
 * 기계 외장.
 *
 * ⚠ **단색 + 세로 그라디언트 한 장이면 투박해진다**(2026-09-16 사용자 지적). 실제 기계가
 *   덩어리로 보이지 않는 이유는 **면이 나뉘어 있기 때문**이다 — 테두리 베젤, 좌우 기둥,
 *   모서리 리벳, 바닥 받침. 색을 늘리지 않고 **면과 선만 늘려** 밀도를 만든다.
 */
function paintCabinet(c: CanvasRenderingContext2D, kit: DrawKit, p: Palette): void {
  // 바닥 받침 — 기계가 놓여 있다는 접지감(규칙 2).
  kit.softShadow(c, STAGE_W / 2, CAB_Y + CAB_H + 3, CAB_W * 0.44, 6, 0.24)

  // ① 바깥 테두리(어두운 베젤). 본체보다 살짝 크게 깔아 가장자리를 만든다.
  kit.roundRect(c, CAB_X - 2, CAB_Y - 2, CAB_W + 4, CAB_H + 4, CAB_R + 2)
  c.fillStyle = 'rgba(0,0,0,0.45)'
  c.fill()

  // ② 본체.
  kit.roundRect(c, CAB_X, CAB_Y, CAB_W, CAB_H, CAB_R)
  c.fillStyle = p.primary
  c.fill()

  /*
    ③ 세로 명암.
    ⚠ 색을 직접 계산해 두 번째 색을 만들면(밝게/어둡게) 팔레트 밖의 색이 생겨 다크모드에서
      어긋난다. 단색 위에 **흰↔검정 덧칠**을 얹어 명암만 준다 — 어떤 테마에서도 같은
      방향으로 동작한다.
  */
  const shade = c.createLinearGradient(0, CAB_Y, 0, CAB_Y + CAB_H)
  shade.addColorStop(0, 'rgba(255,255,255,0.22)')
  shade.addColorStop(0.4, 'rgba(255,255,255,0)')
  shade.addColorStop(0.75, 'rgba(0,0,0,0.12)')
  shade.addColorStop(1, 'rgba(0,0,0,0.34)')
  kit.roundRect(c, CAB_X, CAB_Y, CAB_W, CAB_H, CAB_R)
  c.fillStyle = shade
  c.fill()

  // ④ 좌우 기둥 — 유리창 양옆의 세로 면. 기계에 두께가 생긴다.
  const pillar = c.createLinearGradient(CAB_X, 0, GLASS_L, 0)
  pillar.addColorStop(0, 'rgba(0,0,0,0.20)')
  pillar.addColorStop(1, 'rgba(255,255,255,0.16)')
  c.fillStyle = pillar
  c.fillRect(CAB_X + 2, HEAD_B + 2, GLASS_L - CAB_X - 2, GLASS_B - HEAD_B)
  const pillarR = c.createLinearGradient(GLASS_R, 0, CAB_X + CAB_W, 0)
  pillarR.addColorStop(0, 'rgba(255,255,255,0.10)')
  pillarR.addColorStop(1, 'rgba(0,0,0,0.24)')
  c.fillStyle = pillarR
  c.fillRect(GLASS_R, HEAD_B + 2, CAB_X + CAB_W - GLASS_R - 2, GLASS_B - HEAD_B)

  // ⑤ 상단 림라이트(규칙 3). 광원은 좌상단이므로 위쪽 모서리만 밝힌다.
  c.lineWidth = 1.5
  c.strokeStyle = 'rgba(255,255,255,0.40)'
  c.beginPath()
  c.moveTo(CAB_X + CAB_R, CAB_Y + 1)
  c.lineTo(CAB_X + CAB_W - CAB_R, CAB_Y + 1)
  c.stroke()

  // ⑥ 모서리 리벳 넷. 작은 점 하나가 "조립된 물건" 이라는 신호를 준다.
  for (let i = 0; i < 4; i += 1) {
    const rx = i % 2 === 0 ? CAB_X + 13 : CAB_X + CAB_W - 13
    const ry = i < 2 ? CAB_Y + 13 : CAB_Y + CAB_H - 13
    c.fillStyle = 'rgba(0,0,0,0.30)'
    c.beginPath()
    c.arc(rx, ry, 3, 0, Math.PI * 2)
    c.fill()
    c.fillStyle = 'rgba(255,255,255,0.35)'
    c.beginPath()
    c.arc(rx - 0.7, ry - 0.7, 1.6, 0, Math.PI * 2)
    c.fill()
  }
}

/** 상단 헤더 — 이름판 띠와 램프. 글자는 쓰지 않는다(문구는 캔버스 밖 DOM 이 맡는다). */
function paintHeader(c: CanvasRenderingContext2D, kit: DrawKit, p: Palette): void {
  // 광택 이름판. 가운데가 밝은 가로 그라디언트라 금속처럼 읽힌다.
  const plateX = CAB_X + 58
  const plateW = CAB_W - 116
  const g = c.createLinearGradient(plateX, 0, plateX + plateW, 0)
  g.addColorStop(0, 'rgba(255,255,255,0.10)')
  g.addColorStop(0.5, 'rgba(255,255,255,0.34)')
  g.addColorStop(1, 'rgba(255,255,255,0.10)')
  kit.roundRect(c, plateX, CAB_Y + 9, plateW, 21, 10)
  c.fillStyle = g
  c.fill()
  c.lineWidth = 1
  c.strokeStyle = 'rgba(0,0,0,0.22)'
  kit.roundRect(c, plateX, CAB_Y + 9, plateW, 21, 10)
  c.stroke()

  // 이름판 안의 장식 볼 셋 — 이 기계가 무엇을 뽑는지 말없이 알린다.
  for (let i = 0; i < 3; i += 1) {
    const x = STAGE_W / 2 + (i - 1) * 21
    c.fillStyle = 'rgba(255,255,255,0.62)'
    c.beginPath()
    c.arc(x, CAB_Y + 19.5, 7.5, 0, Math.PI * 2)
    c.fill()
    // 아래 반쪽만 어둡게 — 볼처럼 보이게 하는 가장 싼 방법이다.
    c.fillStyle = 'rgba(0,0,0,0.20)'
    c.beginPath()
    c.arc(x, CAB_Y + 19.5, 7.5, 0.15, Math.PI - 0.15)
    c.fill()
    c.fillStyle = 'rgba(255,255,255,0.75)'
    c.beginPath()
    c.arc(x - 2.4, CAB_Y + 17, 2.2, 0, Math.PI * 2)
    c.fill()
  }

  // 램프가 앉을 홈. 켜진 램프는 매 프레임 따로 그린다.
  for (let i = 0; i < 4; i += 1) {
    c.fillStyle = 'rgba(0,0,0,0.34)'
    c.beginPath()
    c.arc(lampX(i), LAMP_Y, 5, 0, Math.PI * 2)
    c.fill()
  }

  // 헤더와 유리창을 가르는 선.
  c.fillStyle = 'rgba(0,0,0,0.22)'
  c.fillRect(CAB_X + 8, HEAD_B, CAB_W - 16, 1.5)
}

/** 램프 네 개의 x — 이름판 좌우로 둘씩. 켜짐 표시는 동적이라 좌표만 공유한다. */
export function lampX(i: number): number {
  const inner = [CAB_X + 22, CAB_X + 42, CAB_X + CAB_W - 42, CAB_X + CAB_W - 22]
  return inner[i]
}

/** 유리창 — 금속 베젤 + 안쪽 면 + 반사선 + 레일 + 바닥. */
function paintGlass(c: CanvasRenderingContext2D, kit: DrawKit, p: Palette): void {
  const w = GLASS_R - GLASS_L
  const h = GLASS_B - GLASS_T

  // 베젤 — 밝은 선과 어두운 선 두 겹. 유리가 **끼워져 있는** 것으로 보인다.
  kit.roundRect(c, GLASS_L - 3, GLASS_T - 3, w + 6, h + 6, 11)
  c.fillStyle = 'rgba(0,0,0,0.28)'
  c.fill()
  c.lineWidth = 1
  c.strokeStyle = 'rgba(255,255,255,0.28)'
  kit.roundRect(c, GLASS_L - 3, GLASS_T - 3, w + 6, h + 6, 11)
  c.stroke()

  kit.roundRect(c, GLASS_L, GLASS_T, w, h, 8)
  c.fillStyle = p.surface
  c.fill()

  // 기계 안쪽은 위가 어둡다. 볼이 놓인 아래쪽이 상대적으로 밝아 시선이 간다.
  const inner = c.createLinearGradient(0, GLASS_T, 0, GLASS_B)
  inner.addColorStop(0, 'rgba(0,0,0,0.24)')
  inner.addColorStop(1, 'rgba(0,0,0,0)')
  kit.roundRect(c, GLASS_L, GLASS_T, w, h, 8)
  c.fillStyle = inner
  c.fill()

  /*
    ⚠ 자석과 볼 사이의 빈 공간(약 140px)을 채우려 뒷벽에 세로 홈을 넣어 봤다가 **뺐다.**
      알파 0.05 로도 밝은 유리 위에서는 또렷한 줄이 되어, 깊이가 아니라 소음이 됐다(실측).
      그 공간은 하강 연출이 쓰는 자리이고, **비어 있는 것이 정상이다** — 크레인 기계의
      유리창은 원래 위가 비어 있다.
  */

  // 볼이 놓이는 바닥 면 + 그 앞턱.
  c.fillStyle = 'rgba(255,255,255,0.06)'
  c.fillRect(GLASS_L + 1, GLASS_B - 22, w - 2, 21)
  c.fillStyle = 'rgba(0,0,0,0.18)'
  c.fillRect(GLASS_L + 1, GLASS_B - 23, w - 2, 1.5)

  // 레일 — 자석이 매달린 가로 봉.
  c.fillStyle = p.border
  c.fillRect(GLASS_L + 6, RAIL_Y - 3, w - 12, 6)
  c.fillStyle = 'rgba(255,255,255,0.30)'
  c.fillRect(GLASS_L + 6, RAIL_Y - 3, w - 12, 1.5)
  // 레일 양끝 고정구.
  for (const x of [GLASS_L + 6, GLASS_R - 12]) {
    c.fillStyle = 'rgba(0,0,0,0.30)'
    c.fillRect(x, RAIL_Y - 6, 6, 12)
  }

  /*
    유리면. 흰색 덧칠 + 상단 대각 반사선 2개.
    ⚠ 알파를 낮게 잡는다. 흰 덧칠은 **어두운 테마에서 훨씬 도드라진다** — 라이트에서 은은한
      값이 다크에서는 빈 유리창을 가로지르는 밝은 줄이 된다(실측).
  */
  kit.roundRect(c, GLASS_L, GLASS_T, w, h, 8)
  c.fillStyle = 'rgba(255,255,255,0.07)'
  c.fill()

  c.save()
  kit.roundRect(c, GLASS_L, GLASS_T, w, h, 8)
  c.clip()
  c.strokeStyle = 'rgba(255,255,255,0.09)'
  c.lineWidth = 13
  c.lineCap = 'round'
  c.beginPath()
  c.moveTo(GLASS_L + 20, GLASS_T + 104)
  c.lineTo(GLASS_L + 92, GLASS_T + 6)
  c.moveTo(GLASS_L + 48, GLASS_T + 116)
  c.lineTo(GLASS_L + 110, GLASS_T + 28)
  c.stroke()
  c.restore()

  c.lineWidth = 1.5
  c.strokeStyle = p.border
  kit.roundRect(c, GLASS_L, GLASS_T, w, h, 8)
  c.stroke()
}

/** 배출구 — 오른쪽 세로 통로와 받이. */
function paintChute(c: CanvasRenderingContext2D, kit: DrawKit, p: Palette): void {
  const w = CHUTE_R - CHUTE_L

  /*
    ⚠ 통로는 **구멍**이지 기둥이 아니다. 검정 0.30 으로는 유리창의 밝은 면 위에서 "회색
      기둥" 으로 보였다(확대 실측). 구멍으로 읽히려면 주변보다 확실히 어두워야 한다.
  */
  c.fillStyle = 'rgba(0,0,0,0.55)'
  c.fillRect(CHUTE_L, GLASS_T + 2, w, GLASS_B - GLASS_T - 4)
  // 입구 쪽이 더 어둡다 — 안으로 들어갈수록 깊어 보인다.
  const depth = c.createLinearGradient(CHUTE_L, 0, CHUTE_R, 0)
  depth.addColorStop(0, 'rgba(0,0,0,0.22)')
  depth.addColorStop(1, 'rgba(0,0,0,0)')
  c.fillStyle = depth
  c.fillRect(CHUTE_L, GLASS_T + 2, w, GLASS_B - GLASS_T - 4)

  // 통로 좌벽. 볼 더미의 오른쪽 한계(`PILE_R`)와 맞닿는다.
  c.fillStyle = p.border
  c.fillRect(CHUTE_L - 2, GLASS_T + 2, 3, GLASS_B - GLASS_T - 4)
  c.fillStyle = 'rgba(255,255,255,0.18)'
  c.fillRect(CHUTE_L - 2, GLASS_T + 2, 1, GLASS_B - GLASS_T - 4)

  // 통로 안쪽 벽의 가로 홈 — 미끄럼틀처럼 읽혀 "여기로 나온다" 가 보인다.
  c.fillStyle = 'rgba(255,255,255,0.11)'
  for (let y = GLASS_T + 22; y < TRAY_Y; y += 22) {
    c.fillRect(CHUTE_L + 4, y, w - 8, 2)
  }

  // 받이 — 볼이 깨지는 자리. 입이 벌어진 모양이라 출구로 읽힌다.
  kit.roundRect(c, CHUTE_L - 2, TRAY_Y + 14, w + 4, 16, 6)
  /*
    ⚠ `surface2` 로 칠했더니 볼 줄 옆에 **흰 막대**처럼 튀었다(실측). 받이는 기계 안쪽
      구멍이라 주변보다 어두워야 출구로 읽힌다.
  */
  c.fillStyle = 'rgba(0,0,0,0.34)'
  c.fill()
  c.lineWidth = 1.5
  c.strokeStyle = p.border
  kit.roundRect(c, CHUTE_L - 2, TRAY_Y + 14, w + 4, 16, 6)
  c.stroke()
  c.fillStyle = 'rgba(255,255,255,0.12)'
  kit.roundRect(c, CHUTE_L + 2, TRAY_Y + 15, w - 4, 2, 1)
  c.fill()
}

/** 조작 패널 — 스피커 그릴 + 버튼이 앉을 테. 버튼 자체는 매 프레임 그린다. */
function paintPanel(c: CanvasRenderingContext2D, kit: DrawKit, p: Palette): void {
  const px = CAB_X + 12
  const pw = CAB_W - 24
  const ph = CAB_H + CAB_Y - PANEL_T - 10

  kit.roundRect(c, px, PANEL_T, pw, ph, 12)
  c.fillStyle = 'rgba(0,0,0,0.22)'
  c.fill()
  c.lineWidth = 1
  c.strokeStyle = 'rgba(255,255,255,0.14)'
  kit.roundRect(c, px, PANEL_T, pw, ph, 12)
  c.stroke()

  /*
    스피커 그릴 — 좌우 두 덩어리. 가운데는 버튼 자리라 비워 둔다.
    ⚠ 이런 자잘한 반복 패턴이 "기계" 를 만든다. 큰 면 하나보다 훨씬 싸게 밀도를 얻는다.
  */
  c.fillStyle = 'rgba(0,0,0,0.26)'
  for (let gx = 0; gx < 2; gx += 1) {
    const ox = gx === 0 ? px + 14 : px + pw - 62
    for (let row = 0; row < 5; row += 1) {
      for (let col = 0; col < 6; col += 1) {
        c.beginPath()
        c.arc(ox + col * 8, PANEL_T + 18 + row * 8, 1.6, 0, Math.PI * 2)
        c.fill()
      }
    }
  }

  // 버튼이 박히는 테. 눌림 애니메이션이 이 테 안에서 일어난다.
  c.fillStyle = 'rgba(0,0,0,0.38)'
  c.beginPath()
  c.arc(BUTTON_CX, BUTTON_CY + 3, BUTTON_R + 7, 0, Math.PI * 2)
  c.fill()
  c.lineWidth = 1.5
  c.strokeStyle = 'rgba(255,255,255,0.16)'
  c.beginPath()
  c.arc(BUTTON_CX, BUTTON_CY + 3, BUTTON_R + 7, 0, Math.PI * 2)
  c.stroke()
}

/* ────────────────────────────────────────────────────────────
 * 동적 요소
 * ──────────────────────────────────────────────────────────── */

/**
 * 도트 램프 — 순차 점멸.
 *
 * ⚠ `reducedMotion` 이면 점멸을 멈추고 **전부 켠다.** 끄면 기계가 고장 난 것처럼 보이고,
 *   깜빡이면 움직임 최소화 약속을 어긴다(계약 "장식과 본체를 가른다").
 * ⚠ `palette.warning` 을 쓰지 않는다. 그 토큰은 **연한 배경 위 경고 글자용**이라 라이트
 *   모드에서 어두운 갈색이다 — 켜진 램프가 갈색 덩어리가 된다. 밝은 주황은 `svc.reco` 다.
 */
export function drawLamps(
  c: CanvasRenderingContext2D,
  p: Palette,
  timeMs: number,
  reducedMotion: boolean,
): void {
  const active = reducedMotion ? -1 : Math.floor(timeMs / 280) % 4
  for (let i = 0; i < 4; i += 1) {
    if (!reducedMotion && i !== active) continue
    const x = lampX(i)
    c.fillStyle = p.svc.reco
    c.beginPath()
    c.arc(x, LAMP_Y, 5, 0, Math.PI * 2)
    c.fill()
    // 발광 대신 얇은 밝은 링. 흐림 그림자를 쓰지 않기 위한 대체다.
    c.lineWidth = 1
    c.strokeStyle = 'rgba(255,255,255,0.55)'
    c.beginPath()
    c.arc(x, LAMP_Y, 7.5, 0, Math.PI * 2)
    c.stroke()
  }
}

/**
 * 전자석 헤드 — **집게를 대체한다**(2026-09-16).
 *
 * ⚠ 집게였을 때는 발톱이 볼 **앞을 덮어** 가리기만 하고 맞물리는 느낌이 없었다(사용자 지적).
 *   자석은 위에서 붙으므로 볼이 통째로 보이고, 접점이 한 점이라 어긋남이 눈에 띄지 않는다.
 *   "잡는 기구를 정교하게 그린다" 가 아니라 **"가리지 않는 기구로 바꾼다"** 가 답이었다.
 *
 * @param power 0~1. 자력 세기. 붙는 순간 1 로 올라가며 자기장 아크가 보인다
 */
export function drawMagnet(
  c: CanvasRenderingContext2D,
  kit: DrawKit,
  p: Palette,
  x: number,
  y: number,
  power: number,
  timeMs: number,
): void {
  const hw = MAG_W / 2
  const hh = MAG_H / 2

  // 케이블 — 레일에서 자석까지. 두 겹이라 두께가 보인다.
  c.fillStyle = p.border
  c.fillRect(x - 3, RAIL_Y, 6, Math.max(0, y - RAIL_Y))
  c.fillStyle = 'rgba(255,255,255,0.28)'
  c.fillRect(x - 3, RAIL_Y, 1.6, Math.max(0, y - RAIL_Y))

  // 레일 위를 구르는 대차.
  kit.roundRect(c, x - 14, RAIL_Y - 9, 28, 13, 4)
  c.fillStyle = p.textMuted
  c.fill()
  c.fillStyle = 'rgba(255,255,255,0.30)'
  c.fillRect(x - 12, RAIL_Y - 8, 24, 1.5)

  // 자석 몸체 — 위는 금속, 아래 면이 접촉면이다.
  kit.roundRect(c, x - hw, y - hh, MAG_W, MAG_H, 6)
  c.fillStyle = p.textMuted
  c.fill()

  const body = c.createLinearGradient(0, y - hh, 0, y + hh)
  body.addColorStop(0, 'rgba(255,255,255,0.38)')
  body.addColorStop(0.5, 'rgba(255,255,255,0)')
  body.addColorStop(1, 'rgba(0,0,0,0.30)')
  kit.roundRect(c, x - hw, y - hh, MAG_W, MAG_H, 6)
  c.fillStyle = body
  c.fill()

  // 코일 — 가로 줄 셋. 전자석으로 읽히게 하는 가장 싼 신호다.
  c.fillStyle = 'rgba(0,0,0,0.22)'
  for (let i = 0; i < 3; i += 1) {
    c.fillRect(x - hw + 5, y - hh + 6 + i * 5, MAG_W - 10, 2)
  }

  // 접촉면 — 켜지면 accent 로 물든다. 지금 자력이 흐르는지가 한눈에 보인다.
  const padOn = power > 0.02
  kit.roundRect(c, x - hw + 3, y + hh - 5, MAG_W - 6, 5, 2)
  c.fillStyle = padOn ? p.svc.play : 'rgba(0,0,0,0.35)'
  c.globalAlpha = padOn ? 0.4 + power * 0.6 : 1
  c.fill()
  c.globalAlpha = 1

  kit.roundRect(c, x - hw, y - hh, MAG_W, MAG_H, 6)
  c.lineWidth = 1
  c.strokeStyle = 'rgba(0,0,0,0.30)'
  c.stroke()

  /*
    자기장 아크 — 접촉면 아래로 퍼지는 호 두 개.
    ⚠ `power` 가 0 이면 아무것도 그리지 않는다. 항상 켜 두면 "지금 붙는 중" 이라는 신호가
      죽어 버린다.
  */
  if (power <= 0.02) return
  c.save()
  c.strokeStyle = p.svc.play
  c.lineWidth = 2
  for (let i = 0; i < 2; i += 1) {
    const t = ((timeMs / 380 + i * 0.5) % 1)
    const r = 10 + t * 16
    c.globalAlpha = power * (1 - t) * 0.7
    c.beginPath()
    c.arc(x, y + hh - 2, r, Math.PI * 0.12, Math.PI * 0.88)
    c.stroke()
  }
  c.restore()
}

/**
 * 동물 볼 — **번호가 없다.**
 *
 * ⚠ 번호를 그리지 않는 것이 이 게임의 규칙이다(은닉형). 번호는 볼이 깨진 뒤에야
 *   `kit.ball()` 로 나온다. 여기에 숫자를 그리면 계약의 은닉형 근거가 무너진다.
 * ⚠ **꽝 볼도 똑같이 그린다.** 겉으로 구분되면 집기 전에 알게 되어 재미가 사라진다.
 */
export function drawAnimalBall(
  c: CanvasRenderingContext2D,
  kit: DrawKit,
  p: Palette,
  x: number,
  y: number,
  kind: number,
  grounded: boolean,
  squash = 0,
): void {
  const animal = ANIMALS[kind % ANIMALS.length]
  const hue = p.svc[animal.svc]
  const rx = BALL_R * (1 + squash * 0.16)
  const ry = BALL_R * (1 - squash * 0.16)

  if (grounded) kit.softShadow(c, x, y + ry * 0.94, rx * 0.86, ry * 0.26, 0.18)

  // 귀는 머리 **뒤**에 그린다. 앞에 그리면 얼굴을 덮는다.
  c.save()
  c.fillStyle = hue
  drawEars(c, x, y, rx, ry, animal.ear)

  c.beginPath()
  c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
  c.fill()

  // 좌상단 광원(규칙 3).
  const hl = c.createRadialGradient(
    x - rx * 0.35,
    y - ry * 0.35,
    0,
    x - rx * 0.35,
    y - ry * 0.35,
    rx * 1.1,
  )
  hl.addColorStop(0, 'rgba(255,255,255,0.45)')
  hl.addColorStop(1, 'rgba(255,255,255,0)')
  c.fillStyle = hl
  c.beginPath()
  c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
  c.fill()

  // 주둥이 — 흰 타원. 어떤 색 위에서도 얼굴이 읽히게 하는 장치다.
  c.fillStyle = 'rgba(255,255,255,0.92)'
  c.beginPath()
  c.ellipse(x, y + ry * 0.26, rx * 0.52, ry * 0.36, 0, 0, Math.PI * 2)
  c.fill()

  c.fillStyle = 'rgba(0,0,0,0.78)'
  for (let s = -1; s <= 1; s += 2) {
    c.beginPath()
    c.arc(x + s * rx * 0.32, y - ry * 0.14, rx * 0.11, 0, Math.PI * 2)
    c.fill()
  }

  if (animal.ear === 'beak') {
    // 병아리는 코 대신 부리. 색으로만 구분하지 않기 위한 형태 차이다.
    c.fillStyle = p.svc.reco
    c.beginPath()
    c.moveTo(x, y + ry * 0.1)
    c.lineTo(x - rx * 0.17, y + ry * 0.32)
    c.lineTo(x + rx * 0.17, y + ry * 0.32)
    c.closePath()
    c.fill()
  } else {
    c.fillStyle = 'rgba(0,0,0,0.72)'
    c.beginPath()
    c.ellipse(x, y + ry * 0.16, rx * 0.11, ry * 0.08, 0, 0, Math.PI * 2)
    c.fill()
  }

  c.lineWidth = 1
  c.strokeStyle = 'rgba(0,0,0,0.20)'
  c.beginPath()
  c.ellipse(x, y, rx - 0.5, ry - 0.5, 0, 0, Math.PI * 2)
  c.stroke()
  c.restore()
}

/** 귀 — 종마다 형태가 다르다. **색만으로 구분하지 않기 위한** 두 번째 단서다. */
function drawEars(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  ear: EarKind,
): void {
  if (ear === 'beak') return
  for (let s = -1; s <= 1; s += 2) {
    const ex = x + s * rx * 0.62
    c.beginPath()
    if (ear === 'pointy') {
      c.moveTo(ex - rx * 0.26, y - ry * 0.55)
      c.lineTo(ex + s * rx * 0.1, y - ry * 1.32)
      c.lineTo(ex + rx * 0.26, y - ry * 0.5)
      c.closePath()
    } else if (ear === 'long') {
      c.ellipse(ex, y - ry * 1.0, rx * 0.19, ry * 0.62, s * 0.18, 0, Math.PI * 2)
    } else if (ear === 'floppy') {
      c.ellipse(ex + s * rx * 0.1, y - ry * 0.28, rx * 0.24, ry * 0.46, s * 0.35, 0, Math.PI * 2)
    } else {
      c.arc(ex, y - ry * 0.68, rx * 0.28, 0, Math.PI * 2)
    }
    c.fill()
  }
}

/**
 * 빨간 누름 버튼 — **장식이 아니라 진짜 어포던스**.
 *
 * 캔버스 어디를 눌러도 `primary` 가 들어오지만(계약: 입력 절), 무엇을 눌러야 하는지 보이는
 * 것과 보이지 않는 것은 완전히 다른 게임이다. 라벨이 다음에 할 일을 말한다.
 *
 * @param press 0~1. 눌림 정도. 반응이 없으면 눌렸는지 알 수 없다.
 */
export function drawButton(
  c: CanvasRenderingContext2D,
  kit: DrawKit,
  p: Palette,
  label: string,
  enabled: boolean,
  press: number,
): void {
  const cy = BUTTON_CY + press * 3

  c.save()
  c.globalAlpha = enabled ? 1 : 0.45

  // 눌리면 그림자가 줄어든다 — 버튼이 테에 가까워졌다는 신호.
  kit.softShadow(c, BUTTON_CX, BUTTON_CY + BUTTON_R + 4, BUTTON_R * 0.8, 5 - press * 2.5, 0.3)

  c.fillStyle = p.danger
  c.beginPath()
  c.arc(BUTTON_CX, cy, BUTTON_R, 0, Math.PI * 2)
  c.fill()

  const hl = c.createRadialGradient(
    BUTTON_CX - BUTTON_R * 0.3,
    cy - BUTTON_R * 0.4,
    0,
    BUTTON_CX - BUTTON_R * 0.3,
    cy - BUTTON_R * 0.4,
    BUTTON_R * 1.2,
  )
  hl.addColorStop(0, `rgba(255,255,255,${0.5 - press * 0.25})`)
  hl.addColorStop(1, 'rgba(255,255,255,0)')
  c.fillStyle = hl
  c.beginPath()
  c.arc(BUTTON_CX, cy, BUTTON_R, 0, Math.PI * 2)
  c.fill()

  c.lineWidth = 2
  c.strokeStyle = 'rgba(0,0,0,0.28)'
  c.beginPath()
  c.arc(BUTTON_CX, cy, BUTTON_R - 1, 0, Math.PI * 2)
  c.stroke()

  kit.text(c, label, BUTTON_CX, cy + 1, { size: 18, weight: 800, color: p.onAccent })
  c.restore()
}

/**
 * 남은 기회 — 점 아홉 개.
 *
 * ⚠ 숫자만 쓰지 않고 점으로도 그린다. 남은 양이 **한눈에** 보여야 "이번엔 신중히" 가 된다.
 * ⚠ 자리는 **유리창 안 "레일 위" 띠**다. 조작 패널에 두면 빨간 버튼 라벨과 겹친다.
 */
export function drawAttempts(
  c: CanvasRenderingContext2D,
  kit: DrawKit,
  p: Palette,
  used: number,
  total: number,
): void {
  const left = Math.max(0, total - used)
  const gap = 10

  kit.text(c, '기회', GAUGE_X, GAUGE_Y, {
    size: 10,
    weight: 700,
    align: 'left',
    color: p.textMuted,
  })

  for (let i = 0; i < total; i += 1) {
    const on = i < left
    const x = GAUGE_X + 27 + i * gap
    c.fillStyle = on ? p.svc.reco : 'rgba(128,128,128,0.28)'
    c.beginPath()
    c.arc(x, GAUGE_Y, 3.5, 0, Math.PI * 2)
    c.fill()
    if (!on) continue
    // 켜진 점에만 얇은 테. 색만으로 남은 개수를 전하지 않기 위한 두 번째 단서다.
    c.lineWidth = 1
    c.strokeStyle = 'rgba(0,0,0,0.25)'
    c.beginPath()
    c.arc(x, GAUGE_Y, 3.5, 0, Math.PI * 2)
    c.stroke()
  }
}

/**
 * 꽝 — **번호 공개보다 크고 길게 그린다.**
 *
 * ⚠ G01 이 먼저 겪은 교훈 둘을 그대로 따른다.
 *   ① *"꽝인지 뭔지 확인이 안 돼"* — 작게 지나가면 무슨 일이 났는지 모른다. 크게, 길게.
 *   ② *"연출은 그리기 순서가 곧 가독성이다"* — 파티클·조준선보다 **맨 마지막에** 그린다.
 *      호출부에서 순서를 지킨다.
 *
 * @param t 0~1 진행도
 */
export function drawBlank(
  c: CanvasRenderingContext2D,
  kit: DrawKit,
  p: Palette,
  x: number,
  y: number,
  t: number,
  reducedMotion: boolean,
): void {
  const grow = reducedMotion ? 1 : 0.5 + kit.easeOutCubic(Math.min(1, t * 2.6)) * 0.5
  const rise = reducedMotion ? 0 : kit.easeOutCubic(t) * 26
  const alpha = t < 0.12 ? t / 0.12 : 1 - kit.easeOutCubic(Math.max(0, (t - 0.55) / 0.45))

  const cx = x
  const cy = y - 34 - rise
  const r = 26 * grow

  c.save()
  c.globalAlpha = kit.clamp(alpha, 0, 1)

  // 터진 자국 — 톱니 원. 번호 볼의 매끈한 원과 **형태가 달라야** 한눈에 구분된다.
  c.beginPath()
  for (let i = 0; i < 16; i += 1) {
    const a = (i / 16) * Math.PI * 2
    const rr = i % 2 === 0 ? r : r * 0.72
    const px = cx + Math.cos(a) * rr
    const py = cy + Math.sin(a) * rr
    if (i === 0) c.moveTo(px, py)
    else c.lineTo(px, py)
  }
  c.closePath()
  c.fillStyle = p.surface2
  c.fill()
  c.lineWidth = 2.5
  c.strokeStyle = p.danger
  c.stroke()

  kit.text(c, '꽝', cx, cy + 1, {
    size: r * 0.86,
    weight: 800,
    color: p.danger,
  })
  c.restore()
}
