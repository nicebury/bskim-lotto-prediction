'use client'

import { useEffect, useState } from 'react'

import { pad2 } from '@/lib/format'
import { splitDuration } from '@/lib/lotto'

/**
 * 다음 추첨까지 남은 시간 카운트다운.
 *
 * ⚠ 서버는 이 값을 렌더링할 수 없다. 페이지가 ISR 로 캐시되므로 서버가 찍은 "3시간 12분"은
 *   한 시간 뒤에도 그대로 남는다. 그래서 서버 HTML 에는 자리표시자만 넣고, 마운트 후
 *   브라우저 시각으로 채운다. 서버/클라이언트 첫 렌더가 같아야 hydration 이 깨지지 않는다.
 *
 * 추첨 시각 자체(drawTimeMs)는 KST 기준으로 서버가 계산해 넘긴다 — 사용자의 브라우저
 * 타임존이 무엇이든 추첨은 한국 시간에 일어난다(→ lib/lotto.ts).
 */
export function Countdown({ drawTimeMs }: { drawTimeMs: number }) {
  const [remainMs, setRemainMs] = useState<number | null>(null)

  useEffect(() => {
    const tick = () => setRemainMs(drawTimeMs - Date.now())
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [drawTimeMs])

  // 자리표시자. 고정 높이(.countdown-value)라 값이 채워져도 레이아웃이 밀리지 않는다.
  if (remainMs === null) {
    return (
      <span className="countdown-value" aria-hidden="true">
        --일 --:--:--
      </span>
    )
  }

  // 추첨 시각이 지났는데 아직 결과가 수집되지 않은 짧은 구간이 있다.
  if (remainMs <= 0) {
    return (
      <span className="countdown-value" aria-live="polite">
        추첨 진행 중
      </span>
    )
  }

  const { days, hours, minutes, seconds } = splitDuration(remainMs)

  return (
    // 매초 바뀌는 값을 스크린리더가 계속 읽으면 방해가 된다. aria-hidden 으로 숨기고,
    // 사람이 필요한 정보(D-day·추첨 일시)는 옆의 <time> 요소가 이미 전달한다.
    <span className="countdown-value" aria-hidden="true">
      {days > 0 && `${days}일 `}
      {pad2(hours)}:{pad2(minutes)}:{pad2(seconds)}
    </span>
  )
}
