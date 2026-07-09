---
type: decision
title: "ADR 0005 — SQLite 를 Postgres 로 이관한다"
description: "journal_mode=DELETE 를 강제하던 WSL/NTFS 제약이 무효화된다. 그 결정을 deprecate 한다"
tags: [decision, db, migration]
owner: worker
status: stable
sources: ["raw:작업지시서초안_보완.md#10", "backend/app/database.py"]
created: 2026-07-09
updated: 2026-07-09
---

# ADR 0005 — SQLite 를 Postgres 로 이관한다

## 결정

`backend/data/lotto.db` (SQLite) 의 데이터를 Postgres 로 1회 이관한다. 이후 SQLite 를 쓰지 않는다. 스키마는 Alembic 이 관리하고 워커가 소유한다.

## 맥락

현재 DB 는 aiosqlite 로 접근하는 SQLite 파일 하나다. 1,231회차가 들어 있다. 신규 구조는 워커와 백엔드가 **별개의 프로세스**로 같은 데이터를 본다.

## 왜 Postgres 인가

**두 프로세스가 동시에 접근하기 때문이다.** 워커가 쓰는 동안 백엔드가 읽는다. SQLite 로도 가능하지만 쓰기 락이 파일 전체를 잠그고, 이 저장소는 이미 그 문제로 한 번 다쳤다 — WAL 사이드카 파일(`.db-wal`, `.db-shm`)이 Windows 측에서 락이 걸려 쓰기가 불가능해지는 WSL/NTFS 이슈 때문에 `journal_mode=DELETE` 로 고정해야 했다. `DELETE` 모드는 동시성이 WAL 보다 더 나쁘다.

**두 번째 이유는 권한이다.** [[0003-worker-writes-backend-reads]] 의 롤 분리는 SQLite 에 존재하지 않는 개념이다. 파일 퍼미션으로 흉내 낼 수 있지만, 같은 컨테이너 안에서는 무의미하다. Postgres 의 `GRANT` 는 이 결정을 실행 가능하게 만드는 유일한 수단이다.

**세 번째는 타입이다.** SQLite 는 `draw_date` 를 TEXT 로, `created_at` 을 TEXT 로 저장한다. 날짜 비교가 문자열 비교이고, 타임존 개념이 없다. Postgres 의 `DATE` / `TIMESTAMPTZ` 로 옮기면 통계 쿼리의 `window` 계산이 정직해진다. 배열 타입(`lotto_news.keyword_list text[]`)과 `CHECK` 제약도 얻는다.

**네 번째는 불변식이다.** "당첨번호는 오름차순으로 저장한다" 는 SQLite 시절 **관례**였다. 코드가 지키기를 바랐을 뿐 강제되지 않았다. Postgres 에서는 `CHECK` 제약으로 승격한다. 예측 모듈이 이 순서를 신뢰하므로, 관례보다 제약이 낫다.

## 폐기되는 결정

기존 `CLAUDE.md` 는 이렇게 적었다.

> `journal_mode=DELETE` 로 고정. **이 결정을 되돌리지 말 것.** WAL 로 바꾸면 WSL 환경에서 DB 락 재발 가능.

이 경고는 **SQLite 를 쓰는 한** 옳다. Postgres 로 옮기면 저널 모드라는 개념 자체가 사라지므로 무효가 된다. 삭제하지 않고 여기에 `deprecated` 로 기록한다 — 미래에 누군가 "SQLite 로 되돌리면 어떨까" 라고 물을 때 이 함정이 다시 보여야 한다.

## 이관 범위

`lotto_results` → `lotto_draw` 만 옮긴다. 1,231행, `round_no` 1~1231 연속. 컬럼명은 그대로 넘어오지 않는다 — [[0010-db-naming-standard]] 참조.

`crawl_logs`(9행)는 옮기지 않는다. 신규 `collect_job_log` 와 스키마가 다르고(잡 이름·실행구분 컬럼이 없다) 이력 가치가 낮다. SQLite 파일은 보관한다.

**ChromaDB 는 이관 대상이 아니다.** 관계형 DB 가 아니고 파일로 잘 동작한다. [[0006-keep-chromadb-not-pgvector]] 참조.

절차와 검증 쿼리는 [[migration-sqlite-to-postgres]] 에 있다.

## 기각한 대안

**SQLite 유지 + WAL 재시도.** 개발 환경이 WSL/NTFS 인 한 같은 락 문제가 재발한다. 그리고 롤 분리를 못 한다.

**워커와 백엔드를 한 프로세스로 되돌리기.** SQLite 로 충분해지지만, 잡별 스케줄·수동 트리거·무거운 ML 의존성 격리라는 이번 재편의 동기 전체를 포기하는 일이다.

## 결과

- `backend/app/database.py`(aiosqlite)는 폐기하고 psycopg 비동기 풀로 교체한다.
- `predictor.py` 는 `sqlite3` 표준 라이브러리를 직접 쓴다. 접근부만 바꾸고 알고리즘은 건드리지 않는다 ([[prediction-algorithm]]).
- 이관은 멱등이 아니다. 실패하면 `TRUNCATE` 후 재실행한다.
- 운영 Postgres 를 어디에 둘지는 아직 미정이다 ([[deployment]]).

관련: [[db-schema]] · [[migration-sqlite-to-postgres]] · [[0003-worker-writes-backend-reads]] · [[0006-keep-chromadb-not-pgvector]]
