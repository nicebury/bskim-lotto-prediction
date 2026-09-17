"""운영자 계정 자격증명을 만든다 — 아이디 · 비밀번호 해시 · OTP 비밀키.

## 왜 스크립트인가

`.env_backend` 에 넣을 값 중 둘은 **사람이 손으로 만들 수 없다.** 비밀번호 해시는
scrypt 파라미터와 솔트를 정해 계산해야 하고, OTP 비밀키는 base32 여야 인증 앱이 읽는다.
손으로 만들라고 하면 결국 약한 값이 들어간다.

## 왜 비밀번호 원문을 두지 않는가

`.env_backend` 는 서버에 평문으로 놓인다. 원문을 두면 서버를 들여다본 사람이 그대로
쓰고, 더 나쁘게는 **다른 사이트에서 같은 비밀번호를 쓰고 있다면 그쪽까지 열린다.**
해시를 두면 그 두 가지가 사라진다.

`hashlib.scrypt` 는 표준 라이브러리다 — 이것 하나 때문에 의존성을 늘리지 않는다.
파라미터(n=2**15, r=8, p=1)는 OWASP 권고 범위이고, 검증에 0.1초쯤 걸린다. 로그인은
사람이 하루에 몇 번 하는 일이라 그 비용이 문제되지 않고, 무차별 대입에는 그만큼 비싸진다.

## 왜 OTP 를 함께 쓰는가

**아이디·비밀번호만으로 바꾸면 종전(64자 랜덤 토큰)보다 오히려 약해진다.** 사람이
기억하는 비밀번호는 언젠가 짧고 흔해지기 때문이다. OTP 가 그 약점을 덮는다 — 비밀번호가
새어도 30초마다 바뀌는 여섯 자리를 함께 알아야 들어온다.

표준 TOTP(RFC 6238)라 Microsoft Authenticator · Google Authenticator · 1Password 등
어느 앱이든 된다.

## 사용법

    cd backend
    uv run python scripts/make_admin_credentials.py

비밀번호는 화면에 찍히지 않는다(`getpass`). 결과로 나오는 네 줄을 `.env_backend` 에
붙여 넣고, 터미널의 QR 을 인증 앱으로 찍는다.

터미널이 QR 을 제대로 못 그리는 환경이 흔하다(폰트·폭·색 반전). 그래서 **손으로 입력하는
길이 기본**이고, QR 은 보조다. 브라우저로 보고 싶으면:

    uv run python scripts/make_admin_credentials.py --qr-svg /tmp/admin-otp.svg

⚠ 그 파일에는 **OTP 비밀키가 들어 있다.** 찍은 뒤 반드시 지운다. 그래서 기본값이 아니다.
"""
from __future__ import annotations

import base64
import getpass
import hashlib
import os
import secrets
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

# scrypt 파라미터. 값을 바꾸면 기존 해시는 그대로 검증된다 — 해시 문자열이 자기가 쓰인
# 파라미터를 함께 담기 때문이다(`scrypt$n$r$p$salt$hash`). 그래서 나중에 강도를 올려도
# 이미 만든 자격증명이 깨지지 않는다.
SCRYPT_N = 2**15
SCRYPT_R = 8
SCRYPT_P = 1
SALT_BYTES = 16
KEY_LEN = 32

ISSUER = "행운상자"


def hash_password(password: str, *, salt: bytes | None = None) -> str:
    """비밀번호 → `scrypt$n$r$p$salt$hash`.

    파라미터를 해시 문자열에 담는 이유는 위 상수 주석에 있다. 검증 함수
    (`app/routers/admin.py`)가 이 형식을 읽으므로 **형식을 바꾸면 양쪽을 함께 고친다.**
    """
    salt = salt or os.urandom(SALT_BYTES)
    dk = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=SCRYPT_N,
        r=SCRYPT_R,
        p=SCRYPT_P,
        dklen=KEY_LEN,
        # scrypt 는 n*r*p 에 비례해 메모리를 쓴다. 기본 한도(32MB)로는 n=2**15 가
        # 들어가지 않아 ValueError 가 난다 — 넉넉히 열어 준다.
        maxmem=256 * 1024 * 1024,
    )
    return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${salt.hex()}${dk.hex()}"


def _ask_password() -> str:
    """비밀번호를 받는다. 화면에 찍지 않는다.

    ⚠ TTY 가 없으면(에디터 내장 터미널·파이프) `getpass` 가 경고만 내고 **입력을 그대로
    보여준다.** 그 사실을 사람이 모르면 어깨너머로 새고, 스크롤백에 남는다. 조용히
    넘어가지 않고 멈춘다.
    """
    if not sys.stdin.isatty():
        raise SystemExit(
            "이 터미널은 비밀번호를 가려서 받을 수 없습니다(TTY 아님).\n"
            "일반 터미널 창에서 다시 실행하세요 — 그렇지 않으면 비밀번호가 화면과\n"
            "스크롤백에 그대로 남습니다."
        )
    return getpass.getpass("비밀번호(12자 이상, 화면에 안 보입니다): ")


def _grouped(secret: str, size: int = 4) -> str:
    """base32 를 네 글자씩 끊는다. 32자를 그대로 옮겨 적으면 사람이 반드시 틀린다."""
    return " ".join(secret[i : i + size] for i in range(0, len(secret), size))


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="운영자 계정 자격증명을 만든다")
    parser.add_argument(
        "--qr-svg",
        type=Path,
        default=None,
        help="QR 을 SVG 파일로 저장한다(브라우저로 열어서 찍는다). "
        "⚠ 파일에 OTP 비밀키가 들어가므로 찍은 뒤 지운다",
    )
    args = parser.parse_args()

    print("운영자 계정 자격증명을 만듭니다.\n")

    username = input("아이디: ").strip()
    if not username:
        raise SystemExit("아이디가 비었습니다.")

    password = _ask_password()
    if len(password) < 12:
        # 길이만 강제한다. 문자 종류를 강제하는 규칙은 `P@ssw0rd!` 같은 예측 가능한
        # 비밀번호를 만들 뿐이라는 것이 알려져 있다. 길이가 실질적으로 더 강하다.
        raise SystemExit("비밀번호는 12자 이상으로 하세요. 길이가 복잡한 규칙보다 강합니다.")
    if password != getpass.getpass("비밀번호 확인: "):
        raise SystemExit("두 입력이 다릅니다.")

    password_hash = hash_password(password)
    # 20바이트 = base32 32자. RFC 4226 권고 하한(128비트)을 넘는다.
    totp_secret = base64.b32encode(secrets.token_bytes(20)).decode("ascii").rstrip("=")
    session_secret = secrets.token_hex(32)

    import pyotp

    uri = pyotp.TOTP(totp_secret).provisioning_uri(name=username, issuer_name=ISSUER)

    print("\n" + "=" * 70)
    print("① backend/.env_backend 에 아래를 그대로 붙여 넣으세요")
    print("=" * 70)
    print(f"ADMIN_USERNAME={username}")
    print(f"ADMIN_PASSWORD_HASH={password_hash}")
    print(f"ADMIN_TOTP_SECRET={totp_secret}")
    print(f"ADMIN_SESSION_SECRET={session_secret}")
    print("ADMIN_SESSION_HOURS=12")
    print("ADMIN_COOKIE_SECURE=false   # 배포(HTTPS)에서는 true 로 바꾼다")

    print("\n" + "=" * 70)
    print("② 인증 앱에 등록 — Microsoft Authenticator 기준")
    print("=" * 70)
    print("   앱 열기 -> 오른쪽 위 [+] -> '기타 계정(Google, Facebook 등)'")
    print("   -> 아래쪽 '또는 코드를 수동으로 입력' -> 두 칸을 이렇게 채웁니다\n")
    print(f"      계정 이름 : {ISSUER} ({username})")
    print(f"      비밀 키   : {_grouped(totp_secret)}")
    print("\n   (공백은 넣어도 되고 빼도 됩니다. 대소문자 구분 없습니다.)")

    if args.qr_svg:
        try:
            import qrcode
            import qrcode.image.svg

            img = qrcode.make(uri, image_factory=qrcode.image.svg.SvgPathImage)
            args.qr_svg.parent.mkdir(parents=True, exist_ok=True)
            img.save(str(args.qr_svg))
            print(f"\n   QR 을 저장했습니다: {args.qr_svg}")
            print("   브라우저로 열어서 찍으세요. ⚠ 찍은 뒤 이 파일을 지우세요 —")
            print("      비밀키가 그대로 들어 있습니다.")
        except Exception as exc:  # noqa: BLE001
            # QR 을 못 만들어도 위의 수동 입력으로 등록할 수 있다. 스크립트의 목적은
            # 값을 만드는 것이지 그림을 그리는 것이 아니다.
            print(f"\n   (QR 파일을 만들지 못했습니다: {exc}. 위 수동 입력을 쓰세요.)")

    print("\n" + "=" * 70)
    print("③ 확인")
    print("=" * 70)
    print("   백엔드를 다시 띄우고 /admin 에서")
    print(f"   아이디 [{username}] . 비밀번호 . 앱의 여섯 자리를 입력하면 됩니다.")

    print("\n" + "=" * 70)
    print("[!] 이 화면을 닫으면 비밀번호와 OTP 비밀키를 다시 볼 수 없습니다.")
    print("    비밀번호는 비밀번호 관리자에, OTP 는 인증 앱에 **지금** 등록하세요.")
    print("    잃어버리면 이 스크립트를 다시 돌려 새로 만드는 수밖에 없습니다.")
    print("=" * 70)


if __name__ == "__main__":
    main()
