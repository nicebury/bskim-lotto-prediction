# CLAUDE.md

이 저장소를 작업할 때 Claude 가 참고해야 할 프로젝트 규약/맥락 요약.

---

## 프로젝트 개요

**로또 6/45 당첨번호 수집·조회·예측 대시보드**

- 역대 1,200+ 회차 데이터를 SQLite에 수집해 웹 대시보드로 조회/통계/예측 제공
- 동행복권 공식 API 가 **현재 차단 상태** (2026-04 기준, 모든 `.do` 경로가 `/errorPage` 로 리다이렉트) → **네이버 검색 위젯**을 대체 소스로 사용
- 예측은 통계/몬테카를로 기반 (ML 아님, 재미 목적)

---

## 기술 스택

| 계층 | 선택 | 비고 |
|-----|------|------|
| Backend | FastAPI + uv + aiosqlite + numpy + httpx + kiwipiepy + sentence-transformers + chromadb | Python 3.10+, `pyproject.toml` + `uv.lock` |
| Frontend | Vite + React 18 (plain JSX, **TS 아님**) | 단일 페이지, `/api` 프록시 사용 |
| DB | SQLite (`journal_mode=DELETE`) | WSL/NTFS 호환 위해 WAL 미사용 |
| 크롤링 | 네이버 검색 위젯 HTML regex 파싱 | 2초 + 지터로 봇 감지 완화 |
| 예측 | 4-모듈 앙상블 + 몬테카를로 | numpy 단일 외부 의존 |

---

## 디렉토리 구조

```
backend/
├── app/
│   ├── main.py                FastAPI 조립, CORS, lifespan
│   ├── config.py              포트/DB/크롤 설정 (단일 출처)
│   ├── database.py            aiosqlite 초기화 (DELETE journal mode)
│   ├── models.py              테이블 DDL (raw SQL)
│   ├── schemas.py             Pydantic 모델
│   ├── naver_source.py        네이버 검색 위젯 파서
│   ├── crawler.py             LottoCrawler (싱글톤 + asyncio.Lock)
│   ├── prediction/
│   │   ├── config.py          가중치/시뮬레이션 설정
│   │   ├── analyzer/
│   │   │   ├── frequency.py   전체 빈도
│   │   │   ├── delay.py       지연 번호
│   │   │   ├── hot_cold.py    최근 N회차 가중 빈도
│   │   │   └── pattern.py     홀짝/고저/연속/합산/끝자리 분포
│   │   ├── ensemble.py        4-모듈 가중 합산
│   │   ├── montecarlo.py      확률 가중 추출 + 패턴 필터
│   │   ├── predictor.py       오케스트레이터 (sqlite3 stdlib 사용)
│   │   └── strategies/        대체 전략 5종 (궁합/구간/부활/황금/랜덤)
│   ├── dream/                 꿈 → 로또 (reg_lotto 포팅)
│   │   ├── analyzer.py        kiwipiepy 형태소 분석
│   │   ├── searcher.py        ChromaDB + SentenceTransformer
│   │   ├── generator.py       3-세트 조합 생성
│   │   └── state.py           싱글톤 lazy 로더
│   └── routers/
│       ├── dashboard.py       GET  /api/dashboard
│       ├── crawl.py           POST /api/crawl, GET /api/crawl/status, GET /api/results
│       ├── predict.py         POST /api/predict, /api/predict/strategies
│       └── dream.py           POST /api/dream/{analyze,lotto,predict}
├── scripts/
│   └── seed_from_github.py    역대 데이터 일괄 임포트 (happylie/lotto_data)
├── data/lotto.db              SQLite (gitignored)
├── pyproject.toml             uv 프로젝트 설정
├── uv.lock                    잠금 파일
└── run.py                     uvicorn 엔트리 (포트 8002)

frontend/
├── index.html                 SEO 메타 + JSON-LD 3종 (WebApplication/Dataset/FAQPage)
├── public/
│   ├── robots.txt
│   ├── sitemap.xml
│   ├── favicon.svg
│   ├── og-image.svg
│   └── site.webmanifest
├── src/
│   ├── main.jsx
│   ├── App.jsx
│   ├── api.js                 fetch 래퍼 (dashboard/crawl/results/predict)
│   ├── styles.css             디자인 토큰(CSS vars) + 자동 다크모드
│   └── components/
│       ├── Dashboard.jsx      헤더/요약카드/크롤바/FAQ
│       ├── ResultsBrowser.jsx 전체 회차 조회 + 회차 검색 + 페이징
│       ├── PredictionPanel.jsx 7단계 예측 파이프라인 애니메이션 + 결과
│       └── LottoBall.jsx      3D 스타일 볼 (5구간 색상)
├── vite.config.js             포트 1989 (strictPort), /api → :8002 프록시
└── package.json

work_order/
├── task1_collenct_number.md   수집 시스템 작업지시서
└── task2_prediction.md        예측 시스템 작업지시서
```

---

## 주요 설정값

| 항목 | 값 | 위치 |
|-----|---|------|
| Backend port | **8002** | `backend/run.py`, CORS는 `backend/app/config.py` |
| Frontend port | **1989** (strictPort) | `frontend/vite.config.js` |
| Vite `/api` 프록시 | `http://localhost:8002` | `frontend/vite.config.js` |
| CORS 허용 오리진 | `http://localhost:1989` | `backend/app/config.py` |
| 크롤 딜레이 | 2초 + 0~0.8초 지터 | `backend/app/config.py`, `crawler.py` |
| DB 저널 모드 | `DELETE` (WAL 아님) | `backend/app/database.py` |
| 몬테카를로 기본값 | 50,000회 시뮬레이션, 5세트 | `backend/app/prediction/config.py` |
| 앙상블 가중치 | freq 0.25 / delay 0.25 / hot_cold 0.30 / pattern 0.20 | `backend/app/prediction/config.py` |
| ChromaDB 경로 | `/mnt/e/bskim_dev/bskim-money-tellme-lotto/chroma_words` | `backend/app/config.py` (외부 참조) |

---

## 실행 명령

```bash
# 초기 설정 (1회)
cd backend  && uv sync
cd ../frontend && npm install

# 데이터 최초 적재 (1회) — GitHub 덤프에서 ~1,200회차 일괄 INSERT
cd backend && uv run python -m scripts.seed_from_github

# 개발 서버 (별도 터미널 2개)
cd backend  && uv run uvicorn app.main:app --host 0.0.0.0 --port 8002 --reload
cd frontend && npm run dev

# 프로덕션
cd frontend && npm run build
cd backend  && uv run uvicorn app.main:app --port 8002 --workers 1
```

> **워커는 반드시 1개** — `asyncio.Lock` 기반 크롤 중복 방지가 프로세스 단위라서 다중 워커면 중복 실행 가능.

---

## API 엔드포인트

| Method | Path | 설명 |
|--------|------|-----|
| GET | `/health` | 헬스체크 |
| GET | `/api/dashboard` | 요약 통계 + 최근 10건 |
| POST | `/api/crawl` | 증분 크롤 시작 (실행 중이면 409) |
| GET | `/api/crawl/status` | 진행 상태 (idle/running/success/failed) |
| GET | `/api/results?page=&page_size=` | 페이징 조회 (최대 200건/페이지) |
| GET | `/api/results/{round_no}` | 단일 회차 (없으면 404) |
| POST | `/api/predict?sets=&simulations=&hot_rounds=&seed=` | 번호 예측 (앙상블 + 몬테카를로) |
| POST | `/api/predict/strategies?sets=&seed=` | 대체 전략 5종 일괄 실행 |
| POST | `/api/dream/analyze` | 꿈 텍스트 → 형태소 + 단어별 매칭 |
| POST | `/api/dream/lotto` | 선택된 단어 → 3-세트 번호 조합 |
| POST | `/api/dream/predict` | 원스텝: analyze + lotto 병합 |

---

## DB 스키마

```sql
CREATE TABLE lotto_results (
    round_no            INTEGER PRIMARY KEY,
    draw_date           TEXT    NOT NULL,
    num1..num6          INTEGER NOT NULL,     -- 오름차순 저장
    bonus               INTEGER NOT NULL,
    total_sell_amount   INTEGER,              -- 네이버 소스에선 NULL
    first_win_amount    INTEGER,
    first_winner_count  INTEGER,
    first_accum_amount  INTEGER,              -- 네이버 소스에선 NULL
    created_at          TEXT    NOT NULL      -- KST ISO8601
);

CREATE TABLE crawl_logs (
    id                  INTEGER PK AUTOINCREMENT,
    started_at, finished_at  TEXT,
    status              TEXT,                 -- 'success' | 'failed' | 'seed:...'
    start_round, end_round   INTEGER,
    collected_count     INTEGER,
    error_message       TEXT
);
```

---

## 작업 규약 / 결정 근거

### 데이터 소스 정책
- **초기 대량 적재는 GitHub 덤프** (`happylie/lotto_data`) — 외부 요청 1건으로 ~1,204회차 확보
- **증분은 네이버 검색 위젯** — 주당 1~2회 정도만 실제 호출되어 봇 감지 위험 최소화
- 동행복권 공식 API 복구 시 `total_sell_amount`/`first_accum_amount` enrich 스크립트 추가 가능

### WSL/NTFS 호환성
- `.db-wal` / `.db-shm` 사이드카 파일이 Windows 측에서 락이 걸려 쓰기 불가한 이슈 있음 → `journal_mode=DELETE` 로 고정
- **이 결정을 되돌리지 말 것.** WAL 로 바꾸면 WSL 환경에서 DB 락 재발 가능.

### 예측 알고리즘
- 가중치는 `prediction/config.py` 단일 출처. 변경하려면 백테스트 후 업데이트할 것.
- 패턴 모듈은 2가지로 활용:
  1. `per_number()` — 번호별 보정 점수 (앙상블 합산용)
  2. 조합 레벨 필터 — 몬테카를로에서 유효 조합 판별
- `confidence` = "조합의 6개 번호가 유효 조합에서 평균적으로 등장한 비율" (해석 가능성 우선 정의)
- 재현 가능성 필요시 `seed` 쿼리 파라미터 사용
- 무거운 numpy 작업은 `asyncio.to_thread` 로 이벤트 루프 비차단

### 꿈 → 로또 (reg_lotto 포팅)
- 원본 `bskim-money-tellme-lotto` 에서 핵심 로직만 이식. **konlpy 대신 kiwipiepy 사용** (Java 불필요, 10배 빠름).
- ChromaDB 는 원본 데이터(`chroma_words`, 4,802 단어 × 768-dim) 를 **외부 경로 참조** — 복사하지 않음.
- 모델(`upskyy/kf-deberta-multitask`) + Chroma 클라이언트는 **lazy 싱글톤**: 첫 요청 시 로딩 ~20초.
- **번호 생성 로직은 백엔드로 이동** (원본 TS → Python numpy).
- 거리(L2) → `1/(1+dist)` 점수로 정규화 (UI 표시용).
- 자세한 설계: `work_order/task3_dream_lotto.md`.

### 필수 개발 원칙 (SEO + 웹 접근성)
**모든 프론트엔드 개발은 SEO와 웹 접근성(a11y)을 첫 구현 단계부터 반영.** 기능 완성 후 뒤늦게 붙이지 않는다.

- **시맨틱 HTML**: `<section>/<article>/<header>/<nav>/<main>/<footer>/<time dateTime>` 등 용도에 맞는 태그. `<div>` 남발 금지.
- **헤딩 계층**: `h1 → h2 → h3` 순서 유지.
- **ARIA**: `role`, `aria-label`, `aria-selected`, `aria-controls`, `aria-live`, `aria-current` 등 상호작용 요소에 반영. 기본 시맨틱으로 충분하면 과용 금지.
- **키보드 내비게이션**: `:focus-visible` 스타일, 버튼 `type="button"` 명시.
- **색 대비**: 텍스트/배경 WCAG AA 이상.
- **reduced-motion**: `@media (prefers-reduced-motion: reduce)` 존중 (이미 `styles.css` 에 전역 적용).
- **SEO 메타**: 새 페이지/기능에 `<title>`, `meta description`, OG/Twitter, JSON-LD. 검색·필터 결과 화면은 `document.title` 동적 갱신 (이미 `ResultsBrowser.jsx` 에 예시).
- **이미지/아이콘**: 의미 있는 건 `alt`, 장식용은 `aria-hidden="true"`.
- **Core Web Vitals** (LCP/CLS/INP) 도 SEO 요소. 레이아웃 시프트 방지·이미지 최적화.

### UI 규약
- **디자인 토큰은 `styles.css` CSS 변수 단일 출처**, Tailwind/CSS-in-JS 미사용
- 자동 다크 모드 (`prefers-color-scheme`) + `prefers-reduced-motion` 존중
- 모든 테이블/폼 아이콘은 이모지, 별도 아이콘 라이브러리 도입 지양
- 번호 볼 색상 규칙 (5구간) 은 동행복권 공식 규약 따름
  - 1~10 노랑 / 11~20 파랑 / 21~30 빨강 / 31~40 회색 / 41~45 초록

### SEO
- `index.html` 에 OG/Twitter/JSON-LD(WebApplication / Dataset / FAQPage) 포함
- 회차 검색 시 `document.title` 동적 갱신: `로또 N회 당첨번호 | ...` 롱테일 키워드 대응
- **배포 시 `lotto.example.com` 을 실제 도메인으로 치환 필요** (index.html/robots.txt/sitemap.xml)

---

## 테스트 / 검증

자동 테스트는 아직 없음. 수동 스모크 기준:

```bash
# 백엔드 기본
curl http://localhost:8002/health
curl 'http://localhost:8002/api/results?page=1&page_size=3'

# 예측 (재현 가능 시드)
curl -X POST 'http://localhost:8002/api/predict?sets=3&simulations=20000&seed=1'

# 크롤 (결과 없는 상태면 0건 수집 + success 반환)
curl -X POST http://localhost:8002/api/crawl
curl http://localhost:8002/api/crawl/status
```

---

## 알려진 이슈 / 주의사항

1. **동행복권 공식 API 전면 차단** (2026-04 기준). 복구 여부 모니터링 중.
2. 네이버 위젯에는 **총 판매금액 / 1등 누적 상금**이 노출되지 않음 → 해당 필드 NULL. UI 에서 `-` 표시.
3. 예측은 **재미 목적**. 완전 랜덤에 대한 통계 분석이며 실제 당첨 확률을 높이지 않음. UI `predict-disclaimer` 클래스에 명시적 고지 포함.
4. `frontend/vite.config.js` 의 `strictPort: true` 때문에 1989 포트 사용 중이면 다른 포트로 fallback 되지 않고 에러 발생 → 의도된 동작.
