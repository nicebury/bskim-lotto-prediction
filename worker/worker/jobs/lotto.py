"""lotto 잡 — 최신 회차 증분 수집.

MAX(round_no) + 1 부터 시작해 회차를 하나씩 올려가며 가져오고, 소스가 데이터를
주지 않으면(= 아직 추첨되지 않은 회차) **정상 종료**한다. 0건 수집 후 success 는
오류가 아니라 "다음 회차가 아직 추첨되지 않았다" 는 뜻이다.

추첨은 매주 토 20:45 KST. 크론이 21:00 인 것은 결과가 위젯에 반영될 시간을 주기
위해서다. 그래도 늦게 반영되는 경우가 있어 실패 시 재시도한다(scheduler.py).
"""
from __future__ import annotations

import asyncio
import logging
import random

import httpx

from ..config import settings
from ..db import connect
from ..sources import naver_widget
from .progress import JobProgress

logger = logging.getLogger(__name__)


async def _last_round() -> int:
    """수집된 마지막 회차. 빈 DB 면 0 → 1회차부터 시작한다."""
    async with connect() as conn:
        cur = await conn.execute("SELECT max(round_no) AS m FROM lotto_draw")
        row = await cur.fetchone()
    return int(row["m"]) if row and row["m"] is not None else 0


async def _insert_draw(conn, data: dict) -> None:
    """회차 한 건을 넣는다.

    ON CONFLICT (round_no) DO NOTHING 인 이유: 크론과 수동 트리거가 겹치거나
    catch-up 이 같은 회차를 다시 긁는 일이 있다. 그때 PK 충돌로 잡 전체를
    실패시키는 대신 조용히 건너뛴다. 회차 데이터는 불변이므로 덮어쓸 이유도 없다.

    (공식 API 가 복구되어 total_sell_amt 등을 채우게 되면 그건 이 잡이 아니라
     별도 enrich 스크립트의 일이다. 거기서는 UPDATE 로 updated_dttm 을 남긴다.)
    """
    await conn.execute(
        """
        INSERT INTO lotto_draw (
            round_no, draw_ymd,
            winning_no1, winning_no2, winning_no3,
            winning_no4, winning_no5, winning_no6,
            bonus_no,
            total_sell_amt, first_prize_amt, first_winner_cnt, first_accum_prize_amt
        ) VALUES (
            %(round_no)s, %(draw_ymd)s,
            %(n1)s, %(n2)s, %(n3)s, %(n4)s, %(n5)s, %(n6)s,
            %(bonus_no)s,
            %(total_sell_amt)s, %(first_prize_amt)s,
            %(first_winner_cnt)s, %(first_accum_prize_amt)s
        )
        ON CONFLICT (round_no) DO NOTHING
        """,
        {
            "round_no": data["round_no"],
            "draw_ymd": data["draw_ymd"],
            "n1": data["numbers"][0],
            "n2": data["numbers"][1],
            "n3": data["numbers"][2],
            "n4": data["numbers"][3],
            "n5": data["numbers"][4],
            "n6": data["numbers"][5],
            "bonus_no": data["bonus_no"],
            "total_sell_amt": data["total_sell_amt"],
            "first_prize_amt": data["first_prize_amt"],
            "first_winner_cnt": data["first_winner_cnt"],
            "first_accum_prize_amt": data["first_accum_prize_amt"],
        },
    )


async def _fetch_with_retry(client: httpx.AsyncClient, round_no: int) -> dict | None:
    """네트워크 오류만 재시도한다.

    None(미추첨)은 재시도 대상이 아니다 — 다시 물어봐도 추첨되지 않았다.
    이 둘을 섞으면 매주 토요일마다 3회씩 헛되이 두드린다.
    """
    last_exc: Exception | None = None
    for attempt in range(1, settings.CRAWL_MAX_RETRY + 1):
        try:
            return await naver_widget.fetch_round(
                client, round_no, timeout=settings.CRAWL_HTTP_TIMEOUT_SEC
            )
        except Exception as exc:  # noqa: BLE001 — httpx 오류 계층이 넓다
            last_exc = exc
            logger.warning(
                "%d회차 조회 실패 (%d/%d): %s",
                round_no, attempt, settings.CRAWL_MAX_RETRY, exc,
            )
            if attempt < settings.CRAWL_MAX_RETRY:
                await asyncio.sleep(settings.CRAWL_RETRY_DELAY_SEC)

    raise RuntimeError(
        f"{round_no}회차 조회가 {settings.CRAWL_MAX_RETRY}회 재시도 후 실패했다: {last_exc}"
    )


async def run(progress: JobProgress) -> None:
    """증분 수집 본체.

    progress 를 통해 수집 건수를 실시간 갱신하는 이유: 중간에 실패해도 그때까지
    커밋된 건수가 collect_job_log 에 정확히 남아야 한다. 반환값으로만 전달하면
    예외가 던져지는 순간 그 정보가 사라진다.
    """
    start_round = await _last_round() + 1
    logger.info("lotto 잡 시작 — %d회차부터 (네이버 위젯 소스)", start_round)

    async with httpx.AsyncClient(headers=naver_widget.DEFAULT_HEADERS) as client, \
               connect() as conn:
        current = start_round
        while True:
            data = await _fetch_with_retry(client, current)
            if data is None:
                # 아직 추첨되지 않은 회차 → 여기서 멈추는 것이 정상 종료다.
                logger.info("%d회차는 아직 추첨 전이다. %d건 수집하고 종료한다",
                            current, progress.collected)
                break

            await _insert_draw(conn, data)
            progress.collected += 1
            logger.info("%d회차 수집 (%s) %s+%s",
                        current, data["draw_ymd"], data["numbers"], data["bonus_no"])
            current += 1

            # 봇 감지 완화. 지터를 섞는 이유는 정확히 2.0초 간격의 규칙적 요청이
            # 사람으로 보이지 않기 때문이다.
            await asyncio.sleep(
                settings.CRAWL_DELAY_SEC + random.uniform(0, settings.CRAWL_JITTER_SEC)
            )
