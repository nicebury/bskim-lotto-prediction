/**
 * 백엔드 REST 클라이언트 (서버 컴포넌트 전용 함수 + 브라우저 전용 함수).
 *
 * ── 설계 의도 ────────────────────────────────────────────────
 * 1) **백엔드가 죽어 있어도 빌드와 렌더가 통과해야 한다.**
 *    세 세션이 병렬로 개발하므로 프론트를 빌드하는 시점에 백엔드가 없을 수 있다.
 *    서버 컴포넌트에서 fetch 가 throw 하면 정적 생성 전체가 실패한다. 그래서 모든
 *    조회 함수는 실패 시 예외 대신 `null`(목록은 빈 배열)을 반환하고, 화면은 폴백
 *    문구를 렌더링한다. 실패를 조용히 삼키지 않도록 서버 콘솔에는 경고를 남긴다.
 *
 * 2) **서버용 주소와 브라우저용 주소를 섞지 않는다.**
 *    서버 컴포넌트는 API_BASE_URL(내부망), 브라우저는 NEXT_PUBLIC_API_BASE_URL(공개).
 *    이 파일에서 `browser` 접두어가 붙은 함수만 후자를 쓴다.
 *
 * 3) **비즈니스 계산을 하지 않는다.** 빈도·패턴·HOT/COLD 를 브라우저에서 다시 집계하면
 *    서버와 숫자가 달라지고 어느 쪽이 맞는지 아무도 모르게 된다.
 *    → docs/wiki/10-contracts/component-boundaries.md
 */

import { API_BASE_URL, PUBLIC_API_BASE_URL } from './env'
import type {
  DreamKeyword,
  DreamKeywordList,
  DreamResult,
  FrequencyResult,
  HotColdResult,
  NewsItem,
  NewsPeriod,
  NumberStat,
  Paged,
  PairsResult,
  PatternResult,
  RangeMeta,
  RecommendResult,
  RecommendStrategy,
  Round,
  RoundDetail,
  RoundIndex,
  SitemapEntries,
  StatQuery,
  StatWindow,
  VideoDetail,
  VideoGame,
  VideoItem,
  VideoKind,
} from './api-types'

/** 백엔드가 응답하지 않을 때 페이지 렌더를 더 기다리지 않는다. 빌드가 멈추면 안 된다. */
const TIMEOUT_MS = 5_000

/**
 * 번호 추천은 **계산**이라 조회보다 오래 걸린다. `ensemble` 은 몬테카를로 50,000회
 * 시뮬레이션이다. 단독으로는 2.6초지만 동시에 두 개가 겹치면 16.4초가 걸린다(실측).
 * 정적 생성 시점에는 홈(전략 5개)과 추천 페이지가 함께 요청하고, 그 옆에서 회차 상세가
 * 백엔드를 두드린다. 5초로는 부족해 실제로 타임아웃이 났고 추천 페이지가 "데이터가
 * 부족합니다" 폴백으로 구워졌다.
 *
 * 이 호출은 빌드와 ISR 재검증 때만 일어난다. 빌드가 조금 느려지더라도 페이지에 번호가
 * 담기는 편이 낫다.
 */
const RECOMMEND_TIMEOUT_MS = 45_000

/** ISR 재검증 주기(초). 정본은 docs/wiki/30-seo/metadata-strategy.md 의 렌더링 전략표. */
export const REVALIDATE = {
  /** 최신 회차 — 짧게 */
  latest: 60 * 10,
  /** 홈·대시보드 — 추첨 후 갱신 */
  home: 60 * 60,
  /** 과거 회차는 사실상 불변 */
  round: 60 * 60 * 24 * 7,
  /** 통계 — 주 1회 */
  stat: 60 * 60 * 24 * 7,
  /** 뉴스 — 수집 주기에 맞춤 */
  news: 60 * 60,
  /**
   * 영상 — **24시간을 넘기지 않는다.**
   *
   * ⚠ 다른 값과 달리 이것은 취향이 아니라 **정책 상한**이다. `lotto_video` 의 행은
   *   YouTube 개발자 정책 III.E.4 에 따라 30일 안에 갱신되거나 삭제되므로, 오래 캐시하면
   *   워커가 지운 영상을 계속 내보내게 된다(→ 90-external/youtube-data-api.md).
   *   여섯 시간으로 두어 여유를 남긴다.
   */
  video: 60 * 60 * 6,
} as const

/**
 * 서버 사이드 GET. 실패하면 null.
 *
 * 실패를 삼키는 대신 반환값으로 노출하는 이유: 호출부가 "데이터가 없는 화면"을 명시적으로
 * 렌더링하게 강제하기 위해서다. try/catch 를 각 페이지에 흩뿌리면 어디선가 빠진다.
 */
async function getJson<T>(path: string, revalidate: number): Promise<T | null> {
  const url = `${API_BASE_URL}${path}`
  try {
    const res = await fetch(url, {
      // Next.js 의 데이터 캐시. revalidate 초가 지나면 백그라운드에서 다시 가져온다.
      next: { revalidate },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) {
      // 404 는 자원 없음이라 정상 흐름(회차 상세, 데이터 없는 /latest). 그 외는 이상 신호.
      if (res.status !== 404) {
        console.warn(`[api] ${res.status} ${url}`)
      }
      return null
    }
    return (await res.json()) as T
  } catch (err) {
    // 백엔드 미기동 · 타임아웃 · JSON 파싱 실패가 여기로 온다.
    console.warn(`[api] 요청 실패: ${url}`, err instanceof Error ? err.message : err)
    return null
  }
}

/**
 * 백엔드에 닿지 못했다. **자원이 없는 것과 구분하기 위해** 따로 둔다.
 *
 * ⚠ 이 둘을 뭉개면 장애가 404 로 굳는다. 백엔드가 죽은 동안 회차 페이지를 요청하면
 *   `notFound()` 가 불리고, 그 404 응답이 ISR 캐시에 7일간 남는다 — 백엔드가 살아난
 *   뒤에도 그 회차는 계속 "없는 페이지" 다. 실제로 500회에서 겪었다(2026-08-28).
 *
 * 규칙은 하나다. **없음(404)은 캐시해도 되고, 장애는 캐시하면 안 된다.**
 * 장애일 때 이 오류를 던지면 Next 는 그 렌더를 캐시하지 않고 다음 요청에 다시 시도한다.
 */
export class BackendUnavailableError extends Error {
  constructor(readonly url: string, cause?: unknown) {
    super(`백엔드에 연결하지 못했습니다: ${url}`)
    this.name = 'BackendUnavailableError'
    this.cause = cause
  }
}

/**
 * `getJson` 과 같되 **장애를 삼키지 않는다.** 404 는 `null`, 그 밖의 실패는 던진다.
 *
 * ⚠ 페이지가 성립하려면 반드시 있어야 하는 데이터에만 쓴다. 없어도 화면이 서는 부가
 *   데이터에 쓰면 통계 하나 때문에 페이지 전체가 500 이 된다.
 * ⚠ 정적 생성 중에 던지면 **빌드가 실패한다.** 그것이 의도다 — 백엔드가 죽은 채로 구운
 *   404 를 배포하는 것보다 빌드가 멈추고 원인을 알려 주는 편이 낫다.
 */
async function getJsonOrThrow<T>(path: string, revalidate: number): Promise<T | null> {
  const url = `${API_BASE_URL}${path}`
  let res: Response
  try {
    res = await fetch(url, {
      next: { revalidate },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: 'application/json' },
    })
  } catch (err) {
    // 백엔드 미기동 · 타임아웃 · DNS 실패가 여기로 온다. 전부 일시적일 수 있는 장애다.
    throw new BackendUnavailableError(url, err)
  }

  // 404 만 "없음" 이다. 5xx 는 서버가 아프다는 뜻이라 장애로 본다.
  if (res.status === 404) return null
  if (!res.ok) throw new BackendUnavailableError(`${url} (HTTP ${res.status})`)

  try {
    return (await res.json()) as T
  } catch (err) {
    // 본문이 JSON 이 아니다 — 프록시 오류 페이지 따위. 캐시하면 안 된다.
    throw new BackendUnavailableError(url, err)
  }
}

/* ────────────────────────────────────────────────────────────
 * 로또 회차
 * ──────────────────────────────────────────────────────────── */

export function getLatestRound(): Promise<Round | null> {
  return getJson<Round>('/api/lotto/latest', REVALIDATE.latest)
}

/**
 * 회차 목록. 계약이 정한 페이지네이션 봉투를 그대로 돌려준다.
 * 정렬은 백엔드가 `round_no` 내림차순으로 보장한다 — 프론트가 다시 정렬하지 않는다.
 * 백엔드가 없으면 `total: 0` 인 빈 봉투를 만들어 화면이 폴백을 그리게 한다.
 */
export async function getRounds(page = 1, size = 20): Promise<Paged<Round>> {
  const payload = await getJson<Paged<Round>>(
    `/api/lotto/rounds?page=${page}&size=${size}`,
    REVALIDATE.home,
  )
  return payload ?? { total: 0, page, size, items: [] }
}

/**
 * 회차 상세. **없으면 `null`, 백엔드 장애면 던진다**(`BackendUnavailableError`).
 *
 * ⚠ 이 페이지의 핵심 데이터라 장애를 삼키면 안 된다. 삼키면 호출부가 `notFound()` 를
 *   부르고, 그 404 가 일주일치 ISR 캐시에 굳는다(→ `BackendUnavailableError` 주석).
 */
export function getRound(roundNo: number): Promise<RoundDetail | null> {
  return getJsonOrThrow<RoundDetail>(`/api/lotto/rounds/${roundNo}`, REVALIDATE.round)
}

/* ────────────────────────────────────────────────────────────
 * 통계 — 서버가 계산한 값을 그대로 받아 그린다
 * ──────────────────────────────────────────────────────────── */

/**
 * 통계 조회 조건 → 쿼리스트링 (003 개편).
 *
 * **기간(`from_round`+`to_round`)이 있으면 `window` 를 보내지 않는다.** 계약상 둘 다 오면
 * 백엔드가 기간을 택하지만, 무엇을 조회했는지 화면과 서버가 어긋날 여지를 아예 없앤다.
 * 기간은 **둘 다 있어야** 유효하다 — 하나만 보내면 계약이 422 로 거절한다.
 */
function statQuery(query: StatQuery = {}): string {
  const params = new URLSearchParams()
  const hasRange = query.fromRound !== undefined && query.toRound !== undefined

  if (hasRange) {
    params.set('from_round', String(query.fromRound))
    params.set('to_round', String(query.toRound))
  } else if (query.window !== undefined) {
    params.set('window', String(query.window))
  }

  if (query.top !== undefined) params.set('top', String(query.top))
  if (query.includeBonus !== undefined) params.set('include_bonus', String(query.includeBonus))

  return params.toString()
}

/**
 * 응답이 003 기간 조회를 지원하는 백엔드에서 왔는지.
 *
 * 세 세션이 병렬로 개발하므로 프론트가 먼저 나갈 수 있다. 그때 화면은 기간 UI 를 **잠그고**
 * window 기반으로만 동작해야 한다 — 지원하지 않는 파라미터를 보내면 백엔드가 그것을 무시한
 * 채 기본 구간을 돌려주고, 화면은 사용자가 고른 것과 다른 데이터를 보여주게 된다.
 */
export function supportsRangeQuery(payload: RangeMeta | null | undefined): boolean {
  return payload !== null && payload !== undefined && 'from_round' in payload
}

export function getFrequency(
  window: StatWindow = 20,
  includeBonus = false,
  range: Pick<StatQuery, 'fromRound' | 'toRound'> = {},
): Promise<FrequencyResult | null> {
  const query = statQuery({ window, includeBonus, ...range })
  return getJson<FrequencyResult>(`/api/lotto/stats/frequency?${query}`, REVALIDATE.stat)
}

export function getHotCold(
  window: StatWindow = 20,
  options: Omit<StatQuery, 'window' | 'includeBonus'> = {},
): Promise<HotColdResult | null> {
  const query = statQuery({ window, ...options })
  return getJson<HotColdResult>(`/api/lotto/stats/hot-cold?${query}`, REVALIDATE.stat)
}

export function getPattern(
  window: StatWindow = 20,
  range: Pick<StatQuery, 'fromRound' | 'toRound'> = {},
): Promise<PatternResult | null> {
  const query = statQuery({ window, ...range })
  return getJson<PatternResult>(`/api/lotto/stats/pattern?${query}`, REVALIDATE.stat)
}

/**
 * 동반 출현(002 개편). `number` 를 주면 그 번호와 함께 나온 상대, 없으면 전체 상위쌍.
 * 백엔드가 아직 이 엔드포인트를 구현하지 않았으면 404 → null 을 반환하고, 화면은 그 탭을
 * "준비 중" 으로 그린다.
 */
export function getPairs(
  window: StatWindow = 20,
  options: { number?: number; top?: number } & Pick<StatQuery, 'fromRound' | 'toRound'> = {},
): Promise<PairsResult | null> {
  const { number, ...rest } = options
  const query = new URLSearchParams(statQuery({ window, ...rest }))
  if (number !== undefined) query.set('number', String(number))
  return getJson<PairsResult>(`/api/lotto/stats/pairs?${query.toString()}`, REVALIDATE.stat)
}

/**
 * 번호 하나의 통계 (003 신규). 백엔드가 아직 구현하지 않았으면 404 → null 이고,
 * 화면은 "준비 중" 을 그린다.
 */
export function getNumberStat(
  n: number,
  window: StatWindow = 50,
  range: Pick<StatQuery, 'fromRound' | 'toRound'> = {},
): Promise<NumberStat | null> {
  const query = statQuery({ window, ...range })
  return getJson<NumberStat>(`/api/lotto/stats/number/${n}?${query}`, REVALIDATE.stat)
}

/**
 * `getNumberStat` 과 같되 **장애를 삼키지 않는다.** 404 는 `null`, 그 밖의 실패는 던진다.
 *
 * ⚠ 회차 상세의 "그때까지 기록" 절 전용이다. 그 절이 장애 때문에 빠진 페이지가 일주일
 *   캐시되면 그동안 아무도 그 내용을 못 본다(→ `BackendUnavailableError` 주석).
 * ⚠ 통계 화면(`/lotto/stat`)은 **삼키는 쪽**을 쓴다. 거기서는 이 엔드포인트로 구현 여부만
 *   떠보는 것이라, 장애로 던지면 다른 데이터로 충분히 서는 페이지가 통째로 500 이 된다.
 *   같은 데이터라도 **없을 때 페이지가 성립하는가**에 따라 다루는 방식이 갈린다.
 */
export function getNumberStatStrict(
  n: number,
  window: StatWindow = 50,
  range: Pick<StatQuery, 'fromRound' | 'toRound'> = {},
): Promise<NumberStat | null> {
  const query = statQuery({ window, ...range })
  return getJsonOrThrow<NumberStat>(`/api/lotto/stats/number/${n}?${query}`, REVALIDATE.stat)
}

/**
 * 회차-날짜 목록 (003 신규). 기간 선택 UI 가 회차 옆에 날짜를 보여주기 위해 쓴다.
 * 과거 회차는 불변이라 길게 캐시한다. 없으면 화면은 날짜 없이 회차 번호만 입력받는다.
 */
export function getRoundIndex(): Promise<RoundIndex | null> {
  return getJson<RoundIndex>('/api/lotto/rounds/index', REVALIDATE.round)
}

/* ────────────────────────────────────────────────────────────
 * 유튜브 영상 (2026-08-28 계약 신설)
 * ──────────────────────────────────────────────────────────── */

/**
 * 영상 목록.
 *
 * ⚠ **캐시를 24시간 넘게 두지 않는다.** `lotto_video` 의 행은 YouTube 개발자 정책 III.E.4
 *   에 따라 30일 안에 갱신되거나 삭제된다. 우리가 오래 캐시하면 워커가 지운 영상을 계속
 *   내보내게 되고, 그 시점부터 정책 위반의 주체가 된다
 *   (→ docs/wiki/10-contracts/api-contract.md 영상 절). 백엔드에 걸린 상한과 같은 이유다.
 * ⚠ 백엔드가 아직 이 엔드포인트를 만들지 않았으면 404 → 빈 봉투다. 화면은 "준비 중" 을
 *   그리고 페이지 전체가 실패하지는 않는다.
 */
export async function getVideos(
  kind: VideoKind = 'all',
  page = 1,
  size = 20,
  filter: { round?: number; game?: VideoGame } = {},
): Promise<Paged<VideoItem>> {
  const params = new URLSearchParams({ kind, page: String(page), size: String(Math.min(100, size)) })
  // 회차는 게임과 함께 보내야 의미가 있다. 하나만 보내면 계약이 걸러 준다.
  if (filter.round !== undefined && filter.game) {
    params.set('round', String(filter.round))
    params.set('game', filter.game)
  }
  const payload = await getJson<Paged<VideoItem>>(
    `/api/videos?${params.toString()}`,
    REVALIDATE.video,
  )
  return payload ?? { total: 0, page, size, items: [] }
}

/**
 * 회차 상세 — **장애를 삼키는** 쪽.
 *
 * ⚠ `getRound` 와 짝이다. 판정 기준은 **그 데이터가 없을 때 페이지가 성립하는가**다
 *   (→ docs/wiki/20-design/components.md). 회차 상세 화면에서는 회차가 없으면 페이지가
 *   아예 성립하지 않으므로 던지고, 영상 상세에서는 **영상이 주인공**이고 회차는 곁들이는
 *   자료라 없어도 화면이 선다. 여기서 던지면 회차 하나 때문에 영상이 안 보인다.
 */
export function getRoundOptional(roundNo: number): Promise<RoundDetail | null> {
  return getJson<RoundDetail>(`/api/lotto/rounds/${roundNo}`, REVALIDATE.round)
}

/** 영상 하나. 없으면 `null` — 화면은 404 를 낸다. */
export function getVideo(id: number): Promise<VideoDetail | null> {
  return getJson<VideoDetail>(`/api/videos/${id}`, REVALIDATE.video)
}

/* ────────────────────────────────────────────────────────────
 * 뉴스
 * ──────────────────────────────────────────────────────────── */

/**
 * 뉴스 목록.
 *
 * `keyword`·`period` 는 002 개편으로 추가된 조회 조건이다(하위호환 — 생략하면 종전과 동일).
 * ⚠ **API 기본값은 `period=all`** 이지만, 뉴스 페이지 화면은 `1w`(최근 1주)를 명시적으로
 *   넘긴다. "API 기본값" 과 "화면 기본값" 을 구분한다([[api-contract]] 뉴스 절).
 */
export async function getNews(
  page = 1,
  size = 20,
  options: { keyword?: string; period?: NewsPeriod } = {},
): Promise<Paged<NewsItem>> {
  const query = new URLSearchParams({ page: String(page), size: String(size) })
  const keyword = options.keyword?.trim()
  if (keyword) query.set('keyword', keyword)
  if (options.period) query.set('period', options.period)

  const payload = await getJson<Paged<NewsItem>>(`/api/news?${query.toString()}`, REVALIDATE.news)
  return payload ?? { total: 0, page, size, items: [] }
}

/* ────────────────────────────────────────────────────────────
 * 꿈해몽
 * ──────────────────────────────────────────────────────────── */

/**
 * 꿈 키워드 목록. 임베딩 모델을 로드하지 않으므로 20초 함정과 무관하게 즉시 응답한다.
 * 슬러그는 **한글 표기 그대로**다 — 로마자로 바꾸지 않는다.
 */
export async function getDreamKeywords(): Promise<DreamKeyword[]> {
  const payload = await getJson<DreamKeywordList>('/api/dream/keywords', REVALIDATE.stat)
  return payload?.keywords ?? []
}

/* ────────────────────────────────────────────────────────────
 * SEO
 * ──────────────────────────────────────────────────────────── */

export function getSitemapEntries(): Promise<SitemapEntries | null> {
  return getJson<SitemapEntries>('/api/meta/sitemap-entries', REVALIDATE.home)
}

/* ────────────────────────────────────────────────────────────
 * 번호 추천 (서버)
 *
 * 홈·추천 페이지의 **첫 화면**은 서버에서 렌더링한다. 그래야 JS 를 끈 상태에서도 조합과
 * 성향 설명이 보인다. "다시 생성"은 브라우저가 부른다(browserRecommend).
 *
 * ⚠ 통계 기반 전략은 회차가 50개 미만이면 백엔드가 422 를 준다. 예외로 터뜨리지 않고
 *   null 을 반환해 화면이 "아직 데이터가 부족합니다" 를 보여주게 한다.
 *   `pure_random` 만은 과거 회차를 읽지 않으므로 데이터가 없어도 200 이다.
 * ──────────────────────────────────────────────────────────── */

export async function serverRecommend(
  strategy: RecommendStrategy,
  sets = 1,
  seed?: number,
): Promise<RecommendResult | null> {
  const query = new URLSearchParams({ strategy, sets: String(sets) })
  if (seed !== undefined) query.set('seed', String(seed))
  const url = `${API_BASE_URL}/api/lotto/recommend?${query.toString()}`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      // ⚠ `cache: 'no-store'` 를 쓰면 이 fetch 를 호출하는 라우트가 통째로 dynamic 이 되어
      //   ISR 이 깨진다(홈이 매 요청마다 서버 렌더링된다). POST 는 어차피 Next 데이터
      //   캐시 대상이 아니므로, 재검증 힌트만 남기고 no-store 를 쓰지 않는다. 이 호출은
      //   ISR 페이지가 재생성될 때만 일어나고, 그 주기가 곧 추천 갱신 주기가 된다.
      next: { revalidate: REVALIDATE.home },
      signal: AbortSignal.timeout(RECOMMEND_TIMEOUT_MS),
    })
    if (!res.ok) {
      // 422 = 회차 부족. 정상 흐름이므로 조용히 null.
      if (res.status !== 422) console.warn(`[api] ${res.status} ${url}`)
      return null
    }
    return (await res.json()) as RecommendResult
  } catch (err) {
    console.warn(`[api] 추천 요청 실패: ${url}`, err instanceof Error ? err.message : err)
    return null
  }
}

/* ────────────────────────────────────────────────────────────
 * 브라우저 전용 — 사용자 액션으로만 호출된다(추천 재생성, 꿈해몽 분석)
 *
 * 추천·꿈해몽 결과는 매번 달라 서버 렌더링이 무의미하다. 색인되는 것은 그 페이지의
 * 설명·기준·면책 본문이고, 그것은 서버 컴포넌트가 이미 렌더링한다.
 * → docs/wiki/30-seo/metadata-strategy.md 렌더링 전략
 * ──────────────────────────────────────────────────────────── */

/** 사용자가 버튼을 눌러 기다리는 요청이라 넉넉히 준다(몬테카를로 계산). */
const BROWSER_TIMEOUT_MS = 20_000
/** 꿈해몽 첫 요청은 임베딩 모델 lazy 로드로 20초가 걸린다(dream-pipeline.md). */
const DREAM_TIMEOUT_MS = 40_000

/** 브라우저 fetch 는 실패를 던진다 — 호출부가 에러 상태를 화면에 표시해야 하기 때문이다. */
async function postJson<T>(path: string, body: unknown, timeoutMs: number): Promise<T> {
  const res = await fetch(`${PUBLIC_API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) {
    // 백엔드 오류 형식: { "detail": "한국어 메시지" }
    let detail = '요청을 처리하지 못했습니다.'
    try {
      const data = (await res.json()) as { detail?: string }
      if (data?.detail) detail = data.detail
    } catch {
      /* 본문이 JSON 이 아니면 기본 메시지를 쓴다 */
    }
    throw new Error(detail)
  }
  return (await res.json()) as T
}


/* ────────────────────────────────────────────────────────────
 * 브라우저 전용 통계 조회 (003 개편)
 *
 * 통계 라우트는 ISR 이고, 서버 컴포넌트가 `searchParams` 를 읽으면 dynamic 이 되어 ISR 이
 * 깨지고 중복 URL 이 색인된다(→ docs/wiki/30-seo/metadata-strategy.md). 그런데 임의 기간은
 * 조합이 무한해 서버가 미리 구울 수도 없다.
 *
 * 그래서 **기본 화면(최근 20/50/100/전체)은 서버가 굽고, 사용자가 조건을 바꾸면 브라우저가
 * 직접 조회한다.** 색인되는 것은 기본 화면과 설명 본문이고 그것은 서버가 렌더한다.
 *
 * 조회 함수와 달리 이쪽은 **실패를 던진다** — 사용자가 버튼을 눌러 기다리고 있으므로
 * 화면이 에러를 표시해야 한다(추천·꿈해몽과 같은 규약).
 * ──────────────────────────────────────────────────────────── */

/** 사용자가 기다리는 조회다. 조회는 계산이 아니라 집계라 빠르므로 짧게 잡는다. */
const BROWSER_STAT_TIMEOUT_MS = 10_000

async function browserGetJson<T>(path: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${PUBLIC_API_BASE_URL}${path}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(BROWSER_STAT_TIMEOUT_MS),
    })
  } catch (err) {
    /*
     * 응답이 아예 오지 못한 경우 — CORS 차단·오프라인·DNS 실패·타임아웃.
     *
     * ⚠ 이때 fetch 가 던지는 것은 `TypeError: Failed to fetch` 같은 **영어 원문**이다.
     *   화면들은 `err.message` 를 그대로 보여주므로, 감싸지 않으면 사용자에게 영어
     *   오류가 노출된다. 번호 조회가 화면 진입과 동시에 실행되면서(→ NumberInspector)
     *   이 문구가 첫 화면에 바로 뜨게 돼 실제로 드러났다(2026-08-21).
     * ⚠ 가장 흔한 원인은 서버 장애가 아니라 **CORS 오리진 불일치**다. 서버 로그에는
     *   200 만 남고 브라우저만 조용히 막으므로, 원인 추적을 위해 원본 오류는 콘솔에 남긴다
     *   (→ docs/wiki/10-contracts/env-vars.md CORS_ORIGINS 함정).
     */
    console.error('[api] 통계 조회 실패:', path, err)
    const timedOut = err instanceof DOMException && err.name === 'TimeoutError'
    throw new Error(
      timedOut
        ? '응답이 늦어 조회를 멈췄습니다. 잠시 후 다시 시도해 주세요.'
        : '통계 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.',
    )
  }
  if (!res.ok) {
    // 백엔드 오류 형식: { "detail": "한국어 메시지" }
    let detail = '통계를 불러오지 못했습니다.'
    try {
      const data = (await res.json()) as { detail?: string }
      if (data?.detail) detail = data.detail
    } catch {
      /* 본문이 JSON 이 아니면 기본 메시지를 쓴다 */
    }
    throw new Error(detail)
  }
  return (await res.json()) as T
}

export function browserHotCold(query: StatQuery): Promise<HotColdResult> {
  return browserGetJson<HotColdResult>(`/api/lotto/stats/hot-cold?${statQuery(query)}`)
}

export function browserFrequency(query: StatQuery): Promise<FrequencyResult> {
  return browserGetJson<FrequencyResult>(`/api/lotto/stats/frequency?${statQuery(query)}`)
}

export function browserPattern(query: StatQuery): Promise<PatternResult> {
  return browserGetJson<PatternResult>(`/api/lotto/stats/pattern?${statQuery(query)}`)
}

export function browserNumberStat(n: number, query: StatQuery): Promise<NumberStat> {
  return browserGetJson<NumberStat>(`/api/lotto/stats/number/${n}?${statQuery(query)}`)
}

export function browserRecommend(
  strategy: RecommendStrategy,
  sets = 1,
  seed?: number,
): Promise<RecommendResult> {
  // 계약상 sets 는 1~10 이다. 범위를 넘기면 422 가 오므로 여기서 잘라 보낸다.
  const bounded = Math.min(10, Math.max(1, sets))
  const query = new URLSearchParams({ strategy, sets: String(bounded) })
  if (seed !== undefined) query.set('seed', String(seed))
  return postJson<RecommendResult>(
    `/api/lotto/recommend?${query.toString()}`,
    undefined,
    BROWSER_TIMEOUT_MS,
  )
}

/**
 * 꿈 텍스트 → 참고용 번호.
 *
 * `sets_per_tier` 를 **명시적으로 보낸다.** 계약의 기본값은 10 인데, tier 가 셋이면 최대
 * 30개 조합이 화면에 쏟아진다. 사용자가 훑을 수 있는 양이 아니다. 값을 넘기지 않으면
 * 백엔드가 기본값을 바꿀 때 화면이 조용히 달라진다 — 그것을 막으려는 명시다.
 */
/**
 * 꿈 텍스트 → 참고용 번호.
 *
 * ⚠ `exclude` 는 **서버가 처리한다**(2026-08-28 계약 신설). 종전에는 이 파라미터가 없어
 *   프론트가 보여줄 개수의 세 배를 받아 걸러 냈는데, 그 우회는 풀이 좁고 여러 번호를 빼면
 *   남는 조합이 금세 바닥났고 **채움 번호에서는 아예 뺄 수 없었다.** 이제 번호가 풀에서도
 *   채움에서도 빠지고 응답의 `pool` 에서도 빠진다.
 * ⚠ 계약 상한은 **39개**다(6개를 만들려면 6개가 남아야 한다: 45−39=6). 40개 이상과 범위
 *   밖 번호는 422 다 — 여기서 자르지 않고 그대로 보낸다. 조용히 줄이면 사용자는 뺐다고
 *   믿는데 그 번호가 계속 나온다.
 */
export function browserDreamRecommend(
  text: string,
  setsPerTier = 5,
  exclude: readonly number[] = [],
): Promise<DreamResult> {
  return postJson<DreamResult>(
    '/api/dream/recommend',
    {
      text,
      // 계약상 1~30. 범위를 벗어나면 422 가 오므로 여기서 잘라 보낸다.
      sets_per_tier: Math.min(30, Math.max(1, setsPerTier)),
      exclude: [...exclude],
    },
    DREAM_TIMEOUT_MS,
  )
}
