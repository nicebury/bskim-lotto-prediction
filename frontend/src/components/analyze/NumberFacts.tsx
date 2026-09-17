import { LottoBall } from '@/components/LottoBall'
import type { AnalyzeNumberFact } from '@/lib/api-types'
import { formatNumber } from '@/lib/format'

/**
 * 블록 1 — 내 번호 여섯 개의 기록 (2026-09-17 카드로 재설계).
 *
 * ⚠ **여기서 계산하지 않는다.** 전부 `/api/lotto/analyze` 가 준 값을 옮길 뿐이다.
 *
 * ── 왜 표에서 카드로 ───────────────────────────────────────────────
 * 종전에는 여덟 열 표였다. 숫자가 격자로 늘어서 "3번은 어떤 번호인가" 가 한 줄에 흩어져 읽혔다.
 * 번호마다 카드 한 장으로 모으고 **가장 궁금한 두 가지**를 크게 둔다 — 역대 몇 번 나왔나,
 * 마지막으로 언제 나왔나. 나머지(최근 20·50회, 최장 공백, 보너스)는 작게 아래에 둔다.
 *
 * ⚠ `dl` 로 쓴다. 이름-값 쌍이라 낭독기가 "최근 20회, 2회" 로 짝지어 읽는다.
 * ⚠ 회차 번호에는 천 단위 구분을 넣지 않는다("제1,238회" 가 되면 안 된다).
 */
export function NumberFacts({ facts }: { facts: AnalyzeNumberFact[] }) {
  if (facts.length === 0) return null

  return (
    <ul className="nfc">
      {facts.map((f) => (
        <li key={f.number} className="nfc-card">
          <div className="nfc-head">
            <LottoBall number={f.number} />
            <p className="nfc-total">
              역대 <strong>{formatNumber(f.total_count)}</strong>회
            </p>
          </div>

          <p className="nfc-last">
            {f.last_seen_round === null ? (
              '한 번도 나오지 않았습니다'
            ) : f.rounds_since === 0 ? (
              <>
                <b>지난 회차({f.last_seen_round}회)</b>에 나왔어요
              </>
            ) : (
              <>
                <b>{formatNumber(f.rounds_since ?? 0)}회째</b> 쉬는 중 · 마지막 {f.last_seen_round}회
              </>
            )}
          </p>

          <dl className="nfc-list">
            <div>
              <dt>최근 20회</dt>
              <dd>{f.recent_20}회</dd>
            </div>
            <div>
              <dt>최근 50회</dt>
              <dd>{f.recent_50}회</dd>
            </div>
            <div>
              <dt>최장 공백</dt>
              <dd>{f.max_gap === null ? '-' : `${formatNumber(f.max_gap)}회`}</dd>
            </div>
            <div>
              {/* 보너스는 당첨번호와 성격이 달라 따로 센 값이다([[lotto-rules]]). */}
              <dt>보너스로</dt>
              <dd>{formatNumber(f.bonus_count)}회</dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  )
}
