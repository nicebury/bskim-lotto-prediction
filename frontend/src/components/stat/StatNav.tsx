import { AdBreakLink } from '@/components/AdBreakLink'
import { RewindGlyph } from '@/components/icons'
import { STAT_PAGES, type StatPageKey } from '@/lib/site'
import { MyNumbersCard } from './MyNumbersCard'

/**
 * 번호분석 4카드 (2026-09-18 개편).
 *
 * 종전 세 장에 **'내 번호 분석'** 한 장을 더했다(사용자 요청). 넷째 카드는 다른 화면으로 가지
 * 않고 **같은 화면 아래의 번호판**(`MyNumbersCard`)으로 내려간다 — 번호를 고르는 일은 여기서
 * 끝나고, 결과만 '샀다면?' 화면으로 넘어간다.
 *
 * ⚠ 서버 컴포넌트다. 링크와 앵커뿐이라 JS 가 필요 없다.
 * ⚠ 현재 화면 카드는 링크가 아니라 `<div>` 다. 자기 자신으로 가는 링크는 눌러도 아무 일이
 *   없어 사용자를 헷갈리게 하고, 낭독기에도 갈 곳처럼 읽힌다.
 */

const ICONS: Record<StatPageKey, React.ReactNode> = {
  'hot-cold': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="M4 20h16" />
      <path d="M7 20V9" />
      <path d="M12 20V4" />
      <path d="M17 20v-7" />
    </svg>
  ),
  frequency: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3" y="3" width="6" height="6" rx="1.5" />
      <rect x="9.5" y="3" width="6" height="6" rx="1.5" fill="currentColor" stroke="none" />
      <rect x="16" y="3" width="5" height="6" rx="1.5" />
      <rect x="3" y="9.5" width="6" height="6" rx="1.5" fill="currentColor" stroke="none" />
      <rect x="9.5" y="9.5" width="6" height="6" rx="1.5" />
      <rect x="16" y="9.5" width="5" height="6" rx="1.5" />
      <rect x="3" y="16" width="6" height="5" rx="1.5" />
      <rect x="9.5" y="16" width="6" height="5" rx="1.5" />
      <rect x="16" y="16" width="5" height="5" rx="1.5" fill="currentColor" stroke="none" />
    </svg>
  ),
  pattern: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" stroke="none" />
    </svg>
  ),
}

export function StatNav({ current }: { current: StatPageKey }) {
  /*
    ⚠ 넷째 카드는 화면마다 성격이 다르다.
      · '많이 나온 번호' 화면 — 카드가 **번호판을 여는 버튼**이다(`MyNumbersCard`). 번호판은
        평소 접혀 있고, 카드를 눌러야 열린다(2026-09-18 사용자 요청).
      · 빈도·패턴 화면 — 그 화면에는 번호판이 없으므로 **번호판이 있는 화면으로 건너뛴다.**
        도착하면 `#mynum` 을 보고 저절로 열린다.
  */
  const cards = STAT_PAGES.map((page) => {
    const isCurrent = page.key === current
    const body = (
      <>
        <span className="sb-card-icon" data-accent={page.accent}>
          {ICONS[page.key]}
        </span>
        <span className="sb-card-title">{page.title}</span>
        <span className="sb-card-summary">{page.summary}</span>
        <span className="sb-card-cue" aria-hidden="true">
          {isCurrent ? '지금 보는 중' : '보러 가기 →'}
        </span>
      </>
    )

    return isCurrent ? (
      <div key={page.key} className="sb-navcard" data-accent={page.accent} data-current="">
        {/* 색과 문구만으로 현재 위치를 전달하지 않는다 — 보조 기술에도 알린다. */}
        <span className="sr-only">현재 보고 있는 화면입니다.</span>
        {body}
      </div>
    ) : (
      <AdBreakLink
        key={page.key}
        className="sb-navcard"
        href={page.href}
        data-accent={page.accent}
      >
        {body}
      </AdBreakLink>
    )
  })

  if (current === 'hot-cold') {
    return <MyNumbersCard cards={cards} />
  }

  return (
    <nav className="sb-cards" aria-label="번호분석 종류">
      {cards}
      <a className="sb-navcard is-mine" href="/lotto/stat#mynum" data-accent="reco">
        <span className="sb-card-icon" data-accent="reco">
          <RewindGlyph />
        </span>
        <span className="sb-card-title">내 번호 분석</span>
        <span className="sb-card-summary">
          번호 6개를 고르면 그 번호로 예전부터 샀다면 어땠을지 보여 드립니다.
        </span>
        <span className="sb-card-cue" aria-hidden="true">
          번호 고르기 →
        </span>
      </a>
    </nav>
  )
}
