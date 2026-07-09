---
type: ops
title: "배포 (미정)"
description: "배포 환경 미확정. 기존 OCI 계획은 재확인 필요. 결정해야 할 질문 목록"
tags: [ops, tbd]
owner: shared
status: draft
sources: ["work_order/task4_deployment.md", "raw:작업지시서초안_보완.md#14"]
created: 2026-07-09
updated: 2026-07-09
---

# 배포 (미정)

**아직 미정이다. 이 페이지는 아직 신뢰할 수 없다(`status: draft`).** 확정 전까지 배포 관련 결정을 지어내지 않는다.

## 확정된 것

**worker 와 backend 는 별개의 컨테이너로 배포한다.** 같은 호스트·같은 `docker-compose.yml` 안이어도 서비스는 둘로 나눈다. 한 컨테이너에 합치지 않는다 (2026-07-09 결정).

권한 분리가 실제로 작동하려면 **backend 컨테이너에 `app_writer` 자격증명이 존재하지 않아야** 하기 때문이다. 두 프로세스가 같은 환경을 공유하면 `app_reader` 롤은 SQL 인젝션과 코딩 실수는 막지만, 컨테이너가 침해됐을 때는 공격자가 옆에 있는 쓰기 비밀번호로 새 커넥션을 열면 그만이다. 컨테이너를 나누고 `.env_worker` / `.env_backend` 를 각각 주입하면 그 경로가 사라진다 ([[0003-worker-writes-backend-reads]] · [[env-vars]]).

권한과 무관한 이유도 셋 있다. backend 는 torch 때문에 이미지가 수백 MB 인데 worker 에는 필요 없고, worker 는 잡 락 때문에 **정확히 1 프로세스**여야 하는 반면 backend 는 나중에 스케일아웃할 수 있으며, backend 를 재배포할 때마다 worker 의 크론 스케줄이 함께 죽는다. 배포 주기와 스케일 특성이 다른 둘을 묶으면 그 차이가 매번 비용이 된다.

> 만약 자원 제약 때문에 정말 한 컨테이너에 합쳐야 한다면, 그것은 **결정 사항**이므로 ADR 로 기록한다. 그때 잃는 것은 "침해 시 방어" 이고 남는 것은 "SQLi·실수 차단" 이다. 조용히 합치지 않는다.

## 알려진 것

- `work_order/task4_deployment.md` 에 배포 계획 초안이 있으나, **OCI Always Free ARM VM + Docker Compose + GitHub push 자동배포**를 전제로 쓰였다. 이 전제는 **재확인이 필요**하다.
- 그 문서는 SQLite 파일 볼륨 마운트를 전제한다 — 그러나 현재는 Postgres 로 전환 중이므로(`[[migration-sqlite-to-postgres]]`) 그 부분은 이미 낡았다.
- 현재 Postgres 는 사용자의 **로컬 WSL Docker** 에 있다(`[[local-setup]]`). 운영 DB 를 어디에 둘지는 미정이다.
- 3-컴포넌트 구조(worker 8003 / backend 8005 / frontend 3000)라 컨테이너·프록시 구성이 초안(backend + caddy 2개)과 달라진다.

## 결정해야 할 질문 (전부 TBD)

- **운영 DB 를 어디에 두는가?** 로컬 WSL Docker 는 개발용이다. 운영은 관리형 Postgres / VM 자체 호스팅 / 기타 중 무엇인가.
- **백업.** DB 백업 주기·보관 위치·복구 리허설.
- **도메인 / TLS.** 도메인 미확보(`[[trademark-check]]`). 인증서 발급 주체(Caddy/nginx/관리형).
- **worker `/internal/*` 비노출.** 수동 트리거 API 는 `127.0.0.1` 바인딩이 원칙이다. 리버스 프록시(nginx 등)에 **노출하지 않는** 구성을 어떻게 강제하는가.
- **워커 1개 제약.** 잡 락이 프로세스 단위라 다중 워커면 중복 실행된다. 컨테이너 오케스트레이션에서 worker 를 **정확히 1 프로세스**로 강제하는 방법(`[[worker-jobs]]`).
- **ChromaDB 보관.** `backend/data/chroma_words/` 는 36MB 이고 `.gitignore` 되어 git 에 없다. 이미지에 굽기 / 오브젝트 스토리지에서 기동 시 받기 / 재생성 스크립트 커밋 중 무엇인가(`[[0006-keep-chromadb-not-pgvector]]`).

## 관련 문서

- 로컬 셋업: `[[local-setup]]`
- DB 이관: `[[migration-sqlite-to-postgres]]`
- 환경변수: `[[env-vars]]`
- 사이트명·도메인: `[[trademark-check]]`
