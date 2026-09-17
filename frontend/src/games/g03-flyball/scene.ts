import type { DrawKit, Palette, Rng, StageSize } from '@/games/core/types'

import { GROUND_Y, HIT_X, PITCHER_X, PX_PER_M, WORLD_LEN } from './constants'

/**
 * G03 야구장 그리기 — 배경 · 지면 · 거리 눈금 · 타격 존 · 타자 · 투수.
 *
 * → 사양서: docs/wiki/20-design/game-g03-flyball.md "아트 디렉션"
 * → 계약:   docs/wiki/10-contracts/playground-game-contract.md "시각 언어 4대 규칙"
 *
 * ── 이 파일이 따로 있는 이유 ───────────────────────────────────────
 * `index.ts` 는 타이밍 판정과 상태 기계가 본체다. 거기에 구름·관중석·캐릭터 그리기까지
 * 들어가면 "언제 무엇이 일어나는가" 를 읽으려 할 때마다 그리기 코드를 건너뛰어야 한다.
 *
 * ── ⚠ 정적인 것은 오프스크린에 캐시한다(규칙 1) ────────────────────
 * 하늘 그라디언트·비네트는 화면에 고정이라 한 장으로 굽고, 구름·관중석은 **가로로 반복되는
 * 타일** 한 장으로 구워 `drawImage` 만 반복한다.
 *
 * ⚠ 캐시는 **팔레트가 바뀌면 다시 굽는다.** 구운 비트맵은 스스로 색을 바꾸지 못한다.
 *
 * ── ⚠ 캐릭터를 다시 그렸다 (2026-09-17) ───────────────────────────
 * 종전 타자는 **원 하나 + 둥근 사각 하나 + 선 세 개**였고, 작은 화면에서 그것은 사람이
 * 아니라 **색 얼룩**으로 읽혔다(사용자 지적). 사람으로 보이게 하는 것은 정교함이 아니라
 * **결정적 단서 몇 개**다 — 목 · 두 팔 · 신발 · 벨트 · 표정. 아래 `drawBatter` 참조.
 */

/* ── 지면 아래 배치 ─────────────────────────────────────────── */

/** 잔디 띠 두께. 그 아래는 흙과 거리 눈금이다. */
const GRASS_H = 16
/**
 * 거리 눈금 글자의 y.
 *
 * ⚠ `+44` 였을 때 눈금선(`+16~+24`)과 20px 이나 떨어져 **숫자가 흙 한가운데 떠 있었다.**
 *   선과 숫자는 한 덩어리로 읽혀야 한다.
 */
const TICK_TEXT_Y = GROUND_Y + 34
/**
 * 눈금 간격(m).
 *
 * ⚠ 20 → **50**(2026-09-17). 환산이 `px/6` 에서 `px/4` 로 바뀌며 20m 가 80px 밖에 안 돼
 *   화면(360px)에 눈금이 넷씩 들어차고 **숫자가 서로 붙어 읽히지 않았다.** 50m 는 200px 라
 *   한 화면에 한둘이고, 최대 300m 까지 여섯 개면 충분하다.
 */
const TICK_STEP_M = 50

/** 풀 스트로크 간격(월드 px)과 길이. */
const GRASS_STEP = 7
const GRASS_LEN = 5

/** 타일 원본 크기. */
const CLOUD_TILE_W = 240
const CLOUD_TILE_H = 110
const STAND_TILE_W = 180
const STAND_TILE_H = 74

/**
 * 오프스크린 캐시를 굽는 배율의 상·하한.
 *
 * ⚠ 처음엔 **고정 2배**였는데, 호스트가 무대 높이를 화면에 맞추도록 바꾸면서(2026-09-16)
 *   캔버스의 실제 배율이 기기·화면마다 달라졌다. 2배 고정이면 그보다 촘촘한 화면에서
 *   구운 그림만 흐리게 뜬다.
 * ⚠ 기기 픽셀비를 직접 읽으면 계약 위반이다(호스트만 다룬다). 대신 **캔버스에 걸린 변환
 *   행렬**을 읽으면 같은 값을 계약을 지키며 얻는다.
 */
const SS_MIN = 1
const SS_MAX = 3

/**
 * 지금 이 캔버스가 논리 1px 을 몇 실제 픽셀로 그리는가.
 *
 * ⚠ **0.5 단위로 뭉갠다.** 리사이즈 중에는 배율이 매 프레임 미세하게 흔들리는데, 그때마다
 *   다시 구우면 캔버스 세 장을 초당 수십 번 새로 만든다.
 */
function currentScale(c: CanvasRenderingContext2D): number {
  try {
    const a = c.getTransform().a
    if (!Number.isFinite(a) || a <= 0) return 2
    return Math.min(SS_MAX, Math.max(SS_MIN, Math.round(a * 2) / 2))
  } catch {
    return 2
  }
}

/** 구름 두 겹. 빠를수록 가깝다 → 크고 진하다. */
const CLOUD_LAYERS: readonly { speed: number; y: number; scale: number; alpha: number }[] = [
  { speed: 0.12, y: 54, scale: 0.5, alpha: 0.3 },
  { speed: 0.3, y: 104, scale: 0.72, alpha: 0.2 },
]

/** 관중석은 아주 느리게 흐른다 — 멀리 있다. */
const STAND_SPEED = 0.06

/** 캐릭터 확대 배율. 발밑을 고정점으로 삼아 키운다. */
const BATTER_SCALE = 1.28
const PITCHER_SCALE = 1.15

/**
 * 배트 각도(도) — 대기와 휘두른 끝.
 *
 * ⚠ 대기 각도가 −120° 였을 때 배트가 정확히 얼굴을 가로질러 눈을 가렸다. 손 위치와 함께
 *   조정한 값이라 **둘 중 하나만 바꾸면 다시 얼굴을 덮는다.**
 */
const BAT_REST_DEG = -115
const BAT_END_DEG = 65

/** 실루엣 둘레의 어두운 선. 밝은 하늘 위에서 형태가 무너지지 않게 한다. */
const OUTLINE = 'rgba(0,0,0,0.22)'

export interface SceneDeps {
  readonly stage: StageSize
  readonly draw: DrawKit
  /** ⚠ 매 프레임 새로 읽는다. `index.ts` 가 테마 변경을 흡수해 최신 객체를 준다. */
  palette(): Palette
  /** 배경 전용 난수. 물리 스트림을 소비하면 같은 시드로도 결과가 달라진다(계약). */
  readonly bgRng: Rng
  readonly reducedMotion: boolean
  readonly quality: { readonly level: 'high' | 'low' }
}

export interface Scene {
  drawBackdrop(c: CanvasRenderingContext2D, camX: number): void
  /**
   * 잔디·흙·거리 눈금·기준선. 공보다 먼저 그린다.
   * @param glowT 기준선을 넘은 뒤 흐른 시간(초). 작으면 선이 빛난다. 99 면 평상시
   */
  drawField(c: CanvasRenderingContext2D, camX: number, minMeterLine: number, glowT: number): void
  /**
   * ★ 타격 존 — 공이 이 띠 안에 있을 때가 칠 때다.
   * @param half   띠 반폭(월드 px) = 판정 창 × 공 속도
   * @param core   코어 반폭 = 완벽 창 × 공 속도
   * @param alpha  전체 불투명도. 투구 전에는 옅게 둔다
   * @param active 공이 지금 띠 안에 있는가. 밝아진다
   */
  drawZone(
    c: CanvasRenderingContext2D,
    camX: number,
    half: number,
    core: number,
    alpha: number,
    active: boolean,
  ): void
  /** 스윙한 자리 표식. 얼마나 이르거나 늦었는지 보여 준다. */
  drawSwingMark(
    c: CanvasRenderingContext2D,
    camX: number,
    worldX: number,
    fade: number,
    hit: boolean,
  ): void
  /**
   * 타자.
   * @param swing 0~1 스윙 진행도. 범위 밖이면 대기 자세다
   * @param bob   대기 중 위아래 흔들림(px)
   */
  drawBatter(c: CanvasRenderingContext2D, camX: number, swing: number, bob: number): void
  /**
   * 투수.
   * @param wind    0~1 와인드업 진행도. 1 에서 릴리스다
   * @param holding 공을 쥐고 선 대기 자세인가(`set` 단계)
   */
  drawPitcher(c: CanvasRenderingContext2D, camX: number, wind: number, holding: boolean): void
}

function makeCanvas(w: number, h: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null
  const el = document.createElement('canvas')
  el.width = Math.max(1, Math.round(w))
  el.height = Math.max(1, Math.round(h))
  return el
}

export function createScene(deps: SceneDeps): Scene {
  const { stage, draw, bgRng, reducedMotion, quality } = deps

  /*
    풀 스트로크 위치를 미리 뽑아 둔다.
    ⚠ 매 프레임 난수를 뽑으면 풀이 부들부들 떨린다 — 월드에 심긴 것처럼 보이려면 위치가
      고정이어야 한다.
  */
  const grassCount = Math.ceil(WORLD_LEN / GRASS_STEP) + 2
  const grassX = new Float32Array(grassCount)
  const grassH = new Float32Array(grassCount)
  for (let i = 0; i < grassCount; i += 1) {
    grassX[i] = i * GRASS_STEP + bgRng.range(-2.5, 2.5)
    grassH[i] = GRASS_LEN * bgRng.range(0.6, 1.4)
  }

  /** 구름 뭉치. 타일 경계에서 잘리지 않게 가장자리 여백을 둔다. */
  const puffs: { x: number; y: number; r: number }[] = []
  for (let i = 0; i < 3; i += 1) {
    puffs.push({
      x: bgRng.range(CLOUD_TILE_W * 0.2, CLOUD_TILE_W * 0.8),
      y: bgRng.range(CLOUD_TILE_H * 0.3, CLOUD_TILE_H * 0.7),
      r: bgRng.range(12, 19),
    })
  }

  /**
   * 관중 점. 타일에 한 번 굽고 반복하므로 수백 명이 공짜다.
   *
   * ⚠ **줄에 앉힌다**(2026-09-17). 종전에는 46개를 타일 전체에 흩뿌렸는데, 관중석이
   *   지면 바로 위 74px 띠라서 **점들이 잔디 위를 떠다니는 눈발처럼 보였다**(실측).
   *   사람은 줄지어 앉는다 — y 를 좌석 줄에 맞추고 x 만 흔들면 그것만으로 관중석이 된다.
   */
  const STAND_ROWS = 4
  const fans: { x: number; y: number; r: number; a: number }[] = []
  for (let row = 0; row < STAND_ROWS; row += 1) {
    const y = 12 + row * ((STAND_TILE_H - 20) / (STAND_ROWS - 1))
    for (let i = 0; i < 9; i += 1) {
      fans.push({
        x: i * (STAND_TILE_W / 9) + bgRng.range(2, STAND_TILE_W / 9 - 2),
        y: y + bgRng.range(-1, 1),
        r: bgRng.range(1.7, 2.4),
        // 뒤쪽 줄일수록 옅다 — 거리감이 생긴다.
        a: 0.34 - row * 0.05,
      })
    }
  }

  let skyCache: HTMLCanvasElement | null = null
  let cloudCache: HTMLCanvasElement | null = null
  let standCache: HTMLCanvasElement | null = null
  let cacheKey = ''

  function paletteKey(p: Palette): string {
    return `${p.info}|${p.surface2}|${p.surface}|${p.textMuted}`
  }

  function bakeSky(p: Palette, ss: number): void {
    skyCache = makeCanvas(stage.width * ss, stage.height * ss)
    const g = skyCache?.getContext('2d') ?? null
    if (skyCache === null || g === null) return
    g.scale(ss, ss)
    const grad = g.createLinearGradient(0, 0, 0, stage.height)
    grad.addColorStop(0, p.info)
    grad.addColorStop(1, p.surface2)
    g.fillStyle = grad
    g.fillRect(0, 0, stage.width, stage.height)
    /*
      비네트도 같은 장에 굽는다.
      ⚠ `draw.vignette()` 는 부를 때마다 방사 그라디언트를 새로 만든다. 어차피 정적이라
        구워 두면 완전히 공짜가 된다.
    */
    draw.vignette(g, stage, 0.18)
  }

  function bakeClouds(p: Palette, ss: number): void {
    cloudCache = makeCanvas(CLOUD_TILE_W * ss, CLOUD_TILE_H * ss)
    const g = cloudCache?.getContext('2d') ?? null
    if (cloudCache === null || g === null) return
    g.scale(ss, ss)
    g.fillStyle = p.surface
    for (const puff of puffs) {
      // 원 셋을 한 경로에 모아 채운다 — 따로 채우면 겹친 자리가 진해진다.
      g.beginPath()
      g.arc(puff.x - puff.r * 0.7, puff.y + puff.r * 0.25, puff.r * 0.7, 0, Math.PI * 2)
      g.arc(puff.x, puff.y, puff.r, 0, Math.PI * 2)
      g.arc(puff.x + puff.r * 0.8, puff.y + puff.r * 0.3, puff.r * 0.62, 0, Math.PI * 2)
      g.fill()
    }
  }

  /** 관중석 타일 — 계단 실루엣 + 점점이 박힌 관중. */
  function bakeStand(p: Palette, ss: number): void {
    standCache = makeCanvas(STAND_TILE_W * ss, STAND_TILE_H * ss)
    const g = standCache?.getContext('2d') ?? null
    if (standCache === null || g === null) return
    g.scale(ss, ss)

    // 계단 세 단. 위로 갈수록 뒤라서 옅게 둔다.
    const steps = 3
    for (let i = 0; i < steps; i += 1) {
      g.globalAlpha = 0.34 - i * 0.07
      g.fillStyle = p.textMuted
      const top = (STAND_TILE_H / steps) * i
      g.fillRect(0, top, STAND_TILE_W, STAND_TILE_H - top)
    }

    /*
      ★ 좌석 가로줄. 관중을 줄에 앉히는 것만으로는 부족하고 **앉을 자리가 보여야** 한다.
      ⚠ 이 줄이 없으면 점들이 허공에 뜬 것으로 읽힌다 — 2026-09-17 실측에서 잡은 것이다.
    */
    g.globalAlpha = 0.16
    g.strokeStyle = p.text
    g.lineWidth = 1
    g.beginPath()
    for (let row = 0; row < STAND_ROWS; row += 1) {
      const y = Math.round(12 + row * ((STAND_TILE_H - 20) / (STAND_ROWS - 1))) + 3.5
      g.moveTo(0, y)
      g.lineTo(STAND_TILE_W, y)
    }
    g.stroke()

    // 관중 점. 색은 한 가지로 두고 알파만 흔든다 — 알록달록하면 배경이 시끄러워진다.
    g.fillStyle = p.surface
    for (const fan of fans) {
      g.globalAlpha = fan.a
      g.beginPath()
      g.arc(fan.x, fan.y, fan.r, 0, Math.PI * 2)
      g.fill()
    }
  }

  /** ⚠ 팔레트뿐 아니라 **배율이 바뀌어도** 다시 굽는다. 둘 다 구운 비트맵이 스스로 못 바꾼다. */
  function ensureCache(c: CanvasRenderingContext2D, p: Palette): void {
    const ss = currentScale(c)
    const key = `${paletteKey(p)}|${ss}`
    if (key === cacheKey && skyCache !== null) return
    cacheKey = key
    bakeSky(p, ss)
    bakeClouds(p, ss)
    bakeStand(p, ss)
  }

  /**
   * 타일을 가로로 이어 붙여 채운다.
   *
   * ⚠ 오프셋을 **먼저 양수로 만든 뒤** 왼쪽으로 한 칸 물려서 시작한다. 나머지 연산이 음수를
   *   내면 왼쪽 끝에 빈 띠가 한 프레임씩 깜빡인다.
   */
  function tileRow(
    c: CanvasRenderingContext2D,
    img: HTMLCanvasElement,
    shift: number,
    y: number,
    w: number,
    h: number,
  ): void {
    const offset = ((shift % w) + w) % w
    for (let x = -offset; x < stage.width; x += w) c.drawImage(img, x, y, w, h)
  }

  const scene: Scene = {
    drawBackdrop(c, camX) {
      const p = deps.palette()
      ensureCache(c, p)

      if (skyCache !== null) c.drawImage(skyCache, 0, 0, stage.width, stage.height)

      /*
        ⚠ `reducedMotion` 이면 패럴랙스를 멈춘다(계약의 넷 중 첫째). 배경을 지우는 것이
          아니라 **카메라를 따라오지 않게** 하는 것이다.
      */
      const par = reducedMotion ? 0 : camX

      if (standCache !== null) {
        tileRow(
          c,
          standCache,
          -par * STAND_SPEED,
          GROUND_Y - STAND_TILE_H,
          STAND_TILE_W,
          STAND_TILE_H,
        )
      }

      if (cloudCache !== null) {
        /*
          ⚠ 저사양에서는 구름을 한 겹만 그린다. 화면 전체를 한 번 더 덮는 일이라 채우기
            비용이 그대로 곱절이 된다.
        */
        const layers = quality.level === 'low' ? CLOUD_LAYERS.slice(1) : CLOUD_LAYERS
        c.save()
        for (const layer of layers) {
          c.globalAlpha = layer.alpha
          tileRow(
            c,
            cloudCache,
            -par * layer.speed,
            layer.y,
            CLOUD_TILE_W * layer.scale,
            CLOUD_TILE_H * layer.scale,
          )
        }
        c.restore()
      }
    },

    drawField(c, camX, minMeterLine, glowT) {
      const p = deps.palette()

      // 잔디 띠 — 같은 초록을 알파만 달리해 위에서 아래로 짙어지게 한다.
      c.save()
      c.fillStyle = p.success
      c.globalAlpha = 0.6
      c.fillRect(0, GROUND_Y, stage.width, 6)
      c.globalAlpha = 0.4
      c.fillRect(0, GROUND_Y + 6, stage.width, GRASS_H - 6)
      c.restore()

      /*
        풀 스트로크. 월드 좌표에 심겨 있으므로 카메라가 움직이면 저절로 흐른다.
        ⚠ 보이는 구간만 훑고, 경로 하나에 모아 `stroke()` 를 **한 번만** 부른다.
      */
      const stride = quality.level === 'low' ? 2 : 1
      const first = Math.max(0, Math.floor((camX - GRASS_STEP) / GRASS_STEP))
      const last = Math.min(grassCount, Math.ceil((camX + stage.width + GRASS_STEP) / GRASS_STEP))
      c.save()
      c.strokeStyle = p.success
      c.globalAlpha = 0.7
      c.lineWidth = 1.5
      c.lineCap = 'round'
      c.beginPath()
      for (let i = first; i < last; i += stride) {
        const sx = grassX[i] - camX
        c.moveTo(sx, GROUND_Y + 1)
        c.lineTo(sx + 1.5, GROUND_Y - grassH[i])
      }
      c.stroke()
      c.restore()

      // 흙 — 눈금이 놓이는 바탕.
      c.save()
      c.globalAlpha = 0.5
      c.fillStyle = p.warning
      c.fillRect(0, GROUND_Y + GRASS_H, stage.width, stage.height - GROUND_Y - GRASS_H)
      c.restore()

      /*
        거리 눈금. 50m 마다 짧은 선과 숫자.
        ⚠ 눈금이 없으면 "지금 얼마나 날아갔는가" 를 배지 숫자로만 알 수 있고, 카메라가
          흐르는 동안 속도감이 사라진다. 지면에 기준점이 있어야 날아가는 느낌이 산다.
      */
      const stepPx = TICK_STEP_M * PX_PER_M
      const firstTick = Math.max(0, Math.floor((camX - HIT_X) / stepPx)) * stepPx
      c.save()
      c.strokeStyle = p.textMuted
      c.globalAlpha = 0.45
      c.lineWidth = 1
      c.beginPath()
      for (let d = firstTick; d <= WORLD_LEN; d += stepPx) {
        if (d === 0) continue
        const sx = HIT_X + d - camX
        if (sx < -20 || sx > stage.width + 20) continue
        c.moveTo(Math.round(sx) + 0.5, GROUND_Y + GRASS_H)
        c.lineTo(Math.round(sx) + 0.5, GROUND_Y + GRASS_H + 8)
      }
      c.stroke()
      c.restore()

      for (let d = firstTick; d <= WORLD_LEN; d += stepPx) {
        if (d === 0) continue
        const sx = HIT_X + d - camX
        if (sx < -20 || sx > stage.width + 20) continue
        draw.text(c, `${Math.round(d / PX_PER_M)}m`, sx, TICK_TEXT_Y, {
          size: 10,
          weight: 600,
          color: p.textMuted,
          alpha: 0.75,
        })
      }

      /*
        ★ 최소 비거리선. **이 게임의 규칙을 그림 하나로 말한다.**
        ⚠ 숫자로만 "60m 이상" 이라고 적어 두면 날아가는 동안 어디가 그 지점인지 알 수 없다.
        ⚠ 타구가 이 선을 넘는 순간 **한 번 빛난다**(`glowT`). 착지를 기다리지 않고도
          "이건 성공이다" 를 알 수 있어, 남은 3초의 비행이 불안이 아니라 구경이 된다.
      */
      const lineX = HIT_X + minMeterLine * PX_PER_M - camX
      if (lineX > -30 && lineX < stage.width + 30) {
        const glow = glowT < 0.6 ? 1 - glowT / 0.6 : 0
        c.save()
        c.strokeStyle = glow > 0 ? p.svc.reco : p.svc.lotto
        c.lineWidth = 2 + glow * 3
        c.globalAlpha = 0.9 + glow * 0.1
        c.setLineDash([5, 4])
        c.beginPath()
        c.moveTo(lineX, GROUND_Y - 34 - glow * 14)
        c.lineTo(lineX, GROUND_Y + GRASS_H)
        c.stroke()
        c.restore()

        c.save()
        c.globalAlpha = 0.92
        draw.roundRect(c, lineX - 22, GROUND_Y - 52, 44, 17, 8)
        c.fillStyle = glow > 0 ? p.svc.reco : p.svc.lotto
        c.fill()
        c.restore()
        draw.text(c, `${minMeterLine}m`, lineX, GROUND_Y - 43, {
          size: 10,
          weight: 700,
          color: p.onAccent,
        })
      }

      // 홈플레이트 쪽 흙 원. 타자가 서 있는 자리를 잡아 준다.
      const plateX = HIT_X - camX
      if (plateX > -60 && plateX < stage.width + 60) {
        c.save()
        c.globalAlpha = 0.55
        c.fillStyle = p.warning
        c.beginPath()
        c.ellipse(plateX - 8, GROUND_Y + 4, 34, 8, 0, 0, Math.PI * 2)
        c.fill()
        c.restore()
      }
    },

    /*
      ★ 타격 존.

      ⚠ **폭이 고정이 아니다.** 반폭은 `판정 창 × 공의 현재 속도` 라 난이도가 올라 공이
        빨라지면 함께 넓어진다. 고정 폭으로 그리면 **화면이 판정과 다른 말을 한다** —
        띠 안에서 쳤는데 빗맞는 일이 생긴다.
      ⚠ 색만으로 "지금" 을 전하지 않는다. `index.ts` 가 같은 순간 `hint` 문구도 바꾼다.
    */
    drawZone(c, camX, half, core, alpha, active) {
      const p = deps.palette()
      const x = HIT_X - camX
      const top = GROUND_Y - 118
      /*
        ⚠ 띠를 **지면에서 끊는다.** 잔디까지 덮으면 초록 위에 초록이 겹쳐 지면이 물들고,
          타자가 초록 웅덩이에 선 것처럼 보인다(2026-09-17 실측).
      */
      const h = 118

      c.save()
      c.globalAlpha = alpha * (active ? 0.3 : 0.16)
      c.fillStyle = active ? p.svc.reco : p.svc.lotto
      c.fillRect(x - half, top, half * 2, h)
      c.restore()

      // 존의 양 끝선 — 경계가 어디인지 분명해야 "아슬아슬했다" 가 성립한다.
      c.save()
      c.globalAlpha = alpha * (active ? 0.9 : 0.5)
      c.strokeStyle = active ? p.svc.reco : p.svc.lotto
      c.lineWidth = 1.5
      c.beginPath()
      c.moveTo(Math.round(x - half) + 0.5, top)
      c.lineTo(Math.round(x - half) + 0.5, top + h)
      c.moveTo(Math.round(x + half) + 0.5, top)
      c.lineTo(Math.round(x + half) + 0.5, top + h)
      c.stroke()
      c.restore()

      // 코어 — 여기서 치면 초대형이다. 얇고 진하게.
      c.save()
      c.globalAlpha = alpha * (active ? 0.75 : 0.42)
      c.fillStyle = p.svc.lotto
      c.fillRect(x - core, top, core * 2, h)
      c.restore()
    },

    drawSwingMark(c, camX, worldX, fade, hit) {
      const p = deps.palette()
      const x = worldX - camX
      c.save()
      c.globalAlpha = Math.max(0, fade) * 0.85
      c.strokeStyle = hit ? p.svc.reco : p.danger
      c.lineWidth = 2
      c.setLineDash([3, 3])
      c.beginPath()
      c.moveTo(x, GROUND_Y - 118)
      c.lineTo(x, GROUND_Y + GRASS_H)
      c.stroke()
      c.restore()
    },

    drawBatter(c, camX, swing, bob) {
      const p = deps.palette()
      const x = HIT_X - 20 - camX
      if (x < -60 || x > stage.width + 60) return

      const foot = GROUND_Y + 2
      const y = foot + bob

      /*
        ⚠ 캐릭터 전체를 **발밑을 고정점으로** 확대한다. 좌표를 하나하나 키우면 비율이
          어긋나기 쉬우므로 변환으로 한 번에 키운다 — 발이 지면에서 뜨지 않는다.
      */
      c.save()
      c.translate(x, foot)
      c.scale(BATTER_SCALE, BATTER_SCALE)
      c.translate(-x, -foot)

      draw.softShadow(c, x + 2, foot + 2, 12, 3.5, 0.14)

      /*
        배트 각도 — 세 구간이다.
        ⚠ 처음엔 `clamp(swing,0,1)` 하나로 끝냈는데, 스윙이 끝난 뒤 값이 1 에 머물러
          **대기 자세가 "스윙을 끝낸 채 굳은 자세"** 가 됐다. 야구 타자는 치고 나면 배트를
          다시 세운다. 되돌아오는 구간을 따로 두고, 그 시간을 스윙보다 길게 잡는다.
      */
      const t = swing
      /** 0(대기) → 1(휘두른 끝). 배트 각도·손·허리가 함께 이 값을 탄다. */
      const prog = t <= 1 ? t : t <= 2.2 ? 1 - (t - 1) / 1.2 : 0
      const swinging = t < 2.2
      const swingDeg = BAT_REST_DEG + prog * (BAT_END_DEG - BAT_REST_DEG)

      /*
        ★ 허리 회전. 스윙하면 상체가 투수 쪽으로 돌아간다 — 이것 하나로 "몸으로 쳤다" 가
          된다. 배트만 도는 것은 손목 스냅으로 보인다.
      */
      const turn = prog * 4

      /*
        배트를 **몸보다 먼저** 그릴지.
        ⚠ 대기 각도(−115°)에서 뒤로 보내면 배트가 머리에 완전히 가려 사라진다. 배트가
          없으면 야구선수로 보이지 않는다. 몸에 가리는 것은 **스윙 초반**뿐이다.
      */
      const behind = t < 0.35

      /*
        배트를 쥔 **손 위치**가 회전 중심이다.
        ⚠ 손을 몸통 앞(x+8)에 두면 대기 각도에서 배트가 **얼굴을 가로질러 눈을 덮는다.**
          어깨 **뒤**(왼쪽)로 옮기면 세운 배트가 머리 바깥으로 비껴 나간다 — 실제 타자의
          대기 자세이기도 하다.
      */
      const handX = x - 6 + prog * 16
      const handY = y - 26

      if (behind) drawBat(c, p, handX, handY, swingDeg)

      /* ── 다리 · 신발 ─────────────────────────────────────────
         ⚠ **신발이 없으면 선이 지면에서 그냥 끝나** 붕 뜬 느낌이 난다. 발끝 타원 하나가
           캐릭터를 땅에 붙인다. 스윙하면 앞다리가 뻗는다. */
      const frontLegX = x + 5 + prog * 4
      c.save()
      c.strokeStyle = p.primary
      c.lineWidth = 5
      c.lineCap = 'round'
      c.beginPath()
      c.moveTo(x - 5, y - 12)
      c.lineTo(x - 8, foot - 2)
      c.moveTo(frontLegX, y - 12)
      c.lineTo(frontLegX + 4, foot - 2)
      c.stroke()
      c.fillStyle = p.text
      c.beginPath()
      c.ellipse(x - 9, foot - 1, 5, 2.4, 0, 0, Math.PI * 2)
      c.ellipse(frontLegX + 5, foot - 1, 5, 2.4, 0, 0, Math.PI * 2)
      c.fill()
      c.restore()

      /* ── 뒷팔 ────────────────────────────────────────────────
         ⚠ 몸통보다 **먼저** 그린다. 나중에 그리면 가슴 위를 가로질러 몸을 덮는다. */
      c.save()
      c.lineCap = 'round'
      // ⚠ 밝은 면(`surface`)은 하늘 위에서 경계가 사라진다. 어두운 선을 한 겹 깔아 둔다.
      c.strokeStyle = OUTLINE
      c.lineWidth = 5
      c.beginPath()
      c.moveTo(x - 4, y - 28)
      c.lineTo(handX - 1, handY + 3)
      c.stroke()
      c.strokeStyle = p.surface
      c.lineWidth = 3.6
      c.beginPath()
      c.moveTo(x - 4, y - 28)
      c.lineTo(handX - 1, handY + 3)
      c.stroke()
      c.restore()

      /* ── 몸통 · 유니폼 ───────────────────────────────────────
         ⚠ **어깨를 만든다.** 둥근 사각 하나면 어깨가 없어 펭귄처럼 보인다(2026-09-17 실측).
           위를 좁히고 아래를 넓히면 그것만으로 상체가 된다. */
      c.save()
      c.translate(x, y - 21)
      c.rotate((turn * Math.PI) / 180)
      c.translate(-x, -(y - 21))

      c.beginPath()
      c.moveTo(x - 8, y - 33)
      c.lineTo(x + 9, y - 33)
      c.lineTo(x + 12, y - 12)
      c.quadraticCurveTo(x + 1, y - 7, x - 10, y - 12)
      c.closePath()
      c.fillStyle = p.primary
      c.fill()
      c.strokeStyle = OUTLINE
      c.lineWidth = 1
      c.stroke()

      /*
        유니폼 줄무늬 둘 + 벨트.
        ⚠ 단색 덩어리와 줄 몇 개의 차이가 "옷을 입은 사람" 과 "색칠된 사각형" 의 차이다.
      */
      c.save()
      c.globalAlpha = 0.4
      c.strokeStyle = p.onAccent
      c.lineWidth = 1
      c.beginPath()
      c.moveTo(x - 7, y - 29)
      c.lineTo(x + 9, y - 29)
      c.moveTo(x - 8, y - 25)
      c.lineTo(x + 10, y - 25)
      c.stroke()
      c.restore()
      c.save()
      c.globalAlpha = 0.55
      c.fillStyle = p.text
      c.fillRect(x - 10, y - 15, 22, 2.5)
      c.restore()

      // 좌상단 림라이트(규칙 3). 광원은 언제나 좌상단이다.
      c.strokeStyle = 'rgba(255,255,255,0.35)'
      c.lineWidth = 1.5
      c.beginPath()
      c.arc(x + 1, y - 24, 9, Math.PI * 1.1, Math.PI * 1.6)
      c.stroke()
      c.restore()

      /* ── 앞팔 + 손 ───────────────────────────────────────────
         ⚠ **팔을 피부색으로 그린다**(2026-09-17). 종전에는 유니폼 색이라 몸통에 완전히
           묻혀 **배트가 허공에 뜬 막대**로 보였다. 반팔 유니폼이면 팔뚝은 피부색이 맞고,
           무엇보다 몸통과 대비되어 "쥐고 있다" 가 눈에 보인다. */
      c.save()
      c.lineCap = 'round'
      c.strokeStyle = OUTLINE
      c.lineWidth = 5.4
      c.beginPath()
      c.moveTo(x + 4, y - 30)
      c.lineTo(handX, handY)
      c.stroke()
      c.strokeStyle = p.surface
      c.lineWidth = 4
      c.beginPath()
      c.moveTo(x + 4, y - 30)
      c.lineTo(handX, handY)
      c.stroke()
      // 두 손이 손잡이에 모인다.
      c.fillStyle = p.surface
      c.strokeStyle = OUTLINE
      c.lineWidth = 1
      c.beginPath()
      c.arc(handX, handY, 3, 0, Math.PI * 2)
      c.fill()
      c.stroke()
      c.restore()

      /* ── 목 ──────────────────────────────────────────────────
         ⚠ 목이 없으면 머리와 몸통이 한 덩어리로 뭉쳐 눈사람이 된다.
         ⚠ 종전에는 목을 그렸는데도 **머리에 완전히 가려 보이지 않았다** — 머리 중심이
           `y−48`, 반지름 12 라 아래끝이 `y−36` 이고 목(`y−38~y−34`)이 그 안이었다.
           머리를 `y−53` 으로 올려 목 4px 이 실제로 드러난다. */
      c.save()
      c.strokeStyle = p.surface
      c.lineWidth = 5
      c.beginPath()
      c.moveTo(x, y - 41)
      c.lineTo(x, y - 33)
      c.stroke()
      c.restore()

      /* ── 머리 ────────────────────────────────────────────────
         ⚠ 반지름 12 — 몸통 폭(22)보다 머리 지름이 커야 "귀여운" 비율이 된다. 작은 머리에
           큰 몸은 어른 실루엣이라 이 게임의 톤과 맞지 않는다. */
      const headR = 12
      const headY = y - 53
      c.save()
      c.fillStyle = p.surface
      c.beginPath()
      c.arc(x, headY, headR, 0, Math.PI * 2)
      c.fill()
      c.strokeStyle = OUTLINE
      c.lineWidth = 1
      c.stroke()
      c.restore()

      /*
        ★ 표정. 대기 중에는 점 두 개, **스윙하는 동안에는 `>` 모양**으로 힘을 준다.
        ⚠ 입을 그리면 이 크기에서 얼룩으로 보인다. 눈만으로 충분하다.
      */
      c.save()
      c.strokeStyle = p.text
      c.fillStyle = p.text
      c.lineWidth = 1.6
      c.lineCap = 'round'
      if (swinging) {
        c.beginPath()
        c.moveTo(x - 6.5, headY)
        c.lineTo(x - 2.5, headY + 2)
        c.lineTo(x - 6.5, headY + 4)
        c.moveTo(x + 2, headY)
        c.lineTo(x + 6, headY + 2)
        c.lineTo(x + 2, headY + 4)
        c.stroke()
      } else {
        c.beginPath()
        c.arc(x - 4, headY + 2, 1.9, 0, Math.PI * 2)
        c.arc(x + 4, headY + 2, 1.9, 0, Math.PI * 2)
        c.fill()
      }
      c.restore()

      // 볼 터치 — 이 점 둘이 캐릭터를 훨씬 친근하게 만든다.
      c.save()
      c.globalAlpha = 0.3
      c.fillStyle = p.danger
      c.beginPath()
      c.ellipse(x - 7.5, headY + 6, 2.6, 1.8, 0, 0, Math.PI * 2)
      c.ellipse(x + 7.5, headY + 6, 2.6, 1.8, 0, 0, Math.PI * 2)
      c.fill()
      c.restore()

      // 모자 — 머리 위 반원 + 챙. 챙은 투수 쪽(오른쪽)을 향한다.
      c.save()
      c.fillStyle = p.svc.lotto
      c.beginPath()
      c.arc(x, headY - 1, headR, Math.PI, Math.PI * 2)
      c.fill()
      c.beginPath()
      c.ellipse(x + 9, headY - 1, 8, 2.8, 0, Math.PI, Math.PI * 2)
      c.fill()
      c.strokeStyle = OUTLINE
      c.lineWidth = 1
      c.beginPath()
      c.arc(x, headY - 1, headR, Math.PI, Math.PI * 2)
      c.stroke()
      c.restore()

      if (!behind) drawBat(c, p, handX, handY, swingDeg)

      c.restore()
    },

    drawPitcher(c, camX, wind, holding) {
      const p = deps.palette()
      const x = PITCHER_X - camX
      if (x < -50 || x > stage.width + 50) return

      const foot = GROUND_Y - 2

      // 타자와 같은 이유로 발밑을 고정점 삼아 키운다. 타자보다는 작게 두어 거리감을 남긴다.
      c.save()
      c.translate(x, foot)
      c.scale(PITCHER_SCALE, PITCHER_SCALE)
      c.translate(-x, -foot)

      // 마운드.
      c.save()
      c.globalAlpha = 0.55
      c.fillStyle = p.warning
      c.beginPath()
      c.ellipse(x, foot + 2, 26, 7, 0, 0, Math.PI * 2)
      c.fill()
      c.restore()

      draw.softShadow(c, x, foot, 11, 3, 0.18)

      /*
        ★ 와인드업 — 다리를 든다.
        ⚠ `holding`(내가 누르기를 기다리는 동안)에는 **가만히 선다.** 기다리는 내내
          다리를 들고 있으면 "언제 던지지" 가 아니라 "멈춘 건가" 로 보인다.
      */
      const lift = holding ? 0 : Math.sin(Math.min(1, wind) * Math.PI) * 9

      // 다리 둘. 앞다리가 들린다.
      c.save()
      c.strokeStyle = p.textMuted
      c.lineWidth = 4
      c.lineCap = 'round'
      c.beginPath()
      c.moveTo(x + 3, foot - 10)
      c.lineTo(x + 6, foot - 1)
      c.moveTo(x - 3, foot - 10)
      c.lineTo(x - 6, foot - 1 - lift)
      c.stroke()
      c.restore()

      // 몸통.
      c.save()
      draw.roundRect(c, x - 6, foot - 26, 13, 17, 6)
      c.fillStyle = p.textMuted
      c.fill()
      c.strokeStyle = OUTLINE
      c.lineWidth = 0.8
      c.stroke()
      c.restore()

      /* ── 목 + 머리 + 얼굴 + 모자 ─────────────────────────────
         ⚠ 종전 투수는 **눈이 없어 회색 뭉치**로 보였다(2026-09-17 실측). 점 두 개면
           사람이 되고, 그 차이가 타자와 나란히 놓였을 때 특히 크다. */
      c.save()
      c.strokeStyle = p.surface
      c.lineWidth = 3.5
      c.beginPath()
      c.moveTo(x, foot - 28)
      c.lineTo(x, foot - 30)
      c.stroke()
      c.fillStyle = p.surface
      c.beginPath()
      c.arc(x, foot - 35, 7, 0, Math.PI * 2)
      c.fill()
      c.strokeStyle = OUTLINE
      c.lineWidth = 0.8
      c.stroke()
      // 눈 — 타자 쪽(왼쪽)을 본다.
      c.fillStyle = p.text
      c.beginPath()
      c.arc(x - 3.4, foot - 34, 1.3, 0, Math.PI * 2)
      c.arc(x + 0.6, foot - 34, 1.3, 0, Math.PI * 2)
      c.fill()
      // 모자 + 챙(왼쪽).
      c.fillStyle = p.svc.news
      c.beginPath()
      c.arc(x, foot - 36, 7, Math.PI, Math.PI * 2)
      c.fill()
      c.beginPath()
      c.ellipse(x - 5, foot - 36, 5, 2, 0, Math.PI, Math.PI * 2)
      c.fill()
      c.restore()

      /*
        던지는 팔. 와인드업에서 뒤로 올라갔다가 릴리스에 앞으로 내려온다.
        ⚠ 각도를 그대로 보간하면 팔이 몸을 통과한다. 위로 크게 돌린 뒤 내려오는 호를 쓴다.
        ⚠ 투수는 **왼쪽(타자 쪽)** 으로 던진다 — `x` 에서 빼야 왼쪽으로 뻗는다.
        ⚠ 타자와 같은 이유로 **피부색**이다. 유니폼 색이면 몸통에 묻혀 팔이 사라진다.
      */
      const t = Math.min(1, Math.max(0, wind))
      /*
        ⚠ **대기(`holding`) 각도를 아래로 둔다**(2026-09-17 실측). −20° 는 팔을 왼쪽 **위**로
          뻗어 **얼굴을 가로질렀다** — 투수가 흰 덩어리로 보인 진짜 원인이 이것이었다.
          공을 쥐고 내린 자세(+28°)가 실제 투수의 준비 동작이기도 하다.
      */
      const armDeg = holding ? 62 : -150 + t * 185
      const rad = (armDeg * Math.PI) / 180
      const handX = x - Math.cos(rad) * 15
      const handY = foot - 25 + Math.sin(rad) * 15
      c.save()
      c.lineCap = 'round'
      c.strokeStyle = OUTLINE
      c.lineWidth = 4.6
      c.beginPath()
      c.moveTo(x - 2, foot - 25)
      c.lineTo(handX, handY)
      c.stroke()
      c.strokeStyle = p.surface
      c.lineWidth = 3.2
      c.beginPath()
      c.moveTo(x - 2, foot - 25)
      c.lineTo(handX, handY)
      c.stroke()
      c.restore()

      /*
        ★ 글러브 — 던지지 않는 손. 이 갈색 원 하나로 "야구 선수" 가 분명해진다.
        ⚠ 몸통 **한가운데**에 두면 배에 붙은 혹처럼 보인다(2026-09-17 실측). 반대쪽
          어깨 바깥으로 빼서 **팔 끝에 달린 것**으로 읽히게 한다.
      */
      c.save()
      c.strokeStyle = p.surface
      c.lineWidth = 3
      c.lineCap = 'round'
      c.beginPath()
      c.moveTo(x + 4, foot - 24)
      c.lineTo(x + 11, foot - 19 - lift * 0.3)
      c.stroke()
      c.fillStyle = p.warning
      c.beginPath()
      c.arc(x + 13, foot - 18 - lift * 0.3, 5, 0, Math.PI * 2)
      c.fill()
      c.strokeStyle = OUTLINE
      c.lineWidth = 0.8
      c.stroke()
      c.restore()

      c.restore()
    },
  }

  return scene
}

/** 배트 한 자루. 손잡이 쪽이 얇고 끝이 굵다. */
function drawBat(c: CanvasRenderingContext2D, p: Palette, x: number, y: number, deg: number): void {
  c.save()
  c.translate(x, y)
  c.rotate((deg * Math.PI) / 180)
  c.strokeStyle = p.warning
  c.lineCap = 'round'
  /*
    두 번 그어 굵기를 바꾼다.
    ⚠ 가늘어지는 사다리꼴을 경로로 만드는 것보다 싸고, 이 크기에서는 구별되지 않는다.
  */
  c.lineWidth = 3
  c.beginPath()
  c.moveTo(0, 0)
  c.lineTo(14, 0)
  c.stroke()
  c.lineWidth = 5.5
  c.beginPath()
  c.moveTo(14, 0)
  c.lineTo(30, 0)
  c.stroke()
  // 손잡이 끝 마디 — 배트가 손에서 시작한다는 표시.
  c.fillStyle = p.text
  c.globalAlpha = 0.5
  c.beginPath()
  c.arc(-1, 0, 2.2, 0, Math.PI * 2)
  c.fill()
  c.restore()
}
