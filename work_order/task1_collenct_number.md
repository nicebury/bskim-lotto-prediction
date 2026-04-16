# 작업지시서: 로또 당첨번호 수집 시스템

## 1. 프로젝트 목적
동행복권 공식 API를 통해 로또 6/45 역대 당첨번호를 SQLite에 수집·관리하고,
FastAPI + React 기반 웹 대시보드로 수집 현황을 모니터링하는 시스템 구축.

---

## 2. Phase 구분

### Phase 1: 백엔드 코어 (우선 구현)
| 작업 | 상세 | 우선순위 |
|------|------|---------|
| DB 설계 | SQLite 테이블 생성 (lotto_results, crawl_logs) | P0 |
| 크롤러 구현 | 동행복권 API 호출, 증분 수집, 재시도, 딜레이 | P0 |
| FastAPI 서버 | 앱 구조, CORS, 라우터 분리 | P0 |
| 대시보드 API | GET /api/dashboard (요약 통계 + 최근 10건) | P0 |
| 크롤링 API | POST /api/crawl (비동기 실행 + 진행상태) | P0 |
| 결과 조회 API | GET /api/results (페이징), GET /api/results/{round} | P1 |

### Phase 2: 프론트엔드 대시보드
| 작업 | 상세 | 우선순위 |
|------|------|---------|
| 대시보드 화면 | 최종수집일, 수집갯수, 최근10건 테이블, 크롤링 버튼 | P0 |
| 크롤링 실행 UX | 버튼 → 로딩 → 진행률 → 완료 피드백 | P1 |
| 로또볼 UI | 번호별 색상 구분 (1~10:노랑, 11~20:파랑, ...) | P1 |

### Phase 3: 확장 (추후)
| 작업 | 상세 | 우선순위 |
|------|------|---------|
| 번호 통계 분석 | 출현 빈도, 연속번호, 구간별 분포 등 | P2 |
| 번호 예측/추천 | 통계 기반 번호 생성 | P2 |
| 스케줄링 | 매주 자동 크롤링 (APScheduler or cron) | P2 |
| 관리형 웹 확장 | 전체 이력 조회, 필터, 검색, 내보내기 | P2 |

---

## 3. 데이터 소스 상세

### 동행복권 공식 API
```
GET https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo={회차번호}
```

**성공 응답 (returnValue: "success")**
```json
{
  "returnValue": "success",
  "drwNo": 1170,
  "drwNoDate": "2025-04-12",
  "drwtNo1": 3,
  "drwtNo2": 12,
  "drwtNo3": 18,
  "drwtNo4": 27,
  "drwtNo5": 35,
  "drwtNo6": 42,
  "bnusNo": 7,
  "totSellamnt": 115340000000,
  "firstWinamnt": 2500000000,
  "firstPrzwnerCo": 5,
  "firstAccumamnt": 12500000000
}
```

**실패 응답 (존재하지 않는 회차)**
```json
{
  "returnValue": "fail"
}
```

### 참고: lotto.co.kr 미사용 사유
- lotto.co.kr은 JavaScript 동적 렌더링 → Selenium/Playwright 필요
- 동행복권 API는 단순 GET 요청 + JSON 응답 → httpx로 충분
- 공식 소스이므로 데이터 정확도 보장

---

## 4. 크롤링 상세 로직

### 4.1 증분 수집 플로우
```
[시작]
  ↓
DB에서 MAX(round_no) 조회 → last_round
  ↓
current = last_round + 1
  ↓
┌─→ API 호출: GET .../drwNo={current}
│     ↓
│   returnValue == "success"?
│     ├─ YES → DB INSERT → current++ → 0.3초 대기 → ↑ 반복
│     └─ NO  → 수집 종료 (해당 회차 미추첨)
│
└─ 네트워크 에러 → 최대 3회 재시도 → 실패 시 중단 + 로그
  ↓
[종료] crawl_logs 기록
```

### 4.2 최초 수집 (DB 비어있을 때)
- last_round = 0 → 1회차부터 최신까지 전체 수집
- 약 1,170+ 회차 → 0.3초 간격 → 약 6분 소요
- 프론트엔드에서 진행 상태 폴링 가능

### 4.3 주간 증분 수집
- last_round가 이미 있으면 (last_round + 1)부터 시작
- 보통 1~2건만 수집 → 즉시 완료

### 4.4 동시 실행 방지
- asyncio.Lock 사용
- 크롤링 중 POST /api/crawl 재호출 시 → 409 Conflict 반환

---

## 5. 백엔드 상세 설계

### 5.1 디렉토리 구조
```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py          # FastAPI app, 미들웨어, 이벤트 핸들러
│   ├── config.py        # Settings (DB_PATH, API_URL, DELAY 등)
│   ├── database.py      # get_db(), init_db(), async SQLite 연결
│   ├── models.py        # 테이블 DDL (raw SQL)
│   ├── schemas.py       # Pydantic: LottoResult, DashboardResponse, CrawlStatus
│   ├── crawler.py       # LottoCrawler 클래스
│   └── routers/
│       ├── __init__.py
│       ├── dashboard.py # GET /api/dashboard
│       └── crawl.py     # POST /api/crawl, GET /api/crawl/status, GET /api/results
├── requirements.txt
└── run.py
```

### 5.2 requirements.txt
```
fastapi>=0.110.0
uvicorn[standard]>=0.27.0
aiosqlite>=0.20.0
httpx>=0.27.0
pydantic>=2.0.0
```

### 5.3 Config 값
```python
DB_PATH = "data/lotto.db"
DHLOTTERY_API_URL = "https://www.dhlottery.co.kr/common.do"
CRAWL_DELAY_SEC = 0.3       # 요청 간 딜레이
CRAWL_MAX_RETRY = 3          # 실패 시 재시도 횟수
CRAWL_RETRY_DELAY_SEC = 2.0  # 재시도 대기
```

---

## 6. 프론트엔드 대시보드 명세

### 6.1 화면 구성

```
┌─────────────────────────────────────────────┐
│  🎱 로또 당첨번호 수집 시스템                    │
├─────────────────────────────────────────────┤
│                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐     │
│  │ 총 수집   │ │ 최종수집일 │ │ 최신 회차 │     │
│  │  1,170건  │ │ 2026-04-12│ │  1170회  │     │
│  └──────────┘ └──────────┘ └──────────┘     │
│                                              │
│  [🔄 크롤링 실행]  상태: 대기중                  │
│                                              │
│  ── 최근 당첨번호 ──────────────────────────── │
│  │ 회차  │ 추첨일     │ 당첨번호          │ 보너스│
│  │ 1170 │ 2026-04-11│ ③⑫⑱㉗㉟㊷      │  ⑦  │
│  │ 1169 │ 2026-04-04│ ...              │  ... │
│  │ ...  │ ...       │ ...              │  ... │
│  └───────────────────────────────────────── │
└─────────────────────────────────────────────┘
```

### 6.2 로또볼 색상 규칙
| 범위    | 색상   | Hex       |
|--------|--------|-----------|
| 1~10   | 노란색  | #FBC400   |
| 11~20  | 파란색  | #69C8F2   |
| 21~30  | 빨간색  | #FF7272   |
| 31~40  | 회색   | #AAAAAA   |
| 41~45  | 초록색  | #B0D840   |

### 6.3 크롤링 실행 UX 흐름
1. 버튼 클릭 → POST /api/crawl
2. 버튼 비활성화 + "수집 중..." 표시
3. 1초 간격으로 GET /api/crawl/status 폴링
4. 완료 시 → 대시보드 데이터 리프레시 + 성공 메시지

---

## 7. 주의사항 및 제약

1. **동행복권 서버 부하**: 0.3초 딜레이 필수, 과도한 요청 금지
2. **SSL 인증서**: dhlottery.co.kr은 SSL 필수, httpx 기본 설정으로 충분
3. **번호 정렬**: API 응답의 drwtNo1~6은 이미 오름차순
4. **시간대**: 모든 시간은 KST (Asia/Seoul) 기준 저장
5. **DB 동시 접근**: aiosqlite의 WAL 모드 활성화 권장
6. **최초 전체 수집**: 약 1,170+ 회차 → 6분+ 소요, 프론트에서 진행 표시 필요

---

## 8. 필요 스킬 (Claude Code)

| 스킬 | 용도 | 필수 여부 |
|------|------|---------|
| `frontend-design` | React 대시보드 UI 디자인 | 필수 |
| `auth-security` | 추후 관리자 인증 추가 시 | 선택 (Phase 3) |

---

## 9. 실행 환경

```bash
# 개발 환경
Python 3.11+
Node.js 18+
SQLite 3.35+ (WAL 모드)

# 포트
Backend:  http://localhost:8000
Frontend: http://localhost:5173
```

---

## 10. 작업 체크리스트

### Phase 1 체크리스트
- [ ] backend/app/config.py 작성
- [ ] backend/app/database.py - SQLite 초기화 (테이블 DDL)
- [ ] backend/app/schemas.py - Pydantic 모델
- [ ] backend/app/crawler.py - LottoCrawler 클래스
- [ ] backend/app/routers/dashboard.py - 대시보드 API
- [ ] backend/app/routers/crawl.py - 크롤링 실행/상태 API
- [ ] backend/app/main.py - FastAPI 조립
- [ ] backend/run.py - uvicorn 실행
- [ ] 크롤링 테스트 (1~10회차 수집 확인)
- [ ] API 테스트 (curl / httpie)

### Phase 2 체크리스트
- [ ] frontend 프로젝트 초기화 (Vite + React)
- [ ] Dashboard 컴포넌트 구현
- [ ] 로또볼 컴포넌트 (색상별)
- [ ] 크롤링 실행 + 폴링 UX
- [ ] CORS 연동 테스트
