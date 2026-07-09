---
type: decision
title: "ADR 0010 — DB 명명을 한국형 표준으로 재설계하고, API 필드는 바꾸지 않는다"
description: "SQLite 컬럼명을 그대로 옮기지 않는다. 표준단어·도메인 접미어를 적용하되 공개 API 는 DB 에 결합시키지 않는다"
tags: [decision, db]
owner: worker
status: stable
sources: ["worker/scripts/ddl/001_initial_schema.sql", "backend/app/models.py"]
created: 2026-07-09
updated: 2026-07-09
---

# ADR 0010 — DB 명명 표준화

## 결정

Postgres 스키마를 **한국형 표준화 체계**(표준단어사전 · 표준도메인사전 · 표준용어사전)로 재설계한다. SQLite 컬럼명을 그대로 옮기지 않는다.

**API 응답 필드명은 바꾸지 않는다.** 백엔드가 DB 컬럼을 API 필드로 매핑한다.

설계 규약은 [[db-naming-standard]], 결과 스키마는 [[db-schema]], 실행 DDL 은 `worker/scripts/ddl/001_initial_schema.sql` 이다.

## 맥락

[[0005-postgres-migration|SQLite → Postgres 이관]]을 준비하면서 초기 계약은 기존 컬럼명(`lotto_results`, `num1..num6`, `first_win_amount`)을 거의 그대로 옮겼다. 워커·백엔드 세션이 아직 착수하지 않은 지금이 **이름을 바꿀 수 있는 마지막 저렴한 시점**이다. 세션이 코드를 쓰기 시작하면 이름 변경은 세 세션 동시 재작업이 된다.

## 왜 표준화하는가

**예약어가 셋 있었다.** `job_runs.trigger`, `lotto_prize_tiers.rank`, `news_articles.source`. Postgres 에서 비예약어라 동작은 하지만, ORM·마이그레이션 도구·수작업 쿼리가 계속 따옴표를 요구한다. 언젠가 누군가 `SELECT trigger FROM ...` 을 쓰고 파서와 싸운다. 이름 하나 바꾸면 영원히 사라지는 비용이다.

**주석이 하나도 없었다.** 개발자는 DBeaver 로 이 DB 를 본다. `first_accum_amount` 가 무엇인지 컬럼 이름만으로는 알 수 없고, 그 답은 위키에 있는데 DBeaver 에는 위키가 없다. 이제 모든 테이블·컬럼에 `COMMENT ON` 이 붙는다.

**어휘가 제각각이었다.** `total_sell_amount` / `first_winner_count` / `collected_at` 이 각각 다른 방식으로 "금액", "수량", "시각" 을 표현했다. 접미어를 도메인으로 고정하면(`_amt` `_cnt` `_dttm`) 컬럼 이름만 보고 타입을 안다. 새 컬럼을 추가할 때 이름을 두고 고민하지 않는다.

**타입 관례도 낡았다.** `BIGSERIAL` 은 표준 SQL 의 `GENERATED ALWAYS AS IDENTITY` 로 대체됐다. 후자는 `INSERT` 로 대리키를 덮어쓰는 실수를 막는다.

## 왜 API 는 바꾸지 않는가

**공개 계약이 DB 스키마에 결합되면 안 되기 때문이다.**

API 응답 필드를 `first_prize_amt` 로 바꾸면, 나중에 DB 컬럼을 한 번 더 정리할 때마다 프론트엔드 코드와 검색엔진에 노출된 JSON 구조가 함께 흔들린다. 프론트 세션은 DB 의 존재를 모르는 것이 설계 의도다 ([[component-boundaries]]).

반대로 API 필드명을 그대로 두면 백엔드에 매핑 계층이 하나 생긴다. 그 비용은 컬럼 목록 하나 분량이고, 얻는 것은 **DB 와 공개 계약의 독립**이다. 매핑표는 [[db-schema]] 에 있다.

**부수 효과 하나**: API 필드 `rank`, `source` 는 SQL 예약어와 무관하다. JSON 키이지 식별자가 아니다. 그래서 DB 만 고치면 된다.

## `_ymd` 는 `date` 타입이다

한국 공공부문 표준에서 `_ymd` 는 보통 `CHAR(8)` 문자열(`YYYYMMDD`)을 뜻한다. **이 프로젝트에서는 `date` 다.**

문자열로 저장하면 날짜 연산마다 캐스팅이 필요해 인덱스가 무력화된다(sargable 위반). 이 서비스는 "최근 N회차", "다음 추첨 D-day", `sitemap.xml` 의 `lastmod` 처럼 날짜를 계속 계산한다. 접미어는 표준을 따르되 타입은 옳게 고른다.

## 신규 제약 하나 — `uk_lotto_draw_draw_ymd`

현행 계약에 없던 `UNIQUE (draw_ymd)` 를 추가했다. 주 1회 추첨이므로 추첨일자와 회차는 1:1 이다.

**실데이터로 검증했다**: `lotto.db` 의 1,231행에서 중복 일자 0건. 이 제약은 무결성을 강제하는 동시에 날짜 조회 인덱스를 겸하므로, 별도 인덱스를 만들지 않는다.

## 기각한 대안

**최소 정리만 (예약어와 제약명만 수정).** 변경 폭이 작다. 그러나 주석 부재와 어휘 불일치가 그대로 남고, 새 테이블을 추가할 때마다 같은 논쟁을 반복한다. 사용자가 요구한 "표준화해서 새로 설계" 에도 미치지 못한다.

**DB 와 API 를 함께 표준화.** 매핑 계층이 없어 코드가 단순해진다. 그러나 공개 API 가 DB 스키마에 묶이고, `api-contract.md` 와 프론트 전체를 함께 바꿔야 한다. 이 서비스에서 API 는 SEO·프론트가 의존하는 **외부 계약**이다.

## 결과

- 테이블명 넷이 전부 바뀐다: `lotto_draws`→`lotto_draw`, `lotto_prize_tiers`→`lotto_prize`, `news_articles`→`lotto_news`, `job_runs`→`collect_job_log`.
- 백엔드는 매핑 계층을 구현한다. 근거는 [[db-schema]] 의 매핑표.
- 이관 스크립트의 컬럼 매핑이 바뀐다 ([[migration-sqlite-to-postgres]]).
- DDL 원본(`worker/scripts/ddl/001_initial_schema.sql`)과 Alembic 마이그레이션이 **어긋나면 안 된다.** Alembic 이 적용의 정본이고 `.sql` 은 그것이 옮겨 적는 참조다.
- 앞으로 스키마 설계는 `postgres-db-expert` 에이전트를 쓴다.

## 되돌리려면

되돌리지 않는다. 워커·백엔드가 착수한 뒤에는 비용이 급격히 커진다.

관련: [[db-naming-standard]] · [[db-schema]] · [[api-contract]] · [[0005-postgres-migration]] · [[migration-sqlite-to-postgres]]
