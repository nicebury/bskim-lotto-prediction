import Link from 'next/link'

/**
 * 가이드 카드. 상태 없는 정적 콘텐츠(SSG 대상).
 *
 * 카드 전체가 클릭 타겟이므로 <article> 안에 링크를 넣는 대신 링크가 카드를 감싼다.
 * 제목만 링크로 만들면 손가락이 닿는 영역이 44px 미만이 되기 쉽다.
 */
export function GuideCard({
  href,
  title,
  summary,
  accent,
}: {
  href: string
  title: string
  summary: string
  accent: string
}) {
  return (
    <article>
      <Link className="guide-card" href={href} data-accent={accent}>
        <h3>{title}</h3>
        <p>{summary}</p>
        <span className="more-link">
          자세히 보기 <span aria-hidden="true">›</span>
        </span>
      </Link>
    </article>
  )
}
