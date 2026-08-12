"""무거운 계산 경로의 동시 실행을 막는 게이트.

## 왜 필요한가

`strategy=ensemble` 추천은 몬테카를로 5만 회를 돈다. 이 계산은 **동시에 돌릴수록
느려진다** — 1건 2.52초, 2건 16.35초(6.5배), 4건 62.58초(24.8배). 실측이다.

원인은 5만 회 루프가 매 회 하는 **작은 numpy 호출**이다. 작은 numpy 호출은 각각 GIL 을
잠깐 놓았다 다시 잡는데, 스레드가 둘 이상이면 이 손바꿈이 계산보다 비싸진다(convoy).
같은 조건에서 순수 파이썬 루프는 정확히 2배·4배로 늘었다 — 즉 **GIL 아래에서는 이
계산의 총 처리량이 애초에 하나분**이고, 동시 실행은 이득이 0 이면서 손해만 만든다.

그래서 막는다. 알고리즘은 한 줄도 건드리지 않는다.
근거: docs/wiki/00-decisions/0012-serialize-monte-carlo.md

## 왜 threading.Semaphore 가 아닌가

무거운 계산은 이미 `asyncio.to_thread` 안에서 돈다. 그러니 그 스레드 안에서
`threading.Semaphore` 를 잡게 하면 더 간단해 보인다. **그러면 안 된다.** 대기하는
스레드가 기본 실행기(executor)의 슬롯을 붙잡은 채 잠들기 때문이다. 그 실행기는
꿈해몽(`/api/dream/*`)도 함께 쓰므로, 추천 요청이 밀리면 **꿈해몽이 굶는다.**

`asyncio.Semaphore` 로 기다리면 대기 비용이 코루틴 하나뿐이고 스레드를 쥐지 않는다.
"""
from __future__ import annotations

import asyncio
import logging
import threading
import time
from contextlib import asynccontextmanager
from typing import AsyncGenerator
from weakref import WeakKeyDictionary

from .config import settings

logger = logging.getLogger(__name__)

# 이 시간을 넘겨 기다린 요청은 로그에 남긴다. 큐가 길어지고 있다는 사실을 배포 전에
# 눈으로 보려는 것이다. 값이 작으면 정상 대기(2.5초짜리 하나 뒤)도 시끄러워진다.
SLOW_WAIT_SEC = 1.0

# ── 루프별 세마포어 ──────────────────────────────────────────────────────────
# 세마포어를 모듈 최상단에 하나 두지 않는 이유가 있다. Python 3.10+ 의 asyncio
# 동기화 객체는 **처음 쓰인 이벤트 루프에 자기를 묶고**, 다른 루프에서 다시 쓰이면
# RuntimeError 를 낸다. 운영에서는 루프가 하나뿐이라 드러나지 않지만, pytest-asyncio 는
# 테스트마다 새 루프를 만들기 때문에 두 번째 테스트부터 터진다.
#
# 루프를 약한 참조 키로 잡아 두면 루프가 사라질 때 항목도 함께 사라져 누수가 없다.
# (기본 asyncio 루프와 uvloop 루프 모두 약한 참조가 가능한 것을 확인했다.)
_semaphores: "WeakKeyDictionary[asyncio.AbstractEventLoop, asyncio.Semaphore]" = (
    WeakKeyDictionary()
)
# 루프는 각자 다른 스레드에 있을 수 있다. 등록부 자체는 그 바깥이므로 잠근다.
_registry_lock = threading.Lock()


def _semaphore_for_running_loop() -> asyncio.Semaphore:
    loop = asyncio.get_running_loop()
    with _registry_lock:
        semaphore = _semaphores.get(loop)
        if semaphore is None:
            semaphore = asyncio.Semaphore(settings.RECOMMEND_MAX_CONCURRENCY)
            _semaphores[loop] = semaphore
        return semaphore


@asynccontextmanager
async def heavy_slot(label: str) -> AsyncGenerator[None]:
    """무거운 계산 슬롯을 하나 잡는다. 없으면 날 때까지 기다린다.

    `label` 은 로그에만 쓴다. 나중에 무거운 경로가 둘 이상이 되면 어느 쪽이 밀리고
    있는지 로그에서 구분할 수 있어야 한다.

    **대기 큐에 상한을 두지 않는다.** 혼잡을 이유로 요청을 거절하려면 그에 맞는
    상태코드가 필요한데, api-contract.md 의 오류 형식에는 그런 코드가 없다. 계약을
    늘리는 일은 세 세션이 함께 움직여야 하므로, 실제로 필요해지는 것이 관측된 뒤에
    한다. 그때까지는 프론트의 요청 타임아웃이 사실상의 상한이다.
    """
    semaphore = _semaphore_for_running_loop()

    # 잡기 전에 재는 이유: 대기 시간은 "이미 누가 돌고 있었다" 는 사실 그 자체다.
    waiting_since = time.perf_counter()
    async with semaphore:
        waited = time.perf_counter() - waiting_since
        if waited >= SLOW_WAIT_SEC:
            logger.warning(
                "무거운 계산(%s) 슬롯을 기다린 시간 %.2f초. "
                "동시 요청이 몰리고 있습니다 (동시 실행 한도 %d).",
                label,
                waited,
                settings.RECOMMEND_MAX_CONCURRENCY,
            )
        # 계산이 예외로 끝나도 `async with` 가 슬롯을 반납한다. 슬롯이 새면 그 뒤의
        # 모든 추천 요청이 영원히 대기하므로, 여기서 try/finally 를 직접 쓰지 않고
        # 컨텍스트 매니저에 맡긴다.
        yield
