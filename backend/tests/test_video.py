"""영상 API (`GET /api/videos`, `GET /api/videos/{id}`).

2026-08-28 워커가 `lotto_video` 계약을 신설하면서 생긴 리소스다
(docs/wiki/10-contracts/api-contract.md 의 '영상' 절).

이 리소스에는 다른 어디에도 없는 제약이 셋 있고, 셋 다 지키지 않으면 **정책 위반의
주체가 백엔드가 되는** 종류다. 그래서 규율이 아니라 테스트로 잡는다.

1. 응답 캐시 TTL 24시간 상한
2. 표시 조건 WHERE 절 (`public` · `embeddable` · `made_for_kids=no`)
3. 쇼츠 여부를 boolean 으로 노출 금지

⚠ `lotto_video` 는 워커의 마이그레이션이 돌기 전까지 존재하지 않는다. DB 가 필요한
테스트는 **이유를 밝히며 skip 한다** — 조용히 통과해 초록불만 켜지면 아무것도 검증하지
않은 것이다.
"""
from __future__ import annotations

import httpx
import pytest
from httpx import ASGITransport

from app import repository as repo
from app.db import close_pool, open_pool
from app.main import app
from app.routers import video as video_router

from .conftest import _table_exists


# ── DB 없이 도는 순수 검증 ────────────────────────────────────────────────


def test_캐시_상한이_24시간을_넘지_않는다():
    """★ 계약의 핵심 제약.

    `lotto_video` 의 행은 YouTube 개발자 정책 III.E.4 에 따라 30일 안에 갱신되거나
    삭제된다. 백엔드가 오래 캐시하면 워커가 이미 지운 데이터를 계속 내보내게 되고,
    그 시점부터 정책 위반의 주체는 백엔드다.

    누군가 "조금만 더" 를 더하는 순간 잡히도록 값 자체를 검사한다.
    """
    assert video_router._MAX_CACHE_SECONDS == 24 * 60 * 60
    assert video_router._CACHE_SECONDS <= video_router._MAX_CACHE_SECONDS


def test_표시_조건_세_줄이_모든_조회에_들어간다():
    """워커가 걸렀더라도 백엔드가 다시 건다 — 갱신 주기 25일 사이에 상태가 바뀐다."""
    for kind in repo.VIDEO_KINDS:
        where, _ = repo._video_where(kind, None, None)
        assert "privacy_status_cd = 'public'" in where
        assert "embeddable_cd = 'yes'" in where
        assert "made_for_kids_cd = 'no'" in where


def test_unknown_은_normal_에도_shorts_에도_들어가지_않는다():
    """★ 모르는 것을 어느 한쪽으로 밀면 그 순간 추정이 확정이 된다."""
    shorts_where, shorts_params = repo._video_where("shorts", None, None)
    normal_where, normal_params = repo._video_where("normal", None, None)
    all_where, _ = repo._video_where("all", None, None)

    assert "likely" in shorts_params
    assert "unlikely" in normal_params
    # all 에는 shorts_estimate_cd 조건이 아예 붙지 않는다 — 그래야 unknown 이 보인다.
    assert "shorts_estimate_cd" not in all_where
    assert "unknown" not in shorts_params
    assert "unknown" not in normal_params
    assert "shorts_estimate_cd" in shorts_where and "shorts_estimate_cd" in normal_where


def test_숨김_컬럼은_응답에_나가지_않는다():
    """`made_for_kids`·`embeddable`·`privacy_status` 는 WHERE 절 재료일 뿐이다."""
    row = {
        "video_id": 1,
        "provider_video_key": "abcdefghijk",
        "title_nm": "1238회 당첨번호",
        "channel_nm": "채널",
        "thumbnail_url": "https://i.ytimg.com/vi/abcdefghijk/hq.jpg",
        "published_dttm": None,
        "duration_sec": 61,
        "view_cnt": 3_000_000_000,  # int4 상한을 넘는다 — bigint 인 이유
        "shorts_estimate_cd": "likely",
        "round_no": 1238,
        "game_cd": "lotto",
        "keyword_list": ["로또"],
    }
    out = repo._to_video(row)

    for hidden in ("made_for_kids", "embeddable", "privacy_status", "link", "link_url"):
        assert hidden not in out
    # 조회수는 21억을 넘어도 그대로 나간다
    assert out["views"] == 3_000_000_000


def test_shorts_hint_는_문자열_그대로다():
    """★ boolean 으로 바꾸면 추정이 확정으로 둔갑한다."""
    for cd in ("likely", "unlikely", "unknown"):
        out = repo._to_video(
            {
                "video_id": 1, "provider_video_key": "k", "title_nm": "t",
                "channel_nm": None, "thumbnail_url": None, "published_dttm": None,
                "duration_sec": None, "view_cnt": None, "shorts_estimate_cd": cd,
                "round_no": None, "game_cd": "unknown", "keyword_list": None,
            }
        )
        assert out["shorts_hint"] == cd
        assert "is_shorts" not in out


def test_제목을_그대로_내보낸다():
    """남이 쓴 문장을 우리가 고쳐 쓰면 그것은 더 이상 인용이 아니다.

    영상 제목에는 우리가 쓰지 않는 표현이 섞여 들어올 수 있다
    (docs/wiki/40-domain/forbidden-expressions.md 의 '외부에서 들어온 텍스트').
    그래도 낱말을 바꾸지 않는다 — 걸러야 한다면 화면이 판단할 일이다.
    """
    raw = "1238회 로또 당첨 확률 높이는 법!!"
    out = repo._to_video(
        {
            "video_id": 1, "provider_video_key": "k", "title_nm": raw,
            "channel_nm": None, "thumbnail_url": None, "published_dttm": None,
            "duration_sec": None, "view_cnt": None, "shorts_estimate_cd": "unknown",
            "round_no": None, "game_cd": "unknown", "keyword_list": None,
        }
    )
    assert out["title"] == raw


def test_game_필터가_where_에_들어간다():
    """★ 연금복권 330회와 로또 330회는 전혀 다른 것이다."""
    where, params = repo._video_where("all", 330, "lotto")
    assert "game_cd = %s" in where
    assert "round_no = %s" in where
    assert params == ["lotto", 330]


# ── DB 가 필요한 통합 테스트 ──────────────────────────────────────────────


@pytest.fixture(scope="session")
def require_lotto_video() -> None:
    """`lotto_video` 가 없으면 이유를 밝히며 skip 한다.

    세 세션이 동시에 개발하므로, 워커가 아직 마이그레이션을 돌리지 않은 상태에서도
    위의 순수 로직은 검증돼야 한다.
    """
    reason = _table_exists("lotto_video")
    if reason:
        pytest.skip(reason)


@pytest.fixture
async def client(require_lotto_video: None):
    """`test_api.py` 의 것과 같은 방식. lifespan 을 직접 통제해 풀 상태를 명확히 본다."""
    await open_pool()
    try:
        async with httpx.AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as c:
            yield c
    finally:
        await close_pool()


@pytest.mark.integration
async def test_빈_테이블이면_404_가_아니라_빈_배열(client):
    """데이터가 없는 것과 자원이 없는 것은 다르다."""
    response = await client.get("/api/videos")
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"total", "page", "size", "items"}
    assert isinstance(body["items"], list)


@pytest.mark.integration
async def test_캐시_헤더가_24시간을_넘지_않는다(client):
    response = await client.get("/api/videos")
    cache = response.headers.get("cache-control", "")
    assert "max-age=" in cache
    max_age = int(cache.split("max-age=")[1].split(",")[0])
    assert 0 < max_age <= 24 * 60 * 60


@pytest.mark.integration
async def test_알_수_없는_kind_와_game_은_422(client):
    assert (await client.get("/api/videos?kind=reels")).status_code == 422
    assert (await client.get("/api/videos?game=toto")).status_code == 422
    # 계약이 허용한 값은 전부 200
    for kind in repo.VIDEO_KINDS:
        assert (await client.get(f"/api/videos?kind={kind}")).status_code == 200
    for game in repo.VIDEO_GAMES:
        assert (await client.get(f"/api/videos?game={game}")).status_code == 200


@pytest.mark.integration
async def test_없는_영상은_404(client):
    response = await client.get("/api/videos/999999999")
    assert response.status_code == 404


@pytest.mark.integration
async def test_표시_조건이_실제로_거른다(require_lotto_video):
    """WHERE 절이 '들어 있는가' 가 아니라 '거르는가' 를 본다.

    문자열 검사만으로는 조건이 뒤집혀 있어도(`<>` vs `=`) 통과한다. 실제로 행을 넣고
    걸러지는지 봐야 하는데, `lotto_video` 는 **워커 소유라 건드리지 않는다.** 같은 모양의
    임시 테이블(세션 한정)을 만들어 repository 가 조립한 SQL 을 그대로 돌린다.

    백엔드가 이 조건을 다시 거는 이유는 갱신 주기(25일) 사이에 비공개로 바뀌거나 임베드가
    막힌 영상이 남아 있을 수 있기 때문이다 — 그대로 내보내면 깨진 플레이어가 뜬다.
    """
    import psycopg

    from app.config import settings

    # (key, privacy, embeddable, kids, shorts, game, round, 보여야 하는가)
    rows = [
        ("ok-normal", "public", "yes", "no", "unlikely", "lotto", 1238, True),
        ("ok-shorts", "public", "yes", "no", "likely", "lotto", 1238, True),
        ("ok-unknown", "public", "yes", "no", "unknown", "pension", 330, True),
        ("bad-private", "private", "yes", "no", "unlikely", "lotto", 1238, False),
        ("bad-unlisted", "unlisted", "yes", "no", "unlikely", "lotto", 1238, False),
        ("bad-embed", "public", "no", "no", "unlikely", "lotto", 1238, False),
        ("bad-kids", "public", "yes", "yes", "unlikely", "lotto", 1238, False),
        # 상태를 모르는 것은 **보여주지 않는다.** 모르면 안전한 쪽으로 넘어간다.
        ("bad-unknown-embed", "public", "unknown", "no", "unlikely", "lotto", 1238, False),
    ]

    async with await psycopg.AsyncConnection.connect(settings.database_dsn) as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """
                CREATE TEMP TABLE lotto_video (
                    video_id bigint, provider_video_key text, title_nm text,
                    channel_nm text, thumbnail_url text, published_dttm timestamptz,
                    duration_sec int, view_cnt bigint, shorts_estimate_cd text,
                    made_for_kids_cd text, embeddable_cd text, privacy_status_cd text,
                    round_no int, game_cd text, keyword_list text[]
                )
                """
            )
            for i, (key, priv, emb, kids, sh, game, rnd, _) in enumerate(rows, 1):
                await cur.execute(
                    "INSERT INTO lotto_video VALUES "
                    "(%s,%s,%s,null,null,now(),null,null,%s,%s,%s,%s,%s,%s,null)",
                    (i, key, key, sh, kids, emb, priv, rnd, game),
                )

            async def visible(kind="all", rnd=None, game=None) -> set[str]:
                where, params = repo._video_where(kind, rnd, game)
                await cur.execute(
                    f"SELECT provider_video_key FROM lotto_video{where}", tuple(params)
                )
                return {r[0] for r in await cur.fetchall()}

            assert await visible() == {r[0] for r in rows if r[7]}
            # ★ unknown 은 어느 갈래에도 들어가지 않는다
            assert await visible(kind="shorts") == {"ok-shorts"}
            assert await visible(kind="normal") == {"ok-normal"}
            # ★ 연금복권 330회가 로또 330회로 새지 않는다
            assert await visible(rnd=1238, game="lotto") == {"ok-normal", "ok-shorts"}
            assert await visible(rnd=330, game="pension") == {"ok-unknown"}
