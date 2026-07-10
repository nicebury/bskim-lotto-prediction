'use client'

import { useId, useState, type ReactNode } from 'react'

import type { StatWindow } from '@/lib/api-types'
import { STAT_WINDOWS } from '@/lib/site'

/**
 * 통계 관찰 구간(20/50/100/전체) 전환 탭.
 *
 * ⚠ window 를 **쿼리스트링으로 받지 않는다.** 서버 컴포넌트가 searchParams 를 읽으면 그
 *   라우트가 dynamic 이 되어 ISR 이 깨지고, `?window=50` 같은 중복 URL 이 색인 대상이
 *   된다. 대신 서버가 네 구간을 모두 렌더링해 넘기고, 전환은 클라이언트 상태로만 한다.
 *   canonical 은 항상 쿼리 없는 기본 URL 하나다(→ docs/wiki/30-seo/metadata-strategy.md).
 *
 * ⚠ `panels` 는 **이미 렌더링된 ReactNode** 여야 한다. 서버 컴포넌트는 클라이언트
 *   컴포넌트에 함수(render prop)를 넘길 수 없다 — 직렬화되지 않는다. 대신 엘리먼트를
 *   넘기면 그 내용은 서버에서 렌더링된 채로 전달된다. 즉 패널 안의 통계 표시 컴포넌트는
 *   여전히 서버 컴포넌트다.
 *
 * JS 가 꺼져 있어도 기본 구간(최근 20회)의 본문은 서버 렌더링된 채로 보인다.
 */
export function StatWindowTabs({
  panels,
  label,
}: {
  /** window 값(문자열) → 그 구간의 렌더링된 패널. */
  panels: Partial<Record<string, ReactNode>>
  /** 탭 목록의 접근 가능한 이름. */
  label: string
}) {
  const [selected, setSelected] = useState<StatWindow>(20)
  const baseId = useId()

  return (
    <div>
      <div className="tabs" role="tablist" aria-label={label}>
        {STAT_WINDOWS.map((option) => {
          const isSelected = option.value === selected
          return (
            <button
              key={String(option.value)}
              type="button"
              role="tab"
              id={`${baseId}-tab-${option.value}`}
              className="tab"
              aria-selected={isSelected}
              aria-controls={`${baseId}-panel-${option.value}`}
              onClick={() => setSelected(option.value)}
            >
              {option.label}
            </button>
          )
        })}
      </div>

      <div
        role="tabpanel"
        id={`${baseId}-panel-${selected}`}
        aria-labelledby={`${baseId}-tab-${selected}`}
        style={{ marginTop: 'var(--space-5)' }}
      >
        {panels[String(selected)]}
      </div>
    </div>
  )
}
