import type { AnalyzeRetrospect } from '@/lib/api-types'
import { formatNumber } from '@/lib/format'

const RANK_LABEL: Record<number, string> = { 1: '1등', 2: '2등', 3: '3등', 4: '4등', 5: '5등' }

/**
 * 블록 0 — "1회차부터 매주 이 번호를 샀다면?"
 *
 * ── 이 블록을 두는 이유 ────────────────────────────────────────────
 * 손익은 사실상 언제나 큰 음수다. **그것이 이 블록의 요점**이다. "사면 이만큼 번다" 가
 * 아니라 **"1,239주를 사도 이렇게 된다"** 를 숫자로 보여 준다([[forbidden-expressions]]).
 *
 * ⚠ **1~3등 금액을 지어내지 않는다.** 회차마다 다르고 3등은 데이터 소스에 아예 없다.
 *   `unpriced` 가 비어 있지 않으면 **합계에서 뺐다는 사실을 반드시 밝힌다** — 안 밝히면
 *   1등을 맞혔는데도 손익이 마이너스로 나오는 이상한 화면이 된다.
 *
 * ⚠ **손익을 색으로만 전달하지 않는다.** 부호를 글자로 함께 쓴다(WCAG 1.4.1).
 */
export function Retrospect({ data }: { data: AnalyzeRetrospect }) {
  const loss = data.net < 0

  return (
    <div className="rt">
      <dl className="rt-rows">
        <div>
          <dt>산 횟수</dt>
          <dd>
            {formatNumber(data.rounds)}회 × {formatNumber(data.ticket_price)}원
          </dd>
        </div>
        <div>
          <dt>쓴 돈</dt>
          <dd>{formatNumber(data.spent)}원</dd>
        </div>
        <div>
          <dt>당첨</dt>
          <dd>
            {data.prizes.length === 0 && data.unpriced.length === 0
              ? '없음'
              : [
                  ...data.prizes.map(
                    (p) =>
                      `${RANK_LABEL[p.rank]} ${formatNumber(p.count)}회(${formatNumber(p.amount)}원)`,
                  ),
                  ...data.unpriced.map(
                    (u) => `${RANK_LABEL[u.rank]} ${formatNumber(u.count)}회`,
                  ),
                ].join(' · ')}
          </dd>
        </div>
        <div>
          <dt>받은 돈</dt>
          <dd>{formatNumber(data.returned)}원</dd>
        </div>
      </dl>

      {/*
        ⚠ 손익을 가장 크게 낸다. 이 블록에서 사용자가 기억해야 할 숫자는 이것 하나다.
        ⚠ `data-loss` 로 색을 주되 부호(−)를 글자로 함께 쓴다.
      */}
      <p className="rt-net" data-loss={loss ? '' : undefined}>
        <span className="rt-net-label">손익</span>
        <strong>
          {loss ? '−' : '+'}
          {formatNumber(Math.abs(data.net))}원
        </strong>
      </p>

      {data.unpriced.length > 0 && (
        <p className="rt-note">
          {data.unpriced.map((u) => RANK_LABEL[u.rank]).join('·')}의 당첨금은 회차마다 달라
          금액을 확정할 수 없어 합계에서 뺐습니다. 실제로는 이보다 나은 결과였을 것입니다.
        </p>
      )}
    </div>
  )
}
