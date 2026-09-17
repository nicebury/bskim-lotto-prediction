'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import type { VideoItem } from '@/lib/api-types'
import { formatViews } from '@/lib/format'
import { ArrowRightIcon, PortraitIcon } from '../icons'

/**
 * 쇼츠 상세의 **다음 쇼츠** 카드(2026-09-17, 사용자 요청 "쇼츠는 다 보고 나면 다음 쇼츠 보기").
 *
 * ── 왜 이렇게 만들었나 ─────────────────────────────────────────────
 * 쇼츠는 짧아서 끝나면 곧바로 다음 것을 찾는다. 목록으로 돌아가 다시 고르게 하면 흐름이 끊긴다.
 * 그래서 늘 "다음 쇼츠" 카드를 플레이어 옆(좁은 화면에서는 아래)에 두고, **재생이 끝나면**
 * 카드가 강조되며 "다음 쇼츠 보기" 로 시선을 끈다.
 *
 * ⚠ **자동으로 넘기지 않는다.** 자동재생 금지(YouTube RMF)이고, 사용자가 다시 보고 싶을 수도 있다.
 * ⚠ **플레이어 위에 띄우지 않는다.** 오버레이 금지 — 이 카드는 플레이어 바깥 흐름에 있다.
 * ⚠ 끝났다는 신호는 `VideoEmbed` 가 `window` 에 흘리는 `yt-ended` 이벤트다. 플레이어가 신호를
 *   못 보내는 환경(스크립트 차단 등)이어도 카드와 버튼은 늘 보이므로 기능은 남는다.
 *
 * ⚠ 다음 영상은 서버가 고른다(상세 페이지). 여기서는 받은 것을 보여 줄 뿐이다.
 */
export function NextShorts({ current, next }: { current: string; next: VideoItem }) {
  const [ended, setEnded] = useState(false)

  useEffect(() => {
    const onEnded = (event: Event) => {
      // 같은 화면에 플레이어가 하나뿐이지만, 이 영상의 신호인지 확인해 둔다.
      if ((event as CustomEvent<string>).detail === current) setEnded(true)
    }
    window.addEventListener('yt-ended', onEnded)
    return () => window.removeEventListener('yt-ended', onEnded)
  }, [current])

  const views = formatViews(next.views)

  return (
    <aside className="next-shorts" data-ended={ended ? '' : undefined} aria-labelledby="next-shorts-title">
      {/*
        끝났을 때만 한 줄을 더한다. `aria-live` 로 알려 화면을 보지 않는 사용자도 다음 쇼츠가
        있다는 것을 듣는다. `polite` — 다른 낭독을 끊지 않는다.
      */}
      <p className="next-shorts-status" aria-live="polite">
        {ended ? '영상이 끝났어요. 다음 쇼츠를 볼까요?' : ''}
      </p>

      <p className="next-shorts-eyebrow" id="next-shorts-title">
        <PortraitIcon width={14} height={14} /> 다음 쇼츠
      </p>

      <Link className="next-shorts-card" href={`/videos/${next.id}`}>
        <span className="next-shorts-thumb" aria-hidden="true">
          {next.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element -- 썸네일은 핫링크 의무(VideoCard 주석).
            <img src={next.thumbnail} alt="" loading="lazy" decoding="async" width={180} height={320} />
          ) : (
            <span className="video-card-noimg" />
          )}
        </span>
        <span className="next-shorts-body">
          {/* ⚠ 제목은 원문 그대로. 줄 수만 CSS 로 자른다. */}
          <span className="next-shorts-title">{next.title}</span>
          <span className="next-shorts-meta">
            {next.channel}
            {views && ` · ${views}`}
          </span>
          <span className="next-shorts-go">
            다음 쇼츠 보기 <ArrowRightIcon width={16} height={16} />
          </span>
        </span>
      </Link>
      {/* 썸네일이 있는 자리에는 출처 표시가 붙는다(III.F.2). */}
      <p className="yt-credit" data-compact="">
        <span>
          <a href={`https://www.youtube.com/watch?v=${next.video_key}`} target="_blank" rel="noopener noreferrer">
            YouTube
          </a>
        </span>
      </p>
    </aside>
  )
}
