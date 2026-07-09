---
type: contract
title: "워커 잡 계약 — 스케줄과 수동 트리거"
description: "lotto·news 잡의 크론·락·수동 실행 엔드포인트와 X-Job-Key 인증"
tags: [contract, job, security]
owner: worker
status: stable
sources: ["backend/app/crawler.py", "backend/app/scheduler.py", "raw:작업지시서초안_보완.md#7.1"]
created: 2026-07-09
updated: 2026-07-09
---

# 워커 잡 계약

워커는 **잡(job)의 레지스트리**다. 잡은 이름을 가지며, 각자의 크론 스케줄과 락과 실행 이력을 갖는다. 실행 이력은 [[db-schema]] 의 `collect_job_log` 에 남는다.

워커는 이것 말고 아무것도 하지 않는다. HTML 을 렌더링하지 않고, 예측을 계산하지 않고, 공개 API 를 제공하지 않는다.

---

## 잡 목록

| `job_name` | 기본 크론 (KST) | 환경변수 | 하는 일 |
|-----------|----------------|---------|--------|
| `lotto` | `0 21 * * 6` (토 21:00) | `LOTTO_CRON` | 최신 회차 증분 수집 |
| `news` | `0 6,12,18 * * *` (일 3회) | `NEWS_CRON` | 복권 관련 뉴스 수집 |

**크론 문자열을 코드에 박지 않는다.** `env.sample` 에서 주입한다 ([[env-vars]]). 추첨 시각이 바뀌거나 뉴스 API 쿼터가 확인되면 재배포 없이 조정할 수 있어야 한다.

### `lotto` 잡

추첨은 매주 토요일 20:45 KST 다. 21:00 에 도는 이유는 추첨 직후 네이버 검색 위젯에 결과가 반영될 시간을 주기 위해서다.

증분 로직은 기존 `backend/app/crawler.py:61-66` 을 따른다. `MAX(round_no) + 1` 부터 시작해 회차를 하나씩 올려가며 가져오고, 소스가 데이터를 주지 않으면(= 아직 추첨되지 않은 회차) 정상 종료한다. 매 요청 사이에 2.0초 + 0~0.8초 지터를 둔다 — 봇 감지 완화 ([[dhlottery-blocked]]).

**실패 시 재시도**: 실패하면 `LOTTO_RETRY_DELAY_MIN`(기본 60분) 뒤에 다시 시도하며, `LOTTO_MAX_ATTEMPT`(기본 3) 회까지 한다. 기본값이면 21:00 · 22:00 · 23:00 이 된다. 추첨 결과가 위젯에 늦게 반영되는 경우가 있기 때문이다. 세 번 모두 실패하면 `collect_job_log.status_cd = 'failed'` 로 남기고 다음 주까지 기다리지 않는다 — 수동 트리거가 있다.

**재시도 시각을 "22:00, 23:00" 으로 박지 않는다.** `LOTTO_CRON` 을 바꾸면 재시도도 따라 움직여야 하므로 절대시각이 아니라 **상대시간**(몇 분 뒤)으로 표현한다. 구현은 APScheduler 의 `DateTrigger` 로 다음 시도를 예약하는 방식이다.

> 예약된 재시도는 **워커가 재시작되면 사라진다.** `DateTrigger` 가 메모리 잡스토어에만 있기 때문이다. 이것도 수동 트리거로 복구한다 — 잡스토어를 DB 로 옮기면 워커 1프로세스 전제와 락 설계를 다시 봐야 하고, 주 1회짜리 잡에 그만한 값어치가 없다.

**부분 성공을 기록한다.** 5회차를 커밋하고 6번째에서 실패하면 `collected_cnt = 5`, `status_cd = 'failed'` 다. 0 으로 적으면 이력이 거짓말을 한다. 이를 위해 잡 함수는 수집 건수를 반환값이 아니라 가변 객체(`JobProgress`)로 갱신한다 — 예외가 던져지는 순간 반환값은 사라지기 때문이다.

### `news` 잡

네이버 검색 API 로 복권 관련 뉴스를 가져온다 ([[naver-search-api]]).

**하루 3회는 잠정값이다.** 네이버 API 의 일일 호출 쿼터를 확인하지 못했다. 쿼터가 확인되면 이 값을 확정하고 이 페이지의 `status` 를 유지한 채 표를 갱신한다.

**키가 없을 때의 동작.** `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` 중 하나라도 비면:

- 워커는 **정상 기동한다.** `lotto` 잡은 키와 무관하므로 워커 전체를 막을 이유가 없다.
- `news` 잡을 **크론에 등록하지 않는다.** 등록해 두면 하루 3번 `failed` 행만 쌓인다.
- **수동 트리거는 여전히 받는다.** 레지스트리에 있으므로 `404` 가 아니라 `202` 를 준 뒤, 잡이 즉시 실패해 `collect_job_log` 에 "키가 없다" 는 이유를 남긴다. 조용히 성공하지 않는다 — 왜 뉴스가 안 들어오는지 이력만 보고 알 수 있어야 한다.

**중복 수집 방지.** 검색어(`NAVER_NEWS_QUERY`)별로 조회한 뒤 `link_url` 로 합치고, `INSERT ... ON CONFLICT (link_url) DO NOTHING` 으로 넣는다. `collected_cnt` 는 조회 건수가 아니라 **실제로 새로 들어간 행 수**(`rowcount` 합)다. 조회 건수를 세면 하루 3번 "50건 수집" 이라 보고하는데 실제 신규는 2건인 일이 벌어진다.

같은 기사가 '로또' 와 '복권' 양쪽에 걸리면 `keyword_list` 에 둘 다 담는다. 검색어별로 따로 INSERT 하면 두 번째가 `DO NOTHING` 으로 죽어 키워드가 하나만 남는다.

---

## 잡별 독립 락 ★

현행 `crawler.py:40` 은 인스턴스에 `asyncio.Lock()` **하나**를 두고 `run()` 전체를 감싼다. 잡이 하나뿐일 때는 옳았다.

**잡이 둘 이상이 되면 이 설계는 틀린다.** 로또 수집이 30초 걸리는 동안 뉴스 수집이 대기한다. 두 잡은 서로 다른 테이블에 쓰고 서로 다른 외부 API 를 부르므로 동시에 돌아도 아무 문제가 없다. 더 나쁜 것은 로또 잡이 재시도를 기다리며 잠들어 있으면 그 시간 내내 뉴스 잡이 막힌다는 점이다.

→ **잡 이름별로 락을 나눈다.** `dict[str, asyncio.Lock]`. 같은 잡의 중복 실행만 막는다.

**워커는 반드시 1 프로세스**여야 한다. 락이 프로세스 메모리 안에 있으므로 워커가 둘이면 같은 잡이 동시에 두 번 돈다. 여러 워커가 필요해지면 락을 Postgres 어드바이저리 락(`pg_try_advisory_lock`)으로 옮겨야 한다. 지금은 필요 없다.

### 함정: `409` 판정과 락 획득 사이에 `await` 을 넣지 않는다

`409` 는 `lock.locked()` 로 판정하고, 곧바로 `await lock.acquire()` 로 락을 잡는다. **이 두 줄 사이에 어떤 `await` 도 넣으면 안 된다.**

```python
lock = self._lock(job_nm)
if lock.locked():
    raise JobBusyError(job_nm)
await lock.acquire()          # ← 사이에 await 이 없어야 원자적이다
job_log_id = await job_log.start(...)   # 락을 쥔 뒤에 DB 를 만진다
```

`asyncio.Lock.acquire()` 는 락이 비어 있으면 이벤트 루프에 양보하지 않고 즉시 반환한다. 그래서 단일 이벤트 루프에서 위 두 줄은 원자적이다. 여기에 `await job_log.start(...)` 를 끼워 넣어 `run_id` 를 먼저 얻으려 하면, 그 `await` 에서 제어가 넘어가 **두 요청이 나란히 `409` 를 통과하고 같은 잡을 두 번 실행한다.** 락을 먼저 잡고 DB 를 나중에 만진다.

`job_log.start()` 가 실패하면 락을 **반드시 풀고** 예외를 올린다. 쥔 채 빠져나가면 재기동 전까지 그 잡이 영원히 `409` 를 낸다.

---

## 수동 트리거

```
POST /internal/jobs/{job_name}/run   → 202 { "run_id": 123, "job_name": "lotto" }   [X-Job-Key 필요]
GET  /internal/jobs/status           → 잡별 최근 실행 상태                            [X-Job-Key 필요]
GET  /internal/health                → 200 { "status": "ok" }                        [키 불필요]

Header: X-Job-Key: <WORKER_JOB_KEY>
```

**`/internal/health` 만 키를 요구하지 않는다.** 루프백에만 열려 있고 비밀을 담지 않으며, 컨테이너 헬스체크와 [[local-setup]] 의 스모크 테스트가 키 없이 호출한다. 나머지 둘은 키가 필요하다.

### 상태 코드

| 코드 | 조건 |
|------|------|
| `202` | 수락. 잡이 백그라운드에서 시작됨 |
| `401` | `X-Job-Key` 누락 또는 불일치 |
| `404` | 등록되지 않은 `job_name` |
| `409` | 해당 잡이 이미 실행 중 |

`202` 이지 `200` 이 아니다. 수집은 수십 초가 걸리므로 요청을 붙들지 않는다. 호출자는 `run_id` 를 받아 `/internal/jobs/status` 로 확인한다.

**`401` 이 `404` 보다 먼저 판정된다.** 키 검증을 잡 존재 확인보다 앞에 둔다. 그러지 않으면 키를 모르는 호출자가 `404` 와 `401` 의 차이만으로 어떤 잡 이름이 유효한지 알아낸다. 인증 실패는 "키가 없는지 틀린지" 도 구분해 알려주지 않는다.

**`404` 의 판정 기준은 잡 레지스트리**(`worker/worker/jobs/__init__.py` 의 `JOBS`)다. DB 제약이 아니다 — `collect_job_log.job_nm` 에 `CHECK` 를 걸지 않는 이유가 여기 있다. 잡 목록의 정본은 이 페이지와 그 레지스트리다.

### 보안

이 세 가지를 모두 지킨다. 하나라도 빠지면 나머지가 무의미하다.

**1. 상수 시간 비교.** 키 검증에 `==` 를 쓰지 않는다.

```python
import secrets
if not secrets.compare_digest(provided_key, settings.WORKER_JOB_KEY):
    raise HTTPException(401)
```

`==` 는 첫 불일치 바이트에서 즉시 반환하므로, 응답 시간을 재면 키를 한 바이트씩 알아낼 수 있다. 네트워크 지터에 묻힐 만큼 작은 차이지만, 방어 비용이 한 줄이라 안 할 이유가 없다.

**2. `127.0.0.1` 바인딩.** 워커 HTTP 서버는 루프백에만 붙는다. nginx 에 `/internal/*` 을 노출하지 않는다. 원격에서 실행해야 하면 SSH 터널을 쓴다.

```bash
ssh -L 8003:127.0.0.1:8003 user@server
curl -X POST -H "X-Job-Key: $KEY" http://127.0.0.1:8003/internal/jobs/lotto/run
```

**3. 빈 키로 기동하지 않는다.** `WORKER_JOB_KEY` 가 비어 있으면 워커는 **시작을 거부한다.** 빈 문자열끼리 비교하면 통과하기 때문이다. `openssl rand -hex 32` 로 생성한다.

**관리자 UI 를 만들지 않는다.** 요구된 것은 "특정 키를 붙여 호출하면 수동 동작" 이지 관리 화면이 아니다. 화면을 만들면 인증·세션·CSRF 가 따라오고, 그것들은 이 서비스가 로그인 없이 운영한다는 전제와 충돌한다.

---

## `collect_job_log` 기록 규약

모든 실행은 크론이든 수동이든 `collect_job_log` 에 한 행을 남긴다.

1. 시작할 때 `status_cd='running'`, `exec_type_cd` 를 `'cron'` 또는 `'manual'` 로 기록하고 `job_log_id` 를 받는다.
2. 끝나면 같은 행을 `status_cd='success'|'failed'`, `finished_dttm`, `collected_cnt`, `error_desc` 로 갱신한다.
3. **프로세스가 죽으면 `running` 인 행이 남는다.** 기동 시 `started_dttm` 이 6시간 이상 지난 `running` 행을 `failed` 로 정리한다. 이걸 하지 않으면 락은 풀렸는데 이력상 영원히 실행 중인 유령 행이 쌓인다.

---

## 기동 시 catch-up

워커가 재시작될 때, 마지막 성공한 `lotto` 잡이 `CATCH_UP_DAYS`(기본 7일)를 넘었으면 즉시 한 번 실행한다. 기존 `backend/app/scheduler.py:51-61` 의 동작을 유지한다. 서버가 토요일 밤에 꺼져 있었으면 회차를 통째로 놓치기 때문이다.

**성공 이력이 아예 없으면(빈 DB 최초 기동) 즉시 한 번 실행한다.** 이것도 기존 동작이다.

catch-up 은 **백그라운드로** 돈다. 기동(lifespan) 안에서 기다리면 수집이 끝날 때까지 `/internal/health` 가 응답하지 않아, 컨테이너 헬스체크가 워커를 죽인다.

`news` 잡은 catch-up 하지 않는다. 놓친 뉴스는 다음 주기에 어차피 검색된다.

---

## 이 계약이 지키는 경계

워커는 백엔드를 모르고, 백엔드는 워커를 모른다. 둘의 유일한 접점은 [[db-schema|Postgres 스키마]]다. 백엔드가 `/internal/jobs/*` 를 프록시하는 순간 이 경계가 무너지고, 공개 웹서버에 트리거가 노출된다.

관련: [[component-boundaries]] · [[db-schema]] · [[env-vars]] · [[naver-search-api]] · [[dhlottery-blocked]] · [[0004-manual-trigger-on-worker]]
