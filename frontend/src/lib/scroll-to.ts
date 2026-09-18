/**
 * 결과가 나온 자리로 화면을 옮긴다.
 *
 * ── 왜 필요한가 ────────────────────────────────────────────────────
 * 2026-09-18 사용자 요청: "시뮬레이션 후에 번호가 나오면 화면이 전체복사 있는 데로 이동하게".
 * 버튼이 화면 위쪽에 있고 결과는 그 아래에 그려지는데, 팝업이 닫히고 나면 사용자는 **여전히
 * 설정 화면을 보고 있다.** 스스로 내려야 결과가 보이니 "뽑혔나?" 가 된다.
 *
 * ⚠ **움직임을 줄인 사용자에게는 부드럽게 움직이지 않는다.** 화면이 저 혼자 흐르는 것은
 *   멀미를 부르는 대표적인 동작이라 `prefers-reduced-motion` 을 반드시 본다.
 * ⚠ 헤더가 `position: sticky` 라 목표 요소를 화면 맨 위에 붙이면 헤더에 가린다. 위치 계산
 *   대신 **대상 요소의 `scroll-margin-top`**(CSS)에 맡긴다 — 브라우저가 알아서 띄워 준다.
 * ⚠ 렌더 직후에 부르면 아직 DOM 에 없을 수 있다. 호출부는 `requestAnimationFrame` 안에서
 *   부르거나, 이 함수에 요소가 생긴 뒤 부르는 책임을 진다.
 */
export function scrollToResult(target: HTMLElement | null): void {
  if (!target) return
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
}

/**
 * 다음 페인트 뒤에 스크롤한다. 결과를 그린 **직후** 부르는 자리에서 쓴다.
 *
 * ⚠ `rAF` 를 두 번 겹친다. 한 번만 하면 React 가 DOM 을 막 붙인 시점이라 요소의 최종 높이가
 *   아직 정해지지 않아(이미지·격자) 목표 위치가 어긋난다.
 */
export function scrollToResultSoon(getTarget: () => HTMLElement | null): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => scrollToResult(getTarget()))
  })
}
