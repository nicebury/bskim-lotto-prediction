import type { GameSlug } from '@/games/core/types'

/**
 * 진행 중인 판을 **탭이 살아 있는 동안만** 붙들어 둔다.
 *
 * → docs/wiki/20-design/playground.md "진행 중 이탈·새로고침"
 *
 * 근거는 [[number-analysis-page]] 와 `lib/reco-store.ts` 가 세운 것과 같다 — 탭 수명과
 * 정확히 일치하고, 하드 내비게이션에서도 살아남는다.
 *
 * ⚠ 읽기·쓰기를 전부 `try/catch` 로 감싼다 — 사파리 시크릿 모드는 **쓰기에서 예외를 던진다.**
 * ⚠ 모양이 다르면 조용히 버린다. 배포로 타입이 바뀐 뒤 낡은 JSON 이 남아 있을 수 있다.
 */

/** ⚠ `v` 를 올리면 옛 기록이 자동으로 버려진다. 모양을 바꿀 때 반드시 올린다. */
interface SavedRun {
  v: 1
  numbers: number[]
  complete: boolean
  at: number
}

/** 미완 기록의 수명. 30분이 지나면 이어서 하기보다 새로 하는 편이 자연스럽다. */
const STALE_MS = 30 * 60 * 1000

const keyOf = (slug: GameSlug) => `lucky:playground:${slug}`

export function saveRun(slug: GameSlug, numbers: number[], complete: boolean): void {
  try {
    const payload: SavedRun = { v: 1, numbers, complete, at: Date.now() }
    sessionStorage.setItem(keyOf(slug), JSON.stringify(payload))
  } catch {
    /* 시크릿 모드·용량 초과. 복원을 포기할 뿐 게임은 정상이다. */
  }
}

export function loadRun(slug: GameSlug): { numbers: number[]; complete: boolean } | null {
  try {
    const raw = sessionStorage.getItem(keyOf(slug))
    if (raw === null) return null

    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const v = parsed as Partial<SavedRun>
    if (v.v !== 1 || !Array.isArray(v.numbers) || typeof v.complete !== 'boolean') return null

    // 번호가 하나라도 이상하면 통째로 버린다. 반쯤 맞는 기록으로 화면을 그리지 않는다.
    if (!v.numbers.every((n) => Number.isInteger(n) && n >= 1 && n <= 45)) return null
    if (v.numbers.length > 6) return null

    /** ⚠ **완료된 기록은 시간과 무관하게 지킨다.** 모은 번호를 잃게 하지 않는다(ADR 0014). */
    if (!v.complete && typeof v.at === 'number' && Date.now() - v.at > STALE_MS) return null

    return { numbers: v.numbers, complete: v.complete }
  } catch {
    return null
  }
}

/* ────────────────────────────────────────────────────────────
 * 효과음 음소거 설정
 *
 * ⚠ 판 기록과 달리 **`localStorage`** 다. 취향은 탭을 닫아도 남아야 한다 — 매번 다시 켜게
 *   하면 그것이 곧 "끄고 싶다" 는 신호를 무시하는 일이다.
 * ⚠ **기본은 음소거(`true`)다.** 저장된 값이 없거나 읽을 수 없으면 소리를 내지 않는다.
 *   소리가 나야 하는데 안 나는 것보다, 안 나야 하는데 나는 편이 훨씬 나쁘다.
 * ──────────────────────────────────────────────────────────── */

const MUTE_KEY = 'lucky:playground:muted'

export function saveMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
  } catch {
    /* 시크릿 모드. 이번 세션에만 적용되고 게임은 정상이다. */
  }
}

export function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) !== '0'
  } catch {
    return true
  }
}
