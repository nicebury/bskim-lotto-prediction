"""조합 분석 — 내 번호 6개를 역대 회차와 대조한다.

계약: `docs/wiki/10-contracts/api-contract-analysis.md`

## 왜 GET 인가

이 화면은 **URL 로 공유·북마크된다.** 새로고침해도, 뒤로가기로 돌아왔다 다시 들어와도
같은 내용이 나와야 한다. POST 면 그 전부가 깨진다. 부수효과가 없고 같은 입력에 같은
출력이라 캐시도 걸린다.

## 무거운 계산을 이벤트 루프에 두지 않는다

전 회차(1,200여) × 6번호 스캔이 순수 파이썬 루프다. `asyncio.to_thread` 로 보낸다 —
추천·꿈해몽과 같은 규약이다.

⚠ 다만 **`concurrency.heavy_slot` 은 쓰지 않는다.** 그 게이트는 몬테카를로 5만 회처럼
동시 실행이 n² 로 무너지는 계산을 위한 것이다(0012). 이 계산은 수십 ms 라 줄을 세우면
이득 없이 지연만 생긴다.
"""
from __future__ import annotations

import asyncio
import logging
import threading
from typing import Sequence

from fastapi import APIRouter, HTTPException, Query, Response

from .. import repository as repo
from ..db import get_pool
from ..domain import analyze as analyze_mod
from ..domain.draw import Draw
from ..schemas import AnalyzeResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/lotto", tags=["analyze"])

# 같은 조합·같은 최신 회차면 결과가 같다. 회차는 토요일 21시 이후에만 바뀐다.
_CACHE_SECONDS = 60 * 60


# ── 회차 단위 캐시 ────────────────────────────────────────────────────────
#
# 계약이 권고한 것이다. 응답 네 블록 중 **조합과 무관한 두 가지**가 전 회차 스캔을
# 요구한다 — `frequency_grid`(45칸 빈도)와 `combination.reference`(역대 분포·AC 히스토그램).
# 조합마다 다시 계산하면 사용자가 번호 하나만 바꿔도 1,200여 회차를 통째로 다시 훑는다.
#
# 키는 **최신 회차 번호**다. `number_scores` 의 캐시와 같은 방식이고, 같은 한계를 갖는다 —
# 과거 회차가 정정되면 다음 추첨까지 옛 값을 쓴다. 1,200여 회차 중 한 행이 바뀐 것이
# 히스토그램의 모양을 뒤집지는 않는다.
_shared_cache: dict[int, dict] = {}
_cache_lock = threading.Lock()


def _shared_blocks(all_draws: Sequence[Draw]) -> dict:
    """조합과 무관한 무거운 집계. 최신 회차가 같으면 재사용한다."""
    latest = all_draws[-1].round_no
    with _cache_lock:
        cached = _shared_cache.get(latest)
    if cached is not None:
        return cached

    built = {
        "grid": analyze_mod.frequency_grid(all_draws),
        "shared": analyze_mod.reference_blocks(all_draws),
    }
    with _cache_lock:
        # 항목을 하나만 남긴다. 회차가 늘면 옛 항목은 다시 쓰이지 않으므로 들고 있을
        # 이유가 없다 — 프로세스가 오래 떠 있어도 쌓이지 않는다.
        _shared_cache.clear()
        _shared_cache[latest] = built
    return built


def invalidate_cache() -> None:
    """캐시를 비운다. 테스트가 계산 경로를 다시 타게 할 때 쓴다."""
    with _cache_lock:
        _shared_cache.clear()


def _build(all_draws: Sequence[Draw], numbers: list[int]) -> dict:
    """동기 계산부. `asyncio.to_thread` 안에서 돈다.

    캐시된 집계를 **계산 전에** 넘긴다. 계산한 뒤 결과만 덮어쓰면 같은 값을 두 번
    만드는 셈이라 캐시의 뜻이 없다.
    """
    cached = _shared_blocks(all_draws)
    return analyze_mod.analyze(
        all_draws, numbers, shared=cached["shared"], grid=cached["grid"]
    )


@router.get("/analyze", response_model=AnalyzeResponse)
async def analyze(
    response: Response,
    numbers: str = Query(
        ...,
        description="쉼표로 구분한 정확히 6개. 각 1~45, 중복 불가. 예: 3,11,24,29,38,41",
        examples=["3,11,24,29,38,41"],
    ),
) -> dict:
    try:
        # 정렬까지 여기서 끝난다. `41,3,...` 과 `3,...,41` 은 같은 조합이므로
        # 응답의 `numbers` 도 캐시 키도 정렬 후의 것을 쓴다.
        picked = analyze_mod.parse_numbers(numbers)
    except analyze_mod.InvalidNumbersError as exc:
        # 요청 자체가 계약을 어겼다. 조용히 보정하지 않는 이유는 사용자가 URL 을 직접
        # 만질 수 있고, 잘못 입력한 사실을 화면이 알려야 하기 때문이다.
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    all_draws = await repo.all_draws(get_pool())

    try:
        result = await asyncio.to_thread(_build, all_draws, picked)
    except analyze_mod.NoDrawDataError as exc:
        # 빈 값을 0 으로 채워 내려보내지 않는다 — "역대 0번 나왔다" 와 "데이터가 없다" 는
        # 전혀 다른 말인데 화면은 둘을 구분할 방법이 없다. 워커가 아직 채우지 않은
        # 상태이므로 사용자 잘못(4xx)이 아니라 503 이다.
        logger.warning("조합 분석 요청을 처리할 회차가 없습니다.")
        raise HTTPException(
            status_code=503, detail="회차 데이터가 아직 없습니다."
        ) from exc

    response.headers["Cache-Control"] = f"public, max-age={_CACHE_SECONDS}"
    return result
