"""운영자 전용 — 수집 잡 이력.

**공개 API 가 아니다.** 사이트 운영자 한 사람만 쓰는 화면의 데이터원이고, 나머지
엔드포인트와 규칙이 다르다 (docs/wiki/10-contracts/api-contract.md 의 '운영자 전용' 절).

## 아이디 · 비밀번호 · OTP 2단계 (2026-08-31)

종전에는 64자 랜덤 토큰 하나를 입력받았다. 외우지 못해 늘 복사해 붙여야 했고, 사용자가
"아이디·비밀번호로 하고 싶다" 고 요청했다.

⚠ **아이디·비밀번호'만'으로 바꾸면 종전보다 약해진다.** 사람이 기억하는 비밀번호는
64자 랜덤보다 훨씬 추측하기 쉽기 때문이다. 그래서 **OTP(TOTP, RFC 6238)를 함께** 받는다 —
외우기 쉬운 비밀번호를 쓰더라도 30초마다 바뀌는 여섯 자리가 그 약점을 덮는다.

**계정 테이블은 여전히 만들지 않는다.** 쓰는 사람이 한 명이고, 계정 시스템은 그 자체로
공격면이자 유지보수 대상이다. 계정 하나를 환경변수에 둔다
(`scripts/make_admin_credentials.py` 가 만든다).

## 이 파일에서 조심할 것 다섯

1. **`secrets.compare_digest`** 로 비교한다. `==` 는 앞에서부터 다른 자리를 만나면 즉시
   반환하므로, 응답 시간 차이로 값을 한 글자씩 알아낼 수 있다.
2. **설정이 하나라도 비면 전부 503.** 빈 문자열끼리의 `compare_digest` 는 **통과한다** —
   빈 값을 '인증 없음' 으로 두면 아무나 들어온다. 인증이 없는 것보다 나쁘다.
   ⚠ 특히 **OTP 비밀키가 없다고 비밀번호만으로 통과시키지 않는다.** 2단계를 켜 두었다고
   믿는 사람에게 1단계만 돌려주는 것이 가장 나쁜 실패다.
3. **쿠키에 자격증명을 담지 않는다.** XSS 한 번에 영구 자격증명이 새기 때문이다. 서명된
   세션 값(발급시각 + HMAC)을 담아 만료를 강제한다.
4. **왜 틀렸는지 알려주지 않는다.** 아이디가 틀렸다/비밀번호가 틀렸다/OTP 가 틀렸다를
   구분해 주면 그 자체가 공격자에게 주는 정보다(아이디가 맞는지부터 알려 주는 셈이다).
   전부 같은 401 이다.
5. **세 값을 전부 검사한 뒤에 판정한다.** 아이디가 틀렸다고 곧바로 반환하면 응답 시간이
   달라져 아이디의 존재 여부가 새어 나간다.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import secrets
import time
from collections import defaultdict, deque
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response

from .. import repository as repo
from ..config import settings
from ..db import get_pool
from ..schemas import AdminLoginRequest, JobLogsResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin"])

SESSION_COOKIE = "lb_admin"

# 로그인 브루트포스 방어. 토큰이 32바이트 랜덤이면 실질 위험은 낮지만, 로그인
# 엔드포인트가 공개된 이상 기본 방어는 둔다.
#
# ⚠ **프로세스 메모리에 둔다.** 워커를 여러 개 띄우면 각자 따로 센다. 지금은 백엔드가
# 한 프로세스이고, 이 방어의 목적이 "무한 시도를 성가시게 만드는 것" 이지 정밀한
# 레이트리밋이 아니라서 그대로 둔다. 프로세스를 늘릴 때 다시 본다.
_LOGIN_MAX_PER_MINUTE = 10
_LOGIN_WINDOW_SEC = 60.0
_login_attempts: dict[str, deque[float]] = defaultdict(deque)


def _client_ip(request: Request) -> str:
    """프록시 뒤에 있을 수 있으므로 `X-Forwarded-For` 의 첫 값을 우선한다.

    ⚠ 이 헤더는 **클라이언트가 위조할 수 있다.** 그래서 인증이 아니라 레이트리밋에만
    쓴다 — 위조하면 자기 카운터를 흩뜨릴 뿐 남의 접근을 얻지는 못한다. 신뢰할 수 있는
    프록시를 앞에 두면 그 프록시가 이 헤더를 덮어쓴다.
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _rate_limited(ip: str) -> bool:
    """분당 시도 횟수를 넘었으면 True. 넘지 않았으면 이번 시도를 기록한다."""
    now = time.monotonic()
    attempts = _login_attempts[ip]
    while attempts and now - attempts[0] > _LOGIN_WINDOW_SEC:
        attempts.popleft()
    if len(attempts) >= _LOGIN_MAX_PER_MINUTE:
        return True
    attempts.append(now)
    return False


def _require_enabled() -> None:
    """자격증명이 하나라도 없으면 이 경로 전체를 죽인다.

    기동 자체를 막지 않는 이유: 운영자 화면 하나 때문에 공개 API 전체가 안 뜨면 손해가
    더 크다. 그래서 이 경로만 503 으로 죽이고, 공개 엔드포인트는 멀쩡히 돈다.
    """
    if not settings.admin_enabled:
        logger.error(
            "운영자 자격증명이 비어 있어 /api/admin/* 를 막았습니다 "
            "(ADMIN_USERNAME · ADMIN_PASSWORD_HASH · ADMIN_TOTP_SECRET · "
            "ADMIN_SESSION_SECRET 중 하나 이상). "
            "`uv run python scripts/make_admin_credentials.py` 로 만들어 "
            ".env_backend 에 넣으세요."
        )
        raise HTTPException(
            status_code=503, detail="운영자 기능이 설정되지 않았습니다."
        )


# ── 자격증명 검증 ────────────────────────────────────────────────────────


def _verify_password(password: str, stored: str) -> bool:
    """`scrypt$n$r$p$salt$hash` 를 검증한다. 형식은 `scripts/make_admin_credentials.py` 가 만든다.

    파라미터를 해시 문자열에서 읽는 이유: 나중에 강도를 올려도 **이미 만든 자격증명이
    깨지지 않는다.** 상수로 박아 두면 파라미터를 바꾸는 순간 로그인이 안 되고, 원인이
    "비밀번호가 틀렸다" 로만 보인다.

    형식이 깨졌으면 통과시키지 않는다 — 설정이 잘못된 것을 '인증 성공' 으로 바꾸지 않는다.
    """
    try:
        scheme, n, r, p, salt_hex, hash_hex = stored.split("$")
        if scheme != "scrypt":
            return False
        expected = bytes.fromhex(hash_hex)
        actual = hashlib.scrypt(
            password.encode("utf-8"),
            salt=bytes.fromhex(salt_hex),
            n=int(n),
            r=int(r),
            p=int(p),
            dklen=len(expected),
            maxmem=256 * 1024 * 1024,
        )
    except (ValueError, TypeError, MemoryError):
        logger.error(
            "ADMIN_PASSWORD_HASH 형식이 올바르지 않습니다. "
            "scripts/make_admin_credentials.py 로 다시 만드세요."
        )
        return False
    return secrets.compare_digest(actual, expected)


def _verify_otp(code: str, secret: str) -> bool:
    """TOTP(RFC 6238) 여섯 자리를 검증한다.

    `valid_window=1` — 앞뒤 30초를 함께 인정한다. 사람이 코드를 읽고 입력하는 사이에
    주기가 바뀌는 일이 흔하고, 서버와 폰의 시계가 몇 초 어긋나기도 한다. 창을 0 으로
    두면 "분명히 맞게 쳤는데 안 된다" 가 반복된다.
    ⚠ 창을 더 넓히지 않는다 — 넓힐수록 한 코드가 유효한 시간이 길어진다.
    """
    import pyotp

    try:
        return pyotp.TOTP(secret).verify(code, valid_window=1)
    except Exception:  # noqa: BLE001
        # 비밀키가 base32 가 아니면 여기서 터진다. 설정 오류를 통과로 바꾸지 않는다.
        logger.error(
            "ADMIN_TOTP_SECRET 이 올바른 base32 가 아닙니다. "
            "scripts/make_admin_credentials.py 로 다시 만드세요."
        )
        return False


# ── 세션 쿠키 ────────────────────────────────────────────────────────────


def _cookie_secure(request: Request) -> bool:
    """세션 쿠키에 `Secure` 를 붙일지 정한다.

    ⚠ **요청 스킴만으로는 알 수 없다.** 2026-08-28 에는 `request.url.scheme` 으로 정했으나
    그 판단이 이 구조에서 틀린다는 것을 확인했다 — 브라우저는 프론트(Next)와만 말하고
    **Next 서버가 백엔드를 중계**하므로, 백엔드에 닿는 요청은 내부망 평문 HTTP 다.
    사용자가 HTTPS 를 쓰고 있어도 백엔드는 그 사실을 알 방법이 없다.

    그래서 `ADMIN_COOKIE_SECURE` 로 **사람이 명시한다.** 설정 키를 늘리지 않으려던 종전
    판단을 뒤집는 것인데, 그 판단의 전제("스킴은 서버가 아는 사실이다")가 성립하지
    않기 때문이다.

    스킴·헤더가 HTTPS 라고 말하면 설정과 무관하게 붙인다 — 켜야 할 때 끄지 않기 위해서다.
    반대 방향(HTTPS 인데 끄는 것)은 하지 않는다.
    """
    if settings.ADMIN_COOKIE_SECURE:
        return True
    if request.url.scheme == "https":
        return True
    # 중계자가 원래 스킴을 알려 주면 그것도 믿는다. 프론트 프록시가 이 헤더를 붙이면
    # 설정 없이도 올바르게 동작한다.
    return request.headers.get("x-forwarded-proto") == "https"


def _sign(issued_at: int) -> str:
    """발급시각에 대한 HMAC. 쿠키 값은 `{발급시각}.{서명}` 이다.

    자격증명 대신 이것을 담으므로, 쿠키가 새더라도 새는 것은 **만료가 있는 세션**이지
    영구 자격증명이 아니다. 서명 키가 다른 비밀값과 달라야 하는 이유도 여기 있다 —
    같으면 서명에서 그것을 역산할 여지가 생긴다(설정에서 같으면 기동을 거부한다).
    """
    return hmac.new(
        settings.ADMIN_SESSION_SECRET.encode("utf-8"),
        str(issued_at).encode("ascii"),
        hashlib.sha256,
    ).hexdigest()


def _make_session() -> str:
    # ⚠ `time.time()` 을 두 번 부르지 않는다. 초 경계에 걸리면 쿠키에 담는 발급시각과
    # 서명한 발급시각이 1초 어긋나 **방금 만든 세션이 즉시 무효**가 된다. 재현이 드물어
    # ("가끔 로그인이 안 된다") 잡기 어려운 종류다.
    issued_at = int(time.time())
    return f"{issued_at}.{_sign(issued_at)}"


def _valid_session(raw: Optional[str]) -> bool:
    """서명과 만료를 함께 본다.

    서명만 보면 한 번 발급된 쿠키가 영원히 유효해진다. 만료만 보면 발급시각을 바꿔
    누구나 새 쿠키를 만들 수 있다 — 둘 다 필요하다.
    """
    if not raw or "." not in raw:
        return False
    issued_str, _, signature = raw.partition(".")
    try:
        issued_at = int(issued_str)
    except ValueError:
        return False

    # 서명 비교도 상수 시간으로 한다. 여기서 새는 것은 토큰이 아니라 세션이지만,
    # 세션을 위조할 수 있으면 토큰을 아는 것과 결과가 같다.
    if not secrets.compare_digest(signature, _sign(issued_at)):
        return False

    age = time.time() - issued_at
    # 미래 시각으로 발급된 쿠키는 거부한다. 서명이 맞아도(=우리가 만든 것이어도)
    # 서버 시계가 뒤로 간 상황이므로, 만료 계산을 믿을 수 없다.
    if age < 0:
        return False
    return age < settings.ADMIN_SESSION_HOURS * 3600


async def require_session(request: Request) -> None:
    """로그인 여부를 확인하는 의존성. 아니면 401."""
    _require_enabled()
    if not _valid_session(request.cookies.get(SESSION_COOKIE)):
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")


# ── 엔드포인트 ────────────────────────────────────────────────────────────


@router.post("/login", status_code=200)
async def login(req: AdminLoginRequest, request: Request, response: Response) -> dict:
    _require_enabled()

    ip = _client_ip(request)
    if _rate_limited(ip):
        # 어떤 토큰을 보냈든 세지 않고 막는다. 성공/실패를 가른 뒤 세면 그 차이가
        # 다시 정보가 된다.
        logger.warning("운영자 로그인 시도가 분당 한도를 넘었습니다 (ip=%s)", ip)
        raise HTTPException(status_code=429, detail="잠시 후 다시 시도하세요.")

    # ★ **세 가지를 전부 검사한 뒤에 판정한다.**
    #
    # 아이디가 틀렸다고 곧바로 반환하면, 아이디가 맞을 때만 비밀번호 해시 계산(0.1초)이
    # 돌아 **응답 시간으로 아이디의 존재 여부가 새어 나간다.** 순서를 지키는 대신 결과를
    # 모아 마지막에 한 번 판정한다.
    ok_user = secrets.compare_digest(
        req.username.strip(), settings.ADMIN_USERNAME.strip()
    )
    ok_password = _verify_password(req.password, settings.ADMIN_PASSWORD_HASH.strip())
    ok_otp = _verify_otp(req.otp.strip(), settings.ADMIN_TOTP_SECRET.strip())

    if not (ok_user and ok_password and ok_otp):
        # 무엇이 틀렸는지 **로그에도** 남기지 않는다. 서버 로그를 본 사람에게 "아이디는
        # 맞았다" 를 알려 줄 이유가 없다.
        logger.warning("운영자 로그인 실패 (ip=%s)", ip)
        raise HTTPException(status_code=401, detail="인증에 실패했습니다.")

    secure = _cookie_secure(request)

    response.set_cookie(
        key=SESSION_COOKIE,
        value=_make_session(),
        httponly=True,       # JS 가 읽지 못한다 — XSS 로 쿠키를 훔쳐가지 못하게
        samesite="lax",      # 다른 사이트에서 온 POST 에 쿠키가 실리지 않는다
        path="/",
        max_age=settings.ADMIN_SESSION_HOURS * 3600,
        secure=secure,
    )
    return {"status": "ok"}


@router.post("/logout", status_code=204)
async def logout(response: Response) -> None:
    # 설정이 비어 있어도 로그아웃은 막지 않는다. 쿠키를 지우는 일은 인증이 필요 없고,
    # 여기서 503 을 내면 설정을 지운 뒤 브라우저에 남은 쿠키를 버릴 방법이 사라진다.
    response.delete_cookie(key=SESSION_COOKIE, path="/")


@router.get(
    "/job-logs",
    response_model=JobLogsResponse,
    dependencies=[Depends(require_session)],
)
async def job_logs(
    job_name: Optional[str] = Query(None, description="잡 이름. 정본은 worker-jobs.md"),
    status: Optional[str] = Query(None, description="running | success | failed"),
    limit: int = Query(50, ge=1, le=200),
    before_id: Optional[int] = Query(
        None, ge=1, description="이전 응답의 next_before_id. 커서 페이징"
    ),
) -> dict:
    if status is not None and status not in repo.JOB_LOG_STATUSES:
        raise HTTPException(
            status_code=422,
            detail=f"알 수 없는 status 입니다: {status}. "
            f"가능한 값: {', '.join(repo.JOB_LOG_STATUSES)}",
        )
    # `job_name` 은 검증하지 않는다. `job_nm` 에 CHECK 가 없고(잡이 늘 때마다
    # 마이그레이션을 강제하지 않으려는 설계) 잡 목록의 정본은 워커의 위키다. 백엔드가
    # 목록을 박아 두면 워커가 잡을 추가할 때마다 여기가 틀린 답을 하게 된다.

    pool = get_pool()
    # ⚠ 요약에는 목록 필터를 넘기지 않는다. 요약은 "지난 7일 전체가 어땠는가" 이고,
    # 실패만 보려고 필터를 건 사용자에게 "실패 3 / 실행 3" 을 보여주면 전부 실패한
    # 것처럼 읽힌다.
    summary = await repo.job_log_summary(pool)
    items = await repo.list_job_logs(
        pool, limit=limit, job_name=job_name, status=status, before_id=before_id
    )

    # 받은 개수가 limit 에 못 미치면 더 없는 것이다. 딱 맞으면 다음 쪽이 비어 있을
    # 수도 있지만, 그때 빈 목록을 한 번 받는 편이 "있는데 안 보이는" 것보다 낫다.
    next_before_id = items[-1]["run_id"] if len(items) == limit else None
    return {"summary": summary, "items": items, "next_before_id": next_before_id}
