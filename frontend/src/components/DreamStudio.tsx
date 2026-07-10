'use client'

import { useState } from 'react'

import { browserDreamRecommend } from '@/lib/api'
import type { DreamResult, DreamTier, DreamTierKey } from '@/lib/api-types'
import { traitSummaryLine } from '@/lib/traits'
import { Card, EmptyState } from './Card'
import { LottoBall } from './LottoBall'

/**
 * 꿈 텍스트 → 재미용 번호.
 *
 * ⚠ **첫 요청은 느리다.** 임베딩 모델이 lazy 싱글톤으로 로드되며 약 20초가 걸린다
 *   (→ docs/wiki/40-domain/dream-pipeline.md). 로딩 상태를 반드시 표시하고, 얼마나 걸릴 수
 *   있는지 미리 알린다. 알리지 않으면 사용자는 고장으로 여기고 떠난다.
 *
 * 결과에는 **어떤 단어가 매칭됐는지** 함께 보여준다. 근거가 보이지 않으면 사용자는 결과를
 * 납득할 수 없다.
 *
 * ⚠ 유사도 점수는 응답에 없고, 있어도 보여주지 않는다. 사용자는 그것을 확률로 읽는다.
 */
export function DreamStudio({ initialText = '' }: { initialText?: string }) {
  const [text, setText] = useState(initialText)
  const [result, setResult] = useState<DreamResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const trimmed = text.trim()
    if (!trimmed) return

    setLoading(true)
    setError(null)
    try {
      setResult(await browserDreamRecommend(trimmed))
    } catch (err) {
      setError(err instanceof Error ? err.message : '번호를 생성하지 못했습니다.')
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <Card>
        <form onSubmit={submit}>
          <label htmlFor="dream-text" style={{ fontWeight: 'var(--fw-semibold)' }}>
            어떤 꿈을 꾸셨나요?
          </label>
          <textarea
            id="dream-text"
            className="input"
            rows={3}
            style={{ marginTop: 'var(--space-2)', minHeight: 88, resize: 'vertical' }}
            placeholder="예) 큰 돼지가 집으로 들어오는 꿈을 꿨어요"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          <div className="hero-cta">
            <button type="submit" className="btn btn-primary" disabled={loading || !text.trim()}>
              {loading ? '꿈을 해석하는 중…' : '재미용 번호 생성'}
            </button>
          </div>
          {loading && (
            <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: 'var(--space-3)' }}>
              처음 실행할 때는 분석 모델을 불러오느라 20초가량 걸릴 수 있습니다. 잠시만 기다려
              주세요.
            </p>
          )}
        </form>
      </Card>

      <div aria-live="polite" aria-busy={loading} style={{ marginTop: 'var(--space-5)' }}>
        {error && (
          <Card>
            <EmptyState>{error}</EmptyState>
          </Card>
        )}

        {result && <DreamResultView result={result} />}
      </div>
    </div>
  )
}

/** tier 는 gubun 을 누적한다. 사용자에게는 "얼마나 넓게 찾았는가"로 설명한다. */
const TIER_LABEL: Record<DreamTierKey, { title: string; note: string }> = {
  tier1: { title: '정확히 일치한 단어', note: '꿈해몽 사전의 표제어와 그대로 맞은 단어만 씁니다.' },
  tier2: { title: '일치 + 포함된 단어', note: '표제어를 부분적으로 포함하는 단어까지 넓혔습니다.' },
  tier3: { title: '뜻이 비슷한 단어까지', note: '의미가 가까운 단어까지 모두 포함했습니다.' },
}

const TIER_KEYS: DreamTierKey[] = ['tier1', 'tier2', 'tier3']

function DreamResultView({ result }: { result: DreamResult }) {
  // 풀이 빈 tier 는 null 로 온다. 그 탭 자체를 렌더링하지 않는다.
  const available = TIER_KEYS.filter((key) => result.tiers[key] !== null)
  const [selected, setSelected] = useState<DreamTierKey>(available[0] ?? 'tier1')

  if (available.length === 0) {
    return (
      <Card>
        <EmptyState>
          꿈에서 사전과 연결되는 단어를 찾지 못했습니다. 조금 더 구체적으로 적어 보세요.
        </EmptyState>
      </Card>
    )
  }

  // 선택된 tier 가 사라질 수 있다(새 결과). 사용 가능한 첫 tier 로 되돌린다.
  const activeKey = available.includes(selected) ? selected : available[0]
  const tier = result.tiers[activeKey] as DreamTier

  return (
    <div>
      {result.matched_words.length > 0 && (
        <Card as="article" title="꿈에서 찾은 단어">
          <ul className="keyword-chips">
            {result.matched_words.map((matched) => (
              <li className="chip" key={matched.dream_word}>
                {matched.dream_word}
              </li>
            ))}
          </ul>
          <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: 'var(--space-3)' }}>
            입력하신 문장에서 꿈해몽 사전과 연결되는 단어를 찾아 번호를 만들었습니다.
          </p>
        </Card>
      )}

      {available.length > 1 && (
        <div className="tabs" role="tablist" aria-label="단어 검색 범위" style={{ marginTop: 'var(--space-4)' }}>
          {available.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              className="tab"
              aria-selected={key === activeKey}
              onClick={() => setSelected(key)}
            >
              {TIER_LABEL[key].title}
            </button>
          ))}
        </div>
      )}

      <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: 'var(--space-3)' }}>
        {TIER_LABEL[activeKey].note} 이 범위에서 모인 번호는{' '}
        {tier.pool.map((n) => n).join(', ')} 입니다.
      </p>

      <ol
        className="stat-grid"
        style={{
          marginTop: 'var(--space-4)',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        }}
      >
        {tier.sets.map((set, index) => (
          <li key={set.numbers.join('-')}>
            <Card as="article" title={`${index + 1}번째 조합`}>
              <div className="ball-row" style={{ justifyContent: 'space-between' }}>
                {set.numbers.map((n) => (
                  <LottoBall key={n} number={n} />
                ))}
              </div>
              <p className="reco-traits" style={{ marginTop: 'var(--space-3)' }}>
                {traitSummaryLine(set.traits)}
              </p>
            </Card>
          </li>
        ))}
      </ol>
    </div>
  )
}
