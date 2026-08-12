'use client'

/**
 * 번호 뽑기 — 3D 원근 스택.
 *
 * 트렌드 글의 "시네마틱 3D 캐러셀"을 이 제품의 행동에 맞춘 형태다. 카드가 겹쳐 쌓인
 * 모습은 "뽑는다"는 동작과 맞고, 다섯 가지 방식이 **하나의 더미**라는 사실을 레이아웃이
 * 그대로 말한다.
 *
 * ── 발견성 ────────────────────────────────────────────────
 * 겹친 카드는 옆에 무엇이 더 있는지 알기 어렵다. 그래서 좌우 버튼(44px)·점 인디케이터·
 * "2 / 5" 카운터를 함께 둔다. 모바일에서 가로 스크롤 캐러셀을 피하라는 규약(002 R12)의
 * 취지가 "숨은 카드는 발견되지 않는다" 이므로, 형태는 달라도 그 요구는 그대로 지킨다.
 *
 * ── 재생성 ────────────────────────────────────────────────
 * 부모에게서 콜백을 받지 않고 `browserRecommend` 를 직접 호출한다. 서버 컴포넌트는
 * 클라이언트 컴포넌트에 함수를 넘길 수 없기 때문이다(기존 RecommendCarousel 과 같은 방식).
 *
 * ⚠ 문구에 예측·보장으로 읽히는 표현을 쓰지 않는다. 이 컴포넌트는 "조합을 만든다"고만
 *   말한다(→ docs/wiki/40-domain/forbidden-expressions.md).
 */

import { useState } from 'react'

import { browserRecommend } from '@/lib/api'
import type { RecommendSet, RecommendStrategy } from '@/lib/api-types'
import { strategyMeta } from '@/lib/strategies'

import { HbBall } from './HbBalls'

export interface HbStackItem {
  strategy: RecommendStrategy
  initial: RecommendSet | null
}

export function HbNumberStack({ items }: { items: HbStackItem[] }) {
  const [active, setActive] = useState(0)
  const [sets, setSets] = useState<(RecommendSet | null)[]>(() => items.map((i) => i.initial))
  /** 재생성 중인 카드 인덱스. null 이면 유휴. */
  const [busy, setBusy] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const move = (delta: number) => {
    setActive((prev) => {
      const next = prev + delta
      // 순환시키지 않는다. 끝에서 한 바퀴 돌면 어디까지 봤는지 감각이 사라진다.
      return Math.min(items.length - 1, Math.max(0, next))
    })
  }

  const regenerate = async (index: number) => {
    setBusy(index)
    setError(null)
    try {
      const result = await browserRecommend(items[index].strategy, 1)
      const first = result.sets[0] ?? null
      setSets((prev) => prev.map((value, i) => (i === index ? first : value)))
    } catch (err) {
      // 백엔드가 없거나 422(회차 부족)일 수 있다. 원문 메시지를 그대로 보여준다.
      setError(err instanceof Error ? err.message : '번호를 다시 만들지 못했습니다.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="hb-stack">
      <div className="hb-stack-viewport">
        {items.map((item, index) => {
          const meta = strategyMeta(item.strategy)
          const set = sets[index]
          const offset = index - active
          const depth = Math.abs(offset)
          const isActive = offset === 0

          return (
            <article
              key={item.strategy}
              className="hb-stack-card"
              data-active={isActive ? '' : undefined}
              /*
                깊이를 속성으로도 내보낸다. CSS 가 `[style*=...]` 로 인라인 스타일 문자열을
                긁는 방식은 React 의 직렬화 형식(공백 유무)에 의존해 쉽게 깨진다.
              */
              data-depth={depth}
              // 깊이 값은 CSS 가 transform·불투명도·z-index 로 환산한다.
              style={
                {
                  '--hb-off': offset,
                  '--hb-depth': depth,
                  zIndex: 10 - depth,
                } as React.CSSProperties
              }
              // 겹쳐 있는 카드를 스크린리더가 전부 읽으면 무슨 카드인지 알 수 없다.
              aria-hidden={isActive ? undefined : 'true'}
            >
              <p className="hb-stack-label">{meta.label}</p>

              {set ? (
                <div className="hb-stack-balls">
                  {set.numbers.map((n) => (
                    <HbBall key={n} n={n} size="lg" />
                  ))}
                </div>
              ) : (
                <p className="hb-stack-empty">
                  이 방식은 회차가 50개 이상 쌓인 뒤에 조합을 만들 수 있습니다.
                </p>
              )}

              <p className="hb-stack-desc">{meta.short}</p>

              <button
                type="button"
                className="hb-btn hb-btn-ghost hb-stack-again"
                onClick={() => regenerate(index)}
                disabled={busy !== null}
                // 비활성 카드의 버튼에 탭이 들어가면 보이지 않는 곳으로 포커스가 사라진다.
                tabIndex={isActive ? undefined : -1}
              >
                {busy === index ? '만드는 중…' : '다시 뽑기'}
              </button>
            </article>
          )
        })}
      </div>

      <div className="hb-stack-nav">
        <button
          type="button"
          className="hb-iconbtn"
          onClick={() => move(-1)}
          disabled={active === 0}
          aria-label="이전 방식 보기"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path
              d="M15 5l-7 7 7 7"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <div className="hb-stack-dots">
          {items.map((item, index) => (
            <button
              key={item.strategy}
              type="button"
              className="hb-dot"
              data-on={index === active ? '' : undefined}
              onClick={() => setActive(index)}
              aria-label={`${strategyMeta(item.strategy).label} 보기`}
              aria-current={index === active ? 'true' : undefined}
            />
          ))}
        </div>

        <button
          type="button"
          className="hb-iconbtn"
          onClick={() => move(1)}
          disabled={active === items.length - 1}
          aria-label="다음 방식 보기"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path
              d="M9 5l7 7-7 7"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {/*
        현재 위치를 숫자로도 알린다. 점만으로는 개수를 세기 어렵고, 스크린리더 사용자에게는
        카드 전환이 조용히 일어난다.
      */}
      <p className="hb-stack-counter" aria-live="polite">
        {strategyMeta(items[active].strategy).label} · {active + 1} / {items.length}
      </p>

      {/* 재생성 실패는 조용히 넘기지 않는다 — 사용자가 버튼을 눌러 기다리고 있기 때문이다. */}
      {error && (
        <p className="hb-stack-error" role="status">
          {error}
        </p>
      )}
    </div>
  )
}
