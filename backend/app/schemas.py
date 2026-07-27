"""API 응답 모델.

여기 있는 필드명이 곧 공개 계약이다 (docs/wiki/10-contracts/api-contract.md).
DB 컬럼명과 다르며, 그 매핑은 `repository.py` 가 한다.

`probability` `win_rate` `accuracy` `confidence` `hit_rate` `expected_value` `score` 는
어떤 모델에도 없다. 스타일이 아니라 정책이다
(docs/wiki/40-domain/forbidden-expressions.md).
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Optional, Union

from pydantic import BaseModel, Field

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
    window: WindowValue
    # 요청한 window 보다 데이터가 적을 수 있다. 프론트는 둘이 다를 수 있음을 전제로 쓴다.
    rounds_analyzed: int


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
