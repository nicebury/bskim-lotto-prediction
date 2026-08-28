'use client'

import { useId, useState } from 'react'

import type { RoundIndexEntry, StatWindow } from '@/lib/api-types'
import { STAT_WINDOWS } from '@/lib/site'

/**
 * 통계 조회 조건. 프리셋 구간과 임의 기간 중 하나다.
 *
 * 두 가지를 한 객체로 묶는 이유: 화면이 "지금 무엇을 보고 있는가" 를 한 값으로 판단해야
 * 하기 때문이다. window 와 from/to 를 따로 두면 둘 다 채워진 모호한 상태가 생긴다.
 */
export type StatScope =
  | { mode: 'window'; window: StatWindow }
  | { mode: 'range'; fromRound: number; toRound: number }

interface Props {
  value: StatScope
  onChange: (next: StatScope) => void
  /** 회차-날짜 목록. 없으면(구버전 백엔드) 회차 번호만 직접 입력받는다. */
  roundIndex: RoundIndexEntry[] | null
  /**
   * 백엔드가 003 기간 조회를 지원하는가.
   * 지원하지 않는데 기간을 보내면 백엔드가 파라미터를 무시하고 기본 구간을 돌려주므로,
   * 사용자는 고른 것과 다른 데이터를 보게 된다. 그래서 아예 잠근다.
   */
  rangeSupported: boolean
  /** 조회 중이면 버튼을 잠근다. */
  busy?: boolean
  /**
   * 화면별 추가 컨트롤(표시 개수·보너스 포함 등).
   * 같은 카드 안에 넣어야 "조회 조건"이 한 덩어리로 읽힌다 — 따로 두면 어디까지가 조건
   * 설정인지 흐려진다.
   */
  children?: React.ReactNode
}

/** "1232회 (2026.07.11)" — 회차만으로는 언제인지 감이 오지 않는다. */
function optionLabel(entry: RoundIndexEntry): string {
  const [y, m, d] = entry.draw_date.split('-')
  return `${entry.round_no}회 (${y}.${m}.${d})`
}

export function StatQueryBar({
  value,
  onChange,
  roundIndex,
  rangeSupported,
  busy,
  children,
}: Props) {
  const [open, setOpen] = useState(value.mode === 'range')
  const baseId = useId()

  // 최신 회차가 위로 오게 뒤집는다. 사용자가 찾는 것은 대개 최근 회차다.
  const options = roundIndex ? [...roundIndex].reverse() : null
  const latest = roundIndex?.[roundIndex.length - 1]?.round_no ?? null
  const earliest = roundIndex?.[0]?.round_no ?? 1

  // 확정 전 초안. 조회 버튼을 눌러야 상위로 올라간다 — select 를 만질 때마다 조회하면
  // 시작 회차를 고르는 도중에 "시작 > 끝" 인 잘못된 구간으로 요청이 나간다.
  const [draftFrom, setDraftFrom] = useState<number>(
    value.mode === 'range' ? value.fromRound : Math.max(earliest, (latest ?? 100) - 49),
  )
  const [draftTo, setDraftTo] = useState<number>(
    value.mode === 'range' ? value.toRound : (latest ?? 100),
  )

  const invalid = draftFrom > draftTo

  return (
    <div className="statbar">
      <div className="statbar-row">
        <span className="statbar-label" id={`${baseId}-preset`}>
          조회 구간
        </span>
        <div className="statbar-presets" role="group" aria-labelledby={`${baseId}-preset`}>
          {STAT_WINDOWS.map((option) => {
            const active = value.mode === 'window' && value.window === option.value
            return (
              <button
                key={String(option.value)}
                type="button"
                className="scope-chip"
                data-active={active ? '' : undefined}
                aria-pressed={active}
                disabled={busy}
                onClick={() => {
                  setOpen(false)
                  onChange({ mode: 'window', window: option.value })
                }}
              >
                {option.label}
              </button>
            )
          })}

          <button
            type="button"
            className="scope-chip"
            data-active={value.mode === 'range' ? '' : undefined}
            aria-expanded={open}
            aria-controls={`${baseId}-range`}
            disabled={busy || !rangeSupported}
            onClick={() => setOpen((prev) => !prev)}
            title={rangeSupported ? undefined : '기간 조회는 아직 준비 중입니다'}
          >
            기간 직접 고르기
          </button>
        </div>
      </div>

      {/* 미지원 백엔드에서 버튼만 잠그고 이유를 말하지 않으면 고장으로 보인다. */}
      {!rangeSupported && (
        <p className="statbar-note">
          기간을 직접 고르는 기능은 준비 중입니다. 위의 구간 버튼으로 확인해 주세요.
        </p>
      )}

      <div className="statbar-range" id={`${baseId}-range`} data-open={open ? '' : undefined}>
        <div className="statbar-fields">
          <label className="statbar-field">
            <span>시작 회차</span>
            {options ? (
              <select
                className="input"
                value={draftFrom}
                disabled={busy}
                onChange={(event) => setDraftFrom(Number(event.target.value))}
              >
                {options.map((entry) => (
                  <option key={entry.round_no} value={entry.round_no}>
                    {optionLabel(entry)}
                  </option>
                ))}
              </select>
            ) : (
              // 회차 목록을 못 받았으면 날짜 없이 번호만 입력받는다. 기능은 살린다.
              <input
                className="input"
                type="number"
                min={1}
                max={latest ?? undefined}
                value={draftFrom}
                disabled={busy}
                onChange={(event) => setDraftFrom(Number(event.target.value))}
              />
            )}
          </label>

          <label className="statbar-field">
            <span>종료 회차</span>
            {options ? (
              <select
                className="input"
                value={draftTo}
                disabled={busy}
                onChange={(event) => setDraftTo(Number(event.target.value))}
              >
                {options.map((entry) => (
                  <option key={entry.round_no} value={entry.round_no}>
                    {optionLabel(entry)}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="input"
                type="number"
                min={1}
                max={latest ?? undefined}
                value={draftTo}
                disabled={busy}
                onChange={(event) => setDraftTo(Number(event.target.value))}
              />
            )}
          </label>

          <button
            type="button"
            className="btn btn-primary statbar-submit"
            disabled={busy || invalid}
            onClick={() => onChange({ mode: 'range', fromRound: draftFrom, toRound: draftTo })}
          >
            {busy ? '조회 중…' : '조회'}
          </button>
        </div>

        {/* 잘못된 구간을 조용히 뒤집지 않는다 — 사용자가 무엇을 잘못 골랐는지 알아야 한다. */}
        {invalid && (
          <p className="statbar-error" role="status">
            시작 회차가 종료 회차보다 뒤에 있습니다. 두 값을 바꿔 주세요.
          </p>
        )}
      </div>

      {children}
    </div>
  )
}
