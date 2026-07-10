"""사이트맵 데이터.

프론트의 `app/sitemap.ts` 가 부른다. 이 엔드포인트가 따로 있는 이유는 프론트가
회차 목록 전체를 페이징으로 긁지 않게 하기 위해서다 — 1,231회차를 20개씩 62번
요청하는 사이트맵 생성은 빌드를 느리게 하고 백엔드를 괴롭힌다.

`sitemap.xml` 자체는 백엔드가 만들지 않는다. 도메인과 라우트 구조를 아는 쪽은 프론트다.
"""
from __future__ import annotations

from fastapi import APIRouter

from .. import repository as repo
from ..db import get_pool
from ..schemas import SitemapEntries

router = APIRouter(prefix="/api/meta", tags=["meta"])


@router.get("/sitemap-entries", response_model=SitemapEntries)
async def sitemap_entries() -> dict:
    return await repo.sitemap_entries(get_pool())
