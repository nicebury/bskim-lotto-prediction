import type { Metadata } from 'next'

import { AdSlot } from '@/components/AdSlot'
import { Breadcrumb } from '@/components/Breadcrumb'
import { Disclaimer } from '@/components/Disclaimer'
import { FrequencyExplorer } from '@/components/FrequencyExplorer'
import { JsonLd, datasetLd } from '@/components/JsonLd'
import { getFrequency } from '@/lib/api'
import type { FrequencyResult } from '@/lib/api-types'
import { SITE_NAME, SITE_URL } from '@/lib/env'
import { DISCLAIMER, STAT_WINDOWS } from '@/lib/site'

export const revalidate = 604800

export const metadata: Metadata = {
  title: '로또 번호별 출현 빈도 통계',
  description:
    '로또 6/45 번호별로 지금까지 몇 번 나왔는지 회차 구간과 보너스 번호 포함 여부를 골라 확인해보세요.',
  alternates: { canonical: '/lotto/stat/frequency' },
  openGraph: {
    type: 'website',
    url: '/lotto/stat/frequency',
    title: '로또 번호별 출현 빈도 통계',
    description: '1번부터 45번까지 각 번호의 출현 횟수를 회차 구간별로 정리했습니다.',
  },
}

export default async function FrequencyPage() {
  // 구간 4종 × 보너스 포함 여부 2종. 클라이언트가 쿼리 없이 전환할 수 있도록 미리 받는다.
  const combos = STAT_WINDOWS.flatMap((option) =>
    [false, true].map((includeBonus) => ({ window: option.value, includeBonus })),
  )
  const results = await Promise.all(
    combos.map((combo) => getFrequency(combo.window, combo.includeBonus)),
  )

  const byKey: Partial<Record<string, FrequencyResult>> = {}
  combos.forEach((combo, index) => {
    const result = results[index]
    if (result) byKey[`${combo.window}:${combo.includeBonus}`] = result
  })

  return (
    <div className="container">
      <Breadcrumb
        items={[
          { name: '홈', href: '/' },
          { name: '로또 6/45', href: '/lotto' },
          { name: '번호 통계', href: '/lotto/stat' },
          { name: '번호별 출현 빈도', href: '/lotto/stat/frequency' },
        ]}
      />

      <section className="section">
        <h1>로또 번호별 출현 빈도</h1>
        <p className="muted" style={{ marginTop: 'var(--space-2)' }}>
          1번부터 45번까지 각 번호가 몇 번 나왔는지 횟수 그대로 보여줍니다.
        </p>
      </section>

      <section className="section" aria-labelledby="freq-title">
        <h2 id="freq-title" className="sr-only">
          회차 구간별 출현 빈도
        </h2>
        <FrequencyExplorer data={byKey} />
        <Disclaimer spaced>{DISCLAIMER.stats}</Disclaimer>
      </section>

      <AdSlot slot="stat-frequency" />

      <section className="section prose" aria-labelledby="freq-read">
        <h2 id="freq-read">출현 빈도를 어떻게 봐야 하나요?</h2>
        <p>
          여기 보이는 숫자는 <strong>정규화된 점수가 아니라 실제 횟수</strong>입니다. 직접 세어
          검증할 수 있어야 한다고 보기 때문입니다. 예를 들어 최근 20회 구간에서 어떤 번호의 값이
          5라면, 그 번호가 지난 20회 추첨에서 다섯 번 당첨번호에 포함되었다는 뜻입니다.
        </p>
        <p>
          한 회차에는 6개의 번호가 나오므로 20회 구간에는 총 120개의 번호가 있습니다. 45개 번호가
          고르게 나온다면 각 번호는 평균 2.7번쯤 나옵니다. 실제로는 어떤 번호는 다섯 번, 어떤
          번호는 한 번도 나오지 않습니다. 이런 들쭉날쭉함은 무작위 추첨에서 자연스럽게 생기는
          현상이며, 회차를 100회, 1,000회로 늘릴수록 번호 사이의 격차는 줄어듭니다.
        </p>
        <p>
          보너스 번호는 2등 판정에만 쓰이므로 당첨번호와 성격이 다릅니다. 기본값은 보너스를
          제외하고 세며, 체크박스로 포함해 볼 수 있습니다. 어느 쪽으로 세든 특정 번호가 다음
          회차에 나올 가능성은 달라지지 않습니다.
        </p>
      </section>

      <JsonLd
        data={datasetLd({
          name: '로또 6/45 번호별 출현 빈도 통계',
          description:
            '역대 로또 6/45 당첨번호를 집계한 번호별 출현 횟수 데이터입니다. 과거 회차의 분포를 이해하기 위한 참고 정보입니다.',
          siteName: SITE_NAME,
          siteUrl: SITE_URL,
        })}
      />
    </div>
  )
}
