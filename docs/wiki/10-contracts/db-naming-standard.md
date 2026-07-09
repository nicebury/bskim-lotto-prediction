---
type: contract
title: "DB 명명 표준 — 단어·용어·도메인 사전"
description: "표준단어·도메인 접미어·논리물리 매핑·제약 명명규칙"
tags: [contract, db]
owner: worker
status: stable
sources: ["backend/app/models.py", "worker/scripts/ddl/001_initial_schema.sql"]
created: 2026-07-09
updated: 2026-07-09
---

# DB 명명 표준 — 단어·용어·도메인 사전

이 페이지는 **계약**이다. Postgres 물리 스키마의 모든 테이블·컬럼·제약·인덱스 이름은
여기의 표준단어·도메인 접미어·명명규칙을 따른다. 실제 DDL 은
`worker/scripts/ddl/001_initial_schema.sql` 이고, 스키마 계약 본문은 [[db-schema]] 다.
DB 컬럼명은 REST 응답 필드명과 **다르며**, 매핑은 [[api-contract]] 를 따른다.

물리명 생성 원칙:

- 영문 소문자 `snake_case`. 표준단어 조합 + 도메인 접미어.
- 대리키는 `bigint GENERATED ALWAYS AS IDENTITY` (`BIGSERIAL` 금지).
- 업무상 자연키(회차)는 `_no` (integer). 대리키가 필요 없으면 자연키를 PK 로 쓴다.
- **예약어를 이름에 쓰지 않는다** (아래 별도 절).
- **금지 표현을 이름에 쓰지 않는다** ([[forbidden-expressions]]).

---

## 표준단어사전

| 논리 단어 | 영문 표준단어 | 비고 |
|-----------|--------------|------|
| 로또 | `lotto` | 서비스 도메인 접두 |
| 회차 | `round` | `_no` 와 결합 → 자연키 |
| 추첨 | `draw` | |
| 당첨 | `winning` | 당첨번호=`winning_no1`~`winning_no6` |
| 보너스 | `bonus` | |
| 총 | `total` | |
| 판매 | `sell` | |
| 누적 | `accum` | accumulated |
| 등위 | `grade` | 예약어 `rank` 대체 |
| 상금 / 당첨금 | `prize` | |
| 당첨자 | `winner` | |
| 게임 | `game` | 게임당 당첨금 |
| 뉴스 | `news` | |
| 제목 | `title` | |
| 요약 | `summary` | 원문 아님 |
| 링크 | `link` | |
| 원본 | `orig` | original |
| 출처 / 제공처 | `provider` | 예약어 `source` 대체 |
| 발행 | `published` | |
| 키워드 | `keyword` | |
| 수집 | `collect` / `collected` | |
| 잡 | `job` | |
| 실행구분 | `exec_type` | 예약어 `trigger` 대체 |
| 상태 | `status` | |
| 진행/시작 | `started` | |
| 종료 | `finished` | |
| 오류 | `error` | |
| 생성 | `created` | |
| 수정 | `updated` | |

---

## 표준도메인사전 (접미어 → 저장 타입)

| 접미어 | 의미 | 저장 타입 |
|--------|------|-----------|
| `_no` | 업무상 번호 | `integer` / `smallint` |
| `_id` | 대리키 식별자 | `bigint GENERATED ALWAYS AS IDENTITY` |
| `_ymd` | **일자** | **`date`** (문자열 8자리 아님) |
| `_dttm` | 타임스탬프 | `timestamptz` |
| `_amt` | 금액 | `bigint` (원 단위 정수) |
| `_cnt` | 수량 | `integer` |
| `_cd` | 코드 | `text` + `CHECK` |
| `_nm` | 명 | `text` |
| `_desc` | 설명 | `text` |
| `_url` | URL | `text` |
| `_list` | 목록(배열) | `text[]` 등 |

> **`_ymd` 는 `date` 타입이다.** `YYYYMMDD` 문자열을 연상시키지만 문자열로 저장하면
> 날짜 연산마다 캐스팅이 필요해 인덱스가 죽는다(sargable 위반). 이 프로젝트에서
> `draw_ymd` 는 `date` 다.

---

## 표준용어사전 (논리 용어 → 물리 컬럼)

용어 = 표준단어 + 도메인 접미어의 조합. 각 테이블에서 실제로 쓰는 물리 컬럼이다.

| 논리 용어 | 물리명 | 타입 |
|-----------|--------|------|
| 회차번호 | `round_no` | `integer` |
| 추첨일자 | `draw_ymd` | `date` |
| 당첨번호1~6 | `winning_no1`~`winning_no6` | `smallint` |
| 보너스번호 | `bonus_no` | `smallint` |
| 총판매금액 | `total_sell_amt` | `bigint` |
| 1등당첨금액 | `first_prize_amt` | `bigint` |
| 1등당첨자수 | `first_winner_cnt` | `integer` |
| 1등누적당첨금액 | `first_accum_prize_amt` | `bigint` |
| 등위 | `prize_grade_no` | `smallint` |
| 당첨자수 | `winner_cnt` | `integer` |
| 게임당당첨금 | `game_prize_amt` | `bigint` |
| 뉴스식별자 | `news_id` | `bigint` (IDENTITY) |
| 뉴스제목 | `title_nm` | `text` |
| 뉴스요약 | `summary_desc` | `text` |
| 뉴스링크 | `link_url` | `text` |
| 원본링크 | `orig_link_url` | `text` |
| 출처 | `provider_nm` | `text` |
| 발행일시 | `published_dttm` | `timestamptz` |
| 키워드목록 | `keyword_list` | `text[]` |
| 수집일시 | `collected_dttm` | `timestamptz` |
| 실행이력식별자 | `job_log_id` | `bigint` (IDENTITY) |
| 잡명 | `job_nm` | `text` |
| 실행구분 | `exec_type_cd` | `text` + CHECK |
| 진행상태 | `status_cd` | `text` + CHECK |
| 시작일시 | `started_dttm` | `timestamptz` |
| 종료일시 | `finished_dttm` | `timestamptz` |
| 수집건수 | `collected_cnt` | `integer` |
| 오류메시지 | `error_desc` | `text` |
| 생성일시 | `created_dttm` | `timestamptz` |
| 수정일시 | `updated_dttm` | `timestamptz` |

---

## 논리명(한글) ↔ 물리명(영문) 매핑

### 테이블

| 논리명 | 물리명 | 이전(계약 초안) |
|--------|--------|-----------------|
| 로또 회차별 당첨결과 | `lotto_draw` | `lotto_draws` |
| 등위별 당첨정보 | `lotto_prize` | `lotto_prize_tiers` |
| 복권 관련 뉴스 | `lotto_news` | `news_articles` |
| 수집 잡 실행이력 | `collect_job_log` | `job_runs` |

### `lotto_draw` — 로또 회차별 당첨결과

| 논리명 | 물리명 | 타입 | 제약 |
|--------|--------|------|------|
| 회차번호 | `round_no` | `integer` | PK |
| 추첨일자 | `draw_ymd` | `date` | NOT NULL, UNIQUE |
| 당첨번호1 | `winning_no1` | `smallint` | NOT NULL |
| 당첨번호2 | `winning_no2` | `smallint` | NOT NULL |
| 당첨번호3 | `winning_no3` | `smallint` | NOT NULL |
| 당첨번호4 | `winning_no4` | `smallint` | NOT NULL |
| 당첨번호5 | `winning_no5` | `smallint` | NOT NULL |
| 당첨번호6 | `winning_no6` | `smallint` | NOT NULL |
| 보너스번호 | `bonus_no` | `smallint` | NOT NULL |
| 총판매금액 | `total_sell_amt` | `bigint` | NULL (소스 미제공) |
| 1등당첨금액 | `first_prize_amt` | `bigint` | NULL |
| 1등당첨자수 | `first_winner_cnt` | `integer` | NULL |
| 1등누적당첨금액 | `first_accum_prize_amt` | `bigint` | NULL (소스 미제공) |
| 생성일시 | `created_dttm` | `timestamptz` | NOT NULL DEFAULT now() |
| 수정일시 | `updated_dttm` | `timestamptz` | NOT NULL DEFAULT now() |

### `lotto_prize` — 등위별 당첨정보

| 논리명 | 물리명 | 타입 | 제약 |
|--------|--------|------|------|
| 회차번호 | `round_no` | `integer` | PK, FK→lotto_draw |
| 등위 | `prize_grade_no` | `smallint` | PK, CHECK 1~5 |
| 당첨자수 | `winner_cnt` | `integer` | NULL |
| 게임당당첨금 | `game_prize_amt` | `bigint` | NULL |

### `lotto_news` — 복권 관련 뉴스

| 논리명 | 물리명 | 타입 | 제약 |
|--------|--------|------|------|
| 뉴스식별자 | `news_id` | `bigint` IDENTITY | PK |
| 제목 | `title_nm` | `text` | NOT NULL |
| 요약 | `summary_desc` | `text` | NULL |
| 링크 | `link_url` | `text` | NOT NULL, UNIQUE |
| 원본링크 | `orig_link_url` | `text` | NULL |
| 출처 | `provider_nm` | `text` | NOT NULL DEFAULT 'naver' |
| 발행일시 | `published_dttm` | `timestamptz` | NULL |
| 키워드목록 | `keyword_list` | `text[]` | NULL |
| 수집일시 | `collected_dttm` | `timestamptz` | NOT NULL DEFAULT now() |

### `collect_job_log` — 수집 잡 실행이력

| 논리명 | 물리명 | 타입 | 제약 |
|--------|--------|------|------|
| 실행이력식별자 | `job_log_id` | `bigint` IDENTITY | PK |
| 잡명 | `job_nm` | `text` | NOT NULL |
| 실행구분 | `exec_type_cd` | `text` | NOT NULL, CHECK cron/manual |
| 진행상태 | `status_cd` | `text` | NOT NULL, CHECK running/success/failed |
| 시작일시 | `started_dttm` | `timestamptz` | NOT NULL DEFAULT now() |
| 종료일시 | `finished_dttm` | `timestamptz` | NULL |
| 수집건수 | `collected_cnt` | `integer` | NOT NULL DEFAULT 0 |
| 오류메시지 | `error_desc` | `text` | NULL |

---

## 제약·인덱스 명명규칙

| 종류 | 접두 | 패턴 | 예 |
|------|------|------|----|
| 기본키 | `pk_` | `pk_<table>` | `pk_lotto_draw` |
| 외래키 | `fk_` | `fk_<table>_<ref>` | `fk_lotto_prize_round` |
| 유니크 | `uk_` | `uk_<table>_<cols>` | `uk_lotto_news_link_url` |
| 체크 | `ck_` | `ck_<table>_<rule>` | `ck_lotto_draw_ascending` |
| 인덱스 | `ix_` | `ix_<table>_<cols>` | `ix_lotto_news_published_dttm` |

현재 스키마의 전체 목록:

- **PK**: `pk_lotto_draw` · `pk_lotto_prize` · `pk_lotto_news` · `pk_collect_job_log`
- **FK**: `fk_lotto_prize_round`
- **UNIQUE**: `uk_lotto_draw_draw_ymd` · `uk_lotto_news_link_url`
- **CHECK**: `ck_lotto_draw_ascending` · `ck_lotto_draw_no_range` ·
  `ck_lotto_prize_grade` · `ck_collect_job_log_exec_type` · `ck_collect_job_log_status`
- **INDEX**: `ix_lotto_news_published_dttm` · `ix_collect_job_log_job_nm_started`

> `lotto_draw` 에는 별도 보조 인덱스를 두지 않는다. `round_no`(PK)가
> `draw_ymd` 와 단조증가로 대응하여 최신·페이징·최근 N회차 조회를 모두 커버하고,
> 날짜 조회는 `uk_lotto_draw_draw_ymd` 가 겸한다. 근거는 [[db-schema]] 참조.

---

## 예약어 금지 목록

Postgres 에서 따옴표로 감싸면 동작하더라도, ORM·도구가 따옴표를 요구해
사고가 나므로 **이름에 쓰지 않는다.** 이번 재설계에서 교체한 3건:

| 예약어 (이전) | 교체 (현재) | 위치 |
|---------------|-------------|------|
| `trigger` | `exec_type_cd` | `collect_job_log` |
| `rank` | `prize_grade_no` | `lotto_prize` |
| `source` | `provider_nm` | `lotto_news` |

그 밖에 피하는 예약어: `order`, `user`, `table`, `group`, `end`, `limit`, `select`,
`from`, `where`, `desc`, `check`, `column`.

## 금지 표현 금지

`probability` · `confidence` · `accuracy` · `win_rate` · `hit_rate` ·
`expected_value` · `success_rate` 를 테이블·컬럼·제약 이름에 쓰지 않는다.
이 서비스는 당첨을 예측하지 않는다 ([[forbidden-expressions]]).

---

관련: [[db-schema]] · [[api-contract]] · [[worker-jobs]] · [[forbidden-expressions]]
