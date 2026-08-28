"""꿈해몽 조합의 **모자란 자리**를 통계로 채우는 경로.

2026-08-27 프론트 세션 요청으로 채움 방식이 `1~45 무작위` → 번호별 통계 점수 기반으로
바뀌었다 (docs/wiki/40-domain/dream-pipeline.md). 화면이 "모자란 번호는 통계로
채웠습니다" 라고 안내하려면 그 말이 사실이어야 한다.

여기서 지키려는 성질은 넷이다.

1. 채움 번호가 실제로 점수 높은 쪽에 치우친다 (안내 문구가 사실인가)
2. 꿈에서 나온 번호는 통계에 흔들리지 않는다 (프론트의 pool 대조가 성립하는가)
3. 같은 seed 는 같은 결과를 낸다 (재현성 계약)
4. 점수가 없으면 조용히 균등으로 돌아가되 조합은 정상이다 (화면이 죽지 않는가)

DB 를 쓰지 않는다. 회차는 `conftest.make_draws` 가 만든다.
"""
from __future__ import annotations

from collections import Counter

import numpy as np
import pytest

from app.domain import number_scores
from app.dream import generator
from app.prediction import predictor

from .conftest import make_draws


@pytest.fixture(autouse=True)
def _clear_cache():
    """모듈 캐시가 테스트 사이에 새지 않게 한다.

    캐시는 프로세스 전역이라, 한 테스트가 채운 점수를 다음 테스트가 그대로 본다.
    그러면 `compute` 를 고쳐도 테스트가 통과하는 최악의 초록불이 만들어진다.
    """
    number_scores.invalidate()
    yield
    number_scores.invalidate()


# ── 점수 자체 ────────────────────────────────────────────────────────────


def test_점수는_45개_번호_전부에_대해_나온다():
    scores = number_scores.compute(make_draws(200))

    assert scores is not None
    assert set(scores) == set(range(1, 46))
    assert all(v >= 0.0 for v in scores.values())


def test_회차가_모자라면_점수를_만들지_않는다():
    """추천 API 가 통계 전략을 막는 기준(50회차)과 같은 값을 쓴다."""
    assert number_scores.compute(make_draws(number_scores.MIN_ROUNDS_FOR_FILL - 1)) is None
    assert number_scores.compute(make_draws(number_scores.MIN_ROUNDS_FOR_FILL)) is not None


def test_추천_API_의_ensemble_과_같은_점수를_쓴다():
    """두 화면이 '눈여겨볼 번호' 를 다르게 계산하면 사용자는 어느 쪽도 믿지 않는다.

    `predictor.predict()` 의 `ensemble.top10` 은 몬테카를로 **이전** 단계라, 이 모듈이
    같은 분석기를 같은 가중치로 부른다면 상위 10개와 그 점수가 정확히 일치해야 한다.
    시뮬레이션 횟수를 최소로 낮춘 이유는 여기서 검증하려는 것이 조합 선별이 아니라
    번호별 점수이기 때문이다.
    """
    draws = make_draws(300)

    scores = number_scores.compute(draws)
    assert scores is not None
    mine = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)[:10]
    mine_rounded = [{"number": n, "score": round(float(v), 4)} for n, v in mine]

    theirs = predictor.predict(draws, sets=1, simulations=100, seed=1)["ensemble"]["top10"]

    assert mine_rounded == theirs


# ── 가중 추출 ────────────────────────────────────────────────────────────


def test_점수가_높은_번호가_더_자주_채워진다():
    """가장 높은 점수 한 번호와 가장 낮은 한 번호의 등장 횟수를 비교한다.

    '몇 배' 를 단정하지 않는 이유: 점수 비율은 회차 데이터에 따라 달라지고, 그 값을
    테스트에 박으면 데이터가 바뀔 때마다 코드가 멀쩡한데 테스트가 깨진다. 검증할
    성질은 **순서**다 — 높은 쪽이 낮은 쪽보다 자주 나오는가.
    """
    scores = {n: 0.05 for n in range(1, 46)}
    scores[7] = 1.0  # 압도적으로 높은 하나
    rng = np.random.default_rng(42)

    counter: Counter[int] = Counter()
    for _ in range(2000):
        counter.update(
            number_scores.weighted_pick(scores, exclude=set(), count=6, rng=rng)
        )

    낮은_번호_평균 = sum(counter[n] for n in range(1, 46) if n != 7) / 44
    assert counter[7] > 낮은_번호_평균 * 3


def test_이미_뽑힌_번호는_채움에_다시_나오지_않는다():
    rng = np.random.default_rng(0)
    exclude = {1, 2, 3}

    for _ in range(200):
        picked = number_scores.weighted_pick(
            None, exclude=exclude, count=3, rng=rng
        )
        assert len(picked) == 3
        assert len(set(picked)) == 3
        assert not (set(picked) & exclude)


def test_점수가_전부_0_이면_균등으로_되돌아간다():
    """비율을 만들 수 없는 입력이다. 예외로 죽지 않고 뽑아야 한다."""
    rng = np.random.default_rng(0)
    picked = number_scores.weighted_pick(
        {n: 0.0 for n in range(1, 46)}, exclude=set(), count=6, rng=rng
    )
    assert len(set(picked)) == 6


def test_음수_점수가_섞여도_죽지_않는다():
    """지금 분석기는 음수를 내지 않지만, 나오면 numpy 가 예외를 던져 꿈해몽이 500 이 된다."""
    scores = {n: -1.0 for n in range(1, 46)}
    scores[10] = 1.0
    rng = np.random.default_rng(0)

    picked = number_scores.weighted_pick(scores, exclude=set(), count=6, rng=rng)
    assert len(set(picked)) == 6
    assert 10 in picked  # 유일하게 양수인 번호는 반드시 뽑힌다


# ── generator 와의 결합 ──────────────────────────────────────────────────


def _items(gubun: int, numbers: list[int]) -> list[dict]:
    return [{"gubun": gubun, "lotto_number": numbers}]


def test_꿈에서_나온_번호는_반드시_조합에_들어간다():
    """프론트는 `pool` 과 `numbers` 를 대조해 '꿈에서 온 번호' 를 표시한다.

    통계 채움이 풀의 번호를 밀어내면 그 표시가 어긋난다 — 채우는 것은 빈자리뿐이다.
    """
    scores = {n: 0.001 for n in range(1, 46)}
    for n in (40, 41, 42, 43, 44, 45):
        scores[n] = 1.0  # 풀 밖 번호에 극단적으로 높은 점수

    pool = [3, 5]
    result = generator.build_tier_sets(
        _items(1, pool), sets_per_tier=10, seed=1, fill_scores=scores
    )

    combos = result["tier1"]["combos"]
    assert combos
    for combo in combos:
        assert set(pool).issubset(combo)
        assert len(combo) == 6
        assert len(set(combo)) == 6


def test_풀이_6개_이상이면_채움이_일어나지_않는다():
    """채울 자리가 없으므로 점수를 바꿔도 결과가 같아야 한다.

    이 성질이 깨지면 통계가 꿈 번호의 선택까지 흔들고 있다는 뜻이다.
    """
    pool = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    높은_점수 = {n: (1.0 if n <= 5 else 0.001) for n in range(1, 46)}

    없이 = generator.build_tier_sets(_items(1, pool), sets_per_tier=10, seed=7)
    가지고 = generator.build_tier_sets(
        _items(1, pool), sets_per_tier=10, seed=7, fill_scores=높은_점수
    )

    assert 없이["tier1"]["combos"] == 가지고["tier1"]["combos"]


def test_같은_seed_는_같은_조합을_낸다():
    """재현성은 계약이다. 채움 방식이 바뀌어도 이 성질은 유지된다."""
    scores = number_scores.compute(make_draws(200))
    pool = [11, 22]

    첫번째 = generator.build_tier_sets(
        _items(1, pool), sets_per_tier=10, seed=99, fill_scores=scores
    )
    두번째 = generator.build_tier_sets(
        _items(1, pool), sets_per_tier=10, seed=99, fill_scores=scores
    )

    assert 첫번째 == 두번째


def test_seed_가_다르면_조합도_달라진다():
    scores = number_scores.compute(make_draws(200))
    pool = [11, 22]

    a = generator.build_tier_sets(
        _items(1, pool), sets_per_tier=10, seed=1, fill_scores=scores
    )
    b = generator.build_tier_sets(
        _items(1, pool), sets_per_tier=10, seed=2, fill_scores=scores
    )

    assert a["tier1"]["combos"] != b["tier1"]["combos"]


def test_점수가_없어도_조합은_정상이다():
    """회차가 모자라거나 DB 가 잘못돼도 화면은 살아 있어야 한다."""
    result = generator.build_tier_sets(
        _items(1, [7]), sets_per_tier=10, seed=3, fill_scores=None
    )

    combos = result["tier1"]["combos"]
    assert len(combos) == 10
    for combo in combos:
        assert len(combo) == 6
        assert len(set(combo)) == 6
        assert combo == sorted(combo)
        assert all(1 <= n <= 45 for n in combo)
        assert 7 in combo


@pytest.mark.parametrize("pool_size", [1, 2, 3, 4, 5])
def test_가중_채움에서도_요청한_개수를_채운다(pool_size: int):
    """⚠ 가중 추출은 균등보다 같은 조합을 자주 만든다.

    `generate_unique_combos` 는 중복을 버리고 최대 1,000회만 시도하므로, 편향이 세면
    요청 개수를 못 채울 수 있다. 풀이 작을수록(=채울 자리가 많을수록) 조합 공간은 넓어
    안전하고, 풀이 5개일 때가 가장 좁다(빈자리 1개 = 만들 수 있는 조합 40개).
    최댓값인 30세트로 그 경계를 확인한다.
    """
    scores = number_scores.compute(make_draws(300))
    pool = list(range(1, pool_size + 1))

    result = generator.build_tier_sets(
        _items(1, pool), sets_per_tier=30, seed=5, fill_scores=scores
    )

    combos = result["tier1"]["combos"]
    assert len(combos) == 30
    assert len({tuple(c) for c in combos}) == 30


# ── 캐시 ─────────────────────────────────────────────────────────────────


def test_캐시는_최신_회차로_찾는다():
    draws = make_draws(200)
    assert number_scores.get_cached(200) is None

    scores = number_scores.load(draws)
    assert scores is not None
    assert number_scores.get_cached(200) == scores


def test_회차가_늘면_옛_캐시는_남지_않는다():
    """항목이 쌓이면 오래 떠 있는 프로세스에서 메모리가 조금씩 샌다."""
    number_scores.load(make_draws(200))
    number_scores.load(make_draws(201))

    assert number_scores.get_cached(200) is None
    assert number_scores.get_cached(201) is not None


def test_캐시가_계산_결과를_바꾸지_않는다():
    draws = make_draws(200)
    직접 = number_scores.compute(draws)
    캐시경유 = number_scores.load(draws)

    assert 직접 == 캐시경유


def test_회차가_모자라면_캐시에_넣지_않는다():
    draws = make_draws(number_scores.MIN_ROUNDS_FOR_FILL - 1)

    assert number_scores.load(draws) is None
    assert number_scores.get_cached(draws[-1].round_no) is None


# ── 제외 번호 (2026-08-28, 프론트 요청) ──────────────────────────────────


def test_제외한_번호는_풀에서도_채움에서도_나오지_않는다():
    """프론트가 3배수로 받아 걸러 내던 우회를 걷어내기 위한 것이다.

    풀에서만 빼고 채움을 그대로 두면 "뺐는데 또 나온다" 가 되고, 사용자에게는 제외
    스위치가 고장 난 것으로 읽힌다.
    """
    scores = number_scores.compute(make_draws(300))
    pool = [3, 5, 7, 9]
    banned = {3, 7, 11, 22, 33}

    result = generator.build_tier_sets(
        _items(1, pool), sets_per_tier=10, seed=1,
        fill_scores=scores, exclude=banned,
    )

    tier = result["tier1"]
    assert tier is not None
    # 응답의 pool 에서도 빠진다 — 화면이 "꿈에서 온 번호" 로 표시할 근거가 사라지므로
    assert set(tier["pool"]) == {5, 9}
    for combo in tier["combos"]:
        assert not (set(combo) & banned)
        assert len(combo) == 6


def test_풀이_통째로_제외되면_그_tier_는_없다():
    """빈 풀과 같게 다룬다 — 프론트가 그 탭을 렌더링하지 않는다."""
    result = generator.build_tier_sets(
        _items(1, [3, 5]), sets_per_tier=5, seed=1, exclude={3, 5}
    )
    assert result["tier1"] is None


def test_제외해도_seed_재현성은_유지된다():
    scores = number_scores.compute(make_draws(200))
    kw = dict(sets_per_tier=8, seed=42, fill_scores=scores, exclude={1, 2, 3, 4, 5})

    a = generator.build_tier_sets(_items(1, [10, 20]), **kw)
    b = generator.build_tier_sets(_items(1, [10, 20]), **kw)
    assert a == b


def test_최대치인_39개를_빼도_조합이_만들어진다():
    """45 - 39 = 6. 계약이 정한 상한에서 정확히 한 조합만 가능하다."""
    banned = set(range(1, 40))
    result = generator.build_tier_sets(
        _items(1, [40, 41]), sets_per_tier=5, seed=1, exclude=banned
    )
    combos = result["tier1"]["combos"]
    # 남은 후보가 40~45 여섯 개뿐이라 만들 수 있는 조합은 하나다. 억지로 채우지 않는다.
    assert combos == [[40, 41, 42, 43, 44, 45]]


# ── 형태소 후보의 유래 (2026-08-28, 프론트 요청) ─────────────────────────


def test_stem_규칙이_만든_문자열은_derived_로_표시된다():
    """`크함`·`꾸음` 은 사전에도 없고 뜻도 없다. 호출부가 걸러낼 수 있어야 한다."""
    from app.dream.analyzer import DreamAnalyzer

    cands = {c.word: c for c in DreamAnalyzer().analyze_detailed("큰 돼지가 나왔어요")}

    assert cands["크함"].derived is True
    assert cands["나오음"].derived is True
    # 실재하는 명사는 derived 가 아니다 — 통째로 막으면 멀쩡한 단어까지 사라진다
    assert cands["돼지"].derived is False


def test_from_text_는_사용자가_적은_단어만_참이다():
    """유의어 확장으로 딸려온 단어를 '적어 주신 상징' 으로 세우면 안 된다."""
    from app.dream.analyzer import DreamAnalyzer

    cands = {c.word: c for c in DreamAnalyzer().analyze_detailed("집에서 용을 봤다")}

    assert cands["집"].from_text is True
    assert cands["용"].from_text is True
    # `집` 하나가 데려온 확장어들
    assert cands["집안"].from_text is False
    assert cands["건물"].from_text is False


def test_analyze_와_analyze_detailed_가_같은_단어를_낸다():
    """두 함수가 다른 규칙으로 갈라지면 어느 쪽이 맞는지 판정할 수 없다."""
    from app.dream.analyzer import DreamAnalyzer

    a = DreamAnalyzer()
    for text in ["큰 돼지가 나왔어요", "집에서 용을 봤다", "이재명 꿈"]:
        assert a.analyze(text) == [c.word for c in a.analyze_detailed(text)]
