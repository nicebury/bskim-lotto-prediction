-- ============================================================
-- 행운상자 — Postgres 롤 초기화 (1회성)
--
-- 전제: 데이터베이스 prod_db 가 이미 존재하고 소유자는 prod_user 다.
--       prod_user 는 슈퍼유저가 아니며, 개발자가 DBeaver 로 붙는 계정이다.
--       이 스크립트는 DB 를 만들지 않고 롤과 권한만 설정한다.
--
-- 슈퍼유저(postgres)로 실행한다. 비밀번호는 psql 변수로 주입한다.
--
--   docker exec -i bskim-dev-pg18 psql -U postgres \
--     -v writer_pw="'실제비번'" -v reader_pw="'실제비번'" \
--     < worker/scripts/init_roles.sql
--
-- 계약: docs/wiki/10-contracts/db-schema.md
-- ============================================================

-- ── 1. 롤 ────────────────────────────────────────────────
-- app_writer : worker. 테이블을 만들고 쓴다. Alembic 실행 주체
-- app_reader : backend. 읽기 전용

CREATE ROLE app_writer LOGIN PASSWORD :writer_pw;
CREATE ROLE app_reader LOGIN PASSWORD :reader_pw;

ALTER ROLE app_writer NOCREATEDB NOCREATEROLE NOSUPERUSER;
ALTER ROLE app_reader NOCREATEDB NOCREATEROLE NOSUPERUSER;


-- ── 2. 데이터베이스 접속 권한 ──────────────────────────────
-- 기본값은 PUBLIC 에게 CONNECT 를 허용한다. 회수하고 명시적으로 준다.
-- prod_user 는 DB 소유자라 암묵적으로 모든 권한을 갖지만 명시해 둔다.

GRANT  CONNECT ON DATABASE prod_db TO   prod_user, app_writer, app_reader;
REVOKE CONNECT ON DATABASE prod_db FROM PUBLIC;


-- ── 3. 여기서부터 prod_db 내부 ────────────────────────────
\connect prod_db

-- public 스키마의 소유자는 prod_user 다. 뺏지 않는다.
-- app_writer 에게 테이블 생성 권한만 준다.
GRANT USAGE, CREATE ON SCHEMA public TO app_writer;
GRANT USAGE          ON SCHEMA public TO app_reader;

-- PUBLIC 롤의 CREATE 권한 회수 (PG15+ 는 기본적으로 없지만 명시)
REVOKE CREATE ON SCHEMA public FROM PUBLIC;


-- ── 4. ★ DBeaver 문제 해결 ────────────────────────────────
-- app_writer 가 만든 테이블의 소유자는 app_writer 다.
-- prod_user 는 슈퍼유저가 아니므로 그 테이블을 볼 수 없다.
-- prod_user 를 app_writer 의 멤버로 만들면 권한을 상속한다.
-- (롤은 기본적으로 INHERIT 이므로 SET ROLE 없이 바로 쓸 수 있다)

GRANT app_writer TO prod_user;


-- ── 5. 기존 객체 (현재 0개. 재실행 대비) ───────────────────
GRANT SELECT ON ALL TABLES    IN SCHEMA public TO app_reader;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO app_reader;


-- ── 6. ★ 미래 객체 ────────────────────────────────────────
-- 이걸 빠뜨리면 worker 가 새 테이블을 만들 때마다 backend 가
-- "permission denied for table ..." 로 500 을 낸다.
--
-- FOR ROLE 이 핵심이다. ALTER DEFAULT PRIVILEGES 는 "명시된 롤이
-- 앞으로 만드는 객체" 에만 적용된다. 지금 postgres 로 실행 중이므로
-- FOR ROLE 을 생략하면 문장은 성공하지만 아무 효과가 없다.

ALTER DEFAULT PRIVILEGES FOR ROLE app_writer IN SCHEMA public
    GRANT SELECT ON TABLES TO app_reader;
ALTER DEFAULT PRIVILEGES FOR ROLE app_writer IN SCHEMA public
    GRANT SELECT ON SEQUENCES TO app_reader;

-- prod_user 가 DBeaver 에서 직접 만든 테이블도 backend 가 읽게 한다.
ALTER DEFAULT PRIVILEGES FOR ROLE prod_user IN SCHEMA public
    GRANT SELECT ON TABLES TO app_reader;
ALTER DEFAULT PRIVILEGES FOR ROLE prod_user IN SCHEMA public
    GRANT SELECT ON SEQUENCES TO app_reader;


-- ── 7. 검증 ──────────────────────────────────────────────
\echo ''
\echo '=== 롤 속성 (super/createdb/createrole 이 모두 f 여야 함) ==='
SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolcanlogin, rolinherit
  FROM pg_roles WHERE rolname IN ('app_writer','app_reader','prod_user') ORDER BY 1;

\echo ''
\echo '=== 롤 멤버십 (prod_user 가 app_writer 의 멤버여야 함) ==='
SELECT r.rolname AS member, g.rolname AS member_of
  FROM pg_auth_members m
  JOIN pg_roles r ON r.oid = m.member
  JOIN pg_roles g ON g.oid = m.roleid
 WHERE g.rolname = 'app_writer';

\echo ''
\echo '=== 기본 권한 (비어 있으면 6번이 효과 없이 통과한 것) ==='
SELECT pg_get_userbyid(defaclrole) AS grantor, defaclobjtype AS objtype, defaclacl AS acl
  FROM pg_default_acl;

\echo ''
\echo '=== 스키마 권한 (public 소유자는 prod_user 유지) ==='
SELECT nspname, pg_get_userbyid(nspowner) AS owner, nspacl
  FROM pg_namespace WHERE nspname = 'public';
