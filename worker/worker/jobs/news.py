"""news 잡 — 복권 관련 뉴스 수집.

원문을 저장하지 않는다. 제목·요약·출처·발행일·링크·키워드만 남긴다.
`summary_desc` 는 네이버가 주는 요약문이지 기사 원문이 아니다.

catch-up 하지 않는다 — 즉시 한 번 돌려도 **놓친 구간이 돌아오지 않기 때문**이다.
아래 _is_fresh 가 하루 넘은 기사를 버리므로, 워커가 멈춰 있던 기간의 뉴스는
크론을 몇 번 더 돌려도 채워지지 않는다(2026-08-18 실측: 33일 중단 → 32일치 0건,
복구 실행은 당일·전날치 91건만 담았다). lotto 와 갈리는 지점이 여기다 — 회차는
번호로 지목해 다시 조회되지만 뉴스에는 그런 주소가 없다. 되살리려면 잡이 아니라
1회성 백필이 필요하고 그것은 재배포 약관 판단에 걸린다.
계약: docs/wiki/10-contracts/worker-jobs.md 의 catch-up 절.
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


def _is_on_topic(title: str, queries: list[str], exclude: list[str], must_match: bool) -> bool:
    """제목이 이 사이트의 주제에 맞는가.

    **제목만 본다.** 요약(description)은 네이버가 검색어 주변을 잘라 주는
    스니펫이라 거의 항상 검색어를 포함한다 — 실측 332건에서 제목·요약을 함께
    보면 전부 통과해 변별력이 0 이었다. 제목만이 기사의 주제를 말해 준다.

    두 규칙을 순서대로 적용한다.

    1. must_match 면 제목에 검색어가 하나도 없을 때 버린다. 검색 API 는 본문
       전문을 뒤지므로, 기사 말미에 "이 사업은 복권기금으로 운영된다" 한 줄이
       있는 과학관 보도자료도 결과에 들어온다. 주제가 아니라 각주에 스친 것이다.

    2. 제목에 제외어가 있으면 버린다. '로또 청약'·'로또 줍줍' 은 제목에 '로또'
       가 있어 1을 통과하지만 부동산 기사다. 이런 기사가 몰리면(실측: 안유진
       청약 13건, 송파 롯데캐슬 12건) 목록이 통째로 그것들로 덮인다.

    제외어를 먼저 보지 않는 이유는 없다 — 결과는 같다. 읽는 사람이 '무엇을
    담는가' 를 먼저 보고 '무엇을 빼는가' 를 나중에 보는 편이 자연스러워 이 순서다.

    ⚠ 제외어는 **과잉 차단의 위험**이 있다. 늘릴 때는 반드시 기존 데이터에
      드라이런해 진짜 복권 뉴스가 걸리지 않는지 확인한다. 현재 기본값은
      2026-08-19 에 332건으로 검증했다 — 걸러진 248건 중 복권 뉴스 0건.
    """
    if must_match and not any(q in title for q in queries):
        return False
    return not any(k in title for k in exclude)


def _is_fresh(published_dttm: datetime | None, today: date, max_age_days: int) -> bool:
    """발행일(KST)이 수집 실행일로부터 max_age_days 일 이내인가.

    max_age_days=1 이면 오늘과 어제를 통과시킨다. 0 이면 당일만이다.

    네이버는 pubDate 를 `+0900` 오프셋으로 주지만, 다른 오프셋이 올 가능성에
    대비해 항상 KST 로 변환한 뒤 날짜를 뗀다. UTC 로 비교하면 한국 시각 오전
    9시 이전에 발행된 기사가 전날로 밀린다.

    발행일을 모르는 기사(pubDate 파싱 실패)는 **버린다.** 날짜를 확인할 수
    없으면 필터를 통과시킬 근거가 없다. 실측상 이런 기사는 0건이다.

    미래 날짜도 버린다. 나이가 음수가 되어 조건을 통과해 버리기 때문이다.
    발행일이 실행일보다 뒤라면 소스가 이상한 것이지 신선한 것이 아니다.
    """
    if published_dttm is None:
        return False
    age = (today - published_dttm.astimezone(KST).date()).days
    return 0 <= age <= max_age_days


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
    logger.info(
        "news 잡 시작 — 검색어 %s / 기준일 %s / 최대 %d일 전까지",
        queries, today, settings.NEWS_MAX_AGE_DAYS,
    )

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

    # 주제에 맞지 않는 기사를 버린다. 신선도보다 먼저 보는 것은 문자열 검사가
    # 날짜 변환보다 싸기 때문이고, 어느 쪽을 먼저 해도 결과는 같다.
    deduped = len(merged)
    exclude = settings.news_exclude_keywords
    merged = {
        link: item
        for link, item in merged.items()
        if _is_on_topic(item["title_nm"], queries, exclude, settings.NEWS_TITLE_MUST_MATCH)
    }
    logger.info(
        "주제 필터(제목 일치=%s, 제외어 %d개) — %d건 중 %d건 제외",
        settings.NEWS_TITLE_MUST_MATCH, len(exclude), deduped, deduped - len(merged),
    )
    on_topic = len(merged)

    # 오래된 기사를 버린다. sort=date 로 요청해도 네이버는 며칠 전 기사를 함께 준다.
    # DB 에 넣고 나중에 거르지 않고 여기서 버리는 이유는, 한 번 들어간 행은
    # link_url UNIQUE 때문에 다시 판단할 기회가 없기 때문이다.
    max_age = settings.NEWS_MAX_AGE_DAYS
    merged = {
        link: item
        for link, item in merged.items()
        if _is_fresh(item["published_dttm"], today, max_age)
    }
    logger.info(
        "신선도 필터(%s 기준 %d일 이내) — %d건 중 %d건 제외",
        today, max_age, on_topic, on_topic - len(merged),
    )

    # 키워드는 합쳐진 뒤 전체 검색어 기준으로 다시 계산한다.
    for item in merged.values():
        item["keyword_list"] = naver_news.extract_keywords(
            item["title_nm"], item["summary_desc"] or "", queries
        )

    async with connect() as conn:
        for item in merged.values():
            progress.collected += await _insert_news(conn, item)

    progress.stat = {
        "fetched": fetched,
        "deduped": deduped,
        "on_topic": on_topic,
        "fresh": len(merged),
        "stored": progress.collected,
    }
    logger.info(
        "news 잡 완료 — 조회 %d건 → 링크 중복제거 %d → 주제적합 %d → 신선 %d → 신규 %d건 저장",
        fetched, deduped, on_topic, len(merged), progress.collected,
    )
