# 작업지시서: 꿈 분석 → 로또 번호 추천 (reg_lotto 포팅)

## 1. 배경

기존 별도 프로젝트 `bskim-money-tellme-lotto`(reg_lotto)에서 운영하던
"꿈 → 형태소 분석 → 벡터 유사도(ChromaDB) → 로또 번호 추천" 기능을
현재 `bskim-lotto-prediction` 대시보드에 포팅·통합한다.

## 2. 원본 시스템 요약

| 레이어 | 기존 스택 | 역할 |
|-------|---------|------|
| Backend | FastAPI + konlpy(Okt+Kkma) + sentence-transformers + chromadb | 꿈 텍스트 → 형태소 → 임베딩 → 벡터 조회 |
| Frontend | SvelteKit | 입력/결과 카드/체크박스/3-세트 번호 생성 |
| Vector DB | ChromaDB `lotto_word` (4,802 단어, 768-dim `upskyy/kf-deberta-multitask`) | 단어별 `lotto_number`, `importance` 메타 |

### 원본 플로우
1. `POST /analyze` — 꿈 텍스트 → 형태소 추출(Okt+Kkma) → 각 단어 임베딩 → ChromaDB query
2. 결과 3분류:
   - `gubun=1` 정확 일치
   - `gubun=2` 부분 포함
   - `gubun=3` 의미 유사
3. 사용자가 UI에서 체크박스로 단어 선택
4. `POST /api/lottonum` — 선택된 단어들의 `lotto_number` 집합에서 3-세트(상위/중/하) 번호 조합 생성
5. 각 세트 10개 조합, 6개 번호 미만이면 1~45 랜덤 채움

## 3. 적용 설계 (개선점 포함)

### 3.1 원본 대비 개선

| 항목 | 원본 | 포팅 후 (이유) |
|-----|------|--------------|
| 형태소 분석기 | konlpy (Okt+Kkma) — Java 필수, 초기 로드 3~5s | **kiwipiepy** — 순수 C++/Python, Java 불필요, ~10x 빠름 |
| 사전 매핑 | 수백 줄 `adjective → 명사` 하드코딩 | 핵심 매핑만 유지, 나머지는 kiwipiepy의 `stem` + 품사 필터로 대체 |
| API 구조 | 2단계(analyze → lottonum) 필수 | 2단계 유지 + 원스텝 `dream/predict` 추가 (선택 없이 바로 추천) |
| 번호 생성 로직 | 프론트 TS에서 계산 | **백엔드로 이동** — 단일 소스 유지, numpy 재사용 |
| ChromaDB 경로 | env 필수 | env 기본값 있음 (기존 `bskim-money-tellme-lotto/chroma_words` 참조) |
| 모델 로딩 | lifespan | **lazy + 첫 요청 시 준비 상태 체크** (dev 구동 빠르게) |
| 거리→유사도 | L2 distance 그대로 표시 | `score = 1 / (1 + distance)` 정규화 (0~1 사람 읽기) |

### 3.2 엔드포인트

- `POST /api/dream/analyze`
  입력: `{ "text": "꿈 내용" }`
  출력: `{ "query": "...", "words": [{ "dream_word": "호랑이", "results": [{ "gubun": 1|2|3, "word": "...", "lotto_number": [숫자들], "importance": int, "score": float }] }] }`

- `POST /api/dream/lotto`
  입력: `{ "selected": [{ "gubun": 1|2|3, "lotto_number": [숫자들] }, ...] }` (사용자가 체크한 항목만)
  출력: 3-세트 × 각 10조합 + 풀 사이즈 메타

- `POST /api/dream/predict`
  입력: `{ "text": "...", "sets_per_tier": 10 }`
  출력: analyze + lotto 병합 (사용자 선택 없이 모든 매칭 사용)

### 3.3 디렉토리

```
backend/app/dream/
├── __init__.py
├── analyzer.py          kiwipiepy 기반 형태소 추출
├── searcher.py          ChromaDB + SentenceTransformer (원본 DreamSearcher 포팅)
├── generator.py         선택된 lotto_number → 3-세트 조합 생성 (numpy)
└── state.py             모델/Chroma 싱글톤 로더 (lazy)

backend/app/routers/dream.py   FastAPI 라우터 (3 엔드포인트)

frontend/src/components/DreamLottoPanel.jsx
frontend/src/components/DreamWordCard.jsx   단어 + 체크박스 카드
```

### 3.4 번호 생성 알고리즘

```
selected_numbers_by_tier = { 1: set(), 2: set(), 3: set() }

for item in selected:
    selected_numbers_by_tier[item.gubun].add(item.lotto_number)

pool1 = selected_numbers_by_tier[1]
pool2 = pool1 ∪ selected_numbers_by_tier[2]
pool3 = pool2 ∪ selected_numbers_by_tier[3]

for pool in (pool1, pool2, pool3):
    if pool.size >= 1:
        combos = generate_unique_combos(pool, count=10, size=6)
```

- `generate_unique_combos`:
  1. 풀에서 무작위로 6개 선택 (비복원)
  2. 6개 모자라면 1~45 랜덤으로 채움
  3. 서로 다른 10개 조합 생성 (중복 방지, 최대 1000회 시도)

### 3.5 UI 흐름

1. 꿈 입력 (100자 제한, 원본 동일)
2. **분석** 버튼 → `/analyze` 호출 → 단어별 카드 그리드 (체크박스 포함, 기본 전체 체크)
3. **번호 생성** 버튼 → `/lotto` 호출 → 3-세트 결과 (볼로 표시)
4. (옵션) **자동 추천** 버튼 → `/predict` 원스텝

### 3.6 의존성 추가

```toml
dependencies = [
    ...
    "kiwipiepy>=0.17",
    "sentence-transformers>=2.2",
    "chromadb>=0.5",
    "torch>=2.0",
]
```

- 초기 의존성 설치 시 ~1.5GB (torch + transformers). 감수.
- 첫 요청에서 모델 로딩 ~20초 → 이후 캐시됨.

## 4. 산출물 체크리스트

- [ ] `backend/app/dream/` 전체 모듈
- [ ] `backend/app/routers/dream.py` + 앱 등록
- [ ] `pyproject.toml` 의존성 추가 + `uv sync`
- [ ] `frontend/src/components/DreamLottoPanel.jsx` + `DreamWordCard.jsx`
- [ ] `Dashboard.jsx` 에 패널 장착
- [ ] `styles.css` 신규 스타일
- [ ] `CLAUDE.md` 갱신
- [ ] 엔드투엔드 스모크 (분석 → 생성)

## 5. 알려진 제약

1. **ChromaDB 데이터**: 외부 경로(`bskim-money-tellme-lotto/chroma_words`) 참조. 해당 경로가 없으면 503.
2. **모델 용량**: sentence-transformers 모델 ~400MB. 첫 실행 시 다운로드.
3. **단어 매칭 품질**: 기존 데이터의 품질에 의존. importance 5인 "강력 추천" 단어가 매칭되면 번호 채택 우선.
4. **개인정보**: 꿈 텍스트는 DB에 저장하지 않음. 응답 후 즉시 소멸.
