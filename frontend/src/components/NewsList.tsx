import type { NewsItem } from '@/lib/api-types'
import { formatPubDate } from '@/lib/format'
import { EmptyState } from './Card'
import { assignNewsThumbs } from './icons'

/**
 * 복권 뉴스 목록.
 *
 * 제목만 나열하지 않는다 — 출처·발행일·요약·키워드를 함께 보여준다. 제목 복사 나열은
 * 저가치 페이지 신호다(→ docs/wiki/30-seo/adsense-readiness.md).
 *
 * `description` 은 백엔드가 만든 **요약**이지 원문이 아니다. 원문을 복제하지 않는다.
 * 외부 링크는 rel="nofollow noopener" + target="_blank" 로 연다(계약 규정).
 *
 * **썸네일은 이미지가 아니다.** 백엔드가 기사 이미지를 주지 않으므로(계약의 기사 객체에
 * 이미지 필드가 없다) 복권 소재의 글리프로 채운다. 색과 아이콘은 기사 링크를 해시해 고르므로
 * 목록이 바뀌어도 같은 기사는 같은 모습을 유지한다. 순수 장식이라 접근성 트리에서 숨긴다 —
 * 아이콘이 기사 내용을 뜻하지 않는다.
 */
export function NewsList({
  items,
  compact = false,
  limit,
}: {
  items: NewsItem[]
  /** 홈 3분할 카드용 축약 모드. 요약과 키워드를 생략한다. */
  compact?: boolean
  limit?: number
}) {
  if (items.length === 0) {
    return <EmptyState>표시할 뉴스가 없습니다. 잠시 후 다시 확인해 주세요.</EmptyState>
  }

  const visible = typeof limit === 'number' ? items.slice(0, limit) : items
  // 실제로 보이는 목록을 기준으로 배정한다. 잘라내기 전에 배정하면 화면에 색이 겹친다.
  const thumbs = assignNewsThumbs(visible, (item) => item.link)

  return (
    <ul className={`news-list${compact ? ' is-compact' : ''}`}>
      {visible.map((item, index) => {
        const { accent, Icon } = thumbs[index]

        return (
          // link 는 원문 URL 이라 목록 안에서 고유하다.
          <li key={item.link} className="news-item">
            <article className="news-row">
              <span className="news-thumb" data-accent={accent} aria-hidden="true">
                <Icon width={compact ? 20 : 24} height={compact ? 20 : 24} />
              </span>

              <div className="news-body">
                <h3>
                  <a href={item.link} target="_blank" rel="nofollow noopener noreferrer">
                    {item.title}
                  </a>
                </h3>
                <p className="news-meta">
                  <span>{item.source}</span>
                  {/* 기계가 읽을 수 있게 dateTime 을 준다. */}
                  <time dateTime={item.pub_date}>{formatPubDate(item.pub_date)}</time>
                </p>
                {!compact && item.description && <p className="news-summary">{item.description}</p>}
                {!compact && item.keywords?.length > 0 && (
                  <p className="keyword-chips">
                    {item.keywords.map((keyword) => (
                      <span className="chip" key={keyword}>
                        {keyword}
                      </span>
                    ))}
                  </p>
                )}
              </div>
            </article>
          </li>
        )
      })}
    </ul>
  )
}
