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
        SELECT round_no, draw_ymd, winning_no1, winning_no2, winning_no3,
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
            draw_date=r["draw_ymd"],
        )
        for r in rows
    ]


async def round_index(pool: AsyncConnectionPool) -> list[dict]:
    """회차-날짜만 담은 경량 목록. round_no 오름차순, 페이징 없음.

    기간 조회 UI 가 회차를 고를 때 날짜를 함께 보여주려면 매핑 전체가 필요하다.
    `list_rounds` 는 당첨번호·당첨금까지 실어 무겁고, `sitemap_entries` 는 이름과 용도가
    사이트맵에 묶여 있다. 두 필드뿐이라 1,200건이어도 30KB 미만이다
    (docs/wiki/10-contracts/api-contract.md).
    """
    rows = await _fetchall(
        pool, "SELECT round_no, draw_ymd FROM lotto_draw ORDER BY round_no ASC"
    )
    return [{"round_no": r["round_no"], "draw_date": r["draw_ymd"]} for r in rows]


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


# ── 영상 ────────────────────────────────────────────────────────────────

# ★ 표시 조건. 계약이 백엔드에 **다시 걸라고** 요구하는 세 줄이다
# (docs/wiki/10-contracts/api-contract.md 의 '영상' 절).
#
# 워커가 수집 시점에 이미 걸렀는데도 백엔드가 또 거는 이유: 갱신 주기가 25일이라
# 그 사이에 비공개로 바뀌거나 임베드가 막힌 영상이 테이블에 남아 있을 수 있다. 그대로
# 내보내면 화면에 깨진 플레이어가 뜬다. `made_for_kids` 는 YouTube 정책 III.E.4.10 의
# 조회 의무와 직결된다.
#
# 이 세 컬럼은 **응답에 나가지 않는다.** WHERE 절 재료일 뿐이다.
_VIDEO_VISIBLE = (
    "privacy_status_cd = 'public' "
    "AND embeddable_cd = 'yes' "
    "AND made_for_kids_cd = 'no'"
)

# `link_url` 컬럼이 없는 것은 누락이 아니다. `provider_video_key` 에서 파생 가능하고,
# 파생값을 저장하면 두 곳이 어긋난다. URL 조립은 프론트가 한다
# (docs/wiki/10-contracts/db-schema.md).
_VIDEO_COLUMNS = """
    video_id, provider_video_key, title_nm, channel_nm, thumbnail_url,
    published_dttm, duration_sec, view_cnt, shorts_estimate_cd,
    round_no, game_cd, keyword_list
"""

# kind → shorts_estimate_cd 필터.
#
# ★ `'unknown'` 은 `normal` 에도 `shorts` 에도 들어가지 않는다. 쇼츠 판별에 공식 API
# 필드가 없어 재생시간·게시일로 **추정**한 값이고, 모르는 것을 어느 한쪽으로 밀면 그
# 순간 추정이 확정이 된다. `all` 에서만 보인다.
VIDEO_KINDS = ("all", "normal", "shorts")
_KIND_TO_SHORTS_CD: dict[str, Optional[str]] = {
    "all": None,
    "shorts": "likely",
    "normal": "unlikely",
}

VIDEO_GAMES = ("lotto", "pension")


def _video_where(
    kind: str, round_no: Optional[int], game: Optional[str]
) -> tuple[str, list]:
    """영상 조회 필터를 count 와 list 가 공유한다.

    `total` 이 '필터 적용 후' 건수여야 하므로 두 쿼리가 반드시 같은 WHERE 를 써야 한다
    (페이지네이션 봉투 규약). 한 곳에서 만들어 양쪽에 넘긴다 — `_news_where` 와 같은 이유다.
    """
    clauses: list[str] = [_VIDEO_VISIBLE]
    params: list = []

    shorts_cd = _KIND_TO_SHORTS_CD.get(kind)
    if shorts_cd is not None:
        clauses.append("shorts_estimate_cd = %s")
        params.append(shorts_cd)

    if game is not None:
        clauses.append("game_cd = %s")
        params.append(game)

    if round_no is not None:
        clauses.append("round_no = %s")
        params.append(round_no)

    return " WHERE " + " AND ".join(clauses), params


def _to_video(row: dict) -> dict:
    """DB 행 → API 영상 객체. 매핑표는 db-schema.md 에 있다."""
    return {
        "id": row["video_id"],
        "video_key": row["provider_video_key"],
        # 제목은 **원문 그대로** 내보낸다. 낱말을 바꾸지 않는다 — 남이 쓴 문장을 우리가
        # 고쳐 쓰면 그것은 더 이상 인용이 아니다
        # (docs/wiki/40-domain/forbidden-expressions.md 의 '외부에서 들어온 텍스트').
        "title": row["title_nm"],
        "channel": row["channel_nm"],
        "thumbnail": row["thumbnail_url"],
        "published_at": _to_kst(row["published_dttm"]),
        "duration_sec": row["duration_sec"],
        "views": row["view_cnt"],
        # ★ boolean 으로 바꾸지 않는다. 추정값을 확정으로 둔갑시키는 순간 프론트가
        # 그것을 사실로 표시한다. 문자열 3-값을 그대로 전달한다.
        "shorts_hint": row["shorts_estimate_cd"],
        "round": row["round_no"],
        "game": row["game_cd"],
        "keywords": row["keyword_list"] or [],
    }


async def count_videos(
    pool: AsyncConnectionPool,
    *,
    kind: str = "all",
    round_no: Optional[int] = None,
    game: Optional[str] = None,
) -> int:
    where, params = _video_where(kind, round_no, game)
    row = await _fetchone(
        pool, f"SELECT count(*) AS c FROM lotto_video{where}", tuple(params)
    )
    return int(row["c"]) if row else 0


async def list_videos(
    pool: AsyncConnectionPool,
    *,
    page: int,
    size: int,
    kind: str = "all",
    round_no: Optional[int] = None,
    game: Optional[str] = None,
) -> list[dict]:
    """최신 영상이 먼저.

    `published_dttm` 은 NOT NULL 이라 뉴스와 달리 `NULLS LAST` 가 필요 없다. 같은 시각이면
    `video_id` 로 순서를 확정한다 — 정렬이 불안정하면 페이지 경계에서 같은 영상이 두 번
    보이거나 아예 빠진다.
    """
    where, params = _video_where(kind, round_no, game)
    rows = await _fetchall(
        pool,
        f"""
        SELECT {_VIDEO_COLUMNS}
          FROM lotto_video{where}
         ORDER BY published_dttm DESC, video_id DESC
         LIMIT %s OFFSET %s
        """,
        (*params, size, (page - 1) * size),
    )
    return [_to_video(r) for r in rows]


async def get_video(pool: AsyncConnectionPool, video_id: int) -> Optional[dict]:
    """영상 하나. 표시 조건에 걸리면 **404 와 같게** None 이다.

    숨겨야 할 영상을 상세로는 볼 수 있게 두면 목록에서 거른 의미가 없다. 비공개로
    바뀐 영상의 URL 을 아는 사람이 그대로 열 수 있기 때문이다.
    """
    row = await _fetchone(
        pool,
        f"SELECT {_VIDEO_COLUMNS} FROM lotto_video WHERE video_id = %s AND {_VIDEO_VISIBLE}",
        (video_id,),
    )
    return _to_video(row) if row else None


# ── 운영자 전용: 수집 잡 이력 ────────────────────────────────────────────

# 요약이 보는 기간. 계약의 화면 구성이 "잡별 7일 요약" 이다.
JOB_LOG_SUMMARY_DAYS = 7

JOB_LOG_STATUSES = ("running", "success", "failed")


def _job_log_where(
    job_name: Optional[str], status: Optional[str], before_id: Optional[int]
) -> tuple[str, list]:
    """목록 필터. 커서(`before_id`)도 여기서 함께 만든다.

    `job_nm` 에 CHECK 가 없으므로(잡이 늘 때마다 마이그레이션을 강제하지 않으려는
    설계, docs/wiki/10-contracts/db-schema.md) 허용값 목록을 코드에 박지 않는다.
    받은 문자열을 그대로 비교한다 — 없는 잡 이름이면 빈 목록이 나올 뿐이다.
    """
    clauses: list[str] = []
    params: list = []

    if job_name:
        clauses.append("job_nm = %s")
        params.append(job_name)
    if status:
        clauses.append("status_cd = %s")
        params.append(status)
    if before_id is not None:
        # 커서는 **배타적**이다. 포함하면 다음 쪽의 첫 행이 이전 쪽의 마지막 행과
        # 겹쳐 화면에 같은 실행이 두 번 보인다.
        clauses.append("job_log_id < %s")
        params.append(before_id)

    where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
    return where, params


def _to_job_log(row: dict) -> dict:
    """DB 행 → API 잡 이력 객체.

    `stat`·`logs` 는 **`None` 일 수 있다.** 2026-08-28 이전 실행에는 두 컬럼이 없었다.
    빈 dict/list 로 바꾸지 않는다 — "단계 정보가 없는 실행" 과 "전부 0인 실행" 은 다르고,
    그 구분이 사라지면 화면이 0을 사실처럼 그린다.
    """
    started = _to_kst(row["started_dttm"])
    finished = _to_kst(row["finished_dttm"])
    # 아직 도는 잡은 소요를 알 수 없다. 지금까지 걸린 시간을 넣으면 화면이 그것을
    # 최종 소요로 읽는다 — 모르는 것은 null 로 둔다.
    duration = (
        int((finished - started).total_seconds())
        if started is not None and finished is not None
        else None
    )
    return {
        "run_id": row["job_log_id"],
        "job_name": row["job_nm"],
        "exec_type": row["exec_type_cd"],
        "status": row["status_cd"],
        "started_at": started,
        "finished_at": finished,
        "duration_sec": duration,
        "collected_count": row["collected_cnt"],
        "error": row["error_desc"],
        # 키가 잡마다 다르고 앞으로 늘어난다. 백엔드가 스키마를 강제하지 않는다 —
        # 워커가 단계를 추가해도 여기를 고치지 않아야 화면이 따라간다.
        "stat": row["stat_json"],
        "logs": row["log_list"],
    }


async def list_job_logs(
    pool: AsyncConnectionPool,
    *,
    limit: int,
    job_name: Optional[str] = None,
    status: Optional[str] = None,
    before_id: Optional[int] = None,
) -> list[dict]:
    """최신 실행이 먼저. **커서 페이징**이다.

    `OFFSET` 을 쓰지 않는 이유: 잡 이력은 조회하는 동안에도 계속 추가되므로, 두 번째
    쪽을 부를 때 앞쪽에 행이 끼어들면 경계에서 같은 행이 다시 보이거나 아예 건너뛴다.
    `job_log_id` 는 IDENTITY 라 단조 증가하므로 그 자체가 안정적인 커서다.
    """
    where, params = _job_log_where(job_name, status, before_id)
    rows = await _fetchall(
        pool,
        f"""
        SELECT job_log_id, job_nm, exec_type_cd, status_cd, started_dttm,
               finished_dttm, collected_cnt, error_desc, stat_json, log_list
          FROM collect_job_log{where}
         ORDER BY job_log_id DESC
         LIMIT %s
        """,
        (*params, limit),
    )
    return [_to_job_log(r) for r in rows]


async def job_log_summary(
    pool: AsyncConnectionPool, *, days: int = JOB_LOG_SUMMARY_DAYS
) -> list[dict]:
    """잡별 최근 N일 요약.

    ⚠ **목록의 필터를 여기에 적용하지 않는다.** 요약은 "지난 7일 전체가 어땠는가" 를
    말하는 것이고, 사용자가 실패만 보려고 필터를 걸었다고 해서 요약까지 실패만 세면
    "실패 3건 / 실행 3건" 이 되어 **전부 실패한 것처럼 보인다.**

    `last_success_at` 을 따로 세는 이유: 마지막 실행이 실패였을 때 "마지막으로 성공한
    것이 언제인가" 가 이 화면에서 가장 중요한 값이다. 워커가 33일 멈춰 있던 사고를
    그 값 하나로 알아챌 수 있다 (docs/wiki/log.md 2026-08-18).
    """
    rows = await _fetchall(
        pool,
        """
        SELECT job_nm,
               count(*)                                             AS run_cnt,
               count(*) FILTER (WHERE status_cd = 'success')         AS success_cnt,
               count(*) FILTER (WHERE status_cd = 'failed')          AS failed_cnt,
               count(*) FILTER (WHERE status_cd = 'running')         AS running_cnt,
               coalesce(sum(collected_cnt), 0)                       AS collected_sum,
               max(started_dttm)                                     AS last_started,
               max(started_dttm) FILTER (WHERE status_cd = 'success') AS last_success
          FROM collect_job_log
         WHERE started_dttm >= now() - make_interval(days => %s)
         GROUP BY job_nm
         ORDER BY job_nm
        """,
        (days,),
    )
    return [
        {
            "job_name": r["job_nm"],
            "run_cnt": int(r["run_cnt"]),
            "success_cnt": int(r["success_cnt"]),
            "failed_cnt": int(r["failed_cnt"]),
            "running_cnt": int(r["running_cnt"]),
            "collected_sum": int(r["collected_sum"]),
            "last_started_at": _to_kst(r["last_started"]),
            "last_success_at": _to_kst(r["last_success"]),
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
