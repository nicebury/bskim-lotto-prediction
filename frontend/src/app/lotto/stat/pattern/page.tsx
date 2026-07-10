import type { Metadata } from 'next'

import { AdSlot } from '@/components/AdSlot'
import { Breadcrumb } from '@/components/Breadcrumb'
import { Card, EmptyState } from '@/components/Card'
import { Disclaimer } from '@/components/Disclaimer'
import { JsonLd, datasetLd } from '@/components/JsonLd'
import { KeyValueList } from '@/components/stats'
import { StatWindowTabs } from '@/components/StatWindowTabs'
import { getPattern } from '@/lib/api'
import type { PatternResult, StatWindow } from '@/lib/api-types'
import { SITE_NAME, SITE_URL } from '@/lib/env'
import { formatNumber } from '@/lib/format'
import { DISCLAIMER, STAT_WINDOWS, windowLabel } from '@/lib/site'
import { distributionRows, toPercent } from '@/lib/traits'

export const revalidate = 604800

export const metadata: Metadata = {
  title: '로또 홀짝·고저·합계·연속번호 패턴 통계',
  description:
    '로또 6/45 당첨 조합의 홀짝 비율, 고저 비율, 번호 합계 범위, 연속번호 출현 비율을 회차 구간별로 확인해보세요.',
  alternates: { canonical: '/lotto/stat/pattern' },
  openGraph: {
    type: 'website',
    url: '/lotto/stat/pattern',
    title: '로또 홀짝·고저·합계·연속번호 패턴 통계',
    description: '당첨 조합이 어떤 분포를 그려 왔는지 회차 구간별로 정리했습니다.',
  },
}

export default async function PatternPage() {
  const results = await Promise.all(STAT_WINDOWS.map((option) => getPattern(option.value)))

  // 네 구간을 서버에서 미리 렌더링한다. 클라이언트 탭은 그중 하나를 고르기만 한다.
  const panels: Partial<Record<string, React.ReactNode>> = {}
  STAT_WINDOWS.forEach((option, index) => {
    panels[String(option.value)] = (
      <PatternPanel data={results[index] ?? undefined} window={option.value} />
    )
  })

  return (
    <div className="container">
      <Breadcrumb
        items={[
          { name: '홈', href: '/' },
          { name: '로또 6/45', href: '/lotto' },
          { name: '번호 통계', href: '/lotto/stat' },
          { name: '패턴 분석', href: '/lotto/stat/pattern' },
        ]}
      />

      <section className="section">
        <h1>로또 번호 패턴 통계</h1>
        <p className="muted" style={{ marginTop: 'var(--space-2)' }}>
          당첨 조합이 홀짝·고저·합계·연속번호에서 어떤 분포를 그려 왔는지 정리했습니다.
        </p>
      </section>

      <section className="section" aria-labelledby="pattern-title">
        <h2 id="pattern-title" className="sr-only">
          회차 구간별 패턴 분포
        </h2>
        <StatWindowTabs panels={panels} label="통계 관찰 구간 선택" />
        <Disclaimer spaced>{DISCLAIMER.stats}</Disclaimer>
      </section>

      <AdSlot slot="stat-pattern" />

      <section className="section prose" aria-labelledby="pattern-read">
        <h2 id="pattern-read">패턴 지표는 무엇을 뜻하나요?</h2>
        <h3>홀짝 비율</h3>
        <p>
          당첨번호 6개 중 홀수와 짝수가 몇 개씩이었는지의 분포입니다. 표에 보이는 백분율은 그 모양이
          관찰된 <strong>회차의 비율</strong>입니다. 3대 3이 가장 흔하지만 4대 2나 2대 4도 드물지
          않습니다. 6개가 모두 홀수이거나 모두 짝수인 조합은 거의 나오지 않는데, 그런 조합의 가짓수
          자체가 적기 때문입니다.
        </p>
        <h3>고저 비율</h3>
        <p>
          번호를 낮은 쪽(1~22)과 높은 쪽(23~45)으로 나눈 비율입니다. 홀짝과 마찬가지로 3대 3
          주변에 몰립니다. 이것도 어느 한쪽이 &ldquo;더 잘 나오기&rdquo; 때문이 아니라, 균형 잡힌
          조합의 가짓수가 극단적인 조합보다 훨씬 많기 때문입니다.
        </p>
        <h3>번호 합계</h3>
        <p>
          여섯 번호를 더한 값입니다. 이론상 최솟값은 21(1+2+3+4+5+6), 최댓값은
          255(40+41+42+43+44+45)입니다. 표의 범위는 실제 당첨 조합 합계의 10~90 퍼센타일이고,
          중앙값은 그 한가운데입니다. 합계가 중간에 몰리는 것 역시 조합의 가짓수 때문입니다.
        </p>
        <h3>연속번호</h3>
        <p>
          14와 15처럼 이어진 번호가 한 쌍 이상 포함된 회차의 비율입니다. 생각보다 자주 나타납니다.
          &ldquo;연속번호는 잘 안 나온다&rdquo;는 통념과 실제 기록이 어긋나는 대표적인 지점입니다.
        </p>
        <h3>끝수</h3>
        <p>
          번호의 1의 자리를 끝수라고 부릅니다. 7과 17은 끝수가 같습니다. 한 조합에 끝수가 몇 종류
          있었는지의 평균과, 0부터 9까지 각 끝수가 등장한 총 횟수를 보여줍니다.
        </p>
        <p>
          이 지표들은 모두 <strong>이미 나온 조합의 모양</strong>을 요약합니다. 어떤 모양이 자주
          관찰되었다는 사실은 그 모양이 다음에 나올 가능성이 크다는 뜻이 아닙니다. 모든 조합은 매
          회차 같은 처지에 있습니다.
        </p>
      </section>

      <JsonLd
        data={datasetLd({
          name: '로또 6/45 번호 패턴 통계',
          description:
            '역대 로또 6/45 당첨 조합의 홀짝 비율, 고저 비율, 합계 분포, 연속번호 출현 비율을 집계한 데이터입니다. 과거 회차의 분포를 이해하기 위한 참고 정보입니다.',
          siteName: SITE_NAME,
          siteUrl: SITE_URL,
        })}
      />
    </div>
  )
}

function PatternPanel({ data, window }: { data: PatternResult | undefined; window: StatWindow }) {
  if (!data) {
    return (
      <Card>
        <EmptyState>
          {windowLabel(window)} 구간의 통계를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.
        </EmptyState>
      </Card>
    )
  }

  // 끝수 카운트는 0~9 순서로 보여야 읽힌다. 비율맵과 달리 정렬 의미가 없다.
  const tailRows = Object.entries(data.tail_counts ?? {})
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([tail, count]) => ({ label: `끝수 ${tail}`, value: `${formatNumber(count)}회` }))

  return (
    <div>
      <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginBottom: 'var(--space-4)' }}>
        {windowLabel(window)} 구간에서 실제로 집계된 회차는 {formatNumber(data.rounds_analyzed)}
        회입니다.
      </p>

      <div
        className="stat-grid"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}
      >
        <Card as="article" title="홀짝 비율 분포">
          <KeyValueList rows={distributionRows(data.odd_even)} />
          <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: 'var(--space-3)' }}>
            키는 홀수 개수 대 짝수 개수입니다.
          </p>
        </Card>

        <Card as="article" title="고저 비율 분포">
          <KeyValueList rows={distributionRows(data.high_low)} />
          <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: 'var(--space-3)' }}>
            23 이상을 높은 번호로 봅니다.
          </p>
        </Card>

        <Card as="article" title="번호 합계와 연속번호">
          <KeyValueList
            rows={[
              { label: '합계 중앙값', value: formatNumber(data.sum_range.peak) },
              {
                label: '합계 범위 (10~90%)',
                value: `${formatNumber(data.sum_range.min)} ~ ${formatNumber(data.sum_range.max)}`,
              },
              { label: '연속번호 출현', value: toPercent(data.consecutive_ratio) },
              { label: '끝수 평균 가짓수', value: `${data.tail_variety_avg.toFixed(2)}종` },
            ]}
          />
        </Card>
      </div>

      {tailRows.length > 0 && (
        <div style={{ marginTop: 'var(--space-4)' }}>
          <Card as="article" title="끝수별 등장 횟수">
            <KeyValueList rows={tailRows} />
          </Card>
        </div>
      )}
    </div>
  )
}
