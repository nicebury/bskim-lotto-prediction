'use client'

import { useEffect, useRef, useState } from 'react'

import type { ShortsHint } from '@/lib/api-types'

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
 *
 * ── 쇼츠는 세로로 띄운다 ────────────────────────────────────────────
 * 세로 영상을 16:9 틀에 넣으면 좌우가 새까맣고 영상이 아주 작아진다. `shorts_hint` 가
 * `likely` 면 9:16 으로 띄운다.
 *
 * ⚠ **`unknown` 은 가로로 둔다.** 모르는 것을 세로로 밀면 그 순간 추정이 확정이 된다
 *   (계약의 `shorts_hint` 규칙과 같은 정신). 가로가 안전한 기본값이다 — 세로 영상이
 *   가로 틀에 들어가면 작아질 뿐이지만, 가로 영상이 세로 틀에 들어가면 훨씬 더 작아진다.
 *
 * ⚠ **추정이 틀릴 수 있으므로 사용자가 바꿀 수 있어야 한다.** 계약이 "3분 이하 가로
 *   영상이 쇼츠로 오분류된다" 고 명시했다(→ docs/wiki/90-external/youtube-data-api.md).
 *   그때 영상이 세로 틀에 갇혀 아주 작게 나오는데, 우리가 고칠 방법이 없으면 사용자도
 *   방법이 없다. 전환 버튼을 **플레이어 바깥**에 둔다 — 위에 얹으면 오버레이 금지 위반이다.
 */
export function VideoEmbed({
  videoKey,
  title,
  shortsHint = 'unknown',
}: {
  videoKey: string
  title: string
  shortsHint?: ShortsHint
}) {
  const [portrait, setPortrait] = useState(shortsHint === 'likely')
  const frameRef = useRef<HTMLIFrameElement>(null)

  /*
    ── 재생이 끝났는지 알아듣기(2026-09-17 추가) ─────────────────────
    쇼츠를 다 보면 "다음 쇼츠 보기" 를 권하기 위해서다(사용자 요청). 끝났다는 신호는
    `window` 의 `yt-ended` 이벤트로 흘려보내고, 받는 쪽(`NextShorts`)은 플레이어와 떨어진
    자리에서 스스로 강조한다 — **플레이어 위에 아무것도 얹지 않는다**(오버레이 금지).

    ⚠ IFrame API 스크립트(`iframe_api`)를 불러오지 않는다. `enablejsapi=1` 로 연 플레이어는
      `postMessage` 로 상태를 알려 주므로, "듣고 있다" 는 인사(`listening`)만 보내면 된다.
      스크립트 하나를 더 받는 것보다 가볍고, 이 화면에 필요한 것은 '끝났다' 하나뿐이다.
    ⚠ **다음 영상을 자동으로 재생하지 않는다.** 자동재생은 정책 위반이다. 권하기만 한다.
    ⚠ 메시지는 유튜브 도메인에서 온 것만 믿는다. 아무 창이나 같은 모양의 메시지를 보낼 수 있다.
  */
  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return

    const hello = () =>
      frame.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: videoKey, channel: 'widget' }), '*')

    // 플레이어가 준비되기 전에 보낸 인사는 버려진다. 몇 번 되풀이한다.
    let tries = 0
    const helloTimer = setInterval(() => {
      hello()
      tries += 1
      if (tries > 10) clearInterval(helloTimer)
    }, 700)
    frame.addEventListener('load', hello)

    const onMessage = (event: MessageEvent) => {
      if (!/^https:\/\/www\.youtube(-nocookie)?\.com$/.test(event.origin)) return
      if (typeof event.data !== 'string') return
      let data: { event?: string; info?: unknown }
      try {
        data = JSON.parse(event.data)
      } catch {
        return
      }
      // 두 모양으로 온다 — `onStateChange`(info = 상태 번호) 또는 `infoDelivery`(info.playerState).
      const state =
        data.event === 'onStateChange'
          ? data.info
          : data.event === 'infoDelivery' && typeof data.info === 'object' && data.info !== null
            ? (data.info as { playerState?: number }).playerState
            : undefined
      // 0 = 끝남(YT.PlayerState.ENDED)
      if (state === 0) {
        window.dispatchEvent(new CustomEvent('yt-ended', { detail: videoKey }))
      }
    }
    window.addEventListener('message', onMessage)

    return () => {
      clearInterval(helloTimer)
      frame.removeEventListener('load', hello)
      window.removeEventListener('message', onMessage)
    }
  }, [videoKey])

  return (
    <>
    <div className="video-embed" data-portrait={portrait ? '' : undefined}>
      <iframe
        ref={frameRef}
        // `enablejsapi=1` — 재생이 끝났다는 신호를 받기 위해서다(위 effect). 자동재생과 무관하다.
        src={`https://www.youtube-nocookie.com/embed/${videoKey}?rel=0&enablejsapi=1`}
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

    {/*
      ⚠ 플레이어 **바깥**이다. 위에 얹으면 RMF 의 오버레이 금지를 어긴다.
      ⚠ 문구가 "쇼츠/일반" 이 아니라 "세로/가로" 인 것은, 우리가 아는 것이 화면비뿐이기
        때문이다. 쇼츠인지 아닌지는 여전히 추정이고 이 버튼은 그것을 확정하지 않는다.
    */}
    <p className="video-ratio">
      <button type="button" className="video-ratio-btn" onClick={() => setPortrait((v) => !v)}>
        {portrait ? '가로 화면으로 보기' : '세로 화면으로 보기'}
      </button>
      <span className="video-ratio-note">
        {portrait
          ? '세로 영상에 맞춰 놓았습니다. 가로 영상이면 위 버튼으로 바꾸세요.'
          : '세로 영상(쇼츠)이라면 위 버튼으로 바꾸세요.'}
      </span>
    </p>
    </>
  )
}
