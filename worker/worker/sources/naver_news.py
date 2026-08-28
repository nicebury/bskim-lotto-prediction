"""네이버 검색 API (뉴스).

`naver_widget` 과 달리 **공식 오픈 API** 다. 인증 키가 필요하다.

원문을 저장하지 않는다. 제목·요약·출처·발행일·링크만 가져온다. `description` 은
네이버가 주는 요약문이지 기사 원문이 아니다. 원문을 저장하면 저작권 문제가 생긴다.

일일 호출 쿼터는 **25,000 회**다(2026-07-09 사용자 확인). 매시간 × 검색어 2개 =
하루 48회로 0.2% 만 쓴다. 쿼터를 모르던 시절 보수적으로 잡은 백오프는 그대로 둔다 —
여유가 커진 것이지 429 가 사라진 것은 아니다.

⚠ **재배포 약관은 여전히 미확인**이다. 이것이 과거 기사 백필을 막고 있다.
docs/wiki/90-external/naver-search-api.md 참조.
"""
from __future__ import annotations

import asyncio
import html
import logging
import re
from datetime import datetime
from email.utils import parsedate_to_datetime

import httpx

logger = logging.getLogger(__name__)

NEWS_API_URL = "https://openapi.naver.com/v1/search/news.json"

# 네이버는 검색어 강조용 <b> 태그를 title/description 에 섞어 보낸다.
_TAG_RE = re.compile(r"<[^>]+>")


def _clean_text(raw: str) -> str:
    """<b> 강조 태그를 벗기고 HTML 엔티티를 되돌린다.

    두 단계 모두 필요하다. 태그만 벗기면 `&quot;` `&amp;` 가 그대로 남아
    프론트에 원문 그대로 노출된다. 순서도 중요하다 — 엔티티를 먼저 풀면
    `&lt;b&gt;` 가 진짜 태그가 되어 다음 단계에서 지워진다.
    """
    return html.unescape(_TAG_RE.sub("", raw)).strip()


def _parse_pub_date(raw: str) -> datetime | None:
    """pubDate 는 RFC 2822 형식이다 — `Mon, 06 Jul 2026 12:00:00 +0900`.

    파싱에 실패해도 기사를 버리지 않는다. published_dttm 은 NULL 허용이고,
    발행일 하나 때문에 수집 전체를 실패시킬 이유가 없다.
    """
    try:
        return parsedate_to_datetime(raw)
    except (TypeError, ValueError):
        logger.warning("pubDate 파싱 실패, NULL 로 저장한다: %r", raw)
        return None


def extract_keywords(title: str, summary: str, queries: list[str]) -> list[str]:
    """제목·요약에 실제로 등장한 검색어만 키워드로 남긴다.

    형태소 분석을 하지 않는다. 그건 kiwipiepy 를 부르고, 워커는 ML 의존을
    들이지 않는다는 것이 이 컴포넌트를 분리한 이유다. 검색어 자체가 이미
    '로또' '복권' 이라 단순 포함 검사로 충분하다.
    """
    haystack = f"{title} {summary}"
    return [q for q in queries if q in haystack]


async def fetch_news(
    client: httpx.AsyncClient,
    *,
    query: str,
    display: int,
    client_id: str,
    client_secret: str,
    timeout: float,
    max_retry: int,
    backoff_base_sec: float,
) -> list[dict]:
    """한 검색어에 대한 최신 뉴스를 가져온다.

    재시도 정책:
      * 429(쿼터 초과) / 5xx  → 지수 백오프 후 재시도. 일시적일 수 있다.
      * 401 / 403             → 즉시 포기. 키가 틀린 것이라 재시도해도 같다.
                                재시도하면 쿼터만 태운다.
      * 그 외 4xx             → 즉시 포기. 요청이 잘못된 것이다.
    """
    headers = {
        "X-Naver-Client-Id": client_id,
        "X-Naver-Client-Secret": client_secret,
    }
    params = {"query": query, "display": display, "sort": "date"}

    last_exc: Exception | None = None
    for attempt in range(1, max_retry + 1):
        try:
            resp = await client.get(
                NEWS_API_URL, params=params, headers=headers, timeout=timeout
            )
            if resp.status_code in (401, 403):
                # 본문에 키가 실릴 일은 없지만, 상태코드만 올린다.
                raise RuntimeError(
                    f"네이버 검색 API 인증 실패 ({resp.status_code}). "
                    "NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 을 확인한다."
                )
            if resp.status_code == 429 or resp.status_code >= 500:
                resp.raise_for_status()
            resp.raise_for_status()
            return _to_items(resp.json(), query)

        except RuntimeError:
            # 인증 실패는 재시도 대상이 아니다. 그대로 올린다.
            raise
        except Exception as exc:  # noqa: BLE001 — 네트워크/파싱 오류를 한데 묶는다
            last_exc = exc
            if attempt < max_retry:
                # 지수 백오프: 2s, 4s, 8s ... 쿼터를 모르는 상태에서 촘촘히
                # 두드리면 그날 남은 호출을 전부 태운다.
                delay = backoff_base_sec * (2 ** (attempt - 1))
                logger.warning(
                    "뉴스 조회 실패 (%d/%d), %.1f초 후 재시도: %s",
                    attempt, max_retry, delay, exc,
                )
                await asyncio.sleep(delay)

    raise RuntimeError(
        f"뉴스 조회가 {max_retry}회 재시도 후에도 실패했다 (query={query!r}): {last_exc}"
    )


def _to_items(payload: dict, query: str) -> list[dict]:
    """API 응답을 lotto_news 컬럼 이름으로 옮긴다.

    link_url 이 없는 항목은 버린다 — NOT NULL 이고, 중복 제거의 유일한 키다.
    """
    items: list[dict] = []
    for raw in payload.get("items", []):
        link_url = (raw.get("link") or "").strip()
        if not link_url:
            continue
        title_nm = _clean_text(raw.get("title", ""))
        summary_desc = _clean_text(raw.get("description", ""))
        if not title_nm:
            continue
        items.append(
            {
                "title_nm": title_nm,
                "summary_desc": summary_desc or None,
                "link_url": link_url,
                "orig_link_url": (raw.get("originallink") or "").strip() or None,
                "provider_nm": "naver",
                "published_dttm": _parse_pub_date(raw.get("pubDate", "")),
                # 키워드는 호출자가 전체 검색어 목록으로 다시 계산한다.
                # 여기서는 이 응답을 낳은 검색어만 확실히 넣어 둔다.
                "keyword_list": [query],
            }
        )
    return items
