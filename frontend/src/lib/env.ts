/**
 * 환경변수를 읽는 **유일한 곳**.
 *
 * 모듈 여기저기서 process.env 를 직접 조회하지 않는다(→ docs/wiki/10-contracts/env-vars.md).
 * 오타 하나가 조용히 undefined 로 흘러 화면에만 빈 값이 뜨는 사고를 막으려는 규약이다.
 *
 * ── NEXT_PUBLIC_ 접두어의 의미 ────────────────────────────────
 * 접두어가 붙은 값은 빌드 시점에 **브라우저 번들에 문자열로 치환**된다. 누구나 볼 수 있고
 * 런타임에 바꿀 수 없다. 접두어가 없는 값(API_BASE_URL, *_SITE_VERIFICATION)은 서버
 * 컴포넌트·라우트 핸들러에서만 읽힌다 — 클라이언트 컴포넌트에서 읽으면 undefined 다.
 *
 * ⚠ Next.js 의 인라인 치환은 `process.env.NEXT_PUBLIC_X` 라는 **정적 표현식 전체**를
 *   문자열로 바꾼다. `process.env[key]` 처럼 동적 접근하면 치환되지 않아 브라우저에서
 *   undefined 가 된다. 그래서 아래는 전부 풀네임으로 한 번씩 적어 둔 것이다.
 */

/** 서버 컴포넌트가 백엔드를 부를 때 쓰는 주소. 내부망 호스트명일 수 있다. */
export const API_BASE_URL =
  process.env.API_BASE_URL ?? 'http://localhost:8005'

/** 브라우저가 백엔드를 직접 부를 때 쓰는 주소(추천 재생성·꿈해몽 등 CSR 호출). */
export const PUBLIC_API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8005'

/**
 * 사이트명. **하드코딩 금지** — 이 상수 하나만 쓴다.
 * 도메인이 아직 미확정이라 SITE_URL 은 로컬 폴백을 둔다. metadataBase 가 유효한 절대
 * URL 을 요구하므로 빈 문자열을 넘기면 빌드가 깨진다.
 */
export const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME || '행운상자'
export const SITE_URL = normalizeOrigin(
  process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
)

/**
 * 문의 연락처. 비어 있으면 /contact 와 /privacy 가 주소 대신 안내 문구를 보여준다.
 * 애드센스 심사는 연락 수단의 존재를 확인한다 — 승인 전에 채워야 한다.
 */
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || ''

/** 애널리틱스. 비어 있으면 스크립트를 아예 렌더링하지 않는다(→ 30-seo/analytics.md). */
export const GA_ID = process.env.NEXT_PUBLIC_GA_ID || ''
export const NAVER_ANALYTICS_ID = process.env.NEXT_PUBLIC_NAVER_ANALYTICS_ID || ''

/** 검색엔진 소유확인 메타태그. 서버에서만 읽는다(공개할 필요가 없다). */
export const GOOGLE_SITE_VERIFICATION = process.env.GOOGLE_SITE_VERIFICATION || ''
export const NAVER_SITE_VERIFICATION = process.env.NAVER_SITE_VERIFICATION || ''

/**
 * 애드센스 퍼블리셔 ID. **승인 전에는 비어 있어야 한다.**
 * 비면 AdSlot 이 null 을 반환하고 로더 스크립트도 렌더링되지 않는다.
 * → docs/wiki/30-seo/adsense-readiness.md
 */
export const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT || ''

/**
 * 광고 자리별 **실제 애드센스 슬롯 ID** 목록. `이름=숫자` 를 쉼표로 잇는다.
 *
 *     NEXT_PUBLIC_ADSENSE_SLOTS=home-mid=1234567890,lotto-mid=2345678901
 *
 * ⚠ 슬롯마다 환경변수를 따로 두지 않는다. 위 주석대로 `process.env` **동적 접근은 치환되지
 *   않으므로**, 변수 하나를 정적으로 읽고 파싱한다(→ lib/ad-slots.ts).
 * ⚠ 숫자 ID 는 **승인 후 대시보드에서 광고 단위를 만들어야** 나온다. 비어 있으면 그 자리의
 *   `AdSlot` 은 렌더링되지 않는다 — 잘못된 값으로 빈 상자를 만드는 것보다 낫다.
 */
export const ADSENSE_SLOTS = process.env.NEXT_PUBLIC_ADSENSE_SLOTS || ''

/**
 * `ads.txt` 에 쓸 퍼블리셔 ID. `ADSENSE_CLIENT`(`ca-pub-…`)에서 `ca-` 를 뗀 값이다.
 *
 * ⚠ **별도 환경변수를 두지 않는다.** 같은 값을 두 곳에 적게 하면 한쪽만 고치는 사고가 난다.
 * ⚠ 형식이 다르면 빈 문자열이다 — `/ads.txt` 는 그때 404 를 낸다. 틀린 ads.txt 를 올리면
 *   해당 광고 인벤토리가 통째로 무효가 되므로, **없는 편이 틀린 것보다 낫다.**
 */
export const ADSENSE_PUBLISHER_ID = /^ca-pub-\d+$/.test(ADSENSE_CLIENT)
  ? ADSENSE_CLIENT.slice('ca-'.length)
  : ''

/**
 * `.env_frontend` 의 SITE_URL 은 `https://<도메인>` 처럼 미확정 플레이스홀더가 들어 있을
 * 수 있다. 그대로 `new URL()` 에 넘기면 빌드가 죽으므로 파싱 가능한지 확인하고,
 * 불가능하면 로컬 오리진으로 되돌린다. 도메인이 확정되면 이 폴백은 그냥 쓰이지 않는다.
 */
function normalizeOrigin(raw: string): string {
  try {
    const url = new URL(raw)
    // '<도메인>' 같은 플레이스홀더는 호스트에 꺾쇠가 남는다 — 유효한 호스트가 아니다.
    if (url.hostname.includes('<') || url.hostname.includes('>')) {
      return 'http://localhost:3000'
    }
    return url.origin
  } catch {
    return 'http://localhost:3000'
  }
}

/** 절대 URL 조립. canonical·OG·JSON-LD 가 전부 이 함수를 쓴다. */
export function absoluteUrl(path: string): string {
  return new URL(path, SITE_URL).toString()
}
