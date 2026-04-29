"""SEO 라우트 — 동적 sitemap.xml 과 robots.txt 제공.

sitemap 은 정적(홈/소개/정책) + 동적(전체 회차 상세) URL 을 포함한다.
크롤러가 1,200+ 회차 페이지를 인덱싱할 수 있도록 해준다.

배포 시 `SITE_BASE_URL` 환경 변수 또는 요청 Host 헤더를 기준으로 도메인 조립.
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Request
from fastapi.responses import PlainTextResponse, Response

from ..database import get_db

router = APIRouter(tags=["seo"])

KST = timezone(timedelta(hours=9))


def _base_url(request: Request) -> str:
    env = os.getenv("SITE_BASE_URL")
    if env:
        return env.rstrip("/")
    # 요청 Host 기반 (dev/prod 모두 동작)
    scheme = request.url.scheme
    host = request.headers.get("host", "localhost")
    return f"{scheme}://{host}"


@router.get("/sitemap.xml")
async def sitemap(request: Request) -> Response:
    base = _base_url(request)
    today = datetime.now(KST).date().isoformat()

    # 정적 페이지
    static_urls = [
        (f"{base}/",         "weekly",  "1.0", today),
        (f"{base}/about",    "monthly", "0.5", today),
        (f"{base}/privacy",  "yearly",  "0.3", today),
        (f"{base}/terms",    "yearly",  "0.3", today),
    ]

    # 동적: 회차 상세 페이지 (전체)
    round_rows: list[tuple[int, str]] = []
    async with get_db() as db:
        async with db.execute(
            "SELECT round_no, draw_date FROM lotto_results ORDER BY round_no ASC"
        ) as cur:
            async for row in cur:
                round_rows.append((int(row["round_no"]), str(row["draw_date"])))

    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ]
    for loc, changefreq, priority, lastmod in static_urls:
        lines.append("  <url>")
        lines.append(f"    <loc>{loc}</loc>")
        lines.append(f"    <lastmod>{lastmod}</lastmod>")
        lines.append(f"    <changefreq>{changefreq}</changefreq>")
        lines.append(f"    <priority>{priority}</priority>")
        lines.append("  </url>")

    for round_no, draw_date in round_rows:
        lines.append("  <url>")
        lines.append(f"    <loc>{base}/round/{round_no}</loc>")
        lines.append(f"    <lastmod>{draw_date}</lastmod>")
        lines.append("    <changefreq>yearly</changefreq>")
        lines.append("    <priority>0.6</priority>")
        lines.append("  </url>")

    lines.append("</urlset>")
    return Response(content="\n".join(lines), media_type="application/xml")


@router.get("/robots.txt", response_class=PlainTextResponse)
async def robots(request: Request) -> str:
    base = _base_url(request)
    return (
        "User-agent: *\n"
        "Allow: /\n"
        "Disallow: /api/\n"
        "\n"
        f"Sitemap: {base}/sitemap.xml\n"
    )
