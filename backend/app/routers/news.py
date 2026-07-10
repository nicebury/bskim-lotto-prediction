"""복권 뉴스 목록.

`lotto_news` 는 워커의 `news` 잡이 네이버 API 키를 기다리는 동안 비어 있다. 그동안
이 엔드포인트는 빈 배열을 반환한다 — 404 가 아니다. 데이터가 없는 것과 자원이 없는
것은 다르다.
"""
from __future__ import annotations

from fastapi import APIRouter, Query

from .. import repository as repo
from ..db import get_pool
from ..schemas import NewsPage

router = APIRouter(prefix="/api", tags=["news"])


@router.get("/news", response_model=NewsPage)
async def list_news(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
) -> dict:
    pool = get_pool()
    total = await repo.count_news(pool)
    items = await repo.list_news(pool, page=page, size=size)
    return {"total": total, "page": page, "size": size, "items": items}
