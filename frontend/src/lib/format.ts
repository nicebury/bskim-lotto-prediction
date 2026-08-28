/**
 * 표시 포맷 유틸.
 *
 * 서버와 클라이언트가 **같은 문자열**을 만들어야 한다(hydration mismatch 방지).
 * 그래서 로케일 의존적인 `toLocaleDateString()` 대신 문자열을 직접 조립하고,
 * 숫자는 로케일이 고정된 Intl.NumberFormat('ko-KR') 인스턴스를 재사용한다.
 */

const NUMBER_FORMAT = new Intl.NumberFormat('ko-KR')

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'] as const

/** 수집 소스에 없는 값은 계약상 null 이다. 화면에는 '-' 로 표시한다. */
export const EMPTY = '-'

/** 1234567 → "1,234,567" */
export function formatNumber(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return EMPTY
  return NUMBER_FORMAT.format(value)
}

/** 2457819200 → "2,457,819,200원" */
export function formatWon(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return EMPTY
  return `${NUMBER_FORMAT.format(value)}원`
}

/**
 * 큰 금액을 사람이 읽는 단위로. 2457819200 → "약 24억 5,782만원"
 * 히어로·카드처럼 좁은 자리에서 자릿수 전체를 보여줄 수 없을 때만 쓴다.
 * 정확한 값이 필요한 표에는 formatWon 을 쓴다.
 */
export function formatWonShort(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return EMPTY
  const eok = Math.floor(value / 100_000_000)
  const man = Math.floor((value % 100_000_000) / 10_000)
  if (eok > 0) return man > 0 ? `약 ${eok}억 ${NUMBER_FORMAT.format(man)}만원` : `약 ${eok}억원`
  if (man > 0) return `약 ${NUMBER_FORMAT.format(man)}만원`
  return formatWon(value)
}

/**
 * "2026-07-04" → "2026.07.04 (토)"
 * Date 로 파싱하되 **UTC 기준**으로만 읽는다. `new Date('2026-07-04')` 는 UTC 자정으로
 * 해석되므로, 로컬 게터를 쓰면 UTC-x 타임존 브라우저에서 하루 전 날짜가 된다.
 */
export function formatDrawDate(iso: string | null | undefined): string {
  if (!iso) return EMPTY
  const date = new Date(`${iso.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return iso
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}.${m}.${d} (${WEEKDAY_KO[date.getUTCDay()]})`
}

/** "2026-07-08T10:00:00+09:00" → "2026.07.08" (뉴스 발행일) */
export function formatPubDate(iso: string | null | undefined): string {
  if (!iso) return EMPTY
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  // KST 로 시프트해 날짜를 읽는다. 발행일은 한국 기준으로 보여준다.
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000)
  const y = kst.getUTCFullYear()
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0')
  const d = String(kst.getUTCDate()).padStart(2, '0')
  return `${y}.${m}.${d}`
}

/** 두 자리 0 패딩. 카운트다운의 자리 흔들림을 막는다. */
export function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * 재생시간 초 → `3:45` / `1:02:03`.
 *
 * ⚠ 계약이 초를 그대로 주고 **포맷은 프론트가 한다**고 못박았다. 백엔드가 문자열로 주면
 *   화면마다 다른 표기를 만들 수 없기 때문이다.
 * ⚠ `null` 은 빈 문자열이다. "0:00" 으로 채우면 길이 0초인 영상처럼 보인다.
 */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || seconds < 0) return ''
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`
}

/**
 * 조회수 → `1.2만회` / `3,450회`.
 *
 * 만 단위로 줄이는 것은 한국어 화면의 관례다. 천 단위(K)는 우리말로 읽히지 않는다.
 * ⚠ `null` 은 빈 문자열이다. 조회수를 못 받은 것과 0회는 다르다.
 */
export function formatViews(views: number | null | undefined): string {
  if (views === null || views === undefined || views < 0) return ''
  if (views < 10000) return `${formatNumber(views)}회`
  const man = views / 10000
  // 10만 미만은 소수 첫째 자리까지. 그 위는 정수로 — "123.4만회" 는 읽기 어렵다.
  return man < 10 ? `${man.toFixed(1)}만회` : `${formatNumber(Math.round(man))}만회`
}
