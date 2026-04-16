"""네이버 검색 위젯에서 로또 회차 정보를 파싱.

동행복권 공개 API가 차단된 상황에서 대체 소스로 사용.
- URL: https://search.naver.com/search.naver?query=로또 {N}회
- 파싱: 6개 당첨번호 + 보너스 1개 + 1등 당첨금 + 1등 당첨자 수 + 추첨일
- 없는 회차: balls가 6+1개 미만 또는 회차 컨텍스트 없음 → None 반환
"""
from __future__ import annotations

import re
from typing import Optional

import httpx

NAVER_URL = "https://search.naver.com/search.naver"

DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "ko-KR,ko;q=0.9",
    "Referer": "https://search.naver.com/",
}

# Tag 제거 + 공백 정규화
_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")

_BALL_RE = re.compile(r'class="ball\s+type\d"[^>]*>\s*(\d{1,2})')
_WIN_AMT_RE = re.compile(r"1등\s*당첨금[^0-9]{0,10}([0-9,]+)\s*원")
_WINNERS_RE = re.compile(r"1등\s*당첨자는\s*(?:총|모두)?\s*([0-9,]+)\s*명")
_WINNERS_ALT_RE = re.compile(r"당첨\s*복권수\s*([0-9,]+)\s*개")


def _clean(html: str) -> str:
    return _WS_RE.sub(" ", _TAG_RE.sub(" ", html))


def parse_html(round_no: int, html: str) -> Optional[dict]:
    """HTML에서 지정 회차 데이터를 추출. 없으면 None."""
    # 1) 6개 번호 + 1개 보너스
    balls = [int(n) for n in _BALL_RE.findall(html)]
    if len(balls) < 7:
        return None
    numbers, bonus = balls[:6], balls[6]

    # 2) 추첨일: 회차 컨텍스트와 함께 검증
    date_re = re.compile(
        rf"{round_no}\s*회차?\s*[(\[]?\s*(\d{{4}})[\.\-](\d{{1,2}})[\.\-](\d{{1,2}})"
    )
    md = date_re.search(html)
    if not md:
        # 위젯에 해당 회차가 없으면 실패 처리
        return None
    draw_date = f"{int(md.group(1)):04d}-{int(md.group(2)):02d}-{int(md.group(3)):02d}"

    text = _clean(html)

    # 3) 1등 당첨금(1인당)
    first_win_amount: Optional[int] = None
    mw = _WIN_AMT_RE.search(text)
    if mw:
        first_win_amount = int(mw.group(1).replace(",", ""))

    # 4) 1등 당첨자 수
    first_winner_count: Optional[int] = None
    wc = _WINNERS_RE.search(text) or _WINNERS_ALT_RE.search(text)
    if wc:
        first_winner_count = int(wc.group(1).replace(",", ""))

    return {
        "round_no": round_no,
        "draw_date": draw_date,
        "numbers": numbers,
        "bonus": bonus,
        "first_win_amount": first_win_amount,
        "first_winner_count": first_winner_count,
        # 총 판매금액은 네이버 위젯에 노출되지 않아 NULL
        "total_sell_amount": None,
        "first_accum_amount": None,
    }


async def fetch_round(
    client: httpx.AsyncClient, round_no: int, *, timeout: float = 10.0
) -> Optional[dict]:
    """네이버 검색 위젯에서 단일 회차 조회. 없으면 None."""
    resp = await client.get(
        NAVER_URL,
        params={"query": f"로또 {round_no}회"},
        timeout=timeout,
        follow_redirects=True,
    )
    resp.raise_for_status()
    return parse_html(round_no, resp.text)
