import type { FrequencyResult, HotColdResult, PatternResult } from '@/lib/api-types'
import { formatNumber } from '@/lib/format'
import { toPercent } from '@/lib/traits'
import { Card, EmptyState, MoreLink } from './Card'
import { FrequencyChart, RankList, KeyValueList } from './stats'

/**
 * 홈·대시보드의 주요 통계 4카드.
 *
 * ⚠ 어떤 카드도 **집계하지 않는다.** 서버가 준 값을 표시할 뿐이다. 빈도 카드가 counts 를
 *   정렬해 상위 5개를 고르는 것은 통계 생성이 아니라 표시 선택이다 — 화면에 보이는 횟수는
 *   전부 서버가 계산한 그 값 그대로다.
 */

/** 많이 나온 번호 TOP 5 */
export function HotCard({ data }: { data: HotColdResult | null }) {
  return (
    <Card
      as="article"
      title="많이 나온 번호 TOP 5"
      action={<MoreLink href="/lotto/stat/hot-cold" />}
    >
      {data && data.hot.length > 0 ? (
        <RankList items={data.hot.slice(0, 5)} />
      ) : (
        <EmptyState>통계를 불러오지 못했습니다.</EmptyState>
      )}
      <p className="card-note">
        {data
          ? `최근 ${data.rounds_analyzed}회 기준 출현 횟수입니다.`
          : '최근 회차 기준 출현 횟수입니다.'}
      </p>
    </Card>
  )
}

/**
 * 안 나온 번호 TOP 5.
 *
 * 막대 길이의 기준을 **HOT 번호의 최댓값**으로 잡는다. 그러지 않으면 적게 나온 번호들끼리
 * 정규화되어 막대가 꽉 차 보이고, "적게 나왔다" 는 사실이 시각적으로 뒤집힌다.
 */
export function ColdCard({ data }: { data: HotColdResult | null }) {
  const items = data?.cold ?? []
  const peak = data?.hot?.[0]?.count

  return (
    <Card as="article" title="안 나온 번호 TOP 5" action={<MoreLink href="/lotto/stat/hot-cold" />}>
      {items.length > 0 ? (
        <RankList items={items.slice(0, 5)} max={peak} tone="cold" />
      ) : (
        <EmptyState>통계를 불러오지 못했습니다.</EmptyState>
      )}
      <p className="card-note">
        {data
          ? `최근 ${data.rounds_analyzed}회 기준 출현횟수가 적은 번호입니다.`
          : '최근 회차 기준 출현횟수가 적은 번호입니다.'}
      </p>
    </Card>
  )
}

/**
 * 번호 출현 빈도.
 * 모바일에서는 45개 막대의 가독성이 없으므로 상위 5개 목록으로 축약하고, 전체 차트는
 * 통계 상세 페이지로 보낸다(→ docs/wiki/20-design/responsive-rules.md 차트 축약).
 */
export function FrequencyCard({ data }: { data: FrequencyResult | null }) {
  const action = <MoreLink href="/lotto/stat/frequency" />

  if (!data || Object.keys(data.counts).length === 0) {
    return (
      <Card as="article" title="번호 출현 빈도" action={action}>
        <EmptyState>통계를 불러오지 못했습니다.</EmptyState>
      </Card>
    )
  }

  // 서버가 준 횟수를 정렬만 한다. 새 수치를 만들지 않는다.
  const sorted = Object.entries(data.counts)
    .map(([n, count]) => ({ number: Number(n), count }))
    .sort((a, b) => b.count - a.count)
  const top = sorted[0]
  const bottom = sorted[sorted.length - 1]

  return (
    <Card as="article" title="번호 출현 빈도" action={action}>
      <div className="only-desktop">
        <FrequencyChart counts={data.counts} />
      </div>
      <div className="only-mobile">
        <RankList items={sorted.slice(0, 5)} />
      </div>

      <p className="card-note">
        최다 {top.number}번 ({formatNumber(top.count)}회) · 최소 {bottom.number}번 (
        {formatNumber(bottom.count)}회)
      </p>
    </Card>
  )
}

/** 패턴 분석 요약. 분포 맵에서 가장 흔했던 모양 하나씩만 보여준다. */
export function PatternCard({ data }: { data: PatternResult | null }) {
  const rows = patternSummaryRows(data)

  return (
    <Card as="article" title="패턴 분석" action={<MoreLink href="/lotto/stat/pattern" />}>
      {rows.length > 0 ? (
        // '가장 흔한 홀짝' 처럼 라벨이 곧 무엇을 센 것인지 알려준다. 라벨을 강조한다.
        <KeyValueList rows={rows} strongLabels />
      ) : (
        <EmptyState>통계를 불러오지 못했습니다.</EmptyState>
      )}
    </Card>
  )
}

/**
 * PatternResult → 요약 행.
 *
 * `odd_even`·`high_low` 는 `{"3:3": 0.33, "4:2": 0.24}` 형태의 분포 맵이고 백엔드가
 * **비율 내림차순으로 정렬해** 보낸다. 그래서 첫 항목이 곧 최빈 모양이다 — 여기서 다시
 * 정렬하거나 최댓값을 찾지 않는다.
 */
export function patternSummaryRows(data: PatternResult | null): { label: string; value: string }[] {
  if (!data) return []
  const rows: { label: string; value: string }[] = []

  const topOddEven = Object.entries(data.odd_even ?? {})[0]
  if (topOddEven) {
    rows.push({ label: '가장 흔한 홀짝', value: `${topOddEven[0]} (${toPercent(topOddEven[1])})` })
  }

  const topHighLow = Object.entries(data.high_low ?? {})[0]
  if (topHighLow) {
    rows.push({ label: '가장 흔한 고저', value: `${topHighLow[0]} (${toPercent(topHighLow[1])})` })
  }

  if (data.sum_range) {
    rows.push({ label: '합계 중앙값', value: formatNumber(data.sum_range.peak) })
  }

  if (typeof data.consecutive_ratio === 'number') {
    rows.push({ label: '연속번호 출현', value: toPercent(data.consecutive_ratio) })
  }

  return rows
}
