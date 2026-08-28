"""잡 레지스트리와 **잡별 독립 락**.

전역 락 하나로 run() 전체를 감싸지 않는다. 잡이 하나뿐일 때는 그게 옳았지만,
로또 수집이 30초 걸리는 동안 뉴스 수집이 대기하게 된다. 두 잡은 서로 다른
테이블에 쓰고 서로 다른 외부 API 를 부르므로 동시에 돌아도 아무 문제가 없다.
더 나쁜 것은 로또 잡이 재시도를 기다리며 잠들어 있으면 그 시간 내내 뉴스 잡이
막힌다는 점이다.

→ dict[str, asyncio.Lock]. 같은 잡의 중복 실행만 막는다.

**워커는 반드시 1 프로세스여야 한다.** 락이 프로세스 메모리 안에 있으므로 워커가
둘이면 같은 잡이 동시에 두 번 돈다. 여러 워커가 필요해지면 락을 Postgres
어드바이저리 락(pg_try_advisory_lock)으로 옮겨야 한다. 지금은 필요 없다.

계약: docs/wiki/10-contracts/worker-jobs.md
"""
from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable

from .. import job_log
from ..log_capture import capture
from . import lotto, news, video_channel, video_refresh, video_search
from .progress import JobProgress

logger = logging.getLogger(__name__)

# 잡 이름 → 실행 함수. 이 dict 가 /internal/jobs/{job_name}/run 의 404 판정 기준이다.
# collect_job_log.job_nm 에 CHECK 를 걸지 않는 이유가 여기 있다 — 잡 목록의
# 정본은 DB 제약이 아니라 이 레지스트리와 worker-jobs.md 계약이다.
JOBS: dict[str, Callable[[JobProgress], Awaitable[None]]] = {
    "lotto": lotto.run,
    "news": news.run,
    # 영상은 잡이 셋이다. 쿼터 버킷(search.list 는 하루 100회 별도 버킷)·락·
    # 실패의 의미가 각각 다르기 때문이다 — 수집 실패는 "새 영상이 없다"지만
    # 갱신 실패는 "30일 초과 데이터가 남았다" 는 정책 위반이다.
    "video_channel": video_channel.run,
    "video_search": video_search.run,
    "video_refresh": video_refresh.run,
}


class JobNotFoundError(KeyError):
    """등록되지 않은 잡 이름 → HTTP 404."""


class JobBusyError(RuntimeError):
    """해당 잡이 이미 실행 중 → HTTP 409."""


class JobRunner:
    """잡 실행을 직렬화하고 collect_job_log 에 이력을 남긴다."""

    def __init__(self) -> None:
        self._locks: dict[str, asyncio.Lock] = {name: asyncio.Lock() for name in JOBS}

    @property
    def job_names(self) -> list[str]:
        """등록된 잡 이름. 이력이 없는 잡도 status 응답에 보여주기 위해 쓴다."""
        return list(JOBS)

    def is_registered(self, job_nm: str) -> bool:
        return job_nm in JOBS

    def is_running(self, job_nm: str) -> bool:
        return self._lock(job_nm).locked()

    def _lock(self, job_nm: str) -> asyncio.Lock:
        try:
            return self._locks[job_nm]
        except KeyError as exc:
            raise JobNotFoundError(job_nm) from exc

    async def start(self, job_nm: str, exec_type_cd: str) -> int:
        """락을 잡고 running 행을 만든다. job_log_id 를 돌려준다.

        락은 여기서 획득하고 execute() 가 놓는다. 두 함수를 반드시 짝지어 부른다 —
        start() 만 부르고 execute() 를 부르지 않으면 잡이 영원히 실행 중이 된다.

        ★ locked() 확인과 acquire() 사이에 await 이 없어야 한다.
          asyncio.Lock.acquire() 는 락이 비어 있으면 이벤트 루프에 양보하지 않고
          즉시 반환한다. 그래서 이 두 줄은 단일 이벤트 루프에서 원자적이다.
          사이에 `await job_log.start(...)` 같은 것을 끼워 넣는 순간, 두 요청이
          동시에 409 를 통과해 같은 잡을 두 번 실행한다.
        """
        lock = self._lock(job_nm)
        if lock.locked():
            raise JobBusyError(job_nm)
        await lock.acquire()

        try:
            return await job_log.start(job_nm, exec_type_cd)
        except Exception:
            # 로그 행을 못 만들었으면 잡을 시작하지 않는다. 락을 쥔 채 빠져나가면
            # 재기동 전까지 그 잡이 영원히 409 를 낸다.
            lock.release()
            raise

    async def execute(self, job_nm: str, job_log_id: int) -> bool:
        """잡 본체를 실행하고 이력을 마감한다. 성공 여부를 돌려준다.

        예외를 밖으로 던지지 않는다. 이 함수는 백그라운드 태스크로도 불리는데,
        거기서 예외가 나면 아무도 잡지 않아 'Task exception was never retrieved'
        경고만 남고 이력은 running 인 채로 굳는다.
        """
        progress = JobProgress()
        # capture 안에서 난 WARNING 이상을 전부 모아 log_list 에 남긴다.
        # error_desc 는 잡을 죽인 마지막 예외 하나뿐이라, 죽지 않고 넘어간
        # 문제(채널명 변경·LLM 판정 실패·배치 건너뜀)가 아무 데도 안 남았다.
        # contextvars 기반이라 동시에 도는 다른 잡의 로그와 섞이지 않는다.
        with capture() as entries:
            try:
                await JOBS[job_nm](progress)
            except Exception as exc:  # noqa: BLE001 — 잡의 모든 실패를 이력에 남긴다
                logger.exception("%s 잡 실패", job_nm)
                ok = False
                err: str | None = str(exc)
            else:
                ok = True
                err = None
            finally:
                self._lock(job_nm).release()

        # 마감은 capture 밖에서 한다 — 마감 중 오류가 자기 자신의 log_list 에
        # 들어가려다 이미 닫힌 버퍼를 건드리는 일을 피한다.
        try:
            await job_log.finish(
                job_log_id,
                "success" if ok else "failed",
                progress.collected,
                err,
                stat=progress.stat or None,
                log_entries=entries or None,
            )
        except Exception:  # noqa: BLE001 — 이력 기록 실패가 잡 결과를 뒤집지 않는다
            logger.exception("%s 잡 이력 마감 실패 (job_log_id=%d)", job_nm, job_log_id)

        if ok:
            logger.info("%s 잡 성공 — %d건 수집", job_nm, progress.collected)
        return ok

    async def run_now(self, job_nm: str, exec_type_cd: str) -> bool:
        """잡이 끝날 때까지 기다린다. 크론이 재시도 여부를 판단할 때 쓴다.

        수동 트리거(HTTP)는 이걸 쓰지 않는다 — 수집이 수십 초 걸리므로 요청을
        붙들지 않고 202 로 즉시 응답한다.
        """
        job_log_id = await self.start(job_nm, exec_type_cd)
        return await self.execute(job_nm, job_log_id)


runner = JobRunner()
