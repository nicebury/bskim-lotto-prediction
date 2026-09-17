'use client'

import { useEffect, useRef, useState } from 'react'

// SITE_NAME·SITE_URL 은 NEXT_PUBLIC_* 기반이라 브라우저 번들에 인라인된다.
// 같은 파일의 서버 전용 값(API_BASE_URL 등)은 여기서 참조하지 않으므로 유출되지 않는다.
import { SITE_NAME, SITE_URL } from '@/lib/env'
import { analyzeHref } from '@/lib/reco-store'
import { buildShareText, copyText, downloadBlob, drawNumbersImage, shareNumbers } from '@/lib/share'
import { AdBreakLink } from './AdBreakLink'

type Action = 'copy' | 'image' | 'share'

/** 버튼이 스스로 결과를 말한다. 토스트를 띄우면 시선이 화면 구석으로 끌려간다. */
const FEEDBACK_MS = 1800

/**
 * 추천 번호 내보내기 버튼 묶음 — 복사 · 이미지 저장 · 공유.
 *
 * `compact` 를 켜면 세 버튼을 3열로 균등하게 눕히고 라벨을 두 글자로 줄인다(복사·저장·공유).
 * 홈 캐러셀 카드는 폭이 280px 이라 "이미지 저장" 이 들어가지 않는다. 짧은 라벨이 무엇을
 * 뜻하는지는 아이콘이 거들고, 스크린리더에는 `aria-label` 로 온전한 이름을 준다.
 *
 * 피드백은 버튼 아래에서 낸다. `aria-live` 로 스크린리더에도 알린다 — 복사는 화면에 아무
 * 변화도 만들지 않아 성공했는지 알 방법이 없다.
 */
export function NumberActions({
  numbers,
  strategyLabel,
  subtitle,
  compact = false,
  sourcePath = '/lotto/recommend',
  showAnalyze = true,
}: {
  numbers: number[]
  strategyLabel: string
  /** 조합 성향 한 줄. 저장 이미지에 함께 그린다. */
  subtitle?: string
  /** 좁은 카드용. 3열 균등 배치 + 짧은 라벨. */
  compact?: boolean
  /**
   * 공유 문구에 붙일 사이트 경로.
   * ⚠ 이 번호가 **어느 화면에서 나왔는지** 가리켜야 한다. 꿈해몽 번호를 공유했는데
   *   링크가 번호추천으로 가면 받은 사람이 같은 결과를 찾을 수 없다.
   */
  sourcePath?: string
  /**
   * '분석' 버튼을 낼지.
   *
   * ⚠ **분석 화면에서는 꺼야 한다.** 거기서 이 버튼은 자기 자신으로 가는 링크이고,
   *   눌러도 아무 일이 일어나지 않아 고장으로 읽힌다(자기 자신으로 가는 링크를 만들지
   *   않는 것은 `StatNav` 가 현재 항목을 `<div>` 로 내는 것과 같은 규칙이다).
   */
  showAnalyze?: boolean
}) {
  const [busy, setBusy] = useState<Action | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 컴포넌트가 사라진 뒤 타이머가 setState 를 부르지 않게 한다.
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const flash = (text: string) => {
    setMessage(text)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setMessage(null), FEEDBACK_MS)
  }

  const shareParams = {
    numbers,
    strategyLabel,
    subtitle,
    siteName: SITE_NAME,
    url: `${SITE_URL}${sourcePath}`,
  }

  const onCopy = async () => {
    setBusy('copy')
    const ok = await copyText(buildShareText(shareParams))
    setBusy(null)
    flash(ok ? '번호를 복사했습니다' : '복사하지 못했습니다')
  }

  const onImage = async () => {
    setBusy('image')
    try {
      const blob = await drawNumbersImage(shareParams)
      if (!blob) throw new Error('이미지를 만들지 못했습니다')
      downloadBlob(blob, `행운상자-${strategyLabel}-${numbers.join('-')}.png`)
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
    const image = await drawNumbersImage(shareParams).catch(() => null)
    const outcome = await shareNumbers({ ...shareParams, image })
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
    /*
      ⚠ 격자 열 수를 **실제 버튼 수에 맞춘다.** 넷짜리 격자에 셋만 두면 마지막 칸이 비어
        버튼들이 왼쪽으로 몰린다. `data-cols` 를 CSS 가 읽는다.
    */
    <div
      className={`number-actions${compact ? ' is-compact' : ''}`}
      data-cols={showAnalyze ? 4 : 3}
    >
      {/*
        ── 분석 (2026-09-02 사용자 요청) ──────────────────────────
        ⚠ **넷 가운데 유일하게 색을 준다.** 나머지 셋은 번호를 밖으로 내보내는 도구이고,
          분석만 **사이트 안으로 더 들어가는 문**이다. 성격이 다르므로 생김새도 달라야 한다.
        ⚠ **버튼이 아니라 링크다.** 새 탭으로 열기와 주소 복사가 되어야 하고, 스크린리더도
          "이동" 으로 읽어야 한다. `<button>` 으로 만들고 `router.push` 를 부르면 셋 다 잃는다.
        ⚠ `AdBreakLink` 인 이유: 광고를 켜면 이 이동이 문서를 새로 불러온다. 사용자가 전면
          광고를 원한 자리가 **정확히 여기**다("분석을 눌러 페이지가 이동하면").
          광고가 꺼져 있는 지금은 평범한 `<Link>` 와 완전히 같이 동작한다.
        ⚠ `aria-label` 이 보이는 글자("분석")를 품는다 — WCAG 2.5.3(Label in Name).
      */}
      {showAnalyze && (
        <AdBreakLink
          href={analyzeHref(numbers)}
          className="action-btn is-analyze"
          aria-label={`${strategyLabel} 번호 분석`}
        >
          <ChartIcon />
          <span>분석</span>
        </AdBreakLink>
      )}

      <button
        type="button"
        className="action-btn"
        onClick={onCopy}
        disabled={busy !== null}
        aria-label={`${strategyLabel} 번호 복사`}
      >
        <CopyIcon />
        <span>복사</span>
      </button>

      {/*
        ⚠ aria-label 은 화면에 보이는 글자("이미지 저장" / compact 면 "저장")를 **그대로
        품고 있어야** 한다(WCAG 2.5.3 Label in Name). 음성으로 "이미지 저장" 이라고 말하는
        사용자는 보이는 글자를 읽어서 말하는데, 접근성 이름이 "이미지로 저장" 이면 조사 하나
        때문에 그 명령이 이 버튼에 닿지 않는다. 실제로 걸렸다(Lighthouse
        `label-content-name-mismatch`, 2026-08-21). '로' 를 빼서 두 표기를 일치시켰다.
        ⚠ <span> 문구를 바꾸면 이 라벨도 함께 고친다.
      */}
      <button
        type="button"
        className="action-btn"
        onClick={onImage}
        disabled={busy !== null}
        aria-label={`${strategyLabel} 번호 저장`}
      >
        <ImageIcon />
        {/*
          ⚠ **넷이 한 줄에 서야 하므로 라벨을 두 글자로 통일했다**(2026-09-02 사용자 요청).
            "이미지 저장" 만 네 글자라 넷 중 하나가 튀어 줄이 깨졌다. `aria-label` 은 온전한
            이름을 유지하되, **보이는 글자를 그대로 품는다** — WCAG 2.5.3(Label in Name).
            음성으로 "저장" 이라고 말하는 사용자에게 닿아야 한다.
        */}
        <span>{busy === 'image' ? '만드는 중…' : '저장'}</span>
      </button>

      <button
        type="button"
        className="action-btn"
        onClick={onShare}
        disabled={busy !== null}
        aria-label={`${strategyLabel} 번호 공유`}
      >
        <ShareIcon />
        <span>공유</span>
      </button>

      {/*
        복사는 화면을 바꾸지 않는다. 성공했는지 알 방법이 없으므로 문구로 알린다.
        높이를 예약해 문구가 뜰 때 레이아웃이 밀리지 않게 한다.
      */}
      <p className="action-feedback" aria-live="polite">
        {message}
      </p>
    </div>
  )
}

const ICON = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

/**
 * 분석 아이콘 — 막대 셋.
 * ⚠ 같은 파일의 다른 아이콘과 **같은 규격**(24 격자, `currentColor`)이다. 규격이 어긋나면
 *   한 줄에 놓인 네 아이콘의 굵기가 제각각으로 보인다.
 */
function ChartIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20h16" />
      <path d="M7 20v-6" />
      <path d="M12 20V7" />
      <path d="M17 20v-9" />
    </svg>
  )
}

function CopyIcon() {
  return (
    <svg {...ICON}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  )
}

function ImageIcon() {
  return (
    <svg {...ICON}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="m4 17 5-5 4 4 3-2 4 4" />
    </svg>
  )
}

function ShareIcon() {
  return (
    <svg {...ICON}>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
    </svg>
  )
}
