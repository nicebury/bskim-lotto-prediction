'use client'

import { useEffect, useRef, useState } from 'react'

import { browserRecommend } from '@/lib/api'
import type { RecommendSet, RecommendStrategy } from '@/lib/api-types'
import { strategyMeta } from '@/lib/strategies'
import { traitSummaryLine } from '@/lib/traits'
import { CardSlider } from './CardSlider'
import { CLOSE_DELAY_MS, GENERATE_STEPS, GenerateProgress, STEP_AT_MS } from './GenerateProgress'
import { LottoBall } from './LottoBall'
import { NumberActions } from './NumberActions'

export interface CarouselItem {
  strategy: RecommendStrategy
  /** 서버가 렌더링한 초기 조합. 백엔드가 없거나 회차가 부족하면 null. */
  initial: RecommendSet | null
}

/**
 * "오늘의 추천 번호" 캐러셀.
 *
 * 초기 조합은 **서버가 렌더링**한다 — JS 를 끈 상태에서도 번호와 성향이 보여야 한다.
 * "다시 생성"만 브라우저에서 백엔드를 부른다.
 *
 * 모바일은 세로 스택(가로 스크롤 없음), 데스크톱은 가로 캐러셀 + 좌우 화살표(키보드 이동 가능).
 *
 * ⚠ 화살표는 **그 방향에 실제로 더 있을 때만** 낸다. 끝에 닿았는데도 화살표가 남아 있으면
 *   눌러도 아무 일이 없어 "고장" 으로 읽힌다. 판정 규칙은 `ScrollArea` 와 같다
 *   (→ docs/wiki/20-design/components.md).
 * 자동 재생은 넣지 않는다 — 넣는다면 prefers-reduced-motion 에서 타이머 자체를 걸지
 * 않아야 한다(→ docs/wiki/20-design/responsive-rules.md).
 *
 * 문구 주의: 이 컴포넌트 어디에도 "당첨 확률·고확률·예상 적중률"을 쓰지 않는다.
 */
export function RecommendCarousel({ items }: { items: CarouselItem[] }) {
  /*
    ⚠ 자체 캐러셀 로직을 걷어내고 **공용 `CardSlider`** 로 바꿨다(2026-08-31).
      화살표·끝 판정·스크롤 처리를 두 벌 두면 한쪽만 고쳐지고, 실제로 그런 일이 있었다
      (끝에 닿아도 화살표가 남던 문제). 위치 점과 모바일 슬라이드도 함께 얻는다.
    ⚠ 모바일에서 **세로 스택이 아니라 슬라이드**다 — 002 R12 를 뒤집은 자리다
      (→ components/CardSlider.tsx 주석).
  */
  return (
    <CardSlider label="오늘의 추천 번호">
      {items.map((item) => (
        <li key={item.strategy}>
          <RecommendCard item={item} />
        </li>
      ))}
    </CardSlider>
  )
}

const FINAL_STEP = GENERATE_STEPS.length - 1

function RecommendCard({ item }: { item: CarouselItem }) {
  const meta = strategyMeta(item.strategy)
  const [set, setSet] = useState<RecommendSet | null>(item.initial)
  const [step, setStep] = useState<number | null>(null) // null = 대화상자 닫힘
  const [error, setError] = useState<string | null>(null)

  // 컴포넌트가 사라진 뒤 타이머가 setState 를 부르지 않게 전부 모아 둔다.
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const clearTimers = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }
  useEffect(() => clearTimers, [])

  const regenerate = async () => {
    if (step !== null) return // 이미 생성 중

    clearTimers()
    setError(null)
    setStep(0)

    // 단계 문구는 시간표대로 넘어간다. 마지막 단계만은 결과가 온 뒤에 표시한다.
    STEP_AT_MS.slice(1, FINAL_STEP).forEach((at, index) => {
      timers.current.push(setTimeout(() => setStep(index + 1), at))
    })

    const startedAt = Date.now()
    try {
      // seed 를 넘기지 않는다 — 누를 때마다 결과가 달라져야 한다.
      const result = await browserRecommend(item.strategy, 1)

      // 백엔드가 빨라도 단계를 건너뛰지 않는다. 늦으면 그만큼 기다린 것이 된다.
      const remaining = STEP_AT_MS[FINAL_STEP] - (Date.now() - startedAt)
      if (remaining > 0) await sleep(remaining)

      if (result.sets.length > 0) setSet(result.sets[0])
      setStep(FINAL_STEP)

      // 완료 문구를 잠깐 보여준 뒤 닫는다.
      timers.current.push(setTimeout(() => setStep(null), CLOSE_DELAY_MS))
    } catch (err) {
      clearTimers()
      // 백엔드 오류 메시지({detail})를 그대로 보여준다. 이미 한국어다.
      setError(err instanceof Error ? err.message : '번호를 생성하지 못했습니다.')
    }
  }

  const closeDialog = () => {
    clearTimers()
    setStep(null)
    setError(null)
  }

  const busy = step !== null || error !== null

  return (
    <article className="card reco-card">
      <h3 className="reco-label">{meta.label}</h3>

      <div className="reco-numbers">
        {set ? (
          set.numbers.map((n) => <LottoBall key={n} number={n} size="sm" />)
        ) : (
          <span className="reco-skeleton">아래 버튼을 눌러 생성하세요</span>
        )}
      </div>

      {/*
        '조합 성향' 이라고 이름을 붙인다. 라벨 없이 숫자만 두면 "완전 랜덤" 카드에서
        그 값이 생성 조건처럼 읽힌다 — 실제로는 뽑은 뒤에 센 결과다.
      */}
      {set ? (
        <p className="reco-traits">
          <span className="reco-traits-label">조합 성향</span>
          {traitSummaryLine(set.traits)}
        </p>
      ) : (
        <p className="reco-traits">{meta.short}</p>
      )}

      {/* '다시 생성'이 주 동작이라 전폭으로 두고, 내보내기 셋을 그 아래 3열로 눕힌다. */}
      <div className="reco-actions">
        <button type="button" className="btn btn-secondary" onClick={regenerate} disabled={busy}>
          다시 생성
        </button>
        {set && (
          <NumberActions
            numbers={set.numbers}
            strategyLabel={meta.label}
            subtitle={traitSummaryLine(set.traits)}
            compact
          />
        )}
      </div>

      {busy && (
        <GenerateProgress
          step={step ?? FINAL_STEP}
          error={error}
          onClose={error ? closeDialog : undefined}
        />
      )}
    </article>
  )
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
