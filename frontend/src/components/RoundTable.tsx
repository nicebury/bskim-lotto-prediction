import Link from 'next/link'

import type { Round } from '@/lib/api-types'
import { formatDrawDate, formatNumber, formatWon } from '@/lib/format'
import { LottoBall } from './LottoBall'
import { EmptyState } from './Card'
import { ScrollArea } from './ScrollArea'

/**
 * 회차 목록 표.
 *
 * 표는 좁은 화면에서 반드시 넘친다. `.table-scroll` 컨테이너 안에서만 가로 스크롤하고
 * body 는 넘기지 않는다(→ docs/wiki/20-design/responsive-rules.md).
 */
export function RoundTable({ rounds }: { rounds: Round[] }) {
  if (rounds.length === 0) {
    return <EmptyState>회차 목록을 불러오지 못했습니다.</EmptyState>
  }

  return (
    <ScrollArea className="table-scroll" label="회차별 당첨번호 표">
      <table className="data-table">
        <caption className="sr-only">회차별 로또 당첨번호와 1등 당첨금</caption>
        <thead>
          <tr>
            <th scope="col">회차</th>
            <th scope="col">추첨일</th>
            <th scope="col">당첨번호</th>
            <th scope="col">보너스</th>
            <th scope="col" className="align-right">
              1등 당첨금
            </th>
          </tr>
        </thead>
        <tbody>
          {rounds.map((round) => (
            <tr key={round.round_no}>
              <th scope="row">
                <Link href={`/lotto/round/${round.round_no}`}>{round.round_no}회</Link>
              </th>
              <td>
                <time dateTime={round.draw_date}>{formatDrawDate(round.draw_date)}</time>
              </td>
              <td>
                <span className="ball-row">
                  {round.numbers.map((n) => (
                    <LottoBall key={n} number={n} size="sm" />
                  ))}
                </span>
              </td>
              <td>
                <LottoBall number={round.bonus} bonus size="sm" />
              </td>
              <td className="align-right">
                {round.first_win_amount === null ? (
                  '-'
                ) : (
                  <>
                    {formatWon(round.first_win_amount)}
                    {round.first_winner_count !== null && (
                      <span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
                        {' '}
                        ({formatNumber(round.first_winner_count)}명)
                      </span>
                    )}
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollArea>
  )
}
