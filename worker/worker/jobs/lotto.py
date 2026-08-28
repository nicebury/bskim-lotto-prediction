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
from datetime import date, datetime
from zoneinfo import ZoneInfo

import httpx

from ..config import settings
from ..db import connect
from ..sources import naver_widget
from .progress import JobProgress

logger = logging.getLogger(__name__)

KST = ZoneInfo("Asia/Seoul")

# 주 1회 추첨이므로 최신 회차가 8일 이상 낡으면 한 회차를 확실히 놓친 것이다.
# 7일이 아니라 8일인 이유: 토요일 밤 추첨 직전에는 정상적으로 7일이 된다.
_STALE_DRAW_DAYS = 8


async def _last_round() -> int:
    """수집된 마지막 회차. 빈 DB 면 0 → 1회차부터 시작한다."""
    async with connect() as conn:
        cur = await conn.execute("SELECT max(round_no) AS m FROM lotto_draw")
        row = await cur.fetchone()
    return int(row["m"]) if row and row["m"] is not None else 0


async def _last_draw_ymd() -> date | None:
    """가장 최근 회차의 추첨일. 빈 DB 면 None."""
    async with connect() as conn:
        cur = await conn.execute("SELECT max(draw_ymd) AS d FROM lotto_draw")
        row = await cur.fetchone()
    return row["d"] if row else None


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

    # 0건 수집 자체는 정상이다(다음 회차가 아직 추첨 전). 다만 그것이 이어져
    # 최신 회차가 오래 낡았다면 회차를 놓친 것이다. 잡을 실패시키지는 않는다 —
    # 수집할 게 없는 것과 수집에 실패한 것은 다르고, failed 로 남기면 재시도가
    # 매주 헛돈다. 사람이 볼 수 있게 경고만 남기고 수동 트리거에 맡긴다.
    progress.stat = {
        "start_round": start_round,
        # 마지막으로 시도했으나 아직 추첨 전이었던 회차. "어디까지 갔나" 를
        # 남긴다 — 0건일 때 소스 파싱이 깨진 것인지 정말 추첨 전인지 가른다.
        "stopped_at_round": current,
        "stored": progress.collected,
    }

    if progress.collected == 0:
        await _warn_if_draw_data_is_stale()


async def _warn_if_draw_data_is_stale() -> None:
    """최신 회차가 8일 이상 낡았으면 경고한다."""
    last_ymd = await _last_draw_ymd()
    if last_ymd is None:
        logger.warning("lotto_draw 가 비어 있는데 0건을 수집했다. 소스 파싱을 확인한다.")
        return

    age = (datetime.now(KST).date() - last_ymd).days
    if age >= _STALE_DRAW_DAYS:
        logger.warning(
            "최신 회차(%s)가 %d일 지났는데 새 회차를 못 가져왔다. "
            "회차를 놓쳤을 수 있다 — 위젯 파싱 규칙을 확인하고 수동 트리거로 재시도한다.",
            last_ymd, age,
        )
