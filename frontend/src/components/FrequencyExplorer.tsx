'use client'

import { useId, useState } from 'react'

import type { FrequencyResult, StatWindow } from '@/lib/api-types'
import { formatNumber } from '@/lib/format'
import { STAT_WINDOWS, windowLabel } from '@/lib/site'
import { Card, EmptyState } from './Card'
import { FrequencyChart, RankList } from './stats'

/**
 * 번호별 출현 빈도 탐색기.
 *
 * 구간(20/50/100/전체) × 보너스 포함 여부의 조합을 **서버가 미리 다 받아 온다.** 쿼리스트링을
 * 쓰지 않으므로 canonical 이 하나로 고정되고 ISR 이 유지된다(→ StatWindowTabs 의 주석).
 *
 * `include_bonus` 를 명시적으로 선택하게 하는 이유: 보너스 번호는 2등 판정에만 쓰이므로
 * 당첨번호와 성격이 다르다. 예측 모듈이 내부적으로 쓰는 가중치를 사용자 통계에 섞지 않는다
 * (→ docs/wiki/10-contracts/api-contract.md).
 *
 * 45개 막대는 가로 스크롤 컨테이너 안에서만 넘친다. body 는 넘기지 않는다.
 */
export function FrequencyExplorer({
  data,
}: {
  /** 키는 `${window}:${includeBonus}`. */
  data: Partial<Record<string, FrequencyResult>>
}) {
  const [window, setWindow] = useState<StatWindow>(20)
  const [includeBonus, setIncludeBonus] = useState(false)
  const baseId = useId()

  const current = data[`${window}:${includeBonus}`]

  return (
    <div>
      <div className="tabs" role="tablist" aria-label="통계 관찰 구간 선택">
        {STAT_WINDOWS.map((option) => (
          <button
            key={String(option.value)}
            type="button"
            role="tab"
            id={`${baseId}-tab-${option.value}`}
            className="tab"
            aria-selected={option.value === window}
            aria-controls={`${baseId}-panel`}
            onClick={() => setWindow(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <p style={{ marginTop: 'var(--space-3)' }}>
        <label
          style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', minHeight: 44 }}
        >
          <input
            type="checkbox"
            checked={includeBonus}
            onChange={(event) => setIncludeBonus(event.target.checked)}
          />
          <span style={{ fontSize: 'var(--fs-sm)' }}>보너스 번호 포함해서 세기</span>
        </label>
      </p>

      <div id={`${baseId}-panel`} role="tabpanel" style={{ marginTop: 'var(--space-4)' }}>
        <FrequencyPanel data={current} window={window} />
      </div>
    </div>
  )
}

function FrequencyPanel({
  data,
  window,
}: {
  data: FrequencyResult | undefined
  window: StatWindow
}) {
  if (!data || Object.keys(data.counts).length === 0) {
    return (
      <Card>
        <EmptyState>
          {windowLabel(window)} 구간의 통계를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.
        </EmptyState>
      </Card>
    )
  }

  // 서버가 준 횟수를 정렬만 한다. 여기서 새 통계를 만들지 않는다.
  const sorted = Object.entries(data.counts)
    .map(([n, count]) => ({ number: Number(n), count }))
    .sort((a, b) => b.count - a.count)

  return (
    <div>
      <Card as="article" title={`번호별 출현 횟수 (${windowLabel(window)})`}>
        <FrequencyChart counts={data.counts} scroll />
        <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: 'var(--space-3)' }}>
          가로로 스크롤해 1번부터 45번까지 볼 수 있습니다. 가장 많이 나온 번호는{' '}
          {sorted[0].number}번({formatNumber(sorted[0].count)}회), 가장 적게 나온 번호는{' '}
          {sorted[sorted.length - 1].number}번({formatNumber(sorted[sorted.length - 1].count)}회)
          입니다.
        </p>
      </Card>

      <div
        className="stat-grid"
        style={{ marginTop: 'var(--space-4)', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}
      >
        <Card as="article" title="출현 횟수 상위 10">
          <RankList items={sorted.slice(0, 10)} />
        </Card>
        <Card as="article" title="출현 횟수 하위 10">
          {/* 상위 목록과 같은 척도로 그린다. 하위끼리 정규화하면 막대가 꽉 차 보인다. */}
          <RankList items={sorted.slice(-10).reverse()} max={sorted[0].count} tone="cold" />
        </Card>
      </div>
    </div>
  )
}
