"""Postgres 조회. DB 컬럼명이 이 파일 밖으로 나가지 않는다.

`draw_ymd` → `draw_date`, `first_prize_amt` → `first_win_amount` 같은 매핑은 전부
여기서 끝난다. 공개 API 가 DB 스키마에 결합되면 컬럼 하나를 정리할 때마다 프론트와
검색엔진에 노출된 JSON 이 함께 흔들린다
(docs/wiki/10-contracts/db-schema.md 의 매핑표, ADR 0010).

SELECT 만 있다. INSERT/UPDATE/DELETE 를 여기 추가하려는 충동이 들면 그것은 이 컴포넌트의
일이 아니다 — 롤이 거부하기도 하지만, 애초에 워커의 일이다.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from psycopg_pool import AsyncConnectionPool

from .domain.draw import Draw

KST = timezone(timedelta(hours=9))

# 회차 객체를 만드는 데 필요한 전부. `created_dttm`/`updated_dttm` 은 운영용 컬럼이라
# API 에 노출하지 않는다.
_DRAW_COLUMNS = """
    round_no, draw_ymd,
    winning_no1, winning_no2, winning_no3, winning_no4, winning_no5, winning_no6,
    bonus_no, total_sell_amt, first_prize_amt, first_winner_cnt, first_accum_prize_amt
"""


def _to_round(row: dict) -> dict:
    """DB 행 → API 회차 객체."""
    return {
        "round_no": row["round_no"],
        # date 를 그대로 넘기면 pydantic 이 ISO 로 직렬화한다. 문자열로 미리 굳히지 않는다.
        "draw_date": row["draw_ymd"],
        "numbers": [row[f"winning_no{i}"] for i in range(1, 7)],
        "bonus": row["bonus_no"],
        "first_win_amount": row["first_prize_amt"],
        "first_winner_count": row["first_winner_cnt"],
        "total_sell_amount": row["total_sell_amt"],
        "first_accum_amount": row["first_accum_prize_amt"],
    }


def _to_kst(dt: Optional[datetime]) -> Optional[datetime]:
    """timestamptz 를 KST 로 옮긴다.

    psycopg 는 서버 타임존(대개 UTC)의 aware datetime 을 준다. 그대로 직렬화하면
    `+00:00` 이 붙은 시각이 나가고, 프론트는 한국 시간으로 보이려고 다시 변환한다.
    변환 지점이 둘이면 언젠가 아홉 시간이 어긋난다. 여기서 한 번만 한다.
    """
    if dt is None:
        return None
    return dt.astimezone(KST)


async def _fetchall(pool: AsyncConnectionPool, sql: str, params: tuple = ()) -> list[dict]:
    async with pool.connection() as conn:
        cur = await conn.execute(sql, params)
        return await cur.fetchall()


async def _fetchone(pool: AsyncConnectionPool, sql: str, params: tuple = ()) -> Optional[dict]:
    async with pool.connection() as conn:
        cur = await conn.execute(sql, params)
        return await cur.fetchone()


# ── 회차 ────────────────────────────────────────────────────────────────


async def latest_round(pool: AsyncConnectionPool) -> Optional[dict]:
    row = await _fetchone(
        pool, f"SELECT {_DRAW_COLUMNS} FROM lotto_draw ORDER BY round_no DESC LIMIT 1"
    )
    return _to_round(row) if row else None


async def count_rounds(pool: AsyncConnectionPool) -> int:
    row = await _fetchone(pool, "SELECT count(*) AS c FROM lotto_draw")
    return int(row["c"]) if row else 0


async def list_rounds(pool: AsyncConnectionPool, *, page: int, size: int) -> list[dict]:
    """최신 회차가 먼저. 범위를 벗어난 page 는 빈 리스트다 — 목록의 끝은 오류가 아니다."""
    rows = await _fetchall(
        pool,
        f"SELECT {_DRAW_COLUMNS} FROM lotto_draw ORDER BY round_no DESC LIMIT %s OFFSET %s",
        (size, (page - 1) * size),
    )
    return [_to_round(r) for r in rows]


async def get_round(pool: AsyncConnectionPool, round_no: int) -> Optional[dict]:
    row = await _fetchone(
        pool, f"SELECT {_DRAW_COLUMNS} FROM lotto_draw WHERE round_no = %s", (round_no,)
    )
    return _to_round(row) if row else None


async def get_prize_tiers(pool: AsyncConnectionPool, round_no: int) -> list[dict]:
    """등위별 당첨정보. `lotto_prize` 는 당분간 비어 있어 거의 항상 빈 배열이다.

    2~5등 정보가 현재 수집 소스에 없다. 테이블과 이 함수가 미리 있는 이유는 응답 형태를
    지금 확정해 두기 위해서다 (docs/wiki/10-contracts/db-schema.md).
    """
    rows = await _fetchall(
        pool,
        """
        SELECT prize_grade_no, winner_cnt, game_prize_amt
          FROM lotto_prize
         WHERE round_no = %s
         ORDER BY prize_grade_no
        """,
        (round_no,),
    )
    return [
        {
            "rank": r["prize_grade_no"],
            "winner_count": r["winner_cnt"],
            "prize_per_game": r["game_prize_amt"],
        }
        for r in rows
    ]


async def all_draws(pool: AsyncConnectionPool) -> list[Draw]:
    """통계·예측용 전체 회차. round_no 오름차순.

    1,231행 × 정수 7개다. 페이징해 가며 부분 집계하는 것보다 전부 읽어 메모리에서 자르는
    편이 단순하고, 그 편이 window=all 과 window=20 을 같은 코드로 처리하게 한다.
    행이 수십만으로 늘면 그때 다시 생각한다 — 주당 한 행씩 늘어난다.
    """
    rows = await _fetchall(
        pool,
        """
        SELECT round_no, winning_no1, winning_no2, winning_no3,
               winning_no4, winning_no5, winning_no6, bonus_no
          FROM lotto_draw
         ORDER BY round_no ASC
        """,
    )
    return [
        Draw(
            round_no=r["round_no"],
            numbers=tuple(r[f"winning_no{i}"] for i in range(1, 7)),  # type: ignore[arg-type]
            bonus=r["bonus_no"],
        )
        for r in rows
    ]


# ── 뉴스 ────────────────────────────────────────────────────────────────


def _like_escape(term: str) -> str:
    """ILIKE 패턴에 넣을 사용자 입력을 리터럴로 만든다.

    이스케이프하지 않으면 사용자가 넣은 `%` 나 `_` 가 와일드카드로 해석돼, `%` 하나가
    전체 기사와 매치하는 등 검색 의미가 왜곡된다. 기본 ESCAPE 문자인 백슬래시를 먼저
    이스케이프하고 두 와일드카드를 막는다.
    """
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _news_where(keyword: Optional[str], since_days: Optional[int]) -> tuple[str, list]:
    """뉴스 조회 필터를 count 와 list 가 공유한다.

    total 이 '필터 적용 후' 건수여야 하므로(페이지네이션 봉투 규약), 두 쿼리가 반드시
    같은 WHERE 를 써야 한다. 한 곳에서 만들어 양쪽에 넘긴다.
    """
    clauses: list[str] = []
    params: list = []

    if keyword:
        # title·summary·keyword_list 중 하나라도 대소문자 무시 포함. keyword_list 는
        # text[] 라 unnest 해 각 원소를 검사한다.
        pattern = f"%{_like_escape(keyword)}%"
        clauses.append(
            "(title_nm ILIKE %s OR summary_desc ILIKE %s "
            "OR EXISTS (SELECT 1 FROM unnest(keyword_list) k WHERE k ILIKE %s))"
        )
        params += [pattern, pattern, pattern]

    if since_days is not None:
        # published_dttm 이 NULL 인 기사는 이 비교에서 자연히 빠진다 — 발행일을 모르는
        # 기사를 '최근 1주일' 에 넣을 근거가 없다.
        clauses.append("published_dttm >= now() - make_interval(days => %s)")
        params.append(since_days)

    where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
    return where, params


async def count_news(
    pool: AsyncConnectionPool,
    *,
    keyword: Optional[str] = None,
    since_days: Optional[int] = None,
) -> int:
    where, params = _news_where(keyword, since_days)
    row = await _fetchone(pool, f"SELECT count(*) AS c FROM lotto_news{where}", tuple(params))
    return int(row["c"]) if row else 0


async def list_news(
    pool: AsyncConnectionPool,
    *,
    page: int,
    size: int,
    keyword: Optional[str] = None,
    since_days: Optional[int] = None,
) -> list[dict]:
    """최신 기사가 먼저.

    `published_dttm` 이 NULL 인 기사를 뒤로 보내고(`NULLS LAST`), 같은 시각이면
    `news_id` 로 순서를 확정한다. 정렬이 불안정하면 페이지 경계에서 같은 기사가 두 번
    보이거나 아예 빠진다.
    """
    where, params = _news_where(keyword, since_days)
    rows = await _fetchall(
        pool,
        f"""
        SELECT news_id, title_nm, summary_desc, link_url, orig_link_url,
               provider_nm, published_dttm, keyword_list
          FROM lotto_news{where}
         ORDER BY published_dttm DESC NULLS LAST, news_id DESC
         LIMIT %s OFFSET %s
        """,
        (*params, size, (page - 1) * size),
    )
    return [
        {
            "id": r["news_id"],
            "title": r["title_nm"],
            "description": r["summary_desc"],
            "link": r["link_url"],
            "orig_link": r["orig_link_url"],
            "source": r["provider_nm"],
            "pub_date": _to_kst(r["published_dttm"]),
            "keywords": r["keyword_list"] or [],
        }
        for r in rows
    ]


# ── 사이트맵 ────────────────────────────────────────────────────────────


async def sitemap_entries(pool: AsyncConnectionPool) -> dict[str, list[dict[str, Any]]]:
    """프론트의 `app/sitemap.ts` 전용. 페이징이 없다 — 사이트맵은 전체를 한 번에 본다."""
    rounds = await _fetchall(
        pool, "SELECT round_no, draw_ymd FROM lotto_draw ORDER BY round_no ASC"
    )
    news = await _fetchall(
        pool, "SELECT news_id, published_dttm FROM lotto_news ORDER BY news_id ASC"
    )
    return {
        "rounds": [
            {"round_no": r["round_no"], "lastmod": r["draw_ymd"]} for r in rounds
        ],
        "news": [
            {"id": r["news_id"], "lastmod": _to_kst(r["published_dttm"])} for r in news
        ],
    }
