'use client'

import { useEffect, useRef, useState } from 'react'

import { SITE_NAME, SITE_URL } from '@/lib/env'
import { buildShareTextAll, copyText, downloadBlob, drawSetsImage, shareSets } from '@/lib/share'

type Action = 'copy' | 'image' | 'share'

/** 버튼이 스스로 결과를 말한다. 토스트를 띄우면 시선이 화면 구석으로 끌려간다. */
const FEEDBACK_MS = 1800

/**
 * 생성된 **모든 조합**을 한 번에 내보내는 버튼 묶음.
 *
 * 조합마다 붙는 `NumberActions` 는 그대로 둔다 — 마음에 드는 하나만 가져가려는 사람이
 * 훨씬 많다. 이 묶음은 "열 개 다 뽑았는데 하나씩 열 번 복사해야 하나" 를 없애려는 것이다.
 *
 * ⚠ 조합이 없으면 아무것도 그리지 않는다. 눌러도 할 일이 없는 버튼을 비활성 상태로
 *   띄워 두면 "왜 안 되지" 를 만든다.
 * ⚠ 아이콘·라벨·피드백 방식은 `NumberActions` 와 같아야 한다. 같은 일을 하는 두 묶음이
 *   화면에 같이 있으므로 모양이 다르면 다른 기능처럼 읽힌다.
 */
export function BulkActions({
  sets,
  strategyLabel,
  sourcePath = '/lotto/recommend',
}: {
  /** 조합들의 번호 배열. 빈 배열이면 렌더링하지 않는다. */
  sets: number[][]
  strategyLabel: string
  /** 공유 문구에 붙일 사이트 경로. `NumberActions` 와 같은 이유로 둔다. */
  sourcePath?: string
}) {
  const [busy, setBusy] = useState<Action | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 컴포넌트가 사라진 뒤 타이머가 setState 를 부르지 않게 한다.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  if (sets.length === 0) return null

  const flash = (text: string) => {
    setMessage(text)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setMessage(null), FEEDBACK_MS)
  }

  const params = { sets, strategyLabel, siteName: SITE_NAME, url: `${SITE_URL}${sourcePath}` }
  const count = sets.length

  const onCopy = async () => {
    setBusy('copy')
    const ok = await copyText(buildShareTextAll(params))
    setBusy(null)
    flash(ok ? `${count}조합을 복사했습니다` : '복사하지 못했습니다')
  }

  const onImage = async () => {
    setBusy('image')
    try {
      const blob = await drawSetsImage(params)
      if (!blob) throw new Error('이미지를 만들지 못했습니다')
      downloadBlob(blob, `행운상자-${strategyLabel}-${count}조합.png`)
      flash('이미지를 저장했습니다')
    } catch {
      flash('이미지를 저장하지 못했습니다')
    } finally {
      setBusy(null)
    }
  }

  const onShare = async () => {
    setBusy('share')
    // 이미지를 함께 보낼 수 있으면 보낸다. 실패해도 텍스트 공유는 계속된다.
    const image = await drawSetsImage(params).catch(() => null)
    const outcome = await shareSets({ ...params, image })
    setBusy(null)

    // 사용자가 공유 시트를 닫은 것은 실패가 아니다. 아무 말도 하지 않는다.
    if (outcome === 'cancelled') return
    flash(
      outcome === 'shared'
        ? '공유했습니다'
        : outcome === 'copied'
          ? '공유용 문구를 복사했습니다'
          : '공유하지 못했습니다',
    )
  }

  return (
    <div className="bulk-actions">
      <span className="bulk-actions-label">{count}조합 한 번에</span>

      <div className="bulk-actions-buttons">
        <button type="button" className="btn btn-secondary" onClick={onCopy} disabled={busy !== null}>
          <CopyIcon />
          <span>전체 복사</span>
        </button>

        {/*
          ⚠ 보이는 글자("이미지 저장")가 접근성 이름 안에 그 순서 그대로 들어 있어야 한다
            (WCAG 2.5.3). 그래서 aria-label 로 갈아 끼우지 않고 sr-only 로 덧붙인다.
        */}
        <button type="button" className="btn btn-secondary" onClick={onImage} disabled={busy !== null}>
          <ImageIcon />
          <span>{busy === 'image' ? '만드는 중…' : '이미지 저장'}</span>
          <span className="sr-only">전체 {count}조합</span>
        </button>

        <button type="button" className="btn btn-secondary" onClick={onShare} disabled={busy !== null}>
          <ShareIcon />
          <span>공유</span>
          <span className="sr-only">전체 {count}조합</span>
        </button>
      </div>

      {/* 복사는 화면을 바꾸지 않는다. 성공 여부를 문구로 알린다. 높이를 예약해 밀림을 막는다. */}
      <p className="action-feedback" aria-live="polite">
        {message}
      </p>
    </div>
  )
}

/* 아이콘 — NumberActions 와 같은 규격(24 격자, stroke 2, currentColor). */
const ICON = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

function CopyIcon() {
  return (
    <svg {...ICON}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h8" />
    </svg>
  )
}

function ImageIcon() {
  return (
    <svg {...ICON}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M21 16l-5-5-6 6" />
    </svg>
  )
}

function ShareIcon() {
  return (
    <svg {...ICON}>
      <path d="M12 3v13" />
      <path d="M8 7l4-4 4 4" />
      <path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
    </svg>
  )
}
