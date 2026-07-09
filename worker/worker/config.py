"""워커 설정 — 환경변수를 읽는 유일한 곳.

모듈 여기저기서 os.getenv 를 호출하지 않는다. 값이 어디서 오는지 한 곳만 보면
알 수 있어야 하고, 없을 때의 동작(기동 거부 / 기능 비활성 / 기본값)도 여기서
한 번에 결정된다. 계약: docs/wiki/10-contracts/env-vars.md

파일명이 `.env` 가 아니라 `.env_worker` 인 이유:
잘못된 .env 를 잘못된 컨테이너에 마운트하는 실수를 파일명만 보고 알아채기 위해서다.
pydantic-settings 는 파일명을 명시하지 않으면 `.env` 만 찾으므로 반드시 넘겨야 한다.
"""
from __future__ import annotations

from pathlib import Path

from psycopg.conninfo import make_conninfo
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# 이 파일 기준으로 worker/ 디렉토리. .env_worker 는 여기에 있다.
# 상대경로로 두면 `uv run` 을 어느 cwd 에서 하느냐에 따라 조용히 못 읽는다.
WORKER_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=WORKER_DIR / ".env_worker",
        env_file_encoding="utf-8",
        # env.sample 에 주석용으로만 남은 키가 있어도 기동을 막지 않는다.
        extra="ignore",
    )

    # ── Postgres (쓰기 롤) ────────────────────────────────────────────
    # 워커는 app_writer 로만 붙는다. 백엔드의 app_reader 를 쓰지 않는다.
    PG_HOST: str = "localhost"
    PG_PORT: int = 5179
    PG_DB: str = "prod_db"
    PG_USER: str = "app_writer"
    PG_PASSWORD: str = ""

    # ── 잡 스케줄 (KST) ───────────────────────────────────────────────
    # 크론 문자열을 코드에 박지 않는다. 추첨 시각이 바뀌거나 뉴스 API 쿼터가
    # 확인되면 재배포 없이 .env_worker 만 고쳐 조정할 수 있어야 한다.
    LOTTO_CRON: str = "0 21 * * 6"
    # 매시간. 네이버 검색 API 일일 쿼터가 25,000 이고 검색어 2개면 하루 48회 —
    # 쿼터의 0.2% 다. 자주 도는 이유는 부하가 아니라 NEWS_SAME_DAY_ONLY 때문이다:
    # 당일 기사만 담으므로, 실행 간격이 곧 놓치는 시간 창의 크기다.
    NEWS_CRON: str = "0 * * * *"

    # lotto 잡 실패 시 재시도. 기본값 60분 × 최대 3회 시도 = 21:00·22:00·23:00.
    # 추첨 결과가 네이버 위젯에 늦게 반영되는 경우가 있어 같은 날 다시 시도한다.
    # 크론 문자열과 마찬가지로 시각을 코드에 박지 않는다 — LOTTO_CRON 을 바꾸면
    # 재시도 시각도 따라 움직여야 하므로 "몇 시"가 아니라 "몇 분 뒤"로 표현한다.
    LOTTO_RETRY_DELAY_MIN: int = 60
    LOTTO_MAX_ATTEMPT: int = 3

    # ── 수동 트리거 인증 ──────────────────────────────────────────────
    WORKER_JOB_KEY: str = ""

    # ── 네이버 검색 API (뉴스) ────────────────────────────────────────
    # 미발급 상태다. 없으면 news 잡의 크론 등록을 건너뛴다(기능 비활성).
    NAVER_CLIENT_ID: str = ""
    NAVER_CLIENT_SECRET: str = ""
    NAVER_NEWS_QUERY: str = "로또,복권"
    NAVER_NEWS_DISPLAY: int = 50

    # 발행일자(KST)가 수집 실행일자(KST)와 다른 기사는 저장하지 않는다.
    # sort=date 로 요청해도 네이버는 며칠 전 기사를 함께 준다 — 실측상 94건 중
    # 34건이 과거 기사였다. 오래된 기사가 계속 섞여 들어오면 '최신 뉴스' 목록이
    # 며칠씩 밀린다.
    #
    # 대가: 마지막 실행 시각과 자정 사이에 발행된 기사는 영영 들어오지 않는다.
    # 다음날 검색되더라도 발행일자가 실행일자와 달라 걸러지기 때문이다.
    # NEWS_CRON 을 촘촘히 두어 그 창을 좁힌다(매시간 → 최대 1시간).
    # 과거 기사까지 담아야 하면 false 로 끈다.
    NEWS_SAME_DAY_ONLY: bool = True

    # ── 서버 ─────────────────────────────────────────────────────────
    WORKER_HOST: str = "127.0.0.1"
    WORKER_PORT: int = 8003
    TZ: str = "Asia/Seoul"

    # ── 수집 튜닝 (봇 감지 완화) ──────────────────────────────────────
    # 네이버에 부담을 주지 않기 위한 값. 코드에 박지 않는다.
    # docs/wiki/90-external/dhlottery-blocked.md 의 "봇 감지 완화" 절.
    CRAWL_DELAY_SEC: float = 2.0
    CRAWL_JITTER_SEC: float = 0.8
    CRAWL_MAX_RETRY: int = 3
    CRAWL_RETRY_DELAY_SEC: float = 3.0
    CRAWL_HTTP_TIMEOUT_SEC: float = 10.0

    # 뉴스 API 쿼터 초과(429) 대응 백오프. 쿼터가 미확인이라 보수적으로 잡는다.
    NEWS_MAX_RETRY: int = 3
    NEWS_BACKOFF_BASE_SEC: float = 2.0

    # ── 잡 로그 정리 ──────────────────────────────────────────────────
    # 프로세스가 죽으면 status_cd='running' 인 행이 영원히 남는다. 기동 시
    # 이 시간을 넘긴 running 행을 failed 로 정리한다. 로또 잡이 아무리 길어도
    # 수십 분이므로 6시간이면 실행 중인 잡을 오인해 죽일 위험이 없다.
    STALE_RUNNING_HOURS: int = 6

    # 마지막 성공한 lotto 잡이 이 기간을 넘었으면 기동 직후 1회 실행한다.
    # 서버가 토요일 밤에 꺼져 있었으면 회차를 통째로 놓치기 때문이다.
    CATCH_UP_DAYS: int = 7

    @field_validator("WORKER_JOB_KEY")
    @classmethod
    def _job_key_must_not_be_blank(cls, v: str) -> str:
        """빈 키로 기동하지 않는다.

        빈 문자열끼리는 compare_digest 로 비교해도 '일치'한다. 즉 키가 비어 있으면
        헤더를 비워 보낸 아무나 잡을 실행할 수 있다. 인증이 없는 것보다 나쁘다 —
        인증이 있다고 착각하게 만들기 때문이다. 그래서 통과시키지 않고 기동을 막는다.
        생성: openssl rand -hex 32
        """
        if not v.strip():
            raise ValueError(
                "WORKER_JOB_KEY 가 비어 있어 기동을 거부한다. "
                "`openssl rand -hex 32` 로 생성해 .env_worker 에 채운다."
            )
        return v

    @field_validator("PG_PASSWORD")
    @classmethod
    def _pg_password_must_not_be_blank(cls, v: str) -> str:
        """비번 없이 뜨면 첫 잡 실행 시점에야 실패한다. 그때는 크론 시각이다."""
        if not v:
            raise ValueError(
                "PG_PASSWORD 가 비어 있어 기동을 거부한다. "
                "worker/scripts/init_roles.sql 로 만든 app_writer 비번을 채운다."
            )
        return v

    @property
    def news_queries(self) -> list[str]:
        """쉼표로 구분된 검색어를 개별 쿼리로 쪼갠다. 빈 항목은 버린다."""
        return [q.strip() for q in self.NAVER_NEWS_QUERY.split(",") if q.strip()]

    @property
    def naver_news_enabled(self) -> bool:
        """키가 둘 다 있어야 뉴스 잡이 동작한다.

        하나만 있으면 401 을 받는다. 기동을 막지는 않는다 — lotto 잡은 키 없이
        동작하고, 그것이 워커 개발을 시작할 수 있는 이유다.
        """
        return bool(self.NAVER_CLIENT_ID and self.NAVER_CLIENT_SECRET)

    @property
    def conninfo(self) -> str:
        """psycopg 접속 문자열.

        URL(DSN)을 만들지 않는 이유: URL 이면 비밀번호의 특수문자를 퍼센트 인코딩해야
        하고, 사용자가 .env_worker 에 넣은 원본 비번이 그대로는 동작하지 않는다.
        f-string 으로 `key=value` 를 직접 잇지도 않는다 — 비번에 공백이나 작은따옴표가
        섞이면 파싱이 어긋나 엉뚱한 오류(예: dbname 을 못 찾음)로 나타난다.
        make_conninfo 가 이스케이프를 책임진다.
        """
        return make_conninfo(
            host=self.PG_HOST,
            port=self.PG_PORT,
            dbname=self.PG_DB,
            user=self.PG_USER,
            password=self.PG_PASSWORD,
        )


settings = Settings()
