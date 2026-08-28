import Link from 'next/link'

import { STAT_PAGES, type StatPageKey } from '@/lib/site'

/**
 * 카드 아이콘.
 *
 * ⚠ 장식이 아니라 **그 화면이 무엇인지**를 가리킨다. 순위 화면은 내림차순 막대, 빈도
 *   화면은 일부가 채워진 45칸 격자, 패턴 화면은 반으로 나뉜 원(=비율)이다.
 * ⚠ 트로피를 쓰지 않는다 — '당첨'을 암시해 심사에서 도박 조장으로 읽힐 수 있다
 *   (→ docs/wiki/40-domain/forbidden-expressions.md). 달력도 쓰지 않는다 — 이 화면들은
 *   날짜가 아니라 번호에 관한 것이다.
 * 색은 `currentColor` 를 받아 카드가 정하므로 다크 모드에서 따로 손댈 것이 없다.
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

/**
 * 통계 3종 이동 카드.
 *
 * 종전에는 다른 통계를 보려면 뒤로 가기로 허브에 돌아가야 했고, 그것을 없애려고 탭을
 * 달았더니 이번에는 **너무 작아 눈에 띄지 않는다**는 지적이 나왔다(사용자). 그래서 예전
 * 허브의 카드 형태로 되돌리되, 허브 페이지가 아니라 **세 화면 어디에나** 둔다.
 * 이동 수단이자 "여기서 무엇을 볼 수 있는가" 를 알려 주는 안내 역할을 겸한다.
 *
 * 서버 컴포넌트다 — 링크뿐이라 JS 가 필요 없다. `usePathname()` 을 쓰면 이 카드 하나
 * 때문에 통계 페이지 전체가 클라이언트 경계를 넘는다.
 *
 * 현재 항목은 링크가 아니라 `<div>` 로 낸다. 자기 자신으로 가는 링크는 눌러도 아무 일이
 * 일어나지 않아 사용자를 헷갈리게 하고, 스크린리더에도 갈 곳처럼 읽힌다.
 */
export function StatNav({ current }: { current: StatPageKey }) {
  return (
    <nav className="stat-cards" aria-label="통계 종류">
      {STAT_PAGES.map((page) => {
        const isCurrent = page.key === current

        const body = (
          <>
            <span className="stat-card-head">
              <span className="stat-card-icon" data-accent={page.accent}>
                {ICONS[page.key]}
              </span>
              <span className="stat-card-title">{page.title}</span>
            </span>
            <span className="stat-card-summary">{page.summary}</span>
            <span className="stat-card-cue" aria-hidden="true">
              {isCurrent ? '지금 보는 중' : '보러 가기 →'}
            </span>
          </>
        )

        return isCurrent ? (
          <div key={page.key} className="stat-card" data-accent={page.accent} data-current="">
            {/* 색과 문구만으로 현재 위치를 전달하지 않는다 — 보조 기술에도 알린다. */}
            <span className="sr-only">현재 보고 있는 화면입니다.</span>
            {body}
          </div>
        ) : (
          <Link key={page.key} className="stat-card" href={page.href} data-accent={page.accent}>
            {body}
          </Link>
        )
      })}
    </nav>
  )
}
