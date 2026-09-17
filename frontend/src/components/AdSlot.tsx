'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'

import { adSlotId, isAdFreePath, type AdSlotName } from '@/lib/ad-slots'
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
 * ── ⚠ 렌더링하지 않는 조건이 셋이다 ────────────────────────────────
 *   ① 퍼블리셔 ID(`NEXT_PUBLIC_ADSENSE_CLIENT`)가 없다 — 승인 전.
 *   ② **이 자리의 실제 슬롯 ID 가 없다** — `NEXT_PUBLIC_ADSENSE_SLOTS` 에 아직 안 넣었다.
 *   ③ 광고를 붙이지 않기로 한 경로다(정책 페이지·얇은 페이지 → lib/ad-slots.ts).
 *
 * ②가 2026-09-01 에 고친 **실제 버그**다. 예전에는 `slot` 으로 받은 사람이 읽는 이름
 * (`"home-mid"`)을 `data-ad-slot` 에 그대로 내보냈는데, 애드센스가 요구하는 값은 대시보드가
 * 발급하는 **10자리 숫자**다. 그대로 켰다면 광고가 한 개도 나오지 않았을 것이고, 원인이
 * 코드 어디에도 드러나지 않아 찾기 어려웠을 것이다.
 *
 * ⚠ 예전에는 미승인 상태에서도 `min-height` 로 자리를 예약했다. CLS 를 막으려는 의도였지만
 *   **틀린 규칙이었다.** 광고가 없으면 늦게 도착할 것도 없어 CLS 가 발생하지 않는다.
 *   남는 것은 콘텐츠 사이의 200px 짜리 빈 구멍뿐이고, 승인은 몇 달 뒤일 수 있다.
 *   실제로 이 예약이 홈의 "주요 통계 ↔ 오늘의 추천 번호" 사이를 벌려 놓았다.
 *
 * 배치 규칙: "다시 생성" 버튼 주변에 두지 않는다(오클릭 유도로 읽힌다). "준비 중"
 * 페이지에는 아예 배치하지 않는다.
 *
 * ⚠ 훅은 early return 앞에 모아 둔다. 렌더링 여부만 분기하고 호출 순서는 항상 같아야 한다.
 */
export function AdSlot({ slot }: { slot: AdSlotName }) {
  const pathname = usePathname()
  /*
    ⚠ 한 번 밀어 넣은 슬롯을 다시 밀지 않는다. `push({})` 는 "DOM 에서 아직 안 채워진
      ins 를 채워라" 는 신호인데, 이미 채워진 것에 다시 부르면 애드센스가 콘솔에 오류를
      남긴다(개발 모드 StrictMode 는 effect 를 두 번 돌린다).
  */
  const pushed = useRef(false)

  const slotId = adSlotId(slot)
  const adFree = isAdFreePath(pathname)
  const visible = Boolean(ADSENSE_CLIENT) && slotId !== null && !adFree

  useEffect(() => {
    if (!visible || pushed.current) return
    pushed.current = true
    try {
      ;(window.adsbygoogle = window.adsbygoogle || []).push({})
    } catch {
      /* 애드블록·스크립트 차단 환경에서 실패한다. 광고가 없을 뿐 페이지는 정상이다. */
    }
  }, [visible])

  // 위 세 조건 중 하나라도 걸리면 완전 미렌더링. DOM 에 흔적을 남기지 않는다.
  if (!visible) return null

  return (
    /*
      ⚠ `<aside>` + `aria-label` 로 **광고임을 알린다.** 광고는 iframe 안에 들어가 스크린
        리더가 내용을 읽지 못하므로, 바깥에서 무엇인지 말해 주지 않으면 정체불명의 빈 영역이
        된다. 랜드마크가 되어 "건너뛰기" 대상으로도 잡힌다.
      ⚠ 눈에 보이는 '광고' 글자도 함께 둔다. 애드센스 정책은 라벨을 **'광고'·'스폰서 링크'
        로만** 허용한다 — '추천'·'관련 정보' 처럼 콘텐츠로 오인시키는 문구는 위반이다.
    */
    <aside className="ad-slot" aria-label="광고">
      <span className="ad-slot-label" aria-hidden="true">
        광고
      </span>
      <ins
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={slotId}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </aside>
  )
}
