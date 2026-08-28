/**
 * 유튜브 공식 임베드 플레이어.
 *
 * ── ⚠ 지켜야 할 것이 계약으로 정해져 있다 ──────────────────────────
 * YouTube 자료 사용 프레임워크(RMF)와 개발자 정책
 * (→ docs/wiki/90-external/youtube-data-api.md, docs/raw/004-유튜브영상수집계획.md):
 *
 * | 요구 | 여기서 지키는 방법 |
 * |---|---|
 * | 최소 200×200px | `min-width`·`min-height` 를 CSS 로 못박는다 |
 * | **자동재생 금지** | `autoplay` 를 넘기지 않는다. `allow` 에도 넣지 않는다 |
 * | **오버레이 금지** | 플레이어 위에 아무것도 얹지 않는다. 배지도 버튼도 없다 |
 * | 광고를 플레이어 위·안에 두지 않음(III.G.1.c) | 광고는 이 블록과 떨어진 자리에 둔다 |
 *
 * ⚠ **`youtube-nocookie.com` 을 쓴다.** 사용자가 재생하기 전까지 추적 쿠키를 심지 않는
 *   공식 도메인이다. 기능은 같고 개인정보처리방침에 적을 것이 줄어든다.
 *
 * ⚠ `title` 을 반드시 준다. iframe 에 이름이 없으면 스크린리더가 "프레임" 이라고만 읽어
 *   무엇이 들어 있는지 알 수 없다(axe `frame-title`).
 *
 * ⚠ `aspect-ratio` 로 높이를 예약한다. iframe 이 늦게 뜨면서 아래 내용을 밀면 그대로
 *   CLS 가 된다(완료 기준 CLS < 0.1).
 */
export function VideoEmbed({ videoKey, title }: { videoKey: string; title: string }) {
  return (
    <div className="video-embed">
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${videoKey}?rel=0`}
        title={`${title} — YouTube 영상 재생`}
        /*
          `autoplay` 를 넣지 않는다. 넣으면 정책 위반이자, 소리가 갑자기 나는 화면이 된다.
          `fullscreen` 은 허용한다 — 사용자가 원할 때 전체화면으로 보는 것은 막을 이유가 없다.
        */
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  )
}
