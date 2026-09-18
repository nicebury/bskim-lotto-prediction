'use client'

import { useEffect, useRef, useState } from 'react'

import { useModalBehavior } from './useModalBehavior'

/**
 * 꿈 풀이 중 팝업 — **점집에서 해몽을 듣는 장면**(2026-09-18 신설).
 *
 * ── 왜 이렇게 만들었나 ─────────────────────────────────────────────
 * 사용자 요청: "AI스럽다기보단 점집에서 꿈해몽하는 것과 같은 팝업으로 과정이 보여지고 결과가
 * 나왔으면". 종전에는 버튼이 "꿈을 분석하는 중…" 으로 바뀌는 것이 전부라, 20초가 걸려도
 * 화면이 멈춘 것처럼 보였다.
 *
 * 그래서 세 걸음을 **말하듯** 보여 준다 — 꿈 이야기를 듣고, 해몽 자료를 펼치고, 얽힌 번호를
 * 센다. 밤하늘 바탕에 달과 별을 두어 분위기를 만들되, **없는 능력을 말하지 않는다.**
 *
 * ── ⚠ 연출과 사실의 경계 ───────────────────────────────────────────
 * - 걸음의 말은 실제로 서버가 하는 일을 순서대로 옮긴 것이다(형태소 분석 → 자료 대조 → 번호).
 * - 마지막에 드러나는 여섯 개는 **응답의 첫 조합**이다. 연출로 지어낸 번호가 아니다.
 * - 별과 달은 장식이라 `aria-hidden` 이고, 상태는 `aria-live` 문장이 전한다.
 * - 문구에 "맞힌다 · 좋은 꿈 · 대박" 같은 말을 쓰지 않는다(→ forbidden-expressions.md).
 *
 * ── ⚠ 첫 요청은 20초가 걸릴 수 있다 ────────────────────────────────
 * 분석 모델이 lazy 싱글톤으로 로드된다(→ dream-pipeline.md). 그래서 **걸음이 끝나도 응답을
 * 기다린다.** 기다리는 동안에는 마지막 걸음에 머물며 "조금 더 걸리고 있습니다" 를 덧붙인다 —
 * 멈춘 것이 아니라는 신호가 있어야 떠나지 않는다.
 */

/** 걸음마다 머무는 최소 시간. 합쳐 2.4초 — 응답이 빨라도 이만큼은 보여 준다. */
const STEP_MS = [900, 800, 700]

const STEPS = [
  {
    title: '꿈 이야기를 듣고 있습니다',
    detail: '적어 주신 문장에서 사람·동물·사물 같은 상징을 하나씩 골라냅니다.',
  },
  {
    title: '해몽 자료를 펼치고 있습니다',
    detail: '옛 해몽 자료에서 그 상징과 같은 말, 품은 말, 뜻이 가까운 말을 찾습니다.',
  },
  {
    title: '풀이에 얽힌 번호를 세고 있습니다',
    detail: '찾은 말마다 자료에 적힌 번호를 모아 여섯 개로 추립니다.',
  },
]

export function DreamReading({
  text,
  picked,
  done,
  onFinished,
  onCancel,
}: {
  /** 사용자가 적은 꿈. 첫 걸음에서 그대로 되읊어 준다 — 듣고 있다는 신호다. */
  text: string
  /** 응답의 첫 조합. 마지막에 하나씩 드러난다. 아직 없으면 `null`. */
  picked: number[] | null
  /** 응답이 도착했는가(성공·실패 무관). */
  done: boolean
  onFinished: () => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [step, setStep] = useState(0)
  const [revealed, setRevealed] = useState(0)
  useModalBehavior(ref, onCancel)

  /*
    ⚠ 콜백을 의존성에 넣지 않는다. 렌더마다 새 함수가 오면 effect 가 다시 돌아 타이머가
      걸리자마자 취소된다(`SimulatorRunner` 에서 실제로 겪었다).
  */
  const finishRef = useRef(onFinished)
  finishRef.current = onFinished

  const last = STEPS.length - 1

  useEffect(() => {
    if (step < last) {
      const timer = setTimeout(() => setStep((s) => s + 1), STEP_MS[step])
      return () => clearTimeout(timer)
    }
    // 마지막 걸음 — 응답을 기다린다. 없는 풀이를 먼저 보여줄 수는 없다.
    if (!done) return
    const timer = setTimeout(() => finishRef.current(), STEP_MS[last] + revealDuration(picked))
    return () => clearTimeout(timer)
  }, [step, last, done, picked])

  /*
    번호를 하나씩 드러낸다. 여섯이 한꺼번에 나오면 "이미 정해져 있던 것" 으로 보이고,
    하나씩 나오면 **지금 세고 있는 것**으로 보인다.
  */
  useEffect(() => {
    if (step !== last || !picked) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setRevealed(picked.length)
      return
    }
    const timer = setInterval(() => {
      setRevealed((n) => {
        if (n >= picked.length) {
          clearInterval(timer)
          return n
        }
        return n + 1
      })
    }, 220)
    return () => clearInterval(timer)
  }, [step, last, picked])

  const current = STEPS[step]
  const waiting = step === last && !done

  return (
    <div className="sim-backdrop dream-backdrop" role="presentation">
      <div
        ref={ref}
        className="reading"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reading-title"
      >
        {/* 밤하늘. 순수 장식이라 접근성 트리에서 뺀다. */}
        <div className="reading-sky" aria-hidden="true">
          <span className="reading-moon" />
          {[...Array(14)].map((_, i) => (
            <i key={i} style={{ '--i': i } as React.CSSProperties} />
          ))}
        </div>

        <p className="reading-eyebrow">꿈 풀이</p>
        <h2 id="reading-title" className="reading-title">
          {current.title}
        </h2>

        {/* 적어 주신 꿈을 되읊는다 — '듣고 있다' 는 것을 글자로 보여 주는 자리다. */}
        <blockquote className="reading-quote">&ldquo;{text}&rdquo;</blockquote>

        <div className="reading-steps" aria-hidden="true">
          {STEPS.map((s, i) => (
            <span key={s.title} data-state={i < step ? 'done' : i === step ? 'active' : 'todo'} />
          ))}
        </div>

        <div className="reading-now" aria-live="polite">
          <p>{current.detail}</p>
          {waiting && (
            <p className="reading-wait">
              처음 풀이할 때는 자료를 불러오느라 조금 더 걸립니다. 잠시만 기다려 주세요.
            </p>
          )}
        </div>

        {/* 마지막 걸음에서 번호가 하나씩 놓인다. 여섯 자리는 처음부터 잡아 둔다(자리가 흔들리지 않게). */}
        <div className="reading-balls" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const value = picked && i < revealed ? picked[i] : null
            return (
              <span key={i} className="reading-ball" data-on={value !== null ? '' : undefined}>
                {value ?? ''}
              </span>
            )
          })}
        </div>

        <button type="button" className="btn btn-secondary reading-cancel" onClick={onCancel}>
          그만두기
        </button>
      </div>
    </div>
  )
}

/** 번호가 다 드러나기까지 걸리는 시간. 다 나오기 전에 팝업이 닫히면 헛일이다. */
function revealDuration(picked: number[] | null): number {
  if (!picked || picked.length === 0) return 0
  return picked.length * 220 + 260
}
