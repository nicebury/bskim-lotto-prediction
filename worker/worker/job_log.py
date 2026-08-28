"""collect_job_log 기록 — 모든 잡 실행은 크론이든 수동이든 한 행을 남긴다.

기록 규약 (docs/wiki/10-contracts/worker-jobs.md):
  1. 시작할 때 status_cd='running' 으로 넣고 job_log_id 를 받는다.
  2. 끝나면 같은 행을 success|failed 로 갱신한다.
  3. 프로세스가 죽으면 running 인 행이 남는다 → 기동 시 정리한다.
"""
from __future__ import annotations

import json
import logging

from .config import settings
from .db import connect

logger = logging.getLogger(__name__)


async def start(job_nm: str, exec_type_cd: str) -> int:
    """running 행을 만들고 job_log_id 를 돌려준다.

    수동 트리거는 이 id 를 run_id 로 즉시 응답한다(202). 수집이 수십 초 걸리므로
    요청을 붙들지 않고, 호출자는 이 id 로 /internal/jobs/status 를 확인한다.
    """
    async with connect() as conn:
        cur = await conn.execute(
            """
            INSERT INTO collect_job_log (job_nm, exec_type_cd, status_cd)
            VALUES (%s, %s, 'running')
            RETURNING job_log_id
            """,
            (job_nm, exec_type_cd),
        )
        row = await cur.fetchone()
    assert row is not None  # RETURNING 은 항상 한 행을 준다
    return int(row["job_log_id"])


async def finish(
    job_log_id: int,
    status_cd: str,
    collected_cnt: int,
    error_desc: str | None = None,
    stat: dict | None = None,
    log_entries: list[dict] | None = None,
) -> None:
    """실행을 마감한다.

    실패해도 collected_cnt 를 0 으로 덮지 않는다 — 로또 잡이 5회차를 넣고
    6번째에서 죽었다면 5건은 실제로 커밋됐다. 0 으로 적으면 이력이 거짓말을 한다.

    error_desc 를 자른다: 예외 문자열에 HTML 응답 본문이 통째로 실려 오는 일이
    있다. text 컬럼이라 들어가긴 하지만 로그 테이블이 수 MB 로 부푼다.
    """
    if error_desc and len(error_desc) > 2000:
        error_desc = error_desc[:2000] + "…(생략)"

    # jsonb 컬럼에는 문자열로 넘긴다. psycopg 가 dict 를 자동 변환하지 않아
    # 그냥 넘기면 "can't adapt type 'dict'" 로 잡 마감 자체가 실패한다 —
    # 잡은 성공했는데 이력이 running 으로 굳는 최악의 형태가 된다.
    stat_json = json.dumps(stat, ensure_ascii=False) if stat else None
    log_json = json.dumps(log_entries, ensure_ascii=False) if log_entries else None

    async with connect() as conn:
        await conn.execute(
            """
            UPDATE collect_job_log
               SET status_cd     = %s,
                   finished_dttm = now(),
                   collected_cnt = %s,
                   error_desc    = %s,
                   stat_json     = %s::jsonb,
                   log_list      = %s::jsonb
             WHERE job_log_id    = %s
            """,
            (status_cd, collected_cnt, error_desc, stat_json, log_json, job_log_id),
        )


async def cleanup_stale() -> int:
    """기동 시 유령 'running' 행을 failed 로 정리한다.

    프로세스가 SIGKILL 되면 finish() 가 불리지 않아 running 행이 영원히 남는다.
    락은 프로세스 메모리에 있어 재기동과 함께 풀리는데, 이력만 '실행 중' 으로
    남으면 status 조회가 영원히 거짓을 보고한다.

    STALE_RUNNING_HOURS 를 넉넉히(기본 6시간) 잡는 이유: 실행 중인 잡을 오인해
    failed 로 덮으면 안 된다. 워커는 1프로세스이므로 기동 시점에 살아 있는 잡은
    없지만, 이 함수가 운영 중에 다시 불릴 가능성을 남겨 둔다.
    """
    async with connect() as conn:
        cur = await conn.execute(
            """
            UPDATE collect_job_log
               SET status_cd     = 'failed',
                   finished_dttm = now(),
                   error_desc    = '워커 프로세스가 종료되어 실행 상태를 잃었다(기동 시 정리)'
             WHERE status_cd     = 'running'
               AND started_dttm  < now() - make_interval(hours => %s)
            """,
            (settings.STALE_RUNNING_HOURS,),
        )
        cleaned = cur.rowcount
    if cleaned:
        logger.warning("유령 running 행 %d개를 failed 로 정리했다", cleaned)
    return cleaned


async def last_success_at(job_nm: str):
    """해당 잡의 마지막 성공 종료시각. 한 번도 성공한 적 없으면 None."""
    async with connect() as conn:
        cur = await conn.execute(
            """
            SELECT max(finished_dttm) AS t
              FROM collect_job_log
             WHERE job_nm = %s AND status_cd = 'success'
            """,
            (job_nm,),
        )
        row = await cur.fetchone()
    return row["t"] if row else None


async def recent_by_job() -> list[dict]:
    """잡별 최근 실행 1건.

    DISTINCT ON 은 Postgres 전용이지만, ix_collect_job_log_job_nm_started 인덱스
    (job_nm, started_dttm DESC)를 그대로 타서 정렬 없이 첫 행만 읽는다.
    """
    async with connect() as conn:
        cur = await conn.execute(
            """
            SELECT DISTINCT ON (job_nm)
                   job_log_id, job_nm, exec_type_cd, status_cd,
                   started_dttm, finished_dttm, collected_cnt, error_desc
              FROM collect_job_log
             ORDER BY job_nm, started_dttm DESC
            """
        )
        return list(await cur.fetchall())


async def cleanup_old() -> int:
    """보존 기간을 넘긴 이력을 지운다. 기동 시 부른다.

    log_list 가 실행마다 쌓이므로 방치하면 테이블이 계속 커진다 — news 잡만
    매시간 돌아 연 8,760행이다. 90일이면 계절성 문제를 되짚기에 충분하다.

    실패해도 기동을 막지 않는다(호출부에서 잡는다). 이력 정리가 안 되는 것보다
    워커가 안 뜨는 것이 나쁘다.
    """
    async with connect() as conn:
        cur = await conn.execute(
            """
            DELETE FROM collect_job_log
             WHERE started_dttm < now() - make_interval(days => %s)
            """,
            (settings.JOB_LOG_RETAIN_DAYS,),
        )
        removed = cur.rowcount
    if removed:
        logger.info(
            "%d일이 지난 잡 이력 %d행을 정리했다", settings.JOB_LOG_RETAIN_DAYS, removed
        )
    return removed


async def list_logs(
    *,
    job_nm: str | None = None,
    status_cd: str | None = None,
    limit: int = 50,
    before_id: int | None = None,
) -> list[dict]:
    """잡 이력을 최신순으로 조회한다. 관리자 화면과 /internal/jobs/logs 가 쓴다.

    커서 페이징(before_id)을 쓰는 이유: OFFSET 은 뒤로 갈수록 느려지고, 조회
    중에 새 행이 들어오면 경계에서 같은 행이 두 번 보이거나 빠진다. 잡 이력은
    끊임없이 추가되므로 그 상황이 항상이다.

    ix_collect_job_log_started (started_dttm DESC) 를 탄다.
    """
    where = ["1=1"]
    params: list = []
    if job_nm:
        where.append("job_nm = %s")
        params.append(job_nm)
    if status_cd:
        where.append("status_cd = %s")
        params.append(status_cd)
    if before_id:
        where.append("job_log_id < %s")
        params.append(before_id)
    params.append(min(max(limit, 1), 200))

    async with connect() as conn:
        cur = await conn.execute(
            f"""
            SELECT job_log_id, job_nm, exec_type_cd, status_cd,
                   started_dttm, finished_dttm, collected_cnt, error_desc,
                   stat_json, log_list,
                   EXTRACT(EPOCH FROM (coalesce(finished_dttm, now()) - started_dttm))::int
                       AS duration_sec
              FROM collect_job_log
             WHERE {' AND '.join(where)}
             ORDER BY job_log_id DESC
             LIMIT %s
            """,
            params,
        )
        return list(await cur.fetchall())


async def summary(days: int = 7) -> list[dict]:
    """잡별 최근 N일 요약. 관리자 화면 상단에 쓴다.

    '몇 번 돌아서 몇 건 모았고 몇 번 실패했나' 를 한눈에 본다.
    """
    async with connect() as conn:
        cur = await conn.execute(
            """
            SELECT job_nm,
                   count(*)                                          AS run_cnt,
                   count(*) FILTER (WHERE status_cd = 'success')     AS success_cnt,
                   count(*) FILTER (WHERE status_cd = 'failed')      AS failed_cnt,
                   count(*) FILTER (WHERE status_cd = 'running')     AS running_cnt,
                   coalesce(sum(collected_cnt), 0)                   AS collected_sum,
                   max(started_dttm)                                 AS last_started_dttm,
                   max(started_dttm) FILTER (WHERE status_cd = 'success') AS last_success_dttm
              FROM collect_job_log
             WHERE started_dttm >= now() - make_interval(days => %s)
             GROUP BY job_nm
             ORDER BY job_nm
            """,
            (days,),
        )
        return list(await cur.fetchall())
