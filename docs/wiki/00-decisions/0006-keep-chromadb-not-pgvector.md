---
type: decision
title: "ADR 0006 — ChromaDB 를 파일로 유지한다. pgvector 로 옮기지 않는다"
description: "Postgres 는 관계형 데이터만 담당. 임베딩 사전은 정적이고 작아 파일이 적합하다"
tags: [decision, db, algorithm, tbd]
owner: backend
status: stable
sources: ["backend/app/dream/searcher.py", "backend/app/config.py"]
created: 2026-07-09
updated: 2026-07-09
---

# ADR 0006 — ChromaDB 를 파일로 유지한다

## 결정

꿈해몽 벡터 검색은 `backend/data/chroma_words/` 디렉토리의 ChromaDB 파일을 계속 쓴다. pgvector 확장을 도입하지 않는다. 백엔드 컨테이너는 이 디렉토리를 **읽기 전용**으로 마운트한다.

## 맥락

[[0005-postgres-migration|SQLite 를 Postgres 로 옮기면서]] "이왕 하는 김에 임베딩도 pgvector 로 통합하면 상태 저장소가 하나가 된다" 는 안이 검토됐다.

## 왜 옮기지 않는가

**이 데이터는 정적이기 때문이다.** 단어 사전은 원본 프로젝트(reg_lotto)에서 한 번 생성됐고, 그 뒤로 바뀌지 않는다. 쓰기가 없다. 트랜잭션이 필요 없다. 다른 테이블과 조인하지 않는다. 관계형 DB 가 제공하는 것 중 무엇도 필요하지 않다.

**두 번째로, 이관 비용이 이득을 넘는다.** pgvector 를 도입하면 따라오는 것들이 있다. 확장 설치, 인덱스 종류 선택(IVFFlat 인가 HNSW 인가), 인덱스 파라미터 튜닝(`lists`, `ef_construction`), 거리 함수 선택. 그리고 임베딩을 재생성해야 한다면 모델 버전을 고정하고 재현 가능하게 만들어야 한다. 지금 얻는 것은 "상태 저장소가 하나" 라는 미학뿐이다.

**세 번째로, 실패 모드가 나빠진다.** 지금은 벡터 검색이 죽어도 로또 조회·통계·추천이 전부 살아 있다. 파일이 없으면 `FileNotFoundError` 가 나고 꿈해몽만 500 을 낸다. pgvector 로 통합하면 벡터 인덱스의 문제가 같은 DB 인스턴스의 다른 쿼리에 영향을 준다. 꿈해몽은 이 서비스의 부차 기능이다. 핵심 기능(회차 조회)과 운명을 묶을 이유가 없다.

**네 번째로, 백업 대상이 늘어난다는 반론이 있었다.** Postgres 와 Chroma 두 곳을 백업해야 한다는 것이다. **이 반론은 유효하다.** `backend/data/chroma_words/` 는 36MB 이고 `.gitignore` 에 등록되어 있어 **git 에 없다.** 이 디렉토리를 잃으면 임베딩을 재생성해야 하는데, 그러려면 원본 단어 사전과 모델 버전이 필요하다. 원본은 `bskim-money-tellme-lotto`(reg_lotto) 프로젝트에 있다.

그럼에도 pgvector 로 옮기지 않는 이유는, **pgvector 도 이 문제를 풀지 않기 때문이다.** 임베딩을 Postgres 에 넣어도 재생성 절차는 여전히 필요하고, 대신 Postgres 백업 용량이 36MB 늘고 인덱스 재구축 시간이 붙는다. 문제는 저장소가 아니라 **재생성 절차가 문서화되지 않았다는 것**이다.

→ **해야 할 일 (`tbd`)**: 이 디렉토리를 어디에 보관할지 정한다. 선택지는 컨테이너 이미지에 굽기, 오브젝트 스토리지에 두고 기동 시 받기, 또는 재생성 스크립트를 작성해 커밋하기. [[deployment]] 에서 함께 결정한다.

## 규모

`CLAUDE.md` 는 4,802 단어 × 768 차원이라고 적었다. **이 숫자는 코드에서 확인되지 않았다.** 문서의 주장이다. 어느 쪽이든 pgvector 가 필요할 규모는 아니다 — 수백만 벡터에서 근사 최근접 인덱스가 의미를 갖는다.

컬렉션명 `lotto_word`, 모델 `upskyy/kf-deberta-multitask`, 조회 100건. 자세한 것은 [[dream-pipeline]].

## 대가

`sentence-transformers` → `transformers` → `torch` 의존성이 백엔드에 남는다. 수백 MB 이고, 백엔드가 Python 3.13 을 쓸 수 있는지를 결정하는 유일한 요인이다 ([[0008-python-313-torch-pin]]). pgvector 로 옮겨도 **임베딩 생성**에는 여전히 모델이 필요하므로, 이 대가는 어느 쪽을 택하든 같다. 질의 임베딩을 만들어야 검색할 수 있기 때문이다.

## 되돌리려면

두 조건 중 하나가 참이 되면 재검토한다.

1. 단어 사전이 **동적**이 된다 — 사용자 입력으로 사전이 늘어나거나, 주기적으로 재생성된다.
2. 벡터가 수십만 건을 넘어 파일 로딩이 기동 시간을 지배한다.

지금은 둘 다 아니다.

관련: [[dream-pipeline]] · [[0005-postgres-migration]] · [[0008-python-313-torch-pin]] · [[migration-sqlite-to-postgres]]
