import type { AnalyzeResult } from '@/lib/api-types'
import { formatNumber } from '@/lib/format'

/**
 * 45칸 격자 — 역대 출현 빈도를 색 농도로 깔고 내 번호를 표시한다.
 *
 * 내 번호가 "많이 나온 쪽" 에 몰려 있는지 한눈에 보인다.
 *
 * ⚠ **농도만으로 전달하지 않는다.** 각 칸의 `aria-label` 에 번호·횟수·내 번호 여부를 담고,
 *   내 번호에는 색이 아니라 **테두리**를 준다(WCAG 1.4.1). 색각 이상이 있어도 구분된다.
 * ⚠ 농도는 **최댓값 기준 상대값**이다. 절대 기준이 없으므로 "짙다 = 많이 나왔다" 는 이
 *   격자 안에서만 뜻이 있다. 범례를 함께 낸다.
 */
export function FrequencyGrid({
  grid,
  mine,
}: {
  /** `/api/lotto/analyze` 의 `frequency_grid`. 번호 오름차순 45개, **비율이 아니라 개수**. */
  grid: AnalyzeResult['frequency_grid']
  mine: number[]
}) {
  /*
    ⚠ 배열을 번호 → 횟수 표로 바꾼다. 계약이 45개를 다 준다고 정했지만, 빠져도 격자가
      어긋나지 않게 0 으로 받는다 — 빠진 칸이 생기면 45칸이라는 사실 자체가 전달되지 않는다.
  */
  const counts: Record<string, number> = {}
  for (const item of grid) counts[String(item.number)] = item.count
  const values = Object.values(counts)
  const max = values.length > 0 ? Math.max(...values) : 1
  const min = values.length > 0 ? Math.min(...values) : 0
  const picked = new Set(mine)

  /*
    농도 단계(0~4).

    ⚠ **0 이 아니라 최솟값을 바닥으로 잡는다.** 역대 전체를 세면 45개 번호가 150~172회에
      몰려 있어, `count / max` 로 계산하면 전부 3~4단계가 되어 **색이 정보를 전달하지 못한다**
      (2026-09-02 실측으로 확인). 실제 분포의 폭(min~max)에 다섯 단계를 펼쳐야 차이가 보인다.
    ⚠ 그래서 이 색은 **이 격자 안에서만 뜻이 있는 상대값**이다. 범례에 실제 범위를 함께
      적어 "짙다 = 절대적으로 많다" 로 읽히지 않게 한다.
    ⚠ 45개가 모두 같은 횟수면 `max === min` 이라 0 으로 나눈다. 그때는 가운데 단계로 둔다.
  */
  const levelOf = (count: number): number =>
    max === min ? 2 : Math.round(((count - min) / (max - min)) * 4)

  return (
    <div className="fg">
      <ol className="fg-grid">
        {Array.from({ length: 45 }, (_, i) => i + 1).map((n) => {
          const count = counts[String(n)] ?? 0
          const level = levelOf(count)
          const isMine = picked.has(n)
          return (
            <li
              key={n}
              className="fg-cell"
              data-level={level}
              data-mine={isMine ? '' : undefined}
              aria-label={`${n}번, ${formatNumber(count)}회 출현${isMine ? ', 내 번호' : ''}`}
            >
              <span aria-hidden="true">{n}</span>
            </li>
          )
        })}
      </ol>

      <p className="fg-legend">
        <span className="fg-legend-scale" aria-hidden="true">
          <i data-level={0} />
          <i data-level={1} />
          <i data-level={2} />
          <i data-level={3} />
          <i data-level={4} />
        </span>
        {formatNumber(min)}회(가장 적게)부터 {formatNumber(max)}회(가장 많이)까지, 색이
        짙을수록 자주 나온 번호입니다. <strong className="fg-mine-word">붉은 점선</strong> 칸이 내
        번호입니다.
      </p>
    </div>
  )
}
