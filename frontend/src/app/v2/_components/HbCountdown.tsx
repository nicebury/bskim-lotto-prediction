'use client'

/**
 * 다음 추첨까지 남은 시간 — /v2 전용.
 *
 * ⚠ 서버가 이 값을 렌더링할 수 없다. 페이지가 ISR 로 캐시되므로 서버가 찍은 "3시간 12분"
 *   은 한 시간 뒤에도 그대로 남는다. 그래서 서버 HTML 에는 자리표시자만 넣고 마운트 후
 *   브라우저 시각으로 채운다 — 서버/클라이언트 첫 렌더가 같아야 하이드레이션이 깨지지 않는다.
 *
 * 추첨 시각(drawTimeMs)은 KST 기준으로 **서버가 계산해** 넘긴다. 사용자의 타임존이
 * 무엇이든 추첨은 한국 시간에 일어난다(→ src/lib/lotto.ts).
 *
 * 기존 `components/Countdown.tsx` 와 로직은 같지만 클래스가 다르다. 기존 것은 라이트/다크에
 * 따라 뒤집히는 토큰에 묶여 있어 다크 고정 화면에서 쓸 수 없다.
 */

import { useEffect, useState } from 'react'

import { pad2 } from '@/lib/format'
import { splitDuration } from '@/lib/lotto'

export function HbCountdown({ drawTimeMs }: { drawTimeMs: number }) {
  const [remainMs, setRemainMs] = useState<number | null>(null)

  useEffect(() => {
    const tick = () => setRemainMs(drawTimeMs - Date.now())
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [drawTimeMs])

  // 자리표시자. 자릿수가 같아 값이 채워져도 폭이 흔들리지 않는다(tabular-nums).
  if (remainMs === null) {
    return (
      <span className="hb-count" aria-hidden="true">
        --:--:--
      </span>
    )
  }

  // 추첨 시각은 지났는데 결과가 아직 수집되지 않은 짧은 구간이 있다.
  if (remainMs <= 0) {
    return (
      <span className="hb-count" aria-live="polite">
        추첨 진행 중
      </span>
    )
  }

  const { days, hours, minutes, seconds } = splitDuration(remainMs)

  return (
    // 매초 바뀌는 값을 스크린리더가 계속 읽으면 방해가 된다. 사람이 필요한 정보(D-day·
    // 추첨 일시)는 옆의 <time> 이 이미 전달하므로 여기서는 숨긴다.
    <span className="hb-count" aria-hidden="true">
      {days > 0 && `${days}일 `}
      {pad2(hours)}:{pad2(minutes)}:{pad2(seconds)}
    </span>
  )
}
