import type { BallRangeKey, Palette, ServiceAccent } from './types'

/**
 * 캔버스에서 디자인 토큰 쓰기.
 *
 * → docs/wiki/10-contracts/playground-game-contract.md "팔레트" 절
 *
 * ── 왜 읽어 오는가 ─────────────────────────────────────────────────
 * `lib/share.ts` 는 볼 색 hex 를 하드코딩해 두었다. 그것은 **오프스크린 캔버스라 `document`
 * 에 붙어 있지 않아서**다. 놀이터 캔버스는 DOM 에 붙으므로 사정이 다르다.
 *
 * 덕분에 **게임 코드에 hex 리터럴이 하나도 없고**, 다크모드가 캔버스 안까지 저절로 따라온다.
 *
 * ⚠ **폴백을 반드시 둔다.** 토큰이 비면 `fillStyle = ''` 이 되어 이전 색이 그대로 쓰이거나
 *   검게 나온다. 어느 쪽이든 원인을 찾기 어려운 화면이 된다. `--svc-play` 는 2026-09-08
 *   기준 아직 `tokens.css` 에 없어(전역 연결 단계에서 추가) 폴백이 실제로 쓰인다.
 */

/** 토큰이 비었을 때 쓰는 값. 화면이 깨지는 것보다 낫다. */
const FALLBACK = {
  bg: '#f4f6fb',
  surface: '#ffffff',
  surface2: '#f0f3f9',
  border: '#dfe3ec',
  text: '#1a1d2e',
  textMuted: '#626875',
  primary: '#3f4ed6',
  onAccent: '#ffffff',
  success: '#1f9d55',
  warning: '#b7791f',
  danger: '#d64545',
  info: '#2b6cb0',
  /** 공식 5구간([[0009-official-ball-colors-over-mockup]]). */
  ball: { 1: '#fbc400', 2: '#69c8f2', 3: '#ff7272', 4: '#aaaaaa', 5: '#b0d840' },
  ballFg: '#ffffff',
  ballFgDark: '#1a1d2e',
  /** ⚠ `--svc-play` 가 아직 없다. 청록 계열 임시값 — 토큰이 생기면 자동으로 그쪽을 쓴다. */
  play: '#0e9594',
  fontSans:
    "'Pretendard', -apple-system, BlinkMacSystemFont, system-ui, 'Segoe UI', Roboto, sans-serif",
} as const

const SVC_KEYS: readonly ServiceAccent[] = ['lotto', 'stats', 'reco', 'dream', 'news', 'play']
const BALL_TOKENS: Record<BallRangeKey, string> = {
  1: '--ball-1-10',
  2: '--ball-11-20',
  3: '--ball-21-30',
  4: '--ball-31-40',
  5: '--ball-41-45',
}

function readVar(styles: CSSStyleDeclaration, name: string, fallback: string): string {
  const v = styles.getPropertyValue(name).trim()
  return v.length > 0 ? v : fallback
}

/** 현재 테마의 토큰을 한 번 수집한다. */
export function readPalette(): Palette {
  /*
    ⚠ 서버에서는 부르지 않는다. 호출부(캔버스 어댑터)가 `'use client'` 안에 있고 마운트
      이후에만 부른다. 그래도 방어해 둔다 — 실수로 서버에서 불러도 폴백으로 선다.
  */
  if (typeof document === 'undefined') {
    return {
      ...FALLBACK,
      svc: {
        lotto: FALLBACK.primary,
        stats: FALLBACK.primary,
        reco: FALLBACK.primary,
        dream: FALLBACK.primary,
        news: FALLBACK.primary,
        play: FALLBACK.play,
      },
      ball: { ...FALLBACK.ball },
    }
  }

  const s = getComputedStyle(document.documentElement)

  const svc = {} as Record<ServiceAccent, string>
  for (const key of SVC_KEYS) {
    svc[key] = readVar(s, `--svc-${key}`, key === 'play' ? FALLBACK.play : FALLBACK.primary)
  }

  const ball = {} as Record<BallRangeKey, string>
  for (const k of [1, 2, 3, 4, 5] as BallRangeKey[]) {
    ball[k] = readVar(s, BALL_TOKENS[k], FALLBACK.ball[k])
  }

  return {
    bg: readVar(s, '--color-bg', FALLBACK.bg),
    surface: readVar(s, '--color-surface', FALLBACK.surface),
    surface2: readVar(s, '--color-surface-2', FALLBACK.surface2),
    border: readVar(s, '--color-border', FALLBACK.border),
    text: readVar(s, '--color-text', FALLBACK.text),
    textMuted: readVar(s, '--color-text-muted', FALLBACK.textMuted),
    primary: readVar(s, '--color-primary', FALLBACK.primary),
    onAccent: readVar(s, '--color-on-accent', FALLBACK.onAccent),
    success: readVar(s, '--color-success', FALLBACK.success),
    warning: readVar(s, '--color-warning', FALLBACK.warning),
    danger: readVar(s, '--color-danger', FALLBACK.danger),
    info: readVar(s, '--color-info', FALLBACK.info),
    svc,
    ball,
    ballFg: readVar(s, '--ball-fg', FALLBACK.ballFg),
    ballFgDark: readVar(s, '--ball-fg-dark', FALLBACK.ballFgDark),
    fontSans: readVar(s, '--font-sans', FALLBACK.fontSans),
  }
}

/**
 * 테마가 바뀔 때마다 새 팔레트를 준다.
 *
 * ⚠ **두 신호를 모두 본다.** 사이트는 `data-theme` 속성(명시적 토글)과
 *   `prefers-color-scheme`(시스템 설정) 두 가지로 테마가 갈린다. 하나만 보면 나머지 경로로
 *   바꿨을 때 캔버스만 옛 색으로 남는다.
 *
 * @returns 구독 해제 함수. 호출부가 언마운트에서 반드시 부른다.
 */
export function watchPalette(onChange: (palette: Palette) => void): () => void {
  if (typeof document === 'undefined') return () => {}

  const emit = () => onChange(readPalette())

  const observer = new MutationObserver(emit)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

  const media = window.matchMedia('(prefers-color-scheme: dark)')
  media.addEventListener('change', emit)

  return () => {
    observer.disconnect()
    media.removeEventListener('change', emit)
  }
}
