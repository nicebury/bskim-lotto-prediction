'use client'

import { Modal } from './Modal'

/**
 * 번호 생성 진행 대화상자.
 *
 * 단계 문구는 시간에 따라 바뀐다(0s → 1s → 2s → 완료). 백엔드가 그보다 빨리 답해도 단계를
 * 건너뛰지 않고, 늦게 답하면 완료 단계에서 기다린다 — 진행 표시가 거짓말을 하면 안 된다.
 *
 * 진행 중에는 닫기 버튼이 없다. 실패했을 때만 닫을 수 있다.
 */
export const GENERATE_STEPS = [
  '번호 생성을 준비합니다',
  '생성을 시작합니다',
  '번호를 조합합니다',
  '추천번호가 생성되었습니다',
] as const

/** 각 단계로 넘어가는 시각(ms). 마지막 단계는 결과가 도착한 뒤에만 표시한다. */
export const STEP_AT_MS = [0, 1000, 2000, 3000] as const
/** 완료 문구를 보여준 뒤 대화상자가 사라지기까지. */
export const CLOSE_DELAY_MS = 500

export function GenerateProgress({
  step,
  error,
  onClose,
}: {
  /** 0 ~ 3. GENERATE_STEPS 의 인덱스. */
  step: number
  error?: string | null
  /** 실패했을 때만 준다 — 진행 중에는 닫을 수 없다. */
  onClose?: () => void
}) {
  const done = step >= GENERATE_STEPS.length - 1
  const percent = error ? 100 : ((step + 1) / GENERATE_STEPS.length) * 100

  return (
    <Modal
      title={error ? '번호를 생성하지 못했습니다' : '추천 번호 생성'}
      onClose={error ? onClose : undefined}
      dismissible={false}
    >
      <div className="generate-progress">
        {error ? (
          <p className="generate-error">{error}</p>
        ) : (
          <>
            {/* 진행 막대. 값은 aria 로도 전달한다 — 색과 길이만으로 알리지 않는다. */}
            <div
              className="progress-track"
              role="progressbar"
              aria-valuenow={Math.round(percent)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="번호 생성 진행률"
            >
              <span className="progress-fill" style={{ width: `${percent}%` }} />
            </div>

            {/* 문구가 바뀔 때마다 스크린리더가 읽는다. */}
            <p className="generate-step" aria-live="polite">
              {done && (
                <span className="generate-check" aria-hidden="true">
                  ✓
                </span>
              )}
              {GENERATE_STEPS[Math.min(step, GENERATE_STEPS.length - 1)]}
            </p>
          </>
        )}
      </div>
    </Modal>
  )
}
