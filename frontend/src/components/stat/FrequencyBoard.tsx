'use client'

import { useEffect, useState } from 'react'

import { FrequencyChart } from '@/components/FrequencyChart'
import { browserFrequency } from '@/lib/api'
import type { FrequencyResult, RoundIndexEntry } from '@/lib/api-types'

import { FrequencyBands, FrequencyHeatGrid } from './FrequencyHeatGrid'
import { HelpTip } from './HelpTip'
import { ScopeCaption } from './ScopeCaption'
import { StatQueryBar, type StatScope } from './StatQueryBar'

interface Props {
  /** 서버가 미리 구운 결과. 키는 `${window}:${includeBonus}`. */
  initial: Partial<Record<string, FrequencyResult>>
  roundIndex: RoundIndexEntry[] | null
  rangeSupported: boolean
}

export function FrequencyBoard({ initial, roundIndex, rangeSupported }: Props) {
  const [scope, setScope] = useState<StatScope>({ mode: 'window', window: 20 })
  const [includeBonus, setIncludeBonus] = useState(false)
  const [remote, setRemote] = useState<FrequencyResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 프리셋 구간이면 서버가 구운 결과를 그대로 쓴다(네트워크 없음 + JS 없이도 같은 내용).
  const cached =
    scope.mode === 'window' ? (initial[`${scope.window}:${includeBonus}`] ?? null) : null
  const data = cached ?? remote

  useEffect(() => {
    if (cached) {
      setRemote(null)
      setError(null)
      return
    }

    let alive = true
    setBusy(true)
    setError(null)

    const query =
      scope.mode === 'window'
        ? { window: scope.window, includeBonus }
        : { fromRound: scope.fromRound, toRound: scope.toRound, includeBonus }

    browserFrequency(query)
      .then((result) => {
        if (alive) setRemote(result)
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : '통계를 불러오지 못했습니다.')
      })
      .finally(() => {
        if (alive) setBusy(false)
      })

    return () => {
      alive = false
    }
  }, [cached, scope, includeBonus])

  return (
    <div className="statboard-v3">
      <StatQueryBar
        value={scope}
        onChange={setScope}
        roundIndex={roundIndex}
        rangeSupported={rangeSupported}
        busy={busy}
      >
        <div className="statbar-row">
          <span className="statbar-label">보너스 번호</span>
          <label className="statbar-check">
            <input
              type="checkbox"
              checked={includeBonus}
              disabled={busy}
              onChange={(event) => setIncludeBonus(event.target.checked)}
            />
            <span>보너스 번호도 함께 세기</span>
            <HelpTip title="보너스 번호">
            보너스 번호는 <strong>2등을 가릴 때만</strong> 쓰이는 일곱 번째 공입니다. 당첨번호
            여섯 개와 성격이 다르기 때문에 기본적으로는 세지 않습니다. 체크하면 그 공까지
            포함해 다시 셉니다.
            </HelpTip>
          </label>
        </div>
      </StatQueryBar>

      <ScopeCaption data={data} busy={busy} />

      {error && (
        <p className="stat-error" role="status">
          {error} 잠시 후 다시 시도해 주세요.
        </p>
      )}

      {data ? (
        <div className="freq-views">
          <section className="stat-block" aria-labelledby="freq-chart-title">
            <h3 id="freq-chart-title">
              번호별 막대
              <HelpTip title="번호별 막대">
                막대에 <strong>마우스를 올리거나 손가락으로 누르면</strong> 그 번호가 몇 번
                나왔는지 위쪽에 표시됩니다. 키보드로는 화살표 대신 Tab 으로 이동합니다.
              </HelpTip>
            </h3>
            {/* 이 차트는 hover·click·focus 를 모두 받아 모바일에서도 값을 읽을 수 있다. */}
            <FrequencyChart counts={data.counts} />
          </section>

          <section className="stat-block" aria-labelledby="freq-heat-title">
            <h3 id="freq-heat-title">
              번호판 히트맵
              <HelpTip title="번호판 히트맵">
                45칸을 실제 번호판처럼 늘어놓고 <strong>많이 나온 칸일수록 밝게</strong>
                칠했습니다. 가로 한 줄이 공 색깔 한 구간입니다(1~10 노랑, 11~20 파랑…).
                어느 대역이 몰렸는지 한눈에 보입니다.
              </HelpTip>
            </h3>
            <FrequencyHeatGrid counts={data.counts} roundsAnalyzed={data.rounds_analyzed} />
          </section>

          <section className="stat-block" aria-labelledby="freq-band-title">
            <h3 id="freq-band-title">
              번호대별 합계
              <HelpTip title="번호대별 합계">
                열 개씩 묶어 더한 값입니다. 41~45는 다섯 개뿐이라 합계만 보면 늘 불리하므로
                <strong> 번호 하나당 평균</strong>도 함께 적었습니다. 비교는 평균으로 하세요.
              </HelpTip>
            </h3>
            <FrequencyBands counts={data.counts} />
          </section>
        </div>
      ) : (
        !error && (
          <p className="empty-state">
            {busy ? '통계를 불러오는 중입니다…' : '표시할 통계가 없습니다.'}
          </p>
        )
      )}
    </div>
  )
}
