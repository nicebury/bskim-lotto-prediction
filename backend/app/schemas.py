"""API 응답 모델.

여기 있는 필드명이 곧 공개 계약이다 (docs/wiki/10-contracts/api-contract.md).
DB 컬럼명과 다르며, 그 매핑은 `repository.py` 가 한다.

`probability` `win_rate` `accuracy` `confidence` `hit_rate` `expected_value` `score` 는
어떤 모델에도 없다. 스타일이 아니라 정책이다
(docs/wiki/40-domain/forbidden-expressions.md).
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, field_validator

# ── 공통 ────────────────────────────────────────────────────────────────


class Traits(BaseModel):
    """조합의 성향. 전부 여섯 숫자에서 직접 계산되는 사실이다."""

    odd_even: str = Field(examples=["3:3"], description="홀:짝")
    high_low: str = Field(examples=["3:3"], description="고:저 (고 = 23 이상)")
    sum: int
    range_distribution: dict[str, int]
    has_consecutive: bool
    tail_variety: int = Field(description="끝자리 종류 수 (1~6)")


class RecommendTraits(Traits):
    """번호 추천 응답용. 기준은 응답의 `hot_window` 다.

    `None` 은 "회차 데이터가 없어 셀 수 없었다" 는 뜻이다 — pure_random + 빈 DB.
    """

    hot_count: Optional[int] = None
    cold_count: Optional[int] = None


# ── 회차 ────────────────────────────────────────────────────────────────


class LottoRound(BaseModel):
    round_no: int
    draw_date: date
    numbers: list[int] = Field(min_length=6, max_length=6, description="항상 오름차순")
    bonus: int
    first_win_amount: Optional[int] = None
    first_winner_count: Optional[int] = None
    # 현재 수집 소스(네이버 검색 위젯)에 없어 거의 항상 null 이다. 공식 API 가 복구되면
    # 채워진다. 프론트는 null 을 `-` 로 표시한다.
    total_sell_amount: Optional[int] = None
    first_accum_amount: Optional[int] = None


class PrizeTier(BaseModel):
    rank: int
    winner_count: Optional[int] = None
    prize_per_game: Optional[int] = None


class LottoRoundDetail(LottoRound):
    # 2~5등 정보가 수집 소스에 없어 당분간 항상 빈 배열이다. 프론트는 빈 배열일 때
    # 해당 섹션을 렌더링하지 않는다.
    prize_tiers: list[PrizeTier] = []
    traits: Traits


class RoundPage(BaseModel):
    total: int
    page: int
    size: int
    items: list[LottoRound]


# ── 통계 ────────────────────────────────────────────────────────────────

# window 는 20/50/100 또는 "all" 이다.
WindowValue = Union[int, str]


class StatsBase(BaseModel):
    """통계 응답의 공통 머리. 네 통계 + 번호 통계가 모두 이것을 깐다.

    구간 메타 넷은 **어떤 방식으로 조회했든 항상** 담는다. 화면이
    "1213~1232회 (2026.02.28 ~ 2026.07.11)" 을 그릴 때 회차→날짜를 따로 왕복하지
    않게 하려는 것이다 (docs/wiki/10-contracts/api-contract.md).
    """

    # 기간 조회(from_round~to_round)면 null 이다. "최근 N회" 라는 개념이 없기 때문이다.
    window: Optional[WindowValue] = None
    # 요청한 window 보다 데이터가 적을 수 있다. 프론트는 둘이 다를 수 있음을 전제로 쓴다.
    rounds_analyzed: int
    # 요청값이 아니라 **실제로 집계에 쓰인** 값이다. 데이터 밖 범위는 교집합으로 잘리고,
    # 잘린 결과가 여기 담긴다. rounds_analyzed 가 0 이면 넷 다 null.
    from_round: Optional[int] = None
    to_round: Optional[int] = None
    from_date: Optional[date] = None
    to_date: Optional[date] = None


class FrequencyResponse(StatsBase):
    include_bonus: bool
    counts: dict[str, int] = Field(description="번호 1~45 전부. 안 나온 번호는 0")


class HotNumber(BaseModel):
    number: int
    count: int
    # count / rounds_analyzed. 과거 출현 비율이지 다음 회차 확률이 아니다 — 그래서
    # 이름이 probability 가 아니라 appearance_rate 다.
    appearance_rate: float = Field(description="지난 window 회 중 나온 비율 (0.0~1.0)")
    last_seen_round: Optional[int] = Field(
        default=None, description="마지막으로 나온 회차 번호. 역대로 없으면 null"
    )
    trend: str = Field(description='"up" | "down" | "flat". 최근 절반 vs 이전 절반 비교')


class OverdueNumber(BaseModel):
    number: int
    rounds_since: int = Field(description="최신 회차 기준. 역대 전체에서 계산한다")
    last_seen_round: Optional[int] = Field(
        default=None, description="마지막으로 나온 회차 번호. 역대로 없으면 null"
    )


class HotColdResponse(StatsBase):
    hot: list[HotNumber]
    cold: list[HotNumber]
    overdue: list[OverdueNumber]


class NumberPair(BaseModel):
    numbers: list[int] = Field(min_length=2, max_length=2, description="항상 오름차순 2개")
    count: int = Field(description="window 안에서 두 번호가 함께 나온 횟수")


class PairsResponse(StatsBase):
    number: Optional[int] = Field(
        default=None, description="기준 번호. 없으면 전체 쌍 중 상위"
    )
    pairs: list[NumberPair]


class SumRange(BaseModel):
    min: int = Field(description="합계의 10퍼센타일")
    max: int = Field(description="합계의 90퍼센타일")
    peak: int = Field(description="합계의 중앙값")


class PatternResponse(StatsBase):
    odd_even: dict[str, float] = Field(description="관찰된 빈도의 비율. 비율 내림차순")
    high_low: dict[str, float]
    consecutive_ratio: float
    sum_range: SumRange
    tail_variety_avg: float
    tail_counts: dict[str, int]
    # 합계의 10 단위 구간별 **회차 수**(비율이 아니다 — rounds_analyzed 와 더해 검증할 수
    # 있어야 한다). 키는 "100-109" 형식, 오름차순, 데이터가 있는 구간만.
    sum_histogram: dict[str, int] = {}
    # 연속번호 쌍 개수별 비율. `1 - consecutive_counts["0"] == consecutive_ratio` 다.
    consecutive_counts: dict[str, float] = {}


class NumberCompanion(BaseModel):
    number: int = Field(description="함께 나온 상대 번호")
    count: int


class NumberAppearance(BaseModel):
    round_no: int
    draw_date: Optional[date] = None


class NumberStatsResponse(StatsBase):
    """번호 하나의 통계.

    `rank` 때문에 별도 엔드포인트가 필요하다 — 45개를 정렬해야 나오는 값이고, 그 집계를
    브라우저에서 하면 서버와 숫자가 갈라진다.

    금지 표현 규약이 그대로 적용된다. 여기에도 확률·적중·기대값 계열 필드는 없다.
    """

    number: int
    count: int = Field(description="구간 안 출현 횟수")
    appearance_rate: float = Field(
        description="count / rounds_analyzed. 과거 출현 비율이지 다음 회차 확률이 아니다"
    )
    rank: Optional[int] = Field(
        default=None,
        description="출현 횟수 순위(1이 가장 많이 나온 번호). 구간이 비면 null",
    )
    rank_total: int = Field(description="항상 45. 화면이 '45개 중 3위' 로 쓴다")
    trend: str = Field(description='"up" | "down" | "flat"')
    # 아래 셋은 구간이 아니라 역대 전체 기준이다 (계약이 그렇게 못박았다).
    last_seen_round: Optional[int] = None
    rounds_since: int = Field(description="최신 회차 기준 미출현 회차 수")
    max_gap: Optional[int] = Field(
        default=None, description="역대 최장 미출현 간격(회차). 역대로 없으면 null"
    )
    companions: list[NumberCompanion] = Field(
        default=[], description="구간 안에서 함께 나온 상대. 많은 순 최대 5개"
    )
    recent_appearances: list[NumberAppearance] = Field(
        default=[], description="구간 안 출현 회차. 최신순 최대 20개"
    )


class RoundIndexItem(BaseModel):
    round_no: int
    draw_date: date


class RoundIndexResponse(BaseModel):
    """기간 선택 UI 전용 경량 목록. 페이징이 없다 — 선택 UI 는 전체를 한 번에 받는다."""

    total: int
    rounds: list[RoundIndexItem]


# ── 번호 추천 ───────────────────────────────────────────────────────────


class RecommendSet(BaseModel):
    numbers: list[int] = Field(min_length=6, max_length=6)
    traits: RecommendTraits


class RecommendResponse(BaseModel):
    strategy: str
    seed: Optional[int] = None
    sets: list[RecommendSet]
    hot_window: Optional[int] = Field(
        default=None, description="hot_count/cold_count 의 기준 회차 수"
    )
    # 계약이 강제하는 필드다. 프론트가 면책 고지를 잊지 못하게 한다.
    disclaimer: str


# ── 꿈해몽 ──────────────────────────────────────────────────────────────


class DreamKeyword(BaseModel):
    slug: str
    word: str


class DreamKeywordsResponse(BaseModel):
    total: int
    keywords: list[DreamKeyword]


class DreamMatchOut(BaseModel):
    gubun: int = Field(description="1=정확일치, 2=포함, 3=벡터 유사")
    word: str
    numbers: list[int]


class DreamWordOut(BaseModel):
    dream_word: str
    # ⚠ `dream_word` 는 사용자가 적은 단어가 **아닐 수 있다.** 형태소 분석 1단계의 유의어
    # 확장 때문에 `집` 하나가 `집안`·`건물` 을 데려오고, 그 둘은 표제어와 정확히 일치해
    # `gubun=1` 로 내려온다. `from_text` 가 그 둘을 가른다 — 화면이 확장된 단어를 "적어
    # 주신 상징" 으로 세우면 사용자는 자기가 쓰지 않은 말을 자기 말로 읽는다.
    # 판정은 원문에 대한 단순 문자열 포함이다.
    from_text: bool = Field(
        description="사용자가 적은 원문에 이 단어가 그대로 들어 있는가"
    )
    matches: list[DreamMatchOut]


class DreamSet(BaseModel):
    numbers: list[int] = Field(min_length=6, max_length=6)
    traits: Traits


class DreamTier(BaseModel):
    pool: list[int]
    sets: list[DreamSet]


class DreamTiers(BaseModel):
    # 풀이 비면 null. 프론트는 그 탭을 렌더링하지 않는다.
    tier1: Optional[DreamTier] = None
    tier2: Optional[DreamTier] = None
    tier3: Optional[DreamTier] = None


class DreamRequest(BaseModel):
    text: str = Field(min_length=1, max_length=500)
    sets_per_tier: int = Field(default=10, ge=1, le=30)
    seed: Optional[int] = None
    # 사용자가 "이 번호는 쓰기 싫다" 고 뺀 번호. 풀에서도 빼고 채움에서도 뺀다.
    #
    # 상한이 39인 이유: 6개를 만들려면 최소 6개가 남아야 한다(45 - 39 = 6). 40개를
    # 빼면 조합 자체가 불가능한데, 그 상태로 받아 두면 빈 결과가 나오고 화면은 원인을
    # 알 수 없다. 만들 수 없는 요청은 만들기 전에 422 로 거절한다.
    exclude: list[int] = Field(
        default_factory=list,
        max_length=39,
        description="제외할 번호(1~45). 최대 39개 — 6개를 만들 여지를 남긴다",
    )

    @field_validator("exclude")
    @classmethod
    def _check_exclude(cls, v: list[int]) -> list[int]:
        """범위를 여기서 막는다.

        범위 밖 번호를 조용히 무시하면 사용자는 45를 뺐다고 믿는데 45가 계속 나온다.
        오타를 오타라고 알려 주는 편이 낫다.
        """
        bad = [n for n in v if not (1 <= n <= 45)]
        if bad:
            raise ValueError(f"1~45 를 벗어난 번호입니다: {bad}")
        return v


class DreamRecommendResponse(BaseModel):
    text: str
    matched_words: list[DreamWordOut]
    tiers: DreamTiers
    disclaimer: str


# ── 뉴스 ────────────────────────────────────────────────────────────────


class NewsItem(BaseModel):
    id: int
    title: str
    description: Optional[str] = Field(
        default=None, description="네이버 API 요약문. 기사 원문이 아니다"
    )
    link: str
    orig_link: Optional[str] = None
    source: str
    pub_date: Optional[datetime] = None
    keywords: list[str] = []


class NewsPage(BaseModel):
    total: int
    page: int
    size: int
    items: list[NewsItem]


# ── AI 번호추천 시뮬레이터 ──────────────────────────────────────────────
# 계약: docs/wiki/10-contracts/api-contract.md 의 'AI 번호추천 시뮬레이터' 절


class SimulateRequest(BaseModel):
    sets: int = Field(default=5, ge=1, le=10)
    # ⚠ 자유 정수로 받지 않는다. 화면이 세 단계만 제공하고, 열린 값을 받으면 누군가
    # 1,000만을 넣어 서버를 오래 붙잡는다 — 몬테카를로를 한 번에 하나만 돌리기로 한
    # 결정(0012)과 같은 이유다. 그 외 값은 422 다.
    trials: Literal[10_000, 50_000, 100_000] = 100_000
    seed: Optional[int] = None


class StageNumberCount(BaseModel):
    number: int
    # ⚠ 정규화 점수가 아니라 **실제 횟수**다. 화면이 "34번이 187회" 라고 말하고,
    # 사용자가 검증할 수 있는 것은 횟수뿐이다.
    count: int


class StageNumberGap(BaseModel):
    number: int
    rounds_since: int


class StageFrequency(BaseModel):
    rounds_analyzed: int
    # 공개 통계(`/stats/frequency`)의 기본값(false)과 다르다. 용도가 달라서이고,
    # 이 필드를 함께 실어 화면이 그 사실을 밝힐 수 있게 한다.
    include_bonus: bool
    most: list[StageNumberCount]
    least: list[StageNumberCount]


class StageCycle(BaseModel):
    longest_waiting: list[StageNumberGap]


class StageTrend(BaseModel):
    window: int
    recency_weight: float = Field(
        description="최근/과거 가중치 비. 분석기의 실제 규칙에서 온 값이다"
    )
    rising: list[StageNumberCount]


class StageSumRange(BaseModel):
    from_: int = Field(alias="from")
    to: int
    rate: float

    model_config = ConfigDict(populate_by_name=True)


class StagePattern(BaseModel):
    odd_even_3_3_rate: float
    sum_range: StageSumRange
    consecutive_rate: float
    tail_variety_avg: float


class StageEnsemble(BaseModel):
    """★ 번호별 **순위만** 준다.

    `score`·`weight`·`probability` 를 담지 않는다. 시안의 "최종 점수를 매깁니다" 라는
    **설명 문구**와 그 점수를 **응답 필드로 노출하는 것**은 다르다 — 설명은 알고리즘이
    무엇을 하는지 말하는 것이고, 필드는 사용자가 그 값을 근거로 삼게 만든다.
    """

    top_numbers: list[int]


class StageMonteCarlo(BaseModel):
    trials: int
    # "패턴 필터를 통과한 조합 수" 라는 사실이다. 당첨 가능성을 뜻하지 않는다는 것은
    # 프론트가 문구로 밝힌다.
    valid_combinations: int
    filtered_out: int


class SimulateStages(BaseModel):
    """계산할 수 없는 단계는 **`null`** 이다. 빈 값을 0 으로 채우지 않는다 —
    화면은 `null` 인 단계를 "이번에는 수치를 함께 보여드리지 못했습니다" 로 표시한다."""

    frequency: Optional[StageFrequency] = None
    cycle: Optional[StageCycle] = None
    trend: Optional[StageTrend] = None
    pattern: Optional[StagePattern] = None
    ensemble: Optional[StageEnsemble] = None
    montecarlo: Optional[StageMonteCarlo] = None


class SimulateResponse(BaseModel):
    sets: list[RecommendSet]
    trials: int
    seed: Optional[int] = None
    hot_window: Optional[int] = None
    stages: SimulateStages
    disclaimer: str


# ── 조합 분석 ───────────────────────────────────────────────────────────
# 계약: docs/wiki/10-contracts/api-contract-analysis.md


class AnalyzeNumber(BaseModel):
    number: int
    # ⚠ 보너스를 세지 않는다. 보너스는 `bonus_count` 로 따로 낸다 — 당첨번호와 성격이
    # 다르고, 섞으면 "역대 152번" 이 무엇의 152번인지 설명할 수 없게 된다.
    total_count: int
    recent_20: int
    recent_50: int
    last_seen_round: Optional[int] = None
    # 마지막 출현이 없으면 "몇 회차째 안 나왔는가" 도 알 수 없다. 전체 회차 수로 채우면
    # 없는 사실이 생긴다.
    rounds_since: Optional[int] = None
    max_gap: Optional[int] = None
    bonus_count: int
    tail: int = Field(description="끝수(1의 자리). 41 → 1")
    color_band: str = Field(description="1-10 | 11-20 | 21-30 | 31-40 | 41-45")


class FrequencyGridItem(BaseModel):
    number: int
    # ⚠ 비율이 아니라 개수다. 프론트가 최댓값으로 나눠 색 농도를 정한다.
    count: int


class AnalyzeReference(BaseModel):
    """역대 분포. 화면이 "내 값이 흔한가" 를 보여주는 데 쓴다.

    `*_share` 는 **역대에서 관찰된 비율**이지 다음 회차의 확률이 아니다 —
    이름에 `probability` 를 쓰지 않는 이유다 (forbidden-expressions.md).
    """

    sum_histogram: dict[str, int] = Field(description="회차 수. 비율이 아니다")
    sum_band_share: float
    odd_even_share: float
    high_low_share: float
    consecutive_share: float
    ac_histogram: dict[str, float]
    # 첫 회차는 직전이 없어 이월수를 정의할 수 없다. 회차가 하나뿐이면 null.
    carryover_avg: Optional[float] = None


class AnalyzeCombination(BaseModel):
    sum: int
    odd_even: str
    high_low: str = Field(description="고 = 23 이상. Traits 와 같은 정의")
    consecutive_pairs: int
    tail_sum: int
    same_tail_pairs: int
    ac_value: int = Field(description="차이값 15개 중 서로 다른 값의 개수 - 5. 0~10")
    multiples_of_3: int
    prime_count: int = Field(description="1은 소수가 아니다")
    carryover: int = Field(description="직전 회차와 겹치는 개수. 보너스 제외")
    reference: AnalyzeReference


class ClosestRound(BaseModel):
    round_no: int
    draw_date: Optional[date] = None
    numbers: list[int] = Field(min_length=6, max_length=6)
    bonus: int
    matched: list[int] = Field(description="겹친 번호. 화면이 하이라이트한다")
    match_count: int
    bonus_matched: bool
    rank: Optional[int] = None


class AnalyzePastMatch(BaseModel):
    # 0~6 일곱 키를 모두 담는다. 0 인 키를 빼면 화면이 "데이터가 없는 것" 과
    # "0회인 것" 을 구분할 수 없다. 값의 합은 rounds_analyzed 와 같다.
    distribution: dict[str, int]
    # ⚠ 보너스를 본다. 5개 일치 중 보너스까지 맞으면 2등, 아니면 3등이다.
    # distribution["5"] 는 둘을 합친 수이고 이쪽은 나눈 수다 - 안 맞으면 버그다.
    rank_counts: dict[str, int]
    closest: list[ClosestRound]
    # null 이 아니라 빈 배열이다. 비어 있다는 것 자체가 화면에 쓸 정보다.
    exact_match_rounds: list[int]


class RetrospectPrize(BaseModel):
    rank: int
    count: int
    amount_each: int
    amount: int


class RetrospectUnpriced(BaseModel):
    """금액을 확정할 수 없는 등위(1~3등).

    회차마다 총 판매액과 당첨자 수에 따라 달라지고 3등 금액은 데이터 소스에 없다.
    `returned`·`net` 계산에서 **뺀다** - 0 이나 평균으로 메우면 합계가 거짓말이 된다.
    """

    rank: int
    count: int


class AnalyzeRetrospect(BaseModel):
    rounds: int
    ticket_price: int
    spent: int
    prizes: list[RetrospectPrize]
    unpriced: list[RetrospectUnpriced]
    returned: int
    # `net` 이 음수인 것은 사실 서술이다. "기대 수익" 같은 이름을 붙이지 않는다.
    net: int


class AnalyzeResponse(BaseModel):
    numbers: list[int] = Field(min_length=6, max_length=6, description="오름차순")
    rounds_analyzed: int
    from_round: int
    to_round: int
    latest_draw_date: Optional[date] = None
    per_number: list[AnalyzeNumber]
    frequency_grid: list[FrequencyGridItem]
    combination: AnalyzeCombination
    past_match: AnalyzePastMatch
    retrospect: AnalyzeRetrospect
    # 면책은 백엔드가 내려준다 - 프론트가 잊지 못하게 하려는 장치다.
    disclaimer: str


# ── 영상 ────────────────────────────────────────────────────────────────


class VideoItem(BaseModel):
    """유튜브 영상 하나.

    `made_for_kids`·`embeddable`·`privacy_status` 가 **없는 것은 누락이 아니다.** 표시
    조건 WHERE 절의 재료일 뿐이고 계약이 응답에 내보내지 말라고 정했다
    (docs/wiki/10-contracts/api-contract.md).

    `link` 도 없다. `video_key` 에서 파생 가능하고, 파생값을 담으면 일반/쇼츠/임베드
    세 형태 중 어느 것을 담을지부터 정해야 한다 — 그건 화면의 결정이다.
    """

    id: int
    video_key: str = Field(description="유튜브 영상 ID(11자). URL 조립에 쓴다")
    title: str = Field(description="원문 그대로. 낱말을 바꾸지 않는다")
    channel: Optional[str] = None
    thumbnail: Optional[str] = Field(default=None, description="핫링크용 URL")
    published_at: datetime
    duration_sec: Optional[int] = Field(default=None, description="초. 포맷은 프론트가 한다")
    views: Optional[int] = None
    # ★ boolean 이 아니라 3-값 문자열이다. 쇼츠를 판별하는 공식 API 필드가 없어
    # 재생시간·게시일로 추정한 값이므로, `is_shorts: true` 로 바꾸면 추정이 확정으로
    # 둔갑한다. `unknown` 은 normal·shorts 어느 목록에도 들어가지 않는다.
    shorts_hint: str = Field(description="likely | unlikely | unknown")
    round: Optional[int] = Field(default=None, description="제목에서 파싱한 회차")
    game: str = Field(description="lotto | pension | unknown")
    keywords: list[str] = []


class VideoPage(BaseModel):
    total: int
    page: int
    size: int
    items: list[VideoItem]


class VideoDetail(VideoItem):
    """상세. 회차 정보를 함께 담을 수 있다.

    ★ `draw` 는 **`game='lotto'` 이고 그 회차가 실제로 있을 때만** 채워진다. 회차 번호만
    보고 붙이면 연금복권 330회 영상에 로또 330회 당첨번호가 달린다 — 에러 없이 조용히
    틀린 번호가 화면에 뜨는 종류의 사고다 (docs/wiki/10-contracts/db-schema.md).

    아직 추첨 전 회차를 예고하는 영상이 있으므로 **비어 있는 것이 정상 경로**다. 404 가
    아니다.
    """

    draw: Optional[LottoRound] = Field(
        default=None,
        description="game='lotto' 이고 해당 회차가 존재할 때만. 그 외에는 null",
    )


# ── 운영자 전용: 수집 잡 이력 ────────────────────────────────────────────


class AdminLoginRequest(BaseModel):
    """아이디 · 비밀번호 · OTP 세 가지를 함께 받는다.

    ⚠ 아이디·비밀번호'만' 으로 하면 종전(64자 랜덤 토큰)보다 **약해진다** — 사람이
    기억하는 비밀번호는 훨씬 추측하기 쉽다. OTP 가 그 약점을 덮는다.
    """

    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=256)
    otp: str = Field(
        min_length=6, max_length=8, description="인증 앱의 여섯 자리 (TOTP)"
    )


class JobLogSummaryItem(BaseModel):
    job_name: str
    run_cnt: int
    success_cnt: int
    failed_cnt: int
    running_cnt: int
    collected_sum: int
    last_started_at: Optional[datetime] = None
    # 마지막 실행이 실패했을 때 이 화면에서 가장 중요한 값이다 — "마지막으로 성공한
    # 것이 언제인가". 워커가 33일 멈춰 있던 사고를 이 값 하나로 알아챌 수 있다.
    last_success_at: Optional[datetime] = None


class JobLogItem(BaseModel):
    run_id: int
    job_name: str
    exec_type: str = Field(description="cron | manual")
    status: str = Field(description="running | success | failed")
    started_at: datetime
    finished_at: Optional[datetime] = None
    duration_sec: Optional[int] = Field(
        default=None, description="아직 도는 잡은 null — 모르는 것을 지어내지 않는다"
    )
    collected_count: int
    error: Optional[str] = None
    # ⚠ `stat`·`logs` 는 **null 일 수 있다.** 2026-08-28 이전 실행에는 두 컬럼이 없었다.
    # 빈 dict/list 로 바꾸지 않는다 — "단계 정보가 없는 실행" 과 "전부 0인 실행" 은
    # 다르고, 그 구분이 사라지면 화면이 0 을 사실처럼 그린다.
    #
    # `stat` 의 키는 **잡마다 다르고 앞으로 늘어난다.** 백엔드가 스키마를 강제하지
    # 않으므로 프론트도 키를 하드코딩하지 않는다 — 받은 키를 그대로 순회한다.
    stat: Optional[dict] = None
    logs: Optional[list] = None


class JobLogsResponse(BaseModel):
    """⚠ **페이지네이션 봉투를 쓰지 않는다.**

    잡 이력은 조회하는 동안에도 계속 추가되므로 `OFFSET` 이면 경계에서 같은 행이 두 번
    보이거나 빠진다. `next_before_id` 를 다음 요청의 `before_id` 로 넘기는 커서 방식이다.
    `total` 도 주지 않는다 — 수십만 행을 매번 세는 비용이 화면에 주는 값보다 크다.
    """

    summary: list[JobLogSummaryItem]
    items: list[JobLogItem]
    next_before_id: Optional[int] = Field(
        default=None, description="더 없으면 null"
    )


# ── 사이트맵 ────────────────────────────────────────────────────────────


class SitemapRound(BaseModel):
    round_no: int
    lastmod: date


class SitemapNews(BaseModel):
    id: int
    lastmod: Optional[datetime] = None


class SitemapEntries(BaseModel):
    rounds: list[SitemapRound]
    news: list[SitemapNews]
