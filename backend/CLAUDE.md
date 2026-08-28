# CLAUDE.md — 세션 B: 웹 백엔드

루트 `CLAUDE.md` 의 규칙이 여기에도 적용된다. 아래는 이 세션만의 제약이다.
실행법·트러블슈팅은 `README.md`, 설계 근거는 `docs/wiki/` 에 있다.

## 책임

Postgres 를 **읽어** 계산하고 JSON 으로 제공한다.

## 소유

- `backend/**`
- `docs/wiki/10-contracts/api-contract.md` 의 **구현** (계약 자체의 변경은 승인 필요)

## 절대 하지 않는 것

- **DB 쓰기.** `app_reader` 롤이라 시도해도 거부된다. 시도 자체를 하지 않는다
- 스키마 마이그레이션 (Alembic 은 워커 소유)
- 외부 크롤링, 스케줄링
- 워커의 `/internal/*` 프록시 — **백엔드는 워커의 존재를 모른다**
- `worker/` 또는 `frontend/` 의 코드 수정
- `backend/data/chroma_words/` 에 **직접** 쓰기. 이 사전은 `.gitignore` 되어 git 에 없고 원본 데이터도 없다 — 직접 넣은 변경은 이 PC 에만 남고 배포하면 사라진다.
  단어를 더할 때는 `data/custom_words.json`(git 에 들어간다) 에 적고 `scripts/add_custom_words.py --apply` 로 반영한다. **실행 전 백엔드 서버를 멈춘다.** 절차는 `docs/wiki/40-domain/dream-pipeline.md`

## 매 턴 지킬 것

- **응답 필드에 `probability` `win_rate` `accuracy` `confidence` `hit_rate` 를 쓰지 않는다.** 조합의 성향(`odd_even` `high_low` `sum` `hot_count` `has_consecutive`)만 사실로 서술한다. 이건 스타일이 아니라 정책이다
- `/api/lotto/recommend` 응답에 `disclaimer` 필드를 **반드시** 포함한다
- 예측·꿈해몽 모듈을 **재작성하지 않는다.** SQLite 접근부만 psycopg 로 바꾼다
- `predictor.predict()` 는 동기 함수로 두고, 라우터에서 `asyncio.to_thread` 로 감싼다
- 무거운 numpy·임베딩 작업으로 이벤트 루프를 막지 않는다
- `403 permission denied` 를 사용자에게 흘리지 않는다. 500 으로 감싸고 서버 로그에 원문을 남긴다

## 환경과 의존성

**가상환경은 uv 가 관리한다.** `python -m venv` / `pip install` 금지. `uv add` · `uv remove` · `uv run` · `uv sync` 만 쓰고 `uv.lock` 을 커밋한다. **`uv` 를 `sudo` 로 실행하지 않는다.**

환경변수 파일은 `.env` 가 아니라 **`.env_backend`** 다. `SettingsConfigDict(env_file=".env_backend")`

`pyproject.toml` 에 `torch>=2.13` 하한과 `requires-python = ">=3.13,<3.14"` **상한을 함께** 건다. 상한이 없으면 `uv sync` 가 최신 인터프리터를 집어 과거 사고가 재발한다. 첫 `uv sync` 직후 `uv run python -c "import torch"` 를 반드시 통과시킨다.

## 먼저 읽을 위키

| 문서 | 내용 |
|------|------|
| `docs/wiki/10-contracts/component-boundaries.md` | ★ **가장 먼저.** 소유 경계와 세션 간 접점 |
| `docs/wiki/10-contracts/api-contract.md` | 엔드포인트와 **표현 규약** |
| `docs/wiki/10-contracts/api-contract-stats.md` | 통계 전용 계약. `window`·기간 조회·구간 메타 |
| `docs/wiki/10-contracts/db-schema.md` | 읽을 테이블과 롤 권한 |
| `docs/wiki/40-domain/prediction-algorithm.md` | 앙상블·몬테카를로. 문서-코드 불일치 기록 |
| `docs/wiki/40-domain/dream-pipeline.md` | 꿈해몽. 첫 요청 20초 함정 |
| `docs/wiki/40-domain/forbidden-expressions.md` | 금지 표현 |

## 완료 기준

워커가 채운 DB 에 대해 계약의 전 엔드포인트가 200 을 반환한다.
**쓰기 시도가 권한 오류로 실패하는 테스트가 있다.**
`sets=3&seed=1` 을 두 번 호출하면 같은 결과가 나온다.
