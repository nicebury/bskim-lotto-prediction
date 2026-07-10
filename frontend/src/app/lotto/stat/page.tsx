import Link from 'next/link'
import type { Metadata } from 'next'

import { Breadcrumb } from '@/components/Breadcrumb'
import { Disclaimer } from '@/components/Disclaimer'
import { GuideCard } from '@/components/GuideCard'
import { DISCLAIMER, STAT_PAGES } from '@/lib/site'

export const revalidate = 604800

export const metadata: Metadata = {
  title: '로또 번호 통계',
  description:
    '로또 6/45 번호별 출현 빈도, 많이 나온 번호와 안 나온 번호, 홀짝·고저·합계 패턴 통계를 확인해보세요.',
  alternates: { canonical: '/lotto/stat' },
  openGraph: {
    type: 'website',
    url: '/lotto/stat',
    title: '로또 번호 통계',
    description: '번호별 출현 빈도, HOT·COLD 번호, 홀짝·고저·합계 패턴 통계.',
  },
}

/** 통계 상세 3종으로 가는 허브. 각 페이지가 특정 검색 의도 하나를 담당한다. */
export default function StatHubPage() {
  const accents = ['stats', 'lotto', 'reco'] as const

  return (
    <div className="container">
      <Breadcrumb
        items={[
          { name: '홈', href: '/' },
          { name: '로또 6/45', href: '/lotto' },
          { name: '번호 통계', href: '/lotto/stat' },
        ]}
      />

      <section className="section">
        <h1>로또 번호 통계</h1>
        <p className="muted" style={{ marginTop: 'var(--space-2)' }}>
          과거 회차의 당첨번호를 집계해 번호별 출현 빈도와 조합의 분포를 정리했습니다.
        </p>
      </section>

      <section className="section" aria-labelledby="stat-pages-title">
        <div className="section-head">
          <h2 id="stat-pages-title">통계 상세</h2>
        </div>
        <div className="guide-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          {STAT_PAGES.map((page, index) => (
            <GuideCard
              key={page.slug}
              href={`/lotto/stat/${page.slug}`}
              title={page.title}
              summary={page.summary}
              accent={accents[index] ?? 'stats'}
            />
          ))}
        </div>
      </section>

      <section className="section prose" aria-labelledby="howto-stat">
        <h2 id="howto-stat">통계를 어떻게 읽어야 하나요?</h2>
        <p>
          로또 통계는 <strong>이미 일어난 일</strong>을 정리한 기록입니다. 어떤 번호가 최근 20회
          동안 몇 번 나왔는지, 어떤 번호가 오래 나오지 않았는지는 셀 수 있는 사실입니다. 그러나 그
          사실이 다음 회차에 무슨 일이 일어날지는 말해 주지 않습니다.
        </p>
        <p>
          추첨은 매 회차 독립적입니다. 45개 번호에서 6개를 뽑는 8,145,060가지 조합은 모두 같은
          가능성을 가집니다. &ldquo;오래 안 나온 번호가 나올 때가 됐다&rdquo;는 생각은 도박사의
          오류라고 불리는 흔한 착각입니다. 공이 지난 회차를 기억하지 못하기 때문입니다.
        </p>
        <p>
          그렇다면 통계는 왜 볼까요. 과거 당첨 조합이 어떤 모양이었는지 — 홀수와 짝수가 대체로
          어떻게 섞였는지, 여섯 번호의 합계가 주로 어느 범위에 있었는지 — 를 아는 것은 그 자체로
          흥미로운 관찰입니다. 번호를 고르는 재미를 더할 수는 있지만, 당첨 결과를 바꾸지는
          않습니다. 통계를 읽는 더 자세한 방법은{' '}
          <Link href="/guide/lotto-rule">로또 기본 규칙</Link>에서 함께 설명합니다.
        </p>
      </section>

      <Disclaimer>{DISCLAIMER.stats}</Disclaimer>
    </div>
  )
}
