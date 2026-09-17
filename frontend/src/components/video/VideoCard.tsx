import Link from 'next/link'

import type { VideoItem } from '@/lib/api-types'
import { formatDuration, formatPubDate, formatViews } from '@/lib/format'
import { PlayGlyph, PortraitIcon } from '../icons'
import { YouTubeAttribution } from './YouTubeAttribution'

/**
 * 영상 카드 — 썸네일 + 제목 + 채널.
 *
 * ⚠ **제목을 고치지 않는다.** 금지 표현이 화면에 남았다면 프론트가 손볼 일이 아니라 수집
 *   필터를 고칠 일이다. 영상 제목 변조는 YouTube 정책 위반이고(III.F.2 의 귀속 표시 방해
 *   금지와 같은 취지), 우리 정책을 지키려고 남의 제목을 바꾸면 **두 정책을 동시에 어긴다**
 *   (→ docs/wiki/40-domain/forbidden-expressions.md 외부 텍스트 절).
 *   CSS 로 줄 수를 제한하는 말줄임(`…`)은 된다 — 낱말을 지우는 것이 아니다.
 *
 * ⚠ 썸네일은 **핫링크**한다. `next/image` 를 쓰지 않는 이유는 그것이 이미지를 우리 서버로
 *   가져와 최적화·캐시하기 때문이다 — 워커가 "썸네일 이미지 파일을 저장하지 않는다" 는
 *   경계를 프론트가 우회하는 꼴이 된다([[component-boundaries]]).
 *
 * ⚠ 썸네일 자리에 **`aspect-ratio` 로 높이를 예약**한다. 외부 이미지는 도착 시각이
 *   불확정이라 예약하지 않으면 그대로 CLS 가 된다(완료 기준 CLS < 0.1).
 *
 * ⚠ 카드는 **전용 페이지로** 간다. 유튜브로 바로 보내지 않는다 — 재생은 전용 페이지의
 *   임베드에서만 한다(정책 III.G.1.d 의 독립적 가치 요건과 이어진다).
 */
export function VideoCard({
  video,
  variant = 'wide',
}: {
  video: VideoItem
  /**
   * `portrait` = 세로 썸네일(9:16) 카드. **쇼츠 탭에서만** 쓴다(2026-09-17).
   * ⚠ 전체 목록에서 쇼츠 추정 영상만 세로로 바꾸지 않는다. 추정이 틀리면 가로 영상이
   *   세로 틀에 잘려 보인다. 쇼츠 탭은 사용자가 '쇼츠만' 을 고른 자리라 모양을 통일해도 된다.
   */
  variant?: 'wide' | 'portrait'
}) {
  const duration = formatDuration(video.duration_sec)
  const views = formatViews(video.views)
  /*
    ⚠ **쇼츠 배지를 단다(2026-09-17 사용자 요청: "쇼츠인지 아닌지 목록에서 구분되게").**
      종전에는 `shorts_hint` 가 추정이라 배지를 달지 않았다. 사용자 요구가 분명하므로 달되,
      **`likely` 일 때만** 달고 `unknown` 에는 달지 않는다 — 모르는 것을 쇼츠로 밀지 않는다는
      계약 정신은 그대로다. 낭독기에는 "추정" 임을 함께 읽어 준다.
  */
  const shorts = video.shorts_hint === 'likely'

  return (
    <article className="video-card" data-variant={variant} data-shorts={shorts ? '' : undefined}>
      {/*
        ⚠ **썸네일 링크를 접근성 트리에서 뺀다**(`tabIndex={-1}` + `aria-hidden`).
          한 카드에서 제목과 썸네일이 **같은 곳으로 가는 링크 둘**이라, 그대로 두면 스크린
          리더가 같은 영상을 두 번 읽고 키보드는 Tab 을 두 번 눌러야 지나간다.

        ⚠ 게다가 이 링크는 2026-09-02 axe 검사에서 **`link-name` 위반**으로 잡혔다. 안에
          있는 것이 `alt=""` 인 이미지와 재생시간 배지뿐이라, **재생시간이 없는 영상은 링크에
          읽을 텍스트가 하나도 없었다**(`/videos/215`). 있더라도 이름이 "재생시간 9:49" 라
          무슨 영상인지 알 수 없었다.

        ⚠ 시각 사용자는 그대로 썸네일을 누를 수 있다. 빼는 것은 **중복된 두 번째 경로**이지
          기능이 아니다.
      */}
      <Link
        className="video-card-thumb"
        href={`/videos/${video.id}`}
        tabIndex={-1}
        aria-hidden="true"
      >
        {video.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element -- 핫링크 의무. 위 주석 참조.
          <img
            src={video.thumbnail}
            alt=""
            loading="lazy"
            decoding="async"
            width={480}
            height={270}
          />
        ) : (
          <span className="video-card-noimg" aria-hidden="true" />
        )}

        {/* 재생시간 배지. */}
        {/*
          ⚠ 여기 있던 `<span className="sr-only">재생시간 </span>` 을 걷어냈다. 위 `aria-hidden`
            안에 있으면 어차피 읽히지 않는다. 재생시간은 아래 meta 로 옮겨 **정보를 잃지 않게**
            했다 — 배지 자리는 유튜브의 관례라 시각적으로는 그대로 둔다.
        */}
        {duration && <span className="video-card-duration">{duration}</span>}
        {shorts && (
          <span className="video-card-shorts">
            <PortraitIcon width={13} height={13} />
            쇼츠
          </span>
        )}
        {/* 재생 표시. 썸네일 위 장식이다 — 플레이어가 아니라 오버레이 금지와 무관하다. */}
        <span className="video-card-play" aria-hidden="true">
          <PlayGlyph width={20} height={20} />
        </span>
      </Link>

      <div className="video-card-body">
        <h3 className="video-card-title">
          <Link href={`/videos/${video.id}`}>{video.title}</Link>
        </h3>

        <p className="video-card-meta">
          {video.channel && <span>{video.channel}</span>}
          {views && <span>{views}</span>}
          <span>{formatPubDate(video.published_at)}</span>
          {/* 썸네일 위 배지는 `aria-hidden` 안이라 읽히지 않는다. 재생시간을 여기서 전한다. */}
          {duration && <span className="sr-only">재생시간 {duration}</span>}
          {shorts && <span className="sr-only">쇼츠로 추정되는 영상</span>}
        </p>

        {/* 썸네일이 있는 곳에는 반드시 붙는다(III.F.2). 카드에서는 줄여 쓴다. */}
        <YouTubeAttribution videoKey={video.video_key} compact />
      </div>
    </article>
  )
}
