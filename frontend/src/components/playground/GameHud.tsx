'use client'

import { LottoBall } from '@/components/LottoBall'
import type { GameMeta } from '@/games/core/types'

/**
 * 캔버스 밖 HUD — 진행 6칸과 상태 문구.
 *
 * ── ⚠ 왜 캔버스 밖인가 ─────────────────────────────────────────────
 * **캔버스 내부는 보조기술에 완전히 투명하다.** 그래서 상태를 전부 DOM 으로 뺀다.
 * 진행 칸을 캔버스에 그리면 화면을 보지 않는 사용자에게는 아무 일도 일어나지 않은 것이 된다.
 *
 * ⚠ 사이트의 `LottoBall` 을 그대로 쓴다 → "17번, 11~20 구간" 까지 읽힌다. 게임 안에서만
 *   쓰는 볼을 새로 만들면 그 정보가 사라진다.
 * ⚠ 아직 못 모은 칸은 **색이 아니라 문자**로 비어 있음을 알린다.
 */
export function GameHud({
  meta,
  awarded,
  status,
  hint,
  muted,
  onToggleMute,
}: {
  meta: GameMeta
  awarded: number[]
  status: string
  hint: string
  /** ⚠ **기본이 켜짐(음소거)이다.** 사용자가 누르기 전에는 아무 소리도 나지 않는다. */
  muted: boolean
  onToggleMute: () => void
}) {
  /** 오름차순으로 보여준다. 사이트의 다른 화면과 같다(획득 순서가 아니다). */
  const sorted = [...awarded].sort((a, b) => a - b)
  const empty = Math.max(0, 6 - sorted.length)

  return (
    <div className="pg-hud">
      <div className="pg-hud-top">
        <p className="pg-hud-label" id="pg-progress-label">
          모은 번호 <strong>{sorted.length}</strong> / 6
        </p>

        {/*
          ⚠ 음소거 버튼은 **없으면 안 된다.** iOS 무음 스위치는 웹 오디오에 일관되게 적용되지
            않아, 기기 스위치를 믿고 버튼을 생략하면 끌 방법이 없는 사용자가 생긴다.
          ⚠ `aria-pressed` 로 현재 상태를 읽어 준다. 아이콘만으로는 켜짐/꺼짐을 알 수 없다.
        */}
        <button
          type="button"
          className="pg-sound-toggle"
          onClick={onToggleMute}
          aria-pressed={!muted}
          aria-label={muted ? '효과음 켜기' : '효과음 끄기'}
        >
          <SpeakerIcon muted={muted} />
          <span>{muted ? '소리 켜기' : '소리 끄기'}</span>
        </button>
      </div>

      <ul className="pg-hud-balls" aria-labelledby="pg-progress-label">
        {sorted.map((n) => (
          <li key={n}>
            <LottoBall number={n} />
          </li>
        ))}
        {Array.from({ length: empty }, (_, i) => (
          <li key={`empty-${i}`} className="pg-hud-empty">
            <span className="sr-only">아직 모으지 않은 자리</span>
            <span aria-hidden="true">·</span>
          </li>
        ))}
      </ul>

      {/*
        ⚠ **획득을 소리로도 알린다.** `aria-live="polite"` 라 진행을 방해하지 않으면서
          "세 번째 번호 17번을 모았습니다" 가 읽힌다.
        ⚠ 빈 문자열일 때도 요소를 지우지 않는다 — 지웠다 만들면 스크린리더가 갱신을 놓친다.
      */}
      <p className="pg-hud-status" role="status" aria-live="polite">
        {status}
      </p>

      {hint !== '' && <p className="pg-hud-hint">{hint}</p>}

      {/*
        ⚠ 키보드 조작 안내는 **항상 노출한다**(숨기지 않는다). 캔버스에 포커스가 갔을 때
          무엇을 눌러야 하는지 알 방법이 이것뿐이다(→ playground.md 접근성 절).
      */}
      <p className="pg-hud-keys">{meta.keyGuide}</p>
    </div>
  )
}

/** 스피커 글리프. 옆에 글자가 함께 있으므로 접근성 트리에서는 숨긴다. */
function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M11 5 6 9H3v6h3l5 4V5Z" />
      {muted ? (
        <path d="m16 9 5 6M21 9l-5 6" />
      ) : (
        <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
      )}
    </svg>
  )
}
