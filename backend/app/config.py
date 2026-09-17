"""설정 단일 진입점.

환경변수는 여기서만 읽는다. 모듈 여기저기서 os.getenv 를 부르면 어떤 값이 어디서
쓰이는지 추적할 수 없고, 값이 없을 때의 동작이 호출부마다 달라진다.
명세: docs/wiki/10-contracts/env-vars.md
"""
from __future__ import annotations

from pathlib import Path

from psycopg.conninfo import make_conninfo
from pydantic_settings import BaseSettings, SettingsConfigDict

# 이 파일(app/config.py) 의 두 단계 위가 backend/ 다. 상대경로 설정을 절대경로로 푸는 기준점.
BASE_DIR = Path(__file__).resolve().parent.parent

# 값이 비어 있으면 기동을 거부하는 키들. 없는 채로 뜬 서버는 헬스체크만 통과하고
# 모든 요청에서 500 을 내는, 가장 알아채기 어려운 형태로 고장난다.
_REQUIRED = ("PG_DB", "PG_USER", "PG_PASSWORD")


class Settings(BaseSettings):
    # 파일명이 `.env` 가 아니라 `.env_backend` 다. 잘못된 env 파일을 잘못된 컨테이너에
    # 마운트하는 실수를 파일명만 보고 알아채기 위한 규약이다.
    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env_backend",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── Postgres. URL 한 줄이 아니라 조각으로 받는다 ──────────────────────
    # URL 이면 비밀번호의 특수문자를 사람이 퍼센트 인코딩해야 한다(`!` → `%21`).
    # 그 규칙을 잊으면 접속이 조용히 실패하거나, 더 나쁘게는 라이브러리가 URL 을 통째로
    # 예외 메시지에 실어 비밀번호를 로그에 남긴다 — 워커의 Alembic 이 실제로 그랬다.
    # 조각으로 받아 psycopg 가 조립하면 인코딩은 라이브러리의 일이 된다.
    # 워커의 `.env_worker` 와 키 이름이 같아 대조하기도 쉽다.
    PG_HOST: str = "localhost"
    PG_PORT: int = 5432
    PG_DB: str = ""
    PG_USER: str = ""
    PG_PASSWORD: str = ""

    CHROMA_DB_PATH: Path = Path("./data/chroma_words")
    BACKEND_PORT: int = 8005
    # 쉼표 구분 문자열로 받는다. 리스트로 선언하면 pydantic-settings 가 JSON 파싱을 시도해
    # `http://localhost:3000` 같은 평범한 값에서 터진다.
    CORS_ORIGINS: str = "http://localhost:3000"
    TZ: str = "Asia/Seoul"

    # 커넥션 풀. 읽기 전용 API 라 커넥션을 오래 쥐지 않는다.
    DB_POOL_MIN_SIZE: int = 1
    DB_POOL_MAX_SIZE: int = 8

    # 몬테카를로 추천(strategy=ensemble)을 동시에 몇 개까지 돌릴지.
    # 기본 1 이다. 올리면 **느려진다** — 2건 6.5배, 4건 24.8배(실측). 작은 numpy 호출이
    # GIL 을 놓았다 잡기를 반복하며 스레드끼리 손바꿈에 시간을 쓰고, 어차피 GIL 아래에서는
    # 총 처리량이 하나분이라 동시 실행의 이득이 0 이다.
    # 값을 여는 이유는 튜닝이 아니라, 훗날 알고리즘이 벡터화되거나 프로세스 모델이
    # 바뀌었을 때 코드를 고치지 않고 되돌리기 위해서다.
    # 근거: docs/wiki/00-decisions/0012-serialize-monte-carlo.md
    RECOMMEND_MAX_CONCURRENCY: int = 1

    # ── 운영자 전용 화면 (/api/admin/*) ───────────────────────────────────
    # 사용자 계정 **테이블**을 만들지 않는다. 쓰는 사람이 한 명이고, 계정 시스템은 그
    # 자체로 공격면이자 유지보수 대상이다 (docs/wiki/10-contracts/api-contract.md).
    # 계정 하나를 환경변수로 둔다.
    #
    # ★ 필요한 값이 하나라도 비면 `/api/admin/*` 가 전부 503 이다. 빈 문자열끼리
    # `compare_digest` 비교는 **통과하므로**, 빈 값을 '인증 없음' 으로 두면 아무나
    # 들어온다 — 인증이 없는 것보다 나쁘다. 인증이 있다고 착각하게 만들기 때문이다.
    # 기동을 막지 않는 이유: 운영자 화면 하나 때문에 공개 API 전체가 안 뜨면 손해가
    # 더 크다. 그래서 그 경로만 503 으로 죽인다.
    ADMIN_USERNAME: str = ""
    # ⚠ 비밀번호 **원문을 두지 않는다.** `scripts/make_admin_credentials.py` 가 만든
    # scrypt 해시(`scrypt$n$r$p$salt$hash`)를 넣는다. 서버가 털려도 원문이 나오지 않고,
    # 다른 사이트에서 같은 비밀번호를 쓰고 있어도 그쪽이 함께 뚫리지 않는다.
    ADMIN_PASSWORD_HASH: str = ""
    # TOTP(RFC 6238) 비밀키(base32). Microsoft/Google Authenticator 가 이 값으로 30초마다
    # 여섯 자리를 만든다. **비밀번호만으로는 열리지 않는다** — 사람이 외우는 비밀번호는
    # 언젠가 약해지고, 그 약점을 이 두 번째 요소가 덮는다.
    ADMIN_TOTP_SECRET: str = ""
    # 세션 쿠키 서명 키. 위 값들과 **다른 값**이어야 한다 — 같으면 쿠키에서 자격증명을
    # 역산할 여지가 생긴다. 같은 값이면 기동을 거부한다(아래 검사).
    ADMIN_SESSION_SECRET: str = ""
    ADMIN_SESSION_HOURS: int = 12
    # ⚠ 세션 쿠키에 `Secure` 를 붙일지.
    #
    # 종전에는 요청 스킴(`request.url.scheme`)에서 정했으나 **이 구조에서는 그것이
    # 틀린다.** 브라우저는 프론트(Next)와만 말하고 Next 서버가 백엔드를 중계하므로,
    # 백엔드에 닿는 요청은 내부망 평문 HTTP 다 — 사용자가 HTTPS 를 쓰고 있어도 백엔드는
    # 그 사실을 알 방법이 없다. 그래서 사람이 명시한다.
    #
    # **운영(HTTPS)에서는 반드시 true.** 로컬 http 개발에서 true 로 두면 브라우저가
    # 쿠키를 저장하지 않아 로그인이 조용히 실패하므로 기본값은 false 다.
    ADMIN_COOKIE_SECURE: bool = False

    def model_post_init(self, __context) -> None:
        """필수값을 검사한다.

        pydantic 의 `required` 로 두지 않는 이유가 있다. `ValidationError` 는 실패
        메시지에 **입력 dict 전체** — 즉 `.env_backend` 의 내용 — 를 실어 출력한다.
        키 하나를 빠뜨리면 나머지 비밀번호가 스택트레이스와 CI 로그에 남는다.
        빈 기본값으로 검증을 통과시킨 뒤, **값을 담지 않은** 예외를 여기서 던진다.
        """
        missing = [k for k in _REQUIRED if not str(getattr(self, k)).strip()]
        if missing:
            raise RuntimeError(
                f"필수 환경변수가 비어 있습니다: {', '.join(missing)}. "
                "backend/.env_backend 를 확인하세요. 형식은 backend/env.sample 에 있고, "
                "PG_USER 는 app_writer 가 아니라 app_reader 여야 합니다."
            )

        # 0 이하면 세마포어가 영원히 열리지 않아 **모든 추천 요청이 조용히 멈춘다.**
        # 헬스체크는 통과하고 다른 엔드포인트도 멀쩡하니 알아채기까지 오래 걸린다.
        # 증상 없는 고장을 시끄러운 기동 실패로 바꾼다 (롤 자가검증과 같은 취지).
        # 값 자체는 시크릿이 아니므로 메시지에 담아도 된다.
        if self.RECOMMEND_MAX_CONCURRENCY < 1:
            raise RuntimeError(
                "RECOMMEND_MAX_CONCURRENCY 는 1 이상이어야 합니다 "
                f"(현재 {self.RECOMMEND_MAX_CONCURRENCY}). "
                "0 이하로 두면 추천 요청이 영원히 대기합니다."
            )

        # 서명 키가 다른 비밀값과 같으면 쿠키 서명에서 그것을 역산할 여지가 생긴다.
        # 계약이 "다른 값이어야 한다" 고 정한 것을 사람의 주의력에 맡기지 않는다 —
        # 복붙 한 번이면 같아진다. 값 자체는 메시지에 담지 않는다.
        secret = self.ADMIN_SESSION_SECRET.strip()
        if secret and secret in (
            self.ADMIN_PASSWORD_HASH.strip(),
            self.ADMIN_TOTP_SECRET.strip(),
        ):
            raise RuntimeError(
                "ADMIN_SESSION_SECRET 이 다른 운영자 비밀값과 같습니다. "
                "서로 다른 값을 쓰세요 — 같으면 세션 쿠키에서 그것을 역산할 여지가 생깁니다."
            )

    @property
    def admin_enabled(self) -> bool:
        """운영자 API 를 열 수 있는가.

        **넷이 모두** 있어야 한다. 하나라도 비면 그 경로 전체가 503 이다.

        - 서명 키가 없으면 쿠키를 서명할 수 없고, 서명 없는 쿠키는 누구나 위조할 수
          있어 나머지 검사가 무의미해진다.
        - OTP 비밀키가 없다고 **비밀번호만으로 통과시키지 않는다.** 2단계를 켜 두었다고
          믿는 사람에게 1단계만 돌려주는 것이 가장 나쁜 실패다.
        """
        return all(
            v.strip()
            for v in (
                self.ADMIN_USERNAME,
                self.ADMIN_PASSWORD_HASH,
                self.ADMIN_TOTP_SECRET,
                self.ADMIN_SESSION_SECRET,
            )
        )

    @property
    def database_dsn(self) -> str:
        """psycopg 접속 문자열. 절대 로그에 찍지 않는다 — 비밀번호가 들어 있다.

        `make_conninfo` 가 따옴표·역슬래시 이스케이프를 처리하므로, 비밀번호에
        어떤 특수문자가 있어도 사람이 인코딩할 필요가 없다.
        """
        return make_conninfo(
            host=self.PG_HOST,
            port=self.PG_PORT,
            dbname=self.PG_DB,
            user=self.PG_USER,
            password=self.PG_PASSWORD.strip(),
        )

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def chroma_path(self) -> Path:
        """상대경로면 backend/ 기준으로 푼다.

        uvicorn 을 어느 디렉토리에서 띄우든 같은 곳을 가리키게 하려는 것이다.
        cwd 에 의존하면 systemd·컨테이너에서만 FileNotFoundError 가 난다.
        """
        p = Path(self.CHROMA_DB_PATH)
        return p if p.is_absolute() else (BASE_DIR / p).resolve()


settings = Settings()  # type: ignore[call-arg]  # 값은 .env_backend 에서 온다
