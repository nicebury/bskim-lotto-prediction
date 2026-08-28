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
from typing import Any

from psycopg.conninfo import make_conninfo
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
    # 여러 크론을 `;` 로 잇는다. 추첨 방송은 20:35 에 시작하지만 번호 추첨이
    # 끝나는 시각은 회차마다 다르고, 결과가 네이버 위젯에 반영되기까지 또 몇 분이
    # 걸린다. 20:40 · 20:50 · 21:00 세 번 시도해 가장 먼저 결과가 보이는 실행이
    # 가져간다. 이미 수집된 뒤에 도는 실행은 0건 성공으로 끝나 무해하다.
    #
    # 표준 크론 한 줄로는 이 세 시각을 못 쓴다 — `40,50,0 20,21 * * sat` 은 분과 시의
    # 곱집합이라 20:00·21:40·21:50 까지 여섯 번 돈다.
    #
    # ★ 요일은 반드시 이름(`sat`)으로 쓴다. APScheduler 는 요일 숫자를 0=월…6=일 로
    #   읽어 표준 크론(0=일…6=토)과 하루 어긋난다. `* * 6` 은 토요일이 아니라 일요일이다.
    LOTTO_CRON: str = "40,50 20 * * sat;0 21 * * sat"
    # 매시간. 일일 쿼터 25,000 중 검색어 3개 × 24회 = 72회(0.3%)만 쓴다.
    # 신선도를 위한 것이지 누락 방지가 아니다 — 누락은 NEWS_MAX_AGE_DAYS 가 막는다.
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
    # '연금복권' 을 따로 두는 이유는 판정이 아니라 **검색 커버리지** 때문이다.
    # 주제 판정에서는 '복권' 이 '연금복권' 을 부분문자열로 이미 잡는다. 그러나
    # 네이버 검색은 질의어별로 다른 결과 집합을 주므로, 연금복권 추첨 기사가
    # '복권' 상위 50건 밖으로 밀리면 영영 안 들어온다. 질의를 따로 던져 그 구멍을 막는다.
    # 대가는 쿼터뿐이다 — 검색어 3개 × 24회 = 하루 72회로 25,000 의 0.3%.
    NAVER_NEWS_QUERY: str = "로또,복권,연금복권"
    NAVER_NEWS_DISPLAY: int = 50

    # 발행일(KST)이 수집 실행일로부터 이 일수보다 오래된 기사는 저장하지 않는다.
    # 1 = 오늘과 어제. sort=date 로 요청해도 네이버는 며칠 전 기사를 함께 준다 —
    # 실측상 94건 중 34건이 3일치 과거 기사였다. 오래된 기사가 계속 섞이면
    # '최신 뉴스' 목록이 며칠씩 밀린다.
    #
    # 0(당일만)으로 두지 않는 이유: 마지막 실행 시각과 자정 사이에 발행된 기사가
    # 영영 들어오지 않는다. 다음날 검색돼도 발행일이 실행일과 달라 걸러지기 때문이다.
    # 하루치 여유를 두면 그 구멍이 닫힌다 — 자정 직전 기사를 다음날 실행이 받는다.
    NEWS_MAX_AGE_DAYS: int = 1

    # ── 뉴스 주제 적합성 필터 ────────────────────────────────────────
    # 신선도만으로는 부족하다. 검색 API 는 **본문 전문**을 뒤지므로 기사 각주에
    # '복권기금으로 운영된다' 한 줄이 있는 과학관 보도자료까지 결과에 들어온다.
    # 실측(2026-08-19, 332건): 67%가 제목에 검색어조차 없었다 — 야구 중계,
    # 편의점 제휴, OTT 라인업, 트롯 순위, 여행기.
    #
    # 제목만 본다. 요약(description)은 네이버가 검색어 주변을 잘라 주는 스니펫이라
    # 거의 항상 검색어를 포함해 변별력이 0 이다(332건 전부 통과했다).
    NEWS_TITLE_MUST_MATCH: bool = True

    # 제목에 이 낱말이 있으면 버린다. 부동산·증시가 '로또' 를 비유로 쓰는 문맥
    # ('로또 청약', '로또 줍줍', "'복권' 된 공모주"). 제목에 '로또' 가 있어
    # 위 규칙은 통과하지만 이 사이트에 온 사람이 찾는 뉴스가 아니다.
    #
    # 코드에 박지 않는 이유: 새 유행어("로또 상장", "로또 채용")가 나오면
    # .env_worker 한 줄로 막을 수 있어야 한다. 비우면 제외어 검사를 끈다.
    # 셋으로 나뉜다.
    #   부동산  — 청약·줍줍·분양·임대·아파트… 그리고 '억 로또'('11억 로또 송파…')
    #   증시/금융 — 공모주·따상·주식·코인·적금('로또 적금' 은 고금리 상품 광고다)
    #   동음이의 — '사면·복권'(復權). 가운뎃점까지 포함해 좁게 잡는다. 그냥 '사면'
    #             으로 두면 "복권 사면 1등" 같은 **진짜 기사**가 함께 죽는다.
    NEWS_EXCLUDE_KEYWORDS: str = (
        "청약,줍줍,분양,무순위,입주,재건축,임대주택,임대,그린벨트,택지,아파트,부동산,"
        "억 로또,경쟁률,공모주,따상,주식,코인,적금,예금,반도체,사면·복권"
    )

    # ── YouTube Data API (영상) ──────────────────────────────────────
    # 미발급이면 video_* 세 잡의 크론 등록을 건너뛴다. lotto·news 는 정상 동작한다.
    # ★ 이 키는 헤더(X-goog-api-key)로 보낸다. Google 이 안내하는 ?key= 쿼리스트링을
    #   쓰면 httpx 예외 메시지의 request URL 에 키가 실려 collect_job_log.error_desc
    #   에 평문으로 남는다 — alembic.ini 가 비밀번호를 뱉었던 사고와 같은 형태다.
    YOUTUBE_API_KEY: str = ""

    # search.list 는 2026-06-01 부터 자체 쿼터 버킷이고 하루 100회가 상한이다.
    # 네이버(25,000회)와 자릿수가 달라 뉴스처럼 매시간 돌릴 수 없다 —
    # 4질의 × 24회 = 96 calls 로 상한을 스치고 429 백오프 한 번에 터진다.
    #
    # 채널 6시간 + 토요일 야간 3회: 화이트리스트 채널의 업로드는 하루 0~3건이라
    # 매시간이면 24번 중 21번이 같은 응답이다. 토요일 21:20·21:50·22:20 을 더하는
    # 것은 lotto 잡이 20:40·20:50·21:00 세 번 도는 것과 같은 논리다 — 추첨은
    # 20:35~20:45 이고 실황·결과 영상은 21:00~22:30 에 몰린다.
    YOUTUBE_CHANNEL_CRON: str = "0 */6 * * *;20,50 21 * * sat;20 22 * * sat"
    # 4질의 × 6회 = 24 calls / 100. 3시간(32)도 예산 안이지만 재시도·수동 여유를 남긴다.
    # 분을 15 로 어긋내는 것은 정시의 채널 잡과 videos.list 가 겹치지 않게 하기 위해서다
    # (락이 잡별이라 두 잡이 동시에 돈다).
    YOUTUBE_SEARCH_CRON: str = "15 */4 * * *"
    # 쿼터 리셋이 태평양시 자정(KST 16~17시)이라 새벽이 잔여 쿼터가 가장 넉넉하다.
    YOUTUBE_REFRESH_CRON: str = "30 4 * * *"

    # 화이트리스트 채널(UC 로 시작). 2026-08-27 RSS 실측으로 확정한 공식 채널 둘.
    #   UCEk3VwaA6e4H9TW1vSXOjDA = 동행복권 공식 (토=로또, 목=연금 당첨번호 고정 업로드)
    #   UCeyspQm90Le7EjROpj6rZXA = 알아볼권리 (MBC 로또·연금 방송 공식, 추첨 실황)
    # 둘 다 제목이 '제1238회 당첨번호' 형식이라 금지 표현 위험이 사실상 0 이다.
    YOUTUBE_CHANNEL_KEY_LIST: str = (
        "UCEk3VwaA6e4H9TW1vSXOjDA,UCeyspQm90Le7EjROpj6rZXA"
    )
    # 예상번호 제공 채널. 검색 경로로 새어 들어오는 것을 막는다(2026-08-27 조사).
    YOUTUBE_BLOCK_CHANNEL_KEY_LIST: str = (
        "UC-uNAS6008_bFvbI4Nk-jcQ,UCWciziKWCdkqdoikWxo9fUw,UC-3zYni9OqS1nsR9blpspfA,"
        "UCWw2D-nV95cEoi-kR6nCfGg,UCQjUd_yvBYBadBTOfkmcESg,UCNoyjx2baN6rM2b7MjNg0lA,"
        "UCGd7y1IBVgTd26f1HSEHoWA"
    )

    YOUTUBE_SEARCH_QUERY: str = "로또 추첨,로또 당첨번호,연금복권 추첨,로또 판매점"
    YOUTUBE_SEARCH_MAX_RESULT: int = 50
    # 한 실행이 이 수를 넘지 않는다. 질의를 늘려도 쿼터가 터지지 않게 하는 상한이다.
    YOUTUBE_SEARCH_MAX_CALL_PER_RUN: int = 4
    # 하루 근사 예산. 100 중 60 만 쓰고 나머지는 재시도·수동 트리거 여유로 남긴다.
    # ★ 이것은 collect_job_log 기반 추정이다. 정본은 Cloud Console 의 Quotas 다 —
    #   재시도로 인한 초과 호출을 워커는 셀 수 없다.
    YOUTUBE_SEARCH_DAILY_BUDGET: int = 60

    # 게시일이 이보다 오래된 영상은 저장하지 않는다. 뉴스(1일)보다 긴 이유는
    # 영상이 기사보다 늦게 올라오고 회차 단위(주 1회)로 소비되기 때문이다.
    # 긴 중단 뒤 과거를 회수하려면 이 값을 일시적으로 올려 수동 트리거한다.
    YOUTUBE_MAX_AGE_DAYS: int = 7
    YOUTUBE_TITLE_MUST_MATCH: bool = True
    # 주제 밖(뉴스와 같은 부류). 정책 위반 낱말은 아래 FORBIDDEN 이 따로 맡는다.
    YOUTUBE_EXCLUDE_KEYWORDS: str = "청약,줍줍,분양,부동산,공모주,주식,코인"

    # ★ 금지 표현. forbidden-expressions.md 의 낱말을 수집 단계에서 막는다.
    #   EXCLUDE 와 분리하는 이유는 로그에서 '정책 때문에 몇 건이 걸렸는지' 를
    #   따로 세야 하기 때문이다 — 애드센스 대비 근거이고, 화이트리스트 채널이
    #   변질됐는지 알아채는 신호다. 섞으면 그 수를 알 수 없다.
    YOUTUBE_FORBIDDEN_KEYWORDS: str = (
        "예상번호,추천번호,예측번호,고정수,고확률,당첨확률,1등예측,당첨보장,"
        "필승,비법,명당번호,적중률,조합공식,필출"
    )

    # 쇼츠 공식 정의는 3분 이하다(2024-10-15 이후 업로드 기준).
    YOUTUBE_SHORTS_MAX_SEC: int = 180
    YOUTUBE_SUMMARY_MAX_LEN: int = 300
    # 같은 콘텐츠의 쇼츠판/롱폼판 중복 제거. 동행복권이 실제로 그렇게 올린다
    # (실측: 같은 제목이 08-18 watch / 08-19 shorts 로 각각 존재).
    # 실측 없이 도입한 규칙이라 끌 수 있게 둔다.
    YOUTUBE_DEDUPE_SAME_TITLE: bool = True

    # 30일 정책(III.E.4). 25일에 갱신하는 것은 5일 버퍼다 — 30 으로 두면
    # 잡이 하루 실패한 순간 위반이다.
    YOUTUBE_REFRESH_AFTER_DAYS: int = 25
    # 이걸 넘긴 행은 API 성공 여부와 무관하게 삭제한다.
    YOUTUBE_HARD_EXPIRE_DAYS: int = 30
    # 게시 후 이 일수가 지난 영상은 갱신하지 않고 지운다. 로또는 주 1회 추첨이고
    # 목록 노출 기준이 7일이라 60일 지난 영상은 어차피 화면에 없다.
    # 이 값이 30일 정책의 '갱신' 해석 논쟁을 실질적으로 무력화한다.
    YOUTUBE_RETAIN_DAYS: int = 60
    YOUTUBE_REFRESH_BATCH_LIMIT: int = 500

    YOUTUBE_MAX_RETRY: int = 3
    YOUTUBE_BACKOFF_BASE_SEC: float = 2.0
    # true 면 DB 를 건드리지 않고 각 필터 단계의 통과·제외 건수만 로그로 남긴다.
    # 뉴스 제외어를 332건에 드라이런해 검증한 절차를 코드로 갖는 것이다.
    YOUTUBE_DRY_RUN: bool = False

    # ── LLM 금지 표현 보조 판정 ──────────────────────────────────────
    # 규칙 제외어는 목록에 없는 신조어("필출 2수", "고정수 5")를 통과시킨다.
    # 규칙을 통과한 것만 LLM 에 한 번 더 물어 거른다.
    #
    # ★ 키 이름이 일반적인 것은 사용자가 .env_worker 에 이미 그렇게 채웠기 때문이다.
    #   YOUTUBE_API_KEY 와 헷갈리기 쉬우니 주의한다 — 이쪽이 LLM 키다.
    LLM: str = "OPENAI"
    MODEL: str = "gpt-5-nano"
    API_KEY: str = ""
    LLM_JUDGE_ENABLED: bool = True
    # 한 요청에 묶을 영상 수. 시스템 프롬프트를 한 번만 내기 위한 것이다 —
    # 건당 호출하면 500 토큰짜리 프롬프트를 매번 반복해서 낸다.
    LLM_JUDGE_BATCH_SIZE: int = 20
    LLM_JUDGE_TIMEOUT_SEC: float = 20.0
    LLM_JUDGE_MAX_RETRY: int = 2

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

    # 뉴스 API 쿼터 초과(429) 대응 지수 백오프. 일일 쿼터는 25,000 이다.
    NEWS_MAX_RETRY: int = 3
    NEWS_BACKOFF_BASE_SEC: float = 2.0

    # ── 잡 로그 정리 ──────────────────────────────────────────────────
    # 프로세스가 죽으면 status_cd='running' 인 행이 영원히 남는다. 기동 시
    # 이 시간을 넘긴 running 행을 failed 로 정리한다. 로또 잡이 아무리 길어도
    # 수십 분이므로 6시간이면 실행 중인 잡을 오인해 죽일 위험이 없다.
    STALE_RUNNING_HOURS: int = 6

    # 잡 이력 보존 기간. log_list 가 실행마다 쌓여(매시간 도는 news 만 연 8,760행)
    # 방치하면 테이블이 계속 커진다. 기동 시 이보다 오래된 행을 지운다.
    # 90일: 계절성 문제(연말 트래픽, 회차 누락)를 되짚기에 충분하고,
    # 그보다 오래된 실행 로그를 실제로 열어본 적이 없다.
    JOB_LOG_RETAIN_DAYS: int = 90

    # 마지막 성공한 lotto 잡이 이 기간을 넘었으면 기동 직후 1회 실행한다.
    # 서버가 토요일 밤에 꺼져 있었으면 회차를 통째로 놓치기 때문이다.
    CATCH_UP_DAYS: int = 7

    def model_post_init(self, __context: Any) -> None:
        """필수 값 검증. **pydantic 의 검증 기능을 쓰지 않는다.**

        ★ field_validator 나 required 필드로 검증하면 실패 시 pydantic 이
          ValidationError 의 `input_value` 에 **입력 dict 전체** — 즉 .env_worker
          의 내용 전부 — 를 실어 출력한다. 키 하나가 비었을 뿐인데 PG_PASSWORD 가
          스택트레이스에 찍히고, 그것이 터미널·CI 로그에 남는다.

          Claude 가 .env 를 읽지 않는다는 규약을 지켜도 예외 처리가 그것을 무너뜨린다.
          그래서 빈 기본값으로 검증을 통과시킨 뒤, **값을 담지 않은** 예외를 직접 던진다.
          (docs/wiki/10-contracts/env-vars.md 의 함정 절)

        "없으면 기동 거부" 라는 동작은 그대로이고 메시지만 안전해진다.
        """
        # 빈 문자열끼리는 compare_digest 로 비교해도 '일치'한다. 키가 비면 헤더를
        # 비워 보낸 아무나 잡을 실행할 수 있다 — 인증이 없는 것보다 나쁘다.
        # 인증이 있다고 착각하게 만들기 때문이다.
        if not self.WORKER_JOB_KEY.strip():
            raise RuntimeError(
                "WORKER_JOB_KEY 가 비어 있어 기동을 거부한다. "
                "`openssl rand -hex 32` 로 생성해 worker/.env_worker 에 채운다."
            )

        # 비번 없이 뜨면 첫 잡 실행 시점에야 실패한다. 그때는 크론 시각이고,
        # 그 주 회차를 이미 놓친 뒤다.
        if not self.PG_PASSWORD:
            raise RuntimeError(
                "PG_PASSWORD 가 비어 있어 기동을 거부한다. "
                "worker/scripts/init_roles.sql 로 만든 app_writer 비번을 채운다."
            )

        if self.NEWS_MAX_AGE_DAYS < 0:
            raise RuntimeError("NEWS_MAX_AGE_DAYS 는 0 이상이어야 한다.")

        if self.YOUTUBE_MAX_AGE_DAYS < 0:
            raise RuntimeError("YOUTUBE_MAX_AGE_DAYS 는 0 이상이어야 한다.")

        # 갱신 주기가 하드 만료보다 늦으면 갱신하기도 전에 행이 지워진다.
        # 그러면 매일 수집한 것을 매일 버리는 잡이 되고, 아무도 알아채지 못한다.
        if self.YOUTUBE_REFRESH_AFTER_DAYS >= self.YOUTUBE_HARD_EXPIRE_DAYS:
            raise RuntimeError(
                "YOUTUBE_REFRESH_AFTER_DAYS 는 YOUTUBE_HARD_EXPIRE_DAYS 보다 작아야 한다. "
                "갱신 전에 하드 만료가 먼저 오면 수집한 영상이 갱신 없이 사라진다."
            )

        # 30일은 YouTube 개발자 정책 III.E.4 의 상한이다. 늘리면 정책 위반이다.
        if self.YOUTUBE_HARD_EXPIRE_DAYS > 30:
            raise RuntimeError(
                "YOUTUBE_HARD_EXPIRE_DAYS 는 30 을 넘을 수 없다. "
                "YouTube 개발자 정책 III.E.4 가 비승인 데이터의 30일 초과 보관을 금지한다."
            )

        # 지원하지 않는 provider 를 조용히 무시하면, 사람은 LLM 판정이 도는 줄 알지만
        # 실제로는 아무것도 걸러지지 않는다. 기동 시점에 알려준다.
        if self.LLM_JUDGE_ENABLED and self.llm_provider not in ("openai", ""):
            raise RuntimeError(
                f"지원하지 않는 LLM provider 다: {self.LLM!r}. 현재 OPENAI 만 지원한다."
            )

    @property
    def news_queries(self) -> list[str]:
        """쉼표로 구분된 검색어를 개별 쿼리로 쪼갠다. 빈 항목은 버린다."""
        return [q.strip() for q in self.NAVER_NEWS_QUERY.split(",") if q.strip()]

    @property
    def news_exclude_keywords(self) -> list[str]:
        """제목 제외어 목록. 빈 문자열이면 빈 리스트 = 검사를 끈다.

        news_queries 와 같은 쉼표 규약을 쓴다. 규약이 갈리면 사람이 한쪽 문법으로
        다른 쪽을 채워 넣고, 그 실수는 조용히 '필터가 안 걸리는' 형태로 나타난다.
        """
        return [k.strip() for k in self.NEWS_EXCLUDE_KEYWORDS.split(",") if k.strip()]

    @property
    def naver_news_enabled(self) -> bool:
        """키가 둘 다 있어야 뉴스 잡이 동작한다.

        하나만 있으면 401 을 받는다. 기동을 막지는 않는다 — lotto 잡은 키 없이
        동작하고, 그것이 워커 개발을 시작할 수 있는 이유다.
        """
        return bool(self.NAVER_CLIENT_ID and self.NAVER_CLIENT_SECRET)

    # ── 유튜브 ────────────────────────────────────────────────────────
    @property
    def youtube_search_queries(self) -> list[str]:
        """검색 질의 목록. news_queries 와 같은 쉼표 규약을 쓴다."""
        return [q.strip() for q in self.YOUTUBE_SEARCH_QUERY.split(",") if q.strip()]

    @property
    def youtube_exclude_keywords(self) -> list[str]:
        """주제 밖 제외어. 비우면 검사를 끈다."""
        return [k.strip() for k in self.YOUTUBE_EXCLUDE_KEYWORDS.split(",") if k.strip()]

    @property
    def youtube_forbidden_keywords(self) -> list[str]:
        """금지 표현 낱말. 비우면 검사를 끈다.

        ★ 비우는 것은 정책 필터를 끄는 것이다. 드라이런 검증 목적이 아니면 비우지 않는다.
        """
        return [k.strip() for k in self.YOUTUBE_FORBIDDEN_KEYWORDS.split(",") if k.strip()]

    @property
    def youtube_channel_keys(self) -> list[str]:
        """화이트리스트 채널 ID 목록."""
        return [k.strip() for k in self.YOUTUBE_CHANNEL_KEY_LIST.split(",") if k.strip()]

    @property
    def youtube_block_channel_keys(self) -> list[str]:
        """차단 채널 ID 목록."""
        return [
            k.strip() for k in self.YOUTUBE_BLOCK_CHANNEL_KEY_LIST.split(",") if k.strip()
        ]

    @property
    def youtube_enabled(self) -> bool:
        """API 키가 있어야 video_* 잡이 동작한다.

        naver_news_enabled 와 같은 계약이다 — 없으면 크론에 올리지 않고, 수동
        트리거는 받아서 '키가 없다' 는 이유를 collect_job_log 에 남긴다.
        """
        return bool(self.YOUTUBE_API_KEY.strip())

    @property
    def llm_judge_enabled(self) -> bool:
        """LLM 보조 판정이 켜져 있는가.

        토글이 켜져 있고 키가 있어야 한다. **꺼져 있어도 수집은 정상 동작한다** —
        규칙 필터가 정본이고 LLM 은 보조다. 이 관계가 뒤집히면 외부 API 장애가
        수집 중단으로 이어진다.
        """
        return bool(self.LLM_JUDGE_ENABLED and self.API_KEY.strip())

    @property
    def llm_provider(self) -> str:
        """소문자로 정규화한 LLM 제공자. 현재 openai 만 지원한다."""
        return self.LLM.strip().lower()

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
