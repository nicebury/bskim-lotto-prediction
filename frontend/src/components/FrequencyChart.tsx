'use client'

import { useState } from 'react'

import { ballRange } from '@/lib/lotto'

/**
 * 번호 출현 빈도 막대차트 (1~45).
 *
 * ⚠ 여기서 **집계하지 않는다.** 서버가 준 counts 를 그리기만 한다. 유일한 산술은 막대의
 *   픽셀 높이 비율이다(→ docs/wiki/10-contracts/component-boundaries.md).
 *
 * 상호작용: 막대에 호버하거나 클릭(터치)하면 **어떤 번호가 몇 회 나왔는지** 툴팁으로 보여
 * 준다. 데스크톱은 호버, 모바일은 탭이 주 수단이라 둘 다 지원한다. 막대 색은 그 번호의
 * 동행복권 공식 5구간 색을 따라 어느 번호대인지 색으로도 읽힌다.
 *
 * `fit` 모드(StatBoard 용)는 45개 막대를 **컨테이너 폭에 꽉 맞춰** 가로 스크롤을 없앤다.
 * `scroll` 모드(통계 상세 용)는 넓게 펼쳐 자기 컨테이너에서만 가로 스크롤한다.
 */
export function FrequencyChart({
  counts,
  variant = 'scroll',
}: {
  /** 번호(문자열) → 출현 횟수. 서버가 준 그대로. */
  counts: Record<string, number>
  variant?: 'scroll' | 'fit'
}) {
  const [active, setActive] = useState<number | null>(null)

  const numbers = Array.from({ length: 45 }, (_, i) => i + 1)
  const values = numbers.map((n) => counts[String(n)] ?? 0)
  const peak = Math.max(1, ...values)

  const activeValue = active !== null ? (counts[String(active)] ?? 0) : null

  const chart = (
    <div className="freq-chart">
      {/* 선택된 막대 정보 — 차트 위에 고정 표시(호버가 안 되는 터치도 읽을 수 있게). */}
      <div className="freq-readout" aria-live="polite">
        {active !== null ? (
          <>
            <span className={`freq-readout-ball ball-range-${ballRange(active)}`}>{active}</span>
            <strong>{active}번</strong>
            <span className="muted">{activeValue}회 나왔어요</span>
          </>
        ) : (
          <span className="muted">막대에 마우스를 올리거나 눌러 보세요</span>
        )}
      </div>

      <div className="bar-chart" onPointerLeave={() => setActive(null)}>
        {numbers.map((n, index) => {
          const value = values[index]
          return (
            <button
              key={n}
              type="button"
              className={`bar bar-range-${ballRange(n)}${n === active ? ' is-active' : ''}`}
              aria-label={`${n}번 ${value}회`}
              aria-pressed={n === active}
              style={{ height: `${Math.max(4, (value / peak) * 100)}%` }}
              onPointerEnter={() => setActive(n)}
              onClick={() => setActive(n)}
              onFocus={() => setActive(n)}
            />
          )
        })}
      </div>

      <p className="chart-axis" aria-hidden="true">
        <span>1</span>
        <span>10</span>
        <span>20</span>
        <span>30</span>
        <span>40</span>
        <span>45</span>
      </p>
    </div>
  )

  return variant === 'scroll' ? <div className="bar-chart-scroll">{chart}</div> : chart
}
