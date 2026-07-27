"""복권 뉴스 목록.

`lotto_news` 는 워커의 `news` 잡이 네이버 API 키를 기다리는 동안 비어 있다. 그동안
이 엔드포인트는 빈 배열을 반환한다 — 404 가 아니다. 데이터가 없는 것과 자원이 없는
것은 다르다.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Query

from .. import repository as repo
from ..db import get_pool
from ..schemas import NewsPage

router = APIRouter(prefix="/api", tags=["news"])

# period → 최근 며칠. all 은 기간 제한 없음(None). 계약이 정한 허용값과 같은 목록을 쓴다.
# API 기본값은 all 이다 — 사이트맵·홈 등 기존 호출이 영향받지 않게 하기 위해서다.
# 화면(뉴스 페이지)의 기본값 1w 는 프론트가 명시적으로 붙인다.
_PERIOD_DAYS: dict[str, Optional[int]] = {
    "1w": 7,
    "2w": 14,
    "1m": 30,
    "3m": 90,
    "6m": 180,
    "all": None,
}


@router.get("/news", response_model=NewsPage)
async def list_news(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    keyword: Optional[str] = Query(
        None, description="제목·요약·키워드에 대소문자 무시 포함 검색"
    ),
    period: str = Query(
        "all",
        pattern=f"^({'|'.join(_PERIOD_DAYS)})$",
        description="pub_date 기준 최근 기간. 1w|2w|1m|3m|6m|all",
    ),
) -> dict:
    # 공백만 있는 keyword 는 필터로 치지 않는다 — 빈 검색과 같게 다룬다.
    kw = keyword.strip() if keyword else None
    kw = kw or None
    since_days = _PERIOD_DAYS[period]

    pool = get_pool()
    # count 와 list 는 같은 필터를 받아야 total 이 '필터 후 건수' 가 된다.
    total = await repo.count_news(pool, keyword=kw, since_days=since_days)
    items = await repo.list_news(
        pool, page=page, size=size, keyword=kw, since_days=since_days
    )
    return {"total": total, "page": page, "size": size, "items": items}
