'use client'

/**
 * 히어로 배경 셰이더 캔버스 — raw WebGL2, 외부 라이브러리 0.
 *
 * ── 설계의 핵심: 폴백이 기본값이다 ──────────────────────────
 * 래퍼 div 의 CSS 그라디언트가 **항상 그려져 있고**, 캔버스는 첫 프레임을 성공적으로
 * 그린 뒤에만 `.is-ready` 로 페이드인한다. 그래서 WebGL 미지원·초기화 실패·컨텍스트
 * 로스트 어느 경우에도 화면이 비지 않고, `next/dynamic({ssr:false})` 없이도 레이아웃
 * 시프트가 생기지 않는다(캔버스는 absolute inset:0).
 *
 * ── rAF 를 멈추는 네 조건 ────────────────────────────────
 *   1. 화면 밖         IntersectionObserver
 *   2. 탭 비활성       visibilitychange (백그라운드 rAF 정책은 브라우저마다 다르다)
 *   3. reduced-motion  한 프레임만 그리고 정지 — 정지 이미지처럼 보인다
 *   4. 컨텍스트 로스트 preventDefault 후 그라디언트로 복귀
 *
 * ⚠ cleanup 에서 `WEBGL_lose_context.loseContext()` 를 반드시 부른다. 빼면 이 라우트를
 *   여러 번 드나들 때 브라우저의 컨텍스트 한도(대략 16개)에 걸려 **다른 캔버스까지 죽는다.**
 *   dev 는 StrictMode 로 effect 가 두 번 도므로 이 버그가 즉시 드러난다 — 조기 경보다.
 */

import { useEffect, useRef } from 'react'

import { FRAG_SRC, VERT_SRC } from './shader.glsl'

/** 셰이더가 저주파라 해상도를 낮춰도 티가 나지 않는다. 픽셀 비용은 제곱으로 준다. */
const RENDER_SCALE_DESKTOP = 0.75
const RENDER_SCALE_MOBILE = 0.6
/** 총 픽셀 상한. 고해상도 태블릿에서 폭주하는 것을 막는다. */
const MAX_PIXELS = 1_600_000

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, src)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    // 조용히 실패하면 원인 추적이 불가능하다. 화면은 폴백으로 넘어간다.
    console.warn('[hb-shader] 컴파일 실패:', gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }
  return shader
}

export function HbShaderCanvas({ seed = 0 }: { seed?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    /*
      failIfMajorPerformanceCaveat 가 소프트웨어 래스터라이저(SwiftShader 등)를 자동으로
      탈락시킨다 — 저사양 폴백을 조건문 없이 얻는 방법이다. webgl2 가 없으면 webgl1 으로
      재시도하지 않는다. 셰이더를 두 벌 유지할 만한 가치가 없고, 폴백 그라디언트가 이미
      충분히 보기 좋다.
    */
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'low-power',
      failIfMajorPerformanceCaveat: true,
    })
    if (!gl) return

    const vert = compile(gl, gl.VERTEX_SHADER, VERT_SRC)
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC)
    const program = vert && frag ? gl.createProgram() : null
    if (!vert || !frag || !program) return

    gl.attachShader(program, vert)
    gl.attachShader(program, frag)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn('[hb-shader] 링크 실패:', gl.getProgramInfoLog(program))
      return
    }
    // 링크 후 셰이더 객체는 프로그램이 참조를 쥐고 있어 지워도 된다.
    gl.deleteShader(vert)
    gl.deleteShader(frag)
    gl.useProgram(program)

    const uTime = gl.getUniformLocation(program, 'u_time')
    const uRes = gl.getUniformLocation(program, 'u_res')
    const uSeed = gl.getUniformLocation(program, 'u_seed')
    gl.uniform1f(uSeed, seed)

    // 알파 합성. 캔버스 아래의 CSS 그라디언트와 자연스럽게 겹치게 한다.
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    gl.clearColor(0, 0, 0, 0)

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')

    let raf = 0
    let lastFrameMs = 0
    /** 벽시계가 아니라 **누적 델타**다. 탭 복귀 시 애니메이션이 점프하는 것을 막는다. */
    let elapsedMs = 0
    let onScreen = true
    let contextLost = false
    let ready = false

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return false

      const mobile = window.innerWidth < 640
      const scale = mobile ? RENDER_SCALE_MOBILE : RENDER_SCALE_DESKTOP
      // 코어 수는 저사양 기기의 거친 힌트다. 정확하지 않지만 없는 것보다 낫다.
      const lowEnd = (navigator.hardwareConcurrency ?? 8) <= 4
      let dpr = Math.min(window.devicePixelRatio || 1, lowEnd ? 1 : 2)

      let w = Math.round(rect.width * dpr * scale)
      let h = Math.round(rect.height * dpr * scale)
      if (w * h > MAX_PIXELS) {
        const k = Math.sqrt(MAX_PIXELS / (w * h))
        w = Math.round(w * k)
        h = Math.round(h * k)
      }

      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
        gl.viewport(0, 0, w, h)
      }
      return true
    }

    const render = () => {
      if (contextLost) return
      gl.uniform2f(uRes, canvas.width, canvas.height)
      gl.uniform1f(uTime, elapsedMs / 1000)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.drawArrays(gl.TRIANGLES, 0, 3)

      // 첫 프레임이 실제로 그려진 뒤에야 캔버스를 드러낸다.
      if (!ready) {
        ready = true
        canvas.classList.add('is-ready')
      }
    }

    const frame = (now: number) => {
      raf = 0
      if (!onScreen || document.hidden || contextLost) return
      // 탭 복귀·긴 프레임에서 시간이 튀지 않게 델타에 상한을 건다.
      const dt = lastFrameMs ? Math.min(now - lastFrameMs, 50) : 16
      lastFrameMs = now
      elapsedMs += dt
      render()
      raf = requestAnimationFrame(frame)
    }

    const start = () => {
      if (raf || contextLost) return
      // reduced-motion 이면 움직이지 않는 한 장만 남긴다. 정보는 배경에 없으므로 손실이 없다.
      if (motionQuery.matches) {
        if (resize()) render()
        return
      }
      lastFrameMs = 0
      raf = requestAnimationFrame(frame)
    }

    const stop = () => {
      if (raf) cancelAnimationFrame(raf)
      raf = 0
    }

    const onVisibility = () => (document.hidden ? stop() : start())
    const onMotionChange = () => {
      stop()
      start()
    }
    const onLost = (e: Event) => {
      // preventDefault 를 해야 restore 이벤트가 온다.
      e.preventDefault()
      contextLost = true
      ready = false
      canvas.classList.remove('is-ready') // CSS 그라디언트로 복귀
      stop()
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting
        if (onScreen) start()
        else stop()
      },
      { threshold: 0 },
    )
    io.observe(canvas)

    /*
      모바일 주소창이 접히고 펼쳐질 때 리사이즈가 초당 수십 번 온다. rAF 로 코얼레싱하고,
      크기가 실제로 바뀐 경우에만 버퍼를 다시 잡는다(resize 내부에서 비교).
    */
    let resizeRaf = 0
    const ro = new ResizeObserver(() => {
      if (resizeRaf) return
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = 0
        if (resize() && (motionQuery.matches || !raf)) render()
      })
    })
    ro.observe(canvas)

    document.addEventListener('visibilitychange', onVisibility)
    motionQuery.addEventListener('change', onMotionChange)
    canvas.addEventListener('webglcontextlost', onLost)

    resize()
    start()

    return () => {
      stop()
      if (resizeRaf) cancelAnimationFrame(resizeRaf)
      io.disconnect()
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      motionQuery.removeEventListener('change', onMotionChange)
      canvas.removeEventListener('webglcontextlost', onLost)
      gl.deleteProgram(program)
      // ★ 컨텍스트를 명시적으로 반납한다. 이 줄이 빠지면 컨텍스트가 고갈된다.
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  }, [seed])

  return (
    // 장식이다. 정보는 전부 옆 텍스트와 격자가 전달한다.
    <div className="hb-shader" aria-hidden="true">
      <canvas ref={canvasRef} className="hb-shader-gl" />
    </div>
  )
}
