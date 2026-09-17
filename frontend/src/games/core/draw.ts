import { ballRange } from '@/lib/lotto'

import type { BallOptions, DrawKit, Palette, ParticleField, StageSize, TextOptions } from './types'

/**
 * 공용 그리기 프리미티브 — **"허접하지 않음" 의 실제 담보**.
 *
 * → docs/wiki/10-contracts/playground-game-contract.md "DrawKit" 절
 *
 * 여섯 게임이 각자 그림자·볼·글자를 그리면 **여섯 개의 다른 제품**이 된다. 그래서 공통으로
 * 보이는 것은 전부 여기서 그린다.
 *
 * ── ⚠ 시각 언어 4대 규칙 (여섯 게임 전부 준수) ────────────────────
 * 1. 배경 = 세로 그라디언트 1장 + 비네트 1장 + 실루엣 패럴랙스 2겹.
 *    **정적 배경은 오프스크린 캔버스에 한 번 그려 캐시하고 `drawImage` 로만 쓴다.**
 * 2. 모든 물체는 지면에 `softShadow` 를 갖는다(부유감 제거).
 * 3. 모든 물체 상단에 1~2px 밝은 림라이트(α0.35). **광원은 항상 좌상단.**
 * 4. 숫자는 반드시 `ball()` 로만 그린다 — 사이트 전체가 쓰는 그 볼과 같아야 한다.
 *
 * ── ⚠ 성능 ─────────────────────────────────────────────────────────
 * **루프 안에서 `ctx.shadowBlur` 를 쓰지 않는다.** 모바일 GPU 에서 극단적으로 느리다.
 * 그림자는 `softShadow()`(단색 타원)뿐이다.
 */

/** 밝은 볼(노랑·초록) 위에는 어두운 글자를 쓴다. 흰 글자는 AA 미달이다. */
const LIGHT_BALL_RANGES = new Set([1, 5])

export function createDrawKit(palette: () => Palette): DrawKit {
  /*
    배경 그라디언트 캐시.
    ⚠ 매 프레임 `createLinearGradient` 를 부르면 그것만으로 프레임을 먹는다. 색·크기가
      같으면 재사용한다.
  */
  let gradCache: { key: string; grad: CanvasGradient } | null = null

  const clamp = (v: number, min: number, max: number) => (v < min ? min : v > max ? max : v)
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t

  const kit: DrawKit = {
    roundRect(c, x, y, w, h, r) {
      /*
        ⚠ `c.roundRect` 는 사파리 16 미만에 없다. 직접 그린다 — 폴리필을 두느니 스무 줄이 낫다.
        ⚠ 반지름이 변보다 크면 경로가 뒤집힌다. 미리 자른다.
      */
      const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2)
      c.beginPath()
      c.moveTo(x + rr, y)
      c.lineTo(x + w - rr, y)
      c.quadraticCurveTo(x + w, y, x + w, y + rr)
      c.lineTo(x + w, y + h - rr)
      c.quadraticCurveTo(x + w, y + h, x + w - rr, y + h)
      c.lineTo(x + rr, y + h)
      c.quadraticCurveTo(x, y + h, x, y + h - rr)
      c.lineTo(x, y + rr)
      c.quadraticCurveTo(x, y, x + rr, y)
      c.closePath()
    },

    /**
     * 번호 볼 — **전 게임 공통 사양**.
     *
     * 구간색 채움 → 좌상단 흰 하이라이트 → 1px 안쪽 링 → 숫자.
     * ⚠ 게임 아트는 자유롭게 꾸미되 **번호가 붙은 볼·캡슐·링·칸만은** 공식 5구간을 따른다.
     *   게임마다 볼 색을 새로 정하면 사용자가 사이트 전체에서 학습한 색-구간 대응이 깨진다.
     */
    ball(c, x, y, r, n, o) {
      const p = palette()
      const range = ballRange(n)
      const alpha = o?.alpha ?? 1
      const dim = o?.dim === true

      c.save()
      c.globalAlpha = alpha * (dim ? 0.35 : 1)

      c.fillStyle = p.ball[range]
      c.beginPath()
      c.arc(x, y, r, 0, Math.PI * 2)
      c.fill()

      // 좌상단 광원(규칙 3). 방사 하이라이트로 구슬 느낌을 낸다.
      const hx = x - r * 0.35
      const hy = y - r * 0.35
      const hl = c.createRadialGradient(hx, hy, 0, hx, hy, r * 1.1)
      hl.addColorStop(0, 'rgba(255,255,255,0.55)')
      hl.addColorStop(1, 'rgba(255,255,255,0)')
      c.fillStyle = hl
      c.beginPath()
      c.arc(x, y, r, 0, Math.PI * 2)
      c.fill()

      // 안쪽 링. 배경과 볼의 경계를 또렷하게 한다.
      c.lineWidth = 1
      c.strokeStyle = 'rgba(0,0,0,0.18)'
      c.beginPath()
      c.arc(x, y, r - 0.5, 0, Math.PI * 2)
      c.stroke()

      if (o?.ring) {
        c.lineWidth = 2
        c.strokeStyle = o.ring
        c.beginPath()
        c.arc(x, y, r + 2, 0, Math.PI * 2)
        c.stroke()
      }

      c.fillStyle = LIGHT_BALL_RANGES.has(range) ? p.ballFgDark : p.ballFg
      c.font = `700 ${r * 0.95}px ${p.fontSans}`
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.fillText(String(n), x, y + r * 0.04)

      /*
        ⚠ 획득 표시는 **색이 아니라 체크**다. 흐리게만 하면 색각 이상이 있는 사용자에게
          전달되지 않는다([[accessibility]] 색만으로 정보를 전달하지 않기).
      */
      if (dim) {
        c.globalAlpha = alpha
        c.strokeStyle = p.text
        c.lineWidth = Math.max(2, r * 0.16)
        c.lineCap = 'round'
        c.lineJoin = 'round'
        c.beginPath()
        c.moveTo(x - r * 0.42, y + r * 0.02)
        c.lineTo(x - r * 0.12, y + r * 0.34)
        c.lineTo(x + r * 0.46, y - r * 0.36)
        c.stroke()
      }

      c.restore()
    },

    /** 번호가 아직 공개되지 않은 볼. 은닉형(G01)과 공개 연출에 쓴다. */
    mysteryBall(c, x, y, r, o) {
      const p = palette()
      c.save()
      c.globalAlpha = o?.alpha ?? 1

      c.fillStyle = p.surface2
      c.beginPath()
      c.arc(x, y, r, 0, Math.PI * 2)
      c.fill()

      const hx = x - r * 0.35
      const hy = y - r * 0.35
      const hl = c.createRadialGradient(hx, hy, 0, hx, hy, r * 1.1)
      hl.addColorStop(0, 'rgba(255,255,255,0.5)')
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

      c.fillStyle = p.textMuted
      c.font = `700 ${r * 0.95}px ${p.fontSans}`
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.fillText('?', x, y + r * 0.04)
      c.restore()
    },

    /** 캡슐(크레인 뽑기 등). 위아래 반원 + 가운데 띠. */
    capsule(c, x, y, r, hue, label) {
      const p = palette()
      c.save()

      c.fillStyle = hue
      c.beginPath()
      c.arc(x, y, r, Math.PI, 0)
      c.fill()

      c.fillStyle = p.surface
      c.beginPath()
      c.arc(x, y, r, 0, Math.PI)
      c.fill()

      c.lineWidth = 1
      c.strokeStyle = 'rgba(0,0,0,0.18)'
      c.beginPath()
      c.arc(x, y, r - 0.5, 0, Math.PI * 2)
      c.stroke()

      // 좌상단 림라이트(규칙 3).
      c.lineWidth = 1.5
      c.strokeStyle = 'rgba(255,255,255,0.35)'
      c.beginPath()
      c.arc(x, y, r - 2, Math.PI * 1.15, Math.PI * 1.65)
      c.stroke()

      if (label !== undefined) {
        c.fillStyle = p.text
        c.font = `700 ${r * 0.8}px ${p.fontSans}`
        c.textAlign = 'center'
        c.textBaseline = 'middle'
        c.fillText(label, x, y + r * 0.42)
      }
      c.restore()
    },

    /**
     * 접지 그림자(규칙 2).
     * ⚠ **`shadowBlur` 를 쓰지 않는다.** 단색 타원 한 장이다. 모바일에서 blur 는 프레임을 먹는다.
     */
    softShadow(c, x, y, rx, ry, alpha = 0.18) {
      c.save()
      c.globalAlpha = alpha
      c.fillStyle = '#000000'
      c.beginPath()
      c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
      c.fill()
      c.restore()
    },

    bgGradient(c, stage, from, to) {
      const key = `${stage.width}x${stage.height}|${from}|${to}`
      if (gradCache === null || gradCache.key !== key) {
        const grad = c.createLinearGradient(0, 0, 0, stage.height)
        grad.addColorStop(0, from)
        grad.addColorStop(1, to)
        gradCache = { key, grad }
      }
      c.fillStyle = gradCache.grad
      c.fillRect(0, 0, stage.width, stage.height)
    },

    /** 가장자리를 어둡게 눌러 시선을 가운데로 모은다(규칙 1). */
    vignette(c, stage, alpha = 0.22) {
      const cx = stage.width / 2
      const cy = stage.height / 2
      const r = Math.hypot(cx, cy)
      const g = c.createRadialGradient(cx, cy, r * 0.55, cx, cy, r)
      g.addColorStop(0, 'rgba(0,0,0,0)')
      g.addColorStop(1, `rgba(0,0,0,${alpha})`)
      c.fillStyle = g
      c.fillRect(0, 0, stage.width, stage.height)
    },

    /** 게이지(각도·파워·당김). `ratio` 는 0~1 로 잘린다. */
    gauge(c, x, y, w, h, ratio, color) {
      const p = palette()
      const t = clamp(ratio, 0, 1)
      c.save()
      kit.roundRect(c, x, y, w, h, h / 2)
      c.fillStyle = p.surface2
      c.fill()
      if (t > 0) {
        kit.roundRect(c, x, y, Math.max(h, w * t), h, h / 2)
        c.fillStyle = color
        c.fill()
      }
      c.lineWidth = 1
      c.strokeStyle = p.border
      kit.roundRect(c, x, y, w, h, h / 2)
      c.stroke()
      c.restore()
    },

    text(c, s, x, y, o: TextOptions) {
      const p = palette()
      c.save()
      if (o.alpha !== undefined) c.globalAlpha = o.alpha
      c.fillStyle = o.color
      c.font = `${o.weight ?? 600} ${o.size}px ${p.fontSans}`
      c.textAlign = o.align ?? 'center'
      c.textBaseline = 'middle'
      c.fillText(s, x, y)
      c.restore()
    },

    particles: (max) => createParticleField(max),

    clamp,
    lerp,
    approach(current, target, maxDelta) {
      const d = target - current
      if (Math.abs(d) <= maxDelta) return target
      return current + Math.sign(d) * maxDelta
    },
    easeOutCubic(t) {
      const u = 1 - clamp(t, 0, 1)
      return 1 - u * u * u
    },
    ellipseHit(px, py, cx, cy, rx, ry) {
      if (rx <= 0 || ry <= 0) return false
      const dx = (px - cx) / rx
      const dy = (py - cy) / ry
      return dx * dx + dy * dy <= 1
    },
  }

  return kit
}

/**
 * 풀링된 파티클.
 *
 * ⚠ **루프 안에서 객체를 만들지 않는다.** 배열을 미리 할당해 두고 살아 있는 개수만 옮긴다.
 *   미니게임에서 GC 스파이크는 곧 프레임 끊김이다.
 * ⚠ 상한을 넘으면 오래된 것부터 재사용한다 — 무한 생성으로 프레임을 잃느니 조금 덜 화려한
 *   편이 낫다.
 */
function createParticleField(max: number): ParticleField {
  const n = Math.max(1, Math.floor(max))
  const px = new Float32Array(n)
  const py = new Float32Array(n)
  const vx = new Float32Array(n)
  const vy = new Float32Array(n)
  const life = new Float32Array(n)
  const maxLife = new Float32Array(n)
  const size = new Float32Array(n)
  const color: string[] = new Array(n).fill('#ffffff')
  let head = 0
  let live = 0

  /*
    난수를 쓰지만 브라우저 표준 난수는 금지다. 파티클은 배경 연출이라 재현성이 필요 없지만,
    검증 게이트가 `src/games/` 전체를 훑으므로 규칙을 지킨다. 자체 카운터 기반 해시를 쓴다.
  */
  let noise = 0x9e3779b9
  const rand = () => {
    noise = (noise + 0x6d2b79f5) >>> 0
    let t = Math.imul(noise ^ (noise >>> 15), 1 | noise)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  return {
    get live() {
      return live
    },
    burst(x, y, count, c, spread = 90) {
      for (let i = 0; i < count; i += 1) {
        const idx = head
        head = (head + 1) % n
        if (life[idx] <= 0) live += 1
        const angle = rand() * Math.PI * 2
        const speed = spread * (0.35 + rand() * 0.65)
        px[idx] = x
        py[idx] = y
        vx[idx] = Math.cos(angle) * speed
        vy[idx] = Math.sin(angle) * speed - spread * 0.3
        maxLife[idx] = 0.5 + rand() * 0.5
        life[idx] = maxLife[idx]
        size[idx] = 1.5 + rand() * 2.5
        color[idx] = c
      }
    },
    update(dt) {
      let alive = 0
      for (let i = 0; i < n; i += 1) {
        if (life[i] <= 0) continue
        life[i] -= dt
        if (life[i] <= 0) continue
        vy[i] += 420 * dt // 중력
        px[i] += vx[i] * dt
        py[i] += vy[i] * dt
        alive += 1
      }
      live = alive
    },
    draw(c) {
      if (live === 0) return
      c.save()
      for (let i = 0; i < n; i += 1) {
        if (life[i] <= 0) continue
        c.globalAlpha = Math.max(0, life[i] / maxLife[i])
        c.fillStyle = color[i]
        c.beginPath()
        c.arc(px[i], py[i], size[i], 0, Math.PI * 2)
        c.fill()
      }
      c.restore()
    },
    clear() {
      life.fill(0)
      live = 0
    },
  }
}
