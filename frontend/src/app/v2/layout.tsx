/*
 * /v2 세그먼트 레이아웃.
 *
 * 이 시안의 설계 전체가 이 파일 하나에 걸려 있다.
 *   1) 전용 CSS 진입점 — 서버 컴포넌트인 layout 에서 import 해야 세그먼트 청크로 묶인다.
 *   2) `.hb-root` 래퍼 — shell.css 의 `body:has(.hb-root)` 이스케이프 해치가 이 클래스
 *      하나를 신호로 삼는다. 이게 없으면 전역 헤더가 그대로 보인다.
 *   3) `hb-js` 클래스 주입 — JS 가 켜져 있는지를 CSS 가 알아야 한다(아래 설명).
 *
 * 루트 레이아웃(`src/app/layout.tsx`)은 **건드리지 않는다.** 헤더·푸터·<main>·
 * 애널리틱스는 여전히 그쪽이 렌더하고, 이 레이아웃은 그 안쪽에 중첩된다.
 */
import './_styles/v2.css'

/**
 * 격자 전환의 기본값을 "JS 없음" 쪽에 두기 위한 스크립트.
 *
 * 45칸 격자는 서버가 그리고, 히트맵 레이어는 **기본적으로 보이는 상태**다. JS 가 꺼져
 * 있어도 최근 20회 빈도가 정적으로 남아야 하기 때문이다. JS 가 켜져 있을 때만 그 레이어를
 * 감췄다가 스크롤에 맞춰 되살린다 — 그 분기를 CSS 가 판단하려면 표식이 필요하다.
 *
 * `next/script` 가 아니라 동기 인라인 스크립트인 이유는 첫 페인트 전에 실행돼야 하기
 * 때문이다(`ThemeScript` 와 같은 패턴). 루트 <html> 에 이미 suppressHydrationWarning 이
 * 걸려 있어 속성이 추가돼도 하이드레이션 경고가 나지 않는다.
 *
 * 클라이언트 내비게이션으로 다른 라우트에 가도 이 클래스는 남지만, `.hb-js` 를 쓰는
 * 선택자는 전부 `hb-` 클래스와 함께 쓰이므로 바깥에서는 아무 효과가 없다.
 */
const HB_JS_FLAG = `document.documentElement.classList.add('hb-js')`

export default function V2Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: HB_JS_FLAG }} />
      <div className="hb-root">{children}</div>
    </>
  )
}
