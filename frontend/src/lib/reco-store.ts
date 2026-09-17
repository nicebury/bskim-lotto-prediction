/**
 * 추천 결과를 **탭이 살아 있는 동안만** 붙들어 두는 곳.
 *
 * ── 왜 필요한가 ────────────────────────────────────────────────────
 * 추천 결과는 클라이언트 상태(`useState`)에 있다. 분석 화면으로 갔다가 돌아오면 그 상태가
 * 사라져 **빈 화면에서 다시 뽑아야 한다.** 애써 나온 번호가 없어지는 것이라 사용자가 가장
 * 싫어할 실패다(2026-09-01 사용자가 "중요" 로 표시).
 *
 * App Router 는 뒤로가기에서 **스크롤 위치만** 되돌리고 컴포넌트 상태는 복원하지 않는다.
 *
 * ── 왜 `sessionStorage` 인가 ───────────────────────────────────────
 * | 후보 | 왜 아닌가 |
 * |---|---|
 * | 주소에 담기 | 여섯 벌이면 수백 자가 된다. `traits` 까지 붙어 있다 |
 * | `localStorage` | 탭을 닫아도 남는다. 사흘 뒤 들어왔는데 옛 추천이 뜨면 그게 더 이상하다 |
 * | **`sessionStorage`** | 탭이 살아 있는 동안만. "잠깐 분석 보고 온다" 와 수명이 정확히 맞는다 |
 *
 * ⚠ **하드 내비게이션이어도 살아남는다.** 분석 링크는 `AdBreakLink` 라 광고를 켜면 문서를
 *   새로 부르는데, `sessionStorage` 는 그때도 유지된다. 이 설계를 고른 또 하나의 이유다.
 *
 * ── ⚠ 지켜야 할 것 ─────────────────────────────────────────────────
 * - **읽기·쓰기를 전부 `try/catch` 로 감싼다.** 사파리 시크릿 모드는 `sessionStorage`
 *   **쓰기에서 예외를 던진다.** 실패하면 복원을 포기할 뿐 화면은 정상이어야 한다.
 * - **모양이 다르면 조용히 버린다.** 배포로 타입이 바뀐 뒤 낡은 JSON 이 남아 있을 수 있다.
 *   그것으로 화면을 깨뜨리지 않는다.
 * - **"분석" 을 누를 때가 아니라 결과를 받을 때 저장한다.** 누를 때 저장하면 뒤로가기·
 *   스와이프처럼 버튼을 거치지 않는 이동에서 비어 있다.
 */

/** 화면마다 따로 담는다. 6가지 추천 결과가 AI 추천 자리에 복원되면 안 된다. */
export type RecoSlot = 'ai' | 'six' | 'dream'

const KEY: Record<RecoSlot, string> = {
  ai: 'lucky:reco:ai',
  six: 'lucky:reco:six',
  dream: 'lucky:dream',
}

/**
 * 담아 둔다. 실패해도 아무 일도 일어나지 않는다 — 복원이 안 될 뿐이다.
 *
 * ⚠ 제네릭으로 아무 모양이나 받는다. 이 파일은 **보관만** 하고 내용은 해석하지 않는다.
 *   해석은 꺼내 쓰는 화면의 몫이다(그 화면만이 자기 타입을 안다).
 */
export function saveReco(slot: RecoSlot, value: unknown): void {
  try {
    sessionStorage.setItem(KEY[slot], JSON.stringify(value))
  } catch {
    /* 시크릿 모드·용량 초과. 복원을 포기한다. */
  }
}

/**
 * 꺼낸다. 없거나 깨졌으면 `null`.
 *
 * ⚠ `verify` 로 **모양을 확인한 뒤에만** 돌려준다. 낡은 JSON 을 그대로 화면에 넘기면
 *   `undefined.map` 같은 것으로 터진다 — 그것도 하필 사용자가 돌아온 순간에.
 */
export function loadReco<T>(slot: RecoSlot, verify: (value: unknown) => value is T): T | null {
  try {
    const raw = sessionStorage.getItem(KEY[slot])
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return verify(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** 분석 화면으로 가는 주소. 번호는 오름차순으로 맞춰 보낸다(계약의 정규화 규칙과 같다). */
export function analyzeHref(numbers: number[]): string {
  const sorted = [...numbers].sort((a, b) => a - b)
  return `/lotto/analyze?numbers=${sorted.join(',')}`
}
