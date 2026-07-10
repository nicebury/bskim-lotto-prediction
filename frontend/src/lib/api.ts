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
  Paged,
  PatternResult,
  RecommendResult,
  RecommendStrategy,
  Round,
  RoundDetail,
  SitemapEntries,
  StatWindow,
} from './api-types'

/** 백엔드가 응답하지 않을 때 페이지 렌더를 더 기다리지 않는다. 빌드가 멈추면 안 된다. */
const TIMEOUT_MS = 5_000

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

export function getRound(roundNo: number): Promise<RoundDetail | null> {
  return getJson<RoundDetail>(`/api/lotto/rounds/${roundNo}`, REVALIDATE.round)
}

/* ────────────────────────────────────────────────────────────
 * 통계 — 서버가 계산한 값을 그대로 받아 그린다
 * ──────────────────────────────────────────────────────────── */

export function getFrequency(
  window: StatWindow = 20,
  includeBonus = false,
): Promise<FrequencyResult | null> {
  return getJson<FrequencyResult>(
    `/api/lotto/stats/frequency?window=${window}&include_bonus=${includeBonus}`,
    REVALIDATE.stat,
  )
}

export function getHotCold(window: StatWindow = 20): Promise<HotColdResult | null> {
  return getJson<HotColdResult>(`/api/lotto/stats/hot-cold?window=${window}`, REVALIDATE.stat)
}

export function getPattern(window: StatWindow = 20): Promise<PatternResult | null> {
  return getJson<PatternResult>(`/api/lotto/stats/pattern?window=${window}`, REVALIDATE.stat)
}

/* ────────────────────────────────────────────────────────────
 * 뉴스
 * ──────────────────────────────────────────────────────────── */

export async function getNews(page = 1, size = 20): Promise<Paged<NewsItem>> {
  const payload = await getJson<Paged<NewsItem>>(
    `/api/news?page=${page}&size=${size}`,
    REVALIDATE.news,
  )
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
      signal: AbortSignal.timeout(TIMEOUT_MS),
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

/** 사용자가 버튼을 눌러 기다리는 요청이라 서버 렌더보다 넉넉히 준다. */
const BROWSER_TIMEOUT_MS = 15_000
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
 * 꿈 텍스트 → 재미용 번호.
 *
 * `sets_per_tier` 를 **명시적으로 보낸다.** 계약의 기본값은 10 인데, tier 가 셋이면 최대
 * 30개 조합이 화면에 쏟아진다. 사용자가 훑을 수 있는 양이 아니다. 값을 넘기지 않으면
 * 백엔드가 기본값을 바꿀 때 화면이 조용히 달라진다 — 그것을 막으려는 명시다.
 */
export function browserDreamRecommend(text: string, setsPerTier = 5): Promise<DreamResult> {
  return postJson<DreamResult>(
    '/api/dream/recommend',
    // 계약상 1~30. 범위를 벗어나면 422 가 오므로 여기서 잘라 보낸다.
    { text, sets_per_tier: Math.min(30, Math.max(1, setsPerTier)) },
    DREAM_TIMEOUT_MS,
  )
}
