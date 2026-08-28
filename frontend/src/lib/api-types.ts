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

/**
 * 집계에 실제로 쓰인 구간 (003 개편).
 *
 * `window` 로 조회했든 `from_round`~`to_round` 로 조회했든 응답에 항상 담긴다.
 * 화면이 "1213~1232회 (2026.02.28 ~ 2026.07.11)" 을 회차→날짜 재조회 없이 그리기 위한
 * 필드다. `rounds_analyzed: 0` 이면 네 값 모두 null.
 *
 * ⚠ **전부 optional 이다.** 백엔드가 003 을 아직 구현하지 않았을 수 있고, 그때 화면은
 *   기간 조회 UI 를 잠그고 window 기반으로만 동작해야 한다. 세 세션이 병렬로 개발하므로
 *   새 필드가 없다고 화면이 깨지면 안 된다.
 */
export interface RangeMeta {
  from_round?: number | null
  to_round?: number | null
  from_date?: string | null
  to_date?: string | null
}

/** 통계 조회 조건. window 와 기간은 배타적이다(둘 다 주면 백엔드가 기간을 택한다). */
export interface StatQuery {
  window?: StatWindow
  fromRound?: number
  toRound?: number
  /** hot-cold 전용. 각 목록의 반환 개수(1~45). */
  top?: number
  includeBonus?: boolean
}

export interface FrequencyResult extends RangeMeta {
  /** 기간 조회면 null 일 수 있다. */
  window: StatWindow | null
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

export interface HotColdResult extends RangeMeta {
  window: StatWindow | null
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

export interface PairsResult extends RangeMeta {
  window: StatWindow | null
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
export interface PatternResult extends RangeMeta {
  window: StatWindow | null
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

  /**
   * 여섯 번호 합계의 10 단위 구간별 **회차 수**(비율이 아니다 — rounds_analyzed 와 더해
   * 검증할 수 있어야 한다). 키는 "100-109" 형식. 003 신규라 optional 이고, 없으면 화면이
   * 해당 카드를 그리지 않는다.
   */
  sum_histogram?: Record<string, number>

  /**
   * 한 회차에 포함된 **연속번호 쌍의 개수**별 비율. 키는 개수(문자열), 값은 0.0~1.0.
   * `1 - consecutive_counts["0"]` 가 `consecutive_ratio` 와 같아야 한다.
   */
  consecutive_counts?: Record<string, number>
}


/* ────────────────────────────────────────────────────────────
 * 번호 하나의 통계 (003 신규)
 *
 * 화면 하단 "내가 보고 싶은 번호" 조회용. 이 엔드포인트가 따로 있는 이유는 `rank` 다 —
 * "15번은 최근 50회에서 3위" 를 만들려면 45개를 정렬해야 하는데, 그 집계를 브라우저에서
 * 하면 서버와 숫자가 갈라진다(→ docs/wiki/10-contracts/component-boundaries.md).
 * ──────────────────────────────────────────────────────────── */

export interface NumberCompanion {
  number: number
  count: number
}

export interface NumberAppearance {
  round_no: number
  draw_date: string
}

export interface NumberStat extends RangeMeta {
  number: number
  window: StatWindow | null
  rounds_analyzed: number

  /** 구간 안 출현 횟수. */
  count: number
  /** count / rounds_analyzed. **다음 회차 확률이 아니다.** */
  appearance_rate: number
  /** 출현 횟수 순위. 1이 가장 많이 나온 번호. 동점이면 번호가 작은 쪽이 앞선다. */
  rank: number
  /** 항상 45. 화면이 "45개 중 3위" 로 쓴다. */
  rank_total: number
  trend: Trend
  /** 역대 전체에서 찾은 마지막 출현 회차. 없으면 null. */
  last_seen_round: number | null
  /** 최신 회차 기준 미출현 회차 수. */
  rounds_since: number
  /** 역대 최장 미출현 간격(회차). 구간이 아니라 역대 전체 기준이다. */
  max_gap: number | null
  /** 구간 안에서 함께 나온 상대 번호. 많은 순 최대 5개. */
  companions: NumberCompanion[]
  /** 구간 안에서 이 번호가 나온 회차. 최신순 최대 20개. */
  recent_appearances: NumberAppearance[]
}

/* ────────────────────────────────────────────────────────────
 * 회차-날짜 경량 목록 (003 신규)
 *
 * 기간 선택 UI 가 회차를 고를 때 날짜를 함께 보여주기 위한 것이다. 페이지네이션이 없다 —
 * 선택 UI 는 전체를 한 번에 받아야 한다. 회차당 두 필드뿐이라 1,200건이어도 가볍다.
 * ──────────────────────────────────────────────────────────── */

export interface RoundIndexEntry {
  round_no: number
  draw_date: string
}

export interface RoundIndex {
  total: number
  /** round_no 오름차순. */
  rounds: RoundIndexEntry[]
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
  /**
   * 이 단어가 **사용자가 적은 원문에 실제로 있었는가**(2026-08-28 계약 신설).
   *
   * ⚠ `dream_word` 는 사용자가 적은 단어가 아닐 수 있다. 형태소 분석의 유의어 확장 때문에
   *   `집` 하나가 `집안`·`건물` 을 데려오고, 그 둘은 표제어와 정확히 일치해 `gubun=1` 로
   *   내려온다. 화면이 그것을 "적어 주신 상징" 으로 세우면 사용자는 자기가 쓰지 않은 말을
   *   자기 말로 읽는다(→ docs/wiki/10-contracts/api-contract.md).
   *
   * ⚠ **선택 필드로 둔다.** 구버전 백엔드는 이 필드를 주지 않는다. 없으면 프론트가
   *   원문 포함 판정으로 되돌아간다 — 같은 규칙이라 분류가 달라지지 않는다.
   */
  from_text?: boolean
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

/* ────────────────────────────────────────────────────────────
 * 유튜브 영상 (2026-08-28 계약 신설)
 * ──────────────────────────────────────────────────────────── */

/**
 * 쇼츠 여부 **추정**.
 *
 * ⚠ **boolean 으로 바꾸지 않는다.** 쇼츠를 판별하는 공식 API 필드가 없어 재생시간·게시일로
 *   추정한 값이다(원본 화면비를 얻을 수 없다). `isShorts: true` 로 다루는 순간 추정이
 *   확정으로 둔갑한다(→ docs/wiki/10-contracts/api-contract.md 영상 절).
 * ⚠ `unknown` 을 `normal` 이나 `shorts` 어느 한쪽으로 밀지 않는다. 모르는 것을 한쪽으로
 *   밀면 그 순간 추정이 확정이 된다.
 */
export type ShortsHint = 'likely' | 'unlikely' | 'unknown'

/** 어느 복권의 영상인가. 회차만 보고 로또와 연금복권을 이으면 **조용히 틀린 번호**가 뜬다. */
export type VideoGame = 'lotto' | 'pension' | 'unknown'

/** 목록 필터. `all` 에서만 `unknown` 이 보인다. */
export type VideoKind = 'all' | 'normal' | 'shorts'

export interface VideoItem {
  id: number
  /** 유튜브 영상 ID(11자). URL 조립에 쓴다. */
  video_key: string
  /** ⚠ **원문 그대로.** 낱말을 바꾸거나 지우지 않는다(→ forbidden-expressions.md). */
  title: string
  channel: string | null
  /** 썸네일 URL. **핫링크한다** — 내려받아 저장하지 않는다(YouTube 정책). */
  thumbnail: string | null
  /** ISO 8601, KST(+09:00) */
  published_at: string
  /** 재생시간(초). 포맷은 프론트가 한다. */
  duration_sec: number | null
  views: number | null
  shorts_hint: ShortsHint
  /** 제목에서 파싱한 회차. 추첨 전 회차일 수 있다. */
  round: number | null
  game: VideoGame
  keywords: string[]
}

/**
 * 영상 상세. 계약상 `round` 가 있으면 그 회차의 당첨 정보를 함께 담을 수 있다
 * (백엔드 판단). 없으면 프론트가 회차 API 를 따로 부른다.
 *
 * ⚠ `round` 가 아직 추첨 전 회차일 수 있으므로 **회차 정보가 없는 경우가 정상 경로**다.
 */
export interface VideoDetail extends VideoItem {
  draw?: RoundDetail | null
}

/* ────────────────────────────────────────────────────────────
 * 운영자 전용 수집 로그 (2026-08-28 계약 신설)
 *
 * ⚠ 공개 API 가 아니다. 이 타입을 쓰는 화면은 `noindex` 이고 사이트맵·링크에 넣지 않는다.
 * ──────────────────────────────────────────────────────────── */

export type JobStatus = 'success' | 'failed' | 'running'

export interface JobSummary {
  job_name: string
  run_cnt: number
  success_cnt: number
  failed_cnt: number
  running_cnt: number
  collected_sum: number
  last_started_at: string | null
  /** 마지막으로 **성공한** 시각. 워커가 오래 멈춘 것을 이 값 하나로 알아챈다. */
  last_success_at: string | null
}

export interface JobLogLine {
  /** ISO 8601 (KST) */
  t: string
  lv: string
  logger: string
  msg: string
}

export interface JobLogItem {
  run_id: number
  job_name: string
  exec_type: string
  status: JobStatus
  started_at: string
  finished_at: string | null
  duration_sec: number | null
  collected_count: number | null
  error: string | null
  /**
   * 단계별 통과 건수.
   *
   * ⚠ **키가 잡마다 다르고 앞으로 늘어난다.** 화면이 키를 하드코딩해 표를 만들지 않는다 —
   *   받은 키를 그대로 순회한다. 그래야 워커가 단계를 추가해도 화면이 따라간다(계약).
   * ⚠ 2026-08-28 이전 실행에는 없다. `null` 을 정상으로 다룬다.
   */
  stat: Record<string, number> | null
  /** 그 실행의 WARNING 이상 로그. 위와 같은 이유로 `null` 일 수 있다. */
  logs: JobLogLine[] | null
}

/**
 * ⚠ 페이지네이션 봉투를 쓰지 **않는다.** 잡 이력은 끊임없이 쌓여 `OFFSET` 이면 조회 중에
 *   경계에서 같은 행이 두 번 보이거나 빠진다. `next_before_id` 를 다음 요청의 `before_id`
 *   로 넘기는 커서 방식이고, `total` 은 오지 않는다(수십만 행을 매번 세는 비용이 크다).
 */
export interface JobLogResult {
  summary: JobSummary[]
  items: JobLogItem[]
  next_before_id: number | null
}
