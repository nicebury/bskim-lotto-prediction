'use client'

/**
 * 추천 개수 고르기 — **[−] 5개 [+]** 와 그 아래 표 열 장.
 *
 * ── 왜 칩 열 개를 걷어냈나 ────────────────────────────────────────
 * 2026-09-17 사용자 지적: "난잡하다". 1~10 숫자 칩 열 개가 추첨 횟수 칸·기준 칩과 한 화면에
 * 겹치면 **숫자 버튼만 스무 개**가 되어 무엇이 무엇인지 흐려졌다. 개수는 '하나 더 / 하나 덜'
 * 로 조절하는 값이라 스테퍼가 맞다. 고른 개수는 **표 모양 칸이 채워지는 것**으로 한 번 더
 * 보여 준다 — 숫자를 읽지 않아도 "다섯 장 받는다" 가 보인다.
 *
 * ⚠ 표 칸은 장식이다(`aria-hidden`). 조작은 ± 버튼으로만 한다 — 칸 열 개를 버튼으로 만들면
 *   375px 에서 한 칸이 30px 이 되어 터치 타겟 44px 을 못 지킨다(frontend/CLAUDE.md).
 * ⚠ 상한·하한에서 버튼을 `disabled` 로 둔다. 눌러도 아무 일이 없는 버튼은 고장으로 읽힌다.
 * ⚠ 값은 `aria-live` 로 알린다. 버튼만 누르는 낭독기 사용자는 지금 몇 개인지 들어야 한다.
 */
export function CountStepper({
  value,
  onChange,
  min = 1,
  max = 10,
  disabled = false,
  labelId,
  unit = '개',
}: {
  value: number
  onChange: (next: number) => void
  min?: number
  max?: number
  disabled?: boolean
  /** 바깥 제목의 id. 버튼 묶음의 이름이 된다. */
  labelId: string
  unit?: string
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n))

  return (
    <div className="stepper" role="group" aria-labelledby={labelId}>
      <div className="stepper-row">
        <button
          type="button"
          className="stepper-btn"
          onClick={() => onChange(clamp(value - 1))}
          disabled={disabled || value <= min}
          aria-label="하나 줄이기"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M6 12h12" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </button>

        <output className="stepper-value" aria-live="polite">
          <strong>{value}</strong>
          <span>{unit}</span>
        </output>

        <button
          type="button"
          className="stepper-btn"
          onClick={() => onChange(clamp(value + 1))}
          disabled={disabled || value >= max}
          aria-label="하나 늘리기"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M6 12h12M12 6v12" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* 채워진 칸 = 받을 조합 수. 숫자를 읽지 않아도 양이 보이게. */}
      <div className="stepper-pips" aria-hidden="true">
        {Array.from({ length: max }, (_, i) => (
          <span key={i} data-on={i < value ? '' : undefined} />
        ))}
      </div>
    </div>
  )
}
