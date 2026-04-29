# 작업지시서: Oracle Cloud(OCI) Docker 배포 + CI/CD

## 1. 목적
로컬에서 개발 완료된 `bskim-lotto-prediction` (FastAPI + Vite/React)
서비스를 **Oracle Cloud Infrastructure(OCI) Always Free ARM VM**
에 Docker Compose 로 상시 구동하고, GitHub push 시 자동 빌드·배포되는
**무중단(롤링) CI/CD 파이프라인**을 구축한다.

---

## 2. 최종 아키텍처 개요

```
                 ┌────────────────────────── GitHub ──────────────────────────┐
                 │  push → Actions: lint + build (arm64) → ghcr.io push       │
                 │                                  │                         │
                 │                                  ▼                         │
                 │                    SSH (deploy user, key auth)             │
                 └─────────────────────────────────┬──────────────────────────┘
                                                   │
                                                   ▼
┌──────────────────────── OCI VM (Ampere A1, Ubuntu 22.04 LTS, arm64) ─────────────────────────┐
│                                                                                               │
│  ┌─────────── docker-compose ─────────────────────────────────────────────────────────────┐   │
│  │                                                                                        │   │
│  │   caddy  ──(80/443 → 내부)──►  backend(FastAPI, :8002)                                 │   │
│  │     │                                   │                                              │   │
│  │     └── 정적서빙: /srv/frontend/dist    └── volumes:                                    │   │
│  │        (Vite build 결과물)                 - lotto-data       → /app/data  (sqlite)    │   │
│  │                                            - chroma-data      → /app/data/chroma_words │   │
│  │                                            - hf-cache         → /root/.cache/huggingface│  │
│  │                                                                                        │   │
│  └────────────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                               │
│  ┌──────────────────── Cron: 매일 03:00 KST ──────────────────────────┐                       │
│  │   /opt/lotto/scripts/backup.sh → OCI Object Storage (sqlite tar.gz) │                       │
│  └─────────────────────────────────────────────────────────────────────┘                       │
└───────────────────────────────────────────────────────────────────────────────────────────────┘
                                                   │
                                                   ▼
                                 사용자 브라우저  (https://lotto.example.com)
```

**주요 결정:**
- **VM 스펙:** Ampere A1 `VM.Standard.A1.Flex`, 2 OCPU / 12 GB RAM (Always Free 한도 내)
  - AMD Always Free(1/8 OCPU · 1GB RAM) 는 `sentence-transformers` 메모리 불가 → 반드시 ARM 사용
- **리버스 프록시 = Caddy** (HTTPS 자동 발급, 설정 파일 한 개로 끝남)
- **컨테이너 레지스트리 = GHCR** (GitHub Container Registry, 퍼블릭 무료)
- **DB = SQLite 파일 볼륨 마운트** (CLAUDE.md 결정 유지 — `journal_mode=DELETE`)
- **ChromaDB 데이터 = 이미지에 COPY** (~15MB, 변경 빈도 낮음)

---

## 3. 사전 준비물 체크리스트

### 계정/도메인
- [ ] OCI 테넌시 + Always Free 쿼터 확인 (`VM.Standard.A1.Flex` 가용성)
- [ ] 도메인 1개 (없으면 DuckDNS 같은 무료 서브도메인도 가능)
- [ ] GitHub 저장소 (현재 로컬 repo 를 GitHub 에 push)

### 로컬 선행 작업
- [ ] `backend/Dockerfile` 작성 (아래 5.1)
- [ ] `frontend/Dockerfile` 작성 (static build only, 산출물만 추출) (5.2)
- [ ] `deploy/docker-compose.yml` 작성 (5.3)
- [ ] `deploy/Caddyfile` 작성 (5.4)
- [ ] `.github/workflows/deploy.yml` 작성 (7.1)
- [ ] `scripts/backup.sh` 작성 (8.2)
- [ ] `.dockerignore` 각 컨텍스트에 추가
- [ ] ChromaDB 데이터(`chroma_words/`) 를 `backend/data/` 로 복사하여 이미지 빌드에 포함 또는 Object Storage 별도 관리 여부 결정

### 시크릿/키
- [ ] SSH 배포용 키페어 생성 (`ed25519`) — 공개키는 VM `~/.ssh/authorized_keys`, 비공개키는 GitHub Secret
- [ ] GHCR 푸시용 PAT (`write:packages`) — GitHub Secret
- [ ] (선택) OCI CLI 키페어 — Object Storage 백업용

---

## 4. Phase 1 — OCI 인프라 프로비저닝

### 4.1 네트워크 (VCN)
| 항목 | 값 |
|-----|----|
| VCN | `lotto-vcn` / 10.0.0.0/16 |
| Public Subnet | 10.0.1.0/24 (Regional) |
| Internet Gateway | attached |
| Security List Ingress | 22 (SSH, 본인 IP 만), 80, 443 (0.0.0.0/0) |
| Security List Egress | all (기본) |

> **중요:** OCI 는 VCN 보안 리스트 + VM 내부 iptables(`ufw`) **둘 다** 통과해야 함.
> 포트 안 열리면 99% 여기서 막힘.

### 4.2 Compute 인스턴스
| 항목 | 값 |
|-----|----|
| Shape | `VM.Standard.A1.Flex` |
| OCPU / RAM | 2 OCPU / 12 GB |
| OS | Canonical Ubuntu 22.04 (aarch64) |
| Boot Volume | 50 GB (Always Free 200GB 내) |
| Public IP | Reserved (Ephemeral 은 재시작 시 바뀜) |
| SSH 키 | 사전 준비한 공개키 |

### 4.3 도메인 연결
- A 레코드 `lotto.example.com → <Reserved Public IP>`
- TTL 300s 로 초기 시험, 안정되면 3600s

### 4.4 (선택) OCI Object Storage — 백업용
- 네임스페이스 / 버킷 `lotto-backup` 생성 (Always Free 20GB)
- Pre-Authenticated Request(PAR) 또는 User API Key 로 업로드 인증

---

## 5. Phase 2 — Dockerization

### 5.1 `backend/Dockerfile`
**요지:** `uv` 로 lock 파일 기반 복원, 멀티스테이지(빌드 의존성 제거), ChromaDB 데이터 포함.

```dockerfile
# syntax=docker/dockerfile:1.7
FROM python:3.12-slim-bookworm AS base
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    UV_LINK_MODE=copy \
    HF_HOME=/root/.cache/huggingface
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential curl git \
    && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir "uv>=0.4"

FROM base AS builder
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

FROM python:3.12-slim-bookworm AS runtime
ENV PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH" \
    HF_HOME=/root/.cache/huggingface
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgomp1 ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/.venv /app/.venv
COPY app ./app
COPY scripts ./scripts
# ChromaDB 벡터 데이터 (빌드 시점에 repo 에 포함되어야 함)
COPY data/chroma_words ./data/chroma_words
EXPOSE 8002
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8002/health || exit 1
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8002", "--workers", "1"]
```

**주의사항:**
- **워커는 1개** (CLAUDE.md — 크롤 중복 방지가 단일 프로세스 전제)
- ARM 빌드를 위해 GitHub Actions 에서 `docker buildx --platform=linux/arm64` 사용 (7.1)
- `sentence-transformers` 최초 실행 시 모델 `upskyy/kf-deberta-multitask` (~500MB) 다운로드 → **`hf-cache` 볼륨 마운트 필수** (재시작마다 다시 받지 않도록)

### 5.2 `frontend/Dockerfile`
빌드 전용 — 산출물은 `caddy` 가 볼륨으로 읽음.

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
# 산출물만 남기는 최소 이미지 (runtime 은 nginx/caddy 아님)
FROM busybox:1.36
COPY --from=build /app/dist /dist
CMD ["sh", "-c", "cp -r /dist/. /export/ && echo 'frontend assets exported'"]
```

> 이 컨테이너는 `docker compose run --rm frontend-build` 로 **초기 1회/배포 시마다** 실행되어 볼륨에 `dist/` 를 복사하고 종료한다. Caddy 는 해당 볼륨을 읽기 전용으로 마운트.

### 5.3 `deploy/docker-compose.yml`
```yaml
name: lotto
services:
  backend:
    image: ghcr.io/${GH_OWNER}/lotto-backend:${TAG:-latest}
    restart: unless-stopped
    environment:
      - TZ=Asia/Seoul
      - PYTHONUNBUFFERED=1
    volumes:
      - lotto-data:/app/data
      - hf-cache:/root/.cache/huggingface
    expose:
      - "8002"
    networks: [web]

  frontend-build:
    image: ghcr.io/${GH_OWNER}/lotto-frontend:${TAG:-latest}
    volumes:
      - frontend-dist:/export
    restart: "no"

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - frontend-dist:/srv/frontend:ro
      - caddy-data:/data
      - caddy-config:/config
    depends_on:
      - backend
    networks: [web]

volumes:
  lotto-data:
  hf-cache:
  frontend-dist:
  caddy-data:
  caddy-config:

networks:
  web:
```

### 5.4 `deploy/Caddyfile`
```caddyfile
{
    email admin@example.com
}

lotto.example.com {
    encode zstd gzip

    # API + 스케줄러 생성 sitemap/robots 는 백엔드로
    @api {
        path /api/* /health /sitemap.xml /robots.txt
    }
    reverse_proxy @api backend:8002

    # 나머지는 SPA 정적 파일
    root * /srv/frontend
    try_files {path} /index.html
    file_server

    # 기본 보안 헤더
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options nosniff
        Referrer-Policy strict-origin-when-cross-origin
        -Server
    }
}
```

### 5.5 CORS 업데이트
`backend/app/config.py` 의 `CORS_ORIGINS` 에 운영 도메인 추가(빌드 분리되었으니 동일 오리진이면 굳이 필요 없지만 향후 도메인 분리 대비):
```python
CORS_ORIGINS: list[str] = [
    "http://localhost:1989",
    "http://127.0.0.1:1989",
    "https://lotto.example.com",
]
```

### 5.6 `.dockerignore` (backend)
```
.venv
__pycache__
*.pyc
data/lotto.db
data/lotto.db-*
.git
.pytest_cache
```

### 5.7 로컬 검증 (배포 전 필수)
```bash
# ARM 에뮬 빌드 (Apple Silicon 이 아니면 qemu 사용)
docker buildx create --use --name lotto-builder || true
docker buildx build --platform linux/arm64 -t lotto-backend:local backend/ --load
docker buildx build --platform linux/arm64 -t lotto-frontend:local frontend/ --load

# compose 로 전 스택 기동 (로컬은 TAG=local, ports 매핑 조정)
GH_OWNER=myname TAG=local docker compose -f deploy/docker-compose.yml up -d
curl -fsS http://localhost/health
```

---

## 6. Phase 3 — 서버 초기 셋업

### 6.1 VM 접속 및 기본 보안
```bash
ssh ubuntu@<PUBLIC_IP>
sudo apt update && sudo apt upgrade -y
sudo apt install -y ca-certificates curl git ufw fail2ban

# UFW
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# OCI iptables 기본 규칙 영구화 (netfilter-persistent) — 재부팅 후 규칙 유지
sudo apt install -y iptables-persistent
sudo netfilter-persistent save
```

### 6.2 Docker 설치 (공식 apt repo)
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker ubuntu
newgrp docker
docker compose version   # v2 플러그인 포함 확인
```

### 6.3 배포 디렉토리 + 전용 사용자
```bash
sudo mkdir -p /opt/lotto
sudo chown ubuntu:ubuntu /opt/lotto
cd /opt/lotto
# Caddyfile, docker-compose.yml, .env, scripts/ 는 CI 가 scp/rsync 로 업로드
```

### 6.4 초기 데이터 시딩 (수동 1회)
```bash
# lotto.db 최초 시딩 — GitHub 덤프 기반 (CLAUDE.md 참조)
docker compose run --rm backend \
  python -m scripts.seed_from_github
```

---

## 7. Phase 4 — CI/CD (GitHub Actions)

### 7.1 `.github/workflows/deploy.yml`
**트리거:** `main` push, 수동 `workflow_dispatch`.

```yaml
name: deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

concurrency:
  group: deploy-prod
  cancel-in-progress: false

env:
  REGISTRY: ghcr.io
  IMAGE_BACKEND: ghcr.io/${{ github.repository_owner }}/lotto-backend
  IMAGE_FRONTEND: ghcr.io/${{ github.repository_owner }}/lotto-frontend

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-qemu-action@v3
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build & push backend (arm64)
        uses: docker/build-push-action@v6
        with:
          context: ./backend
          platforms: linux/arm64
          push: true
          tags: |
            ${{ env.IMAGE_BACKEND }}:latest
            ${{ env.IMAGE_BACKEND }}:${{ github.sha }}
          cache-from: type=gha,scope=backend
          cache-to: type=gha,mode=max,scope=backend

      - name: Build & push frontend (arm64)
        uses: docker/build-push-action@v6
        with:
          context: ./frontend
          platforms: linux/arm64
          push: true
          tags: |
            ${{ env.IMAGE_FRONTEND }}:latest
            ${{ env.IMAGE_FRONTEND }}:${{ github.sha }}
          cache-from: type=gha,scope=frontend
          cache-to: type=gha,mode=max,scope=frontend

  deploy:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Upload compose + Caddyfile
        uses: appleboy/scp-action@v0.1.7
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          source: "deploy/docker-compose.yml,deploy/Caddyfile,scripts/backup.sh"
          target: /opt/lotto/
          strip_components: 1

      - name: Remote deploy
        uses: appleboy/ssh-action@v1.2.0
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          script: |
            set -euo pipefail
            cd /opt/lotto
            cat > .env <<EOF
            GH_OWNER=${{ github.repository_owner }}
            TAG=${{ github.sha }}
            EOF
            echo "${{ secrets.GHCR_READ_TOKEN }}" | docker login ghcr.io -u ${{ github.actor }} --password-stdin
            docker compose pull
            # frontend-build 는 정적 산출물만 볼륨에 밀어넣고 종료
            docker compose run --rm frontend-build
            # 백엔드/Caddy 무중단 교체
            docker compose up -d --remove-orphans backend caddy
            docker image prune -af --filter "until=168h"
```

### 7.2 GitHub Secrets
| 이름 | 용도 |
|-----|-----|
| `DEPLOY_HOST` | OCI VM Public IP |
| `DEPLOY_USER` | `ubuntu` |
| `DEPLOY_SSH_KEY` | 배포용 ed25519 비공개키 |
| `GHCR_READ_TOKEN` | VM 이 GHCR 에서 pull 하기 위한 PAT (`read:packages`) — 레포 private 일 때 필요, public 이면 생략 가능 |

> **GITHUB_TOKEN 은 자동 주입**이라 별도 등록 불필요.

### 7.3 롤백 절차
```bash
# GHCR 에서 이전 커밋 해시로 재배포
ssh ubuntu@<HOST>
cd /opt/lotto
echo "TAG=<previous_sha>" >> .env     # 기존 TAG 라인 교체
docker compose pull backend frontend-build
docker compose run --rm frontend-build
docker compose up -d backend caddy
```

---

## 8. Phase 5 — 운영

### 8.1 로그
- `docker compose logs -f backend` — 스케줄러 크롤 / 예측 요청 확인
- Caddy 액세스 로그는 기본 stdout → `journalctl -u docker.service` 또는 `docker logs caddy`

### 8.2 백업 `scripts/backup.sh`
```bash
#!/usr/bin/env bash
set -euo pipefail
TS=$(date +%Y%m%d-%H%M%S)
OUT=/tmp/lotto-${TS}.tar.gz
docker run --rm -v lotto_lotto-data:/data -v /tmp:/backup alpine \
  tar -czf /backup/lotto-${TS}.tar.gz -C /data .
# OCI Object Storage 업로드 (사전: OCI CLI 또는 PAR URL 사용)
oci os object put --bucket-name lotto-backup --file "$OUT" --force
find /tmp -name 'lotto-*.tar.gz' -mtime +3 -delete
```
`crontab -e`:
```
0 3 * * *  /opt/lotto/scripts/backup.sh >> /var/log/lotto-backup.log 2>&1
```

### 8.3 모니터링 (최소)
- **UptimeRobot** (무료) → `https://lotto.example.com/health` 5분 주기
- VM 리소스: `htop`, `docker stats` (수동) — 초기엔 충분
- 로그 알림이 필요해지면 Grafana Loki / Betterstack 확장

### 8.4 업그레이드
- Python 의존성 변경 시: `backend/pyproject.toml` 수정 → `uv lock` → 커밋 → Actions 자동 빌드
- OS 패키지: `sudo unattended-upgrades` 활성화(보안 패치만 자동)

---

## 9. 시크릿 · 환경변수 · 경로 정리

| 구분 | 키/경로 | 보관 위치 |
|-----|--------|---------|
| SSH 배포 비공개키 | `DEPLOY_SSH_KEY` | GitHub Secret |
| SSH 배포 공개키 | `~/.ssh/authorized_keys` | OCI VM |
| GHCR pull 토큰 | `GHCR_READ_TOKEN` | GitHub Secret (repo private 시) |
| 도메인 | `lotto.example.com` | Caddyfile, frontend `index.html`, `robots.txt`, `sitemap.xml` |
| OCI API 키 (백업) | `~/.oci/config` | OCI VM (ubuntu 홈, 0600) |
| SQLite 데이터 | `volume: lotto-data` | VM (블록 볼륨) |
| HF 모델 캐시 | `volume: hf-cache` | VM (블록 볼륨) |
| ChromaDB 벡터 | 이미지 COPY `/app/data/chroma_words` | GHCR 이미지 내부 |

---

## 10. 리스크 / 오픈 이슈

| # | 리스크 | 완화책 |
|---|-------|-------|
| R1 | ARM 빌드에서 `torch` / `chromadb` wheel 호환성 이슈 가능 | 로컬 qemu 빌드로 선검증(5.7). 실패 시 `torch` CPU-only aarch64 wheel 명시 고정 |
| R2 | HuggingFace 모델 다운로드 네트워크 실패 → 첫 요청 지연 | 배포 후 1회 워밍업 `curl -X POST /api/dream/analyze ...` 수동 호출. 모델 캐시 볼륨으로 이후 재시작 빠름 |
| R3 | OCI Always Free VM이 **비활성 회수 정책**에 걸림 (CPU <20% 7일 등) | UptimeRobot 주기 호출이 트래픽 역할. 문제되면 A1 무료 유지 조건 문서 재확인 |
| R4 | ChromaDB 벡터를 이미지에 포함 → 이미지 크기 ↑ (~15MB 추가) | 수용 가능. 데이터 증가 시 Object Storage 에서 런타임 `initContainer` 로 동기화로 전환 |
| R5 | SQLite + Docker volume 에서 동시쓰기 충돌 | 워커 1개 + APScheduler 로 단일 프로세스 유지 (CLAUDE.md 결정) |
| R6 | 네이버 위젯 크롤 차단 | 이미 주간 1회로 제한. 실패 시 `/api/crawl/status` 가 `failed` 반환 — 수동 개입 |
| R7 | 도메인 DNS 전파 전 Caddy 가 인증서 발급 실패 | 배포 전 `dig lotto.example.com` 로 A 레코드 확인, 안 되면 Caddy 재시작 |

---

## 11. 실행 순서 요약 (체크리스트)

- [ ] **Day 1**: OCI 테넌시/VCN/VM 프로비저닝, 도메인 A 레코드, SSH 접속 확인
- [ ] **Day 1**: VM 에 Docker + UFW + OCI Security List 통과 확인(`curl http://<IP>`)
- [ ] **Day 2**: 로컬에서 `backend/Dockerfile`, `frontend/Dockerfile` 작성 및 `buildx --platform=linux/arm64` 로 검증
- [ ] **Day 2**: `deploy/docker-compose.yml`, `deploy/Caddyfile` 로 VM 에 수동 첫 배포 → HTTPS 발급 확인
- [ ] **Day 2**: `scripts/seed_from_github` 1회 실행 → `/api/dashboard` 정상 응답
- [ ] **Day 3**: GitHub Secrets 등록, `.github/workflows/deploy.yml` 머지 → 자동 배포 동작 확인
- [ ] **Day 3**: UptimeRobot 등록, 백업 cron 설치
- [ ] **Day 4**: 롤백 리허설(과거 SHA 로 재배포), README 에 운영 메모 추가

---

## 12. 참고 / 결정 근거

- **왜 Caddy?** Let's Encrypt 자동 + 설정 파일 간결 + SPA `try_files` 지원. nginx 도 가능하나 certbot 별도 관리 필요.
- **왜 GHCR?** GitHub Actions 와 권한 통합(`GITHUB_TOKEN`). Docker Hub 무료 대비 pull rate limit 없음.
- **왜 Ampere A1?** 무료 한도 내에서 12GB RAM 확보 가능 — DeBERTa 모델(~500MB) + FastAPI + ChromaDB 동시 구동에 AMD 1GB 로는 불가.
- **왜 워커 1개?** `asyncio.Lock` 기반 크롤 중복 방지가 프로세스 단위 (CLAUDE.md). 다중 워커 시 중복 크롤 가능.
- **왜 SQLite 유지?** WSL 에서 WAL 이슈로 DELETE 모드 고정된 결정(CLAUDE.md). 리눅스 VM 에선 WAL 가능하지만 **운영에서 되돌리지 말 것** — 어차피 단일 프로세스라 이득 없음.
