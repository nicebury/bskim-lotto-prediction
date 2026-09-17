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

USERNAME = "bskim"
PASSWORD = "test-password-0123456789"
SECRET = "test-session-secret-fedcba9876543210"
# base32 여야 인증 앱이 읽는다. 고정값이라 테스트가 매번 같은 코드를 만든다.
TOTP_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP"


def _hash(password: str) -> str:
    """생성 스크립트와 **같은 함수**로 해시한다.

    테스트가 자기만의 해시를 만들면, 스크립트가 형식을 바꿔도 테스트는 통과한다 —
    실제로 로그인이 안 되는데 초록불만 켜지는 최악의 조합이다.
    """
    import importlib.util
    import pathlib as _p

    spec = importlib.util.spec_from_file_location(
        "mac", _p.Path(__file__).resolve().parent.parent / "scripts" / "make_admin_credentials.py"
    )
    mac = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mac)  # type: ignore[union-attr]
    return mac.hash_password(password)


def _otp() -> str:
    import pyotp

    return pyotp.TOTP(TOTP_SECRET).now()


@pytest.fixture(scope="session")
def password_hash() -> str:
    """scrypt 는 일부러 느리다(0.1초). 세션에 한 번만 만든다."""
    return _hash(PASSWORD)


@pytest.fixture
def admin_env(monkeypatch, password_hash):
    """운영자 설정을 켠 상태. 실제 `.env_backend` 값에 의존하지 않는다.

    테스트가 사용자의 실제 자격증명을 필요로 하면, 그 값이 없는 CI 에서 조용히 skip 되어
    **인증 검증이 통째로 사라진다.** 값을 주입해 항상 돌게 한다.
    """
    monkeypatch.setattr(settings, "ADMIN_USERNAME", USERNAME)
    monkeypatch.setattr(settings, "ADMIN_PASSWORD_HASH", password_hash)
    monkeypatch.setattr(settings, "ADMIN_TOTP_SECRET", TOTP_SECRET)
    monkeypatch.setattr(settings, "ADMIN_SESSION_SECRET", SECRET)
    monkeypatch.setattr(settings, "ADMIN_SESSION_HOURS", 12)
    monkeypatch.setattr(settings, "ADMIN_COOKIE_SECURE", False)
    # 시도 기록이 테스트 사이에 남으면 뒤 테스트가 429 로 엉뚱하게 실패한다.
    admin._login_attempts.clear()
    yield
    admin._login_attempts.clear()


def _creds(**over) -> dict:
    body = {"username": USERNAME, "password": PASSWORD, "otp": _otp()}
    body.update(over)
    return body


@pytest.fixture
def disabled_env(monkeypatch):
    monkeypatch.setattr(settings, "ADMIN_USERNAME", "")
    monkeypatch.setattr(settings, "ADMIN_PASSWORD_HASH", "")
    monkeypatch.setattr(settings, "ADMIN_TOTP_SECRET", "")
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

    assert (await client.post("/api/admin/login", json=_creds())).status_code == 503
    assert (await client.get("/api/admin/job-logs")).status_code == 503


@pytest.mark.integration
async def test_설정이_비어도_로그아웃은_막지_않는다(client, disabled_env):
    """설정을 지운 뒤 브라우저에 남은 쿠키를 버릴 방법이 사라지면 안 된다."""
    assert (await client.post("/api/admin/logout")).status_code == 204


# ── 로그인 ────────────────────────────────────────────────────────────────


@pytest.mark.integration
async def test_셋_중_하나만_틀려도_401_이고_이유를_알려주지_않는다(client, admin_env):
    """★ 아이디가 맞았는지조차 알려주지 않는다 — 그 자체가 공격자에게 주는 정보다."""
    cases = {
        "아이디 틀림": _creds(username="other"),
        "비밀번호 틀림": _creds(password="wrong-password-xx"),
        "OTP 틀림": _creds(otp="000000"),
        "전부 틀림": {"username": "a", "password": "b", "otp": "111111"},
    }
    details = set()
    for label, body in cases.items():
        r = await client.post("/api/admin/login", json=body)
        assert r.status_code == 401, label
        details.add(r.json()["detail"])

    # 네 경우가 **같은 문구**여야 한다. 다르면 어느 것이 맞았는지 드러난다.
    assert len(details) == 1, details


@pytest.mark.integration
async def test_맞는_자격증명은_쿠키를_주는데_원문이_아니다(client, admin_env):
    """★ 쿠키에 원문을 담으면 XSS 한 번에 영구 자격증명이 샌다."""
    r = await client.post("/api/admin/login", json=_creds())
    assert r.status_code == 200

    raw = client.cookies.get(admin.SESSION_COOKIE)
    assert raw
    assert PASSWORD not in raw
    assert SECRET not in raw
    assert TOTP_SECRET not in raw
    # 형식은 `{발급시각}.{HMAC}`
    issued, _, sig = raw.partition(".")
    assert issued.isdigit() and len(sig) == 64

    set_cookie = r.headers.get("set-cookie", "")
    assert "HttpOnly" in set_cookie
    assert "SameSite=lax" in set_cookie.replace("samesite", "SameSite")


@pytest.mark.integration
async def test_분당_한도를_넘으면_429(client, admin_env):
    codes = [
        (await client.post("/api/admin/login", json=_creds(password="wrong"))).status_code
        for _ in range(admin._LOGIN_MAX_PER_MINUTE + 3)
    ]
    assert codes[0] == 401
    assert 429 in codes
    # 한도에 걸린 뒤에는 **맞는 자격증명이어도** 막힌다 — 성공/실패를 가른 뒤 세면
    # 그 차이가 다시 정보가 된다.
    assert (await client.post("/api/admin/login", json=_creds())).status_code == 429


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
    r = await client.post("/api/admin/login", json=_creds())
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


@pytest.mark.integration
async def test_HTTPS_면_Secure_가_붙는다(client, admin_env):
    """리버스 프록시가 `X-Forwarded-Proto` 를 알려 주고 uvicorn 이 그것을 신뢰하면
    스킴이 `https` 가 되어 `Secure` 가 붙는다.

    ASGI 스코프의 scheme 을 직접 https 로 만들어 그 경로를 재현한다.
    """
    async with httpx.AsyncClient(
        transport=ASGITransport(app=app), base_url="https://test"
    ) as https_c:
        r = await https_c.post("/api/admin/login", json=_creds())
        assert r.status_code == 200
        assert "Secure" in r.headers.get("set-cookie", "")


@pytest.mark.integration
async def test_중계자가_HTTPS_라고_알리면_Secure_가_붙는다(client, admin_env):
    """★ 이 구조에서는 요청 스킴만으로 판단할 수 없다.

    브라우저는 프론트(Next)와만 말하고 **Next 서버가 백엔드를 중계**하므로, 백엔드에
    닿는 요청은 내부망 평문 HTTP 다 — 사용자가 HTTPS 를 써도 백엔드는 알 방법이 없다.
    중계자가 원래 스킴을 알려 주면 그것을 믿는다.
    """
    r = await client.post(
        "/api/admin/login", json=_creds(), headers={"X-Forwarded-Proto": "https"}
    )
    assert r.status_code == 200
    assert "Secure" in r.headers.get("set-cookie", "")


@pytest.mark.integration
async def test_설정으로_Secure_를_강제할_수_있다(client, admin_env, monkeypatch):
    """운영에서 켜야 할 때 못 켜는 일이 없어야 한다 — 헤더가 없어도 설정이 이긴다."""
    monkeypatch.setattr(settings, "ADMIN_COOKIE_SECURE", True)
    r = await client.post("/api/admin/login", json=_creds())
    assert r.status_code == 200
    assert "Secure" in r.headers.get("set-cookie", "")


@pytest.mark.integration
async def test_평문_HTTP_기본값에서는_Secure_가_없다(client, admin_env):
    """로컬 http 에서 Secure 를 붙이면 브라우저가 쿠키를 저장하지 않아 조용히 실패한다."""
    r = await client.post("/api/admin/login", json=_creds())
    assert r.status_code == 200
    assert "Secure" not in r.headers.get("set-cookie", "")


# ── OTP ──────────────────────────────────────────────────────────────────


@pytest.mark.integration
async def test_비밀번호가_맞아도_OTP_없이는_못_들어온다(client, admin_env):
    """★ 2단계의 존재 이유다. 비밀번호가 새어도 이것이 남는다."""
    r = await client.post(
        "/api/admin/login",
        json={"username": USERNAME, "password": PASSWORD, "otp": "000000"},
    )
    assert r.status_code == 401


@pytest.mark.integration
async def test_OTP_가_맞아도_비밀번호_없이는_못_들어온다(client, admin_env):
    r = await client.post(
        "/api/admin/login",
        json={"username": USERNAME, "password": "nope-nope-nope", "otp": _otp()},
    )
    assert r.status_code == 401


@pytest.mark.integration
async def test_OTP_설정이_비면_비밀번호만으로_통과시키지_않는다(
    client, admin_env, monkeypatch
):
    """★ 2단계를 켜 두었다고 믿는 사람에게 1단계만 돌려주는 것이 가장 나쁜 실패다."""
    monkeypatch.setattr(settings, "ADMIN_TOTP_SECRET", "")
    r = await client.post("/api/admin/login", json=_creds())
    assert r.status_code == 503  # 통과(200)도 401 도 아닌, 설정 오류로 죽는다


@pytest.mark.integration
async def test_지난_코드는_거부한다(client, admin_env):
    """`valid_window=1` 은 앞뒤 30초까지다. 그보다 오래된 코드는 안 된다."""
    import pyotp

    old_code = pyotp.TOTP(TOTP_SECRET).at(int(time.time()) - 300)
    r = await client.post("/api/admin/login", json=_creds(otp=old_code))
    assert r.status_code == 401


def test_생성_스크립트의_해시를_서버가_검증한다(password_hash):
    """스크립트와 서버가 **같은 형식**을 쓰는지 본다.

    둘이 갈라지면 로그인이 안 되는데 원인은 "비밀번호가 틀렸다" 로만 보인다.
    """
    assert admin._verify_password(PASSWORD, password_hash) is True
    assert admin._verify_password("틀린비밀번호", password_hash) is False
    # 형식이 깨진 설정을 '인증 성공' 으로 바꾸지 않는다
    assert admin._verify_password(PASSWORD, "garbage") is False
    assert admin._verify_password(PASSWORD, "") is False


def test_잘못된_OTP_비밀키는_통과가_아니라_실패다():
    assert admin._verify_otp("123456", "not-base32!!") is False
    assert admin._verify_otp("123456", "") is False
