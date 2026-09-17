"""video_channel 잡 — 화이트리스트 채널의 신규 영상 수집.

**search.list 를 한 번도 쓰지 않는다.** 하루 100회짜리 검색 버킷을 전부
video_search 에 넘기기 위해서다. 여기는 공통 10,000 유닛만 쓴다.

    channels.list      1 unit   (채널 50개를 묶어서)
    playlistItems.list 1 unit × 채널 수
    videos.list        1 unit × ceil(신규 후보 / 50)
    → 화이트리스트 2곳 기준 약 3 units/회

catch-up 하지 않는다. 다만 **뉴스와 달리 결손이 영구적이지 않다** — 업로드
플레이리스트는 최신 50건을 통째로 주므로 워커가 며칠 멈춰 있었어도 다음 실행이
대부분 회수한다. 더 넓게 회수하려면 YOUTUBE_MAX_AGE_DAYS 를 일시적으로 올려
수동 트리거한다.

계약: docs/wiki/10-contracts/worker-jobs.md
"""
from __future__ import annotations

import logging
from datetime import datetime

import httpx

from ..config import settings
from ..db import connect
from ..sources import youtube_data
from . import video_common
from .progress import JobProgress

logger = logging.getLogger(__name__)


async def run(progress: JobProgress) -> None:
    """화이트리스트 채널의 업로드 플레이리스트를 훑어 신규 영상을 저장한다."""
    # 키가 없으면 크론에는 등록되지 않지만 수동 트리거는 여기까지 온다.
    # 조용히 성공하지 않고 이력에 이유를 남긴다 (news 잡과 같은 계약).
    if not settings.youtube_enabled:
        raise RuntimeError(
            "YOUTUBE_API_KEY 가 없어 video_channel 잡을 실행할 수 없다. "
            ".env_worker 를 확인한다."
        )

    channel_keys = settings.youtube_channel_keys
    if not channel_keys:
        raise RuntimeError(
            "YOUTUBE_CHANNEL_KEY_LIST 가 비어 있어 수집할 채널이 없다. "
            "화이트리스트를 채우거나 video_search 잡만 쓴다."
        )

    today = datetime.now(video_common.KST).date()
    logger.info(
        "video_channel 잡 시작 — 채널 %d개 / 기준일 %s / 최대 %d일 전까지 / LLM=%s",
        len(channel_keys), today, settings.YOUTUBE_MAX_AGE_DAYS,
        "on" if settings.llm_judge_enabled else "off",
    )

    async with httpx.AsyncClient() as client:
        # 1 unit. 업로드 플레이리스트 ID 와 **현재 채널명**을 함께 받는다.
        channels = await youtube_data.list_upload_playlists(
            client,
            channel_keys=channel_keys,
            api_key=settings.YOUTUBE_API_KEY,
            timeout=settings.CRAWL_HTTP_TIMEOUT_SEC,
            max_retry=settings.YOUTUBE_MAX_RETRY,
            backoff_base_sec=settings.YOUTUBE_BACKOFF_BASE_SEC,
        )

        stubs: list[dict] = []
        for channel_key, info in channels.items():
            # 채널당 1 unit
            found = await youtube_data.list_playlist_videos(
                client,
                playlist_id=info["uploads_playlist_id"],
                max_results=settings.YOUTUBE_SEARCH_MAX_RESULT,
                api_key=settings.YOUTUBE_API_KEY,
                timeout=settings.CRAWL_HTTP_TIMEOUT_SEC,
                max_retry=settings.YOUTUBE_MAX_RETRY,
                backoff_base_sec=settings.YOUTUBE_BACKOFF_BASE_SEC,
            )
            logger.info("채널 %s(%s) → %d건", info["channel_nm"], channel_key, len(found))
            stubs.extend(found)

        async with connect() as conn:
            # 채널 매각·개명 감시. 2026-08-27 조사에서 후보 20곳 중 6곳이 이미
            # 무관한 콘텐츠(육아 브이로그, 심리 쇼츠)로 바뀌어 있었다.
            # 채널 ID 로 고정해도 그 ID 가 가리키는 것이 변한다.
            await _warn_renamed_channels(conn, channels)

            stat = await video_common.process_stubs(
                conn,
                client,
                stubs,
                discovery_cd="channel",
                # 검색으로 먼저 발견된 영상을 화이트리스트 유래로 승격한다.
                promote=True,
                today=today,
                settings=settings,
                # 2026-09-08: 화이트리스트도 LLM 판정한다.
                # 종전에는 면제했으나 공식 채널에도 홍보·이벤트 영상이 섞이고,
                # 애드센스 심사자는 채널 소유자를 보지 않고 제목을 본다.
                # 신규만 판정하도록 순서를 고쳐서 하루 3건 남짓, 연 55원이다.
                use_llm=settings.llm_judge_enabled,
            )

    progress.collected = stat["stored"]
    progress.stat = stat
    video_common.log_stat("video_channel 잡", stat)


async def _warn_renamed_channels(conn, channels: dict[str, dict]) -> None:
    """저장된 채널명과 현재 채널명이 다르면 경고한다.

    자동으로 비활성화하지 않는다 — 채널이 이름만 바꾼 것인지 아예 다른 채널이
    된 것인지 코드가 판단할 수 없고, 잘못 끄면 공식 채널 수집이 조용히 멈춘다.
    사람이 로그를 보고 YOUTUBE_CHANNEL_KEY_LIST 를 고치게 한다.
    """
    keys = list(channels)
    if not keys:
        return
    cur = await conn.execute(
        """
        SELECT DISTINCT provider_channel_key, channel_nm
          FROM lotto_video
         WHERE provider_nm = 'youtube' AND provider_channel_key = ANY(%s)
        """,
        (keys,),
    )
    for row in await cur.fetchall():
        stored = row["channel_nm"]
        current = channels[row["provider_channel_key"]]["channel_nm"]
        if stored and current and stored != current:
            logger.warning(
                "★ 채널명이 바뀌었다: %s — 저장된 이름 %r → 현재 %r. "
                "채널이 매각·개명됐을 수 있다. 화이트리스트를 확인한다.",
                row["provider_channel_key"], stored, current,
            )
