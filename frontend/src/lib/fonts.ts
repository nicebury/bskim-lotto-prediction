import localFont from 'next/font/local'

/**
 * Pretendard Variable — **자체 호스팅 서브셋**.
 *
 * CDN 을 쓰지 않는 이유: 외부 도메인 의존은 첫 렌더를 그 도메인의 가용성에 묶는다.
 * 서브셋을 쓰는 이유: 원본 가변 폰트는 2MB 다. LCP 를 그만큼 늦출 값어치가 없다.
 *
 * 서브셋 범위는 **KS X 1001 상용 한글 2,350자 + 라틴·숫자·문장부호**이고, 가변 축은
 * `wght 400~800` 으로 좁혔다(304KB). 소스의 UI 문구 677자가 전부 이 범위 안에 있음을
 * 확인했다. 사용자가 입력한 희귀 음절(예: 꿈 텍스트)은 시스템 폰트로 폴백된다 — 화면이
 * 깨지지 않고 글꼴만 달라진다.
 *
 * `next/font/local` 을 쓰면 두 가지를 자동으로 얻는다.
 *  1) 폰트 파일 preload — `<link rel="preload">` 를 직접 관리하지 않아도 된다.
 *  2) **폴백 메트릭 오버라이드** — 웹폰트가 늦게 도착해도 글자 크기가 튀지 않는다(CLS).
 *
 * ⚠ 파일은 `public/` 이 아니라 `src/fonts/` 에 둔다. next/font 는 번들러가 해석하는
 *   경로만 받으며, 해시가 붙은 불변 URL 로 내보내 캐시 수명을 최대화한다.
 *
 * 라이선스: SIL Open Font License 1.1 (`src/fonts/LICENSE.txt`). 재배포 시 동봉해야 한다.
 */
export const pretendard = localFont({
  src: '../fonts/pretendard.woff2',
  // 가변 폰트라 굵기를 범위로 선언한다. 400(본문)~800(히어로 헤드라인).
  weight: '400 800',
  style: 'normal',
  /*
   * ⚠ `swap` 이 아니라 `optional` 이다. 이유는 **CLS** 다.
   *
   * `swap` 은 폰트가 늦게 도착하면 그 시점에 글꼴을 갈아 끼우는데, 그러면 줄바꿈이 다시
   * 계산되어 문단 높이가 바뀌고 아래 내용이 통째로 밀린다. 실측(느린 4G + CPU 4배):
   * 2,825ms 에 Pretendard 가 도착하면서 문단이 25px 줄어 `/contact` CLS 0.207,
   * `/privacy` 0.128 이었다 — 완료 기준(0.1)을 넘는다(2026-08-21).
   *
   * ★ next/font 가 넣어 주는 메트릭 오버라이드(`pretendard Fallback`)로는 못 막는다.
   *   그 폴백은 `local("Arial")` 기준이고 **Arial 에는 한글 글리프가 없다.** 한글은 그
   *   단계를 건너뛰고 시스템 한글 폰트(Malgun Gothic·Apple SD Gothic Neo·Noto Sans CJK)로
   *   떨어지는데, 그 메트릭은 OS 마다 다르고 오버라이드 대상도 아니다. 즉 한글 사이트에서
   *   `swap` 의 리플로우는 **원리상 남는다.**
   *
   * `optional` 은 짧은 블록 구간(약 100ms) 안에 도착하지 못하면 **그 페이지 로드에서는
   * 웹폰트를 아예 쓰지 않는다.** 글꼴 교체가 없으니 리플로우도 없다. 파일은 그대로
   * 내려받아 캐시되므로 다음 이동·다음 방문부터는 Pretendard 로 보인다.
   * 대가는 "느린 회선의 첫 화면이 시스템 폰트로 보인다" 는 것이고, 그 대가로 산 것은
   * 모든 회선에서의 레이아웃 안정성이다 — CLS 는 검색 순위 신호이고 글꼴은 아니다.
   *
   * ⚠ 여기를 `swap` 으로 되돌리면 긴 글(정책·가이드 페이지)의 CLS 가 조용히 0.1 을 넘는다.
   *   되돌리기 전에 반드시 스로틀 환경에서 실측한다.
   */
  display: 'optional',
  variable: '--font-pretendard',
  // 웹폰트 실패 시 이 스택으로 떨어진다. 메트릭 오버라이드의 기준이기도 하다.
  fallback: [
    '-apple-system',
    'BlinkMacSystemFont',
    'Segoe UI',
    'Noto Sans KR',
    'Malgun Gothic',
    'Apple SD Gothic Neo',
    'system-ui',
    'sans-serif',
  ],
})
