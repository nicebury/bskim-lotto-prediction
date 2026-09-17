import type { DrawKit, Palette, Rng, StageSize } from '@/games/core/types'

/**
 * G01 오리 사격장 — 무대 배경과 고정 구조물.
 *
 * → 사양서: docs/wiki/20-design/game-g01-shooting.md
 * → 계약:   docs/wiki/10-contracts/playground-game-contract.md
 *
 * ── 이 파일이 하는 일 ──────────────────────────────────────────────
 * 매 프레임 다시 계산할 필요가 없는 것들 — 야시장 실루엣, 천막 차양, 전구 줄, 트로피 선반,
 * 컨베이어, 나무 카운터. 오리와 조준선은 `duck.ts`, 게임 규칙은 `index.ts` 에 있다.
 *
 * ⚠ 실루엣은 **오프스크린 캔버스에 한 번 그려 캐시**한다(시각 언어 규칙 1). 사각형 다섯 개와
 *   삼각형 세 개를 매 프레임 다시 칠하면 그것만으로 저사양 기기의 예산을 먹는다.
 * ⚠ 캐시는 논리 좌표의 **2배 해상도**로 만들고 그릴 때 줄인다. 논리 크기 그대로 만들면
 *   고해상도 화면에서 실루엣 가장자리만 뭉개져 보인다. 화면 배율을 직접 읽지 않고도
 *   해상도를 확보하는 방법이다(계약: 게임은 화면 배율을 모른다 — 그 처리는 호스트 몫이다).
 */

/* ────────────────────────────────────────────────────────────
 * 레이아웃 — 모든 좌표의 단일 출처
 *
 * ⚠ 이 값들은 논리 좌표(360×440)다. 화면 크기와 무관하다.
 *
 * ── ★ 2026-09-16 무대를 560 → 440 으로 줄였다 ─────────────────────
 * 계약이 *"`stage.height` 는 420~450 안에서 끝낸다"* 를 정한 뒤로 이 무대만 560 으로 남아
 * 있었다. 그 규칙은 취향이 아니라 **세로가 길수록 모바일에서 가로가 좁아지기 때문**이다 —
 * 호스트가 높이를 `100svh - 화면에서 게임이 아닌 것들` 로 먼저 제한하고, 남은 높이에
 * `aspect-ratio` 를 곱해 폭을 정한다. 390×760 실측 기준:
 *
 *   560 → 폭 301px        440 → 폭 383px  (+27%)
 *
 * 조준 게임에서 화면 폭은 곧 조작 정밀도다. 히트박스(가로 반경 22px)와 흔들림(±4.5px)이
 * 논리 좌표로 고정돼 있으므로, 화면이 좁을수록 **같은 22px 을 더 적은 실제 픽셀로 겨눠야**
 * 한다. 여섯 게임 중 조준이 가장 정밀한 이 게임이 가장 좁은 화면을 쓰고 있었다.
 *
 * ── 120px 을 어디서 뺐는가 ─────────────────────────────────────────
 *   · 레인 간격 80 → 72  (2칸 = 16px)     · 상단 차양·선반을 10px 위로
 *   · 카운터 112 → 80    (32px)           · 벨트 두께 34 → 29 (레인당 5px)
 * 오리 크기·점프 높이·레인 속도는 **한 값도 건드리지 않았다.** 그것들을 만지면 난이도가
 * 함께 바뀌어 "무대만 줄였다" 가 아니게 된다. 실측으로 맞춰 둔 완주율(여섯 판 중 세 판)이
 * 그대로 유지되어야 한다.
 *
 * ⚠ **레인 간격 72 는 점프 높이 24 에서 나온 하한이다.** 아래 레인 오리가 뛰어오른 상단과
 *   위 레인 벨트 하단 사이가 정확히 1px 이다(165+17+12 = 194 vs 237−3−24−15 = 195).
 *   간격을 더 줄이거나 점프를 더 높이면 **뛰는 오리가 위 벨트를 뚫고 올라간다.**
 *   둘 중 하나를 바꾸려면 나머지 하나를 함께 계산한다.
 * ──────────────────────────────────────────────────────────── */

/**
 * 컨베이어 3줄의 중심 y. 간격 72px.
 *
 * ⚠ 사양서의 `[175, 255, 335]`(간격 80)에서 무대 축소에 맞춰 내렸다. 간격 하한의 근거는
 *   위 블록 주석 참조 — 점프 높이와 벨트 두께가 함께 걸린 값이다.
 */
export const LANE_Y = [165, 237, 309] as const
/**
 * 레인별 초기 속도(px/s). 위에서 아래로 빨라진다.
 *
 * ⚠ 사양서의 `[46, 62, 78]` 에서 **20% 올린 뒤(2026-09-08) 다시 5% 더 올렸다**(2026-09-16).
 *   두 번 다 "조금 더 빨랐으면" 이라는 사용자 요청이다. 누적 +26%.
 *   여기에 랜덤 점프(→ `duck.ts` 의 `jumpT`)가 더해져 가만히 기다리기만 하는 전략이 통하지
 *   않는다.
 * ⚠ 더 올리기 전에 완주율을 재 본다. +20% 시점에 이미 "하나 모자라서 실패" 가 반복돼
 *   빗나감 벌칙을 낮춰야 했다(→ [[game-g01-shooting]] 실측).
 */
export const LANE_SPEED = [58, 78, 99] as const
/** 레인별 진행 방향. 교대로 두어야 화면이 한쪽으로 흐르지 않는다. */
export const LANE_DIR = [1, -1, 1] as const

/** 오리가 사라지고 다시 나타나는 경계. 화면 밖 40px. */
export const WRAP_LEFT = -40
export const WRAP_RIGHT = 400
export const WRAP_SPAN = WRAP_RIGHT - WRAP_LEFT

/**
 * 트로피 선반 — 맞힌 오리가 올라가 번호를 공개하는 자리.
 *
 * ⚠ 가로(`X0`·`GAP`·`R`)는 무대 축소와 무관하다. 줄어든 것은 세로뿐이라 여섯 칸의 배치는
 *   그대로 둔다 — 볼 반지름을 줄이면 번호가 작아져 읽기 어려워진다.
 */
export const SHELF_CY = 76
export const SHELF_X0 = 50
export const SHELF_GAP = 52
export const SHELF_R = 15

/** 선반 판자 윗면. 볼이 이 위에 앉은 것처럼 보이게 그림자를 여기에 깐다. */
const SHELF_PLANK_Y = 94

/**
 * 나무 카운터 윗면. 야시장 실루엣의 지평선이기도 하다.
 *
 * ⚠ 무대 440 에서 카운터는 **80px** 이다(560 시절 112px). 여기에 탄피 열두 개 줄(18px)과
 *   글자 한 줄이 들어가야 하므로 더 줄일 수 없다 — `drawAmmo` 의 오프셋이 이 높이에
 *   맞춰져 있다.
 */
export const COUNTER_Y = 360

/** 조준선이 움직일 수 있는 범위. 선반과 카운터를 침범하지 않는다. */
export const AIM_MIN_X = 24
export const AIM_MAX_X = 336
/*
  ⚠ 오리가 점프하면 레인 중심보다 위로 올라간다. 맨 윗줄(165) 기준으로
    165 - 흔들림 3 - 점프 24 = 138 까지 올라가므로, 조준 상한을 그보다 위에 둬야
    **점프한 오리를 조준할 수 없는 구간**이 생기지 않는다.
  ⚠ 하한은 맨 아랫줄 오리의 배(309 + 3 + 15 = 327)보다 넉넉히 아래여야 한다. 동시에
    카운터(360)를 넘지 않아야 조준점 **중심**이 나무판으로 내려가지 않는다.
  ⚠ 다만 십자선은 중심에서 20px(반지름 14 + 팔 6)까지 뻗으므로, 하한까지 내리면 **팔 끝이
    카운터에 걸친다**(348 + 20 = 368). 무대를 560 에서 줄이며 생긴 현상이고 그대로 둔다 —
    조준점은 맨 마지막에 그려져 가려지지 않고, 겹침을 없애려면 하한을 331 까지 올려야 하는데
    그러면 맨 아랫줄 오리의 아래쪽을 겨눌 여유가 사라진다. **시각 문제를 고치려다 조작을
    좁히는 쪽이 더 나쁘다.**
*/
export const AIM_MIN_Y = 130
export const AIM_MAX_Y = 348

/** 선반 슬롯 i 의 중심 x. */
export function shelfX(slot: number): number {
  return SHELF_X0 + slot * SHELF_GAP
}

/* ────────────────────────────────────────────────────────────
 * 배경 실루엣 캐시
 * ──────────────────────────────────────────────────────────── */

/** 캐시 해상도 배율. 2배면 대부분의 화면에서 충분히 또렷하다. */
const CACHE_SCALE = 2
/** 패럴랙스 여유. 조준선을 끝까지 밀어도 캔버스 밖이 드러나지 않게 좌우로 넓힌다. */
const CACHE_PAD = 24

/**
 * 오프스크린 레이어 한 장.
 *
 * ⚠ 논리 좌표의 **2배 해상도**로 만들고 그릴 때 줄인다. 논리 크기 그대로 만들면 고해상도
 *   화면에서 실루엣 가장자리만 뭉개져 보인다. 화면 배율을 직접 읽지 않고도 해상도를
 *   확보하는 방법이다(계약: 게임은 화면 배율을 모른다 — 그 처리는 호스트 몫이다).
 * ⚠ 서버 렌더에서는 `document` 가 없다. `null` 을 돌려주고 호출부가 실루엣 없이 그린다 —
 *   배경이 한 겹 빠질 뿐 게임은 그대로 돈다.
 */
function makeLayer(
  width: number,
  height: number,
): { cv: HTMLCanvasElement; c: CanvasRenderingContext2D } | null {
  if (typeof document === 'undefined') return null
  const cv = document.createElement('canvas')
  cv.width = Math.round(width * CACHE_SCALE)
  cv.height = Math.round(height * CACHE_SCALE)
  const c = cv.getContext('2d')
  if (c === null) return null
  c.setTransform(CACHE_SCALE, 0, 0, CACHE_SCALE, 0, 0)
  return { cv, c }
}

export interface SceneCache {
  /** 먼 층(건물). 조준선을 따라 아주 조금만 움직인다. */
  far: HTMLCanvasElement | null
  /** 가까운 층(천막). 먼 층보다 두 배 크게 움직인다. */
  near: HTMLCanvasElement | null
  /** 색이 바뀌면(테마 전환) 다시 구워야 한다. 그 판정용 키. */
  key: string
}

/**
 * 실루엣의 **형태**만 담는다. 색은 굽는 시점에 정해진다.
 *
 * ⚠ 형태와 색을 갈라 둔 이유가 있다. 테마를 바꾸면 캐시를 다시 구워야 하는데, 그때 난수를
 *   또 돌리면 **스카이라인이 통째로 바뀐다** — 사용자에게는 다크모드를 켰더니 배경이 다른
 *   동네가 된 것으로 보인다. 형태를 한 번만 뽑아 두고 색만 갈아 끼운다.
 */
export interface SkylineShape {
  readonly width: number
  readonly height: number
  readonly buildings: readonly { x: number; y: number; w: number; h: number }[]
  readonly tents: readonly { cx: number; w: number; h: number }[]
  readonly stalls: readonly { x: number; w: number }[]
}

/**
 * 야시장 실루엣의 형태를 뽑는다.
 *
 * ⚠ **여기 넘기는 난수는 반드시 `rng.fork()` 로 받은 것이어야 한다.** 물리와 같은 스트림을
 *   쓰면 배경이 난수를 소비해 같은 시드로도 게임 결과가 달라진다(계약: 재현성).
 */
export function buildSkyline(stage: StageSize, bgRng: Rng): SkylineShape {
  const width = stage.width + CACHE_PAD * 2
  const height = COUNTER_Y

  /*
    ⚠ **건물 높이는 지평선(`COUNTER_Y`)과 함께 내려야 한다.** 무대를 560 → 440 으로 줄이면서
      지평선이 448 → 360 으로 88px 올라왔는데, 높이를 그대로 두었더니 **실루엣이 컨베이어
      한가운데까지 치솟아** 오리·벨트와 겹쳐 화면이 어지러웠다(실측에서 눈으로 잡았다).
      배경은 뒤에 물러나 있어야 조준 대상이 먼저 읽힌다.
      축소 비율(440/560 ≈ 0.79)을 그대로 곱해 60~138 → 46~108 로 낮췄다. 그러면 실루엣
      꼭대기가 다시 맨 아랫줄 레인 근처에 서서, 줄이기 전과 같은 깊이감이 된다.
  */
  const buildings: { x: number; y: number; w: number; h: number }[] = []
  for (let i = 0; i < 5; i += 1) {
    const w = 46 + bgRng.range(0, 34)
    const h = 46 + bgRng.range(0, 62)
    const x = i * ((width - 40) / 5) + bgRng.range(0, 18)
    buildings.push({ x, y: height - h, w, h })
  }

  const tents: { cx: number; w: number; h: number }[] = []
  for (let i = 0; i < 3; i += 1) {
    tents.push({
      cx: 60 + i * ((width - 120) / 2),
      w: 54 + bgRng.range(0, 22),
      // 천막도 같은 비율로 낮춘다. 건물만 낮추면 천막이 건물보다 높아진다.
      h: 27 + bgRng.range(0, 16),
    })
  }

  const stalls: { x: number; w: number }[] = []
  for (let i = 0; i < 2; i += 1) stalls.push({ x: 20 + i * (width - 90), w: 46 })

  return { width, height, buildings, tents, stalls }
}

/** 테마가 바뀌었는지. 바뀌었으면 호출부가 다시 굽는다. */
export function sceneKey(palette: Palette): string {
  return `${palette.text}|${palette.svc.reco}`
}

/**
 * 형태 + 현재 팔레트 → 오프스크린 캔버스 두 장.
 *
 * 실루엣은 **색이 아니라 형태**로 읽힌다. 그래서 팔레트의 본문색을 낮은 알파로 쓴다 —
 * 다크모드에서는 본문색이 밝은 쪽으로 뒤집히므로 실루엣도 저절로 따라간다.
 */
export function bakeScene(shape: SkylineShape, palette: Palette): SceneCache {
  const key = sceneKey(palette)
  const farLayer = makeLayer(shape.width, shape.height)
  const nearLayer = makeLayer(shape.width, shape.height)
  if (farLayer === null || nearLayer === null) return { far: null, near: null, key }

  const far = farLayer.c
  far.fillStyle = palette.text
  for (const b of shape.buildings) {
    far.globalAlpha = 0.12
    far.fillRect(b.x, b.y, b.w, b.h)
    // 창문 두 줄. 형태만으로 건물임을 알리는 최소한의 디테일이다.
    far.globalAlpha = 0.06
    for (let r = 0; r < 2; r += 1) {
      for (let q = 0; q < 3; q += 1) {
        far.fillRect(b.x + 8 + q * 13, b.y + 14 + r * 18, 7, 9)
      }
    }
  }

  const near = nearLayer.c
  near.globalAlpha = 0.18
  near.fillStyle = palette.text
  const base = shape.height
  for (const t of shape.tents) {
    near.beginPath()
    near.moveTo(t.cx, base - 30 - t.h)
    near.lineTo(t.cx - t.w / 2, base - 30)
    near.lineTo(t.cx + t.w / 2, base - 30)
    near.closePath()
    near.fill()
    near.fillRect(t.cx - t.w / 2 + 6, base - 30, t.w - 12, 30)
  }
  for (const st of shape.stalls) near.fillRect(st.x, base - 44, st.w, 44)

  return { far: farLayer.cv, near: nearLayer.cv, key }
}

/**
 * 배경 세 층을 그린다 — 그라디언트 · 실루엣 2겹 · 비네트.
 *
 * @param aimShift 조준선의 중심 이탈량(px). 실루엣이 반대로 밀려 깊이가 생긴다.
 *                 움직임 최소화가 켜져 있으면 호출부가 0 을 넘긴다.
 */
export function drawBackdrop(
  c: CanvasRenderingContext2D,
  draw: DrawKit,
  stage: StageSize,
  palette: Palette,
  cache: SceneCache,
  aimShift: number,
): void {
  draw.bgGradient(c, stage, palette.surface2, palette.bg)

  if (cache.far !== null) {
    c.drawImage(cache.far, -CACHE_PAD - aimShift * 0.02, 0, stage.width + CACHE_PAD * 2, COUNTER_Y)
  }
  if (cache.near !== null) {
    c.drawImage(cache.near, -CACHE_PAD - aimShift * 0.045, 0, stage.width + CACHE_PAD * 2, COUNTER_Y)
  }

  draw.vignette(c, stage, 0.16)
}

/* ────────────────────────────────────────────────────────────
 * 천막 차양 · 전구 줄 · 트로피 선반
 * ──────────────────────────────────────────────────────────── */

/**
 * 차양 높이. 몸통은 `AWNING_H - 8` 까지 채우고 그 아래 타원 호가 12px 더 내려온다.
 *
 * ⚠ 무대 축소로 44 → 36 이 됐다. 차양 하단(28 + 12 = 40)과 전구 줄(48) 사이 8px 은
 *   줄이기 전과 같다 — **전구가 차양 뒤로 숨는 것**은 한 번 겪은 문제라 그 간격을 유지했다.
 */
const AWNING_H = 36
const SCALLOPS = 8
const BULB_COUNT = 12
const BULB_Y = 48

/**
 * 상단 20% — 차양 + 전구 + 선반.
 *
 * @param lowQuality 워치독이 품질을 내렸으면 전구 점멸을 끈다. 12개의 원을 매 프레임 다시
 *                   칠하는 비용은 작지만, 프레임을 잃는 기기에서는 그 작은 것부터 끈다.
 */
export function drawStand(
  c: CanvasRenderingContext2D,
  draw: DrawKit,
  stage: StageSize,
  palette: Palette,
  timeMs: number,
  lowQuality: boolean,
): void {
  const w = stage.width

  // 차양 몸통.
  c.fillStyle = palette.surface
  c.fillRect(0, 0, w, AWNING_H - 8)

  /*
    반원 여덟 개를 --svc-reco 와 흰색으로 교대한다. 사양서가 지정한 형태다.
    ⚠ 흰색을 hex 로 박지 않는다 — palette.surface 가 다크모드에서 어두운 판으로 뒤집혀야
      차양이 배경에 묻히지 않는다.
  */
  const sw = w / SCALLOPS
  for (let i = 0; i < SCALLOPS; i += 1) {
    c.fillStyle = i % 2 === 0 ? palette.svc.reco : palette.surface
    c.beginPath()
    c.moveTo(i * sw, 0)
    c.lineTo((i + 1) * sw, 0)
    c.lineTo((i + 1) * sw, AWNING_H - 8)
    /*
      ⚠ 반원(`arc`)이 아니라 **납작한 타원 호**다. 반원이면 반지름이 22.5px 이 되어 아래
        전구 줄(y=56)까지 덮는다 — 실제로 전구가 차양 뒤로 숨었다. 세로 반경을 12로 눌러
        차양이 y=48 에서 끝나게 한다.
    */
    c.ellipse(i * sw + sw / 2, AWNING_H - 8, sw / 2, 12, 0, 0, Math.PI)
    c.closePath()
    c.fill()
    /*
      흰 스캘럽은 바탕과 같은 색이라 형태가 사라진다. 얇은 테두리를 둘러 여덟 개가 모두
      읽히게 한다 — 차양이 네 개짜리 널빤지로 보이던 문제.
    */
    if (i % 2 === 1) {
      /*
        ⚠ **테두리만으로는 부족했다.** 여기 원래 α0.35 테두리 한 줄이 있었는데, 실측에서
          라이트 모드의 차양은 여전히 **주황 블록 네 개**로 보였다 — 흰 스캘럽이 흰 배경에
          그대로 묻혀 "여덟 개가 교대하는 천막" 이 되지 않는다.
        그래서 아주 옅은 주황을 덧칠해 **연주황 ↔ 진주황 교대**로 만든다. 흰색을 포기하는
        것이 아니라, 흰 판(`surface`) 위에 α0.1 을 얹어 배경과 구분되는 최소한만 준다.
        테두리도 함께 진하게 해 형태가 먼저 읽히게 한다.
      */
      c.globalAlpha = 0.1
      c.fillStyle = palette.svc.reco
      c.fill()
      c.globalAlpha = 0.55
      c.strokeStyle = palette.border
      c.lineWidth = 1.5
      c.stroke()
      c.globalAlpha = 1
    }
  }

  // 차양 아래 그늘. 얇은 띠 하나로 차양이 앞에 있다는 느낌을 만든다.
  c.globalAlpha = 0.1
  c.fillStyle = palette.text
  c.fillRect(0, AWNING_H - 8, w, 6)
  c.globalAlpha = 1

  // 전구 줄. 순차 점멸이라 시간을 인덱스로 나눠 위상을 준다.
  for (let i = 0; i < BULB_COUNT; i += 1) {
    const bx = (w / BULB_COUNT) * (i + 0.5)
    const phase = lowQuality ? 1 : 0.55 + 0.45 * Math.sin(timeMs / 260 - i * 0.55)
    c.globalAlpha = 0.35 + phase * 0.65
    c.fillStyle = palette.svc.reco
    c.beginPath()
    c.arc(bx, BULB_Y, 3.2, 0, Math.PI * 2)
    c.fill()
  }
  c.globalAlpha = 1

  // 선반 판자. 볼이 얹히는 면이라 위쪽에 밝은 림라이트를 준다(시각 언어 규칙 3).
  draw.roundRect(c, 22, SHELF_PLANK_Y, w - 44, 9, 4)
  c.fillStyle = palette.surface2
  c.fill()
  c.globalAlpha = 0.35
  c.strokeStyle = palette.surface
  c.lineWidth = 1.5
  c.beginPath()
  c.moveTo(26, SHELF_PLANK_Y + 1)
  c.lineTo(w - 26, SHELF_PLANK_Y + 1)
  c.stroke()
  c.globalAlpha = 1
  c.strokeStyle = palette.border
  c.lineWidth = 1
  draw.roundRect(c, 22, SHELF_PLANK_Y, w - 44, 9, 4)
  c.stroke()
}

/* ────────────────────────────────────────────────────────────
 * 컨베이어
 * ──────────────────────────────────────────────────────────── */

/**
 * 벨트 상단이 레인 중심에서 얼마나 아래인가, 그리고 벨트 두께.
 *
 * ⚠ 무대 축소로 20/14 → 17/12 로 얇아졌다. 레인 간격이 80 → 72 로 좁아지면서 **아래 레인의
 *   뛰는 오리가 위 레인 벨트를 뚫고 올라갔기 때문**이다. 벨트 하단을 5px 올려 1px 여유를
 *   만들었다(→ 파일 상단 레이아웃 주석의 계산).
 * ⚠ 접지 그림자(`SHADOW_DY` = 23)가 이 범위 안에 떨어져야 오리가 벨트 위에 선 것으로
 *   읽힌다. 17 ≤ 23 ≤ 29 — 두께를 더 줄이면 그림자가 벨트 밖으로 나간다.
 */
const BELT_DY = 17
const BELT_H = 12

/**
 * 레인 하나의 벨트.
 *
 * 사다리꼴 + 대각선 줄무늬 + 톱니 두 개. 줄무늬가 `offset` 만큼 흘러 벨트가 도는 것처럼
 * 보인다. `offset` 은 레인 속도를 누적한 값이라 **빨라진 레인은 줄무늬도 빨라진다** —
 * 난이도 변화가 눈에 보인다.
 */
export function drawBelt(
  c: CanvasRenderingContext2D,
  stage: StageSize,
  palette: Palette,
  laneIndex: number,
  offset: number,
): void {
  const w = stage.width
  const top = LANE_Y[laneIndex] + BELT_DY
  const bottom = top + BELT_H

  // 사다리꼴. 아래쪽을 좁혀 원근을 만든다.
  c.beginPath()
  c.moveTo(0, top)
  c.lineTo(w, top)
  c.lineTo(w - 8, bottom)
  c.lineTo(8, bottom)
  c.closePath()
  c.fillStyle = palette.surface2
  c.fill()

  // 대각선 줄무늬. 벨트 밖으로 새지 않게 잘라낸다.
  c.save()
  c.clip()
  c.globalAlpha = 0.5
  c.strokeStyle = palette.border
  c.lineWidth = 5
  const step = 18
  const shift = ((offset % step) + step) % step
  for (let x = -BELT_H - step; x < w + BELT_H + step; x += step) {
    c.beginPath()
    c.moveTo(x + shift, bottom)
    c.lineTo(x + shift + BELT_H, top)
    c.stroke()
  }
  c.restore()

  // 상단 림라이트(시각 언어 규칙 3). 광원은 항상 좌상단이다.
  c.globalAlpha = 0.3
  c.strokeStyle = palette.surface
  c.lineWidth = 1.5
  c.beginPath()
  c.moveTo(1, top + 1)
  c.lineTo(w - 1, top + 1)
  c.stroke()
  c.globalAlpha = 1

  c.strokeStyle = palette.border
  c.lineWidth = 1
  c.beginPath()
  c.moveTo(0, top)
  c.lineTo(w, top)
  c.moveTo(8, bottom)
  c.lineTo(w - 8, bottom)
  c.stroke()

  // 양 끝 톱니. 벨트 이동량을 각도로 바꿔 함께 돈다.
  const gearR = 9
  const gearY = (top + bottom) / 2
  for (const gx of [16, w - 16]) {
    c.save()
    c.translate(gx, gearY)
    c.rotate(offset / gearR)
    /*
      ⚠ 원반을 `--color-border` 로 칠하면 벨트와 같은 밝기라 바큇살만 남아 눈꽃처럼 보인다.
        보조 텍스트색을 낮은 알파로 깔아 원반이 먼저 읽히게 한다.
    */
    c.globalAlpha = 0.45
    c.fillStyle = palette.textMuted
    c.beginPath()
    c.arc(0, 0, gearR, 0, Math.PI * 2)
    c.fill()
    c.globalAlpha = 1
    c.strokeStyle = palette.surface
    c.lineWidth = 2
    for (let i = 0; i < 6; i += 1) {
      const a = (Math.PI / 3) * i
      c.beginPath()
      c.moveTo(Math.cos(a) * 3.5, Math.sin(a) * 3.5)
      c.lineTo(Math.cos(a) * (gearR - 1), Math.sin(a) * (gearR - 1))
      c.stroke()
    }
    // 축. 톱니가 도는 중심이 보여야 회전이 읽힌다.
    c.fillStyle = palette.surface
    c.beginPath()
    c.arc(0, 0, 2.6, 0, Math.PI * 2)
    c.fill()
    c.restore()
  }
}

/* ────────────────────────────────────────────────────────────
 * 나무 카운터 (하단 20%)
 * ──────────────────────────────────────────────────────────── */

/**
 * 카운터 판.
 *
 * ⚠ 나무색을 hex 로 박지 않는다. 팔레트에 갈색이 없으므로 **`--svc-reco`(호박색)를 낮은
 *   알파로 겹쳐** 나무 톤을 만든다. 다크모드에서는 바탕이 어두워져 저절로 짙은 나무가 된다.
 */
export function drawCounter(
  c: CanvasRenderingContext2D,
  stage: StageSize,
  palette: Palette,
): void {
  const w = stage.width
  const h = stage.height - COUNTER_Y

  c.fillStyle = palette.surface
  c.fillRect(0, COUNTER_Y, w, h)
  c.globalAlpha = 0.16
  c.fillStyle = palette.svc.reco
  c.fillRect(0, COUNTER_Y, w, h)
  c.globalAlpha = 1

  /*
    나무 결.
    ⚠ 무대 축소로 카운터가 112 → 80px 이 되면서 **네 줄째가 화면 밖으로 나갔다**(마지막
      줄 y 가 바닥보다 아래였다). 세 줄로 줄이고 간격도 24 → 22 로 좁혔다 — 결은 개수가
      아니라 곡선의 방향으로 읽히므로 세 줄이면 충분하다.
  */
  c.globalAlpha = 0.16
  c.strokeStyle = palette.text
  c.lineWidth = 1
  for (let i = 0; i < 3; i += 1) {
    const y = COUNTER_Y + 16 + i * 22
    c.beginPath()
    c.moveTo(0, y)
    c.bezierCurveTo(w * 0.3, y - 5, w * 0.62, y + 6, w, y - 2)
    c.stroke()
  }
  c.globalAlpha = 1

  // 카운터 앞모서리. 위쪽 밝은 선 + 아래 그늘로 두께를 만든다.
  c.globalAlpha = 0.4
  c.strokeStyle = palette.surface
  c.lineWidth = 2
  c.beginPath()
  c.moveTo(0, COUNTER_Y + 1)
  c.lineTo(w, COUNTER_Y + 1)
  c.stroke()
  c.globalAlpha = 1
  c.strokeStyle = palette.border
  c.lineWidth = 1
  c.beginPath()
  c.moveTo(0, COUNTER_Y)
  c.lineTo(w, COUNTER_Y)
  c.stroke()
}
