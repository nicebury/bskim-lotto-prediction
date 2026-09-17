import { ADSENSE_PUBLISHER_ID } from '@/lib/env'

/**
 * `/ads.txt` — 이 사이트의 광고 인벤토리를 **누가 팔 수 있는지** 선언하는 파일.
 *
 * ── 왜 필요한가 ────────────────────────────────────────────────────
 * IAB 표준이다. 이 파일이 없으면 광고주 쪽 구매 도구가 "이 사이트의 광고를 파는 주체가
 * 확인되지 않는다" 고 보아 **입찰을 걸러 낸다.** 광고가 아예 안 나오는 것은 아니지만 단가가
 * 떨어지고, 애드센스 대시보드에 "수익이 심각하게 감소할 수 있습니다" 경고가 뜬다.
 * 승인 직후 가장 먼저 확인받는 항목 중 하나다.
 *
 * ── ⚠ 왜 정적 파일(`public/ads.txt`)이 아니라 라우트인가 ────────────
 * 퍼블리셔 ID 를 **코드에 박지 않기 위해서**다. 그 값은 승인 후에야 나오고, `.env_frontend`
 * 에 이미 `NEXT_PUBLIC_ADSENSE_CLIENT` 로 들어간다. 같은 값을 `public/ads.txt` 에 한 번 더
 * 적어 두면 **한쪽만 고치는 사고**가 난다 — 그때 ads.txt 가 틀린 채로 남고, 틀린 ads.txt 는
 * 없는 것보다 나쁘다(선언되지 않은 판매자로 취급되어 인벤토리가 통째로 무효가 된다).
 *
 * 그래서 환경변수 하나에서 파생시킨다. 승인 전에는 **404** 다 — 빈 파일이나 자리표시자를
 * 내보내면 크롤러가 "잘못된 ads.txt" 로 기록한다.
 *
 * ⚠ `f08c47fec0942fa0` 은 **구글의 고정 TAG ID** 다(오타가 아니다). 모든 사이트가 같은 값을
 *   쓴다 — 우리 계정 정보가 아니라 '구글이라는 판매자' 를 가리키는 공개 식별자다.
 * ⚠ 형식은 `도메인, 퍼블리셔ID, 관계, TAG ID` 이고 **`pub-` 로 시작한다.** `ca-pub-` 이
 *   아니다 — 광고 코드에 쓰는 값과 접두어가 다르다. `ADSENSE_PUBLISHER_ID` 가 이 변환을
 *   한곳에서 처리한다.
 * ⚠ 다른 광고 네트워크를 붙이면 **줄을 추가**한다. 새 줄이 기존 줄을 대체하지 않는다.
 */

/** 정적으로 생성한다 — 내용이 요청마다 달라질 이유가 없다. */
export const dynamic = 'force-static'

export function GET(): Response {
  // 승인 전. 자리표시자를 내보내는 것보다 없는 편이 낫다.
  if (!ADSENSE_PUBLISHER_ID) {
    return new Response('Not Found', { status: 404 })
  }

  const body = `google.com, ${ADSENSE_PUBLISHER_ID}, DIRECT, f08c47fec0942fa0\n`

  return new Response(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      // 크롤러가 하루에 한 번쯤 다시 보면 충분하다. 자주 바뀌는 파일이 아니다.
      'cache-control': 'public, max-age=86400',
    },
  })
}
