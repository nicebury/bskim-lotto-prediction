'use client'

import { useEffect, useRef, useState } from 'react'

import { useModalBehavior } from '../useModalBehavior'

/**
 * 6가지 추천의 **뽑는 과정** 팝업 (2026-09-18 신설).
 *
 * ── 왜 만들었나 ────────────────────────────────────────────────────
 * 사용자 요청: "6가지 추천도 번호뽑기하면 시뮬레이션처럼 뭔가 동작하고 번호가 선택되는 과정을
 * 보여 주면 뭔가 더 있어 보일 것 같다". 종전에는 볼 여섯 개가 깜빡이는 1초짜리 알림
 * (`RecommendProgress`)뿐이라, 정밀 분석 쪽과 견주면 "그냥 즉시 나오는 것" 으로 보였다.
 *
 * ── ⚠ 정밀 분석(`SimulatorRunner`)과 무엇이 다른가 ─────────────────
 * 저쪽은 **일곱 단계 × 5초**이고 단계마다 응답의 실제 수치를 보여 준다. 이쪽은 한 가지 기준으로
 * 바로 뽑는 방식이라 보여줄 수치가 없다. 그래서 **세 걸음 × 2초 안팎**으로 짧게 두고, 말도
 * "무엇을 하는 중" 까지만 한다 — 없는 분석을 지어내지 않는다.
 *
 * ── ⚠ 무엇이 연출이고 무엇이 사실인가 ──────────────────────────────
 * - 번호판에서 칸이 하나씩 켜지는 것은 **연출**이다(`Math.random`). 결과가 아니다.
 * - 마지막 걸음에서 켜지는 여섯 칸은 **응답의 첫 번째 조합**이다. 여기서만 진짜 번호가 나온다.
 * - 그래서 연출 칸(`data-pick`)과 결과 칸(`data-lit`)은 모양이 다르다(recommend.css).
 *
 * ⚠ 응답이 먼저 와도 걸음을 건너뛰지 않고, 늦으면 첫 걸음에서 기다린다 —
 *   `SimulatorRunner` 와 같은 규칙이다. 어떤 실행은 과정이 보이고 어떤 실행은 안 보이면
 *   사용자는 무엇이 달랐는지 알 수 없다.
 */

/** 걸음마다 머무는 시간. 셋을 더해 2.1초 남짓 — 정밀 분석(5초)보다 확실히 짧게 둔다. */
const STEP_MS = [700, 700, 700]

export function DrawRunner({
  strategyLabel,
  strategyShort,
  picked,
  done,
  onFinished,
  onCancel,
}: {
  /** 고른 기준 이름. "통계 종합" 처럼 화면에 그대로 쓴다. */
  strategyLabel: string
  /** 기준 한 줄 설명(`STRATEGIES[].short`). 첫 걸음에서 "무엇을 보고 고르는지" 를 말한다. */
  strategyShort: string
  /** 응답의 첫 조합. 마지막 걸음에서 번호판에 켠다. 아직 없으면 `null`. */
  picked: number[] | null
  /** 응답이 도착했는가(성공·실패 무관). */
  done: boolean
  onFinished: () => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [step, setStep] = useState(0)
  const [flash, setFlash] = useState<number[]>([])
  useModalBehavior(ref, onCancel)

  /*
    ⚠ 콜백을 의존성에 넣지 않는다. 호출부의 함수가 렌더마다 새로 만들어지면 effect 가 다시 돌아
      **타이머가 걸리자마자 취소된다**(SimulatorRunner 에서 실제로 겪은 일이다).
  */
  const finishRef = useRef(onFinished)
  finishRef.current = onFinished

  useEffect(() => {
    // 첫 걸음에서 응답을 기다린다. 없는 결과로 다음 걸음을 보여줄 수는 없다.
    if (step === 0 && !done) return

    if (step >= STEP_MS.length) {
      finishRef.current()
      return
    }
    const timer = setTimeout(() => setStep((s) => s + 1), STEP_MS[step])
    return () => clearTimeout(timer)
  }, [step, done])

  /*
    번호판 연출. 마지막 걸음 전까지 무작위로 칸을 밝힌다.
    ⚠ 움직임을 줄인 사용자에게는 돌리지 않는다 — 문구와 진행 막대만으로 충분하다.
  */
  const revealing = step >= STEP_MS.length - 1 && picked !== null
  useEffect(() => {
    if (revealing) {
      setFlash([])
      return
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = setInterval(() => {
      const next = new Set<number>()
      while (next.size < 6) next.add(1 + Math.floor(Math.random() * 45))
      setFlash([...next])
    }, 110)
    return () => clearInterval(timer)
  }, [revealing])

  const captions = [
    `${strategyLabel} 기준을 펴는 중입니다`,
    '번호 묶음에서 여섯 개를 뽑는 중입니다',
    '뽑은 조합을 확인하는 중입니다',
  ]
  const caption = captions[Math.min(step, captions.length - 1)]
  const lit = revealing ? (picked ?? []) : []

  return (
    <div className="sim-backdrop" role="presentation">
      <div
        ref={ref}
        className="sim-dialog draw-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="draw-title"
      >
        <div className="sim-head">
          <span className="sim-head-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3.5" y="3.5" width="17" height="17" rx="3.5" />
              <circle cx="8.5" cy="8.5" r="1" fill="currentColor" stroke="none" />
              <circle cx="15.5" cy="15.5" r="1" fill="currentColor" stroke="none" />
              <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
            </svg>
          </span>
          <div>
            <p className="sim-eyebrow">{strategyLabel}</p>
            <h2 id="draw-title">번호를 뽑는 중입니다</h2>
          </div>
        </div>

        <div
          className="sim-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={STEP_MS.length}
          aria-valuenow={Math.min(step + 1, STEP_MS.length)}
          aria-label="뽑기 진행"
        >
          <span style={{ width: `${((Math.min(step, STEP_MS.length - 1) + 1) / STEP_MS.length) * 100}%` }} />
        </div>

        <div className="sim-stage">
          <div className="sim-board" aria-hidden="true">
            {Array.from({ length: 45 }, (_, i) => i + 1).map((n) => {
              const rank = lit.indexOf(n)
              return (
                <span
                  key={n}
                  className="sim-cell"
                  data-lit={rank >= 0 ? '' : undefined}
                  data-pick={!revealing && flash.includes(n) ? '' : undefined}
                  style={rank >= 0 ? { animationDelay: `${rank * 90}ms` } : undefined}
                >
                  {n}
                </span>
              )
            })}
          </div>

          <div className="sim-pickrow">
            <span className="sim-slots" aria-hidden="true">
              {Array.from({ length: 6 }, (_, i) => {
                const value = revealing ? lit[i] : flash[i]
                return (
                  <i key={i} data-on={value !== undefined ? '' : undefined}>
                    {value ?? ''}
                  </i>
                )
              })}
            </span>
          </div>
        </div>

        {/* 진행 상황은 소리로도 들려야 한다. `polite` — 다른 낭독을 끊지 않는다. */}
        <div className="sim-now" aria-live="polite">
          <p className="sim-now-running">{caption}</p>
          <p className="sim-now-detail">{strategyShort}</p>
        </div>

        <button type="button" className="btn btn-secondary sim-cancel" onClick={onCancel}>
          그만두기
        </button>
      </div>
    </div>
  )
}
