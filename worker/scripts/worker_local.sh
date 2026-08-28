#!/usr/bin/env bash
# 로컬(WSL) 워커 상시 기동·감시 스크립트.
#
# 왜 필요한가:
#   워커의 스케줄(APScheduler)은 **프로세스 안에** 산다. 즉 "크론을 건다" 는 것은
#   OS 크론에 수집 명령을 등록하는 일이 아니라 **워커 프로세스를 계속 살려두는 일**이다.
#   이 WSL 에는 systemd 가 없어(`/run/systemd/system` 없음) systemctl 로 상시화할 수
#   없다. 그래서 이 스크립트가 그 역할을 대신한다.
#
#   OS 크론에는 이 스크립트의 `start` 만 5분마다 걸어 둔다. start 는 **멱등**이라
#   이미 떠 있으면 아무것도 하지 않고, 죽어 있을 때만 되살린다. 결과적으로
#   프로세스 감시(supervisor) 역할을 크론이 대신한다.
#
# 사용법:
#   scripts/worker_local.sh start | stop | restart | status | logs
#
# 주의:
#   **워커는 반드시 1개다.** 잡 락이 프로세스 메모리에 있어 두 개가 뜨면 같은 잡이
#   중복 실행된다. 그래서 flock 으로 이 스크립트 자체의 동시 실행을 막고,
#   기동 전 헬스체크로 이미 떠 있는지 확인한다. uvicorn --workers 는 쓰지 않는다.

set -euo pipefail

# 크론은 PATH 가 빈약하다(/usr/bin:/bin). uv 는 /usr/local/bin 에 있어 그대로 두면
# 크론에서만 "uv: command not found" 로 조용히 실패한다.
export PATH="/usr/local/bin:/usr/bin:/bin:$HOME/.local/bin:$PATH"

WORKER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$WORKER_DIR/logs"
LOG_FILE="$LOG_DIR/worker.log"
PID_FILE="$LOG_DIR/worker.pid"
LOCK_FILE="$LOG_DIR/worker.lock"
MAX_LOG_BYTES=$((10 * 1024 * 1024))   # 10MB 넘으면 1세대만 회전한다

mkdir -p "$LOG_DIR"

# 포트는 .env_worker 가 정본이다(WORKER_PORT). 없으면 계약 기본값 8003.
# .env_worker 를 읽는 것은 프로그램이지 사람이 아니다 — 값도 화면에 찍지 않는다.
PORT="$(sed -n 's/^WORKER_PORT=\([0-9]\+\).*/\1/p' "$WORKER_DIR/.env_worker" 2>/dev/null | head -1)"
PORT="${PORT:-8003}"
HEALTH_URL="http://127.0.0.1:${PORT}/internal/health"

log() { echo "[$(date '+%F %T')] $*"; }

# 헬스 엔드포인트만이 "정말 살아 있는가" 를 말해 준다. PID 파일은 프로세스가
# 죽은 뒤에도 남고, 포트 리슨은 기동 중(DB ping 전)에도 잡히기 때문이다.
is_healthy() { curl -fsS --max-time 5 "$HEALTH_URL" >/dev/null 2>&1; }

rotate_log() {
  # 뉴스 잡이 매시간 돌아 로그가 꾸준히 쌓인다. 세대를 여럿 두지 않는 이유는
  # 이 로그가 장애 조사용 단기 기록이지 보존 대상이 아니기 때문이다.
  if [ -f "$LOG_FILE" ] && [ "$(stat -c%s "$LOG_FILE" 2>/dev/null || echo 0)" -gt "$MAX_LOG_BYTES" ]; then
    mv -f "$LOG_FILE" "$LOG_FILE.1"
  fi
}

do_start() {
  if is_healthy; then
    log "이미 떠 있다 (port ${PORT}). 아무것도 하지 않는다."
    return 0
  fi

  # 헬스는 실패했는데 프로세스가 남아 있는 경우 — 기동 도중이거나 좀비다.
  # 그대로 새로 띄우면 워커가 둘이 된다. 먼저 확실히 정리한다.
  if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    log "헬스는 실패했으나 프로세스가 남아 있다. 정리하고 다시 띄운다."
    do_stop
  fi

  rotate_log
  cd "$WORKER_DIR"

  # setsid 로 새 세션을 만들어 PID == PGID 가 되게 한다. uv 는 uvicorn 을 자식으로
  # 띄우므로 부모만 kill 하면 자식이 살아남아 포트를 물고 있다. 그룹째 죽여야 한다.
  # --no-sync: 크론이 도는 중에 의존성을 건드리지 않는다. 의존성 변경은 사람이 uv sync 한다.
  # 9>&- 로 flock fd 를 자식에게 물려주지 않는다. 이게 없으면 워커가 살아 있는 동안
  # 락이 계속 잡혀 있어(자식이 fd 를 상속하므로) 이후의 start/stop 호출이 전부
  # "다른 실행이 락을 쥐고 있다" 로 빠져나간다 — 감시 크론이 통째로 무력해진다.
  setsid nohup uv run --no-sync uvicorn worker.main:app \
      --host 127.0.0.1 --port "$PORT" \
      >> "$LOG_FILE" 2>&1 < /dev/null 9>&- &
  echo $! > "$PID_FILE"

  # DB 접속 확인(lifespan 의 ping)까지 마쳐야 헬스가 200 이다. 접속 불가면 워커는
  # 스스로 죽는다 — 그 경우 아래 루프가 실패로 끝나고 로그에 이유가 남는다.
  for _ in $(seq 1 20); do
    sleep 1
    if is_healthy; then
      log "기동 완료 — pid=$(cat "$PID_FILE") port=${PORT}"
      return 0
    fi
  done

  log "기동 실패. 마지막 로그 20줄:"
  tail -20 "$LOG_FILE" || true
  return 1
}

do_stop() {
  if [ ! -f "$PID_FILE" ]; then
    log "PID 파일이 없다. 이미 내려간 것으로 본다."
    return 0
  fi
  local pid; pid="$(cat "$PID_FILE")"
  if kill -0 "$pid" 2>/dev/null; then
    # 프로세스 그룹 전체에 TERM. uvicorn 이 lifespan 종료(스케줄러 shutdown)를 타게 둔다.
    kill -TERM -"$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
    for _ in $(seq 1 10); do
      sleep 1
      kill -0 "$pid" 2>/dev/null || break
    done
    # 그래도 살아 있으면 KILL. 잡이 실행 중이면 collect_job_log 에 running 행이
    # 남지만, 다음 기동의 cleanup_stale() 이 정리한다.
    kill -0 "$pid" 2>/dev/null && kill -KILL -"$pid" 2>/dev/null || true
    log "종료했다 (pid=$pid)"
  else
    log "pid=$pid 는 이미 죽어 있다."
  fi
  rm -f "$PID_FILE"
}

do_status() {
  if is_healthy; then
    echo "실행 중 — port ${PORT}"
    curl -fsS --max-time 5 "$HEALTH_URL" && echo
  else
    echo "내려가 있음 — port ${PORT} 응답 없음"
    return 1
  fi
}

cmd="${1:-start}"

case "$cmd" in
  logs)   tail -f "$LOG_FILE" ;;
  status) do_status ;;
  # start/stop/restart 는 상태를 바꾼다. 크론(5분)과 사람이 동시에 부를 수 있어
  # flock 으로 직렬화한다. -n: 이미 누가 잡고 있으면 기다리지 않고 그냥 빠진다.
  start|stop|restart)
    exec 9>"$LOCK_FILE"
    if ! flock -n 9; then
      log "다른 실행이 락을 쥐고 있다. 이번 호출은 건너뛴다."
      exit 0
    fi
    case "$cmd" in
      start)   do_start ;;
      stop)    do_stop ;;
      restart) do_stop; do_start ;;
    esac
    ;;
  *) echo "사용법: $0 {start|stop|restart|status|logs}" >&2; exit 2 ;;
esac
