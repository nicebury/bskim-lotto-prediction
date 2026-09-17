import Link from 'next/link'

import { LottoBall } from '@/components/LottoBall'
import type { AnalyzePastMatch } from '@/lib/api-types'
import { formatNumber } from '@/lib/format'

const RANK_OF_MATCH: Record<number, string> = { 6: '1등', 5: '2·3등', 4: '4등', 3: '5등' }

/**
 * 블록 3 — 과거 회차 대조.
 *
 * 내 번호가 실제 당첨번호와 얼마나 가까웠는지. **이 화면에서 반응이 가장 좋을 블록**이라
 * 시각적으로 가장 강하게 만든다.
 *
 * ⚠ **3개 이상만 표로 낸다.** 0~2개 일치가 회차의 대부분이라 함께 내면 표가 그것에 묻힌다.
 *   대신 전체 회차 수를 함께 적어 합이 맞는지 사용자가 확인할 수 있게 한다.
 * ⚠ 겹친 번호를 **색으로만 표시하지 않는다.** 볼에 테두리를 더하고 `aria-label` 에 "일치" 를
 *   담는다(WCAG 1.4.1).
 */
export function PastMatchBoard({
  data,
  roundsAnalyzed,
}: {
  data: AnalyzePastMatch
  roundsAnalyzed: number
}) {
  /*
    ⚠ 응답의 키는 **문자열**이다(`{"0": 499, "1": 523, …}`). 숫자로 찾으면 전부 undefined 가
      되어 표가 통째로 0 이 된다.
  */
  const countOf = (k: number) => data.distribution[String(k)] ?? 0
  const rows = [6, 5, 4, 3]

  return (
    <>
      <table className="pm-table">
        <caption className="sr-only">일치 개수별 회차 수</caption>
        <thead>
          <tr>
            <th scope="col">일치</th>
            <th scope="col">회차 수</th>
            <th scope="col">등수</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((k) => (
            <tr key={k} data-zero={countOf(k) === 0 ? '' : undefined}>
              <th scope="row">{k}개</th>
              <td>{formatNumber(countOf(k))}회</td>
              <td className="pm-rank">{RANK_OF_MATCH[k]}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="pm-total">
        역대 {formatNumber(roundsAnalyzed)}회를 모두 맞춰 보았습니다. 2개 이하로 겹친
        회차가 나머지입니다.
      </p>

      {/*
        ⚠ 빈 배열인 것 자체가 화면에 쓸 정보다. "거의 항상 그렇다" 는 사실을 함께 적어야
          사용자가 자기 번호만 나쁜 것으로 오해하지 않는다.
      */}
      <p className="pm-exact">
        {data.exact_match_rounds.length === 0
          ? '이 조합이 역대 1등 번호로 나온 적은 없습니다. 8,145,060가지 가운데 하나이니 자연스러운 일입니다.'
          : `이 조합은 ${data.exact_match_rounds.map((r) => `${r}회`).join(', ')}에 1등 번호로 나왔습니다.`}
      </p>

      {data.closest.length > 0 && (
        <div className="pm-closest">
          <h3>가장 가까웠던 회차</h3>
          <ol className="pm-list">
            {data.closest.map((m) => (
              <li key={m.round_no}>
                <div className="pm-head">
                  <Link href={`/lotto/round/${m.round_no}`}>{m.round_no}회</Link>
                  <span className="pm-date">{m.draw_date}</span>
                  <span className="pm-badge">
                    {m.match_count}개 일치
                    {m.rank !== null && ` · ${m.rank}등`}
                  </span>
                </div>
                <div className="ball-row pm-balls">
                  {m.numbers.map((n) => {
                    const hit = m.matched.includes(n)
                    return (
                      <span key={n} className="pm-ball" data-hit={hit ? '' : undefined}>
                        <LottoBall number={n} />
                        {hit && <span className="sr-only">일치</span>}
                      </span>
                    )
                  })}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </>
  )
}
