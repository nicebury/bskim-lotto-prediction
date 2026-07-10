import type { Metadata } from 'next'

import { AdSlot } from '@/components/AdSlot'
import { Breadcrumb } from '@/components/Breadcrumb'
import { Card, EmptyState } from '@/components/Card'
import { Disclaimer } from '@/components/Disclaimer'
import { JsonLd, datasetLd } from '@/components/JsonLd'
import { OverdueList, RankList } from '@/components/stats'
import { StatWindowTabs } from '@/components/StatWindowTabs'
import { getHotCold } from '@/lib/api'
import type { HotColdResult, StatWindow } from '@/lib/api-types'
import { SITE_NAME, SITE_URL } from '@/lib/env'
import { DISCLAIMER, STAT_WINDOWS, windowLabel } from '@/lib/site'

export const revalidate = 604800

export const metadata: Metadata = {
  title: '최근 20회 로또 많이 나온 번호와 안 나온 번호',
  description:
    '최근 20회 로또 당첨번호를 기준으로 많이 나온 번호, 적게 나온 번호, 오래 안 나온 번호, 출현 빈도를 확인해보세요.',
  alternates: { canonical: '/lotto/stat/hot-cold' },
  openGraph: {
    type: 'website',
    url: '/lotto/stat/hot-cold',
    title: '최근 20회 로또 많이 나온 번호와 안 나온 번호',
    description: '많이 나온 번호, 적게 나온 번호, 오래 안 나온 번호를 회차 구간별로 정리했습니다.',
  },
}

export default async function HotColdPage() {
  // 네 구간을 미리 받아 서버에서 렌더링해 둔다. 탭은 그중 하나를 고르기만 한다
  // (쿼리스트링 없이 전환하기 위해 — StatWindowTabs 주석 참조).
  const results = await Promise.all(STAT_WINDOWS.map((option) => getHotCold(option.value)))

  const panels: Partial<Record<string, React.ReactNode>> = {}
  STAT_WINDOWS.forEach((option, index) => {
    panels[String(option.value)] = (
      <HotColdPanel data={results[index] ?? undefined} window={option.value} />
    )
  })

  return (
    <div className="container">
      <Breadcrumb
        items={[
          { name: '홈', href: '/' },
          { name: '로또 6/45', href: '/lotto' },
          { name: '번호 통계', href: '/lotto/stat' },
          { name: '많이 나온 번호 · 안 나온 번호', href: '/lotto/stat/hot-cold' },
        ]}
      />

      <section className="section">
        <h1>많이 나온 번호와 안 나온 번호</h1>
        <p className="muted" style={{ marginTop: 'var(--space-2)' }}>
          선택한 회차 구간에서 각 번호가 몇 번 나왔는지, 어떤 번호가 오래 나오지 않았는지 봅니다.
        </p>
      </section>

      <section className="section" aria-labelledby="hotcold-title">
        <h2 id="hotcold-title" className="sr-only">
          회차 구간별 HOT · COLD 번호
        </h2>

        <StatWindowTabs panels={panels} label="통계 관찰 구간 선택" />

        <Disclaimer spaced>{DISCLAIMER.stats}</Disclaimer>
      </section>

      <AdSlot slot="stat-hot-cold" />

      <section className="section prose" aria-labelledby="read-title">
        <h2 id="read-title">HOT 번호와 COLD 번호는 무엇인가요?</h2>
        <p>
          HOT 번호는 선택한 구간에서 상대적으로 자주 나온 번호이고, COLD 번호는 적게 나온
          번호입니다. 오래 안 나온 번호는 마지막으로 출현한 뒤 몇 회차가 지났는지를 셉니다. 세
          가지 모두 <strong>과거를 요약한 이름</strong>일 뿐 앞으로를 가리키는 표지가 아닙니다.
        </p>
        <p>
          구간을 20회에서 100회로 넓히면 순위가 달라지는 것을 보게 됩니다. 표본이 작을수록 우연한
          쏠림이 커 보이기 때문입니다. 이것이 통계를 볼 때 구간을 함께 봐야 하는 이유이고, 동시에
          특정 구간의 순위에 의미를 부여하기 어려운 이유이기도 합니다.
        </p>
        <p>
          로또 공은 이전 회차를 기억하지 않습니다. 20회 동안 한 번도 나오지 않은 번호가 다음 회차에
          나올 가능성은, 다섯 번 나온 번호가 나올 가능성과 정확히 같습니다.
        </p>
      </section>

      <JsonLd
        data={datasetLd({
          name: '로또 6/45 HOT·COLD 번호 통계',
          description:
            '최근 회차 구간별로 로또 6/45 당첨번호의 출현 횟수와 미출현 회차 수를 집계한 데이터입니다. 과거 회차의 분포를 이해하기 위한 참고 정보입니다.',
          siteName: SITE_NAME,
          siteUrl: SITE_URL,
        })}
      />
    </div>
  )
}

function HotColdPanel({ data, window }: { data: HotColdResult | undefined; window: StatWindow }) {
  if (!data) {
    return (
      <Card>
        <EmptyState>
          {windowLabel(window)} 구간의 통계를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.
        </EmptyState>
      </Card>
    )
  }

  return (
    <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
      <Card as="article" title={`많이 나온 번호 (${windowLabel(window)})`}>
        {data.hot.length > 0 ? (
          <RankList items={data.hot.slice(0, 10)} />
        ) : (
          <EmptyState>표시할 데이터가 없습니다.</EmptyState>
        )}
      </Card>

      <Card as="article" title={`적게 나온 번호 (${windowLabel(window)})`}>
        {data.cold.length > 0 ? (
          // 많이 나온 번호와 같은 척도로 그린다 — 그래야 두 카드의 막대를 비교할 수 있다.
          <RankList items={data.cold.slice(0, 10)} max={data.hot[0]?.count} tone="cold" />
        ) : (
          <EmptyState>표시할 데이터가 없습니다.</EmptyState>
        )}
      </Card>

      <Card as="article" title="오래 안 나온 번호">
        {data.overdue.length > 0 ? (
          <OverdueList items={data.overdue.slice(0, 10)} />
        ) : (
          <EmptyState>표시할 데이터가 없습니다.</EmptyState>
        )}
        <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: 'var(--space-3)' }}>
          마지막 출현 이후 지난 회차 수입니다.
        </p>
      </Card>
    </div>
  )
}
