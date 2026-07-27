'use client'

import { useState } from 'react'

import { browserRecommend } from '@/lib/api'
import type { RecommendSet, RecommendStrategy } from '@/lib/api-types'
import { STRATEGIES, strategyMeta } from '@/lib/strategies'
import { traitRows, traitSentence, traitSummaryLine } from '@/lib/traits'
import { Card, EmptyState } from './Card'
import { LottoBall } from './LottoBall'
import { NumberActions } from './NumberActions'
import { KeyValueList } from './stats'

/**
 * 번호 추천 시뮬레이터.
 *
 * 초기 결과는 **서버가 렌더링해 넘긴다** — JS 를 끈 상태에서도 조합과 성향 설명이 보인다.
 * 전략을 바꾸거나 다시 생성할 때만 브라우저가 백엔드를 부른다.
 *
 * 생성 후 조합의 성향을 함께 보여준다. 단순 번호 출력이 아니라 "번호를 해석해주는 경험"이
 * 체류시간을 만든다(초안 10.1). 해석은 전부 **사실 서술**이다 — 확률·적중률을 말하지 않는다.
 */
export function RecommendStudio({
  initialStrategy,
  initialSets,
  initialHotWindow,
  disclaimer,
}: {
  initialStrategy: RecommendStrategy
  initialSets: RecommendSet[]
  /** hot_count·cold_count 의 기준 회차 수. 데이터가 없으면 null. */
  initialHotWindow: number | null
  /** 백엔드가 응답에 담아 준 면책 문구. 없으면 호출부가 폴백을 넘긴다. */
  disclaimer: string
}) {
  const [strategy, setStrategy] = useState<RecommendStrategy>(initialStrategy)
  const [sets, setSets] = useState<RecommendSet[]>(initialSets)
  const [hotWindow, setHotWindow] = useState<number | null>(initialHotWindow)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generate = async (next: RecommendStrategy) => {
    setStrategy(next)
    setLoading(true)
    setError(null)
    try {
      const result = await browserRecommend(next, 5)
      setSets(result.sets)
      setHotWindow(result.hot_window)
    } catch (err) {
      // 회차가 50개 미만이면 백엔드가 422 와 함께 사유를 준다. 그대로 보여준다.
      setError(err instanceof Error ? err.message : '번호를 생성하지 못했습니다.')
      setSets([])
    } finally {
      setLoading(false)
    }
  }

  const meta = strategyMeta(strategy)

  return (
    <div>
      <div className="tabs" role="tablist" aria-label="추천 기준 선택">
        {STRATEGIES.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            className="tab"
            aria-selected={item.key === strategy}
            disabled={loading}
            onClick={() => generate(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <p className="muted" style={{ fontSize: 'var(--fs-sm)', marginTop: 'var(--space-3)' }}>
        {meta.description}
      </p>

      <div className="hero-cta">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => generate(strategy)}
          disabled={loading}
        >
          {loading ? '생성 중…' : '번호 다시 생성'}
        </button>
      </div>

      {/* 비동기 상태를 스크린리더에 알린다. */}
      <div aria-live="polite" aria-busy={loading} style={{ marginTop: 'var(--space-6)' }}>
        {error ? (
          <Card>
            <EmptyState>{error}</EmptyState>
          </Card>
        ) : sets.length === 0 ? (
          <Card>
            <EmptyState>
              추천번호를 생성하려면 데이터가 더 필요합니다. 통계 기반 방식은 회차가 50개 이상 쌓인
              뒤에 동작합니다.
            </EmptyState>
          </Card>
        ) : (
          <ol className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
            {sets.map((set, index) => (
              <li key={set.numbers.join('-')}>
                <Card as="article" title={`${index + 1}번째 조합`}>
                  <div className="ball-row" style={{ justifyContent: 'space-between' }}>
                    {set.numbers.map((n) => (
                      <LottoBall key={n} number={n} />
                    ))}
                  </div>

                  <p className="reco-traits" style={{ marginTop: 'var(--space-4)' }}>
                    {traitSentence(set.traits, '이 조합', hotWindow)}
                  </p>

                  <div style={{ marginTop: 'var(--space-4)' }}>
                    <KeyValueList rows={traitRows(set.traits)} />
                  </div>

                  {/* 번호를 가져가려고 들어온 자리다. 세 가지를 모두 낸다. */}
                  <NumberActions
                    numbers={set.numbers}
                    strategyLabel={meta.label}
                    subtitle={traitSummaryLine(set.traits)}
                  />
                </Card>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* 면책 고지는 결과 바로 아래에 둔다. 사용자가 결과를 보고 나서 읽는 자리다. */}
      <p className="disclaimer is-center" style={{ marginTop: 'var(--space-6)' }}>
        <span className="disclaimer-icon" aria-hidden="true">
          ⓘ
        </span>
        <span>{disclaimer}</span>
      </p>
    </div>
  )
}
