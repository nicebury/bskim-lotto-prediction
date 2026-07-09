---
type: decision
title: "ADR 0008 — Python 3.13 을 쓰되 torch>=2.13 을 핀하고 상한도 건다"
description: "torch 2.11 은 3.13 에서 import 시 크래시한다. 2.13 은 3.13/3.14 를 공식 지원한다"
tags: [decision, ops, pitfall]
owner: backend
status: stable
sources: ["backend/pyproject.toml", "backend/.python-version"]
created: 2026-07-09
updated: 2026-07-09
---

# ADR 0008 — Python 3.13 + torch 하한·상한 핀

## 결정

세 Python 컴포넌트 모두 uv + **Python 3.13** 을 쓴다.

백엔드는 `pyproject.toml` 에 `torch>=2.13` 하한을 명시하고, `requires-python = ">=3.13,<3.14"` 로 **상한도** 건다. 첫 `uv sync` 직후 import 스모크 테스트를 통과시킨다.

## 맥락 — 과거에 무슨 일이 있었나

**증상.** 2026-07-08, `uv sync` 후 `import app.main` 이 실패했다.

```
IndentationError: expected an indented block after function definition
  torch/_jit_internal.py, _check_overload_body → ast.parse
```

**원인.** `pyproject.toml` 의 `requires-python = ">=3.10"` 에 **상한이 없었다.** uv 는 사용 가능한 가장 새로운 인터프리터를 골랐고, 그것이 Python 3.13.8(그리고 원래 venv 는 3.14)이었다. 당시 `torch 2.11.0` 의 JIT 오버로드 파서가 새 Python 의 AST 표현을 처리하지 못하고 죽었다. torch 는 `sentence-transformers` → `transformers` 경유로 딸려 온다 ([[dream-pipeline]]).

**당시 해법.** `backend/.python-version` 을 `3.11` 로 고정했다.

## 왜 이제 3.13 이 가능한가

PyPI 기준 **`torch 2.13.0` 은 Python 3.13 과 3.14 를 공식 지원 분류자에 포함**한다 (2026-07-09 확인). 문제는 Python 3.13 이 아니라 그 시점의 torch 버전이었다.

따라서 3.13 을 쓰려면 **torch 를 충분히 새 버전으로 올리는 것**이 조건이다. `torch>=2.13` 을 명시적으로 핀한다.

## 왜 상한도 거는가

**상한이 없었던 것이 애초 사고의 원인이기 때문이다.**

`>=3.13` 만 쓰면 uv 는 다시 가장 새로운 인터프리터를 집는다. Python 3.15 가 나오는 순간 같은 종류의 사고가 재발한다 — torch 가 아직 지원하지 않는 인터프리터 위에서. 하한만 걸고 상한을 생략하는 것은 이 사고를 정확히 반복하는 방법이다.

```toml
requires-python = ">=3.13,<3.14"
```

Python 을 올리는 것은 **의도적인 결정**이어야 한다. uv 가 대신 내리게 두지 않는다.

## 검증 — 반드시 통과시킨다

```bash
uv sync
uv run python -c "import torch; print(torch.__version__)"
```

이 명령이 실패하면 3.13 을 포기하고 **백엔드만** 3.12 로 내린다. 워커와 프론트는 영향받지 않는다.

## 워커는 이 문제가 없다

**워커에는 ML 의존성이 전혀 없다.** `httpx`, `apscheduler`, `psycopg`, `alembic`, `fastapi`, `uvicorn` 뿐이다. torch 도, transformers 도 없다. 따라서 워커는 3.13 을 제약 없이 쓴다.

이것이 [[0001-monorepo-3-sessions|워커를 분리한]] 실질적 이득 중 하나다. 무거운 의존성의 위험이 한 컴포넌트에 격리된다. 워커 컨테이너 이미지도 훨씬 작아진다.

## 함정: venv 를 sudo 로 만들지 않는다

**증상.** `uv run` 이 `Failed to query Python interpreter ... Permission denied` 로 실패한다.

**원인.** 과거에 `sudo uv sync` 로 만든 venv 의 인터프리터 심볼릭 링크가 `/root/.local/share/uv/...` 를 가리켰다. 일반 사용자가 읽을 수 없다.

**해법.** `rm -rf backend/.venv && uv sync` 를 **일반 사용자로** 실행한다. 이 저장소에서 `uv` 나 venv 생성을 sudo 로 돌리지 않는다.

## 결과

- `backend/.python-version` 을 `3.13` 으로 갱신한다.
- 세 컴포넌트의 `pyproject.toml` 에 모두 `requires-python` 상한을 건다.
- Docker 이미지의 베이스도 `python:3.13-slim` 으로 맞춘다. 로컬과 컨테이너의 인터프리터가 다르면 이 종류의 버그가 배포 후에만 나타난다.

## 되돌리려면

torch 가 3.13 에서 다시 깨지면 백엔드를 3.12 로 내린다. 워커는 그대로 3.13 을 유지한다 — 함께 내릴 이유가 없다.

관련: [[dream-pipeline]] · [[0006-keep-chromadb-not-pgvector]] · [[local-setup]] · [[0001-monorepo-3-sessions]]
