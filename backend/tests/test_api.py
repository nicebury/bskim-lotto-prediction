"""엔드포인트 스모크 — 계약의 전 엔드포인트가 200 을 반환하는가.

DB 가 준비되지 않았으면 skip 한다. 꿈해몽은 임베딩 모델을 로드하느라 20초가 걸리므로
`/api/dream/recommend` 는 여기서 부르지 않는다 — `/keywords` 로 사전 존재만 확인한다.
"""
from __future__ import annotations

import httpx
import pytest
from httpx import ASGITransport

from app.db import close_pool, open_pool
from app.main import app

pytestmark = pytest.mark.integration


@pytest.fixture
async def client(require_lotto_draw: None):
    # TestClient 대신 ASGITransport 를 쓰는 이유: lifespan 을 직접 통제해 풀이 열렸는지
    # 명확히 보기 위해서다. 풀이 안 열리면 여기서 바로 터진다.
    await open_pool()
    try:
        async with httpx.AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as c:
            yield c
    finally:
        await close_pool()


async def test_health_는_DB_없이도_200(require_lotto_draw: None):
    async with httpx.AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as c:
        response = await c.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def test_최신_회차(client: httpx.AsyncClient):
    response = await client.get("/api/lotto/latest")
    assert response.status_code == 200
    body = response.json()
    assert body["numbers"] == sorted(body["numbers"])
    assert len(body["numbers"]) == 6


async def test_회차_목록_봉투(client: httpx.AsyncClient):
    response = await client.get("/api/lotto/rounds?page=1&size=3")
    assert response.status_code == 200
    body = response.json()
    assert body.keys() >= {"total", "page", "size", "items"}
    assert len(body["items"]) <= 3
    # 최신 회차가 먼저다.
    round_nos = [item["round_no"] for item in body["items"]]
    assert round_nos == sorted(round_nos, reverse=True)


async def test_범위를_벗어난_페이지는_빈_배열이지_404가_아니다(client: httpx.AsyncClient):
    response = await client.get("/api/lotto/rounds?page=99999&size=20")
    assert response.status_code == 200
    assert response.json()["items"] == []


async def test_없는_회차는_404(client: httpx.AsyncClient):
    response = await client.get("/api/lotto/rounds/999999")
    assert response.status_code == 404
    assert "detail" in response.json()


async def test_회차_상세에는_traits_가_있고_hot_count_는_없다(client: httpx.AsyncClient):
    latest = (await client.get("/api/lotto/latest")).json()
    response = await client.get(f"/api/lotto/rounds/{latest['round_no']}")
    assert response.status_code == 200

    body = response.json()
    assert body["prize_tiers"] == []  # 2~5등 소스가 아직 없다
    assert "hot_count" not in body["traits"]
    assert body["traits"]["sum"] == sum(body["numbers"])


@pytest.mark.parametrize("window", ["20", "50", "100", "all"])
async def test_통계_세_엔드포인트(client: httpx.AsyncClient, window: str):
    freq = await client.get(f"/api/lotto/stats/frequency?window={window}")
    assert freq.status_code == 200
    assert len(freq.json()["counts"]) == 45

    hc = await client.get(f"/api/lotto/stats/hot-cold?window={window}")
    assert hc.status_code == 200
    body = hc.json()
    assert body.keys() >= {"hot", "cold", "overdue"}
    # 002 개편으로 hot·cold 항목에 세 필드가 붙었다
    assert body["hot"][0].keys() >= {
        "number", "count", "appearance_rate", "last_seen_round", "trend"
    }
    assert body["hot"][0]["trend"] in {"up", "down", "flat"}
    assert 0.0 <= body["hot"][0]["appearance_rate"] <= 1.0
    assert "last_seen_round" in body["overdue"][0]

    pattern = await client.get(f"/api/lotto/stats/pattern?window={window}")
    assert pattern.status_code == 200
    assert pattern.json()["sum_range"].keys() == {"min", "max", "peak"}

    pairs = await client.get(f"/api/lotto/stats/pairs?window={window}")
    assert pairs.status_code == 200
    pbody = pairs.json()
    assert pbody["number"] is None
    for p in pbody["pairs"]:
        assert p["numbers"] == sorted(p["numbers"]) and len(p["numbers"]) == 2


async def test_동반출현_number_필터(client: httpx.AsyncClient):
    response = await client.get("/api/lotto/stats/pairs?window=all&number=1&top=5")
    assert response.status_code == 200
    body = response.json()
    assert body["number"] == 1
    assert len(body["pairs"]) <= 5
    for p in body["pairs"]:
        assert 1 in p["numbers"]


async def test_동반출현_잘못된_number_는_422(client: httpx.AsyncClient):
    assert (await client.get("/api/lotto/stats/pairs?number=46")).status_code == 422
    assert (await client.get("/api/lotto/stats/pairs?top=99")).status_code == 422


async def test_뉴스_keyword_필터(client: httpx.AsyncClient):
    """keyword 를 주면 total 이 필터 후 건수로 줄어든다."""
    full = (await client.get("/api/news?size=1")).json()["total"]
    # 실데이터에 흔한 단어. 없으면 0 이어도 필터가 동작한 것이다.
    filtered = (await client.get("/api/news?size=1&keyword=로또")).json()["total"]
    assert filtered <= full


async def test_뉴스_period_필터(client: httpx.AsyncClient):
    """좁은 기간의 total 은 all 보다 크지 않다."""
    all_total = (await client.get("/api/news?size=1&period=all")).json()["total"]
    week_total = (await client.get("/api/news?size=1&period=1w")).json()["total"]
    assert week_total <= all_total


async def test_뉴스_잘못된_period_는_422(client: httpx.AsyncClient):
    assert (await client.get("/api/news?period=2y")).status_code == 422


async def test_잘못된_window_는_422(client: httpx.AsyncClient):
    response = await client.get("/api/lotto/stats/frequency?window=7")
    assert response.status_code == 422


async def test_추천은_seed_로_재현된다(client: httpx.AsyncClient):
    first = await client.post("/api/lotto/recommend?sets=3&seed=1")
    second = await client.post("/api/lotto/recommend?sets=3&seed=1")

    assert first.status_code == 200
    assert first.json()["sets"] == second.json()["sets"]


async def test_추천_응답에는_면책_문구가_반드시_있다(client: httpx.AsyncClient):
    body = (await client.post("/api/lotto/recommend?sets=1&seed=1")).json()
    assert body["disclaimer"]
    assert "보장하지 않습니다" in body["disclaimer"]


async def test_추천_응답에_금지_필드가_없다(client: httpx.AsyncClient):
    """계약이 금지한 이름이 응답 어디에도 없어야 한다. 정규식이 사람보다 성실하다."""
    forbidden = {"probability", "win_rate", "accuracy", "confidence", "hit_rate",
                 "expected_value", "score", "avg_number_hits", "hit_count"}
    raw = (await client.post("/api/lotto/recommend?sets=5&seed=1")).text
    for name in forbidden:
        assert f'"{name}"' not in raw


@pytest.mark.parametrize(
    "strategy",
    ["ensemble", "pair_affinity", "balanced_range", "cold_return", "golden_combo", "pure_random"],
)
async def test_모든_전략이_200(client: httpx.AsyncClient, strategy: str):
    response = await client.post(f"/api/lotto/recommend?strategy={strategy}&sets=2&seed=1")
    assert response.status_code == 200
    body = response.json()
    assert body["strategy"] == strategy
    for item in body["sets"]:
        assert len(item["numbers"]) == 6
        # 전략과 무관하게 여덟 필드가 모두 있어야 프론트가 분기를 갖지 않는다.
        assert item["traits"].keys() >= {"hot_count", "cold_count", "sum"}


async def test_없는_전략은_422(client: httpx.AsyncClient):
    response = await client.post("/api/lotto/recommend?strategy=없는전략")
    assert response.status_code == 422


async def test_뉴스는_비어_있어도_200(client: httpx.AsyncClient):
    response = await client.get("/api/news?page=1&size=5")
    assert response.status_code == 200
    assert response.json()["items"] == [] or len(response.json()["items"]) <= 5


async def test_사이트맵_엔트리(client: httpx.AsyncClient):
    response = await client.get("/api/meta/sitemap-entries")
    assert response.status_code == 200
    body = response.json()
    assert body.keys() == {"rounds", "news"}
    round_nos = [r["round_no"] for r in body["rounds"]]
    assert round_nos == sorted(round_nos)  # 오름차순


async def test_꿈해몽_키워드(client: httpx.AsyncClient):
    """임베딩 모델을 로드하지 않으므로 즉시 응답해야 한다."""
    response = await client.get("/api/dream/keywords")
    assert response.status_code == 200
    body = response.json()
    assert body["total"] > 0
    assert body["keywords"][0]["slug"] == body["keywords"][0]["word"]
