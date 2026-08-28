"""video_refresh 잡 — 30일 보관 정책 이행.

YouTube 개발자 정책 III.E.4 는 비승인 데이터를 30일을 넘겨 저장하는 것을 금지하고
**"삭제 또는 갱신(delete or refresh)"** 을 요구한다. 이 잡이 그 의무를 이행한다.

★ **실행 순서가 정책을 보장한다.**

    1. 하드 만료 삭제 (API 호출 없음)   ← enabled 가드보다 먼저
    2. enabled 가드
    3. 보관 기간 초과 삭제
    4. 갱신 대상 선정 → videos.list → UPDATE / DELETE

  1번이 2번보다 먼저인 이유: 갱신에 성공해야만 삭제된다면 **API 장애가 곧 정책
  위반**이 된다. 키가 만료됐든 Google 이 죽었든 30일 제한은 지켜져야 한다.
  순서 하나가 정책 준수를 코드가 아니라 구조로 보장한다.
  **이 순서를 바꾸지 않는다.** 다음 사람이 "가드가 맨 위에 있어야지" 라고
  생각하기 쉬운 자리라 여기 적어 둔다.

이 잡의 `collected_cnt` 는 **신규 건수가 아니라 갱신 + 삭제 행수**다.
잡을 셋으로 나눈 이유 중 하나가 이 숫자의 의미가 다르다는 것이었다.

계약: docs/wiki/10-contracts/worker-jobs.md · docs/wiki/90-external/youtube-data-api.md
"""
from __future__ import annotations

import logging

import httpx

from ..config import settings
from ..db import connect
from ..sources import youtube_data
from . import video_common
from .progress import JobProgress

logger = logging.getLogger(__name__)

# videos.list 의 id 파라미터 상한과 같다. 배치 하나가 1 unit 이다.
BATCH = 50


async def run(progress: JobProgress) -> None:
    async with connect() as conn:
        # ── 1) 하드 만료 삭제 — API 를 부르기 전에, 가드보다 먼저 ──────────
        hard = await _delete_expired(conn, settings.YOUTUBE_HARD_EXPIRE_DAYS)
        if hard:
            logger.warning(
                "★ %d일을 넘겨 갱신되지 않은 행 %d건을 삭제했다. "
                "이 수가 0이 아니라는 것은 갱신 잡이 며칠 실패했다는 뜻이다.",
                settings.YOUTUBE_HARD_EXPIRE_DAYS, hard,
            )
        progress.collected += hard

        # ── 2) 이제 가드 ────────────────────────────────────────────────
        if not settings.youtube_enabled:
            raise RuntimeError(
                "YOUTUBE_API_KEY 가 없어 video_refresh 잡의 갱신 단계를 실행할 수 없다. "
                "만료 삭제는 이미 수행했다. .env_worker 를 확인한다."
            )

        # ── 3) 보관 기간 초과 삭제 ──────────────────────────────────────
        # 게시 후 오래돼 목록에 노출되지도 않는 영상은 갱신하지 않고 지운다.
        # 이것이 30일 정책의 '갱신' 해석 논쟁을 실질적으로 무력화한다 —
        # 대부분의 행이 여기서 사라져 무제한 보관 상태가 되지 않는다.
        stale = await _delete_old_published(conn, settings.YOUTUBE_RETAIN_DAYS)
        if stale:
            logger.info(
                "게시 %d일이 지난 영상 %d건을 삭제했다(갱신 대상에서 제외).",
                settings.YOUTUBE_RETAIN_DAYS, stale,
            )
        progress.collected += stale

        # ── 4) 갱신 ────────────────────────────────────────────────────
        keys = await _pick_refresh_targets(conn)
        if not keys:
            progress.stat = {
                "hard_expired": hard, "retain_exceeded": stale,
                "targets": 0, "updated": 0, "gone_deleted": 0,
            }
            logger.info("video_refresh 잡 완료 — 갱신 대상 없음 (삭제 %d건)", hard + stale)
            return

        if len(keys) >= settings.YOUTUBE_REFRESH_BATCH_LIMIT:
            logger.warning(
                "갱신 대상이 상한(%d)에 걸렸다. 유입이 갱신 능력을 넘었다는 신호다 — "
                "크론을 하루 2회로 늘리거나 YOUTUBE_REFRESH_BATCH_LIMIT 을 키운다.",
                settings.YOUTUBE_REFRESH_BATCH_LIMIT,
            )

        logger.info("video_refresh 잡 — 갱신 대상 %d건", len(keys))
        updated = deleted = 0
        async with httpx.AsyncClient() as client:
            for i in range(0, len(keys), BATCH):
                chunk = keys[i : i + BATCH]
                u, d = await _refresh_batch(conn, client, chunk)
                updated += u
                deleted += d
                progress.collected += u + d

        progress.stat = {
            "hard_expired": hard,
            "retain_exceeded": stale,
            "targets": len(keys),
            "updated": updated,
            "gone_deleted": deleted,
        }
        logger.info(
            "video_refresh 잡 완료 — 갱신 %d · 만료삭제 %d · 보관초과삭제 %d · 사라짐삭제 %d",
            updated, hard, stale, deleted,
        )


async def _delete_expired(conn, days: int) -> int:
    """refreshed_dttm 이 days 일을 넘긴 행을 삭제한다. 되찾을 방법은 재수집뿐이다."""
    cur = await conn.execute(
        "DELETE FROM lotto_video WHERE refreshed_dttm < now() - make_interval(days => %s)",
        (days,),
    )
    return cur.rowcount


async def _delete_old_published(conn, days: int) -> int:
    """게시된 지 days 일이 지난 영상을 삭제한다.

    로또는 주 1회 추첨이고 목록 노출 기준이 7일이라 60일 지난 영상은 어차피
    화면에 없다. 갱신 쿼터를 쓸 이유가 없다.
    """
    cur = await conn.execute(
        "DELETE FROM lotto_video WHERE published_dttm < now() - make_interval(days => %s)",
        (days,),
    )
    return cur.rowcount


async def _pick_refresh_targets(conn) -> list[str]:
    """가장 오래 확인되지 않은 것부터 고른다. ix_lotto_video_refreshed_dttm 을 탄다."""
    cur = await conn.execute(
        """
        SELECT provider_video_key FROM lotto_video
         WHERE provider_nm = 'youtube'
           AND refreshed_dttm < now() - make_interval(days => %s)
         ORDER BY refreshed_dttm
         LIMIT %s
        """,
        (settings.YOUTUBE_REFRESH_AFTER_DAYS, settings.YOUTUBE_REFRESH_BATCH_LIMIT),
    )
    return [r["provider_video_key"] for r in await cur.fetchall()]


async def _refresh_batch(conn, client, chunk: list[str]) -> tuple[int, int]:
    """한 배치(최대 50개, 1 unit)를 갱신한다. (갱신수, 삭제수).

    ★ HTTP 오류와 "응답에 없음" 을 반드시 구분한다. 요청 자체가 실패했으면
      예외가 올라가 잡이 실패하고 **아무것도 지우지 않는다.** 여기서 조용히
      삼키면 API 장애가 대량 삭제로 이어진다.
    """
    details = await youtube_data.list_video_details(
        client,
        video_keys=chunk,
        api_key=settings.YOUTUBE_API_KEY,
        timeout=settings.CRAWL_HTTP_TIMEOUT_SEC,
        max_retry=settings.YOUTUBE_MAX_RETRY,
        backoff_base_sec=settings.YOUTUBE_BACKOFF_BASE_SEC,
        summary_max_len=settings.YOUTUBE_SUMMARY_MAX_LEN,
    )

    # ★ 안전판. 50개를 요청했는데 하나도 안 왔다면 50개가 동시에 사라졌을
    #   확률보다 요청/응답이 이상할 확률이 높다. 이 판단이 없으면 API 스펙
    #   변경 한 번에 테이블이 통째로 비워진다.
    if not details and len(chunk) > 1:
        logger.warning(
            "★ %d건을 요청했으나 응답이 0건이다. 삭제하지 않고 이 배치를 건너뛴다. "
            "API 응답 형식이 바뀌었을 수 있다.",
            len(chunk),
        )
        return 0, 0

    returned = {d["provider_video_key"] for d in details}
    updated = deleted = 0

    for item in details:
        # 갱신 후 표시 가능성을 **다시** 판정한다. 비공개로 바뀌었거나 임베드가
        # 막혔거나 madeForKids 가 켜졌으면 담고 있을 이유가 없다 —
        # 30일 갱신 비용만 든다.
        if not video_common.is_displayable(item):
            await _delete_one(conn, item["provider_video_key"])
            deleted += 1
            continue
        enriched = video_common.enrich(
            item,
            queries=settings.youtube_search_queries,
            shorts_max_sec=settings.YOUTUBE_SHORTS_MAX_SEC,
        )
        updated += await _update_one(conn, enriched)

    # 요청에는 있었으나 응답에 없는 키 = 삭제·비공개·지역차단된 영상
    for missing in set(chunk) - returned:
        await _delete_one(conn, missing)
        deleted += 1

    return updated, deleted


async def _update_one(conn, item: dict) -> int:
    """갱신. published_dttm·discovery_cd·collected_dttm 은 덮지 않는다.

    게시 시각은 변하지 않고(변했다면 다른 영상이다), 발견 경로는 역사이며,
    최초 수집일시도 마찬가지다. refreshed_dttm 만 now() 로 민다 —
    **값이 하나도 안 바뀌어도 확인했다는 사실이 30일 시계를 되감는다.**
    """
    cur = await conn.execute(
        """
        UPDATE lotto_video
           SET title_nm           = %(title_nm)s,
               summary_desc       = %(summary_desc)s,
               channel_nm         = %(channel_nm)s,
               thumbnail_url      = %(thumbnail_url)s,
               duration_sec       = %(duration_sec)s,
               view_cnt           = %(view_cnt)s,
               shorts_estimate_cd = %(shorts_estimate_cd)s,
               shorts_basis_desc  = %(shorts_basis_desc)s,
               made_for_kids_cd   = %(made_for_kids_cd)s,
               embeddable_cd      = %(embeddable_cd)s,
               privacy_status_cd  = %(privacy_status_cd)s,
               round_no           = %(round_no)s,
               game_cd            = %(game_cd)s,
               keyword_list       = %(keyword_list)s,
               refreshed_dttm     = now()
         WHERE provider_nm = %(provider_nm)s
           AND provider_video_key = %(provider_video_key)s
        """,
        item,
    )
    return cur.rowcount


async def _delete_one(conn, video_key: str) -> None:
    await conn.execute(
        "DELETE FROM lotto_video WHERE provider_nm = 'youtube' AND provider_video_key = %s",
        (video_key,),
    )
