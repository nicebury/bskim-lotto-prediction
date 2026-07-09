---
type: ops
title: "SQLite → Postgres 1회성 이관"
description: "기존 backend/data/lotto.db(1,231회차)를 Postgres lotto_draw 로 옮기는 1회성 절차·컬럼 매핑·검증·롤백"
tags: [ops, migration]
owner: worker
status: stable
sources: ["raw:작업지시서초안_보완.md#10", "raw:작업지시서초안_보완.md#8.1", "backend/data/lotto.db", "backend/app/models.py"]
created: 2026-07-09
updated: 2026-07-09
---

# SQLite → Postgres 1회성 이관

작업지시서 10장이 이 절차의 **정본**이다. 이 페이지는 그 절차에 실측값을 붙여 실행 가능하게 만든 것이다.

기존 SQLite(`backend/data/lotto.db`)의 회차 데이터를 새 Postgres 스키마로 **한 번** 옮긴다. 이관 이후의 증분 수집은 worker 의 `lotto` 잡이 담당하며 이 이관과 별개다.

## 실행 주체와 스크립트

worker 세션이 소유한다. 1회성 스크립트 `worker/scripts/migrate_sqlite_to_pg.py` 로 구현한다. 대상 스키마(`lotto_draw` 등)와 롤 권한은 `[[db-schema]]` 가 정본이고, 이름 규약은 `[[db-naming-standard]]` 다.

> **컬럼명이 그대로 넘어오지 않는다.** SQLite 이름을 한국형 표준으로 재설계했다 — `[[0010-db-naming-standard]]`. 아래 매핑표를 그대로 따른다.

## 이관 전 실측값 (SQLite 현황)

이관 시점 이전 `backend/data/lotto.db` 를 직접 조회한 값이다.

| 테이블 | 행수 | 비고 |
|--------|------|------|
| `lotto_results` | **1,231** | `round_no` **1~1231 연속** (빠진 회차 없음) |
| `crawl_logs` | 9 | 이관하지 않음 |

이관 후 `SELECT count(*) FROM lotto_draw` 가 **1231** 이어야 한다. (이관 시점 이후의 증분 수집분은 이 숫자와 별개로 늘어난다.)

## 절차

1. `backend/data/lotto.db` 를 **읽기 전용**으로 연다 (`file:...?mode=ro`). 원본을 건드리지 않는다.
2. Alembic 으로 Postgres 스키마를 만든다. DDL 원본은 `worker/scripts/ddl/001_initial_schema.sql`.
3. `lotto_results` → `lotto_draw` 로 복사한다. 컬럼 매핑은 아래.
4. `crawl_logs` 는 **이관하지 않는다** — `collect_job_log` 와 스키마가 다르고(잡 이름·실행구분이 없다) 이력 가치가 낮다. 9행 전부 `status='success'` 로 확인했다. SQLite 파일을 보관하면 충분하다.
5. `lotto_prize` 는 **비운다** — 현재 등위별(2~5등) 데이터 소스가 없다.

### 컬럼 매핑 (`lotto_results` → `lotto_draw`)

| SQLite 컬럼 | 타입 | Postgres 컬럼 | 타입 | 주의 |
|------------|------|--------------|------|------|
| `round_no` | INTEGER | `round_no` | `integer` | PK |
| `draw_date` | TEXT | `draw_ymd` | **`date`** | 텍스트 → `::date` 캐스팅 |
| `num1`..`num6` | INTEGER | `winning_no1`..`winning_no6` | `smallint` | 오름차순 불변식 유지 |
| `bonus` | INTEGER | `bonus_no` | `smallint` | |
| `total_sell_amount` | INTEGER | `total_sell_amt` | `bigint` | 네이버 소스라 전부 NULL |
| `first_win_amount` | INTEGER | `first_prize_amt` | `bigint` | |
| `first_winner_count` | INTEGER | `first_winner_cnt` | `integer` | |
| `first_accum_amount` | INTEGER | `first_accum_prize_amt` | `bigint` | 네이버 소스라 전부 NULL |
| `created_at` | TEXT | `created_dttm` | **`timestamptz`** | 아래 주의 |
| (없음) | — | `updated_dttm` | `timestamptz` | `created_dttm` 값으로 채운다 |

**`created_at` 타임존 주의.** SQLite 의 `created_at` 은 KST ISO8601 문자열이지만 타임존 오프셋이 없는 naive 문자열일 수 있다. naive 문자열이면 **KST(Asia/Seoul)로 해석**해 `timestamptz` 로 넣는다. 아무 타임존이나 붙이면 9시간 어긋난다.

**`updated_dttm` 은 `now()` 가 아니라 `created_dttm` 값으로 채운다.** 이관 시점을 "수정 시각" 으로 남기면, 나중에 공식 API 로 enrich 할 때 무엇이 실제로 갱신됐는지 구분할 수 없다.

**신규 제약 `uk_lotto_draw_draw_ymd`(UNIQUE).** 이관 전에 원본에서 중복 일자가 없음을 확인했다(1,231행, 중복 0건). 그래도 스크립트는 이 제약 위반을 잡아 실패하도록 두고, 삼키지 않는다.

## 검증 쿼리 (이관 성공 판정)

다섯 쿼리를 모두 통과해야 성공이다.

```sql
-- 1) 행수 일치 — 1231 이어야 함
SELECT count(*) FROM lotto_draw;

-- 2) 회차 연속성 (빠진 회차 탐지) — true 여야 함
SELECT max(round_no) - min(round_no) + 1 = count(*) AS contiguous FROM lotto_draw;

-- 3) 번호 오름차순 불변식 — 0 이어야 함 (CHECK 가 막지만 확인)
SELECT count(*) FROM lotto_draw
 WHERE NOT (winning_no1<winning_no2 AND winning_no2<winning_no3 AND winning_no3<winning_no4
        AND winning_no4<winning_no5 AND winning_no5<winning_no6);

-- 4) 번호 범위 — 0 이어야 함
SELECT count(*) FROM lotto_draw
 WHERE winning_no1 < 1 OR winning_no6 > 45 OR bonus_no NOT BETWEEN 1 AND 45;

-- 5) 추첨일자 유일성 — 0 이어야 함
SELECT count(*) FROM (SELECT draw_ymd FROM lotto_draw GROUP BY 1 HAVING count(*) > 1) d;
```

## 롤백

이관은 **멱등이 아니다.** 실패하면 `TRUNCATE lotto_draw CASCADE` 후 재실행한다. `backend/data/lotto.db` 는 이관 후에도 **삭제하지 않고 보관**한다 — 원본이 유일한 재실행 근거다.

## ChromaDB 는 이관하지 않는다

`backend/data/chroma_words/`(36MB)는 그대로 파일로 쓴다. pgvector 로 옮기지 않는다 — 임베딩 재생성·인덱스 튜닝·모델 버전 관리가 따라붙는 데 비해 이득이 없다. Postgres 는 관계형 데이터만 담당한다. 근거: `[[0006-keep-chromadb-not-pgvector]]`.

## 폐기되는 결정

기존 `CLAUDE.md` 의 **"WSL/NTFS 호환을 위해 SQLite `journal_mode=DELETE` 로 고정, 되돌리지 말 것"** 은 SQLite 전용 제약이다. Postgres 전환과 함께 **무효**가 되며, 되살릴 필요가 없다. ADR `[[0005-postgres-migration]]` 에 `deprecated` 로 기록한다.

## 관련 문서

- 셋업 전체 흐름: `[[local-setup]]`
- 대상 스키마: `[[db-schema]]`
- 결정 근거: `[[0005-postgres-migration]]`, `[[0006-keep-chromadb-not-pgvector]]`, `[[0010-db-naming-standard]]`
- 이름 규약: `[[db-naming-standard]]`
