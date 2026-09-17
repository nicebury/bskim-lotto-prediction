import type { DrawKit, Palette, Rng, StageSize } from '@/games/core/types'

import {
  GROUND_H,
  PARALLAX_CITY_FAR,
  PARALLAX_CITY_NEAR,
  PARALLAX_CLOUD_FAR,
  PARALLAX_CLOUD_NEAR,
} from './constants'

/**
 * G06 배경 — 하늘·구름 2겹·도시 실루엣 2겹·지면.
 *
 * → 시각 언어 규칙 1: *배경 = 세로 그라디언트 1장 + 비네트 1장 + 실루엣 패럴랙스 2겹.
 *   정적 배경은 오프스크린 캔버스에 한 번 그려 캐시하고 `drawImage` 로만 쓴다.*
 *
 * ── ⚠ 오프스크린에서 `draw.bgGradient` 를 부르지 않는다 ────────────
 * `DrawKit` 의 그라디언트 캐시는 **키가 `크기 + 색` 뿐이라 어느 컨텍스트에서 만들어졌는지를
 * 기억하지 않는다.** `CanvasGradient` 는 만든 컨텍스트에 종속이므로, 오프스크린에서 한 번
 * 부르면 그 객체가 캐시에 남아 이후 메인 캔버스가 남의 컨텍스트 객체를 쓰게 된다.
 * 여기서는 하늘도 **자체 그라디언트**로 그린다(3-stop 이라 어차피 `bgGradient` 로는 못 만든다).
 *
 * ── ⚠ 스프라이트 배율은 `getTransform()` 에서 읽는다 ───────────────
 * 메인 캔버스는 고배율 기기에서 논리 픽셀보다 촘촘하다. 스프라이트를 논리 크기로 만들면
 * 그 한 장만 흐리게 뭉갠다. 그렇다고 게임이 화면 배율을 **직접 다루는 것은 금지**다(그 값을
 * 여섯 세션이 각자 다루면 그중 하나는 반드시 흐릿하게 나온다).
 *
 * **호스트가 `setTransform(s*dpr, …)` 을 걸어 두므로 그 행렬을 읽으면 된다.** 게임이 배율을
 * 정하는 것이 아니라 호스트가 정한 배율을 읽기만 하는 것이라 금지 취지에 어긋나지 않는다
 * (계약 "오프스크린 캐시의 배율" 절, 2026-09-08 G04 가 먼저 부딪혔다).
 *
 * ⚠ 배율이 달라지면(리사이즈·창 이동) 캐시를 다시 굽는다. 그 판정도 `drawSky` 안에서 한다 —
 *   리사이즈 통지는 호스트가 받고 게임에는 오지 않기 때문이다.
 */

/** 배율 변화가 이보다 작으면 다시 굽지 않는다. 소수점 떨림으로 매 프레임 재생성하는 것을 막는다. */
const SCALE_EPSILON = 0.01

/** 도시 실루엣 타일 높이. 지면 위로 이만큼 솟는다. */
const CITY_H = 96
/** 구름 스프라이트 크기(논리). */
const CLOUD_W = 96
const CLOUD_H = 44
/** 하늘에 띄울 구름 수. 겹마다 절반씩 나눠 쓴다. */
const CLOUD_COUNT = 8

/** 실루엣 알파. 색만으로 원근을 주지 않고 **크기와 속도**를 함께 달리한다. */
const CITY_ALPHA_FAR = 0.14
const CITY_ALPHA_NEAR = 0.26
const CLOUD_ALPHA_FAR = 0.35
const CLOUD_ALPHA_NEAR = 0.6

interface Sprite {
  readonly canvas: HTMLCanvasElement
  /** 논리 크기. `drawImage` 에 이 값을 넘겨 축소해 그린다. */
  readonly w: number
  readonly h: number
}

interface Cloud {
  /** 월드 x. 화면 x 는 패럴랙스를 곱한 스크롤을 빼서 구한다. */
  x: number
  y: number
  scale: number
  /** 0 = 먼 겹, 1 = 가까운 겹. */
  near: boolean
}

export interface Scenery {
  /**
   * @param scroll  누적 전진 거리(보간된 값)
   * @param stopped 배경 정지 여부. `reducedMotion` 이면 패럴랙스를 멈춘다
   */
  drawSky(c: CanvasRenderingContext2D, scroll: number, stopped: boolean): void
  drawGround(c: CanvasRenderingContext2D, scroll: number, stopped: boolean): void
  /** 비네트를 마지막에 덮는다. 매 프레임 방사 그라디언트를 만들지 않으려고 캐시해 둔다. */
  drawVignette(c: CanvasRenderingContext2D): void
  /**
   * 테마가 바뀌었다. 구워 둔 스프라이트와 그라디언트를 버린다.
   * ⚠ **구름·빌딩의 배치는 버리지 않는다.** 다시 뽑으면 다크모드로 토글하는 순간 도시가
   *   통째로 다른 도시가 된다 — 색만 바뀌어야 한다.
   */
  invalidate(): void
}

/**
 * 배경 일습을 만든다. **`create()` 시 한 번만** 부른다.
 *
 * @param rng 배경 전용 스트림을 받는다(`rng.fork()`). 배경이 물리 난수를 소비하면 같은
 *            시드로도 결과가 달라져 재현성이 깨진다.
 */
export function createScenery(
  stage: StageSize,
  getPalette: () => Palette,
  rng: Rng,
  draw: DrawKit,
): Scenery {
  const groundY = stage.height - GROUND_H

  /*
    ⚠ 스프라이트는 팔레트를 **구워** 담는다. 테마가 바뀌면 다시 구워야 하므로 게으르게
      만들고 `invalidate()` 로 버린다.
    ⚠ 빌딩 모양은 난수로 뽑는데 **다시 구울 때 같은 모양이 나와야 한다.** 그래서 배치용
      난수를 여기서 한 번만 만들어 두고, 다시 구울 때는 같은 시드에서 새 스트림을 뽑는다.
      안 그러면 다크모드로 토글하는 순간 도시가 통째로 다른 도시가 된다.
  */
  const cityShapeSeed = (rng.next() * 4294967296) >>> 0

  let cityFar: Sprite | null = null
  let cityNear: Sprite | null = null
  let cloud: Sprite | null = null
  let ground: Sprite | null = null
  let vignette: Sprite | null = null
  let baked = false
  /** 마지막으로 구울 때 쓴 배율. `getTransform()` 에서 읽는다. */
  let bakedScale = 0

  /**
   * 현재 화면 배율.
   * ⚠ `m.a` 가 0 이하로 오는 구형 사파리를 방어한다 — 0 이면 캔버스 크기가 0 이 되어
   *   `drawImage` 가 통째로 실패한다.
   */
  function currentScale(c: CanvasRenderingContext2D): number {
    const m = c.getTransform()
    return m.a > 0 ? m.a : 1
  }

  function bake(c: CanvasRenderingContext2D): void {
    const scale = currentScale(c)
    if (baked && Math.abs(scale - bakedScale) < SCALE_EPSILON) return
    baked = true
    bakedScale = scale
    const palette = getPalette()
    /*
      ⚠ 스프라이트는 `document` 가 있어야 만들 수 있다. 게임은 `ssr: false` 로 지연
        로드되므로 실제로는 항상 있지만, 없을 때 화면이 새까매지는 것보다 실루엣만 빠지는
        편이 낫다.
    */
    cityFar = makeCityTile(stage.width, CITY_H * 0.72, palette, createShapeRng(cityShapeSeed), scale)
    cityNear = makeCityTile(
      stage.width,
      CITY_H,
      palette,
      createShapeRng(cityShapeSeed ^ 0x9e37),
      scale,
    )
    cloud = makeCloudSprite(palette, scale)
    ground = makeGroundTile(palette, draw, scale)
    vignette = makeVignette(stage, draw, scale)
  }

  /*
    구름 배치.
    ⚠ 월드 폭을 `stage.width * 2` 로 잡고 그 안에서만 도는 이유는, 화면(360)보다 넓어야
      같은 구름이 동시에 두 번 보이지 않기 때문이다.
  */
  const cloudSpan = stage.width * 2
  const clouds: Cloud[] = []
  for (let i = 0; i < CLOUD_COUNT; i += 1) {
    const near = i % 2 === 1
    clouds.push({
      x: rng.range(0, cloudSpan),
      // 지면 근처에는 두지 않는다. 파이프·링과 겹쳐 보이면 읽기 어려워진다.
      y: rng.range(26, groundY * 0.46),
      scale: near ? rng.range(0.85, 1.25) : rng.range(0.5, 0.8),
      near,
    })
  }

  /** 하늘 그라디언트. 메인 컨텍스트에서 한 번 만들어 재사용한다. */
  let sky: CanvasGradient | null = null

  /** 음수에서도 도는 나머지. `-10 % 360` 이 `-10` 이라 그냥 쓰면 타일이 한 칸 비어 보인다. */
  const wrap = (v: number, m: number) => ((v % m) + m) % m

  /** 타일 하나를 화면 폭만큼 반복해 그린다. 이음매를 위해 한 장 더 그린다. */
  function tileRow(
    c: CanvasRenderingContext2D,
    sprite: Sprite | null,
    offset: number,
    y: number,
    alpha: number,
  ) {
    if (sprite === null) return
    c.save()
    c.globalAlpha = alpha
    const start = -wrap(offset, sprite.w)
    for (let x = start; x < stage.width; x += sprite.w) {
      c.drawImage(sprite.canvas, x, y, sprite.w, sprite.h)
    }
    c.restore()
  }

  return {
    drawSky(c, scroll, stopped) {
      bake(c)
      const palette = getPalette()
      if (sky === null) {
        /*
          3-stop 이다. 위쪽을 서비스 색으로 물들이고 아래로 갈수록 배경색이 된다 —
          한 색에서 다른 한 색으로 곧장 가면 하늘이 아니라 색판처럼 보인다.
          ⚠ 중간 stop 을 0.72 로 늦춘 것은 실측 결과다. 0.46 이었을 때는 **화면 아래
            절반이 통째로 흰색**이 되어, 흰 새와 옅은 도시 실루엣이 배경에 묻혔다.
        */
        sky = c.createLinearGradient(0, 0, 0, stage.height)
        sky.addColorStop(0, palette.svc.news)
        sky.addColorStop(0.72, palette.surface2)
        sky.addColorStop(1, palette.bg)
      }
      c.fillStyle = sky
      c.fillRect(0, 0, stage.width, stage.height)

      const s = stopped ? 0 : scroll

      // 구름 — 먼 겹 먼저. 같은 스프라이트를 크기와 알파만 달리해 두 겹으로 쓴다.
      for (const cl of clouds) {
        if (cloud === null) break
        const factor = cl.near ? PARALLAX_CLOUD_NEAR : PARALLAX_CLOUD_FAR
        const w = cloud.w * cl.scale
        const h = cloud.h * cl.scale
        const x = wrap(cl.x - s * factor, cloudSpan + w) - w
        c.save()
        c.globalAlpha = cl.near ? CLOUD_ALPHA_NEAR : CLOUD_ALPHA_FAR
        c.drawImage(cloud.canvas, x, cl.y, w, h)
        c.restore()
      }

      // 도시 실루엣 2겹. 먼 겹이 더 낮고 더 느리다.
      if (cityFar !== null) {
        tileRow(c, cityFar, s * PARALLAX_CITY_FAR, groundY - cityFar.h, CITY_ALPHA_FAR)
      }
      if (cityNear !== null) {
        tileRow(c, cityNear, s * PARALLAX_CITY_NEAR, groundY - cityNear.h, CITY_ALPHA_NEAR)
      }
    },

    drawGround(c, scroll, stopped) {
      bake(c)
      const palette = getPalette()
      const s = stopped ? 0 : scroll
      c.fillStyle = palette.surface2
      c.fillRect(0, groundY, stage.width, GROUND_H)

      // 지면 무늬는 전진 속도 그대로(1.0배) 흐른다. 속도감의 대부분이 여기서 온다.
      tileRow(c, ground, s, groundY, 1)

      // 지면 윗선. 바닥이 어디인지 한눈에 보여야 억울한 충돌이 줄어든다.
      c.fillStyle = palette.svc.news
      c.fillRect(0, groundY, stage.width, 2)
    },

    drawVignette(c) {
      bake(c)
      if (vignette === null) return
      c.drawImage(vignette.canvas, 0, 0, vignette.w, vignette.h)
    },

    invalidate() {
      baked = false
      bakedScale = 0
      sky = null
    },
  }
}

/**
 * 빌딩 모양 전용 난수.
 * ⚠ `core/rng` 를 다시 부르지 않고 같은 알고리즘을 여기 둔다 — **중복이 충돌보다 싸다**는
 *   계약의 규칙이고, 필요한 표면이 `next`·`range` 둘뿐이라 `Rng` 전체를 끌어올 이유가 없다.
 */
function createShapeRng(seed: number): Pick<Rng, 'next' | 'range'> {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return { next, range: (min, max) => min + next() * (max - min) }
}

/* ────────────────────────────────────────────────────────────
 * 스프라이트 만들기 — 전부 `create()` 시 1회
 * ──────────────────────────────────────────────────────────── */

function makeSprite(
  w: number,
  h: number,
  scale: number,
): { sprite: Sprite; c: CanvasRenderingContext2D } | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  // 캐시는 **실제 픽셀**로 만들고, 그릴 때만 논리 크기로 축소한다.
  canvas.width = Math.max(1, Math.round(w * scale))
  canvas.height = Math.max(1, Math.round(h * scale))
  const c = canvas.getContext('2d')
  if (c === null) return null
  // 이후로는 논리 좌표로만 그린다. 메인 캔버스와 같은 규칙이다.
  c.setTransform(scale, 0, 0, scale, 0, 0)
  return { sprite: { canvas, w, h }, c }
}

/**
 * 도시 실루엣 타일.
 *
 * ⚠ **빌딩이 타일 경계를 넘지 않게 한다.** 넘으면 반복 지점에서 건물이 잘려 이음매가
 *   눈에 띈다. 마지막 건물은 폭이 남는 만큼만 세우고, 남는 곳은 하늘로 둔다.
 */
function makeCityTile(
  w: number,
  h: number,
  palette: Palette,
  rng: Pick<Rng, 'next' | 'range'>,
  scale: number,
): Sprite | null {
  const made = makeSprite(w, h, scale)
  if (made === null) return null
  const { sprite, c } = made

  c.fillStyle = palette.text
  let x = 0
  while (x < w) {
    const bw = rng.range(22, 46)
    if (x + bw > w) break
    const bh = rng.range(h * 0.34, h)
    c.fillRect(x, h - bh, bw, bh)

    // 옥상 구조물. 실루엣에 굴곡을 줘 네모 반복으로 보이지 않게 한다.
    if (rng.next() < 0.45) {
      const tw = bw * rng.range(0.2, 0.4)
      c.fillRect(x + bw * 0.3, h - bh - 6, tw, 6)
    }
    // 안테나. 가늘고 길어 스카이라인에 리듬이 생긴다.
    if (rng.next() < 0.25) {
      c.fillRect(x + bw * 0.5, h - bh - 14, 2, 14)
    }
    x += bw + rng.range(4, 14)
  }
  return sprite
}

/** 구름 하나. 원 몇 개를 겹쳐 만든다 — 실루엣이라 이것으로 충분하다. */
function makeCloudSprite(palette: Palette, scale: number): Sprite | null {
  const made = makeSprite(CLOUD_W, CLOUD_H, scale)
  if (made === null) return null
  const { sprite, c } = made

  c.fillStyle = palette.surface
  const lobes: readonly [number, number, number][] = [
    [26, 30, 16],
    [46, 24, 20],
    [66, 30, 15],
    [36, 26, 14],
    [58, 28, 13],
  ]
  for (const [x, y, r] of lobes) {
    c.beginPath()
    c.arc(x, y, r, 0, Math.PI * 2)
    c.fill()
  }
  // 아랫면을 평평하게 잘라 구름처럼 보이게 한다.
  c.fillRect(20, 30, 52, 10)

  // 좌상단 림라이트(시각 언어 규칙 3). 광원은 항상 좌상단이다.
  c.strokeStyle = 'rgba(255,255,255,0.5)'
  c.lineWidth = 2
  c.beginPath()
  c.arc(46, 24, 20, Math.PI * 1.1, Math.PI * 1.75)
  c.stroke()

  return sprite
}

/** 지면 무늬 타일. 사선 한 줄이면 속도감이 난다. */
function makeGroundTile(palette: Palette, draw: DrawKit, scale: number): Sprite | null {
  const made = makeSprite(48, GROUND_H, scale)
  if (made === null) return null
  const { sprite, c } = made

  c.save()
  c.globalAlpha = 0.5
  c.fillStyle = palette.surface
  draw.roundRect(c, 6, 10, 22, 8, 4)
  c.fill()
  c.globalAlpha = 0.28
  draw.roundRect(c, 30, 24, 14, 6, 3)
  c.fill()
  c.restore()

  return sprite
}

/**
 * 비네트 스프라이트.
 * ⚠ `draw.vignette` 는 부를 때마다 방사 그라디언트를 새로 만든다. 매 프레임 부르면 그것만으로
 *   프레임을 먹으므로 **투명 배경 스프라이트에 한 번 그려** 두고 덮는다.
 */
function makeVignette(stage: StageSize, draw: DrawKit, scale: number): Sprite | null {
  const made = makeSprite(stage.width, stage.height, scale)
  if (made === null) return null
  const { sprite, c } = made
  draw.vignette(c, stage, 0.2)
  return sprite
}
