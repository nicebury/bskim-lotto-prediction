'use client'

import { LottoBall } from '@/components/LottoBall'

/**
 * 45칸 히트맵 — 막대차트 옆에 두는 두 번째 시각화.
 *
 * 막대차트는 "몇 번인가"를 정확히 읽게 하지만 45개를 한눈에 비교하기는 어렵다. 격자는 반대로
 * 개별 값은 흐릿해도 **어느 대역이 몰렸는지**가 즉시 보인다. 두 그림이 같은 데이터를 다른
 * 방식으로 답한다.
 *
 * 배치는 10열 × 5행이고 **행이 곧 볼 공식 5구간**이다 — 색-구간 매핑이 레이아웃으로 드러나
 * 범례가 없어도 읽힌다. 행 왼쪽 라벨이 색 단독 전달을 막는다(WCAG 1.4.1).
 *
 * 칸에는 숫자만 두지 않고 **실제 볼**을 그린다. 그래야 진짜 번호판처럼 읽히고, 볼 색이
 * 구간을 한 번 더 말해 준다. 빈도는 **볼 뒤 칸 배경의 진하기**로 표현한다 — 볼 자체의
 * 색을 건드리면 동행복권 공식 5구간 색이 왜곡되므로 절대 그렇게 하지 않는다
 * (→ docs/wiki/00-decisions/0009-official-ball-colors-over-mockup.md). 칸은 사각형이고
 * 볼은 원이라 **네 모서리가 항상 배경으로 남아** 얇은 링에서도 진하기가 읽힌다.
 *
 * ⚠ 칸을 클릭 가능하게 만들지 않는다. 375px 에서 칸은 약 28px 라 터치 타겟 44px 규칙을
 *   지킬 수 없다(→ docs/wiki/20-design/responsive-rules.md). 상호작용은 옆의 막대차트가
 *   담당하고, 이 격자는 전체 모양만 보여준다.
 */
export function FrequencyHeatGrid({
  counts,
  roundsAnalyzed,
}: {
  counts: Record<string, number>
  roundsAnalyzed: number
}) {
  // 밝기의 기준. 최댓값이 0이면(데이터 없음) 모든 칸이 빈 상태로 그려진다.
  let max = 0
  for (const value of Object.values(counts)) {
    if (typeof value === 'number' && value > max) max = value
  }

  /*
    라벨의 자릿수를 맞춘다('1–10' 이 아니라 '01–10'). 폭이 다르면 왼쪽 정렬된 라벨이
    행마다 어긋나 보여 격자가 한 칸 밀린 것처럼 읽힌다(사용자 지적).
  */
  const rows = [
    { label: '01–10', from: 1, to: 10 },
    { label: '11–20', from: 11, to: 20 },
    { label: '21–30', from: 21, to: 30 },
    { label: '31–40', from: 31, to: 40 },
    { label: '41–45', from: 41, to: 45 },
  ]

  return (
    <figure className="heat-figure">
      <div
        className="heat-grid"
        role="img"
        aria-label={`1번부터 45번까지의 출현 횟수를 밝기로 표시한 번호판입니다. ${roundsAnalyzed}회차를 집계했고 가장 많이 나온 번호는 ${max}회입니다.`}
      >
        {rows.map((row) => (
          <div className="heat-row" key={row.label}>
            <span className="heat-label">{row.label}</span>
            {Array.from({ length: row.to - row.from + 1 }, (_, i) => {
              const n = row.from + i
              const count = counts[String(n)] ?? 0
              // 0회여도 칸은 보인다 — "안 나왔다" 도 정보다.
              const level = max > 0 ? count / max : 0
              return (
                <span
                  key={n}
                  className="heat-cell"
                  style={{ '--heat': level.toFixed(3) } as React.CSSProperties}
                  // role="img" 안쪽은 접근성 트리에서 무시되지만, 마우스 사용자를 위한 툴팁.
                  title={`${n}번 · ${count}회`}
                >
                  <LottoBall number={n} size="sm" />
                </span>
              )
            })}
          </div>
        ))}
      </div>
      <figcaption className="heat-caption">
        볼 뒤 칸이 <strong>진할수록 많이 나온 번호</strong>입니다. 가장 진한 칸이 {max}회이고,
        색이 없는 칸은 이 구간에 한 번도 나오지 않았습니다.
      </figcaption>
    </figure>
  )
}

/**
 * 번호대별 합계 막대.
 *
 * ⚠ 여기서 하는 산술은 **표시용 합산**이다. 서버가 준 번호별 횟수를 다섯 구간으로 더할 뿐
 *   새 통계를 만들지 않는다(같은 근거로 `lib/stat-insight.ts` 도 구간 합을 낸다).
 *   41~45 는 다섯 개뿐이라 합이 불리하므로 **번호당 평균**으로 비교한다 — 그러지 않으면
 *   구간 크기가 작다는 이유만으로 항상 꼴찌가 된다.
 */
export function FrequencyBands({ counts }: { counts: Record<string, number> }) {
  const bands = [
    { label: '1~10', from: 1, to: 10 },
    { label: '11~20', from: 11, to: 20 },
    { label: '21~30', from: 21, to: 30 },
    { label: '31~40', from: 31, to: 40 },
    { label: '41~45', from: 41, to: 45 },
  ].map((band) => {
    let sum = 0
    for (let n = band.from; n <= band.to; n += 1) sum += counts[String(n)] ?? 0
    const size = band.to - band.from + 1
    return { ...band, sum, avg: sum / size, size }
  })

  const peak = Math.max(1, ...bands.map((band) => band.avg))

  return (
    <div className="band-list">
      {bands.map((band, index) => (
        <div className="band-row" key={band.label}>
          <span className="band-label">{band.label}</span>
          <span className="band-bar" aria-hidden="true">
            <span
              className={`band-bar-fill band-range-${index + 1}`}
              style={{ width: `${Math.max(4, (band.avg / peak) * 100)}%` }}
            />
          </span>
          {/* 막대는 장식이고 숫자가 정보다 — 색·길이 단독 전달 금지. */}
          <span className="band-value">
            {band.sum}회 <span className="muted">(번호당 {band.avg.toFixed(1)})</span>
          </span>
        </div>
      ))}
    </div>
  )
}
