'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

/**
 * 돌아가기.
 *
 * ⚠ **`router.back()` 이다.** 브라우저 뒤로가기와 같은 동작이라야 사용자가 혼동하지 않고,
 *   무엇보다 **뽑아 둔 번호가 있는 화면으로** 돌아간다(그 화면은 `sessionStorage` 에서
 *   결과를 되살린다 → lib/reco-store.ts).
 *
 * ⚠ **직접 들어온 경우에는 뒤로 갈 곳이 없다.** 링크를 받았거나 새 탭으로 연 경우다.
 *   그때 `router.back()` 을 부르면 사이트 밖으로 나가거나 아무 일도 일어나지 않는다.
 *   `history.length` 로 판단해 추천 화면으로 보내는 링크를 대신 낸다.
 *
 * ⚠ `history.length` 는 **브라우저에서만** 읽을 수 있다. 서버 렌더에서는 알 수 없으므로
 *   첫 렌더는 링크(안전한 쪽)로 두고 마운트 뒤에 판단한다 — 반대로 두면 서버와 클라이언트가
 *   어긋나 hydration 경고가 난다.
 */
export function AnalyzeBack() {
  const router = useRouter()
  const [canGoBack, setCanGoBack] = useState(false)

  useEffect(() => {
    setCanGoBack(window.history.length > 1)
  }, [])

  if (!canGoBack) {
    return (
      <p className="analyze-back">
        <Link className="btn btn-secondary" href="/lotto/recommend">
          번호추천으로 가기
        </Link>
      </p>
    )
  }

  return (
    <p className="analyze-back">
      <button type="button" className="btn btn-secondary" onClick={() => router.back()}>
        돌아가기
      </button>
    </p>
  )
}
