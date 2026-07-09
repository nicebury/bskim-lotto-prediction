"""news 잡 — 복권 관련 뉴스 수집.

원문을 저장하지 않는다. 제목·요약·출처·발행일·링크·키워드만 남긴다.
`summary_desc` 는 네이버가 주는 요약문이지 기사 원문이 아니다.

catch-up 하지 않는다 — 놓친 뉴스는 다음 주기에 어차피 검색된다.
"""
from __future__ import annotations

import logging
from datetime import date, datetime
from zoneinfo import ZoneInfo

import httpx

from ..config import settings
from ..db import connect
from ..sources import naver_news
from .progress import JobProgress

logger = logging.getLogger(__name__)

KST = ZoneInfo("Asia/Seoul")


def _is_same_day(published_dttm: datetime | None, today: date) -> bool:
    """발행일자(KST)가 수집 실행일자와 같은가.

    네이버는 pubDate 를 `+0900` 오프셋으로 주지만, 다른 오프셋이 올 가능성에
    대비해 항상 KST 로 변환한 뒤 날짜를 뗀다. UTC 로 비교하면 한국 시각 오전
    9시 이전에 발행된 기사가 전날로 밀린다.

    발행일을 모르는 기사(pubDate 파싱 실패)는 **버린다.** 날짜를 확인할 수
    없으면 필터를 통과시킬 근거가 없다. 실측상 이런 기사는 0건이다.
    """
    if published_dttm is None:
        return False
    return published_dttm.astimezone(KST).date() == today


async def _insert_news(conn, item: dict) -> int:
    """뉴스 한 건. 이미 있으면 건너뛴다.

    link_url 의 UNIQUE 가 중복 수집을 막는 유일한 장치다. 하루 3번 같은 검색어로
    돌면 대부분이 이미 있는 기사이므로, 충돌이 예외가 아니라 정상 경로다.

    rowcount 로 '실제로 새로 들어간 건수' 를 센다. ON CONFLICT DO NOTHING 은
    충돌 시 0 을 준다. 이걸 세지 않고 조회 건수를 세면 collect_job_log 가
    매번 50건 수집했다고 보고한다 — 실제로는 새 기사가 2건일 때도.
    """
    cur = await conn.execute(
        """
        INSERT INTO lotto_news (
            title_nm, summary_desc, link_url, orig_link_url,
            provider_nm, published_dttm, keyword_list
        ) VALUES (
            %(title_nm)s, %(summary_desc)s, %(link_url)s, %(orig_link_url)s,
            %(provider_nm)s, %(published_dttm)s, %(keyword_list)s
        )
        ON CONFLICT (link_url) DO NOTHING
        """,
        item,
    )
    return cur.rowcount


async def run(progress: JobProgress) -> None:
    """검색어별로 뉴스를 가져와 합친 뒤 저장한다."""
    # 키가 없으면 잡을 실행할 수 없다. 크론에는 아예 등록되지 않지만(scheduler.py),
    # 수동 트리거는 레지스트리를 거치므로 여기까지 온다. 그때는 실패로 기록해
    # collect_job_log 에 '왜 안 돌았는지' 를 남긴다. 조용히 성공하면 안 된다.
    if not settings.naver_news_enabled:
        raise RuntimeError(
            "NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 이 없어 news 잡을 실행할 수 없다. "
            ".env_worker 를 확인한다."
        )

    queries = settings.news_queries
    # 실행 날짜를 잡 시작 시점에 한 번만 고정한다. 매 기사마다 date.today() 를
    # 부르면 자정을 넘기는 순간 기준이 바뀌어, 같은 실행에서 어제 기사와 오늘
    # 기사가 서로 다른 잣대로 걸러진다.
    today = datetime.now(KST).date()
    logger.info("news 잡 시작 — 검색어 %s / 수집 기준일 %s", queries, today)

    # 검색어별 결과를 link_url 로 합친다. '로또' 와 '복권' 양쪽에 걸린 기사는
    # 같은 링크로 두 번 온다. 같은 실행 안에서 두 번 INSERT 하면 두 번째는
    # DO NOTHING 으로 죽고, 그 기사의 keyword_list 에는 검색어가 하나만 남는다.
    # 합쳐 두면 ['로또','복권'] 이 한 번에 들어간다.
    merged: dict[str, dict] = {}
    fetched = 0
    async with httpx.AsyncClient() as client:
        for query in queries:
            items = await naver_news.fetch_news(
                client,
                query=query,
                display=settings.NAVER_NEWS_DISPLAY,
                client_id=settings.NAVER_CLIENT_ID,
                client_secret=settings.NAVER_CLIENT_SECRET,
                timeout=settings.CRAWL_HTTP_TIMEOUT_SEC,
                max_retry=settings.NEWS_MAX_RETRY,
                backoff_base_sec=settings.NEWS_BACKOFF_BASE_SEC,
            )
            fetched += len(items)
            logger.info("검색어 %r → %d건 조회", query, len(items))
            for item in items:
                merged.setdefault(item["link_url"], item)

    # 발행일자가 실행일자와 다른 기사를 버린다. sort=date 로 요청해도 네이버는
    # 며칠 전 기사를 함께 준다. DB 에 넣고 나중에 거르지 않고 여기서 버리는
    # 이유는, 한 번 들어간 행은 link_url UNIQUE 때문에 다시 판단할 기회가
    # 없기 때문이다.
    deduped = len(merged)
    if settings.NEWS_SAME_DAY_ONLY:
        merged = {
            link: item
            for link, item in merged.items()
            if _is_same_day(item["published_dttm"], today)
        }
        logger.info(
            "당일(%s) 필터 — %d건 중 %d건 제외", today, deduped, deduped - len(merged)
        )

    # 키워드는 합쳐진 뒤 전체 검색어 기준으로 다시 계산한다.
    for item in merged.values():
        item["keyword_list"] = naver_news.extract_keywords(
            item["title_nm"], item["summary_desc"] or "", queries
        )

    async with connect() as conn:
        for item in merged.values():
            progress.collected += await _insert_news(conn, item)

    logger.info(
        "news 잡 완료 — 조회 %d건 → 링크 중복제거 %d건 → 당일 %d건 → 신규 %d건 저장",
        fetched, deduped, len(merged), progress.collected,
    )
