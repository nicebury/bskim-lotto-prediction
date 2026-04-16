from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


class LottoResult(BaseModel):
    round_no: int
    draw_date: str
    numbers: list[int] = Field(..., min_length=6, max_length=6)
    bonus: int
    total_sell_amount: Optional[int] = None
    first_win_amount: Optional[int] = None
    first_winner_count: Optional[int] = None
    first_accum_amount: Optional[int] = None


class DashboardSummary(BaseModel):
    total_count: int
    latest_round: Optional[int] = None
    latest_draw_date: Optional[str] = None
    last_collected_at: Optional[str] = None


class DashboardResponse(BaseModel):
    summary: DashboardSummary
    recent: list[LottoResult]


CrawlState = Literal["idle", "running", "success", "failed"]


class CrawlStatus(BaseModel):
    status: CrawlState
    start_round: Optional[int] = None
    current_round: Optional[int] = None
    collected_count: int = 0
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    error: Optional[str] = None
    message: Optional[str] = None


class CrawlStartResponse(BaseModel):
    status: CrawlState
    start_round: int
    message: str


class ResultsPage(BaseModel):
    total: int
    page: int
    page_size: int
    items: list[LottoResult]
