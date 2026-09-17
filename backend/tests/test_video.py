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


# ── 2026-09-17 추가: 검색(q) · 정렬(sort) · 기간(period) ──────────────────
#
# 계약(api-contract.md 영상 절 '2026-09-17 추가')이 요구한 것은 셋이다.
#   ① q — title_nm·channel_nm·keyword_list 중 하나라도 대소문자 무시 포함, 50자 초과 422
#   ② sort — latest | views. views 는 NULLS LAST → published_at → id
#   ③ period — 1w | 1m | 3m | all
# 그리고 **셋 다 생략하면 종전과 같아야 한다**(하위호환). 마지막 항목이 가장 깨지기 쉬워
# 따로 테스트를 둔다 — 새 기능을 더하다 기존 호출의 결과를 바꾸면 프론트가 먼저
# 배포돼 있는 동안 화면이 조용히 달라진다.


def test_셋_다_생략하면_종전과_같은_where_다():
    """★ 하위호환. 새 인자의 기본값이 기존 결과를 건드리면 안 된다."""
    before_where, before_params = repo._video_where("all", 1238, "lotto")
    after_where, after_params = repo._video_where("all", 1238, "lotto", None, None)

    assert before_where == after_where
    assert before_params == after_params
    # 빈 문자열·공백도 '검색 안 함' 과 같아야 한다 — 라우터가 strip 해서 None 으로
    # 바꿔 보내지만, repository 자체도 falsy 를 필터로 치지 않는다.
    empty_where, empty_params = repo._video_where("all", 1238, "lotto", "", None)
    assert empty_where == before_where and empty_params == before_params


def test_q_는_제목_채널_키워드_셋을_본다():
    """계약이 정한 검색 대상은 셋이다. 뉴스와 달리 요약문이 없고 채널명이 있다."""
    where, params = repo._video_where("all", None, None, "로또", None)

    assert "title_nm ILIKE %s" in where
    assert "channel_nm ILIKE %s" in where
    assert "unnest(keyword_list)" in where
    # 세 항이 OR 로 묶여 하나의 괄호 안에 있어야 한다. AND 로 붙으면 셋을 모두 만족하는
    # 영상만 남아 검색이 사실상 죽는다.
    assert "OR" in where
    # 패턴 하나를 세 자리에 똑같이 넘긴다
    assert params == ["%로또%", "%로또%", "%로또%"]


def test_q_의_와일드카드가_리터럴로_막힌다():
    """`%` 하나가 전 영상과 매치하면 그것은 검색이 아니다.

    `_news_where` 와 같은 `_like_escape` 를 쓴다 — 검색 규칙이 같다고 계약에 적혀 있으면
    이스케이프 규칙도 같아야 한다. 한쪽만 고치면 같은 입력이 두 화면에서 다르게 동작한다.
    """
    _, params = repo._video_where("all", None, None, "100%_할인", None)
    assert params[0] == r"%100\%\_할인%"


def test_표시_조건은_검색_기간과_함께_써도_살아_있다():
    """★ 검색으로 찾아내면 비공개 영상이 나오는 일은 없어야 한다."""
    where, _ = repo._video_where("shorts", 1238, "lotto", "당첨", 7)
    assert "privacy_status_cd = 'public'" in where
    assert "embeddable_cd = 'yes'" in where
    assert "made_for_kids_cd = 'no'" in where
    # 모든 조건은 AND 로 결합한다(계약).
    assert " OR privacy" not in where


def test_기간은_published_dttm_을_기준으로_자른다():
    where, params = repo._video_where("all", None, None, None, 7)
    assert "published_dttm >= now() - make_interval(days => %s)" in where
    assert params == [7]
    # all(=None) 이면 기간 절이 아예 붙지 않는다
    all_where, all_params = repo._video_where("all", None, None, None, None)
    assert "make_interval" not in all_where and all_params == []


def test_period_매핑이_계약의_값과_같다():
    """1w=7 · 1m=30 · 3m=90 · all=무제한. 뉴스의 목록과 **공유하지 않는다**."""
    assert repo.VIDEO_PERIOD_DAYS == {"1w": 7, "1m": 30, "3m": 90, "all": None}
    # 뉴스에만 있는 값이 영상에 새어 들어오지 않았는지 본다. 목록을 공유하면 한쪽을
    # 늘릴 때 다른 쪽이 조용히 따라 늘어난다.
    assert "2w" not in repo.VIDEO_PERIOD_DAYS
    assert "6m" not in repo.VIDEO_PERIOD_DAYS


def test_정렬_키가_끝까지_확정된다():
    """★ 동률의 순서를 DB 에 맡기면 페이지 경계에서 중복·누락이 생긴다."""
    for sort in repo.VIDEO_SORTS:
        order = repo._VIDEO_ORDER_BY[sort]
        # 유일 컬럼으로 끝나야 순서가 하나로 정해진다
        assert order.endswith("video_id DESC"), sort

    assert repo._VIDEO_ORDER_BY["latest"] == "published_dttm DESC, video_id DESC"

    views = repo._VIDEO_ORDER_BY["views"]
    # ★ NULLS LAST 가 없으면 조회수를 **모르는** 영상이 1위 자리에 온다.
    # Postgres 는 DESC 에서 NULL 을 가장 먼저 놓는 것이 기본이다.
    assert "view_cnt DESC NULLS LAST" in views
    # 동률은 최신순 → id 순으로 푼다
    assert views.index("view_cnt") < views.index("published_dttm") < views.index("video_id")


def test_허용값_밖의_sort_는_조용히_넘어가지_않는다():
    """기본 정렬로 슬쩍 넘어가면 호출자는 자기 요청이 무시된 것을 끝내 알지 못한다.

    라우터가 422 로 먼저 거르지만, repository 를 직접 부르는 경로에서도 막혀야 한다.
    이 값은 f-string 으로 SQL 에 박히므로 화이트리스트를 거치는 것 자체가 방어다.
    """
    with pytest.raises(KeyError):
        repo._VIDEO_ORDER_BY["oldest"]
    with pytest.raises(KeyError):
        repo._VIDEO_ORDER_BY["view_cnt DESC; DROP TABLE lotto_video"]


@pytest.mark.integration
async def test_알_수_없는_sort_와_period_는_422(client):
    assert (await client.get("/api/videos?sort=oldest")).status_code == 422
    assert (await client.get("/api/videos?sort=views%20DESC")).status_code == 422
    # ⚠ 2w·6m 은 **뉴스에는 있고 영상에는 없는** 값이다. 목록을 공유하지 않는다는
    # 결정이 실제로 지켜지는지 여기서 확인한다.
    assert (await client.get("/api/videos?period=2w")).status_code == 422
    assert (await client.get("/api/videos?period=6m")).status_code == 422

    for sort in repo.VIDEO_SORTS:
        assert (await client.get(f"/api/videos?sort={sort}")).status_code == 200
    for period in repo.VIDEO_PERIOD_DAYS:
        assert (await client.get(f"/api/videos?period={period}")).status_code == 200


@pytest.mark.integration
async def test_q_는_50자까지다(client):
    """상한을 두는 이유는 ILIKE '%…%' 가 전건 스캔이기 때문이다."""
    assert (await client.get("/api/videos?q=" + "가" * 50)).status_code == 200
    assert (await client.get("/api/videos?q=" + "가" * 51)).status_code == 422

    # 길이는 **공백을 턴 뒤** 잰다. 앞뒤 공백 때문에 거절당하는 것은 사용자가 이해할
    # 수 없는 거절이다.
    padded = "  " + "가" * 50 + "  "
    assert (await client.get("/api/videos", params={"q": padded})).status_code == 200


@pytest.mark.integration
async def test_공백뿐인_q_는_검색하지_않은_것과_같다(client):
    """검색창을 비웠는데 공백 한 칸이 남아 아무것도 안 나오는 일을 막는다."""
    plain = (await client.get("/api/videos")).json()
    blank = (await client.get("/api/videos", params={"q": "   "})).json()
    assert blank["total"] == plain["total"]
    assert [i["id"] for i in blank["items"]] == [i["id"] for i in plain["items"]]


@pytest.mark.integration
async def test_새_파라미터에도_캐시_상한이_붙는다(client):
    """정책 제약은 어떤 질의 경로로 들어와도 똑같이 걸려야 한다."""
    response = await client.get("/api/videos?q=로또&sort=views&period=1w")
    cache = response.headers.get("cache-control", "")
    max_age = int(cache.split("max-age=")[1].split(",")[0])
    assert 0 < max_age <= 24 * 60 * 60


@pytest.mark.integration
async def test_검색_정렬_기간이_실제로_동작한다(require_lotto_video):
    """문자열 검사가 아니라 **결과가 달라지는지** 본다.

    `_video_where` 가 `>=` 대신 `<=` 를 쓰거나 OR 을 AND 로 붙여도 앞의 문자열 테스트는
    통과한다. 실제 행을 넣고 무엇이 남는지 봐야 잡힌다. `lotto_video` 는 **워커 소유라
    건드리지 않으므로** 같은 모양의 임시 테이블(세션 한정)에 repository 가 조립한 SQL 을
    그대로 돌린다 — 위 `test_표시_조건이_실제로_거른다` 와 같은 방식이다.

    ★ 여기서만 확인할 수 있는 것이 하나 있다. **`view_cnt` 가 NULL 인 행**이다. 개발 DB
    에는 워커가 조회수를 전부 채워 둬 NULL 이 하나도 없어, 실데이터로는 `NULLS LAST` 가
    동작하는지 영원히 알 수 없다.
    """
    import psycopg

    from app.config import settings

    # (key, title, channel, keywords, views, 며칠 전, shorts)
    rows = [
        ("v-old-top", "1200회 분석", "로또연구소", ["분석"], 999_999, 100, "unlikely"),
        ("v-new-mid", "1238회 결과", "복권TV", ["결과"], 5_000, 3, "unlikely"),
        ("v-new-low", "꿈해몽 이야기", "로또연구소", ["꿈"], 10, 3, "likely"),
        ("v-new-null", "조회수 미상", "복권TV", ["미상"], None, 1, "unlikely"),
        ("v-mid-hit", "지난달 영상", "잡담채널", ["로또연구소"], 70_000, 20, "unlikely"),
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
            for i, (key, title, ch, kws, views, days, sh) in enumerate(rows, 1):
                await cur.execute(
                    "INSERT INTO lotto_video VALUES "
                    "(%s,%s,%s,%s,null,now() - make_interval(days => %s),"
                    "null,%s,%s,'no','yes','public',null,'lotto',%s)",
                    (i, key, title, ch, days, views, sh, kws),
                )

            async def query(*, q=None, days=None, sort="latest", kind="all") -> list[str]:
                where, params = repo._video_where(kind, None, None, q, days)
                order_by = repo._VIDEO_ORDER_BY[sort]
                await cur.execute(
                    f"SELECT provider_video_key FROM lotto_video{where} "
                    f"ORDER BY {order_by}",
                    tuple(params),
                )
                return [r[0] for r in await cur.fetchall()]

            # ── q — 세 컬럼을 각각 맞힌다 ─────────────────────────────
            # 제목으로
            assert await query(q="꿈해몽") == ["v-new-low"]
            # 채널명으로 (뉴스에는 없는 대상이다)
            assert set(await query(q="복권TV")) == {"v-new-mid", "v-new-null"}
            # 키워드 배열로. ★ 'v-mid-hit' 는 제목·채널이 아니라 **키워드**에만
            # '로또연구소' 가 있다 — unnest 검사가 죽으면 이 행이 빠진다.
            assert set(await query(q="로또연구소")) == {
                "v-old-top", "v-new-low", "v-mid-hit",
            }
            # 대소문자 무시
            assert await query(q="복권tv") == await query(q="복권TV")
            # 와일드카드는 리터럴이다 — '%' 가 전건을 긁어오면 안 된다
            assert await query(q="%") == []

            # ── period — 경계를 넘는 행이 정확히 떨어진다 ─────────────
            assert set(await query(days=7)) == {"v-new-mid", "v-new-low", "v-new-null"}
            assert set(await query(days=30)) == {
                "v-new-mid", "v-new-low", "v-new-null", "v-mid-hit",
            }
            assert len(await query(days=90)) == 4  # 100일 전 영상은 여전히 빠진다
            assert len(await query()) == 5  # all 이면 전부

            # ── sort ────────────────────────────────────────────────
            # latest — 최신이 먼저
            assert (await query(sort="latest"))[0] == "v-new-null"
            # views — 조회수 내림차순, ★ NULL 은 **맨 뒤**
            assert await query(sort="views") == [
                "v-old-top", "v-mid-hit", "v-new-mid", "v-new-low", "v-new-null",
            ]

            # ── AND 결합 — 계약이 정한 것 ────────────────────────────
            # "최근 1주 인기" = period=1w & sort=views. 최근 7일 것만 남고 그 안에서
            # 현재 조회수로 줄을 선다. **7일간 늘어난 조회수가 아니다.**
            assert await query(days=7, sort="views") == [
                "v-new-mid", "v-new-low", "v-new-null",
            ]
            # q 와 kind 도 함께 AND 로 걸린다
            assert await query(q="로또연구소", kind="shorts") == ["v-new-low"]
            assert await query(q="로또연구소", days=7) == ["v-new-low"]


@pytest.mark.integration
async def test_total_은_검색_적용_후_건수다(client):
    """화면이 3건을 보여주면서 '총 611건' 이라고 말하면 안 된다.

    `count_videos` 에 필터를 넘기는 것을 빠뜨리면 정확히 그 상태가 된다 — items 는
    줄어들고 total 만 그대로다.
    """
    plain = (await client.get("/api/videos?size=1")).json()
    # 어떤 영상에도 없을 문자열로 검색하면 total 이 0 이어야 한다
    narrowed = (await client.get("/api/videos?size=1&q=" + "gsQx7" * 5)).json()

    assert narrowed["total"] == 0
    assert narrowed["items"] == []
    # 데이터가 아예 없는 개발 환경에서는 둘 다 0 이라 위 단언이 저절로 성립한다.
    # 그 경우를 구분해 남긴다 — 조용히 통과해 초록불만 켜지면 아무것도 검증하지 않은 것이다.
    if plain["total"] == 0:
        pytest.skip("lotto_video 가 비어 있어 total 축소를 확인할 수 없습니다.")
    assert narrowed["total"] < plain["total"]


@pytest.mark.integration
async def test_실데이터에서_조회수_정렬과_기간이_맞는다(client):
    """개발 DB 의 실제 영상으로 본다. 임시 테이블이 흉내 낸 것과 같은지 대조하는 셈이다."""
    body = (await client.get("/api/videos?sort=views&size=100")).json()
    if body["total"] == 0:
        pytest.skip("lotto_video 가 비어 있습니다.")

    views = [i["views"] for i in body["items"]]
    # None 은 맨 뒤에 몰려 있어야 한다
    known = [v for v in views if v is not None]
    assert views[: len(known)] == known, "NULL 조회수가 앞쪽에 섞였습니다"
    assert known == sorted(known, reverse=True)

    # period 는 total 을 좁히기만 한다 (1w ⊆ 1m ⊆ 3m ⊆ all)
    totals = {}
    for period in ("1w", "1m", "3m", "all"):
        totals[period] = (await client.get(f"/api/videos?period={period}&size=1")).json()[
            "total"
        ]
    assert totals["1w"] <= totals["1m"] <= totals["3m"] <= totals["all"]
    assert totals["all"] == body["total"]
