# 🎱 로또 당첨번호 수집 시스템

동행복권 공식 API를 통해 로또 6/45 역대 당첨번호를 SQLite에 수집·관리하고,
FastAPI + React 대시보드로 수집 현황을 모니터링하는 시스템입니다.

---

## 📋 목차

1. [프로젝트 개요](#-프로젝트-개요)
2. [기술 스택](#-기술-스택)
3. [디렉토리 구조](#-디렉토리-구조)
4. [빠른 시작](#-빠른-시작)
5. [백엔드 상세](#-백엔드-상세)
6. [프론트엔드 상세](#-프론트엔드-상세)
7. [API 명세](#-api-명세)
8. [데이터베이스 스키마](#-데이터베이스-스키마)
9. [크롤링 로직](#-크롤링-로직)
10. [개발 가이드](#-개발-가이드)
11. [트러블슈팅](#-트러블슈팅)
12. [로드맵](#-로드맵)

---

## 🎯 프로젝트 개요

### 목적
- 동행복권 공식 API에서 로또 6/45 당첨번호를 증분 수집
- SQLite에 영구 저장하여 통계/분석 기반 데이터 확보
- 웹 대시보드로 수집 현황 모니터링 및 수동 실행

### 핵심 기능
- ✅ **증분 수집**: 마지막 저장 회차 이후만 자동으로 조회
- ✅ **동시 실행 방지**: `asyncio.Lock` + HTTP 409 응답
- ✅ **자동 재시도**: 네트워크 오류 시 최대 3회 재시도 (2초 간격)
- ✅ **요청 간 딜레이**: 0.3초 간격으로 서버 부하 방지
- ✅ **크롤링 로그**: 시작/종료/결과 이력 저장
- ✅ **실시간 진행 모니터링**: 프론트엔드 1초 폴링
- ✅ **로또볼 UI**: 번호 범위별 색상 구분

---

## 🛠 기술 스택

### Backend
| 구성 요소 | 버전 | 역할 |
|---------|-----|-----|
| Python | 3.10+ | 런타임 |
| uv | latest | 패키지/가상환경 관리 |
| FastAPI | ≥0.110 | 웹 프레임워크 |
| Uvicorn | ≥0.27 | ASGI 서버 |
| aiosqlite | ≥0.20 | 비동기 SQLite 드라이버 |
| httpx | ≥0.27 | 비동기 HTTP 클라이언트 |
| pydantic | ≥2.0 | 데이터 검증 |
| SQLite | 3.35+ | DB (WAL 모드) |

### Frontend
| 구성 요소 | 버전 | 역할 |
|---------|-----|-----|
| Node.js | 18+ | 런타임 |
| React | 18.3 | UI 라이브러리 |
| Vite | 5.4 | 빌드 도구 / dev 서버 |

---

## 📁 디렉토리 구조

```
bskim-lotto-prediction/
├── backend/                         # FastAPI 서버
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                  # FastAPI 앱 조립, CORS, lifespan
│   │   ├── config.py                # Settings (DB 경로, API URL, 딜레이 등)
│   │   ├── database.py              # aiosqlite 초기화 + get_db()
│   │   ├── models.py                # DDL (lotto_results, crawl_logs)
│   │   ├── schemas.py               # Pydantic 모델
│   │   ├── crawler.py               # LottoCrawler (싱글톤, 상태/락 관리)
│   │   └── routers/
│   │       ├── __init__.py
│   │       ├── dashboard.py         # GET /api/dashboard
│   │       └── crawl.py             # POST /api/crawl, GET status/results
│   ├── data/                        # SQLite DB 저장 (gitignored)
│   ├── pyproject.toml               # uv 프로젝트 설정
│   ├── uv.lock                      # 잠금 파일
│   ├── run.py                       # uvicorn 실행 엔트리
│   └── .gitignore
│
├── frontend/                        # Vite + React 대시보드
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js               # /api 프록시 설정 포함
│   ├── src/
│   │   ├── main.jsx                 # 엔트리
│   │   ├── App.jsx
│   │   ├── api.js                   # fetch 래퍼
│   │   ├── styles.css
│   │   └── components/
│   │       ├── Dashboard.jsx        # 메인 대시보드 (카드/테이블/폴링)
│   │       └── LottoBall.jsx        # 로또볼 컴포넌트 (색상 규칙)
│   └── .gitignore
│
├── work_order/
│   └── task1_collenct_number.md     # 작업지시서
└── README.md
```

---

## 🚀 빠른 시작

### 1. 백엔드 실행 (uv 기반)

[uv](https://github.com/astral-sh/uv)를 설치해주세요. ([설치 가이드](https://docs.astral.sh/uv/getting-started/installation/))

```bash
cd backend

# 의존성 설치 (.venv 자동 생성 + uv.lock 기반 재현 가능 빌드)
uv sync

# 서버 실행 (http://localhost:8002)
uv run python run.py
# 또는
uv run uvicorn app.main:app --port 8002 --reload
```

첫 실행 시 `backend/data/lotto.db`가 자동 생성되고 WAL 모드로 설정됩니다.

> **의존성 추가/삭제**
> ```bash
> uv add httpx
> uv remove pydantic
> ```

### 2. 프론트엔드 실행

```bash
cd frontend
npm install
npm run dev                  # http://localhost:1989
```

Vite dev 서버는 `/api/*` 요청을 `http://localhost:8002`으로 프록시합니다.

### 3. 초기 데이터 적재 (한 번만)

동행복권 공식 API가 현재 전 클라이언트 대상 302 리다이렉트로 차단된 상태이므로
GitHub 공개 SQLite 덤프를 1회 임포트합니다 (외부 요청 1건).

```bash
cd backend
uv run python -m scripts.seed_from_github
# → 약 1,200회차 일괄 적재 (~5초)
```

### 4. 동작 확인

브라우저에서 http://localhost:1989 접속 →
**🔄 크롤링 실행** 버튼 클릭 → 네이버 검색 위젯 소스로 누락된 최신 회차를 증분 수집.

> **데이터 소스 정책**
> - 역대 1~1204 회차: GitHub `happylie/lotto_data` 덤프 (1회 다운로드)
> - 그 이후 및 증분: 네이버 검색 위젯 (2초 + 지터, 매 주 1~2회만 실제 호출)

---

## ⚙️ 백엔드 상세

### 주요 설정값 (`app/config.py`)

| 설정 | 기본값 | 설명 |
|------|------|------|
| `DB_PATH` | `backend/data/lotto.db` | SQLite 파일 경로 |
| `DHLOTTERY_API_URL` | `https://www.dhlottery.co.kr/common.do` | 동행복권 API |
| `CRAWL_DELAY_SEC` | `0.3` | 요청 간 대기 시간 |
| `CRAWL_MAX_RETRY` | `3` | 네트워크 실패 시 재시도 횟수 |
| `CRAWL_RETRY_DELAY_SEC` | `2.0` | 재시도 간격 |
| `CRAWL_HTTP_TIMEOUT_SEC` | `10.0` | HTTP 타임아웃 |
| `CORS_ORIGINS` | `localhost:1989` | CORS 허용 오리진 |
| `HTTP_HEADERS` | UA/Accept | 동행복권 차단 회피용 헤더 |

### 프로세스 라이프사이클

```python
# main.py
@asynccontextmanager
async def lifespan(app):
    await init_db()    # 서버 기동 시 DB 스키마 확인/생성
    yield
```

### 크롤러 상태 머신

```
idle ─ POST /api/crawl ─▶ running ─ 완료 ─▶ success
                             │
                             └─ 예외/타임아웃 ─▶ failed
```

- `running` 상태에서 재요청 → `409 Conflict`
- `mark_pending()` 으로 race condition 방지 (태스크 생성 전 상태 선반영)

---

## 💻 프론트엔드 상세

### 컴포넌트 트리

```
App
└── Dashboard
    ├── Card × 3              # 총 수집 / 최종 수집일 / 최신 회차
    ├── CrawlStatusView       # 현재 크롤링 상태 텍스트
    └── 결과 테이블
        └── LottoBall × N     # 번호별 색상 구분 볼
```

### 로또볼 색상 규칙

| 번호 범위 | 색상명 | Hex |
|----------|-------|-----|
| 1 ~ 10   | 노란색 | `#FBC400` |
| 11 ~ 20  | 파란색 | `#69C8F2` |
| 21 ~ 30  | 빨간색 | `#FF7272` |
| 31 ~ 40  | 회색  | `#AAAAAA` |
| 41 ~ 45  | 초록색 | `#B0D840` |

보너스볼은 기본 색상 + 검은색 외곽선으로 구분.

### 크롤링 UX 플로우

1. 버튼 클릭 → `POST /api/crawl`
2. 버튼 비활성 + "수집 중..." 표시
3. `setInterval(1000)` → `GET /api/crawl/status` 폴링
4. `status !== 'running'` 시 폴링 중단 + 대시보드 리프레시
5. 에러 발생 시 상단에 빨간 배너 표시

페이지 로드 시에도 현재 상태를 먼저 조회해, 새로고침해도 진행 상태가 유지됩니다.

---

## 🌐 API 명세

Base URL: `http://localhost:8002`

### GET `/health`
서버 헬스체크.
```json
{"status": "ok"}
```

### GET `/api/dashboard`
요약 통계 + 최근 10건.
```json
{
  "summary": {
    "total_count": 1170,
    "latest_round": 1170,
    "latest_draw_date": "2026-04-11",
    "last_collected_at": "2026-04-14T18:31:33+09:00"
  },
  "recent": [
    {
      "round_no": 1170,
      "draw_date": "2026-04-11",
      "numbers": [3, 12, 18, 27, 35, 42],
      "bonus": 7,
      "total_sell_amount": 115340000000,
      "first_win_amount": 2500000000,
      "first_winner_count": 5,
      "first_accum_amount": 12500000000
    }
  ]
}
```

### POST `/api/crawl`
증분 크롤링 시작 (비동기).

- **202 Accepted** — 정상 시작
- **409 Conflict** — 이미 실행 중
```json
{
  "status": "running",
  "start_round": 1171,
  "message": "1171회차부터 수집을 시작합니다."
}
```

### GET `/api/crawl/status`
현재 크롤링 상태.
```json
{
  "status": "running",
  "start_round": 1171,
  "current_round": 1172,
  "collected_count": 1,
  "started_at": "2026-04-14T18:31:29+09:00",
  "finished_at": null,
  "error": null,
  "message": "1171회차부터 수집 시작"
}
```
`status` 값: `idle` | `running` | `success` | `failed`

### GET `/api/results?page=1&page_size=20`
페이징 조회. `page_size` 최대 200.
```json
{
  "total": 1170,
  "page": 1,
  "page_size": 20,
  "items": [ /* LottoResult[] */ ]
}
```

### GET `/api/results/{round_no}`
단일 회차 조회 (없으면 404).

---

## 🗄 데이터베이스 스키마

### `lotto_results`
| 컬럼 | 타입 | 설명 |
|------|-----|------|
| `round_no` | INTEGER PK | 회차 번호 |
| `draw_date` | TEXT | 추첨일 (`YYYY-MM-DD`) |
| `num1` ~ `num6` | INTEGER | 당첨번호 (오름차순) |
| `bonus` | INTEGER | 보너스번호 |
| `total_sell_amount` | INTEGER | 총 판매금액 |
| `first_win_amount` | INTEGER | 1등 상금 |
| `first_winner_count` | INTEGER | 1등 당첨자 수 |
| `first_accum_amount` | INTEGER | 1등 누적 금액 |
| `created_at` | TEXT | DB 삽입 시각 (KST ISO8601) |

인덱스: `idx_lotto_results_draw_date (draw_date)`

### `crawl_logs`
| 컬럼 | 타입 | 설명 |
|------|-----|------|
| `id` | INTEGER PK AUTO | 로그 ID |
| `started_at` | TEXT | 시작 시각 |
| `finished_at` | TEXT | 종료 시각 |
| `status` | TEXT | `success` / `failed` |
| `start_round` | INTEGER | 수집 시작 회차 |
| `end_round` | INTEGER | 마지막 성공 회차 |
| `collected_count` | INTEGER | 수집 건수 |
| `error_message` | TEXT | 오류 메시지 |

인덱스: `idx_crawl_logs_started_at (started_at DESC)`

---

## 🕷 크롤링 로직

### 증분 수집 플로우

```
[시작]
  ↓
DB에서 MAX(round_no) 조회 → last_round
  ↓
current = last_round + 1
  ↓
┌─→ GET https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo={current}
│     ↓
│   returnValue == "success" ?
│     ├─ YES → INSERT → current++ → 0.3초 대기 → ↑ 반복
│     └─ NO  → 수집 종료 (해당 회차 미추첨)
│
└─ 네트워크 에러 → 2초 대기 후 재시도 (최대 3회) → 실패 시 중단
  ↓
crawl_logs INSERT → [종료]
```

### 데이터 소스

| 소스 | 범위 | 필드 | 호출 방식 |
|-----|-----|------|---------|
| `happylie/lotto_data` GitHub SQLite | 1 ~ 1204회 | 회차/날짜/번호/보너스 | 최초 1회 다운로드 |
| 네이버 검색 위젯 | 1205 ~ 최신 & 증분 | 위 + 1등 당첨금 + 1등 당첨자수 | 주당 1~2건 |

> 금액 3종 중 **총 판매금액/누적 상금은 네이버 위젯에서 제공되지 않아 NULL**.
> 동행복권 API 복구 시 enrich 스크립트로 보강 가능.

### 동행복권 API 응답 예시 (참고 — 현재 차단 상태)

**성공 (`returnValue: "success"`)**
```json
{
  "returnValue": "success",
  "drwNo": 1170,
  "drwNoDate": "2026-04-11",
  "drwtNo1": 3, "drwtNo2": 12, "drwtNo3": 18,
  "drwtNo4": 27, "drwtNo5": 35, "drwtNo6": 42,
  "bnusNo": 7,
  "totSellamnt": 115340000000,
  "firstWinamnt": 2500000000,
  "firstPrzwnerCo": 5,
  "firstAccumamnt": 12500000000
}
```

**실패 (미추첨 회차)**
```json
{"returnValue": "fail"}
```

### 동시 실행 방지

```python
class LottoCrawler:
    def __init__(self):
        self._lock = asyncio.Lock()
        self._status = CrawlStatus(status="idle")

    def is_running(self) -> bool:
        return self._status.status == "running" or self._lock.locked()
```

POST `/api/crawl` 요청 시:
1. `is_running()` 체크 → True면 `409 Conflict` 반환
2. `mark_pending()` 로 상태 선반영 (race 방지)
3. `asyncio.create_task(crawler.run())` 로 백그라운드 실행

---

## 🔧 개발 가이드

### 테스트 실행 (curl)

```bash
# 헬스체크
curl http://localhost:8002/health

# 크롤링 시작
curl -X POST http://localhost:8002/api/crawl

# 진행 상태
curl http://localhost:8002/api/crawl/status

# 대시보드
curl http://localhost:8002/api/dashboard

# 페이징 결과
curl "http://localhost:8002/api/results?page=1&page_size=5"

# 단일 회차
curl http://localhost:8002/api/results/1170
```

### DB 초기화 (재수집)

```bash
rm backend/data/lotto.db*
# 서버 재시작 → init_db()가 새로 생성
```

### Swagger UI

FastAPI 자동 생성 API 문서:
- http://localhost:8002/docs (Swagger)
- http://localhost:8002/redoc (ReDoc)

### 프로덕션 빌드

```bash
# 프론트엔드 정적 빌드
cd frontend
npm run build                # dist/ 생성

# 백엔드 프로덕션 모드
cd backend
uv run uvicorn app.main:app --host 0.0.0.0 --port 8002 --workers 1
```

> ⚠️ `asyncio.Lock`은 프로세스 단위이므로 **워커는 반드시 1개**로 유지해야 합니다.
> 다중 워커가 필요하면 DB 기반 락으로 전환 필요.

---

## 🛠 트러블슈팅

### 1. 동행복권 API가 HTML을 반환 (`JSONDecodeError`)

**증상**
```
round N fetch failed: Expecting value: line 9 column 1 (char 8)
```

**원인**
- 동행복권 서버가 해외/비정상 IP로 판단하여 메인 페이지(`/`)로 302 리다이렉트
- User-Agent 누락 시 동일하게 거부됨

**해결**
- `config.HTTP_HEADERS` 에 User-Agent 포함되어 있음을 확인
- WSL/해외 IP 환경에서는 한국 VPN/프록시 또는 한국 서버에서 실행 필요

### 2. `409 Conflict` 반환

이미 크롤링이 실행 중입니다. `GET /api/crawl/status`로 진행 상태 확인 후 대기하세요.

### 3. `database is locked`

WAL 모드임에도 발생하면:
```bash
# WAL 체크포인트 강제 실행
sqlite3 backend/data/lotto.db "PRAGMA wal_checkpoint(TRUNCATE);"
```

### 4. 프론트엔드에서 CORS 에러

- Vite 프록시(`vite.config.js`)를 거쳐 접근하고 있는지 확인
- 직접 `http://localhost:8002`을 호출한다면 `config.CORS_ORIGINS`에 해당 오리진 추가

### 5. 포트 충돌

```bash
# 8002번 포트 점유 프로세스 확인
lsof -i :8002     # macOS/Linux
# 또는
ss -lntp | grep 8002
```

---

## 🗺 로드맵

### Phase 1 — 백엔드 코어 ✅
- [x] DB 설계 (lotto_results, crawl_logs, WAL)
- [x] 크롤러 (증분, 재시도, 딜레이, 락)
- [x] FastAPI 앱 구조 + CORS
- [x] 대시보드 API
- [x] 크롤링 실행/상태 API
- [x] 결과 조회 API (페이징/단건)

### Phase 2 — 프론트엔드 대시보드 ✅
- [x] 카드 요약 + 최근 10건 테이블
- [x] 로또볼 컴포넌트 (색상 규칙)
- [x] 크롤링 실행 UX + 폴링
- [x] 에러/상태 피드백

### Phase 3 — 확장 (예정)
- [ ] 번호 출현 빈도/연속/구간별 통계
- [ ] 통계 기반 번호 추천 알고리즘
- [ ] APScheduler 로 매주 자동 크롤링
- [ ] 전체 이력 검색/필터/CSV 내보내기
- [ ] 관리자 인증 (Phase 3 선택)

---

## 📝 참고사항

- **시간대**: 모든 시각은 KST (Asia/Seoul, UTC+9) 기준 ISO8601로 저장
- **번호 정렬**: 동행복권 API 응답의 `drwtNo1~6`은 이미 오름차순
- **서버 부하**: 0.3초 딜레이 필수 (과도한 요청 금지)
- **데이터 신뢰성**: 공식 소스이므로 데이터 정확도 보장
- **최초 수집 시간**: 약 1,170+ 회차 → 0.3초 × 1,170 ≈ **6분**

## 📄 라이선스

MIT
