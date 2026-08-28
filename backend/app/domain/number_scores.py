"""번호별 통계 점수 — 꿈해몽 조합의 **모자란 자리**를 채울 때 쓴다.

## 왜 이 모듈이 필요한가

꿈에서 뽑힌 번호가 6개에 못 미치면 `dream/generator.py` 가 나머지를 채운다. 종전에는
`1~45 무작위`였다. 그런데 화면은 "모자란 번호는 통계로 채웠습니다" 라고 안내하고
싶어 한다 — 무작위인 채로 그렇게 쓰면 **거짓말**이 된다
(docs/wiki/40-domain/dream-pipeline.md 의 프론트 세션 요청, 2026-08-27).

그래서 채우는 방법만 바꾼다. 응답 스키마는 그대로다.

## 왜 `/api/lotto/recommend` 의 ensemble 과 같은 점수인가

같은 사이트의 두 화면이 "통계적으로 눈여겨볼 번호" 를 서로 다르게 계산하면, 두 화면을
나란히 본 사용자는 어느 쪽도 믿지 않는다. 추천 화면의 `hot_count` 기준을
`stats.hot_cold_sets` 하나에서 가져오는 것과 같은 이유다(`routers/recommend.py`).

그래서 예측 모듈의 분석기 4종을 **그대로** 부르고 `ensemble.score` 로 합산한다.
알고리즘은 한 줄도 새로 쓰지 않는다.

## 몬테카를로는 타지 않는다

`predictor.predict()` 는 이 점수를 만든 **뒤에** 5만 회 시뮬레이션으로 조합을 고른다.
그 단계가 2.5초짜리이고, 동시 실행이 n² 로 무너져 백엔드가 줄까지 세우는 부분이다
(docs/wiki/00-decisions/0012-serialize-monte-carlo.md).

여기서 필요한 것은 **번호별 점수**뿐이고 조합 선별이 아니다. 꿈해몽은 뽑을 자리가
많아야 다섯이고 후보도 45개다. 몬테카를로를 태우면 꿈해몽 요청이 추천과 같은 대기열에
들어가 서로를 굶긴다. 분석기 4종만 부르면 전체가 수십 ms 로 끝난다.

## 캐시

점수는 회차가 늘 때만 바뀐다 — 주 1회다. 매 꿈해몽 요청마다 1,200여 행을 읽고 다시
집계할 이유가 없다. **최신 회차 번호**를 키로 캐시한다.

⚠ 캐시 키에 회차 '개수' 를 넣지 않았다. 개수를 알려면 `count(*)` 질의가 한 번 더 드는데,
그 대가로 잡히는 경우는 **과거 회차의 정정·백필**뿐이다(실제로 한 번 있었다 —
docs/wiki/log.md 의 당첨번호 오류 교정). 그때는 다음 추첨까지 최대 일주일간 옛 점수를
쓰게 되지만, 1,200여 회차 중 한 행이 바뀐 것이 채움 번호의 순위를 뒤집지는 않는다.
바꿔야 할 만큼 중요해지면 캐시 키가 아니라 `invalidate()` 를 워커 신호로 부르는 쪽이
맞다 — 지금은 백엔드가 워커의 존재를 모른다.
"""
from __future__ import annotations

import logging
import threading
from typing import Optional, Sequence

import numpy as np

from ..prediction import ensemble
from ..prediction.analyzer import delay, frequency, hot_cold, pattern
from ..prediction.config import HOT_RECENT_ROUNDS, MIN_REQUIRED_ROUNDS, WEIGHTS
from .draw import Draw

logger = logging.getLogger(__name__)

# 이보다 회차가 적으면 점수를 만들지 않는다. 추천 API 가 통계 기반 전략을 막는 기준과
# **같은 값**을 쓴다 — "몇 회차부터 통계라고 부를 수 있는가" 의 답이 엔드포인트마다
# 다르면 설명할 수 없다. 이 경우 호출자는 종전대로 균등 무작위로 채운다.
MIN_ROUNDS_FOR_FILL = MIN_REQUIRED_ROUNDS

# 최신 회차 → 번호별 점수. 항목은 항상 하나만 남긴다(옛 회차의 점수는 쓸 데가 없다).
_cache: dict[int, dict[int, float]] = {}
# 계산은 `asyncio.to_thread` 안에서 돌아 여러 스레드가 동시에 들어올 수 있다.
_cache_lock = threading.Lock()


def compute(draws: Sequence[Draw]) -> Optional[dict[int, float]]:
    """회차들로부터 1~45 번호별 점수를 만든다. 회차가 모자라면 `None`.

    캐시를 타지 않는 순수 계산이다. 테스트가 임의의 회차 목록으로 부를 수 있어야 하고,
    캐시 여부에 따라 결과가 달라지지 않는다는 것도 그 자체로 검증 대상이다.
    """
    if len(draws) < MIN_ROUNDS_FOR_FILL:
        return None

    round_numbers = [d.round_no for d in draws]
    num_rows = [d.numbers for d in draws]
    bonuses = [d.bonus for d in draws]

    # predictor.predict() 가 몬테카를로 직전까지 하는 일과 정확히 같다.
    freq_scores = frequency.analyze(num_rows, bonuses)
    delay_scores = delay.analyze(num_rows, round_numbers)
    hot_scores = hot_cold.analyze(num_rows, round_numbers, HOT_RECENT_ROUNDS)
    pattern_scores = pattern.per_number(pattern.analyze(num_rows))

    return ensemble.score(
        freq_scores, delay_scores, hot_scores, pattern_scores, WEIGHTS
    )


def get_cached(latest_round: int) -> Optional[dict[int, float]]:
    """이 회차 기준으로 이미 계산해 둔 점수. 없으면 `None`.

    라우터가 **1,200여 행을 읽기 전에** 먼저 물어보라고 분리해 둔 함수다. 캐시가 살아
    있으면 `all_draws` 질의 자체를 건너뛴다.
    """
    with _cache_lock:
        return _cache.get(latest_round)


def load(draws: Sequence[Draw]) -> Optional[dict[int, float]]:
    """점수를 만들어 캐시에 넣고 돌려준다. 회차가 모자라면 `None`.

    캐시에는 최신 회차 하나만 남긴다. 회차가 늘면 옛 항목은 다시 쓰이지 않으므로
    들고 있을 이유가 없다 — 프로세스가 오래 떠 있어도 항목이 쌓이지 않는다.
    """
    scores = compute(draws)
    if scores is None:
        logger.warning(
            "회차가 %d개뿐이라 꿈해몽 부족분을 통계로 채울 수 없습니다 "
            "(최소 %d회차 필요). 이번 요청은 균등 무작위로 채웁니다.",
            len(draws),
            MIN_ROUNDS_FOR_FILL,
        )
        return None

    latest = max(d.round_no for d in draws)
    with _cache_lock:
        _cache.clear()
        _cache[latest] = scores
    return scores


def invalidate() -> None:
    """캐시를 비운다. 테스트가 계산 경로를 다시 타게 할 때 쓴다."""
    with _cache_lock:
        _cache.clear()


def weighted_pick(
    scores: Optional[dict[int, float]],
    *,
    exclude: set[int],
    count: int,
    rng: np.random.Generator,
) -> list[int]:
    """`exclude` 를 뺀 1~45 에서 점수에 비례해 `count` 개를 **중복 없이** 뽑는다.

    `scores` 가 `None` 이면 균등 추출로 되돌아간다. 호출부가 분기를 갖지 않도록 여기서
    흡수한다 — 채움 경로가 두 갈래로 갈라지면 한쪽만 고치는 사고가 난다.

    ⚠ 점수를 확률로 해석하지 않는다. 여기서 하는 일은 "통계적으로 눈여겨볼 번호에
    가중치를 더 준다" 는 추출 규칙일 뿐이고, 어떤 번호가 나올 가능성에 대한 주장이
    아니다 (docs/wiki/40-domain/forbidden-expressions.md).
    """
    candidates = [n for n in range(1, 46) if n not in exclude]
    if count <= 0 or not candidates:
        return []
    # 뽑을 자리가 후보보다 많을 수는 없다(제외 6개 미만, 후보 40개 이상)지만,
    # 호출부가 바뀌어도 조용히 깨지지 않게 막아 둔다.
    count = min(count, len(candidates))

    weights = None
    if scores:
        raw = np.array([float(scores.get(n, 0.0)) for n in candidates], dtype=float)
        # 음수 점수는 지금 분석기에서 나오지 않지만, 나오면 numpy 가 예외를 던지며
        # 꿈해몽 전체를 500 으로 만든다. 잘라내는 편이 안전하다.
        raw = np.clip(raw, 0.0, None)
        total = float(raw.sum())
        # 전부 0 이면 비율을 만들 수 없다. 그때는 균등이 유일하게 옳은 답이다.
        if total > 0.0:
            weights = raw / total

    if weights is None:
        picked = rng.choice(candidates, size=count, replace=False)
        return [int(n) for n in picked]

    # ⚠ `replace=False` + `p` 는 **0 이 아닌 항목이 뽑을 개수보다 적으면** 예외를 던진다
    # (`Fewer non-zero entries in p than size`). 실제 앙상블 점수는 패턴 항의 하한 때문에
    # 모든 번호가 0.1 이상이라 여기 걸리지 않지만, 걸리는 날에는 꿈해몽 전체가 500 이 된다.
    # 방어 코드가 오히려 장애를 만드는 형태라 미리 갈라 둔다.
    #
    # 되돌아가는 방식이 균등이 아니라 **2단 추출**인 이유: 점수가 있는 번호를 먼저 전부
    # 가중으로 뽑고, 남는 자리만 나머지에서 균등으로 채운다. 통째로 균등으로 돌아가면
    # 멀쩡히 존재하는 통계 신호를 버리게 된다.
    positive = int(np.count_nonzero(weights))
    if positive >= count:
        picked = rng.choice(candidates, size=count, replace=False, p=weights)
        return [int(n) for n in picked]

    weighted_part = rng.choice(candidates, size=positive, replace=False, p=weights)
    chosen = {int(n) for n in weighted_part}
    remainder = [n for n in candidates if n not in chosen]
    uniform_part = rng.choice(remainder, size=count - positive, replace=False)
    return [*sorted(chosen), *(int(n) for n in uniform_part)]
