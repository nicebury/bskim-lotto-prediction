import { GUIDES } from '@/lib/site'
import { GuideCard } from './GuideCard'

/**
 * 가이드 상세페이지 하단의 "다른 가이드로 바로가기" (002 R16).
 *
 * 상세를 다 읽고 나면 다음 갈 곳이 없다 — 홈의 `GuideCard` 를 그대로 재사용해(일관성 R35)
 * 다른 가이드로 잇는다. `current` 슬러그는 목록에서 뺀다(자기 자신으로 가는 카드는 무의미).
 */
export function GuideNav({ current }: { current: string }) {
  const others = GUIDES.filter((guide) => guide.slug !== current)

  return (
    <section className="section" aria-labelledby="guide-nav-title">
      <div className="section-head">
        <h2 id="guide-nav-title">다른 가이드도 살펴보세요</h2>
      </div>
      <div className="guide-grid">
        {others.map((guide) => (
          <GuideCard
            key={guide.slug}
            href={`/guide/${guide.slug}`}
            title={guide.title}
            summary={guide.summary}
            accent={guide.accent}
          />
        ))}
      </div>
    </section>
  )
}
