"""네이버 검색 위젯에서 로또 회차 정보를 파싱한다.

동행복권 공식 API(`common.do?method=getLottoNumber`)가 전 클라이언트 대상으로
메인 페이지에 302 리다이렉트하는 상태라(2026-04 확인) 대체 소스로 쓴다.
공식 API 가 아니므로 위젯의 HTML 구조가 바뀌면 조용히 파싱이 깨진다 —
정규식은 `class="ball type\\d"` 에 의존한다.

배경과 복구 계획: docs/wiki/90-external/dhlottery-blocked.md
"""
from __future__ import annotations

import re

import httpx

NAVER_URL = "https://search.naver.com/search.naver"

# 브라우저 유사 헤더. 위젯은 봇으로 판단되면 다른 HTML 을 준다.
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

# 태그 제거 + 공백 정규화. 당첨금/당첨자수는 태그가 중간에 끼어 있어
# 원본 HTML 에 정규식을 걸면 매칭되지 않는다. 먼저 평문으로 만든다.
_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")

# 볼 7개. 앞 6개가 당첨번호, 7번째가 보너스다.
_BALL_RE = re.compile(r'class="ball\s+type\d"[^>]*>\s*(\d{1,2})')
_WIN_AMT_RE = re.compile(r"1등\s*당첨금[^0-9]{0,10}([0-9,]+)\s*원")
_WINNERS_RE = re.compile(r"1등\s*당첨자는\s*(?:총|모두)?\s*([0-9,]+)\s*명")
# 위젯이 문구를 바꿔 다는 경우가 있어 대체 패턴을 둔다.
_WINNERS_ALT_RE = re.compile(r"당첨\s*복권수\s*([0-9,]+)\s*개")


def _clean(html: str) -> str:
    return _WS_RE.sub(" ", _TAG_RE.sub(" ", html))


def parse_html(round_no: int, html: str) -> dict | None:
    """HTML 에서 지정 회차 데이터를 추출한다. 없으면 None.

    None 은 오류가 아니라 **아직 추첨되지 않은 회차**를 뜻한다.
    호출자(lotto 잡)는 None 을 받으면 증분 수집을 정상 종료한다.
    이 구분이 무너지면 파싱 실패를 '추첨 전' 으로 오인해 조용히 0건 수집하고
    성공으로 기록한다 — 그래서 예외와 None 을 섞지 않는다.
    """
    # 1) 볼 7개. 하나라도 모자라면 위젯에 결과가 아직 없는 것이다.
    balls = [int(n) for n in _BALL_RE.findall(html)]
    if len(balls) < 7:
        return None
    numbers, bonus = balls[:6], balls[6]

    # 2) 추첨일은 **요청한 회차와 같은 컨텍스트**에서만 읽는다.
    #    검색 결과 페이지에는 다른 회차의 날짜도 섞여 있다. 컨텍스트를 확인하지
    #    않으면 엉뚱한 회차의 날짜를 주워 담아, 번호는 1234회인데 날짜는 1233회인
    #    행이 만들어진다. uk_lotto_draw_draw_ymd 가 나중에야 그걸 잡는다.
    date_re = re.compile(
        rf"{round_no}\s*회차?\s*[(\[]?\s*(\d{{4}})[\.\-](\d{{1,2}})[\.\-](\d{{1,2}})"
    )
    md = date_re.search(html)
    if not md:
        return None
    draw_ymd = f"{int(md.group(1)):04d}-{int(md.group(2)):02d}-{int(md.group(3)):02d}"

    text = _clean(html)

    # 3) 1등 당첨금(1인당). 위젯에 없을 수 있으므로 None 을 허용한다.
    first_prize_amt: int | None = None
    if mw := _WIN_AMT_RE.search(text):
        first_prize_amt = int(mw.group(1).replace(",", ""))

    # 4) 1등 당첨자 수.
    first_winner_cnt: int | None = None
    if wc := (_WINNERS_RE.search(text) or _WINNERS_ALT_RE.search(text)):
        first_winner_cnt = int(wc.group(1).replace(",", ""))

    return {
        "round_no": round_no,
        "draw_ymd": draw_ymd,
        # 위젯은 이미 오름차순으로 주지만 정렬을 강제한다. ck_lotto_draw_ascending
        # 이 DB 에서 막아주긴 하나, 거기서 걸리면 잡 전체가 실패한다.
        "numbers": sorted(numbers),
        "bonus_no": bonus,
        "first_prize_amt": first_prize_amt,
        "first_winner_cnt": first_winner_cnt,
        # 위젯에 노출되지 않는 필드. 공식 API 가 복구되면 enrich 스크립트로 채운다.
        "total_sell_amt": None,
        "first_accum_prize_amt": None,
    }


async def fetch_round(
    client: httpx.AsyncClient, round_no: int, *, timeout: float
) -> dict | None:
    """단일 회차를 조회한다. 아직 추첨되지 않았으면 None.

    follow_redirects=True 가 필요하다 — 네이버가 검색어를 정규화하며 리다이렉트한다.
    HTTP 오류는 raise_for_status 로 올려 보낸다. 호출자가 재시도를 결정한다.
    """
    resp = await client.get(
        NAVER_URL,
        params={"query": f"로또 {round_no}회"},
        timeout=timeout,
        follow_redirects=True,
    )
    resp.raise_for_status()
    return parse_html(round_no, resp.text)
