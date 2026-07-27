/**
 * 백엔드 REST 계약의 타입 표현.
 * 정본은 docs/wiki/10-contracts/api-contract.md 다. 이 파일은 그것을 옮긴 것이고,
 * 백엔드 코드를 읽어서 쓴 것이 아니다(세션은 서로의 코드를 읽지 않는다).
 *
 * ★ 표현 규약: probability / win_rate / accuracy / confidence / hit_rate /
 *   expected_value / score 를 필드명으로 쓰지 않는다. 조합의 **성향(사실)** 만 담는다.
 *   → docs/wiki/40-domain/forbidden-expressions.md
 */

/** 통계 조회 구간. 최근 몇 회차를 볼지. */
export type StatWindow = 20 | 50 | 100 | 'all'

/**
 * 뉴스 기간 필터(002 개편). `1w`=7일 … `all`=전체.
 * API 기본값은 `all`(기존 호출 보호), 화면 기본값은 `1w`(뉴스 페이지 R30).
 */
export type NewsPeriod = '1w' | '2w' | '1m' | '3m' | '6m' | 'all'

/** 번호 추천 전략. → docs/wiki/40-domain/prediction-algorithm.md */
export type RecommendStrategy =
  | 'ensemble'
  | 'pair_affinity'
  | 'balanced_range'
  | 'cold_return'
  | 'golden_combo'
  | 'pure_random'

/**
 * 조합의 성향 — **여섯 개의 사실**.
 *
 * 이 필드들은 그 조합의 여섯 숫자만 보면 계산된다. 관찰 시점도 기준 회차도 개입하지 않는다.
 * 회차 상세와 꿈해몽 결과가 쓰는 타입이다.
 */
export interface Traits {
  /** "3:3" 형식 (홀:짝) */
  odd_even: string
  /** "3:3" 형식 (고:저). **고 = 23 이상** */
  high_low: string
  sum: number
  /** { "1-15": 2, "16-30": 2, "31-45": 2 } */
  range_distribution: Record<string, number>
  has_consecutive: boolean
  /** 끝수(1의 자리)의 가짓수 */
  tail_variety: number
}

/**
 * 번호 추천 응답의 성향 — 위 여섯 개 + HOT/COLD 포함 개수.
 *
 * ⚠ hot_count / cold_count 는 **회차 상세에는 없다.** "어느 시점의 최근 몇 회차 기준인가"
 *   라는 선택이 개입하기 때문이다. 기준은 응답의 `hot_window` 다.
 *   `pure_random` 은 과거 회차를 읽지 않으므로 데이터가 없으면 두 값이 `null` 이다.
 */
export interface CombinationTraits extends Traits {
  hot_count: number | null
  cold_count: number | null
}

export interface Round {
  round_no: number
  /** "2026-07-04" */
  draw_date: string
  /** 항상 오름차순 6개 */
  numbers: number[]
  bonus: number
  first_win_amount: number | null
  first_winner_count: number | null
  /** 현재 수집 소스에 없어 거의 항상 null. 화면에는 '-' 로 표시한다. */
  total_sell_amount: number | null
  first_accum_amount: number | null
}

export interface PrizeTier {
  rank: number
  winner_count: number
  prize_per_game: number
}

export interface RoundDetail extends Round {
  /** 소스 미확보로 **현재 항상 빈 배열**. 비면 해당 섹션을 렌더링하지 않는다. */
  prize_tiers: PrizeTier[]
  /** 여섯 필드만. hot_count·cold_count 는 없다. */
  traits: Traits
}

/**
 * 페이지네이션 봉투. 배열을 최상위에 두지 않는다 — 총 개수를 나중에 덧붙이려면
 * 응답 타입이 바뀌기 때문이다. `total` 은 필터 적용 후 전체 건수이지 items 길이가 아니다.
 * 범위를 벗어난 page 는 404 가 아니라 빈 items 와 함께 200 이다.
 */
export interface Paged<T> {
  total: number
  page: number
  size: number
  items: T[]
}

/* ────────────────────────────────────────────────────────────
 * 통계 — 세 엔드포인트 모두 window 와 rounds_analyzed 를 담는다.
 * window=100 인데 데이터가 60회차뿐이면 rounds_analyzed: 60 이다.
 * ──────────────────────────────────────────────────────────── */

export interface FrequencyResult {
  window: StatWindow
  /** 실제로 집계에 쓰인 회차 수. window 와 다를 수 있다. */
  rounds_analyzed: number
  include_bonus: boolean
  /** 번호(문자열) → 출현 횟수. 1~45 키가 **전부** 있고 미출현은 0. */
  counts: Record<string, number>
}

/** window 최근 절반 vs 이전 절반의 출현 비교. 관찰된 추세일 뿐 예측이 아니다. */
export type Trend = 'up' | 'down' | 'flat'

export interface RankedNumber {
  number: number
  count: number
  /**
   * `count / rounds_analyzed`. 0.0~1.0 의 **과거 출현 비율**이다(002 개편).
   * ⚠ 다음 회차 확률이 아니다 — "지난 N회 중 나온 비율" 로만 표시한다.
   * 백엔드가 아직 안 줄 수 있어 optional 이다(미제공 시 프론트가 count/rounds 로 계산).
   */
  appearance_rate?: number
  /** 그 번호가 마지막으로 나온 회차 번호(절대값). 역대로 없으면 null. */
  last_seen_round?: number | null
  /** window 를 최근/이전 절반으로 나눈 출현 추세. window<2 면 flat. */
  trend?: Trend
}

/** 미출현 회차 수. 최신 회차에 나온 번호는 0. */
export interface OverdueNumber {
  number: number
  rounds_since: number
  /** 마지막 출현 회차(002 개편). */
  last_seen_round?: number | null
}

export interface HotColdResult {
  window: StatWindow
  rounds_analyzed: number
  /** window 안의 출현 횟수 상위 10개. 동점이면 번호가 작은 쪽이 앞선다. */
  hot: RankedNumber[]
  /** 하위 10개. */
  cold: RankedNumber[]
  /** ⚠ 이 배열만은 window 가 아니라 **역대 전체** 기준이다. */
  overdue: OverdueNumber[]
}

/* ────────────────────────────────────────────────────────────
 * 동반 출현 (002 개편) — 함께 자주 나온 번호쌍.
 * pair_affinity 전략의 동시출현 집계를 사용자에게 노출한 것이다.
 * 이 값이 "이 쌍이 또 나온다" 를 뜻하지 않는다 — 확률 표현을 붙이지 않는다.
 * ──────────────────────────────────────────────────────────── */

export interface NumberPair {
  /** 항상 오름차순 2개. */
  numbers: [number, number]
  /** window 안에서 두 번호가 같은 회차에 함께 나온 횟수. */
  count: number
}

export interface PairsResult {
  window: StatWindow
  rounds_analyzed: number
  /** 특정 번호 기준이면 그 번호, 전체 상위쌍이면 null. */
  number: number | null
  pairs: NumberPair[]
}

/**
 * 패턴 통계.
 * 비율(0.0~1.0)은 관찰된 **빈도의 비율**이지 다음 회차의 무엇이 아니다.
 * 분포 맵(odd_even·high_low)은 비율 내림차순으로 정렬되어 온다.
 */
export interface PatternResult {
  window: StatWindow
  rounds_analyzed: number
  /** 키는 "홀:짝". 예: { "3:3": 0.33, "4:2": 0.24 } */
  odd_even: Record<string, number>
  /** 키는 "고:저". 고 = 23 이상. */
  high_low: Record<string, number>
  /** 연속번호를 한 쌍 이상 포함한 회차의 비율. */
  consecutive_ratio: number
  /** min·max 는 합계의 10·90 퍼센타일, peak 는 중앙값. */
  sum_range: { min: number; max: number; peak: number }
  /** 끝수 종류 수의 평균. */
  tail_variety_avg: number
  /** 끝자리 0~9 각각의 등장 합. */
  tail_counts: Record<string, number>
}

/* ────────────────────────────────────────────────────────────
 * 번호 추천
 * ──────────────────────────────────────────────────────────── */

export interface RecommendSet {
  numbers: number[]
  traits: CombinationTraits
}

export interface RecommendResult {
  strategy: RecommendStrategy
  /** 요청에 seed 를 주지 않았으면 null. */
  seed: number | null
  sets: RecommendSet[]
  /** hot_count·cold_count 의 기준 회차 수. 데이터가 없으면 null. */
  hot_window: number | null
  /** 백엔드가 면책 문구를 내려준다. 프론트가 그것을 잊지 못하게 하려는 계약이다. */
  disclaimer: string
}

/* ────────────────────────────────────────────────────────────
 * 꿈해몽
 * ──────────────────────────────────────────────────────────── */

export interface DreamKeyword {
  /** ⚠ **한글 표기 그대로다.** 로마자로 바꾸지 않는다(`/dream/돼지`). */
  slug: string
  word: string
}

export interface DreamKeywordList {
  total: number
  keywords: DreamKeyword[]
}

/** gubun: 1=정확일치, 2=포함, 3=벡터 유사. */
export interface DreamMatch {
  gubun: 1 | 2 | 3
  word: string
  numbers: number[]
}

export interface DreamMatchedWord {
  dream_word: string
  matches: DreamMatch[]
}

/** 꿈해몽 세트의 traits 는 회차 상세와 같은 **여섯 필드**다(hot/cold 없음). */
export interface DreamSet {
  numbers: number[]
  traits: Traits
}

export interface DreamTier {
  /** 이 tier 가 쓴 번호 풀. */
  pool: number[]
  sets: DreamSet[]
}

/**
 * tier 는 gubun 을 **누적**한다 — tier1 은 gubun 1 만, tier2 는 1+2, tier3 는 1+2+3.
 * 풀이 비면 그 tier 는 null 이고, 프론트는 해당 탭을 렌더링하지 않는다.
 */
export interface DreamResult {
  text: string
  matched_words: DreamMatchedWord[]
  tiers: {
    tier1: DreamTier | null
    tier2: DreamTier | null
    tier3: DreamTier | null
  }
  disclaimer: string
}

export type DreamTierKey = 'tier1' | 'tier2' | 'tier3'

/* ────────────────────────────────────────────────────────────
 * 뉴스 · SEO
 * ──────────────────────────────────────────────────────────── */

export interface NewsItem {
  id: number
  title: string
  /** 원문이 아니라 요약이다. 복제하지 않는다. */
  description: string
  link: string
  orig_link: string
  source: string
  /** ISO 8601, KST(+09:00) */
  pub_date: string
  keywords: string[]
}

/**
 * 사이트맵 데이터. 페이징이 없다 — 사이트맵은 전체를 한 번에 봐야 한다.
 * `rounds` 는 round_no 오름차순, `news` 는 **id 오름차순**이다(최신이 앞이 아니다).
 */
export interface SitemapEntries {
  rounds: { round_no: number; lastmod: string }[]
  /** `published_dttm` 이 null 인 기사는 `lastmod` 도 null 이다. */
  news: { id: number; lastmod: string | null }[]
}
