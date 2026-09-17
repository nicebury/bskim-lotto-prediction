import Link from 'next/link'

import { LottoBall } from '@/components/LottoBall'
import type { AnalyzePastMatch, AnalyzeRetrospect } from '@/lib/api-types'
import { formatNumber } from '@/lib/format'

/**
 * 블록 3 — 과거 회차 대조 (2026-09-17 재설계).
 *
 * ── 바꾼 것 ────────────────────────────────────────────────────────
 * 종전에는 `일치 | 회차 수 | 등수` 표 네 줄과, 가장 가까웠던 회차 볼 목록이었다. 표는 3개 이상만
 * 보여 "나머지 1,200여 회는 어땠나" 가 문장 한 줄로 밀려났다.
 *
 *   ① **일치 사다리** — 6개부터 0개까지 일곱 칸을 모두 막대로 세운다. 대부분이 0~2개에 몰려
 *      있다는 사실이 막대 길이로 바로 보인다. 3개 이상 칸에는 등수 칩을 붙인다.
 *   ② **가장 짜릿했던 순간** — 가장 많이 맞았던 회차를 **날짜가 적힌 복권 한 장**처럼 보여 준다.
 *      "2006년 10월 7일, 네 개가 맞아 5만 원" 처럼 그날의 장면으로 읽히게.
 *
 * ── ⚠ 지키는 것 ────────────────────────────────────────────────────
 * - 응답의 `distribution` 키는 **문자열**이다(`"0"`…`"6"`). 숫자로 찾으면 전부 undefined.
 * - 막대 폭은 **표시용 비율**(가장 긴 칸 기준)이다. 0 이 아닌 칸은 최소 폭을 줘 "없음" 과 구별한다.
 * - 겹친 번호를 색으로만 표시하지 않는다. 테두리 + `sr-only` "일치"(WCAG 1.4.1).
 * - 당첨금은 `retrospect.prizes` 의 `amount_each` 만 쓴다. 1~3등 금액은 지어내지 않는다(계약).
 */

const ROWS: { match: number; rank: string | null }[] = [
  { match: 6, rank: '1등' },
  { match: 5, rank: '2·3등' },
  { match: 4, rank: '4등' },
  { match: 3, rank: '5등' },
  { match: 2, rank: null },
  { match: 1, rank: null },
  { match: 0, rank: null },
]

export function PastMatchBoard({
  data,
  roundsAnalyzed,
  retrospect,
}: {
  data: AnalyzePastMatch
  roundsAnalyzed: number
  retrospect: AnalyzeRetrospect
}) {
  const countOf = (k: number) => data.distribution[String(k)] ?? 0
  const max = Math.max(1, ...ROWS.map((r) => countOf(r.match)))
  const amountOf = (rank: number | null) =>
    rank === null ? null : (retrospect.prizes.find((p) => p.rank === rank)?.amount_each ?? null)
  const best = ROWS.find((r) => countOf(r.match) > 0)?.match ?? 0

  return (
    <div className="pm2">
      {/* ── ① 일치 사다리 ─────────────────────────────── */}
      <div className="pm2-ladder">
        <p className="pm2-lede">
          역대 <strong>{formatNumber(roundsAnalyzed)}회</strong> 당첨번호와 하나하나 맞춰 보니, 가장
          많이 맞은 날은 <strong>{best}개</strong>였습니다.
        </p>
        <table className="pm2-table">
          <caption className="sr-only">일치 개수별 회차 수</caption>
          <thead className="sr-only">
            <tr>
              <th scope="col">일치 개수</th>
              <th scope="col">회차 수</th>
              <th scope="col">등수</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => {
              const count = countOf(row.match)
              const width = count === 0 ? 0 : Math.max(1.2, (count / max) * 100)
              return (
                <tr
                  key={row.match}
                  data-win={row.rank ? '' : undefined}
                  data-zero={count === 0 ? '' : undefined}
                >
                  <th scope="row">{row.match}개</th>
                  <td className="pm2-barcell">
                    <span className="pm2-bar">
                      <span style={{ width: `${width}%` }} />
                    </span>
                    <span className="pm2-count">{formatNumber(count)}회</span>
                  </td>
                  <td className="pm2-rankcell">
                    {row.rank ? <span className="pm2-rank">{row.rank}</span> : <span className="pm2-miss">낙첨</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/*
          ⚠ 1등으로 나온 적이 없는 것이 "거의 항상" 이라는 사실을 함께 적는다 — 내 번호만
            운이 없는 것으로 오해하지 않게.
        */}
        <p className="pm2-exact">
          {data.exact_match_rounds.length === 0
            ? '이 조합이 여섯 개 모두 그대로 나온 회차는 없었습니다. 8,145,060가지 가운데 하나이니 자연스러운 일입니다.'
            : `이 조합은 ${data.exact_match_rounds.map((r) => `${r}회`).join(', ')}에 여섯 개 모두 그대로 나왔습니다.`}
        </p>
      </div>

      {/* ── ② 가장 짜릿했던 순간 ──────────────────────── */}
      {data.closest.length > 0 && (
        <div className="pm2-moments">
          <h3 className="tm-sub">가장 짜릿했던 순간</h3>
          <ol className="pm2-tickets">
            {data.closest.map((m, index) => {
              const amount = amountOf(m.rank)
              return (
                <li key={m.round_no} className="pm2-ticket" data-top={index === 0 ? '' : undefined}>
                  <div className="pm2-ticket-head">
                    <span className="pm2-ticket-date">{koreanDate(m.draw_date)}</span>
                    <Link href={`/lotto/round/${m.round_no}`} className="pm2-ticket-round">
                      제{m.round_no}회
                    </Link>
                  </div>

                  <div className="pm2-ticket-balls">
                    {m.numbers.map((n) => {
                      const hit = m.matched.includes(n)
                      return (
                        <span key={n} className="pm-ball" data-hit={hit ? '' : undefined}>
                          <LottoBall number={n} size="sm" />
                          {hit && <span className="sr-only">일치</span>}
                        </span>
                      )
                    })}
                  </div>

                  <p className="pm2-ticket-foot">
                    <strong>{m.match_count}개</strong> 맞음
                    {m.bonus_matched && ' · 보너스 일치'}
                    {m.rank !== null && (
                      <span className="pm2-ticket-prize">
                        {m.rank}등{amount !== null && ` · ${formatNumber(amount)}원`}
                      </span>
                    )}
                  </p>
                </li>
              )
            })}
          </ol>
          <p className="tm-wall-note">
            테두리가 있는 볼이 내 번호와 겹친 번호입니다. 회차를 누르면 그날의 결과를 볼 수 있습니다.
          </p>
        </div>
      )}
    </div>
  )
}

/** `2012-12-15` → `2012년 12월 15일`. 문자열에서 잘라 쓴다(시간대 영향 없음). */
function koreanDate(ymd: string): string {
  const [y, m, d] = ymd.split('-')
  if (!y || !m || !d) return ymd
  return `${y}년 ${Number(m)}월 ${Number(d)}일`
}
