import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

import { AdSlot } from '@/components/AdSlot'
import { Breadcrumb } from '@/components/Breadcrumb'
import { Card } from '@/components/Card'
import { Disclaimer } from '@/components/Disclaimer'
import { JsonLd, articleLd } from '@/components/JsonLd'
import { BallRow } from '@/components/LottoBall'
import { KeyValueList } from '@/components/stats'
import { getRound, getSitemapEntries } from '@/lib/api'
import { SITE_NAME, SITE_URL } from '@/lib/env'
import { formatDrawDate, formatNumber, formatWon } from '@/lib/format'
import { rangeSentence, traitRows, traitSentence } from '@/lib/traits'

/**
 * 회차 상세 — **SEO 유입의 핵심 페이지**다. 회차가 쌓일수록 자산이 된다.
 *
 * 과거 회차는 사실상 불변이므로 긴 주기로 재검증한다. 목록에 없는 회차(방금 추첨된 최신
 * 회차 등)도 요청 시 생성되도록 dynamicParams 를 켠다.
 * → docs/wiki/30-seo/metadata-strategy.md 렌더링 전략
 */
export const revalidate = 604800 // 7일
export const dynamicParams = true

/**
 * 빌드 시 굽는 회차 목록.
 *
 * ⚠ 백엔드가 없으면 빈 배열을 반환해 **빌드를 실패시키지 않는다.** 그 경우 모든 회차가
 *   첫 요청 때 생성되고(ISR), 이후 캐시된다.
 * ⚠ 회차가 1,200건을 넘으면 빌드 시간이 길어진다. 전부 굽는 것이 SEO 상 유리하지만,
 *   빌드 시간이 문제가 되면 최근 N개만 굽고 나머지를 dynamicParams 에 맡기는 선택지가 있다.
 */
export async function generateStaticParams() {
  const entries = await getSitemapEntries()
  return (entries?.rounds ?? []).map((round) => ({ roundNo: String(round.round_no) }))
}

type Params = { params: Promise<{ roundNo: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { roundNo } = await params
  const parsed = Number.parseInt(roundNo, 10)
  if (!Number.isFinite(parsed)) return {}

  const title = `제${parsed}회 로또 당첨번호와 1등 당첨금`
  const description = `제${parsed}회 로또 당첨번호, 보너스 번호, 1등 당첨자 수, 당첨금, 번호 패턴 분석을 확인해보세요.`
  const url = `/lotto/round/${parsed}`

  return {
    title,
    description,
    alternates: { canonical: url },
    // 회차 상세는 문서형 콘텐츠다.
    openGraph: { type: 'article', url, title, description },
  }
}

export default async function RoundDetailPage({ params }: Params) {
  const { roundNo } = await params
  const parsed = Number.parseInt(roundNo, 10)

  // '/lotto/round/abc' 나 '/lotto/round/0' 은 존재할 수 없는 자원이다.
  if (!Number.isFinite(parsed) || parsed < 1) notFound()

  const round = await getRound(parsed)
  if (!round) notFound()

  const traits = round.traits
  const patternText = traits ? traitSentence(traits, '이번 회차의 당첨번호') : null
  const rangeText = traits ? rangeSentence(traits) : null

  // 수집 소스에 없는 값(총 판매금액·누적 당첨금)은 대부분 null 이다. 있는 것만 보여준다.
  const metrics = [
    round.first_winner_count !== null && {
      label: '1등 당첨자 수',
      value: `${formatNumber(round.first_winner_count)}명`,
    },
    round.first_win_amount !== null && {
      label: '1등 1게임당 당첨금',
      value: formatWon(round.first_win_amount),
    },
    round.total_sell_amount !== null && {
      label: '총 판매금액',
      value: formatWon(round.total_sell_amount),
    },
  ].filter(Boolean) as { label: string; value: string }[]

  return (
    <div className="container">
      <Breadcrumb
        items={[
          { name: '홈', href: '/' },
          { name: '로또 6/45', href: '/lotto' },
          { name: `제${round.round_no}회`, href: `/lotto/round/${round.round_no}` },
        ]}
      />

      <article>
        <section className="section">
          <h1>제{round.round_no}회 로또 당첨번호</h1>
          <p className="muted" style={{ marginTop: 'var(--space-2)' }}>
            <time dateTime={round.draw_date}>{formatDrawDate(round.draw_date)}</time> 추첨
          </p>
        </section>

        <section className="section" aria-labelledby="numbers-title">
          <h2 id="numbers-title" className="sr-only">
            당첨번호와 당첨금
          </h2>
          <Card>
            <BallRow numbers={round.numbers} bonus={round.bonus} size="lg" captions />

            {/*
              값이 없는 지표는 칸을 그리지 않는다. '-' 만 적힌 상자는 자리만 차지하고
              아무것도 알려주지 않는다. 소스가 확보되면 칸이 자동으로 나타난다.
            */}
            {metrics.length > 0 && (
              <dl className="latest-meta" data-count={metrics.length}>
                {metrics.map((metric) => (
                  <div className="meta-box" key={metric.label}>
                    <dt>{metric.label}</dt>
                    <dd>{metric.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </Card>
        </section>

        {/*
          등위별 정보는 소스가 확보되지 않아 현재 항상 빈 배열이다(계약).
          비어 있으면 섹션 자체를 렌더링하지 않는다 — "준비 중" 빈 표를 만들지 않는다.
        */}
        {round.prize_tiers.length > 0 && (
          <section className="section" aria-labelledby="prize-title">
            <div className="section-head">
              <h2 id="prize-title">등위별 당첨자 수와 당첨금</h2>
            </div>
            <div className="table-scroll">
              <table className="data-table">
                <caption className="sr-only">제{round.round_no}회 등위별 당첨 정보</caption>
                <thead>
                  <tr>
                    <th scope="col">등위</th>
                    <th scope="col" className="align-right">
                      당첨자 수
                    </th>
                    <th scope="col" className="align-right">
                      1게임당 당첨금
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {round.prize_tiers.map((tier) => (
                    <tr key={tier.rank}>
                      <th scope="row">{tier.rank}등</th>
                      <td className="align-right">{formatNumber(tier.winner_count)}명</td>
                      <td className="align-right">{formatWon(tier.prize_per_game)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/*
          이 회차만의 문장. 값이 회차마다 다르므로 문장도 달라진다 — 1,231개 페이지가
          동일 템플릿 반복으로 읽히지 않게 하는 지점이다(초안 8.1).
        */}
        {traits && (
          <section className="section" aria-labelledby="pattern-title">
            <div className="section-head">
              <h2 id="pattern-title">이번 회차 번호 패턴</h2>
            </div>
            <div className="split-3" style={{ gridTemplateColumns: '1fr' }}>
              <Card>
                <div className="prose">
                  {patternText && <p>{patternText}</p>}
                  {rangeText && <p>{rangeText}</p>}
                </div>
                <div style={{ marginTop: 'var(--space-4)' }}>
                  <KeyValueList rows={traitRows(traits)} />
                </div>
              </Card>
            </div>
            <Disclaimer spaced>
              위 수치는 이 회차 당첨번호가 가진 성향을 사실 그대로 정리한 것입니다. 다음 회차의
              추첨 결과와는 관계가 없습니다.
            </Disclaimer>
          </section>
        )}

        <AdSlot slot="round-detail" />

        {/* 관련 회차 링크. 내부 링크는 색인과 사용자 탐색 양쪽에 기여한다. */}
        <nav className="section" aria-label="이웃 회차">
          <div className="hero-cta">
            {round.round_no > 1 && (
              <Link className="btn btn-secondary" href={`/lotto/round/${round.round_no - 1}`}>
                ‹ 제{round.round_no - 1}회
              </Link>
            )}
            <Link className="btn btn-secondary" href={`/lotto/round/${round.round_no + 1}`}>
              제{round.round_no + 1}회 ›
            </Link>
            <Link className="btn btn-secondary" href="/lotto/latest">
              최신 회차 보기
            </Link>
          </div>
        </nav>

        <section className="section prose" aria-labelledby="howto-title">
          <h2 id="howto-title">제{round.round_no}회 당첨 확인 방법</h2>
          <p>
            구매한 용지의 번호와 위 당첨번호 6개를 비교합니다. 6개를 모두 맞히면 1등, 5개와 보너스
            번호({round.bonus}번)가 일치하면 2등, 5개만 맞히면 3등입니다. 4개는 4등, 3개는 5등이며
            등수에 따라 당첨금이 달라집니다. 보너스 번호는 2등 판정에만 사용됩니다.
          </p>
          <p>
            당첨금 수령 절차와 지급 기한은{' '}
            <Link href="/guide/prize-claim">당첨금 수령 방법</Link>에서 안내합니다. 실제 당첨 여부와
            당첨금은 공식 발표를 통해 확인하시기 바랍니다.
          </p>
        </section>
      </article>

      <JsonLd
        data={articleLd({
          headline: `제${round.round_no}회 로또 당첨번호와 1등 당첨금`,
          description: `제${round.round_no}회 로또 당첨번호는 ${round.numbers.join(', ')}이며 보너스 번호는 ${round.bonus}입니다.`,
          siteName: SITE_NAME,
          siteUrl: SITE_URL,
          datePublished: round.draw_date,
        })}
      />
    </div>
  )
}
