/**
 * 추천 번호 내보내기 — 복사 · 이미지 저장 · 공유.
 *
 * 전부 **브라우저에서만** 동작한다. 서버 컴포넌트에서 부르지 않는다.
 *
 * ★ 공유 문구에도 금지 표현을 쓰지 않는다(초안 10.3). 이 파일이 만드는 모든 텍스트와
 *   이미지에는 "통계와 AI를 활용한 시뮬레이션이며 당첨을 보장하지 않습니다" 가 따라붙는다. 링크가
 *   단독으로 떠돌 때 그것만 보고 판매·예측 사이트로 오해하는 것을 막는다.
 */
import { ballRange } from './lotto'

const DISCLAIMER_LINE = '통계와 AI를 활용한 시뮬레이션이며 당첨을 보장하지 않습니다.'

/** 볼 5구간 색. CSS 변수는 canvas 에서 못 읽으므로 여기에 한 벌 둔다. */
const BALL_COLORS: Record<number, string> = {
  1: '#FBC400',
  2: '#69C8F2',
  3: '#FF7272',
  4: '#AAAAAA',
  5: '#B0D840',
}

/* ────────────────────────────────────────────────────────────
 * 텍스트
 * ──────────────────────────────────────────────────────────── */

/**
 * 공유·복사용 문구.
 *
 * 번호를 ` · ` 로 잇는다. 쉼표보다 눈에 덜 걸리고, 메모장에 붙여넣어도 읽힌다.
 */
export function buildShareText(params: {
  numbers: number[]
  strategyLabel: string
  siteName: string
  url?: string
}): string {
  const lines = [
    `${params.siteName} 추천 번호 · ${params.strategyLabel}`,
    params.numbers.join(' · '),
    '',
    DISCLAIMER_LINE,
  ]
  if (params.url) lines.push(params.url)
  return lines.join('\n')
}

/**
 * 클립보드 복사.
 *
 * `navigator.clipboard` 는 보안 컨텍스트(https 또는 localhost)에서만 동작한다. 안 되면
 * 예전 방식(`execCommand`)으로 떨어진다 — 사파리 구버전과 http 로 접속한 사내망에서 필요하다.
 */
/**
 * 여러 조합을 한 번에 옮길 때의 문구.
 *
 * 조합마다 따로 복사하면 붙여넣은 쪽에서 어느 것이 몇 번째인지 알 수 없다. 번호를 매기고
 * 면책은 **맨 아래 한 번만** 붙인다 — 조합마다 반복하면 정작 번호가 묻힌다.
 */
export function buildShareTextAll(params: {
  sets: number[][]
  strategyLabel: string
  siteName: string
  url?: string
}): string {
  const lines = [`${params.siteName} 추천 번호 · ${params.strategyLabel} · ${params.sets.length}조합`, '']
  params.sets.forEach((numbers, i) => {
    lines.push(`${i + 1}. ${numbers.join(' · ')}`)
  })
  lines.push('', DISCLAIMER_LINE)
  if (params.url) lines.push(params.url)
  return lines.join('\n')
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* 권한 거부 등 — 아래 폴백으로 간다 */
  }

  try {
    const area = document.createElement('textarea')
    area.value = text
    // 화면 밖에 두되 display:none 은 쓰지 않는다. 선택이 되지 않는다.
    area.style.position = 'fixed'
    area.style.opacity = '0'
    area.style.pointerEvents = 'none'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    return ok
  } catch {
    return false
  }
}

/* ────────────────────────────────────────────────────────────
 * 이미지
 * ──────────────────────────────────────────────────────────── */

const SIZE = 1080

/**
 * 추천 번호를 정사각 카드 이미지로 그린다.
 *
 * 1080×1080 인 이유: 카카오톡·인스타그램이 정사각을 자르지 않고, 저장해 두었다가 나중에
 * 봐도 번호가 또렷하다. 가로 이미지는 메신저에서 위아래가 잘린다.
 *
 * html2canvas 같은 라이브러리를 쓰지 않는다. 그리는 것이 원 6개와 글자 몇 줄뿐이라
 * 200KB 짜리 의존성을 들일 이유가 없다.
 *
 * ⚠ 웹폰트가 도착하기 전에 그리면 시스템 폰트로 렌더링된다. `document.fonts.ready` 를
 *   기다린 뒤 그린다.
 */
export async function drawNumbersImage(params: {
  numbers: number[]
  strategyLabel: string
  siteName: string
  url?: string
  /** 조합 성향 한 줄("홀짝 3:3 · 고저 2:4 · 합계 135"). 볼 아래에 놓는다. */
  subtitle?: string
}): Promise<Blob | null> {
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  // 화면과 같은 글꼴로 그린다. next/font 가 만든 해시 패밀리명을 직접 알 수 없으므로
  // 실제 계산된 값을 가져온다.
  await document.fonts.ready
  const family = getComputedStyle(document.body).fontFamily || 'sans-serif'

  // 배경 — 히어로와 같은 대각 그라디언트
  const bg = ctx.createLinearGradient(0, 0, SIZE, SIZE)
  bg.addColorStop(0, '#EEF0FB')
  bg.addColorStop(1, '#F5F0FC')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, SIZE, SIZE)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  // 사이트명
  ctx.fillStyle = '#1A1D2E'
  ctx.font = `800 60px ${family}`
  ctx.fillText(params.siteName, SIZE / 2, 180)

  // 전략 라벨 — 알약 배경 위 흰 글자
  ctx.font = `700 34px ${family}`
  const labelWidth = ctx.measureText(params.strategyLabel).width + 64
  roundRect(ctx, (SIZE - labelWidth) / 2, 250, labelWidth, 64, 32)
  ctx.fillStyle = '#3B4FD8'
  ctx.fill()
  ctx.fillStyle = '#FFFFFF'
  ctx.fillText(params.strategyLabel, SIZE / 2, 283)

  // 볼 6개 — 한 줄. 지름과 간격은 1080 폭에 맞춰 계산한다.
  const count = params.numbers.length
  const gap = 20
  const diameter = Math.min(148, (SIZE - 120 - gap * (count - 1)) / count)
  const radius = diameter / 2
  const totalWidth = count * diameter + gap * (count - 1)
  let x = (SIZE - totalWidth) / 2 + radius
  const y = 560

  for (const n of params.numbers) {
    // 바깥 원 = 구간 색
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fillStyle = BALL_COLORS[ballRange(n)]
    ctx.fill()

    // 흰 원판 — 실제 로또 볼이 그렇다. 그래서 숫자 색이 구간과 무관하게 하나다.
    ctx.beginPath()
    ctx.arc(x, y, radius * 0.64, 0, Math.PI * 2)
    ctx.fillStyle = '#FFFFFF'
    ctx.fill()

    ctx.fillStyle = '#1A1D2E'
    ctx.font = `800 ${Math.round(radius * 0.78)}px ${family}`
    ctx.fillText(String(n), x, y + 2)

    x += diameter + gap
  }

  // 조합 성향. 볼과 면책 사이의 빈 공간을 정보로 채운다.
  if (params.subtitle) {
    ctx.fillStyle = '#6B7280'
    ctx.font = `500 32px ${family}`
    ctx.fillText(params.subtitle, SIZE / 2, 730)
  }

  // 면책 — 이미지가 어디로 퍼지든 함께 간다
  ctx.fillStyle = '#6B7280'
  ctx.font = `500 30px ${family}`
  ctx.fillText(DISCLAIMER_LINE, SIZE / 2, 890)

  if (params.url) {
    ctx.fillStyle = '#98A2B3'
    ctx.font = `400 26px ${family}`
    ctx.fillText(params.url, SIZE / 2, 950)
  }

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'))
}

/**
 * 여러 조합을 한 장에 그린다.
 *
 * `drawNumbersImage` 는 정사각형 한 장에 조합 하나를 크게 그린다. 조합이 여럿이면 그 배치를
 * 반복할 수 없으므로(열 장이면 열 장의 파일이 된다) **세로로 긴 한 장**에 줄줄이 그린다.
 *
 * ⚠ 높이는 조합 수에 따라 달라진다. 캔버스 크기를 먼저 정하고 그려야 하므로 레이아웃 상수를
 *   위에 모아 둔다 — 나중에 여백을 만질 때 한 곳만 고치면 된다.
 * ⚠ 볼 그리는 방식(바깥 구간색 원 + 흰 원판 + 어두운 숫자)은 `drawNumbersImage` 와 같아야
 *   한다. 두 이미지가 나란히 공유될 수 있는데 모양이 다르면 다른 서비스처럼 보인다.
 */
export async function drawSetsImage(params: {
  sets: number[][]
  strategyLabel: string
  siteName: string
  url?: string
}): Promise<Blob | null> {
  const HEAD = 300
  const ROW = 132
  const FOOT = 180
  const PAD = 60

  const rows = params.sets.length
  if (rows === 0) return null

  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = HEAD + rows * ROW + FOOT
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  await document.fonts.ready
  const family = getComputedStyle(document.body).fontFamily || 'sans-serif'

  const bg = ctx.createLinearGradient(0, 0, SIZE, canvas.height)
  bg.addColorStop(0, '#EEF0FB')
  bg.addColorStop(1, '#F5F0FC')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, SIZE, canvas.height)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  ctx.fillStyle = '#1A1D2E'
  ctx.font = `800 56px ${family}`
  ctx.fillText(params.siteName, SIZE / 2, 108)

  ctx.font = `700 32px ${family}`
  const labelText = `${params.strategyLabel} · ${rows}조합`
  const labelWidth = ctx.measureText(labelText).width + 60
  roundRect(ctx, (SIZE - labelWidth) / 2, 168, labelWidth, 60, 30)
  ctx.fillStyle = '#3B4FD8'
  ctx.fill()
  ctx.fillStyle = '#FFFFFF'
  ctx.fillText(labelText, SIZE / 2, 199)

  // 조합 줄 — 왼쪽에 순번, 그 오른쪽으로 볼 여섯 개
  const indexW = 70
  const gap = 16
  const diameter = Math.min(96, (SIZE - PAD * 2 - indexW - gap * 5) / 6)
  const radius = diameter / 2

  params.sets.forEach((numbers, i) => {
    const y = HEAD + i * ROW + ROW / 2

    // 줄 배경 — 짝수/홀수를 나누지 않는다. 번호가 주인공이고 줄무늬는 시선을 뺏는다.
    roundRect(ctx, PAD, y - ROW / 2 + 10, SIZE - PAD * 2, ROW - 20, 24)
    ctx.fillStyle = 'rgba(255,255,255,0.72)'
    ctx.fill()

    ctx.textAlign = 'center'
    ctx.fillStyle = '#647188'
    ctx.font = `700 30px ${family}`
    ctx.fillText(String(i + 1), PAD + indexW / 2 + 10, y + 1)

    let x = PAD + indexW + 10 + radius
    for (const n of numbers) {
      ctx.beginPath()
      ctx.arc(x, y, radius, 0, Math.PI * 2)
      ctx.fillStyle = BALL_COLORS[ballRange(n)]
      ctx.fill()

      ctx.beginPath()
      ctx.arc(x, y, radius * 0.64, 0, Math.PI * 2)
      ctx.fillStyle = '#FFFFFF'
      ctx.fill()

      ctx.fillStyle = '#1A1D2E'
      ctx.font = `800 ${Math.round(radius * 0.8)}px ${family}`
      ctx.fillText(String(n), x, y + 2)

      x += diameter + gap
    }
  })

  // 면책 — 이미지가 어디로 퍼지든 함께 간다
  const footY = HEAD + rows * ROW
  ctx.textAlign = 'center'
  ctx.fillStyle = '#6B7280'
  ctx.font = `500 28px ${family}`
  ctx.fillText(DISCLAIMER_LINE, SIZE / 2, footY + 60)

  if (params.url) {
    ctx.fillStyle = '#98A2B3'
    ctx.font = `400 24px ${family}`
    ctx.fillText(params.url, SIZE / 2, footY + 112)
  }

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'))
}

/** 캔버스에 둥근 사각형 경로를 만든다(구형 사파리에 roundRect 가 없다). */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + width, y, x + width, y + height, radius)
  ctx.arcTo(x + width, y + height, x, y + height, radius)
  ctx.arcTo(x, y + height, x, y, radius)
  ctx.arcTo(x, y, x + width, y, radius)
  ctx.closePath()
}

/** Blob 을 파일로 내려받는다. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  // 즉시 해제하면 사파리에서 다운로드가 취소된다. 한 틱 뒤에 정리한다.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/* ────────────────────────────────────────────────────────────
 * 공유
 * ──────────────────────────────────────────────────────────── */

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed'

/**
 * 공유. 결과를 알려 주어야 호출부가 알맞은 피드백을 낸다.
 *
 * - `shared`    OS 공유 시트로 넘어갔다(모바일).
 * - `copied`    공유를 지원하지 않아 클립보드로 대신했다(대부분의 데스크톱).
 * - `cancelled` 사용자가 공유 시트를 닫았다. **실패가 아니다** — 오류를 띄우지 않는다.
 * - `failed`    둘 다 안 됐다.
 *
 * 카카오톡 SDK 를 쓰지 않는 이유: 앱키가 필요하고 외부 스크립트가 하나 더 붙으며,
 * 개인정보처리방침에 제3자 스크립트를 명시해야 한다. Web Share API 로 열리는 OS 시트에
 * 이미 카카오톡이 들어 있다.
 */
/**
 * 여러 조합을 한 번에 공유한다. 동작 규칙은 `shareNumbers` 와 같다.
 * 텍스트 생성만 `buildShareTextAll` 로 갈아 끼운 것이다.
 */
export async function shareSets(params: {
  sets: number[][]
  strategyLabel: string
  siteName: string
  url?: string
  image?: Blob | null
}): Promise<ShareOutcome> {
  const text = buildShareTextAll(params)
  const title = `${params.siteName} 추천 번호 ${params.sets.length}조합`

  if (typeof navigator.share === 'function') {
    try {
      if (params.image && typeof navigator.canShare === 'function') {
        const file = new File([params.image], 'haengunsangja-numbers.png', { type: 'image/png' })
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ title, text, files: [file] })
          return 'shared'
        }
      }
      await navigator.share({ title, text, url: params.url })
      return 'shared'
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled'
    }
  }

  return (await copyText(text)) ? 'copied' : 'failed'
}

export async function shareNumbers(params: {
  numbers: number[]
  strategyLabel: string
  siteName: string
  url?: string
  /** 있으면 이미지도 함께 공유를 시도한다. */
  image?: Blob | null
}): Promise<ShareOutcome> {
  const text = buildShareText(params)
  const title = `${params.siteName} 추천 번호`

  if (typeof navigator.share === 'function') {
    try {
      // 이미지 공유는 지원 여부를 따로 물어야 한다. 안 되면 텍스트만 보낸다.
      if (params.image && typeof navigator.canShare === 'function') {
        const file = new File([params.image], 'haengunsangja-numbers.png', { type: 'image/png' })
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ title, text, files: [file] })
          return 'shared'
        }
      }
      await navigator.share({ title, text, url: params.url })
      return 'shared'
    } catch (err) {
      // 사용자가 시트를 닫으면 AbortError 가 난다. 오류가 아니다.
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled'
      // 그 밖의 실패는 복사로 만회한다.
    }
  }

  return (await copyText(text)) ? 'copied' : 'failed'
}
