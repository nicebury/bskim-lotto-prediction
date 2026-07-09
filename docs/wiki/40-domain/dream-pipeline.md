---
type: domain
title: "꿈해몽 → 번호 파이프라인"
description: "kiwipiepy 형태소 분석 → ChromaDB 벡터 유사도 → tier별 조합 생성. lazy 싱글톤 20초 로딩"
tags: [domain, algorithm, pitfall]
owner: backend
status: stable
sources: ["backend/app/dream/analyzer.py", "backend/app/dream/searcher.py", "backend/app/dream/generator.py", "backend/app/dream/state.py"]
created: 2026-07-09
updated: 2026-07-09
---

# 꿈해몽 → 번호 파이프라인

원래 `bskim-money-tellme-lotto`(reg_lotto) 프로젝트의 기능이다. 핵심 로직만 이 저장소로 이식됐고, 신규 백엔드는 그것을 **그대로** 다시 이식한다.

꿈과 당첨 사이에 인과관계는 없다. 재미용 콘텐츠이고, 롱테일 SEO(`돼지꿈 로또번호`, `돈꿈 로또번호`) 유입 경로다. 화면에는 반드시 면책 고지를 붙인다 ([[forbidden-expressions]]).

---

## 전체 흐름

```
꿈 텍스트
  → analyzer.py    형태소 분석 → 후보 단어 목록
  → searcher.py    ChromaDB 벡터 유사도 → 매칭 단어 + 번호 + gubun(1/2/3)
  → generator.py   gubun 누적 tier 별로 조합 생성
  → 번호 세트
```

---

## 1. 형태소 분석 (`analyzer.py`)

**konlpy 가 아니라 kiwipiepy 를 쓴다.** Java 런타임이 필요 없고 훨씬 빠르다. 원본 프로젝트에서 바꾼 부분이다.

유지하는 품사 (`analyzer.py:20-25`):

```python
_KEEP_TAGS = {"NNG", "NNP", "NNB", "NR", "SL", "VV", "VA", "VA-I", "VV-I", "XR"}
```

일반명사·고유명사·의존명사·수사·외국어, 그리고 동사·형용사(불규칙 포함)와 어근이다. 동사와 형용사를 남기는 이유는 "쫓기다", "빠지다" 같은 꿈 서술어가 해몽 사전의 표제어이기 때문이다.

추출은 3단계다 (`analyzer.py:83-187`).

1. 원문 어절을 사전에 직접 매핑하고 유의어로 확장한다.
2. kiwipiepy 토큰을 매핑하거나, 어간을 명사로 되돌린다 (`_stem_to_noun`).
3. 원문 어절 자체를 후보에 추가한다.

한 글자 단어는 **화이트리스트에 있을 때만** 받아들이고, 스톱워드는 뺀다 (`analyzer.py:142-145`). 한 글자를 다 받으면 "이", "그", "수" 같은 것들이 벡터 검색을 오염시킨다.

---

## 2. 벡터 검색 (`searcher.py`)

| 항목 | 값 | 줄 |
|------|-----|----|
| ChromaDB 컬렉션 | `lotto_word` | 20 |
| 임베딩 모델 | `upskyy/kf-deberta-multitask` (SentenceTransformer) | 21 |
| 조회 개수 | `n_results=100` | 83, 96 |
| 결과 컷 | `TOP_CONTAINING=3`, `TOP_SIMILAR=3` | 25-26 |
| 거리 상한 | `DISTANCE_THRESHOLD=500` | 23 |

### 거리 → 점수

```python
score = 1.0 / (1.0 + max(0.0, distance))     # searcher.py:91-94
```

L2 거리를 0~1 점수로 뒤집는다. 가까울수록 1에 가깝다. **이 값은 UI 표시용이다.** 확률이 아니다.

### `gubun` — 매칭 종류

| 값 | 조건 |
|----|------|
| 1 | 문서 == 검색어 (정확 일치) |
| 2 | 검색어가 문서에 포함됨 |
| 3 | 그 외 (벡터 유사) |

`DISTANCE_THRESHOLD` 를 넘는 결과는 버린다 (`searcher.py:113`).

### 함정: 유사 단어 오염 방지

**증상.** 관련 없는 단어("곡괭이", "꽈리", "꽈배기")가 유사 결과 상위에 반복해서 뜬다.

**원인.** 임베딩 공간에서 이 단어들이 여러 질의의 근처에 놓여 있다. 벡터 검색의 고질적 허브(hub) 문제다.

**해법.** `EXCLUDE_WORDS` 목록을 두고, 유사(gubun 3) 상위 3개 중 **2개 이상**이 목록에 걸리면 유사 결과 전체를 버린다 (`searcher.py:143-145`). 개별 단어만 빼는 게 아니라 전부 버리는 이유는, 그 정도로 허브가 끼어들었다면 나머지 결과도 신뢰할 수 없기 때문이다.

---

## 3. 번호 생성 (`generator.py`)

`build_tier_sets` (`generator.py:58-98`). 번호 풀을 gubun 별로 **누적**한다.

| tier | 번호 풀 |
|------|---------|
| 1 | gubun 1 (정확 일치)만 |
| 2 | gubun 1 + 2 |
| 3 | gubun 1 + 2 + 3 |

tier 마다 `sets_per_tier`(기본 **10**)개의 고유 조합을 만든다. 풀이 6개 미만이면 1~45 무작위로 채운다 (`_generate_combo`, `generator.py:16-33`).

tier 1 은 좁고 확신 있는 풀, tier 3 은 넓고 느슨한 풀이다. 사용자에게는 "정확히 일치한 단어만", "비슷한 단어까지" 정도로 설명한다.

> **문서-코드 불일치.** 기존 `CLAUDE.md` 는 이 모듈을 "3-세트 조합 생성" 이라고 적었다. 실제로는 **3개 tier × tier당 10세트 = 30세트**다. UI 가 몇 세트를 보여줄지는 프론트의 결정이지만, 백엔드가 3개만 준다고 가정하지 않는다.

번호 생성 로직은 **백엔드에 있다.** 원본 프로젝트는 TypeScript 프론트에서 만들었다. 옮긴 이유는 프론트가 비즈니스 계산을 하지 않는다는 경계 때문이다 ([[api-contract]]).

---

## 4. 싱글톤 로딩 (`state.py`)

`threading.Lock` + double-checked locking 으로 `DreamAnalyzer` 와 `DreamSearcher` 를 각각 한 번만 만든다 (`state.py:14-40`).

### 함정: 첫 요청이 20초 걸린다

**증상.** 서버를 띄우고 처음 `/api/dream/recommend` 를 부르면 20초쯤 응답이 없다. 이후 요청은 즉시 온다. 헬스체크는 정상이다.

**원인.** SentenceTransformer 모델(`upskyy/kf-deberta-multitask`)과 ChromaDB 클라이언트가 **lazy** 로 로드된다. 첫 요청이 그 비용을 전부 낸다.

**해법.** 두 가지 중 하나를 고른다.

- 프론트가 이 요청에 로딩 상태를 반드시 표시한다. 진행 표시 없는 20초는 고장으로 읽힌다.
- 또는 백엔드 lifespan 에서 워밍업한다. 그러면 기동이 20초 느려지지만 첫 사용자가 기다리지 않는다. 컨테이너 헬스체크의 `start_period` 를 그만큼 늘려야 한다.

lazy 를 eager 로 바꾸면 **꿈해몽을 안 쓰는 배포에서도** 20초와 수백 MB 를 낸다. 지금은 lazy 를 유지하고 프론트가 로딩을 표시한다.

`chroma_path` 가 없으면 `FileNotFoundError` 를 던진다. 조용히 빈 결과를 주지 않는다.

---

## ChromaDB 를 pgvector 로 옮기지 않는다

`backend/data/chroma_words/` 를 파일 그대로 쓴다. 근거는 [[0006-keep-chromadb-not-pgvector]].

백엔드 컨테이너는 이 디렉토리를 **읽기 전용**으로 마운트한다. 쓰기가 필요한 순간은 없다 — 단어 사전은 정적이다.

## 무거운 의존성

`sentence-transformers` → `transformers` → `torch`. 수백 MB 이고, 백엔드가 Python 3.13 을 쓸 수 있느냐를 결정하는 유일한 요인이다. [[0008-python-313-torch-pin]] 참조.

워커에는 이 의존성이 없다. 그것이 워커를 분리한 실질적 이득 중 하나다.

## 임베딩 데이터

기존 `CLAUDE.md` 는 `chroma_words` 가 "4,802 단어 × 768-dim" 이라고 적었다. **이 숫자는 코드에서 확인되지 않았다.** 문서의 주장이다. 이관이나 재생성이 필요해지면 먼저 실측한다.

관련: [[forbidden-expressions]] · [[api-contract]] · [[prediction-algorithm]] · [[0006-keep-chromadb-not-pgvector]] · [[0008-python-313-torch-pin]]
