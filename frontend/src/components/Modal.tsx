'use client'

import { useId, useRef, type ReactNode } from 'react'

import { useModalBehavior } from './useModalBehavior'

/**
 * 화면 중앙에 뜨는 대화상자.
 *
 * `dismissible=false` 면 **배경을 눌러도 닫히지 않는다.** 닫기 버튼(또는 Esc)으로만 닫는다.
 * Esc 는 어떤 경우에도 막지 않는다 — 키보드 사용자가 대화상자에 갇히면 안 된다.
 *
 * 진행 중 상태(번호 생성)에는 닫기 버튼 자체를 숨긴다. 그때는 호출부가 `onClose` 를
 * 넘기지 않는다.
 */
export function Modal({
  title,
  children,
  onClose,
  dismissible = true,
  labelledBy,
}: {
  /** 대화상자 제목. 스크린리더가 열릴 때 읽는다. */
  title: string
  children: ReactNode
  /** 없으면 닫기 버튼을 그리지 않는다(진행 중 대화상자). */
  onClose?: () => void
  /** 배경 클릭으로 닫을 수 있는가. */
  dismissible?: boolean
  labelledBy?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const autoId = useId()
  const titleId = labelledBy ?? `${autoId}-title`

  // 닫을 수 없는 대화상자에서도 Esc 는 살려 둔다. onClose 가 없으면 아무 일도 하지 않는다.
  useModalBehavior(ref, onClose ?? (() => {}))

  return (
    <>
      <div
        className="modal-backdrop"
        onClick={dismissible ? onClose : undefined}
        aria-hidden="true"
      />
      <div className="modal-wrap">
        <div
          ref={ref}
          className="modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <div className="modal-head">
            <h2 id={titleId}>{title}</h2>
            {onClose && (
              <button type="button" className="icon-btn" aria-label="닫기" onClick={onClose}>
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            )}
          </div>

          <div className="modal-body">{children}</div>

          {onClose && (
            <div className="modal-foot">
              <button type="button" className="btn btn-primary" onClick={onClose}>
                닫기
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
