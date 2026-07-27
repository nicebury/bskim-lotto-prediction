/**
 * 사이트 심볼.
 *
 * 파비콘(`src/app/icon.svg`)과 **같은 도형**이다. 브라우저 탭에서 본 아이콘과 페이지 안의
 * 로고가 다르면 같은 사이트라는 감각이 약해진다. 도형을 바꿀 때는 두 곳을 함께 고친다.
 *
 * 색은 브랜드 고정값이다. 다크 모드에서도 바뀌지 않는다 — 파비콘은 OS 테마를 따르지 않으므로
 * 둘을 일치시키려면 로고도 고정해야 한다. 볼 색은 동행복권 공식 5구간 중 넷을 쓴다.
 *
 * 순수 장식이 아니다. 로고 옆에 사이트명이 글자로 함께 있으므로 접근성 트리에서는 숨긴다.
 */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      className="logo-mark"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="64" height="64" rx="14" fill="#3B4FD8" />
      <circle cx="23" cy="24" r="8" fill="#FBC400" />
      <circle cx="41" cy="22" r="6.5" fill="#69C8F2" />
      <circle cx="28" cy="41" r="9" fill="#FF7272" />
      <circle cx="44" cy="39" r="6" fill="#B0D840" />
    </svg>
  )
}
