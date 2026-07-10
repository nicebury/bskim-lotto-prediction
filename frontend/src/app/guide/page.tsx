import type { Metadata } from 'next'

import { Breadcrumb } from '@/components/Breadcrumb'
import { GuideCard } from '@/components/GuideCard'
import { GUIDES } from '@/lib/site'

export const metadata: Metadata = {
  title: '복권 이용 가이드',
  description:
    '로또 당첨번호 확인 방법, 당첨금 수령 절차, 기본 규칙, 자동과 수동의 차이, 건전한 복권 이용 안내를 정리했습니다.',
  alternates: { canonical: '/guide' },
  openGraph: {
    type: 'website',
    url: '/guide',
    title: '복권 이용 가이드',
    description: '로또를 처음 접하는 분을 위한 기본 안내를 모았습니다.',
  },
}

export default function GuideHubPage() {
  return (
    <div className="container">
      <Breadcrumb
        items={[
          { name: '홈', href: '/' },
          { name: '가이드', href: '/guide' },
        ]}
      />

      <section className="section">
        <h1>복권 이용 가이드</h1>
        <p className="muted" style={{ marginTop: 'var(--space-2)' }}>
          당첨 확인부터 당첨금 수령, 게임 규칙과 건전한 이용까지 필요한 내용을 정리했습니다.
        </p>
      </section>

      <section className="section" aria-labelledby="guide-list">
        <h2 id="guide-list" className="sr-only">
          가이드 목록
        </h2>
        <div className="guide-grid">
          {GUIDES.map((guide) => (
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

      <section className="section prose" aria-labelledby="guide-intro">
        <h2 id="guide-intro">복권을 처음 접하신다면</h2>
        <p>
          로또 6/45는 1부터 45까지의 번호 중 6개를 고르는 게임입니다. 게임 한 회당 1,000원이며,
          매주 토요일 저녁에 추첨합니다. 판매점에서 용지를 작성하거나 자동 선택으로 구매할 수
          있습니다.
        </p>
        <p>
          복권은 오락입니다. 지출할 수 있는 범위 안에서, 즐길 수 있는 만큼만 이용하시기 바랍니다.
          당첨은 운에 달린 일이며 어떤 방법으로도 그 확률을 바꿀 수 없습니다. 19세 미만은 복권을
          구매할 수 없습니다.
        </p>
        <p>
          이 사이트는 복권을 판매하거나 구매를 대행하지 않습니다. 국내에서 복권 판매는 기획재정부
          복권위원회가 지정한 공식 사업자만 할 수 있습니다.
        </p>
      </section>
    </div>
  )
}
