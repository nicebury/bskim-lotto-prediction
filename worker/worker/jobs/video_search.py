"""video_search 잡 — 검색 보조 수집.

**하루 100회짜리 search.list 버킷을 쓰는 유일한 잡이다.** 이 잡을 채널 잡과
분리한 실질적 이득이 여기 있다 — 검색 쿼터가 마른 날에도 화이트리스트 경로는
계속 돈다.

쿼터를 두 겹으로 막는다.
  1. 실행당 상한 (YOUTUBE_SEARCH_MAX_CALL_PER_RUN) — 질의를 늘려도 한 실행이
     이 수를 넘지 않는다
  2. 일일 근사 예산 (YOUTUBE_SEARCH_DAILY_BUDGET) — collect_job_log 에서 오늘의
     실행 횟수를 세어 추정한다. ★추정이다. 정본은 Cloud Console 이고, 재시도로
     인한 초과 호출을 워커는 셀 수 없다

계약: docs/wiki/10-contracts/worker-jobs.md
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta

import httpx

from ..config import settings
from ..db import connect
from ..sources import youtube_data
from . import video_common
from .progress import JobProgress

logger = logging.getLogger(__name__)


async def run(progress: JobProgress) -> None:
    """검색어별로 영상을 찾아 필터링해 저장한다."""
    if not settings.youtube_enabled:
        raise RuntimeError(
            "YOUTUBE_API_KEY 가 없어 video_search 잡을 실행할 수 없다. "
            ".env_worker 를 확인한다."
        )

    queries = settings.youtube_search_queries
    if not queries:
        raise RuntimeError("YOUTUBE_SEARCH_QUERY 가 비어 있어 검색할 질의가 없다.")

    today = datetime.now(video_common.KST).date()

    async with connect() as conn:
        # 쿼터 가드. 예산을 넘으면 **호출 없이 0건 success 로 끝낸다.**
        # failed 가 아닌 이유: 쿼터 보호는 오류가 아니다. failed 로 남기면
        # 이력에 실패가 쌓여 진짜 장애를 가린다.
        if await _daily_budget_exhausted(conn):
            logger.warning(
                "오늘의 search.list 근사 예산(%d calls)을 넘어 이번 실행은 건너뛴다. "
                "정확한 소비량은 Cloud Console 의 Quotas 에서 확인한다.",
                settings.YOUTUBE_SEARCH_DAILY_BUDGET,
            )
            progress.collected = 0
            # 왜 0건인지 이력에 남긴다. 이 표시가 없으면 "그날 검색이 안 돌았다"
            # 는 사실만 남고 이유(쿼터 보호)를 알 수 없다.
            progress.stat = {"skipped_by_budget": 1}
            return

        # 한 실행이 쓸 수 있는 호출 수만큼만 질의를 던진다.
        max_calls = max(1, settings.YOUTUBE_SEARCH_MAX_CALL_PER_RUN)
        use_queries = queries[:max_calls]
        if len(queries) > max_calls:
            # 조용히 자르지 않는다. 뒤쪽 질의가 영영 안 도는 상태를 사람이 알아야 한다.
            logger.warning(
                "질의 %d개 중 %d개만 실행한다 (YOUTUBE_SEARCH_MAX_CALL_PER_RUN). "
                "나머지 %s 는 이번 실행에서 제외된다.",
                len(queries), max_calls, queries[max_calls:],
            )

        # API 단에서 과거를 자른다. 신선도 필터가 뒤에서 또 거르지만, 여기서
        # 자르면 상위 50건이 전부 최근 것으로 채워져 같은 쿼터로 더 많이 건진다.
        published_after = datetime.now(video_common.KST) - timedelta(
            days=settings.YOUTUBE_MAX_AGE_DAYS
        )

        logger.info(
            "video_search 잡 시작 — 질의 %s / 기준일 %s / LLM=%s",
            use_queries, today, "on" if settings.llm_judge_enabled else "off",
        )

        stubs: list[dict] = []
        async with httpx.AsyncClient() as client:
            for query in use_queries:
                found = await youtube_data.search_videos(
                    client,
                    query=query,
                    max_results=settings.YOUTUBE_SEARCH_MAX_RESULT,
                    published_after=published_after,
                    api_key=settings.YOUTUBE_API_KEY,
                    timeout=settings.CRAWL_HTTP_TIMEOUT_SEC,
                    max_retry=settings.YOUTUBE_MAX_RETRY,
                    backoff_base_sec=settings.YOUTUBE_BACKOFF_BASE_SEC,
                )
                logger.info("질의 %r → %d건 조회", query, len(found))
                stubs.extend(found)

            stat = await video_common.process_stubs(
                conn,
                client,
                stubs,
                discovery_cd="search",
                # 검색은 화이트리스트보다 약한 신호다. 이미 있는 행의 판정을
                # 덮지 않는다 — 검색이 나중에 발견했다고 'channel' 을 'search'
                # 로 되돌리면 표시 우선순위가 뒤집힌다.
                promote=False,
                today=today,
                settings=settings,
                # 검색 유래가 LLM 판정의 본래 대상이다. 예상번호 채널이
                # 압도적으로 많은 영역이라 규칙 제외어만으로는 샌다.
                use_llm=settings.llm_judge_enabled,
            )

    progress.collected = stat["stored"]
    progress.stat = stat
    video_common.log_stat("video_search 잡", stat)


async def _daily_budget_exhausted(conn) -> bool:
    """오늘 이미 예산만큼 검색했는가. **추정이다.**

    collect_job_log 에서 오늘(KST) 실행된 video_search 행 수를 세고, 실행당
    최대 호출 수를 곱해 근사한다. 실제 소비와 어긋나는 경우가 둘 있다.

      * 재시도(429/5xx)로 인한 추가 호출을 세지 못한다 → 실제가 더 많다
      * 질의 수가 상한보다 적으면 과대 추정한다 → 실제가 더 적다

    둘 다 안전한 방향이 다르므로 예산을 60/100 으로 잡아 여유를 남긴다.
    정확한 값은 Cloud Console → APIs & Services → Quotas 에서 본다.
    """
    cur = await conn.execute(
        """
        SELECT count(*) AS cnt FROM collect_job_log
         WHERE job_nm = 'video_search'
           AND started_dttm >= date_trunc('day', now() AT TIME ZONE 'Asia/Seoul')
                               AT TIME ZONE 'Asia/Seoul'
        """
    )
    row = await cur.fetchone()
    runs = int(row["cnt"]) if row else 0
    # 이번 실행 자신이 이미 running 행으로 들어와 있으므로 1 을 뺀다.
    prior = max(0, runs - 1)
    estimated = prior * settings.YOUTUBE_SEARCH_MAX_CALL_PER_RUN
    return estimated >= settings.YOUTUBE_SEARCH_DAILY_BUDGET
