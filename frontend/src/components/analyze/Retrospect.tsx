import type { AnalyzePastMatch, AnalyzeRetrospect } from '@/lib/api-types'
import { formatNumber } from '@/lib/format'
import { CupIcon, DrumstickIcon, FilmIcon } from '../icons'

/**
 * 블록 0 — "1회차부터 매주 이 번호를 샀다면?" (2026-09-17 재설계)
 *
 * ── 왜 다시 만들었나 ───────────────────────────────────────────────
 * 종전에는 `산 횟수 · 쓴 돈 · 당첨 · 받은 돈 · 손익` 다섯 줄 표였다. 사용자 지적: "단순히 횟수를
 * 보여 주는 게 아니라, **아 내가 처음부터 이 숫자로 샀다면 이렇게 됐겠구나** 가 쉽고 재미있게
 * 보여야 한다". 표는 사실을 담았지만 **이야기**가 없었다.
 *
 * 그래서 네 장면으로 나눴다.
 *   ① 언제부터 — "2002년 12월 7일부터 매주 토요일, 한 장씩" + 몇 주 · 몇 년
 *   ② 복권 벽 — 산 복권을 **한 칸에 한 장**으로 전부 깐다. 낙첨은 회색, 당첨은 색.
 *      1,241칸 중 색칸이 몇 개인지가 말보다 빨리 전달된다.
 *   ③ 돈의 흐름 — 낸 돈 막대와 돌려받은 돈 막대를 **같은 자로** 나란히 둔다
 *   ④ 이 돈이면 — 결과 금액을 치킨·커피로 바꿔 체감시킨다
 *
 * ── ⚠ 계산하지 않는다(표시만 한다) ─────────────────────────────────
 * 모든 수는 응답 값이다. 여기서 하는 산술은 **표시 형식**뿐이다 — 막대 폭(비율), "1,000원 당
 * 얼마" 환산, 주 → 년 환산, 금액 ÷ 물건값. 새 통계를 만들지 않는다(frontend/CLAUDE.md).
 *
 * ── ⚠ 지키는 것 ────────────────────────────────────────────────────
 * - **1~3등 금액을 지어내지 않는다.** `unpriced` 가 있으면 합계에서 뺐다고 밝힌다(계약).
 * - 이 블록의 요점은 **"1,241주를 사도 이렇게 된다"** 다. 벌 수 있다는 인상을 주는 말을 쓰지
 *   않는다([[forbidden-expressions]]). 손익은 부호를 글자로도 쓴다(색만으로 전하지 않는다).
 * - 복권 벽은 **결과별로 모은 그림**이지 시간 순서가 아니다. 응답에 회차별 결과 목록이 없어서다.
 *   그 사실을 그림 아래에 밝힌다 — 순서가 있는 것처럼 보이면 거짓 연표가 된다.
 */

/** 1회차 추첨일. 바뀌지 않는 역사적 사실이라 상수로 둔다(→ /guide/lotto-rule 과 같은 값). */
const FIRST_DRAW = { round: 1, label: '2002년 12월 7일' }

/**
 * '이 돈이면' 환산 기준. ⚠ 값은 대략의 소비자 가격이고 화면에 **기준 가격을 함께 적는다** —
 * 숨은 가정으로 두면 숫자가 사실처럼 읽힌다.
 */
const EQUIVALENTS = [
  { label: '치킨', unit: '마리', price: 20000, Icon: DrumstickIcon },
  { label: '아메리카노', unit: '잔', price: 4500, Icon: CupIcon },
  { label: '영화 관람', unit: '편', price: 15000, Icon: FilmIcon },
] as const

const RANK_LABEL: Record<number, string> = { 1: '1등', 2: '2등', 3: '3등', 4: '4등', 5: '5등' }

export function Retrospect({
  data,
  pastMatch,
  fromRound,
  toRound,
  latestDrawDate,
}: {
  data: AnalyzeRetrospect
  pastMatch: AnalyzePastMatch
  fromRound: number
  toRound: number
  latestDrawDate: string
}) {
  const loss = data.net < 0
  const winCount =
    data.prizes.reduce((sum, p) => sum + p.count, 0) +
    data.unpriced.reduce((sum, u) => sum + u.count, 0)
  const years = Math.floor(data.rounds / 52.18)
  // 1,000원을 냈을 때 돌아온 돈. "20%" 보다 "1,000원 내고 201원" 이 손에 잡힌다.
  const per1000 = data.spent > 0 ? Math.round((data.returned / data.spent) * 1000) : 0
  const returnedWidth = data.spent > 0 ? Math.min(100, (data.returned / data.spent) * 100) : 0

  return (
    <div className="tm">
      {/* ── ① 언제부터 ───────────────────────────────── */}
      <div className="tm-intro">
        <p className="tm-when">
          {fromRound === FIRST_DRAW.round ? (
            <>
              <strong>{FIRST_DRAW.label}</strong> 첫 추첨부터
            </>
          ) : (
            <>
              <strong>{fromRound}회</strong>부터
            </>
          )}{' '}
          매주 토요일, 이 번호로 <strong>한 장씩</strong> 샀다면
        </p>
        <ul className="tm-stats">
          <li>
            <span>산 기간</span>
            <strong>
              {formatNumber(data.rounds)}
              <small>주</small>
            </strong>
            <em>
              약 {years}년 · {latestDrawDate.slice(0, 4)}년 {Number(latestDrawDate.slice(5, 7))}월
              ({toRound}회)까지
            </em>
          </li>
          <li>
            <span>산 복권</span>
            <strong>
              {formatNumber(data.rounds)}
              <small>장</small>
            </strong>
            <em>한 장 {formatNumber(data.ticket_price)}원</em>
          </li>
          <li data-accent="">
            <span>당첨된 복권</span>
            <strong>
              {formatNumber(winCount)}
              <small>장</small>
            </strong>
            <em>
              {winCount === 0
                ? '한 장도 없었습니다'
                : `${formatNumber(data.rounds)}장 가운데`}
            </em>
          </li>
        </ul>
      </div>

      {/* ── ② 복권 벽 ───────────────────────────────── */}
      <TicketWall data={data} pastMatch={pastMatch} />

      {/* ── ③ 돈의 흐름 ─────────────────────────────── */}
      <div className="tm-money">
        <h3 className="tm-sub">돈은 이렇게 흘렀습니다</h3>

        <div className="tm-bars">
          <div className="tm-bar" data-kind="spent">
            <span className="tm-bar-label">낸 돈</span>
            <span className="tm-bar-track">
              <span style={{ width: '100%' }} />
            </span>
            <strong>{formatNumber(data.spent)}원</strong>
          </div>
          <div className="tm-bar" data-kind="returned">
            <span className="tm-bar-label">돌려받은 돈</span>
            <span className="tm-bar-track">
              {/* 0 이 아닌데 너무 가늘어 안 보이면 거짓 인상이 된다. 최소 폭을 준다. */}
              <span style={{ width: `${data.returned > 0 ? Math.max(1.5, returnedWidth) : 0}%` }} />
            </span>
            <strong>{formatNumber(data.returned)}원</strong>
          </div>
        </div>

        {data.prizes.length > 0 && (
          <ul className="tm-prizes">
            {data.prizes.map((p) => (
              <li key={p.rank}>
                <b>{RANK_LABEL[p.rank]}</b> {formatNumber(p.count)}번 × {formatNumber(p.amount_each)}원
                <span>= {formatNumber(p.amount)}원</span>
              </li>
            ))}
          </ul>
        )}

        <div className="tm-result" data-loss={loss ? '' : undefined}>
          <div>
            <span className="tm-result-label">결국</span>
            <strong>
              {loss ? '−' : '+'}
              {formatNumber(Math.abs(data.net))}원
            </strong>
          </div>
          <p>
            1,000원을 낼 때마다 <b>{formatNumber(per1000)}원</b>이 돌아온 셈입니다.
          </p>
        </div>

        {data.unpriced.length > 0 && (
          <p className="tm-note">
            {data.unpriced.map((u) => `${RANK_LABEL[u.rank]} ${formatNumber(u.count)}번`).join(' · ')}
            은 당첨금이 회차마다 달라 금액을 확정할 수 없어 합계에서 뺐습니다. 실제로는 이보다 나은
            결과였을 것입니다.
          </p>
        )}
      </div>

      {/* ── ④ 이 돈이면 ─────────────────────────────── */}
      {loss && (
        <div className="tm-equiv">
          <h3 className="tm-sub">
            {formatNumber(Math.abs(data.net))}원이면
          </h3>
          <ul>
            {EQUIVALENTS.map((item) => (
              <li key={item.label}>
                {/* ⚠ 이모지를 쓰지 않는다 — OS 마다 모양이 달라진다(icons.tsx 머리말). */}
                <span className="tm-equiv-icon" aria-hidden="true">
                  <item.Icon width={22} height={22} />
                </span>
                <strong>
                  {formatNumber(Math.floor(Math.abs(data.net) / item.price))}
                  <small>{item.unit}</small>
                </strong>
                <span>
                  {item.label} ({formatNumber(item.price)}원 기준)
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/**
 * 복권 벽 — 산 복권 한 장이 한 칸.
 *
 * ⚠ 칸 수 = `rounds`. 갈래별 칸 수는 `past_match.distribution`(0~2개 = 낙첨) 과 `rank_counts`
 *   에서 온다. 계약상 `distribution` 의 합은 `rounds_analyzed` 와 같다.
 * ⚠ 색만으로 전하지 않는다. 범례에 갈래 이름과 **장 수를 글자로** 쓰고, 벽 전체는 장식
 *   (`aria-hidden`) — 낭독기는 범례와 요약 문장을 듣는다.
 * ⚠ 당첨 칸을 벽 **앞쪽**에 모은다. 1,241칸 끝에 흩어 두면 스크롤 밖으로 나가 안 보인다.
 */
function TicketWall({ data, pastMatch }: { data: AnalyzeRetrospect; pastMatch: AnalyzePastMatch }) {
  const rank = (r: number) => pastMatch.rank_counts[String(r)] ?? 0
  const groups = [
    { key: 'top', label: '1~3등', count: rank(1) + rank(2) + rank(3) },
    { key: 'r4', label: '4등', count: rank(4) },
    { key: 'r5', label: '5등', count: rank(5) },
  ]
  const wins = groups.reduce((s, g) => s + g.count, 0)
  const blanks = Math.max(0, data.rounds - wins)

  const cells: string[] = []
  for (const group of groups) for (let i = 0; i < group.count; i += 1) cells.push(group.key)
  for (let i = 0; i < blanks; i += 1) cells.push('blank')

  return (
    <figure className="tm-wall">
      <figcaption className="tm-sub">
        복권 {formatNumber(data.rounds)}장을 한자리에 모으면
      </figcaption>
      <div className="tm-wall-grid" aria-hidden="true">
        {cells.map((kind, i) => (
          <i key={i} data-kind={kind} />
        ))}
      </div>
      <ul className="tm-legend">
        {groups
          .filter((g) => g.count > 0 || g.key !== 'top')
          .map((g) => (
            <li key={g.key} data-kind={g.key}>
              <i aria-hidden="true" />
              {g.label} <b>{formatNumber(g.count)}장</b>
            </li>
          ))}
        <li data-kind="blank">
          <i aria-hidden="true" />
          낙첨 <b>{formatNumber(blanks)}장</b>
        </li>
      </ul>
      <p className="tm-wall-note">한 칸이 복권 한 장입니다. 시간 순서가 아니라 결과별로 모아 놓았습니다.</p>
    </figure>
  )
}
