---
type: ops
title: "배포 (미정)"
description: "배포 환경 미확정. 기존 OCI 계획은 재확인 필요. 결정해야 할 질문 목록"
tags: [ops, tbd]
owner: shared
status: draft
sources: ["work_order/task4_deployment.md", "raw:작업지시서초안_보완.md#14"]
created: 2026-07-09
updated: 2026-08-28
---

# 배포 (미정)

**아직 미정이다. 이 페이지는 아직 신뢰할 수 없다(`status: draft`).** 확정 전까지 배포 관련 결정을 지어내지 않는다.

## 확정된 것

**worker 와 backend 는 별개의 컨테이너로 배포한다.** 같은 호스트·같은 `docker-compose.yml` 안이어도 서비스는 둘로 나눈다. 한 컨테이너에 합치지 않는다 (2026-07-09 결정).

권한 분리가 실제로 작동하려면 **backend 컨테이너에 `app_writer` 자격증명이 존재하지 않아야** 하기 때문이다. 두 프로세스가 같은 환경을 공유하면 `app_reader` 롤은 SQL 인젝션과 코딩 실수는 막지만, 컨테이너가 침해됐을 때는 공격자가 옆에 있는 쓰기 비밀번호로 새 커넥션을 열면 그만이다. 컨테이너를 나누고 `.env_worker` / `.env_backend` 를 각각 주입하면 그 경로가 사라진다 ([[0003-worker-writes-backend-reads]] · [[env-vars]]).

권한과 무관한 이유도 셋 있다. backend 는 torch 때문에 이미지가 **GB 단위**(CUDA 빌드 기준 실측 3.8GB, 아래 조사 기록 참조)인데 worker 에는 필요 없고, worker 는 잡 락 때문에 **정확히 1 프로세스**여야 하는 반면 backend 는 나중에 스케일아웃할 수 있으며, backend 를 재배포할 때마다 worker 의 크론 스케줄이 함께 죽는다. 배포 주기와 스케일 특성이 다른 둘을 묶으면 그 차이가 매번 비용이 된다.

> 만약 자원 제약 때문에 정말 한 컨테이너에 합쳐야 한다면, 그것은 **결정 사항**이므로 ADR 로 기록한다. 그때 잃는 것은 "침해 시 방어" 이고 남는 것은 "SQLi·실수 차단" 이다. 조용히 합치지 않는다.

## 알려진 것

- `work_order/task4_deployment.md` 에 배포 계획 초안이 있으나, **OCI Always Free ARM VM + Docker Compose + GitHub push 자동배포**를 전제로 쓰였다. 이 전제는 **재확인이 필요**하다.
- 그 문서는 SQLite 파일 볼륨 마운트를 전제한다 — 그러나 현재는 Postgres 로 전환 중이므로(`[[migration-sqlite-to-postgres]]`) 그 부분은 이미 낡았다.
- 현재 Postgres 는 사용자의 **로컬 WSL Docker** 에 있다(`[[local-setup]]`). 운영 DB 를 어디에 둘지는 미정이다.
- 3-컴포넌트 구조(worker 8003 / backend 8005 / frontend 3000)라 컨테이너·프록시 구성이 초안(backend + caddy 2개)과 달라진다.

## 결정해야 할 질문 (전부 TBD)

- **운영 DB 를 어디에 두는가?** 로컬 WSL Docker 는 개발용이다. 운영은 관리형 Postgres / VM 자체 호스팅 / 기타 중 무엇인가. → 아래 [조사 기록](#조사-기록--운영-db-와-이미지-무게-2026-08-28-결정-아님) 에 실측과 후보 비교가 있다.
- **백업.** DB 백업 주기·보관 위치·복구 리허설.
- **도메인 / TLS.** 도메인 미확보(`[[trademark-check]]`). 인증서 발급 주체(Caddy/nginx/관리형).
- **worker `/internal/*` 비노출.** 수동 트리거 API 는 `127.0.0.1` 바인딩이 원칙이다. 리버스 프록시(nginx 등)에 **노출하지 않는** 구성을 어떻게 강제하는가.
- **워커 1개 제약.** 잡 락이 프로세스 단위라 다중 워커면 중복 실행된다. 컨테이너 오케스트레이션에서 worker 를 **정확히 1 프로세스**로 강제하는 방법(`[[worker-jobs]]`).
- **ChromaDB 보관.** `backend/data/chroma_words/` 는 36MB 이고 `.gitignore` 되어 git 에 없다. 이미지에 굽기 / 오브젝트 스토리지에서 기동 시 받기 / 재생성 스크립트 커밋 중 무엇인가(`[[0006-keep-chromadb-not-pgvector]]`).

## 조사 기록 — 운영 DB 와 이미지 무게 (2026-08-28, 결정 아님)

사용자 질문("Postgres 를 Docker 로 올리고 백업까지 관리하려니 무겁다, 더 가벼운 방법이 있나")에서 나온 실측과 조사다. **아직 결정이 아니다** — 배포를 정할 때 이 표를 출발점으로 쓴다.

### 실측 (2026-08-28, 개발 PC)

| 항목 | 값 |
|------|-----|
| Postgres 컨테이너 메모리 | **66 MB** |
| DB 전체 크기 | **9.5 MB** (`lotto_news` 352kB · `lotto_draw` 248kB · `collect_job_log` 80kB) |
| backend `.venv` | **5.2 GB** — 그중 `nvidia` **2.7 GB** + `torch` **1.1 GB** |
| `chroma_words` 사전 | 36 MB |
| worker `.venv` | 60 MB |

### ★ 무게는 DB 가 아니라 torch 에 있다

Postgres 는 전체의 1% 남짓이다. DB 를 바꿔서 아끼는 것은 66MB 인데 그 옆에 3.8GB 가 서 있다.

`nvidia` 2.7GB 가 실린 이유는 **개발 PC 에 GPU 가 있어 uv 가 CUDA 빌드를 집었기 때문**이다(`torch 2.13.0+cu130`, `cuda.is_available() = True`). 배포 서버에 GPU 가 없으면 이 2.7GB 는 **한 번도 쓰이지 않은 채 이미지에 실린다.** CPU 전용 휠(`--index-url https://download.pytorch.org/whl/cpu`)로 바꾸면 3.8GB → 200~300MB 수준이다. 꿈해몽은 짧은 단어 하나를 인코딩할 뿐이라 CPU 로 충분하다.

> 이 문서가 종전에 "backend 는 torch 때문에 이미지가 수백 MB" 라고 적은 것은 **과소평가였다.** 실측은 GB 단위다.

배포 무게를 줄이려면 **여기가 10배짜리 레버이고 DB 가 아니다.** 다만 CPU 휠로 바꿨을 때 꿈해몽·추천이 그대로 도는지는 **아직 실측하지 않았다.**

### 운영 DB 후보 비교

| 후보 | 백업 | 유휴 시 | 걸리는 점 |
|------|------|--------|----------|
| **관리형 Neon** | 무료에서도 짧은 복원 창 제공 | scale-to-zero → **요청이 오면 자동 복귀**(콜드 스타트 수백 ms) | 무료 저장 한도 |
| **관리형 Supabase** | ⚠ **무료 티어에 자동 백업 없음.** 일 단위 백업·PITR 은 유료 | ⚠ **7일 미사용 시 프로젝트 일시정지 → 수동 해제** | 백업이 결국 `pg_dump` 직접. 지금 Docker 와 부담이 같아진다 |
| **VM 자체 호스팅(현행)** | 직접 | 항상 켜짐 | 호스트 관리(디스크·업그레이드·재시작)가 남는다 |

⚠ **무료 티어 조건은 자주 바뀐다. 정할 때 직접 확인한다.** 위 내용은 2026-08 시점의 조사이고 근거 문서를 확인하지 않았다.

### SQLite / Turso 로 되돌리지 않는다

"SQLite 를 운영에서 쓴다" 는 흐름은 실재하지만 이 프로젝트에는 맞지 않는다. 위에서 확정한 **worker·backend 컨테이너 분리**가 무의미해지기 때문이다 — SQLite 는 파일이라 두 컨테이너가 같은 볼륨을 공유해야 하고, 그러면 롤 분리도 컨테이너 분리도 함께 사라진다([[0003-worker-writes-backend-reads]]). SQLite 에서 옮겨 온 이유([[0005-postgres-migration]])가 그대로 유효하다.

### 백업 부담의 실제 크기

DB 전체가 9.5MB 이므로 `pg_dump | gzip` 은 **1MB 안팎 파일 하나**다. 주 1회 크론 + 어딘가 복사가 전부이고 복구 리허설도 몇 초다. 즉 선택지는 "관리형으로 옮겨 백업을 위임" vs "Docker 유지 + 크론 세 줄" 인데 후자가 생각보다 가볍다. **관리형의 진짜 이점은 백업보다 호스트를 안 돌봐도 되는 것**이므로 그 관점으로 비교한다.

---

## 관련 문서

- 로컬 셋업: `[[local-setup]]`
- DB 이관: `[[migration-sqlite-to-postgres]]`
- 환경변수: `[[env-vars]]`
- 사이트명·도메인: `[[trademark-check]]`
