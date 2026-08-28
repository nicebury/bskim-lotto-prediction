import Link from 'next/link'

import type { VideoItem } from '@/lib/api-types'
import { formatDuration, formatPubDate, formatViews } from '@/lib/format'
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
export function VideoCard({ video }: { video: VideoItem }) {
  const duration = formatDuration(video.duration_sec)
  const views = formatViews(video.views)

  return (
    <article className="video-card">
      <Link className="video-card-thumb" href={`/videos/${video.id}`}>
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

        {/*
          재생시간 배지.
          ⚠ 쇼츠 여부를 여기 쓰지 않는다. `shorts_hint` 는 추정이라 배지로 단정하면
            추정이 확정으로 둔갑한다. 목록 필터에서만 다룬다.
        */}
        {duration && (
          <span className="video-card-duration">
            <span className="sr-only">재생시간 </span>
            {duration}
          </span>
        )}
      </Link>

      <div className="video-card-body">
        <h3 className="video-card-title">
          <Link href={`/videos/${video.id}`}>{video.title}</Link>
        </h3>

        <p className="video-card-meta">
          {video.channel && <span>{video.channel}</span>}
          {views && <span>{views}</span>}
          <span>{formatPubDate(video.published_at)}</span>
        </p>

        {/* 썸네일이 있는 곳에는 반드시 붙는다(III.F.2). 카드에서는 줄여 쓴다. */}
        <YouTubeAttribution videoKey={video.video_key} compact />
      </div>
    </article>
  )
}
