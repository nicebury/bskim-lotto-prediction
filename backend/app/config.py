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
