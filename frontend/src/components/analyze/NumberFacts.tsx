import type { AnalyzeNumberFact } from '@/lib/api-types'
import { formatNumber } from '@/lib/format'

/**
 * 블록 1 — 내 번호 여섯 개의 기록.
 *
 * ⚠ **여기서 계산하지 않는다.** 전부 `/api/lotto/analyze` 가 준 값을 옮길 뿐이다.
 *   2026-09-03 까지는 `/stats/number/{n}` 을 여섯 번 부르고 일부를 프론트가 채웠는데,
 *   백엔드가 한 번에 주게 되면서 걷어냈다.
 *
 * ── ⚠ 모바일에서 표가 아니다 ───────────────────────────────────────
 * 열이 일곱이라 375px 에서 표로 두면 넘친다. 좁은 화면에서는 **번호마다 카드**로 쌓고,
 * 넓은 화면에서만 표로 편다. 마크업은 하나이고 CSS 가 배치만 바꾼다 — 좁은 화면용 DOM 을
 * 따로 만들면 같은 데이터가 두 벌 생기고 스크린리더는 그 둘을 다 읽는다.
 */
export function NumberFacts({ facts }: { facts: AnalyzeNumberFact[] }) {
  if (facts.length === 0) return null

  return (
    <table className="nf-table">
      <caption className="sr-only">내 번호 여섯 개의 역대 출현 기록</caption>
      <thead>
        <tr>
          <th scope="col">번호</th>
          <th scope="col">총 출현</th>
          <th scope="col">최근 20회</th>
          <th scope="col">최근 50회</th>
          <th scope="col">마지막 출현</th>
          <th scope="col">그 뒤로</th>
          <th scope="col">최장 공백</th>
          <th scope="col">보너스</th>
        </tr>
      </thead>
      <tbody>
        {facts.map((f) => (
          <tr key={f.number}>
            {/* ⚠ 각 행의 머리는 번호다. 스크린리더가 셀을 읽을 때 어느 번호인지 함께 말한다. */}
            <th scope="row">
              <span className="nf-num">{f.number}</span>
            </th>
            <td data-label="총 출현">{formatNumber(f.total_count)}회</td>
            <td data-label="최근 20회">{f.recent_20}회</td>
            <td data-label="최근 50회">{f.recent_50}회</td>
            {/*
              ⚠ 회차 번호에는 천 단위 구분을 넣지 않는다. "제1,238회" 가 되면 안 된다
                (2026-08-21 에 고친 적 있다).
            */}
            <td data-label="마지막 출현">
              {f.last_seen_round === null ? '기록 없음' : `${f.last_seen_round}회`}
            </td>
            <td data-label="그 뒤로">
              {f.rounds_since === null ? '-' : `${formatNumber(f.rounds_since)}회차`}
            </td>
            <td data-label="최장 공백">
              {f.max_gap === null ? '-' : `${formatNumber(f.max_gap)}회차`}
            </td>
            {/* 보너스는 당첨번호와 성격이 달라 따로 센 값이다([[lotto-rules]]). */}
            <td data-label="보너스">{formatNumber(f.bonus_count)}회</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
