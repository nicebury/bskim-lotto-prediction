"""무거운 추천 경로의 동시 실행 게이트.

몬테카를로는 **동시에 돌릴수록 느려진다** — 2건 6.5배, 4건 24.8배(실측).
근거와 원인은 docs/wiki/00-decisions/0012-serialize-monte-carlo.md.

**속도를 재는 테스트를 쓰지 않는다.** 실행 시간은 그날 기계가 무엇을 하고 있었는지에
따라 흔들려서, 임계값을 느슨하게 잡으면 회귀를 놓치고 빡빡하게 잡으면 멀쩡한 CI 가
붉어진다. 대신 **"실제로 겹쳤는가"** 라는 이산적인 사실만 본다.

DB 를 쓰지 않는다. 라우터가 부르는 조회와 계산을 전부 대역으로 갈아끼우므로,
워커의 마이그레이션 여부와 무관하게 항상 돌아야 하는 테스트다.
"""
from __future__ import annotations

import asyncio

import httpx
import pytest
from httpx import ASGITransport

from app import concurrency
from app.config import Settings
from app.main import app
from app.routers import recommend as recommend_router

from .conftest import make_draws


class OverlapProbe:
    """동시에 몇 개가 안에 들어와 있었는지 기록한다.

    최댓값이 1이면 겹치지 않은 것이다. `asyncio.sleep(0)` 만으로는 부족해서 실제로
    양보가 일어나는 짧은 대기를 쓴다 — 게이트가 없으면 반드시 겹치도록 만들어야
    "겹침을 감지할 수 있는 측정" 이 된다.
    """

    def __init__(self) -> None:
        self.inflight = 0
        self.max_inflight = 0

    async def enter(self) -> None:
        self.inflight += 1
        self.max_inflight = max(self.max_inflight, self.inflight)
        await asyncio.sleep(0.05)
        self.inflight -= 1


async def test_게이트_없이는_겹친다_측정이_유효함을_먼저_보인다():
    """대조군. 이것이 1이 나오면 측정 자체가 고장난 것이므로 아래 테스트도 의미가 없다."""
    probe = OverlapProbe()
    await asyncio.gather(*(probe.enter() for _ in range(4)))
    assert probe.max_inflight == 4


async def test_게이트_안에서는_동시에_하나만_돈다():
    probe = OverlapProbe()

    async def guarded() -> None:
        async with concurrency.heavy_slot("test"):
            await probe.enter()

    await asyncio.gather(*(guarded() for _ in range(4)))
    assert probe.max_inflight == 1


async def test_게이트는_예외가_나도_슬롯을_돌려준다():
    """계산이 터졌을 때 슬롯이 새면 그 뒤 모든 추천 요청이 영원히 대기한다."""
    with pytest.raises(ValueError):
        async with concurrency.heavy_slot("test"):
            raise ValueError("계산 실패")

    # 슬롯이 반납됐다면 아래가 즉시 통과한다. 새고 있으면 여기서 멈춘다.
    async with asyncio.timeout(2):
        async with concurrency.heavy_slot("test"):
            pass


async def test_오래_기다린_요청은_로그에_남는다(
    caplog: pytest.LogCaptureFixture, monkeypatch: pytest.MonkeyPatch
):
    """큐가 길어지고 있다는 사실은 배포 전에 눈에 보여야 한다.

    임계값을 0 으로 낮춰 확인한다. 실제 대기를 1초 이상 만들면 테스트가 그만큼 느려지고,
    여기서 검증하려는 것은 "얼마나 기다렸나" 가 아니라 **경고 경로가 살아 있는가** 다.
    """
    monkeypatch.setattr(concurrency, "SLOW_WAIT_SEC", 0.0)

    async def guarded() -> None:
        async with concurrency.heavy_slot("느린것"):
            await asyncio.sleep(0.02)

    with caplog.at_level("WARNING", logger="app.concurrency"):
        await asyncio.gather(guarded(), guarded())

    warnings = [r for r in caplog.records if "슬롯을 기다린 시간" in r.message]
    assert warnings, "대기 경고가 남지 않았다"
    assert "느린것" in warnings[0].getMessage()


async def test_설정값이_0_이하면_기동을_거부한다():
    """조용히 모든 추천 요청이 멈추는 것보다 시끄럽게 죽는 편이 낫다."""
    with pytest.raises(RuntimeError) as exc:
        Settings(RECOMMEND_MAX_CONCURRENCY=0)  # type: ignore[call-arg]
    assert "RECOMMEND_MAX_CONCURRENCY" in str(exc.value)


@pytest.fixture
def stub_router(monkeypatch: pytest.MonkeyPatch) -> OverlapProbe:
    """라우터의 DB 조회와 계산을 대역으로 바꾼다.

    실제 몬테카를로를 돌리면 테스트 한 번에 10초가 넘고, 그렇다고 회차를 줄이면
    50회차 미만이라 422 로 끝나 버린다. 여기서 확인할 것은 계산의 내용이 아니라
    **계산이 겹쳤는가** 뿐이다.
    """
    probe = OverlapProbe()
    draws = make_draws(60)

    async def fake_all_draws(_pool):
        return draws

    def fake_generate(strategy, _draws, *, sets, seed=None):
        # to_thread 안(= 별도 스레드)에서 돌기 때문에 여기서는 동기로 겹침을 센다.
        probe.inflight += 1
        probe.max_inflight = max(probe.max_inflight, probe.inflight)
        try:
            import time

            time.sleep(0.05)
            return [[1, 2, 3, 4, 5, 6] for _ in range(sets)]
        finally:
            probe.inflight -= 1

    monkeypatch.setattr(recommend_router.repo, "all_draws", fake_all_draws)
    monkeypatch.setattr(recommend_router, "get_pool", lambda: None)
    monkeypatch.setattr(recommend_router.rec, "generate", fake_generate)
    return probe


async def _fire(strategy: str, count: int) -> list[int]:
    async with httpx.AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as c:
        responses = await asyncio.gather(
            *(
                c.post(f"/api/lotto/recommend?strategy={strategy}&sets=2")
                for _ in range(count)
            )
        )
    return [r.status_code for r in responses]


async def test_ensemble_요청은_서로_겹치지_않는다(stub_router: OverlapProbe):
    codes = await _fire("ensemble", 4)
    assert codes == [200, 200, 200, 200]
    assert stub_router.max_inflight == 1


async def test_가벼운_전략은_무거운_요청_뒤에_줄서지_않는다(stub_router: OverlapProbe):
    """6~14ms 로 끝나는 전략이 2.5초짜리 뒤에서 기다리면 안 된다.

    `pure_random` 4건이 겹쳐 돌았다는 것은 게이트가 이 경로에 걸리지 않았다는 뜻이다.
    """
    codes = await _fire("pure_random", 4)
    assert codes == [200, 200, 200, 200]
    assert stub_router.max_inflight > 1
