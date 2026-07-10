/**
 * 다크모드 FOUC(첫 페인트에 라이트가 번쩍이는 현상) 방지 스크립트.
 *
 * 저장된 테마를 읽어 `<html data-theme>` 을 **첫 페인트 전에** 박아야 한다. React 가
 * hydrate 된 뒤에 useEffect 로 바꾸면 이미 라이트 화면이 한 번 그려진 뒤다.
 * 그래서 next/script 가 아니라 `<head>` 안의 동기 인라인 스크립트를 쓴다.
 *
 * 저장값이 'system' 이거나 없으면 속성을 아예 걸지 않는다 — 그러면 CSS 의
 * `@media (prefers-color-scheme: dark)` 가 그대로 동작한다(tokens.css).
 */
const THEME_INIT = `
(function () {
  try {
    var t = localStorage.getItem('theme');
    if (t === 'dark' || t === 'light') {
      document.documentElement.setAttribute('data-theme', t);
    }
  } catch (e) {
    /* 시크릿 모드 등에서 localStorage 접근이 막힐 수 있다. 그러면 OS 설정을 따른다. */
  }
})();
`

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
}
