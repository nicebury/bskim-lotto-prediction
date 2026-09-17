"""이미 수집된 뉴스·영상을 애드센스 기준으로 재검증하고 삭제한다.

**1회성 스크립트다.** 판정 기준(`llm_judge` 의 프롬프트)이 바뀌면 이미 저장된
행은 다시 판단될 기회가 없다 — UNIQUE 제약 때문에 재수집 시 `DO NOTHING` 으로
죽기 때문이다. 기준을 강화했다면 기존 데이터에도 소급 적용해야 목록이 일관된다.

    uv run python scripts/recheck_collected.py            # 드라이런(기본)
    uv run python scripts/recheck_collected.py --apply    # 실제 삭제

드라이런이 기본인 이유: 삭제는 되돌릴 수 없고, 프롬프트를 바꾼 직후에는
과잉 차단이 가장 위험하다. 무엇이 지워질지 눈으로 본 뒤 --apply 한다.

비용: 908건 기준 약 16원(gpt-5-nano). 배치 20건씩 묶어 호출한다.
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from worker.config import settings  # noqa: E402
from worker.db import connect  # noqa: E402
from worker.sources import llm_judge  # noqa: E402


async def _fetch_videos(conn) -> list[dict]:
    cur = await conn.execute(
        """
        SELECT provider_video_key AS key, title_nm, channel_nm AS source_nm, discovery_cd
          FROM lotto_video ORDER BY published_dttm DESC
        """
    )
    return list(await cur.fetchall())


async def _fetch_news(conn) -> list[dict]:
    cur = await conn.execute(
        """
        SELECT link_url AS key, title_nm, provider_nm AS source_nm
          FROM lotto_news ORDER BY published_dttm DESC
        """
    )
    return list(await cur.fetchall())


async def _judge(client, items: list[dict], kind: str) -> set[str]:
    if not items:
        return set()
    return await llm_judge.judge_blocked(
        client,
        items=items,
        kind=kind,
        api_key=settings.API_KEY,
        model=settings.MODEL,
        batch_size=settings.LLM_JUDGE_BATCH_SIZE,
        timeout=settings.LLM_JUDGE_TIMEOUT_SEC,
        max_retry=settings.LLM_JUDGE_MAX_RETRY,
    )


async def main(apply: bool) -> None:
    if not settings.llm_judge_enabled:
        raise SystemExit("API_KEY 가 없거나 LLM_JUDGE_ENABLED=false 다.")

    async with connect() as conn:
        videos = await _fetch_videos(conn)
        news = await _fetch_news(conn)

        print(f"대상 — 영상 {len(videos)}건 · 뉴스 {len(news)}건")
        print(f"모델 {settings.MODEL} / 배치 {settings.LLM_JUDGE_BATCH_SIZE}건\n")

        async with httpx.AsyncClient() as client:
            v_blocked = await _judge(client, videos, "video")
            n_blocked = await _judge(client, news, "news")

        print(f"=== 영상: {len(v_blocked)}건 차단 ({100*len(v_blocked)//max(len(videos),1)}%) ===")
        for v in videos:
            if v["key"] in v_blocked:
                print(f"  [{v['discovery_cd']:7s}] {v['title_nm'][:52]}  — {v['source_nm']}")

        print(f"\n=== 뉴스: {len(n_blocked)}건 차단 ({100*len(n_blocked)//max(len(news),1)}%) ===")
        for n in news:
            if n["key"] in n_blocked:
                print(f"  {n['title_nm'][:60]}")

        if not apply:
            print("\n드라이런이다. 실제로 지우려면 --apply 를 붙인다.")
            return

        # ★ 전량 차단은 프롬프트가 깨졌다는 신호다. 그대로 실행하면 테이블이
        #   통째로 비워진다. video_refresh 의 '응답 0건이면 삭제하지 않는다'
        #   안전판과 같은 논리다.
        for label, blocked, total in (("영상", v_blocked, videos), ("뉴스", n_blocked, news)):
            if total and len(blocked) == len(total):
                raise SystemExit(
                    f"{label} 전량({len(total)}건)이 차단 판정됐다. 프롬프트나 응답 파싱이 "
                    "깨졌을 가능성이 높다. 삭제하지 않고 멈춘다."
                )

        if v_blocked:
            cur = await conn.execute(
                "DELETE FROM lotto_video WHERE provider_video_key = ANY(%s)",
                (list(v_blocked),),
            )
            print(f"\n영상 {cur.rowcount}건 삭제")
        if n_blocked:
            cur = await conn.execute(
                "DELETE FROM lotto_news WHERE link_url = ANY(%s)", (list(n_blocked),)
            )
            print(f"뉴스 {cur.rowcount}건 삭제")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="실제로 삭제한다")
    asyncio.run(main(ap.parse_args().apply))
