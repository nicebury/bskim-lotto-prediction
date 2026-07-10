"""꿈해몽 파이프라인의 조립부 — 형태소 분석 → 벡터 검색 → tier 별 번호 생성.

`analyzer` · `searcher` · `generator` 는 원본 프로젝트에서 이식한 그대로다. 이 파일은
그것들을 API 계약이 정한 응답 모양으로 엮기만 한다.

**전부 동기 함수다.** kiwipiepy 와 SentenceTransformer 는 CPU 를 오래 쥔다. 라우터가
`asyncio.to_thread` 로 감싼다.
"""
from __future__ import annotations

from pathlib import Path
from typing import Optional

from ..domain import traits as traits_mod
from . import generator
from .searcher import DreamMatch
from .state import get_analyzer, get_searcher

DISCLAIMER = "꿈해몽 번호는 재미용 콘텐츠입니다. 꿈과 당첨 사이에 인과관계는 없습니다."


def _match_to_dict(match: DreamMatch) -> dict:
    """`score` 와 `distance` 를 버린다.

    `searcher` 는 L2 거리를 0~1 로 뒤집은 값을 들고 있지만, 그것을 JSON 에 실으면
    사용자는 확률로 읽는다. `score` 는 금지 필드명이다
    (docs/wiki/40-domain/forbidden-expressions.md).
    """
    return {
        "gubun": match.gubun,
        "word": match.word,
        "numbers": match.lotto_number,
    }


def _tier_payload(tier: Optional[dict]) -> Optional[dict]:
    """generator 의 tier 결과를 API 모양으로. 풀이 비었으면 None 그대로 통과시킨다."""
    if not tier:
        return None
    return {
        "pool": tier["pool"],
        "sets": [
            {"numbers": combo, "traits": traits_mod.compute(combo)}
            for combo in tier["combos"]
        ],
    }


def recommend(
    text: str,
    *,
    chroma_path: Path,
    sets_per_tier: int = 10,
    seed: Optional[int] = None,
) -> dict:
    analyzer = get_analyzer()
    searcher = get_searcher(chroma_path)

    matched_words: list[dict] = []
    # gubun 별 번호 풀을 만들기 위한 평탄화 목록. generator 가 tier 를 누적한다.
    flat_matches: list[dict] = []

    for word in analyzer.analyze(text):
        exact, containing, similar = searcher.search(word)
        matches = [*exact, *containing, *similar]
        if not matches:
            # 사전에 없는 단어는 응답에서 아예 뺀다. 빈 `matches` 를 남기면 프론트가
            # "매칭됨" 목록에 근거 없는 단어를 렌더링한다.
            continue
        matched_words.append(
            {"dream_word": word, "matches": [_match_to_dict(m) for m in matches]}
        )
        flat_matches.extend(
            {"gubun": m.gubun, "lotto_number": m.lotto_number} for m in matches
        )

    tiers = generator.build_tier_sets(
        flat_matches, sets_per_tier=sets_per_tier, seed=seed
    )

    return {
        "text": text,
        "matched_words": matched_words,
        "tiers": {name: _tier_payload(tiers[name]) for name in ("tier1", "tier2", "tier3")},
        "disclaimer": DISCLAIMER,
    }
