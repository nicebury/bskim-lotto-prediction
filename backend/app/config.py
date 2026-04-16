from pathlib import Path


class Settings:
    BASE_DIR: Path = Path(__file__).resolve().parent.parent
    DB_PATH: Path = BASE_DIR / "data" / "lotto.db"

    DHLOTTERY_API_URL: str = "https://www.dhlottery.co.kr/common.do"

    # 네이버 검색 위젯 소스 기준: 2초 + 0~0.8초 지터 (봇 감지 완화)
    CRAWL_DELAY_SEC: float = 2.0
    CRAWL_MAX_RETRY: int = 3
    CRAWL_RETRY_DELAY_SEC: float = 3.0
    CRAWL_HTTP_TIMEOUT_SEC: float = 10.0

    # 꿈→로또: ChromaDB 벡터 저장소 경로 (reg_lotto 기존 데이터 참조)
    CHROMA_DB_PATH: Path = BASE_DIR / "data" / "chroma_words"

    HTTP_HEADERS: dict = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0 Safari/537.36"
        ),
        "Accept": "application/json, text/plain, */*",
    }

    CORS_ORIGINS: list[str] = [
        "http://localhost:1989",
        "http://127.0.0.1:1989",
    ]


settings = Settings()
