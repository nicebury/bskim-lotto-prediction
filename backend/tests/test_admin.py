"""운영자 전용 API (`/api/admin/*`).

2026-08-28 계약 신설. **공개 API 가 아니고 규칙이 다르다**
(docs/wiki/10-contracts/api-contract.md 의 '운영자 전용 — 수집 로그' 절).

여기서 잡으려는 것은 기능이 아니라 **인증이 뚫리는 경우**다. 이 화면은 운영 데이터를
보여주고, 뚫리면 조용히 뚫린다 — 화면이 정상 동작하므로 아무 증상이 없다.

1. 설정이 비면 503 (빈 문자열끼리의 compare_digest 는 통과한다)
2. 쿠키에 토큰 원문이 담기지 않는다
3. 서명이 없거나 위조된 쿠키는 401
4. 만료된 세션은 401
5. 로그인 브루트포스는 429
"""
from __future__ import annotations

import time

import httpx
import pytest
from httpx import ASGITransport

from app import repository as repo
from app.config import settings
from app.db import close_pool, open_pool
from app.main import app
from app.routers import admin

from .conftest import _table_exists

TOKEN = "test-admin-token-0123456789abcdef"
SECRET = "test-session-secret-fedcba9876543210"


@pytest.fixture
def admin_env(monkeypatch):
    """운영자 설정을 켠 상태. 실제 `.env_backend` 값에 의존하지 않는다.

    테스트가 사용자의 실제 토큰을 필요로 하면, 그 값이 없는 CI 에서 조용히 skip 되어
    **인증 검증이 통째로 사라진다.** 값을 주입해 항상 돌게 한다.
    """
    monkeypatch.setattr(settings, "ADMIN_TOKEN", TOKEN)
    monkeypatch.setattr(settings, "ADMIN_SESSION_SECRET", SECRET)
    monkeypatch.setattr(settings, "ADMIN_SESSION_HOURS", 12)
    # 시도 기록이 테스트 사이에 남으면 뒤 테스트가 429 로 엉뚱하게 실패한다.
    admin._login_attempts.clear()
    yield
    admin._login_attempts.clear()


@pytest.fixture
def disabled_env(monkeypatch):
    monkeypatch.setattr(settings, "ADMIN_TOKEN", "")
    monkeypatch.setattr(settings, "ADMIN_SESSION_SECRET", "")
    admin._login_attempts.clear()
    yield
    admin._login_attempts.clear()


@pytest.fixture
async def client():
    await open_pool()
    try:
        async with httpx.AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as c:
            yield c
    finally:
        await close_pool()


@pytest.fixture
def require_job_log():
    reason = _table_exists("collect_job_log")
    if reason:
        pytest.skip(reason)


# ── 설정이 비어 있을 때 ───────────────────────────────────────────────────


@pytest.mark.integration
async def test_설정이_비면_503_이지_통과가_아니다(client, disabled_env):
    """★ 가장 중요한 테스트.

    빈 문자열끼리의 `secrets.compare_digest("", "")` 는 **True 다.** 빈 값을 '인증 없음'
    으로 두면 빈 토큰을 보낸 누구나 들어온다 — 인증이 없는 것보다 나쁘다. 인증이
    있다고 착각하게 만들기 때문이다.
    """
    import secrets as _s

    # 전제 자체를 못 박아 둔다. 이 성질이 바뀌면 이 방어의 이유가 사라진다.
    assert _s.compare_digest("", "") is True

    assert (await client.post("/api/admin/login", json={"token": "x"})).status_code == 503
    assert (await client.get("/api/admin/job-logs")).status_code == 503


@pytest.mark.integration
async def test_설정이_비어도_로그아웃은_막지_않는다(client, disabled_env):
    """설정을 지운 뒤 브라우저에 남은 쿠키를 버릴 방법이 사라지면 안 된다."""
    assert (await client.post("/api/admin/logout")).status_code == 204


# ── 로그인 ────────────────────────────────────────────────────────────────


@pytest.mark.integration
async def test_틀린_토큰은_401_이고_이유를_알려주지_않는다(client, admin_env):
    for bad in ("", "x", TOKEN[:-1], TOKEN + "x", TOKEN.upper()):
        r = await client.post("/api/admin/login", json={"token": bad})
        # 빈 문자열은 스키마(min_length=1)에서 422 로 먼저 걸린다 — 그것도 통과는 아니다.
        assert r.status_code in (401, 422), bad
        if r.status_code == 401:
            # 무엇이 틀렸는지 구분되는 문구가 없어야 한다
            detail = r.json()["detail"]
            assert "짧" not in detail and "없" not in detail


@pytest.mark.integration
async def test_맞는_토큰은_쿠키를_주는데_토큰_원문이_아니다(client, admin_env):
    """★ 쿠키에 원문을 담으면 XSS 한 번에 영구 토큰이 샌다."""
    r = await client.post("/api/admin/login", json={"token": TOKEN})
    assert r.status_code == 200

    raw = client.cookies.get(admin.SESSION_COOKIE)
    assert raw
    assert TOKEN not in raw
    assert SECRET not in raw
    # 형식은 `{발급시각}.{HMAC}`
    issued, _, sig = raw.partition(".")
    assert issued.isdigit() and len(sig) == 64

    set_cookie = r.headers.get("set-cookie", "")
    assert "HttpOnly" in set_cookie
    assert "SameSite=lax" in set_cookie.replace("samesite", "SameSite")


@pytest.mark.integration
async def test_분당_한도를_넘으면_429(client, admin_env):
    codes = [
        (await client.post("/api/admin/login", json={"token": "wrong"})).status_code
        for _ in range(admin._LOGIN_MAX_PER_MINUTE + 3)
    ]
    assert codes[0] == 401
    assert 429 in codes
    # 한도에 걸린 뒤에는 **맞는 토큰이어도** 막힌다 — 성공/실패를 가른 뒤 세면
    # 그 차이가 다시 정보가 된다.
    assert (await client.post("/api/admin/login", json={"token": TOKEN})).status_code == 429


# ── 세션 검증 ─────────────────────────────────────────────────────────────


@pytest.mark.integration
async def test_쿠키가_없거나_위조되면_401(client, admin_env, require_job_log):
    assert (await client.get("/api/admin/job-logs")).status_code == 401

    now = int(time.time())
    for forged in (
        # 값은 ASCII 로 둔다. 비ASCII 쿠키는 헤더에 실리지 못해 **서버에 닿지도 않으므로**
        # 검증할 것이 없다(httpx 도 브라우저도 거절한다).
        "garbage",
        ".",
        f"{now}",                    # 서명 없음
        f"{now}.",                   # 빈 서명
        f"{now}.{'0' * 64}",         # 틀린 서명
        f"abc.{admin._sign(now)}",   # 발급시각이 숫자가 아니다
        # 발급시각만 바꿔 유효기간을 늘리려는 시도 — 서명이 안 맞는다
        f"{now + 999999}.{admin._sign(now)}",
    ):
        r = await client.get(
            "/api/admin/job-logs", cookies={admin.SESSION_COOKIE: forged}
        )
        assert r.status_code == 401, forged


@pytest.mark.integration
async def test_만료된_세션은_401(client, admin_env, require_job_log):
    """서명만 보면 한 번 발급된 쿠키가 영원히 유효해진다."""
    old = int(time.time()) - settings.ADMIN_SESSION_HOURS * 3600 - 10
    expired = f"{old}.{admin._sign(old)}"

    r = await client.get("/api/admin/job-logs", cookies={admin.SESSION_COOKIE: expired})
    assert r.status_code == 401

    # 아직 안 지난 것은 통과한다 — 만료 검사가 전부를 막아 버리면 안 된다
    fresh = int(time.time()) - 10
    r = await client.get(
        "/api/admin/job-logs", cookies={admin.SESSION_COOKIE: f"{fresh}.{admin._sign(fresh)}"}
    )
    assert r.status_code == 200


@pytest.mark.integration
async def test_미래_시각_쿠키는_거부한다(client, admin_env, require_job_log):
    """서명이 맞아도(=우리가 만든 것이어도) 만료 계산을 믿을 수 없는 상태다."""
    future = int(time.time()) + 3600
    r = await client.get(
        "/api/admin/job-logs",
        cookies={admin.SESSION_COOKIE: f"{future}.{admin._sign(future)}"},
    )
    assert r.status_code == 401


# ── 잡 이력 조회 ──────────────────────────────────────────────────────────


@pytest.fixture
async def logged_in(client, admin_env):
    r = await client.post("/api/admin/login", json={"token": TOKEN})
    assert r.status_code == 200
    return client


@pytest.mark.integration
async def test_로그인하면_이력을_준다(logged_in, require_job_log):
    r = await logged_in.get("/api/admin/job-logs?limit=5")
    assert r.status_code == 200
    body = r.json()

    # ★ 페이지네이션 봉투가 **아니다.** total 을 주지 않는다
    assert set(body) == {"summary", "items", "next_before_id"}
    assert "total" not in body
    assert "page" not in body

    for item in body["items"]:
        assert set(item) >= {
            "run_id", "job_name", "exec_type", "status", "started_at",
            "finished_at", "duration_sec", "collected_count", "error", "stat", "logs",
        }
        assert item["status"] in repo.JOB_LOG_STATUSES
        assert item["exec_type"] in ("cron", "manual")
    # 최신순
    ids = [i["run_id"] for i in body["items"]]
    assert ids == sorted(ids, reverse=True)


@pytest.mark.integration
async def test_요약은_목록_필터에_흔들리지_않는다(logged_in, require_job_log):
    """⚠ 실패만 보려고 필터를 걸었다고 요약까지 실패만 세면 **전부 실패한 것처럼** 보인다."""
    전체 = (await logged_in.get("/api/admin/job-logs")).json()["summary"]
    실패만 = (await logged_in.get("/api/admin/job-logs?status=failed")).json()["summary"]

    assert 전체 == 실패만


@pytest.mark.integration
async def test_커서_페이징이_겹치지도_건너뛰지도_않는다(logged_in, require_job_log):
    first = (await logged_in.get("/api/admin/job-logs?limit=3")).json()
    if first["next_before_id"] is None:
        pytest.skip("이력이 3건 이하라 커서를 검증할 수 없습니다.")

    second = (
        await logged_in.get(f"/api/admin/job-logs?limit=3&before_id={first['next_before_id']}")
    ).json()

    ids1 = [i["run_id"] for i in first["items"]]
    ids2 = [i["run_id"] for i in second["items"]]
    # 커서는 배타적이다 — 포함하면 경계의 행이 두 번 보인다
    assert not set(ids1) & set(ids2)
    if ids2:
        assert max(ids2) < min(ids1)


@pytest.mark.integration
async def test_알_수_없는_status_는_422(logged_in, require_job_log):
    assert (await logged_in.get("/api/admin/job-logs?status=done")).status_code == 422
    for s in repo.JOB_LOG_STATUSES:
        assert (await logged_in.get(f"/api/admin/job-logs?status={s}")).status_code == 200


@pytest.mark.integration
async def test_없는_잡_이름은_빈_목록이지_오류가_아니다(logged_in, require_job_log):
    """`job_nm` 에 CHECK 가 없어 잡 목록의 정본은 워커의 위키다.

    백엔드가 허용 목록을 박아 두면 워커가 잡을 추가할 때마다 여기가 틀린 답을 한다.
    """
    r = await logged_in.get("/api/admin/job-logs?job_name=존재하지않는잡")
    assert r.status_code == 200
    assert r.json()["items"] == []


@pytest.mark.integration
async def test_로그아웃하면_다시_401(logged_in, require_job_log):
    assert (await logged_in.get("/api/admin/job-logs")).status_code == 200
    assert (await logged_in.post("/api/admin/logout")).status_code == 204
    assert (await logged_in.get("/api/admin/job-logs")).status_code == 401
