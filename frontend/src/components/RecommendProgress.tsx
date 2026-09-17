'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * 번호를 고르는 동안 띄우는 짧은 진행 팝업.
 *
 * ── 왜 있는가 ──────────────────────────────────────────────────────
 * 6가지 추천은 응답이 빨라서 버튼을 눌러도 **아무 일도 안 일어난 것처럼 보였다**. 결과만
 * 슬쩍 바뀌니 "눌린 건가?" 싶다(2026-09-02 사용자 지적). 화면을 덮고 한 줄 알려 주면
 * 무엇이 도는지 분명해진다.
 *
 * ⚠ **`SimulatorRunner` 와 다르다.** 그쪽은 일곱 단계를 차례로 보여주는 5초짜리 연출이고,
 *   이쪽은 "지금 고르는 중" 만 알리는 1초짜리다. 6가지 추천은 한 가지 기준으로 바로 뽑는
 *   방식이라 보여줄 단계가 없다. 같은 것을 쓰면 없는 단계를 지어내야 한다.
 *
 * ── ⚠ 최소 표시 시간이 필요한 이유 ─────────────────────────────────
 * 응답이 200ms 에 오면 팝업이 **깜빡이고 사라진다.** 그것은 알려 주는 것이 아니라 화면이
 * 튀는 것이다. 그래서 열렸으면 `minMs` 만큼은 유지한다. 응답이 그보다 늦으면 늦는 만큼
 * 더 기다린다(끝나는 시점은 언제나 응답 도착 이후다).
 *
 * ── ⚠ 접근성: 대화상자가 아니라 알림이다 ───────────────────────────
 * `aria-modal` + 포커스 트랩을 두지 않는다. 1초 뒤 저절로 사라지는 것에 포커스를 가두면,
 * 사라질 때 포커스를 어디로 되돌릴지가 오히려 문제가 된다. 대신 **`role="status"` +
 * `aria-live="polite"`** 로 "고르는 중" 을 읽어 준다 — 화면을 보지 않는 사용자에게 필요한
 * 것은 갇히는 것이 아니라 **들리는 것**이다.
 *
 * ⚠ 배경 스크롤은 잠근다. 덮여 있는 동안 뒤가 움직이면 팝업이 떠 있다는 감각이 깨진다.
 */
export function RecommendProgress({
  open,
  message = 'AI가 지난 당첨번호를 살펴 번호를 고르고 있습니다',
  minMs = 1100,
}: {
  open: boolean
  /** 한 줄 안내. 화면마다 하는 일이 다르므로 바꿔 넣을 수 있게 둔다. */
  message?: string
  /** 열렸을 때 최소한 이만큼은 보여준다. */
  minMs?: number
}) {
  const [visible, setVisible] = useState(false)
  /** 언제 열렸는지. 최소 표시 시간을 재는 기준이다. */
  const openedAt = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (open) {
      // 이미 떠 있는데 다시 true 가 되어도 기준 시각을 새로 잡지 않는다(연속 실행).
      if (!visible) {
        openedAt.current = Date.now()
        setVisible(true)
      }
      return
    }

    if (!visible) return

    /*
      닫으라는 신호가 왔다. 최소 표시 시간이 남았으면 그만큼 기다렸다가 닫는다.
      ⚠ 타이머를 ref 에 둔다. 정리하지 않으면 언마운트 뒤에 setState 가 불린다.
    */
    const left = Math.max(0, minMs - (Date.now() - openedAt.current))
    timer.current = setTimeout(() => setVisible(false), left)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [open, visible, minMs])

  // 배경 스크롤 잠금. 팝업이 사라지면 반드시 되돌린다.
  useEffect(() => {
    if (!visible) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [visible])

  if (!visible) return null

  return (
    <div className="sim-backdrop" role="presentation">
      <div className="reco-progress" role="status" aria-live="polite">
        {/*
          ⚠ 동그라미 스피너를 쓰지 않는다. 이 화면이 만들어 내는 것은 **번호 여섯 개**이므로,
            기다리는 동안 보이는 것도 그 모양이라야 무엇을 기다리는지 알 수 있다.
          ⚠ `aria-hidden` 이다. 여섯 개의 빈 원을 하나씩 읽어 줄 이유가 없다. 상태는 아래
            문장이 전한다.
        */}
        <div className="reco-progress-balls" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <span key={i} style={{ animationDelay: `${i * 0.12}s` }} />
          ))}
        </div>

        <p className="reco-progress-text">{message}</p>
      </div>
    </div>
  )
}
