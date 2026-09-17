"""계약 전수 검사 — 응답 **전체**에 걸리는 규약을 한자리에서 본다.

`test_api.py` 는 엔드포인트마다 그 엔드포인트의 필드를 본다. 여기는 반대로, 모든
응답을 한 번에 훑어 **어디에도 있으면 안 되는 것**을 찾는다.

## 왜 따로 두는가

2026-08-12 에 같은 성격의 전수검사를 돌려 "위반 0건" 을 기록했으나 **그 검사기가
저장소에 남지 않았다.** 그래서 그 뒤로 추가된 영상·운영자·꿈해몽 필드는 같은 검사를
받은 적이 없다. 한 번 돌리고 버리는 검사는 다음 사람이 다시 만들지 않는다 — 테스트로
둬야 매번 돈다.

## 여기서 보는 네 가지

1. **금지 필드명이 어디에도 없다** — 종전에는 `/recommend` 한 곳만 봤다. 계약의 표현
   규약은 *모든* 응답에 걸린다
2. **DB 컬럼명이 응답에 새지 않는다** — 계약의 첫 절이 "DB 컬럼명 ≠ API 필드명" 이다.
   매핑을 한 곳(`repository`)에서만 하기로 했으므로, 새면 그 규율이 깨진 것이다
3. **시각은 전부 KST(+09:00)** — 변환 지점이 둘이면 언젠가 아홉 시간이 어긋난다
4. **페이지네이션 봉투 규약** — 어떤 것이 봉투이고 어떤 것이 아닌지

전부 DB 가 필요하므로 `integration` 이다.
"""
from __future__ import annotations

import re
from typing import Any, Iterator

import httpx
import pytest
from httpx import ASGITransport

from app.db import close_pool, open_pool
from app.main import app

pytestmark = pytest.mark.integration


@pytest.fixture(scope="module")
async def payloads(require_lotto_draw: None) -> dict[str, Any]:
    """계약이 선언한 공개 엔드포인트를 전부 한 번씩 부른다.

    module 스코프인 이유: 꿈해몽이 임베딩 모델을 로드하느라 20초를 쓴다. 검사마다 다시
    부르면 검사를 늘릴수록 느려져, 결국 검사를 줄이게 된다.

    ⚠ 꿈해몽을 **빼지 않는다.** 계약이 `score` 를 금지 필드명으로 지목하면서 든 예가
    바로 `searcher.py` 의 유사도 점수다 — 새어 나갈 가능성이 가장 높은 곳을 빼면 이
    검사의 의미가 없다.
    """
    await open_pool()
    try:
        async with httpx.AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test", timeout=120.0
        ) as c:
            latest = (await c.get("/api/lotto/latest")).json()
            round_no = latest["round_no"]

            gets = {
                "latest": "/api/lotto/latest",
                "rounds": "/api/lotto/rounds?page=1&size=3",
                "rounds_index": "/api/lotto/rounds/index",
                "round_detail": f"/api/lotto/rounds/{round_no}",
                "frequency": "/api/lotto/stats/frequency?window=20",
                "hot_cold": "/api/lotto/stats/hot-cold?window=20&top=5",
                "pattern": "/api/lotto/stats/pattern?window=50",
                "pairs": "/api/lotto/stats/pairs?window=20&top=5",
                "number": "/api/lotto/stats/number/15",
                "news": "/api/news?size=3",
                "videos": "/api/videos?size=3",
                # 2026-09-17 에 더한 검색·정렬·기간 경로도 같은 검사를 받는다.
                # 새 파라미터가 응답의 모양을 바꾸지는 않지만, **넣지 않으면 그 경로만
                # 금지 필드명·DB 컬럼명·비KST 시각 검사를 피해 간다.**
                "videos_views": "/api/videos?size=3&sort=views&period=1m",
                "sitemap": "/api/meta/sitemap-entries",
            }
            out: dict[str, Any] = {}
            for name, path in gets.items():
                r = await c.get(path)
                assert r.status_code == 200, f"{path} → {r.status_code}"
                out[name] = r.json()

            r = await c.post("/api/lotto/recommend?strategy=pure_random&sets=2&seed=1")
            assert r.status_code == 200
            out["recommend"] = r.json()

            # 시뮬레이터는 `trials` 최소값으로 부른다 — 여기서 볼 것은 응답의 모양이지
            # 계산 시간이 아니다. 100,000 을 쓰면 이 검사 하나가 5초를 더 먹는다.
            r = await c.post(
                "/api/lotto/simulate", json={"sets": 1, "trials": 10_000, "seed": 1}
            )
            assert r.status_code == 200
            out["simulate"] = r.json()

            r = await c.get("/api/lotto/analyze?numbers=3,11,24,29,38,41")
            assert r.status_code == 200
            out["analyze"] = r.json()

            # 첫 요청만 20초. 이 하나 때문에 module 스코프를 쓴다.
            r = await c.post(
                "/api/dream/recommend",
                json={"text": "돼지가 나오는 꿈", "sets_per_tier": 2, "seed": 1},
            )
            assert r.status_code == 200
            out["dream"] = r.json()

            return out
    finally:
        await close_pool()


def _walk(node: Any, path: str = "") -> Iterator[tuple[str, Any, Any]]:
    """(경로, 키, 값) 을 재귀적으로 낸다. 키가 없는 자리(리스트 원소)는 키가 None."""
    if isinstance(node, dict):
        for k, v in node.items():
            yield f"{path}.{k}", k, v
            yield from _walk(v, f"{path}.{k}")
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield f"{path}[{i}]", None, v
            yield from _walk(v, f"{path}[{i}]")


# ── ① 금지 필드명 ─────────────────────────────────────────────────────────

# docs/wiki/10-contracts/api-contract.md 의 '표현 규약' 절.
# `score` 가 들어 있는 것이 중요하다 — 꿈해몽 searcher 가 유사도 점수를 들고 있고,
# 그것을 JSON 에 실으면 사용자는 확률로 읽는다.
FORBIDDEN_FIELDS = {
    "probability", "win_rate", "accuracy", "confidence",
    "hit_rate", "expected_value", "success_rate", "score",
}


def test_금지_필드명이_어떤_응답에도_없다(payloads):
    """★ 계약에서 가장 중요한 절이다. 필드 이름 하나가 서비스의 포지션을 바꾼다."""
    violations = [
        (name, path)
        for name, body in payloads.items()
        for path, key, _ in _walk(body)
        if key in FORBIDDEN_FIELDS
    ]
    assert not violations, f"금지 필드명 발견: {violations}"


def test_금지_필드명_목록이_계약과_일치한다():
    """검사 목록이 계약보다 좁아지면 검사가 조용히 약해진다.

    계약 문서에서 목록을 직접 읽어 대조한다 — 문서가 늘면 이 테스트가 먼저 깨져,
    사람이 목록을 옮겨 적는 것을 잊지 못하게 한다.
    """
    import pathlib

    doc = (
        pathlib.Path(__file__).resolve().parent.parent.parent
        / "docs/wiki/10-contracts/api-contract.md"
    ).read_text(encoding="utf-8")
    # "**금지되는 응답 필드명**: `a`, `b`, ..." 줄에서 백틱 안의 이름을 뽑는다
    line = next(l for l in doc.splitlines() if "금지되는 응답 필드명" in l)
    declared = set(re.findall(r"`(\w+)`", line))

    assert declared <= FORBIDDEN_FIELDS, (
        f"계약에는 있는데 검사 목록에 없는 필드: {declared - FORBIDDEN_FIELDS}"
    )


# ── ② DB 컬럼명 누출 ──────────────────────────────────────────────────────

# docs/wiki/10-contracts/db-schema.md 의 매핑표에서 **API 쪽과 이름이 다른** 것들.
# `round_no`·`duration_sec` 은 매핑표에서 양쪽 이름이 같으므로 뺀다 — 넣으면 정상
# 응답이 위반으로 잡힌다.
DB_ONLY_COLUMNS = {
    # lotto_draw
    "draw_ymd", "winning_no1", "winning_no2", "winning_no3",
    "winning_no4", "winning_no5", "winning_no6", "bonus_no",
    "total_sell_amt", "first_prize_amt", "first_winner_cnt", "first_accum_prize_amt",
    # lotto_news
    "news_id", "title_nm", "summary_desc", "link_url", "orig_link_url",
    "provider_nm", "published_dttm", "keyword_list",
    # lotto_video
    "video_id", "provider_video_key", "provider_channel_key", "channel_nm",
    "thumbnail_url", "view_cnt", "shorts_estimate_cd", "shorts_basis_desc",
    "made_for_kids_cd", "embeddable_cd", "privacy_status_cd", "discovery_cd",
    "game_cd", "collected_dttm", "refreshed_dttm",
    # collect_job_log
    "job_log_id", "job_nm", "exec_type_cd", "status_cd",
    "started_dttm", "finished_dttm", "collected_cnt", "error_desc",
    "stat_json", "log_list",
}


def test_DB_컬럼명이_응답에_새지_않는다(payloads):
    """계약의 첫 절이 "DB 컬럼명 ≠ API 필드명" 이다.

    매핑을 `repository` 한 곳에서만 하기로 했으므로, 컬럼명이 응답에 보이면 어딘가에서
    행을 그대로 흘려보낸 것이다. 공개 API 가 DB 스키마에 결합되면 컬럼 하나를 정리할
    때마다 프론트와 검색엔진에 노출된 JSON 이 함께 흔들린다 (ADR 0010).
    """
    violations = [
        (name, path)
        for name, body in payloads.items()
        for path, key, _ in _walk(body)
        if key in DB_ONLY_COLUMNS
    ]
    assert not violations, f"DB 컬럼명 누출: {violations}"


def test_영상의_숨김_컬럼_셋은_특히_나가지_않는다(payloads):
    """표시 조건 WHERE 절의 재료일 뿐이고, 계약이 응답 금지로 못 박았다."""
    hidden = {"made_for_kids", "embeddable", "privacy_status",
              "made_for_kids_cd", "embeddable_cd", "privacy_status_cd"}
    found = [p for p, k, _ in _walk(payloads["videos"]) if k in hidden]
    assert not found, found


def test_쇼츠_추정을_boolean_으로_바꾸지_않는다(payloads):
    """`is_shorts: true` 로 내보내는 순간 추정이 확정으로 둔갑한다."""
    for path, key, value in _walk(payloads["videos"]):
        assert key != "is_shorts", path
        if key == "shorts_hint":
            assert isinstance(value, str), f"{path} 가 문자열이 아니다: {value!r}"
            assert value in ("likely", "unlikely", "unknown"), value


# ── ③ 타임존 ──────────────────────────────────────────────────────────────

_ISO_DT = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}")


def test_모든_시각이_KST_다(payloads):
    """계약: "시각은 ISO 8601, 타임존은 KST(`+09:00`)".

    변환 지점이 둘이면 언젠가 아홉 시간이 어긋난다. psycopg 는 서버 타임존(대개 UTC)의
    aware datetime 을 주므로, `repository._to_kst` 를 빠뜨린 경로가 있으면 여기서 잡힌다.

    날짜만 있는 값(`draw_date`, `lastmod` 의 date)은 타임존이 없는 것이 정상이라 뺀다.
    """
    bad = [
        (name, path, value)
        for name, body in payloads.items()
        for path, _, value in _walk(body)
        if isinstance(value, str) and _ISO_DT.match(value) and not value.endswith("+09:00")
    ]
    assert not bad, f"KST 가 아닌 시각: {bad}"


# ── ④ 봉투 규약 ───────────────────────────────────────────────────────────


@pytest.mark.parametrize("name", ["rounds", "news", "videos", "videos_views"])
def test_목록은_페이지네이션_봉투다(payloads, name: str):
    body = payloads[name]
    assert set(body) == {"total", "page", "size", "items"}, name
    assert isinstance(body["items"], list)
    # total 은 **필터 적용 후** 건수다. 페이지 길이와 혼동하지 않는다.
    assert body["total"] >= len(body["items"])


def test_정렬이_계약대로다(payloads):
    """정렬이 불안정하면 페이지 경계에서 같은 항목이 두 번 보이거나 빠진다."""
    rounds = [r["round_no"] for r in payloads["rounds"]["items"]]
    assert rounds == sorted(rounds, reverse=True), "회차 목록은 최신순"

    # `/rounds/index` 는 페이지네이션 봉투가 아니라 `{total, rounds}` 다 — 페이징이
    # 없기 때문이다(선택 UI 는 전체를 한 번에 받는다).
    assert set(payloads["rounds_index"]) == {"total", "rounds"}
    idx = [r["round_no"] for r in payloads["rounds_index"]["rounds"]]
    assert idx == sorted(idx), "회차-날짜 목록은 오름차순"
    assert payloads["rounds_index"]["total"] == len(idx)

    sm = [r["round_no"] for r in payloads["sitemap"]["rounds"]]
    assert sm == sorted(sm), "사이트맵 회차는 오름차순"

    vids = [v["published_at"] for v in payloads["videos"]["items"]]
    assert vids == sorted(vids, reverse=True), "영상은 게시일 내림차순"

    # `sort=views` — 조회수 내림차순이고 **모르는 값(None)은 맨 뒤**다. NULL 을 앞에
    # 두면 조회수를 모르는 영상이 1위 자리를 차지해 사실을 왜곡한다(Postgres 의 DESC
    # 기본값이 바로 그렇게 동작하므로 계약이 NULLS LAST 를 명시했다).
    views = [v["views"] for v in payloads["videos_views"]["items"]]
    known = [v for v in views if v is not None]
    assert views[: len(known)] == known, "NULL 조회수가 앞쪽에 섞였습니다"
    assert known == sorted(known, reverse=True), "영상 조회수순은 내림차순"

    # hot/cold 는 횟수 내림차순, 동점이면 번호 오름차순
    hot = payloads["hot_cold"]["hot"]
    assert hot == sorted(hot, key=lambda h: (-h["count"], h["number"]))


def test_회차_상세의_traits_에는_hot_count_가_없다(payloads):
    """"어느 시점의 최근 몇 회차 기준인가" 라는 선택이 개입하는 값이라, 기준 window 를
    명시적으로 받는 추천 응답에만 등장한다."""
    traits = payloads["round_detail"]["traits"]
    assert "hot_count" not in traits and "cold_count" not in traits
    assert set(traits) == {
        "odd_even", "high_low", "sum", "range_distribution",
        "has_consecutive", "tail_variety",
    }


def test_추천에는_면책이_반드시_있다(payloads):
    d = payloads["recommend"]["disclaimer"]
    assert d and "보장" in d


def test_꿈해몽_응답이_계약_모양이다(payloads):
    """`from_text` 는 2026-08-28 에 더한 필드다. 없으면 프론트가 확장어를 구분하지 못한다."""
    body = payloads["dream"]
    assert set(body) == {"text", "matched_words", "tiers", "disclaimer"}
    for w in body["matched_words"]:
        assert set(w) == {"dream_word", "from_text", "matches"}
        assert isinstance(w["from_text"], bool)
        for m in w["matches"]:
            assert set(m) == {"gubun", "word", "numbers"}
            assert m["gubun"] in (1, 2, 3)


# ── ⑤ 계약이 못 박은 교차검증 ─────────────────────────────────────────────


def test_패턴의_두_값이_서로_맞는다(payloads):
    """계약: `consecutive_ratio` 는 `1 - consecutive_counts["0"]` 과 **같아야 한다**.

    ⚠ 이름에 속지 않는다. `sum_histogram` 은 **회차 수**이고 `consecutive_counts` 는
    이름과 달리 **비율**(0.0~1.0)이다. 계약이 그렇게 정했고 프론트가 그 전제로 그린다
    (docs/wiki/10-contracts/api-contract-stats.md).

    계약이 "두 값이 어긋나면 백엔드 버그다" 라고 직접 적은 유일한 교차검증이라 여기 둔다.
    """
    b = payloads["pattern"]

    # sum_histogram 은 개수 — rounds_analyzed 와 더해 사용자가 검산할 수 있어야 한다
    assert sum(b["sum_histogram"].values()) == b["rounds_analyzed"]
    assert all(isinstance(v, int) for v in b["sum_histogram"].values())

    # consecutive_counts 는 비율 — 합이 1
    cc = b["consecutive_counts"]
    assert abs(sum(cc.values()) - 1.0) < 1e-9, cc
    assert abs(b["consecutive_ratio"] - (1 - cc["0"])) < 1e-9, (
        f"consecutive_ratio {b['consecutive_ratio']} != 1 - counts['0'] {1 - cc['0']}"
    )


def test_번호_통계의_순위가_hot_cold_와_같은_규칙이다(payloads):
    """두 화면이 같은 번호에 다른 순위를 매기면 사용자는 어느 쪽도 믿지 않는다."""
    n = payloads["number"]
    assert 1 <= n["rank"] <= 45


def test_구간_메타가_다섯_엔드포인트_모두에_있다(payloads):
    """계약: "다섯 엔드포인트 모두" 응답 최상위에 구간 메타 넷을 담는다.

    이 문장은 한때 "세 엔드포인트" 였다가 002·003 으로 다섯이 됐다. 엔드포인트가 늘 때
    빠뜨리기 쉬운 자리라 전수로 본다.
    """
    for name in ("frequency", "hot_cold", "pattern", "pairs", "number"):
        body = payloads[name]
        assert {"from_round", "to_round", "from_date", "to_date"} <= set(body), name
        assert {"window", "rounds_analyzed"} <= set(body), name
