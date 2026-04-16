import asyncio

from fastapi import APIRouter, HTTPException, Query

from ..crawler import crawler
from ..database import get_db
from ..schemas import (
    CrawlStartResponse,
    CrawlStatus,
    LottoResult,
    ResultsPage,
)
from .dashboard import _row_to_result

router = APIRouter(prefix="/api", tags=["crawl"])


@router.post("/crawl", response_model=CrawlStartResponse, status_code=202)
async def start_crawl() -> CrawlStartResponse:
    if crawler.is_running():
        raise HTTPException(status_code=409, detail="크롤링이 이미 실행 중입니다.")

    async with get_db() as db:
        async with db.execute(
            "SELECT MAX(round_no) AS m FROM lotto_results"
        ) as cur:
            row = await cur.fetchone()
    last = int(row["m"]) if row and row["m"] is not None else 0
    start_round = last + 1

    crawler.mark_pending(start_round)
    asyncio.create_task(crawler.run())

    return CrawlStartResponse(
        status="running",
        start_round=start_round,
        message=f"{start_round}회차부터 수집을 시작합니다.",
    )


@router.get("/crawl/status", response_model=CrawlStatus)
async def crawl_status() -> CrawlStatus:
    return crawler.status


@router.get("/results", response_model=ResultsPage)
async def list_results(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
) -> ResultsPage:
    offset = (page - 1) * page_size
    async with get_db() as db:
        async with db.execute(
            "SELECT COUNT(*) AS c FROM lotto_results"
        ) as cur:
            total_row = await cur.fetchone()
        async with db.execute(
            """
            SELECT round_no, draw_date, num1, num2, num3, num4, num5, num6, bonus,
                   total_sell_amount, first_win_amount, first_winner_count,
                   first_accum_amount, created_at
              FROM lotto_results
             ORDER BY round_no DESC
             LIMIT ? OFFSET ?
            """,
            (page_size, offset),
        ) as cur:
            rows = await cur.fetchall()

    return ResultsPage(
        total=int(total_row["c"]) if total_row else 0,
        page=page,
        page_size=page_size,
        items=[_row_to_result(r) for r in rows],
    )


@router.get("/results/{round_no}", response_model=LottoResult)
async def get_result(round_no: int) -> LottoResult:
    async with get_db() as db:
        async with db.execute(
            """
            SELECT round_no, draw_date, num1, num2, num3, num4, num5, num6, bonus,
                   total_sell_amount, first_win_amount, first_winner_count,
                   first_accum_amount, created_at
              FROM lotto_results
             WHERE round_no = ?
            """,
            (round_no,),
        ) as cur:
            row = await cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"{round_no}회차 데이터가 없습니다.")
    return _row_to_result(row)
