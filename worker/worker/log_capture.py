"""잡 실행 중 발생한 경고·오류를 모아 collect_job_log 에 남긴다.

**왜 필요한가.** `error_desc` 는 잡을 죽인 마지막 예외 하나뿐이다. 그래서
죽지 않고 넘어간 문제가 아무 데도 안 남았다 — 채널명이 바뀌었다, LLM 판정이
실패해 규칙 결과를 썼다, 배치 하나를 건너뛰었다, 재시도 끝에 성공했다.
이런 것들은 터미널 로그에만 있고 스크롤과 함께 사라진다.

**왜 contextvars 인가.** 워커는 1프로세스지만 잡별 락이라 **여러 잡이 동시에
돈다**(video_channel 이 도는 동안 video_search 가 돌 수 있다). 전역 리스트에
모으면 두 잡의 로그가 섞여 이력이 거짓말을 한다.

`ContextVar` 는 asyncio 태스크마다 독립적으로 복사된다. `runner.execute()` 가
태스크 안에서 버퍼를 set 하면 그 잡의 await 체인 전체가 같은 버퍼를 보고,
다른 잡은 자기 버퍼를 본다. 락을 하나 더 두지 않고 격리가 된다.

계약: docs/wiki/10-contracts/db-schema.md 의 collect_job_log 절
"""
from __future__ import annotations

import contextvars
import logging
from datetime import datetime
from zoneinfo import ZoneInfo

KST = ZoneInfo("Asia/Seoul")

# 한 잡 실행이 남길 수 있는 최대 메시지 수. 재시도 루프가 폭주해도 DB 행이
# 무한정 커지지 않게 한다. 넘으면 뒤쪽을 버리고 마지막에 잘렸다는 표시를 넣는다 —
# 앞쪽을 버리면 '무엇이 처음 잘못됐는지' 를 잃는다. 그게 조사에서 가장 중요하다.
MAX_ENTRIES = 200

# 메시지 하나의 길이 상한. 예외 문자열에 HTML 응답 본문이 통째로 실려 오는
# 일이 있다(job_log.finish 가 error_desc 를 자르는 것과 같은 이유).
MAX_MSG_LEN = 1000

_buffer: contextvars.ContextVar[list[dict] | None] = contextvars.ContextVar(
    "job_log_buffer", default=None
)


class JobLogHandler(logging.Handler):
    """WARNING 이상을 현재 잡의 버퍼에 담는다.

    버퍼가 없으면(잡 실행 밖이면) 아무것도 하지 않는다. 기동 로그나 HTTP
    액세스 로그까지 DB 에 넣을 이유가 없다.

    ★ 이 핸들러는 예외를 밖으로 내지 않는다. 로깅이 잡을 죽이면 본말이 전도된다.
    """

    def emit(self, record: logging.LogRecord) -> None:
        buf = _buffer.get()
        if buf is None or record.levelno < logging.WARNING:
            return
        if len(buf) >= MAX_ENTRIES:
            return
        try:
            msg = record.getMessage()
            if record.exc_info:
                # 스택트레이스 전문은 넣지 않는다 — error_desc 에 예외 문자열이
                # 이미 있고, 여기 넣으면 행 하나가 수십 KB 가 된다.
                exc_type = record.exc_info[0]
                if exc_type is not None:
                    msg = f"{msg} [{exc_type.__name__}]"
            if len(msg) > MAX_MSG_LEN:
                msg = msg[:MAX_MSG_LEN] + "…(생략)"
            buf.append(
                {
                    "t": datetime.fromtimestamp(record.created, KST).isoformat(),
                    "lv": record.levelname,
                    "logger": record.name,
                    "msg": msg,
                }
            )
        except Exception:  # noqa: BLE001 — 로깅이 잡을 죽이면 안 된다
            pass


def install() -> None:
    """루트 로거에 핸들러를 한 번 붙인다. 기동 시 부른다.

    잡마다 붙였다 떼지 않는 이유: 여러 잡이 동시에 돌면 한쪽이 떼는 순간
    다른 쪽 캡처가 멈춘다. 핸들러는 상주시키고 **버퍼의 유무**로 켜고 끈다.
    """
    root = logging.getLogger()
    if any(isinstance(h, JobLogHandler) for h in root.handlers):
        return
    handler = JobLogHandler()
    handler.setLevel(logging.WARNING)
    root.addHandler(handler)


class capture:
    """잡 실행을 감싸 로그를 모은다.

        with capture() as buf:
            await job(...)
        # buf 에 그 잡의 경고·오류가 들어 있다

    컨텍스트 매니저가 토큰을 들고 있다가 reset 하므로 중첩돼도 안전하다.
    """

    def __init__(self) -> None:
        self.entries: list[dict] = []
        self._token: contextvars.Token | None = None

    def __enter__(self) -> list[dict]:
        self._token = _buffer.set(self.entries)
        return self.entries

    def __exit__(self, *exc_info) -> None:
        if self._token is not None:
            _buffer.reset(self._token)
        if len(self.entries) >= MAX_ENTRIES:
            self.entries.append(
                {
                    "t": datetime.now(KST).isoformat(),
                    "lv": "WARNING",
                    "logger": "worker.log_capture",
                    "msg": f"메시지가 {MAX_ENTRIES}건을 넘어 이후는 기록하지 않았다",
                }
            )
