import { ADSENSE_SLOTS } from './env'

/**
 * 광고 단위 이름 ↔ 실제 애드센스 슬롯 ID, 그리고 **광고를 붙이지 않는 경로**.
 *
 * ── ⚠ 이 파일이 생긴 이유 ──────────────────────────────────────────
 * 2026-09-01 점검에서 **지금 상태로는 광고를 켜도 아무것도 나오지 않는다**는 것을 발견했다.
 * `<AdSlot slot="home-mid" />` 가 `data-ad-slot="home-mid"` 를 그대로 내보내고 있었는데,
 * 애드센스가 요구하는 값은 **대시보드에서 광고 단위를 만들 때 발급되는 10자리 숫자**다.
 * 사람이 읽는 이름은 애드센스에 아무 의미가 없다.
 *
 * 그렇다고 코드에 숫자를 박을 수는 없다 — 그 ID 는 **승인 후에야** 생긴다. 그래서 이름은
 * 코드에 두고(배치는 지금 정할 수 있다), **숫자는 환경변수로 받는다.**
 *
 * ── 넣는 방법 ──────────────────────────────────────────────────────
 * `.env_frontend` 에 한 줄로 적는다. 쉼표로 구분한 `이름=숫자` 목록이다.
 *
 *     NEXT_PUBLIC_ADSENSE_SLOTS=home-mid=1234567890,lotto-mid=2345678901
 *
 * ⚠ **슬롯마다 환경변수를 따로 두지 않는 이유**가 있다. Next.js 는 `process.env.NEXT_PUBLIC_X`
 *   라는 **정적 표현식 전체**를 빌드 시점에 문자열로 치환한다. `process.env[name]` 처럼
 *   동적으로 접근하면 치환이 일어나지 않아 브라우저에서 `undefined` 가 된다
 *   (→ lib/env.ts 주석). 변수 **하나**를 정적으로 읽고 그 문자열을 파싱하면 이 함정을 피한다.
 *
 * ⚠ **아직 안 채운 슬롯은 그 자리의 광고만 빠진다.** 하나만 먼저 넣어 시험해 볼 수 있다.
 */

/**
 * 코드가 쓰는 광고 자리 이름. **여기 없는 이름은 타입 오류**가 나므로 오타가 조용히
 * 넘어가지 않는다. 자리를 늘리려면 여기에 먼저 추가한다.
 */
export type AdSlotName =
  | 'home-mid'
  | 'lotto-mid'
  | 'recommend-bottom'
  | 'round-detail'
  | 'news-bottom'
  | 'video-detail'
  | 'playground-list'

/**
 * `이름=숫자,이름=숫자` 문자열을 표로 바꾼다.
 *
 * ⚠ 형식이 틀린 조각은 **조용히 버린다.** 환경변수 오타 하나로 사이트 전체가 죽는 것보다
 *   그 광고 하나가 안 뜨는 편이 낫다. 대신 개발 모드에서는 콘솔에 남긴다 — 아무 표시도
 *   없으면 왜 광고가 안 뜨는지 알아낼 방법이 없다.
 * ⚠ 애드센스 슬롯 ID 는 **숫자만** 이다. 숫자가 아니면 잘못 붙여 넣은 것이므로 버린다.
 */
function parseSlots(raw: string): Partial<Record<AdSlotName, string>> {
  const table: Partial<Record<AdSlotName, string>> = {}

  for (const chunk of raw.split(',')) {
    const trimmed = chunk.trim()
    if (!trimmed) continue

    const eq = trimmed.indexOf('=')
    if (eq === -1) {
      warn(`'${trimmed}' 에 '=' 가 없습니다. '이름=숫자' 형식이어야 합니다.`)
      continue
    }

    const name = trimmed.slice(0, eq).trim() as AdSlotName
    const id = trimmed.slice(eq + 1).trim()

    if (!/^\d+$/.test(id)) {
      warn(`'${name}' 의 값 '${id}' 가 숫자가 아닙니다. 애드센스 슬롯 ID 는 숫자입니다.`)
      continue
    }
    table[name] = id
  }

  return table
}

function warn(message: string): void {
  if (process.env.NODE_ENV !== 'production') {
    console.warn(`[ad-slots] NEXT_PUBLIC_ADSENSE_SLOTS: ${message}`)
  }
}

const SLOT_IDS = parseSlots(ADSENSE_SLOTS)

/** 그 자리의 실제 애드센스 슬롯 ID. 아직 안 채웠으면 `null` — 호출부는 렌더링하지 않는다. */
export function adSlotId(name: AdSlotName): string | null {
  return SLOT_IDS[name] ?? null
}

/**
 * **광고를 붙이지 않는 경로.**
 *
 * ⚠ 자동 광고는 로더 하나만 있으면 페이지 어디든 광고를 붙인다. 수동 슬롯을 두지 않는
 *   것만으로는 막히지 않으므로, 이 경로들에서는 **로더 자체를 렌더링하지 않는다**
 *   (→ components/analytics/AnalyticsScripts.tsx).
 *
 * 두 갈래다.
 *
 *   ① **정책 페이지** — 이용약관·개인정보처리방침·면책 고지·문의. 애드센스 심사가 존재를
 *      확인하는 페이지이고, 여기에 광고가 붙으면 "본문보다 광고가 많은 페이지" 로 읽힐
 *      소지가 있다. 무엇보다 개인정보처리방침에 광고 쿠키가 도는 것은 앞뒤가 맞지 않는다.
 *
 *   ② **본문이 얇은 페이지** — `/guide` 허브(1,060자)·`/contact`(1,054자). "콘텐츠 대비
 *      광고 과다" 판정의 표적이다. 대시보드에서 URL 을 제외하는 방법도 있지만, 코드에
 *      두면 **왜 뺐는지가 근거와 함께 남는다.**
 *
 * ⚠ **완전한 차단은 아니다.** 클라이언트 라우팅으로 다른 페이지에서 넘어오면 로더는 이미
 *   로드된 뒤다. 막히는 것은 **직접 진입**(검색·외부 링크·크롤러)이며, 애드센스 크롤러는
 *   URL 을 직접 방문하므로 심사 관점에서는 이쪽이 중요하다. 확실히 하려면 대시보드에서도
 *   같은 URL 을 제외한다.
 *
 * ⚠ `/guide` 는 **허브만** 이다. 하위 글(`/guide/lotto-rule` 등)은 본문이 충분하다.
 */
const AD_FREE_EXACT = new Set([
  '/terms',
  '/privacy',
  '/disclaimer',
  '/contact',
  '/guide',
])

/** 이 경로와 그 하위 전부에서 광고를 뺀다. 운영자 화면은 셸이 달라 여기 없어도 되지만, 안전망으로 둔다. */
const AD_FREE_PREFIX = ['/admin']

/** 이 경로에 광고를 붙여도 되는가. `pathname` 은 쿼리·해시가 없는 순수 경로여야 한다. */
export function isAdFreePath(pathname: string): boolean {
  // 끝의 슬래시를 지운다 — '/guide/' 와 '/guide' 가 다르게 판정되면 안 된다.
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  if (AD_FREE_EXACT.has(path)) return true

  /*
    ⚠ **놀이터는 목록에만 광고를 두고 게임 화면에는 두지 않는다.**
      캔버스와 '다시하기' 근처의 광고는 오클릭 유도로 읽힌다([[forbidden-expressions]] 의
      "다시 생성 버튼 주변에 광고를 배치하지 않는다" 와 같은 이유).

    ⚠ 이 규칙은 `AD_FREE_EXACT`·`AD_FREE_PREFIX` 두 목록으로 **표현할 수 없다.**
      "`/playground/` 로 시작하되 `/playground` 자체는 아님" 이기 때문이다. 그래서 여기에
      한 줄로 둔다(→ docs/wiki/20-design/playground.md 광고 절).

    ⚠ 승인 후 **자동 광고**를 켤 때 놀이터 상세를 대시보드에서도 제외해야 한다.
      `AdSenseLoader` 가 `(site)` 레이아웃 전체에 있어 코드로는 막히지 않는다.
  */
  if (path.startsWith('/playground/')) return true

  return AD_FREE_PREFIX.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}
