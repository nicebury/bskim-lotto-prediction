'use client'

import { useEffect } from 'react'

import { ADSENSE_CLIENT } from '@/lib/env'

declare global {
  interface Window {
    adsbygoogle?: unknown[]
  }
}

/**
 * 광고 슬롯.
 *
 * **애드센스 승인 전에는 아무것도 렌더링하지 않는다.** `NEXT_PUBLIC_ADSENSE_CLIENT` 가
 * 비어 있으면 광고 코드도, 빈 자리도 만들지 않는다.
 * → docs/wiki/30-seo/adsense-readiness.md
 *
 * ⚠ 예전에는 미승인 상태에서도 `min-height` 로 자리를 예약했다. CLS 를 막으려는 의도였지만
 *   **틀린 규칙이었다.** 광고가 없으면 늦게 도착할 것도 없어 CLS 가 발생하지 않는다.
 *   남는 것은 콘텐츠 사이의 200px 짜리 빈 구멍뿐이고, 승인은 몇 달 뒤일 수 있다. 승인 시점에는
 *   어차피 환경변수를 넣고 다시 빌드하므로 그때 자리가 생긴다.
 *   실제로 이 예약이 홈의 "주요 통계 ↔ 오늘의 추천 번호" 사이를 벌려 놓았다.
 *
 * 배치 규칙: "다시 생성" 버튼 주변에 두지 않는다(오클릭 유도로 읽힌다). "준비 중"
 * 페이지에는 아예 배치하지 않는다.
 *
 * ⚠ useEffect 를 early return 뒤에 두면 Hooks 규칙 위반이다. 훅은 항상 같은 순서로
 *   호출하고, 렌더링 여부만 분기한다.
 */
export function AdSlot({ slot }: { slot: string }) {
  useEffect(() => {
    if (!ADSENSE_CLIENT) return
    try {
      ;(window.adsbygoogle = window.adsbygoogle || []).push({})
    } catch {
      /* 애드블록·스크립트 차단 환경에서 실패한다. 광고가 없을 뿐 페이지는 정상이다. */
    }
  }, [])

  // 승인 전: 완전 미렌더링. DOM 에 흔적을 남기지 않는다.
  if (!ADSENSE_CLIENT) return null

  return (
    <div className="ad-slot">
      <ins
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  )
}
