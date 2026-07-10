import Link from 'next/link'

import type { Round } from '@/lib/api-types'
import { formatDrawDate, formatNumber, formatWon } from '@/lib/format'
import { BallRow } from './LottoBall'
import { Card, EmptyState, MoreLink } from './Card'

/**
 * 최신 회차 결과 카드. 홈 3분할의 첫 칸과 /lotto 상단이 공유한다.
 *
 * `total_sell_amount` 와 `first_accum_amount` 는 현재 수집 소스에 없어 거의 항상 null 이다.
 * **값이 없으면 그 칸을 아예 그리지 않는다.** '-' 만 적힌 상자는 자리만 차지하고 아무것도
 * 알려주지 않는다. 소스가 확보돼 값이 들어오면 칸이 자동으로 나타난다 — 계약이 "언젠가
 * 채워질 수 있음을 전제로 만든다" 고 한 것의 실제 구현이다.
 */
export function LatestRoundCard({ round }: { round: Round | null }) {
  if (!round) {
    return (
      <Card as="article" title="최신 회차 당첨결과" titleAs="h3">
        <EmptyState>당첨결과를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.</EmptyState>
      </Card>
    )
  }

  // 값이 있는 항목만 남긴다. 순서는 중요도 순.
  const metrics = [
    round.first_winner_count !== null && {
      label: '1등 당첨자',
      value: `${formatNumber(round.first_winner_count)}명`,
    },
    round.first_win_amount !== null && {
      label: '1인당 당첨금',
      value: formatWon(round.first_win_amount),
    },
    round.total_sell_amount !== null && {
      label: '총 판매금액',
      value: formatWon(round.total_sell_amount),
    },
  ].filter(Boolean) as { label: string; value: string }[]

  return (
    <Card
      as="article"
      title={`제${round.round_no}회 로또 당첨결과`}
      titleAs="h3"
      action={<MoreLink href={`/lotto/round/${round.round_no}`} label="회차 상세" />}
    >
      <p className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
        <time dateTime={round.draw_date}>{formatDrawDate(round.draw_date)}</time> 추첨
      </p>

      <div style={{ marginTop: 'var(--space-4)' }}>
        {/* 색만으로 '당첨번호'와 '보너스'를 구분하지 않는다. 캡션이 각 볼 아래 붙는다. */}
        <BallRow numbers={round.numbers} bonus={round.bonus} captions />
      </div>

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

      <p style={{ marginTop: 'var(--space-3)' }}>
        <Link className="more-link" href="/lotto/latest">
          회차별 당첨결과 전체보기 <span aria-hidden="true">›</span>
        </Link>
      </p>
    </Card>
  )
}
