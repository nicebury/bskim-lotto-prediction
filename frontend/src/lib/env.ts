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
