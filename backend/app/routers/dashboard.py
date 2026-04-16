from fastapi import APIRouter

from ..database import get_db
from ..schemas import DashboardResponse, DashboardSummary, LottoResult

router = APIRouter(prefix="/api", tags=["dashboard"])


def _row_to_result(row) -> LottoResult:
    return LottoResult(
        round_no=row["round_no"],
        draw_date=row["draw_date"],
        numbers=[
            row["num1"], row["num2"], row["num3"],
            row["num4"], row["num5"], row["num6"],
        ],
        bonus=row["bonus"],
        total_sell_amount=row["total_sell_amount"],
        first_win_amount=row["first_win_amount"],
        first_winner_count=row["first_winner_count"],
        first_accum_amount=row["first_accum_amount"],
    )


@router.get("/dashboard", response_model=DashboardResponse)
async def get_dashboard() -> DashboardResponse:
    async with get_db() as db:
        async with db.execute(
            "SELECT COUNT(*) AS c, MAX(round_no) AS m FROM lotto_results"
        ) as cur:
            agg = await cur.fetchone()

        async with db.execute(
            """
            SELECT round_no, draw_date, num1, num2, num3, num4, num5, num6, bonus,
                   total_sell_amount, first_win_amount, first_winner_count,
                   first_accum_amount, created_at
              FROM lotto_results
             ORDER BY round_no DESC
             LIMIT 10
            """
        ) as cur:
            rows = await cur.fetchall()

        latest = rows[0] if rows else None

        async with db.execute(
            "SELECT MAX(finished_at) AS f FROM crawl_logs WHERE status='success'"
        ) as cur:
            log_row = await cur.fetchone()

    summary = DashboardSummary(
        total_count=int(agg["c"]) if agg and agg["c"] is not None else 0,
        latest_round=int(agg["m"]) if agg and agg["m"] is not None else None,
        latest_draw_date=latest["draw_date"] if latest else None,
        last_collected_at=log_row["f"] if log_row and log_row["f"] else None,
    )
    return DashboardResponse(
        summary=summary,
        recent=[_row_to_result(r) for r in rows],
    )
