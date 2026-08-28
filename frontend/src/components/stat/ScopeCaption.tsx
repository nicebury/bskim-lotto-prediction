'use client'

import type { RangeMeta, StatWindow } from '@/lib/api-types'
import { windowLabel } from '@/lib/site'

/** 회차 메타를 담은 모든 통계 응답이 이 모양을 만족한다. */
type ScopeData = RangeMeta & {
  window: StatWindow | null
  rounds_analyzed: number
}

/** "2026-02-28" → "2026.02.28" */
function dot(date: string | null | undefined): string | null {
  if (!date) return null
  return date.slice(0, 10).replace(/-/g, '.')
}

/**
 * 지금 무엇을 보고 있는지 한 줄로.
 *
 * 조회 조건을 바꿔 놓고 화면이 그대로면 사용자는 반영이 됐는지 알 수 없다. 그래서 **응답이
 * 말하는 실제 구간**을 그린다 — 요청한 값이 아니라 서버가 집계에 쓴 값이다. 예를 들어
 * 종료 회차로 9999 를 넣어도 여기에는 최신 회차가 표시된다.
 */
export function ScopeCaption({ data, busy }: { data: ScopeData | null; busy?: boolean }) {
  if (!data) {
    return (
      <p className="scope-caption" aria-live="polite">
        {busy ? '조회하는 중입니다…' : ''}
      </p>
    )
  }

  const from = dot(data.from_date)
  const to = dot(data.to_date)
  const hasRange = typeof data.from_round === 'number' && typeof data.to_round === 'number'

  return (
    // 조건을 바꾸면 이 문장이 갱신된다. 스크린리더 사용자에게도 변화를 알린다.
    <p className="scope-caption" aria-live="polite">
      {hasRange ? (
        <>
          <strong>
            {data.from_round}~{data.to_round}회
          </strong>
          {from && to && (
            <span className="scope-caption-date">
              {' '}
              · {from} ~ {to}
            </span>
          )}
        </>
      ) : (
        <strong>{data.window === null ? '선택한 구간' : windowLabel(data.window)}</strong>
      )}
      <span className="scope-caption-count"> · {data.rounds_analyzed}회차 집계</span>
      {busy && <span className="scope-caption-busy"> · 갱신 중…</span>}
    </p>
  )
}
