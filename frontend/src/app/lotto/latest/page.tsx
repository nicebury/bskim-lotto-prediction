import Link from 'next/link'
import type { Metadata } from 'next'

import { Breadcrumb } from '@/components/Breadcrumb'
import { Card, EmptyState } from '@/components/Card'
import { Disclaimer } from '@/components/Disclaimer'
import { LatestRoundCard } from '@/components/LatestRoundCard'
import { NextDrawCard } from '@/components/NextDrawCard'
import { RoundTable } from '@/components/RoundTable'
import { getLatestRound, getRounds } from '@/lib/api'
import { formatDrawDate, formatNumber } from '@/lib/format'

/** 최신 결과는 짧게 재검증한다(추첨 직후 갱신 지연을 줄인다). */
export const revalidate = 600

export const metadata: Metadata = {
  title: '최신 로또 당첨번호와 1등 당첨금',
  description:
    '이번 주 로또 6/45 당첨번호와 보너스 번호, 1등 당첨자 수와 당첨금, 최근 회차별 당첨결과를 확인하세요.',
  alternates: { canonical: '/lotto/latest' },
  openGraph: {
    type: 'website',
    url: '/lotto/latest',
    title: '최신 로또 당첨번호와 1등 당첨금',
    description: '이번 주 로또 6/45 당첨번호와 보너스 번호, 1등 당첨자 수와 당첨금을 확인하세요.',
  },
}

export default async function LatestPage() {
  const [latest, roundPage] = await Promise.all([getLatestRound(), getRounds(1, 20)])
  // 백엔드가 round_no 내림차순으로 보장한다. 프론트가 다시 정렬하지 않는다.
  const rounds = roundPage.items

  return (
    <div className="container">
      <Breadcrumb
        items={[
          { name: '홈', href: '/' },
          { name: '로또 6/45', href: '/lotto' },
          { name: '최신 당첨결과', href: '/lotto/latest' },
        ]}
      />

      <section className="section">
        <h1>
          {latest ? `제${latest.round_no}회 로또 당첨번호` : '최신 로또 당첨번호'}
        </h1>
        <p className="muted" style={{ marginTop: 'var(--space-2)' }}>
          {latest ? (
            <>
              <time dateTime={latest.draw_date}>{formatDrawDate(latest.draw_date)}</time> 추첨된
              가장 최근 회차의 당첨결과입니다.
            </>
          ) : (
            '가장 최근 회차의 당첨결과입니다.'
          )}
        </p>
      </section>

      <section className="section" aria-labelledby="result-title">
        <h2 id="result-title" className="sr-only">
          최신 회차 당첨결과와 다음 추첨 일정
        </h2>
        <div className="split-3" style={{ gridTemplateColumns: '1fr' }}>
          <LatestRoundCard round={latest} />
        </div>
        <div style={{ marginTop: 'var(--space-4)' }}>
          <NextDrawCard latestRoundNo={latest?.round_no ?? null} />
        </div>
      </section>

      <section className="section" aria-labelledby="recent-title">
        <div className="section-head">
          <h2 id="recent-title">최근 회차별 당첨결과</h2>
        </div>
        {rounds.length > 0 ? (
          <RoundTable rounds={rounds} />
        ) : (
          <Card>
            <EmptyState>회차 목록을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.</EmptyState>
          </Card>
        )}
        <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: 'var(--space-3)' }}>
          회차 번호를 누르면 그 회차의 당첨번호와 번호 패턴을 자세히 볼 수 있습니다.
          {roundPage.total > rounds.length &&
            ` 지금까지 ${formatNumber(roundPage.total)}회차가 기록되어 있습니다.`}
        </p>
      </section>

      <section className="section prose" aria-labelledby="check-title">
        <h2 id="check-title">당첨 확인은 어떻게 하나요?</h2>
        <p>
          구매한 용지의 번호와 위 당첨번호를 비교합니다. 6개를 모두 맞히면 1등, 5개와 보너스
          번호가 일치하면 2등, 5개만 맞히면 3등입니다. 4개는 4등, 3개는 5등이며 등수에 따라
          당첨금이 다릅니다. 자세한 절차는{' '}
          <Link href="/guide/how-to-check">로또 당첨번호 확인 방법</Link>과{' '}
          <Link href="/guide/prize-claim">당첨금 수령 방법</Link>에서 안내합니다.
        </p>
        <p>
          여기 표시된 당첨결과는 수집된 데이터를 정리한 것입니다. 실제 당첨 여부와 당첨금은 반드시
          공식 발표를 통해 확인하시기 바랍니다.
        </p>
      </section>

      <Disclaimer>
        본 페이지는 과거 추첨 결과를 정리해 제공하는 정보 서비스입니다. 복권을 판매하거나 구매를
        대행하지 않습니다.
      </Disclaimer>
    </div>
  )
}
