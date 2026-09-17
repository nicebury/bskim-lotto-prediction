'use client'

import { useEffect, useRef, useState } from 'react'

import type { SimulateStages } from '@/lib/api-types'
import { formatNumber } from '@/lib/format'
import { SIMULATOR_STEPS, type SimulatorStep } from '@/lib/simulator-steps'
import { useModalBehavior } from '../useModalBehavior'
import { StepIcon } from './StepIcon'

/**
 * AI 번호추천이 도는 동안 띄우는 진행 대화상자.
 *
 * ── 왜 팝업인가 ────────────────────────────────────────────────────
 * 사용자 요구는 "뭔가 수행한다는 느낌" 이다. 버튼 옆 작은 스피너로는 **일곱 단계를 거친다**
 * 는 사실이 전달되지 않는다. 화면을 덮고 단계가 하나씩 차오르는 편이 무슨 일이 일어나는지
 * 훨씬 분명하다.
 *
 * ── ⚠ 이 팝업 안에 애드센스 광고를 넣지 않는다 ─────────────────────
 * 처음에는 "나중에 여기에 광고" 를 전제로 자리를 잡아 뒀다. 2026-09-01 조사에서 **애드센스
 * 정책상 위험한 자리**로 확인됐다. 세 가지가 걸린다.
 *
 *   ① 게시자 정책은 **광고가 콘텐츠를 덮거나 콘텐츠가 광고를 덮는 배치**를 금지한다.
 *      이 팝업은 정의상 페이지를 덮고 있다.
 *   ② `sim-cancel`(그만두기)이 바로 아래 있다. **조작 버튼에 인접한 광고**는 의도치 않은
 *      클릭을 유발하는 배치로 본다 — 무효 트래픽으로 잡히면 계정이 위험하다.
 *   ③ 기술적으로도 안 된다. 팝업이 열릴 때 `adsbygoogle.push({})` 를 부르면 **페이지에
 *      이미 떠 있던 광고까지 다시 로드**된다.
 *
 * 그래서 `.sim-slot` 은 **광고 자리가 아니라 여백**으로 남긴다. 단계 내용과 그만두기
 * 버튼이 붙어 보이지 않게 하는 역할만 한다.
 * → 판단 근거와 대안은 docs/wiki/30-seo/adsense-readiness.md
 *
 * ── ⚠ 연출이지 거짓말이 아니다 ─────────────────────────────────────
 * 단계마다 최소 시간을 두는 것은 **읽을 시간을 주기 위해서**다. 표시하는 수치는 전부
 * 백엔드가 실제로 계산한 값이고, 계산하지 못한 단계는 수치 없이 설명만 보여준다
 * (계약: "빈 값을 0 으로 채우지 않는다").
 *
 * 응답이 먼저 와도 **남은 단계를 건너뛰지 않는다.** 건너뛰면 어떤 실행은 일곱 단계가
 * 보이고 어떤 실행은 두 단계만 보여, 사용자는 무엇이 달랐는지 알 수 없다.
 *
 * ⚠ 응답이 늦으면 **단계를 시작하기 전 '추첨 준비' 에서 기다린다**(2026-09-17 변경).
 *   종전에는 단계가 먼저 흘러가고 마지막 단계에서 기다렸다. 그러자 5만·10만 번처럼 서버
 *   계산이 긴 실행에서는 **응답이 오기 전에 일곱 단계가 빈 번호판으로 지나가 버렸다** —
 *   "1만 번은 번호를 고르는 게 보이는데 5만·10만 번은 휘리릭 지나간다"(사용자 지적).
 *   이제 기다리는 동안에는 번호를 뽑는 연출을 보여 주고, 응답이 오면 일곱 단계를 **실제
 *   수치와 함께** 재생한다. 어떤 횟수를 고르든 보이는 장면이 같다.
 *
 * ── ⚠ 접근성 ───────────────────────────────────────────────────────
 * `role="dialog"` + `aria-modal` + 포커스 트랩(`useModalBehavior`). 진행 상황은
 * `aria-live` 로 읽어 준다 — 화면을 보지 않는 사용자에게도 단계가 넘어가는 것이 들려야 한다.
 * **배경 클릭으로 닫히지 않는다.** 도는 중에 실수로 닫으면 처음부터 다시 해야 한다.
 * 다만 `Esc` 는 남긴다(취소) — 키보드 사용자가 갇히면 안 된다.
 */

/**
 * 단계별로 머무는 시간.
 *
 * ⚠ 종전에는 "전체 5초 ÷ 단계 수" 로 모두 같았다(2026-09-01 사용자 요청 "5초로"). 그러자
 *   이 기능의 핵심인 **가상 추첨 단계도 0.7초**라 번호를 뽑는 장면이 보이기 전에 끝났다.
 *   2026-09-17 에 가상 추첨만 길게, 나머지는 짧게 나눴다. 합은 여전히 5초 남짓이다.
 * ⚠ 합을 바꿀 때는 `STEP_MS` 와 `MONTE_MS` 를 함께 본다 — 사용자가 기다리는 시간은 둘의 합이다.
 */
const STEP_MS = 520
const MONTE_MS = 1900
const FINAL_MS = 900
/** 응답이 아주 빨라도 '추첨 준비' 를 이만큼은 보여 준다. 짧으면 제목이 깜빡이고 사라진다. */
const PREP_MIN_MS = 700

const MONTE_INDEX = SIMULATOR_STEPS.findIndex((s) => s.key === 'montecarlo')

function stepDuration(index: number): number {
  if (index === MONTE_INDEX) return MONTE_MS
  if (index === SIMULATOR_STEPS.length - 1) return FINAL_MS
  return STEP_MS
}

export function SimulatorRunner({
  stages,
  firstSet,
  trials,
  done,
  onCancel,
  onFinished,
}: {
  /** 응답의 단계별 수치. 아직 응답이 안 왔으면 `null`. */
  stages: SimulateStages | null
  /** 응답의 첫 추천 번호. 마지막 단계에서 번호판에 켠다. 없으면 켜지 않는다. */
  firstSet: number[] | null
  /** 사용자가 고른 가상 추첨 횟수. 응답이 오기 전 준비 화면 문구에만 쓴다. */
  trials: number
  /** 응답이 도착했는가(성공·실패 무관). */
  done: boolean
  onCancel: () => void
  /** 모든 단계가 끝났다. 호출부가 결과를 그린다. */
  onFinished: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  /** `null` = 아직 단계 시작 전(추첨 준비). 응답이 와야 0 부터 돈다. */
  const [index, setIndex] = useState<number | null>(null)
  const [prepElapsed, setPrepElapsed] = useState(false)
  const [openStep, setOpenStep] = useState<number | null>(null)
  useModalBehavior(ref, onCancel)

  const last = SIMULATOR_STEPS.length - 1

  /*
    ⚠ 콜백을 **의존성에 넣지 않는다.** 호출부의 `onFinished` 는 렌더마다 새 함수일 수 있고,
      그러면 이 effect 가 매 렌더 재실행되어 **타이머가 설정되자마자 취소된다** — 실제로
      단계가 2에서 멈췄다(실측, 2026-08-28). ref 에 담아 최신 값을 읽는다.
  */
  const finishRef = useRef(onFinished)
  finishRef.current = onFinished

  // 준비 화면의 최소 노출 시간.
  useEffect(() => {
    const timer = setTimeout(() => setPrepElapsed(true), PREP_MIN_MS)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (index === null) {
      if (!done || !prepElapsed) return
      /*
        ⚠ 응답은 왔는데 수치가 없다 = 요청이 실패했다. 빈 번호판으로 일곱 단계를 돌리는 것은
          "분석했다" 는 거짓 연출이 된다. 곧바로 닫고 호출부가 오류를 보여 주게 한다.
      */
      if (!stages) {
        finishRef.current()
        return
      }
      setIndex(0)
      return
    }
    const timer = setTimeout(() => {
      if (index === last) finishRef.current()
      else setIndex(index + 1)
    }, stepDuration(index))
    return () => clearTimeout(timer)
  }, [index, last, done, prepElapsed, stages])

  const preparing = index === null
  const step = SIMULATOR_STEPS[index ?? 0]
  const detail = stages && !preparing ? step.detail(stages) : null

  return (
    <div className="sim-backdrop" role="presentation">
      <div
        ref={ref}
        className="sim-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sim-title"
      >
        <div className="sim-head">
          <span className="sim-head-icon" aria-hidden="true">
            <StepIcon stepKey={preparing ? 'montecarlo' : step.key} />
          </span>
          <div>
            <p className="sim-eyebrow">
              {preparing
                ? '정밀 분석 · 준비'
                : `정밀 분석 · ${(index ?? 0) + 1} / ${SIMULATOR_STEPS.length} 단계`}
            </p>
            <h2 id="sim-title">{preparing ? '가상 추첨을 돌리는 중' : step.title}</h2>
          </div>
        </div>

        {/*
          진행 막대. 준비 중에는 '끝을 모르는' 막대(흐르는 줄무늬)로 둔다 — 서버 계산이 언제
          끝날지 모르는데 채워지는 막대를 보여 주면 거짓 진행률이 된다.
        */}
        <div
          className="sim-bar"
          data-indeterminate={preparing ? '' : undefined}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={SIMULATOR_STEPS.length}
          aria-valuenow={preparing ? undefined : (index ?? 0) + 1}
          aria-label="시뮬레이션 진행"
        >
          <span
            style={{
              width: preparing ? undefined : `${(((index ?? 0) + 1) / SIMULATOR_STEPS.length) * 100}%`,
            }}
          />
        </div>

        <SimStage
          stepKey={preparing ? 'prepare' : step.key}
          stages={stages}
          firstSet={firstSet}
          trials={trials}
        />

        <div className="sim-now" aria-live="polite">
          <p className="sim-now-running">
            {preparing
              ? `서버가 가상 추첨 ${formatNumber(trials)}번을 계산하고 있습니다…`
              : `${step.running}…`}
          </p>
          {detail ? (
            <p className="sim-now-detail">{detail}</p>
          ) : preparing ? (
            <p className="sim-now-detail">
              횟수가 많을수록 오래 걸립니다. 계산이 끝나면 단계별 결과를 차례로 보여 드립니다.
            </p>
          ) : stages && index !== last ? (
            <p className="sim-now-none">이번에는 이 단계의 수치를 함께 보여드리지 못했습니다.</p>
          ) : null}
        </div>

        {/*
          단계 줄 — 아이콘 일곱 개. 각 아이콘이 곧 **설명 버튼**이다.
          ⚠ 상태를 색만으로 알리지 않는다 — 지난 단계에는 체크 배지, 현재 단계에는
            `aria-current="step"` 과 굵은 테두리가 붙는다.
        */}
        <ol className="sim-steps">
          {SIMULATOR_STEPS.map((s, i) => {
            const state =
              index === null ? 'todo' : i < index ? 'done' : i === index ? 'active' : 'todo'
            return (
              <li key={s.key} data-state={state}>
                <button
                  type="button"
                  className="sim-step-btn"
                  onClick={() => setOpenStep(i)}
                  aria-current={state === 'active' ? 'step' : undefined}
                  aria-label={`${i + 1}단계 ${s.title}${state === 'done' ? ' 완료' : ''} — 설명 보기`}
                >
                  <StepIcon stepKey={s.key} />
                  {state === 'done' && (
                    <span className="sim-step-check" aria-hidden="true">
                      <svg viewBox="0 0 24 24" width="10" height="10">
                        <path
                          d="M5 12.5l4.5 4.5L19 7.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ol>
        <p className="sim-steps-hint">아이콘을 누르면 단계 설명이 열립니다</p>

        {/*
          ⚠ **여기에 광고를 넣지 않는다.** 콘텐츠를 덮는 팝업이자 바로 아래가 조작 버튼이라
            애드센스 배치 정책에 걸린다(위 주석 ①②③). 이 칸은 여백일 뿐이다.
        */}
        <div className="sim-slot" aria-hidden="true" />

        <button type="button" className="btn btn-secondary sim-cancel" onClick={onCancel}>
          그만두기
        </button>
      </div>

      {openStep !== null && (
        <StepHelp
          index={openStep}
          onClose={() => setOpenStep(null)}
        />
      )}
    </div>
  )
}

/** 1~45. 번호판을 그릴 때마다 새로 만들지 않는다. */
const ALL_NUMBERS = Array.from({ length: 45 }, (_, i) => i + 1)

type StageKey = SimulatorStep['key'] | 'prepare'

/**
 * 단계별 무대 — 45개 번호판 + 그 단계의 한 줄.
 *
 * ── ⚠ 켜지는 번호는 전부 응답에서 온다 ─────────────────────────────
 * 프론트는 빈도·주기를 **다시 계산하지 않는다**(frontend/CLAUDE.md "비즈니스 계산 금지").
 * `stages` 가 짚어 준 번호, 마지막 단계에서는 응답의 첫 추천 번호를 표시할 뿐이다.
 *
 * ── ⚠ 예외: '뽑는 중' 연출 ─────────────────────────────────────────
 * 준비 화면과 가상 추첨 단계에서는 번호판에서 번호 여섯 개가 **하나씩 뽑혔다가 다시 뽑힌다**
 * (`usePicking`). 이것은 "수없이 추첨을 돌리고 있다" 는 **연출**이지 결과가 아니다. 그래서
 * 번호판이 `aria-hidden` 이고, 뽑힌 칸은 결과 칸(`data-lit`)과 다른 옅은 모양이며, 아래 줄도
 * 결과가 아니라 "돌리는 중" 만 말한다. 최종 번호는 마지막 단계에서 진한 칸으로 따로 켜진다.
 */
function SimStage({
  stepKey,
  stages,
  firstSet,
  trials,
}: {
  stepKey: StageKey
  stages: SimulateStages | null
  firstSet: number[] | null
  trials: number
}) {
  const lit = litNumbers(stepKey, stages, firstSet)
  const picking = stepKey === 'prepare' || stepKey === 'montecarlo'
  const picked = usePicking(picking)
  const total = stages?.montecarlo?.trials ?? trials
  const counted = useCountUp(stepKey === 'montecarlo' ? total : 0, Math.round(MONTE_MS * 0.8))

  return (
    <div className="sim-stage" data-step={stepKey}>
      <div className="sim-board" aria-hidden="true">
        {ALL_NUMBERS.map((n) => {
          const rank = lit.get(n)
          const pickOrder = picked.indexOf(n)
          return (
            <span
              key={n}
              className="sim-cell"
              data-lit={rank !== undefined ? '' : undefined}
              data-pick={pickOrder >= 0 ? '' : undefined}
              // 켜진 순서대로 조금씩 늦게 켠다 — 한꺼번에 켜지면 '계산' 이 아니라 '표시' 로 읽힌다.
              style={rank !== undefined ? { animationDelay: `${rank * 70}ms` } : undefined}
            >
              {n}
            </span>
          )
        })}
      </div>

      {picking ? (
        <div className="sim-pickrow">
          {/* 뽑힌 여섯 칸. 하나씩 차오르고 다시 비워진다(연출). */}
          <span className="sim-slots" aria-hidden="true">
            {Array.from({ length: 6 }, (_, i) => (
              <i key={i} data-on={picked[i] !== undefined ? '' : undefined}>
                {picked[i] ?? ''}
              </i>
            ))}
          </span>
          {stepKey === 'montecarlo' ? (
            <span className="sim-counter">
              <b>{formatNumber(counted)}</b>
              <span>/ {formatNumber(total)}번</span>
            </span>
          ) : (
            <span className="sim-caption">가상 추첨 {formatNumber(trials)}번 준비</span>
          )}
        </div>
      ) : (
        <StageCaption stepKey={stepKey} stages={stages} firstSet={firstSet} />
      )}
    </div>
  )
}

/**
 * 단계 → 켤 번호와 켜는 순서.
 *
 * ⚠ 단계마다 **앞 몇 개만** 켠다. 45칸 중 열 칸이 켜지면 무엇이 두드러지는지 흐려진다.
 */
function litNumbers(
  key: StageKey,
  stages: SimulateStages | null,
  firstSet: number[] | null,
): Map<number, number> {
  const map = new Map<number, number>()
  const put = (numbers: number[]) => numbers.forEach((n, i) => map.set(n, i))

  if (key === 'final') {
    if (firstSet) put(firstSet)
    return map
  }
  if (!stages) return map

  switch (key) {
    case 'frequency':
      if (stages.frequency) put(stages.frequency.most.slice(0, 6).map((m) => m.number))
      break
    case 'cycle':
      if (stages.cycle) put(stages.cycle.longest_waiting.slice(0, 6).map((c) => c.number))
      break
    case 'trend':
      if (stages.trend) put(stages.trend.rising.slice(0, 6).map((t) => t.number))
      break
    case 'ensemble':
      if (stages.ensemble) put(stages.ensemble.top_numbers.slice(0, 8))
      break
    default:
      break
  }
  return map
}

/** 번호판 아래 한 줄. 켜진 칸이 무엇인지 말한다. */
function StageCaption({
  stepKey,
  stages,
  firstSet,
}: {
  stepKey: StageKey
  stages: SimulateStages | null
  firstSet: number[] | null
}) {
  switch (stepKey) {
    case 'frequency':
      return <p className="sim-caption"><i data-kind="lit" /> 역대 가장 많이 나온 번호</p>
    case 'cycle':
      return <p className="sim-caption"><i data-kind="lit" /> 가장 오래 쉬고 있는 번호</p>
    case 'trend':
      return <p className="sim-caption"><i data-kind="lit" /> 최근 회차에서 자주 보인 번호</p>
    case 'ensemble':
      return <p className="sim-caption"><i data-kind="lit" /> 종합 순서가 앞선 번호</p>
    case 'pattern':
      return stages?.pattern ? (
        <ul className="sim-chips">
          <li>홀짝 3:3 <b>{Math.round(stages.pattern.odd_even_3_3_rate * 100)}%</b></li>
          <li>
            합계 {stages.pattern.sum_range.from}~{stages.pattern.sum_range.to}{' '}
            <b>{Math.round(stages.pattern.sum_range.rate * 100)}%</b>
          </li>
          <li>연속번호 <b>{Math.round(stages.pattern.consecutive_rate * 100)}%</b></li>
        </ul>
      ) : (
        <p className="sim-caption">지난 조합의 생김새와 견주는 중입니다</p>
      )
    case 'final':
      return firstSet ? (
        <p className="sim-caption"><i data-kind="lit" /> 추천 1 · {firstSet.join(' · ')}</p>
      ) : (
        <p className="sim-caption">자주 살아남은 조합을 고르는 중입니다</p>
      )
    default:
      return <p className="sim-caption">&nbsp;</p>
  }
}

/**
 * '뽑는 중' 연출. 번호를 130ms 마다 하나씩 뽑아 여섯 개를 채우고, 잠깐 멈췄다가 비우고 다시 뽑는다.
 *
 * ⚠ `Math.random` 을 쓰는 것은 **이것이 결과가 아니기 때문**이다(위 `SimStage` 주석).
 * ⚠ 종전(90ms 마다 여섯 칸을 한꺼번에 바꾸던 깜빡임)은 1만 번일 때만 잠깐 보였고, 빨라서
 *   '고른다' 보다 '반짝인다' 로 읽혔다. 하나씩 차오르게 바꿨다(2026-09-17 사용자 요청).
 * ⚠ 움직임을 줄인 사용자에게는 돌리지 않는다. 번호판이 정지한 채 문구만 바뀐다.
 */
function usePicking(active: boolean): number[] {
  const [picked, setPicked] = useState<number[]>([])

  useEffect(() => {
    if (!active) {
      setPicked([])
      return
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let current: number[] = []
    let hold = 0
    const timer = setInterval(() => {
      if (current.length === 6) {
        // 여섯이 다 찼으면 세 박자 멈췄다가 비운다 — 다 찬 모습이 눈에 잡혀야 '뽑았다' 로 읽힌다.
        hold += 1
        if (hold < 3) return
        hold = 0
        current = []
      } else {
        let n = 1 + Math.floor(Math.random() * 45)
        while (current.includes(n)) n = 1 + Math.floor(Math.random() * 45)
        current = [...current, n]
      }
      setPicked(current)
    }, 130)
    return () => clearInterval(timer)
  }, [active])

  return picked
}

/**
 * 0 → target 으로 오르는 카운터. ease-out 이라 끝에서 천천히 멈춘다.
 *
 * ⚠ 목표값은 실제 추첨 횟수다. 오르는 **속도**만 연출이다 — 서버는 이미 다 돌렸다.
 */
function useCountUp(target: number, durationMs: number): number {
  const [value, setValue] = useState(0)

  useEffect(() => {
    if (target <= 0) {
      setValue(0)
      return
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(target)
      return
    }
    let frame = 0
    const started = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / durationMs)
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(Math.round(target * eased))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, durationMs])

  return value
}

/**
 * 단계 설명 팝업.
 *
 * ⚠ 진행 대화상자 **위에** 뜬다. 포커스 트랩이 둘 겹치므로 이쪽이 닫힐 때 아래로 포커스가
 *   돌아가야 한다 — `useModalBehavior` 가 열기 전 활성 요소를 기억했다가 복원한다.
 */
function StepHelp({ index, onClose }: { index: number; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useModalBehavior(ref, onClose)
  const step = SIMULATOR_STEPS[index]

  return (
    <div className="sim-backdrop sim-backdrop-top" role="presentation">
      <div
        ref={ref}
        className="sim-help"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sim-help-title"
      >
        <span className="sim-head-icon" aria-hidden="true">
          <StepIcon stepKey={step.key} />
        </span>
        <p className="sim-eyebrow">{index + 1}단계</p>
        <h3 id="sim-help-title">{step.title}</h3>
        <p className="sim-help-quote">&ldquo;{step.quote}&rdquo;</p>
        <p className="sim-help-body">{step.description}</p>
        <button type="button" className="btn btn-primary" onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  )
}
