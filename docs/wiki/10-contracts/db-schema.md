---
type: contract
title: "Postgres 스키마와 롤 권한"
description: "lotto_draw · lotto_prize · lotto_news · collect_job_log 스키마, DB↔API 매핑, app_writer/app_reader 권한 분리"
tags: [contract, db, security]
owner: worker
status: stable
sources: ["worker/scripts/ddl/001_initial_schema.sql", "backend/app/models.py", "backend/data/lotto.db"]
created: 2026-07-09
updated: 2026-07-09
---

# Postgres 스키마와 롤 권한

이 페이지는 **계약**이다. 코드와 어긋나면 코드가 틀린 것이다 ([스키마의 "계약의 특별 지위"](../SCHEMA.md#계약의-특별-지위) 참조).

스키마의 유일한 소유자는 **워커 세션**이다. Alembic 마이그레이션은 `worker/migrations/` 에만 존재한다. 백엔드는 스키마를 읽기만 하고, 프론트엔드는 스키마의 존재를 모른다 — 백엔드의 [[api-contract|REST 계약]]만 안다.

**실행 가능한 DDL 원본은 `worker/scripts/ddl/001_initial_schema.sql` 이다.** 이름·타입 규약은 [[db-naming-standard]] 가 정본이고, 왜 표준화했는지는 [[0010-db-naming-standard]] 에 있다.

---

## 테이블 네 개

| 물리명 | 논리명 | 비고 |
|--------|--------|------|
| `lotto_draw` | 로또 회차별 당첨결과 | `round_no` 자연키 PK |
| `lotto_prize` | 등위별 당첨정보 | **당분간 비어 있다** |
| `lotto_news` | 복권 관련 뉴스 | 원문 미저장 |
| `collect_job_log` | 수집 잡 실행이력 | 크론/수동 구분 |

여기에 Alembic 이 `alembic_version` 테이블을 하나 더 만든다. 스키마 버전 한 행짜리 관리용이며 계약의 대상이 아니다. 백엔드는 이 테이블을 읽지 않는다.

### Alembic 은 `--autogenerate` 를 쓰지 않는다

워커는 SQLAlchemy ORM 모델을 정의하지 않는다(`target_metadata = None`). 스키마의 정본은 `worker/scripts/ddl/001_initial_schema.sql` 이고, 마이그레이션은 그 DDL 을 `op.execute()` 로 **그대로 옮겨 적는다.**

모델을 따로 두면 정본이 둘이 되고, 둘이 어긋나는 날 이 계약이 깨진다. `--autogenerate` 는 metadata 가 없으면 빈 마이그레이션을 만들 뿐이니 **수동 리비전만 작성한다.**

```bash
uv run alembic revision -m "설명"      # --autogenerate 를 붙이지 않는다
uv run alembic upgrade head --sql      # 적용 전 나갈 DDL 을 눈으로 확인
uv run alembic upgrade head
```

### `lotto_draw`

```sql
CREATE TABLE lotto_draw (
    round_no                integer     NOT NULL,   -- 회차번호(자연키)
    draw_ymd                date        NOT NULL,   -- 추첨일자
    winning_no1 ~ winning_no6  smallint NOT NULL,   -- 당첨번호 (오름차순)
    bonus_no                smallint    NOT NULL,
    total_sell_amt          bigint,                 -- 항상 NULL
    first_prize_amt         bigint,
    first_winner_cnt        integer,
    first_accum_prize_amt   bigint,                 -- 항상 NULL
    created_dttm            timestamptz NOT NULL DEFAULT now(),
    updated_dttm            timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT pk_lotto_draw          PRIMARY KEY (round_no),
    CONSTRAINT ck_lotto_draw_ascending CHECK (winning_no1 < winning_no2 AND ... AND winning_no5 < winning_no6),
    CONSTRAINT ck_lotto_draw_no_range  CHECK (winning_no1 >= 1 AND winning_no6 <= 45 AND bonus_no BETWEEN 1 AND 45),
    CONSTRAINT uk_lotto_draw_draw_ymd  UNIQUE (draw_ymd)
);
```

**`winning_no1..6` 은 항상 오름차순으로 저장한다.** 관례가 아니라 `CHECK` 로 강제되는 불변식이다. 예측 모듈이 조합을 집합으로 다루면서도 DB 에서는 정렬 순서를 신뢰하기 때문이다. SQLite 시절에는 관례였고 강제되지 않았다.

범위 검사가 양끝(`winning_no1 >= 1`, `winning_no6 <= 45`)만 보는 것은 의도적이다. 오름차순 제약과 결합하면 여섯 개 전부가 범위에 든다.

**`uk_lotto_draw_draw_ymd`** 는 현행 계약에 없던 신규 제약이다. 주 1회 추첨이므로 추첨일자와 회차는 1:1 이다. 실데이터 1,231행에서 중복 일자가 0건임을 확인하고 추가했다. 무결성을 강제하는 동시에 날짜 조회용 인덱스를 겸한다.

**항상 NULL 인 컬럼이 둘 있다.** `total_sell_amt` 와 `first_accum_prize_amt` 는 현재 유일한 수집 소스인 네이버 검색 위젯에 노출되지 않는다 ([[dhlottery-blocked]]). 컬럼을 지우지 않는 이유는 동행복권 공식 API 가 복구되면 채울 수 있기 때문이다. UI 는 `-` 로 표시한다.

`updated_dttm` 은 SQLite 에 없던 컬럼이다. 공식 API 복구 후 과거 회차를 enrich 할 때 무엇이 언제 갱신됐는지 알아야 한다.

**보조 인덱스를 두지 않는다.** 조회 패턴(최신 1건 / 회차 역순 페이징 / 단일 회차 / 최근 N회차 스캔)이 전부 `round_no` PK 로 해결되고, 날짜 조회는 `uk_lotto_draw_draw_ymd` 가 겸한다. 주당 1행 늘어나는 1,231행짜리 테이블에 인덱스를 더 얹을 이유가 없다.

### `lotto_prize`

```sql
CREATE TABLE lotto_prize (
    round_no        integer  NOT NULL,
    prize_grade_no  smallint NOT NULL,   -- 등위 1~5 (예약어 rank 대체)
    winner_cnt      integer,
    game_prize_amt  bigint,

    CONSTRAINT pk_lotto_prize       PRIMARY KEY (round_no, prize_grade_no),
    CONSTRAINT fk_lotto_prize_round FOREIGN KEY (round_no) REFERENCES lotto_draw (round_no) ON DELETE CASCADE,
    CONSTRAINT ck_lotto_prize_grade CHECK (prize_grade_no BETWEEN 1 AND 5)
);
```

**이 테이블은 당분간 비어 있다.** 초안 8.1 이 회차 상세 페이지에 등위별 데이터를 요구하지만 현재 수집 소스에 2~5등 정보가 없다. 미리 만드는 이유는 [[api-contract]] 의 회차 상세 응답 형태를 지금 확정해 두기 위해서다. 데이터가 없으면 API 는 빈 배열을 반환하고 프론트는 해당 섹션을 숨긴다.

**1등 정보는 `lotto_draw` 에 중복 저장된다.** 정규화 위반으로 보이지만 의도적이다 — 최신 회차 카드와 목록 조회가 매번 조인하지 않아도 되고, 1등 정보는 네이버 소스에서 확보되는 반면 2~5등은 아니라서 **수집 시점이 다르다.**

### `lotto_news`

```sql
CREATE TABLE lotto_news (
    news_id         bigint      GENERATED ALWAYS AS IDENTITY,
    title_nm        text        NOT NULL,
    summary_desc    text,                    -- 네이버 API 요약. 원문 아님
    link_url        text        NOT NULL,
    orig_link_url   text,
    provider_nm     text        NOT NULL DEFAULT 'naver',   -- 예약어 source 대체
    published_dttm  timestamptz,
    keyword_list    text[],
    collected_dttm  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT pk_lotto_news         PRIMARY KEY (news_id),
    CONSTRAINT uk_lotto_news_link_url UNIQUE (link_url)
);
CREATE INDEX ix_lotto_news_published_dttm ON lotto_news (published_dttm DESC);
```

`link_url` 의 `UNIQUE` 가 중복 수집을 막는 유일한 장치다. 워커는 `INSERT ... ON CONFLICT (link_url) DO NOTHING` 을 쓴다.

`summary_desc` 는 **네이버 API 가 돌려주는 요약문**이지 기사 원문이 아니다. 원문을 저장하면 저작권 문제가 생기고 초안 14.3 의 "뉴스는 원문 복제보다 요약/분류/키워드 중심" 원칙에 어긋난다 ([[naver-search-api]]).

### `collect_job_log`

```sql
CREATE TABLE collect_job_log (
    job_log_id      bigint      GENERATED ALWAYS AS IDENTITY,
    job_nm          text        NOT NULL,    -- 'lotto' | 'news'
    exec_type_cd    text        NOT NULL,    -- 'cron' | 'manual'  (예약어 trigger 대체)
    status_cd       text        NOT NULL,    -- 'running' | 'success' | 'failed'
    started_dttm    timestamptz NOT NULL DEFAULT now(),
    finished_dttm   timestamptz,
    collected_cnt   integer     NOT NULL DEFAULT 0,
    error_desc      text,

    CONSTRAINT pk_collect_job_log           PRIMARY KEY (job_log_id),
    CONSTRAINT ck_collect_job_log_exec_type CHECK (exec_type_cd IN ('cron', 'manual')),
    CONSTRAINT ck_collect_job_log_status    CHECK (status_cd IN ('running', 'success', 'failed'))
);
CREATE INDEX ix_collect_job_log_job_nm_started ON collect_job_log (job_nm, started_dttm DESC);
```

현행 `crawl_logs` (`backend/app/models.py:20-31`) 를 대체한다. `job_nm` 이 생겨 로또와 뉴스를 구분하고, `exec_type_cd` 가 생겨 크론과 수동 실행을 구분한다 — 수동 트리거가 언제 왜 쓰였는지 추적할 수 있어야 한다 ([[worker-jobs]]).

**`job_nm` 에는 `CHECK` 를 걸지 않는다.** 잡이 늘어날 때마다 마이그레이션을 강제하고 싶지 않다. 잡 목록의 정본은 [[worker-jobs]] 다.

`start_round` / `end_round` 는 옮기지 않았다. 로또 잡에만 의미가 있어 뉴스 잡에서는 항상 NULL 이 된다. `collected_cnt` 로 충분하다.

---

## DB 컬럼 ↔ API 응답 필드 매핑 ★

**DB 는 표준화됐지만 API 응답 필드는 바뀌지 않는다.** 공개 계약이 DB 스키마에 결합되면 컬럼 하나 바꿀 때 프론트가 깨진다. **백엔드가 매핑한다** ([[0010-db-naming-standard]]).

회차 객체:

| API 필드 ([[api-contract]]) | DB 컬럼 |
|---|---|
| `round_no` | `round_no` |
| `draw_date` | `draw_ymd` (ISO date 로 직렬화) |
| `numbers[]` | `winning_no1` … `winning_no6` |
| `bonus` | `bonus_no` |
| `first_win_amount` | `first_prize_amt` |
| `first_winner_count` | `first_winner_cnt` |
| `total_sell_amount` | `total_sell_amt` (거의 항상 `null`) |
| `first_accum_amount` | `first_accum_prize_amt` (거의 항상 `null`) |

`prize_tiers[]`: `rank` ← `prize_grade_no` · `winner_count` ← `winner_cnt` · `prize_per_game` ← `game_prize_amt`

뉴스: `title` ← `title_nm` · `description` ← `summary_desc` · `link` ← `link_url` · `orig_link` ← `orig_link_url` · `source` ← `provider_nm` · `pub_date` ← `published_dttm` · `keywords` ← `keyword_list`

사이트맵: `rounds[].lastmod` ← `draw_ymd` · `news[].id` ← `news_id` · `news[].lastmod` ← `published_dttm`

---

## 롤과 권한

두 개의 로그인 롤을 만든다. **이것이 이 계약의 핵심이다** — 백엔드가 DB 에 쓰는 실수를 코드 리뷰가 아니라 권한으로 막는다 ([[0003-worker-writes-backend-reads]]).

실행 가능한 전체 스크립트는 `worker/scripts/init_roles.sql` 이다. 비밀번호는 psql 변수로 주입한다.

### 전제 — DB 는 이미 존재한다

개발 환경은 WSL Docker 의 `postgres:18` 컨테이너(`bskim-dev-pg18`, 호스트 포트 **5179**)다.

| 항목 | 값 |
|------|-----|
| 데이터베이스 | `prod_db` (이미 존재) |
| DB 소유자 | `prod_user` — **슈퍼유저 아님.** 개발자가 DBeaver 로 붙는 계정 |
| `public` 스키마 소유자 | `prod_user` |
| 슈퍼유저 | `postgres` |

**`CREATE DATABASE` 를 하지 않는다.** `public` 스키마 소유권도 `prod_user` 에게 그대로 둔다 — 뺏으면 DBeaver 작업이 깨진다.

> 이름에 관한 주의: 로컬 개발 DB 인데 `prod_db` / `prod_user` 라는 이름을 쓰고 있다. 언젠가 진짜 운영 DB 가 생기면 혼동한다. **사용자가 인지하고 감수한 위험이다.** 운영 배포 시에는 다른 이름을 쓴다.

```sql
CREATE ROLE app_writer LOGIN PASSWORD :writer_pw;   -- worker
CREATE ROLE app_reader LOGIN PASSWORD :reader_pw;   -- backend
ALTER ROLE app_writer NOCREATEDB NOCREATEROLE NOSUPERUSER;
ALTER ROLE app_reader NOCREATEDB NOCREATEROLE NOSUPERUSER;

GRANT  CONNECT ON DATABASE prod_db TO   prod_user, app_writer, app_reader;
REVOKE CONNECT ON DATABASE prod_db FROM PUBLIC;   -- 기본값은 전체 허용이다

\connect prod_db

-- public 스키마 소유자는 prod_user 유지. app_writer 에게 생성 권한만 준다.
GRANT  USAGE, CREATE ON SCHEMA public TO   app_writer;
GRANT  USAGE         ON SCHEMA public TO   app_reader;
REVOKE CREATE        ON SCHEMA public FROM PUBLIC;

-- ★ prod_user 가 app_writer 의 테이블을 다루게 한다 (아래 설명)
GRANT app_writer TO prod_user;

GRANT SELECT ON ALL TABLES    IN SCHEMA public TO app_reader;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO app_reader;
```

`app_writer` 는 자기가 만든 테이블의 소유자이므로 별도 `GRANT INSERT/UPDATE/DELETE` 가 필요 없다. 소유자는 자기 객체에 모든 권한을 갖는다.

### 함정: DBeaver 에서 테이블이 안 보인다

**증상.** 워커가 마이그레이션을 돌려 테이블을 만들었다. `app_writer` 로는 잘 보인다. 그런데 `prod_user` 로 DBeaver 에 붙으면 테이블 목록이 비어 있거나 `permission denied` 가 난다.

**원인.** 테이블 소유자는 그것을 만든 `app_writer` 다. `prod_user` 는 DB 소유자일 뿐 **슈퍼유저가 아니라서** 남의 테이블에 대한 권한이 없다. DB 를 소유한다고 그 안의 객체를 소유하는 것이 아니다.

**해법.** `prod_user` 를 `app_writer` 의 멤버로 만든다. 롤은 기본이 `INHERIT` 이라 `SET ROLE` 없이 바로 상속받는다.

```sql
GRANT app_writer TO prod_user;
```

이러면 `prod_user` 는 `app_writer` 가 만든 모든 객체를 조회·수정·삭제할 수 있다. 개발용 DB 이므로 적절하다. **운영에서는 이 멤버십을 부여하지 않는다.**

### 함정: 새 테이블이 생기면 백엔드가 죽는다

**증상.** 워커가 Alembic 마이그레이션으로 새 테이블을 하나 추가했다. 배포 후 백엔드가 그 테이블을 조회하는 순간 `permission denied for table <새테이블>` 로 500 을 뱉는다. 개발 환경에서는 재현되지 않는다 — 개발자는 보통 슈퍼유저로 접속하기 때문이다.

**원인.** `GRANT SELECT ON ALL TABLES` 는 **실행 시점에 존재하는 테이블에만** 적용된다. 미래에 만들어질 테이블에는 소급되지 않는다.

**해법.** 기본 권한을 미리 선언한다. 이 문장이 빠지면 마이그레이션마다 백엔드가 깨진다.

`ALTER DEFAULT PRIVILEGES` 는 **명시된 롤이 앞으로 만드는 객체**에만 적용된다. `FOR ROLE` 을 생략하면 *그 문장을 실행한 롤*이 대상이 된다. 초기화 스크립트는 슈퍼유저로 돌리고 마이그레이션은 `app_writer` 로 돌리므로, **`FOR ROLE app_writer` 를 반드시 명시한다.** 생략하면 문장은 성공하지만 아무 효과가 없고, 몇 주 뒤 마이그레이션 직후에야 증상이 나타난다.

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE app_writer IN SCHEMA public
    GRANT SELECT ON TABLES TO app_reader;
ALTER DEFAULT PRIVILEGES FOR ROLE app_writer IN SCHEMA public
    GRANT SELECT ON SEQUENCES TO app_reader;

-- prod_user 가 DBeaver 에서 직접 만든 것도 backend 가 읽게 한다
ALTER DEFAULT PRIVILEGES FOR ROLE prod_user IN SCHEMA public
    GRANT SELECT ON TABLES TO app_reader;
ALTER DEFAULT PRIVILEGES FOR ROLE prod_user IN SCHEMA public
    GRANT SELECT ON SEQUENCES TO app_reader;
```

설정됐는지는 `pg_default_acl` 로 확인한다. 비어 있으면 위 문장이 효과 없이 통과한 것이다.

```sql
SELECT pg_get_userbyid(defaclrole) AS grantor, defaclobjtype, defaclacl FROM pg_default_acl;
```

### 함정: Alembic 이 `app_writer` 비밀번호를 평문으로 뱉는다 ★

**실제로 겪었다 (2026-07-09).** 비밀번호가 터미널에 노출되어 교체해야 했다.

**증상.** `alembic upgrade head` 가 이런 예외로 죽는다.

```
ValueError: invalid interpolation syntax in
'postgresql+psycopg://app_writer:비밀번호가여기그대로@localhost:5179/prod_db' at position 42
```

**원인 두 가지가 겹친다.**

1. `alembic.ini` 는 `ConfigParser` 라 값에 든 `%` 를 **보간 문법으로 해석**한다. `sqlalchemy.engine.URL.create()` 는 비밀번호의 특수문자를 퍼센트 인코딩하므로(`!` → `%21`), 비번에 특수문자가 있으면 `config.set_main_option("sqlalchemy.url", ...)` 이 여기서 터진다.
2. 더 나쁜 것은 **그 예외 메시지가 URL 전체를 평문으로 출력**한다는 점이다. 비밀번호가 터미널·CI 로그·대화 기록에 그대로 남는다.

**해법.** `alembic.ini` 를 거치지 말고 `migrations/env.py` 에서 엔진을 직접 만든다. `URL` 객체는 문자열로 렌더링하지 않는 한 비번을 노출하지 않는다.

```python
# migrations/env.py — set_main_option 을 쓰지 않는다
_url = URL.create(drivername="postgresql+psycopg", username=settings.PG_USER,
                  password=settings.PG_PASSWORD, host=settings.PG_HOST,
                  port=settings.PG_PORT, database=settings.PG_DB)

def run_migrations_online() -> None:
    connectable = create_engine(_url, poolclass=pool.NullPool)   # ini 를 거치지 않는다
    ...
```

오프라인 모드(`--sql`)에도 URL 을 넘기지 않는다. `dialect_name="postgresql"` 만 주면 된다 — SQL 을 찍는 데 접속정보가 필요 없다.

**`alembic.ini` 에 `sqlalchemy.url` 을 적지 않는다.** 적으면 비밀번호가 git 에 커밋된다.

같은 이유로 워커의 psycopg 접속 문자열도 f-string 으로 잇지 않고 `psycopg.conninfo.make_conninfo()` 에 맡긴다. 비번에 공백이나 작은따옴표가 섞이면 `key=value` 파싱이 어긋나 엉뚱한 오류로 나타난다.

### 검증

백엔드 롤이 정말 쓰지 못하는지 확인한다. 이 테스트가 실패하면 권한 분리가 무의미하다.

```sql
-- app_reader 로 접속한 뒤
INSERT INTO lotto_draw (round_no, draw_ymd, winning_no1, winning_no2, winning_no3,
                        winning_no4, winning_no5, winning_no6, bonus_no)
VALUES (99999, '2099-01-01', 1, 2, 3, 4, 5, 6, 7);
-- 기대: ERROR: permission denied for table lotto_draw
```

---

## 현재 데이터 규모

`backend/data/lotto.db` 실측 (2026-07-09):

- `lotto_results` **1,231행**, `round_no` **1~1231 연속** (빠진 회차 없음)
- 오름차순 위반 0건, 번호 범위 위반 0건, `draw_date` 중복 0건
- `crawl_logs` 9행 (전부 `status='success'`) — **이관하지 않는다**

이관 절차와 컬럼 매핑은 [[migration-sqlite-to-postgres]] 에 있다.

---

## 이 계약을 바꾸려면

1. 세 세션에 미치는 영향을 조사한다. [[api-contract]] 의 응답 필드는 위 매핑표를 통해 컬럼에서 도출된다.
2. 사용자 승인을 받는다.
3. 이 페이지와 `worker/scripts/ddl/001_initial_schema.sql` 을 함께 고치고, Alembic 마이그레이션을 쓰고, `log.md` 에 기록한다.

관련: [[component-boundaries]] · [[db-naming-standard]] · [[worker-jobs]] · [[env-vars]] · [[0005-postgres-migration]] · [[0010-db-naming-standard]]
