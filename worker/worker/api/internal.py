"""/internal/* — 수동 트리거와 상태 조회.

상태 코드 계약 (docs/wiki/10-contracts/worker-jobs.md):
    202  수락. 잡이 백그라운드에서 시작됨
    401  X-Job-Key 누락 또는 불일치
    404  등록되지 않은 job_name
    409  해당 잡이 이미 실행 중
"""
from __future__ import annotations

import asyncio
import logging
import secrets

from fastapi import APIRouter, Depends, Header, HTTPException, status
from fastapi.responses import JSONResponse

from .. import job_log
from ..config import settings
from ..jobs import JobBusyError, JobNotFoundError, runner

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/internal", tags=["internal"])

# 실행 중인 백그라운드 태스크의 강한 참조. asyncio 는 태스크를 약참조로만
# 들고 있어, 지역변수가 사라지면 실행 도중에 수거될 수 있다.
_background_tasks: set[asyncio.Task] = set()


async def verify_job_key(x_job_key: str | None = Header(default=None)) -> None:
    """X-Job-Key 를 상수 시간으로 비교한다.

    `==` 를 쓰지 않는 이유: 첫 불일치 바이트에서 즉시 반환하므로, 응답 시간을 재면
    키를 한 바이트씩 알아낼 수 있다. 네트워크 지터에 묻힐 만큼 작은 차이지만
    방어 비용이 한 줄이라 안 할 이유가 없다.

    헤더가 없으면 빈 문자열과 비교한다. 빈 키로는 애초에 기동하지 않으므로
    (config.py 의 검증) 여기서 우연히 통과하는 일은 없다.
    """
    provided = x_job_key or ""
    if not secrets.compare_digest(provided, settings.WORKER_JOB_KEY):
        # 키가 틀렸는지 없는지 구분해 알려주지 않는다.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="X-Job-Key 불일치"
        )


@router.get("/health")
async def health() -> dict:
    """헬스체크. 키를 요구하지 않는다 — 루프백에만 열려 있고, 비밀이 없다."""
    return {"status": "ok"}


@router.post(
    "/jobs/{job_name}/run",
    dependencies=[Depends(verify_job_key)],
    status_code=status.HTTP_202_ACCEPTED,
)
async def run_job(job_name: str) -> JSONResponse:
    """잡을 백그라운드에서 시작하고 즉시 202 를 준다.

    200 이 아니라 202 인 이유: 수집은 수십 초가 걸린다. 요청을 붙들면 프록시나
    curl 타임아웃에 걸려, 잡은 계속 도는데 호출자는 실패로 안다.
    호출자는 run_id 를 받아 /internal/jobs/status 로 확인한다.

    ★ 인증(Depends)이 잡 존재 확인보다 먼저 돈다. 키가 틀린 호출자에게
      어떤 잡 이름이 유효한지 404/401 차이로 알려주지 않기 위해서다.
    """
    try:
        # start() 안에서 락 획득과 running 행 생성이 함께 일어난다.
        # 여기서 await 하는 이유: run_id 를 응답에 실어야 하고, 409 판정도
        # 응답 전에 끝나야 한다. 오래 걸리는 것은 잡 본체이지 이 부분이 아니다.
        job_log_id = await runner.start(job_name, "manual")
    except JobNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"등록되지 않은 잡: {job_name}",
        ) from None
    except JobBusyError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"{job_name} 잡이 이미 실행 중이다",
        ) from None

    # execute() 가 락 해제와 이력 마감을 책임진다. 예외를 밖으로 던지지 않으므로
    # 이 태스크는 조용히 죽지 않는다.
    task = asyncio.create_task(runner.execute(job_name, job_log_id))
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)

    logger.info("%s 잡 수동 트리거 — run_id=%d", job_name, job_log_id)
    return JSONResponse(
        status_code=status.HTTP_202_ACCEPTED,
        content={"run_id": job_log_id, "job_name": job_name},
    )


@router.get("/jobs/status", dependencies=[Depends(verify_job_key)])
async def jobs_status() -> dict:
    """잡별 최근 실행 상태.

    DB 의 이력과 프로세스의 락 상태를 함께 준다. 둘은 다를 수 있다 —
    프로세스가 죽으면 DB 에는 running 이 남지만 락은 풀려 있다.
    그 불일치를 감추지 않고 드러내는 편이 진단에 낫다.
    """
    recent = {r["job_nm"]: r for r in await job_log.recent_by_job()}

    jobs = []
    for job_nm in runner.job_names:  # 이력이 없는 잡도 보여준다
        last = recent.get(job_nm)
        jobs.append(
            {
                "job_name": job_nm,
                "running_now": runner.is_running(job_nm),
                "last_run": None
                if last is None
                else {
                    "run_id": last["job_log_id"],
                    "exec_type": last["exec_type_cd"],
                    "status": last["status_cd"],
                    "started_at": last["started_dttm"],
                    "finished_at": last["finished_dttm"],
                    "collected_count": last["collected_cnt"],
                    "error": last["error_desc"],
                },
            }
        )
    return {"jobs": jobs}
