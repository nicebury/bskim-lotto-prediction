/**
 * YouTube 출처 표시.
 *
 * ── ⚠ 이것은 장식이 아니라 **의무**다 ────────────────────────────────
 * YouTube 개발자 정책 III.F.2:
 *
 * > "Any API Client page or feature that displays YouTube content – including, without
 * > limitation, search results, YouTube videos, channels, playlists, **thumbnails**, and
 * > YouTube players – must make clear to the viewer that YouTube is the source..."
 *
 * **썸네일이 들어가는 모든 곳**에 붙는다. 전용 페이지만이 아니라 홈 카드까지다
 * (→ docs/wiki/90-external/youtube-data-api.md, docs/raw/004-유튜브영상수집계획.md).
 *
 * ⚠ **유튜브 로고를 직접 그리지 않는다.** 로고는 상표이고 브랜드 가이드라인이 색·여백·
 *   변형을 규정한다. 우리가 SVG 로 흉내 내면 그 규정을 어길 위험이 있다. 정책이 요구하는
 *   것은 로고 자체가 아니라 **"YouTube 가 출처임이 보는 사람에게 분명할 것"** 이므로,
 *   재생 표시와 'YouTube' 라는 낱말과 youtube.com 으로 가는 링크로 그것을 만족시킨다.
 *
 * ⚠ 링크는 **새 창**으로 연다. 여기서 사이트를 떠나는 것이 정상 동작이고, 돌아올 자리를
 *   남겨 두는 편이 낫다. `rel="noopener"` 는 새 창이 우리 창을 조작하지 못하게 막는다.
 */
export function YouTubeAttribution({
  videoKey,
  channel,
  /** 카드처럼 좁은 자리에서는 글자를 줄인다. 표시 의무는 그대로 지킨다. */
  compact = false,
}: {
  videoKey: string
  channel?: string | null
  compact?: boolean
}) {
  return (
    <p className="yt-credit" data-compact={compact ? '' : undefined}>
      <PlayMark />
      <span>
        {/* 낱말 'YouTube' 가 반드시 보여야 한다. 아이콘만으로는 출처가 분명하지 않다. */}
        <a
          href={`https://www.youtube.com/watch?v=${videoKey}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          YouTube
        </a>
        {compact ? '' : '에서 제공하는 영상입니다'}
        {!compact && channel ? ` · 채널 ${channel}` : ''}
      </span>
    </p>
  )
}

/** 재생 삼각형. 유튜브 로고가 아니라 일반적인 재생 표시다 — 상표를 흉내 내지 않는다. */
function PlayMark() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2.5" y="5" width="19" height="14" rx="4" />
      <path d="M10.5 9.5l4.5 2.5-4.5 2.5z" fill="currentColor" stroke="none" />
    </svg>
  )
}
