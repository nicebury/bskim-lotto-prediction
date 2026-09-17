---
type: contract
title: "운영자 전용 API 계약 — 수집 로그 화면"
description: "POST /api/admin/login·logout, GET /api/admin/job-logs. 아이디+비밀번호+OTP 2단계, 커서 페이징"
tags: [contract, api, security]
owner: backend
status: stable
sources: ["backend/app/routers/admin.py", "docs/wiki/10-contracts/api-contract.md"]
created: 2026-09-08
updated: 2026-09-08
---

# 운영자 전용 API 계약

`GET /api/admin/job-logs` 와 그 앞의 로그인 둘. **2026-09-08 에 [[api-contract]] 에서 분리했다** — 인증·쿠키·브루트포스·페이징까지 규칙이 전부 달라 98줄을 차지했고, [SCHEMA](../SCHEMA.md) 의 원자성 규칙(한 페이지는 한 주제)에 걸렸다.

**옮겼을 뿐 계약의 지위는 같다.** [[api-contract]] 의 [표현 규약](api-contract.md#표현-규약-)과 [오류 형식](api-contract.md#오류-형식)이 그대로 적용된다.

---

### 운영자 전용 — 수집 로그

**공개 API 가 아니다.** 사이트 운영자 한 사람만 쓰는 화면의 데이터원이고, 나머지 엔드포인트와 규칙이 다르다.

```
POST /api/admin/login   { "username": "...", "password": "...", "otp": "123456" }
                                                → 200 + httpOnly 쿠키 / 401 / 429 / 503
POST /api/admin/logout                          → 204 (쿠키 삭제)
GET  /api/admin/job-logs?job_name=&status=&limit=50&before_id=
```

#### 인증 — 아이디 + 비밀번호 + OTP 2단계 (2026-08-31 변경)

종전에는 `ADMIN_TOKEN` 64자 랜덤 하나를 입력받았다. 외우지 못해 늘 복사해 붙여야 했고, 사용자가 아이디·비밀번호 방식을 요청했다.

⚠ **아이디·비밀번호'만' 으로 바꾸면 종전보다 약해진다.** 사람이 기억하는 비밀번호는 64자 랜덤보다 훨씬 추측하기 쉽다. 그래서 **OTP(TOTP, RFC 6238)를 함께 받는다** — 외우기 쉬운 비밀번호를 쓰더라도 30초마다 바뀌는 여섯 자리가 그 약점을 덮는다. Microsoft Authenticator · Google Authenticator 등 표준 앱이면 무엇이든 된다.

**계정 테이블은 여전히 만들지 않는다.** 계정 하나를 환경변수에 둔다([[env-vars]]) — 쓰는 사람이 한 명이고, 계정 시스템은 그 자체로 공격면이자 유지보수 대상이다.

| 규칙 | 내용 |
|---|---|
| 요청 | `username` · `password` · `otp`(6자리) **셋 다 필수**. 하나라도 빠지면 `422` |
| 비교 | **`secrets.compare_digest`.** `==` 를 쓰지 않는다(타이밍 공격) |
| 판정 순서 | **셋을 전부 검사한 뒤 한 번에 판정한다.** 아이디가 틀렸다고 곧바로 반환하면 비밀번호 해시 계산(0.1초)이 안 돌아 **응답 시간으로 아이디의 존재 여부가 새어 나간다** |
| 비밀번호 저장 | **원문을 두지 않는다.** `scrypt$n$r$p$salt$hash` 해시를 환경변수에 둔다. 파라미터를 해시 문자열에 담아, 나중에 강도를 올려도 기존 자격증명이 깨지지 않게 한다 |
| OTP 창 | `valid_window=1`(앞뒤 30초). 사람이 읽고 입력하는 사이에 주기가 바뀌고 폰·서버 시계도 몇 초 어긋난다. **더 넓히지 않는다** — 넓힐수록 한 코드가 유효한 시간이 길어진다 |
| 빈 값 | 자격증명 넷 중 **하나라도** 비면 모든 `/api/admin/*` 가 503. 빈 문자열끼리 비교하면 통과해 아무나 들어온다 — 인증이 없는 것보다 나쁘다. ⚠ 특히 **OTP 비밀키가 없다고 비밀번호만으로 통과시키지 않는다.** 2단계를 켜 두었다고 믿는 사람에게 1단계만 돌려주는 것이 가장 나쁜 실패다 |
| 쿠키 | `httpOnly` · `SameSite=Lax` · `Path=/` · 만료 12시간 |
| 쿠키 `Secure` 판단 | ⚠ **설정(`ADMIN_COOKIE_SECURE`)으로 정한다.** 2026-08-28 에는 요청 스킴에서 정하기로 했으나 **그 판단이 이 구조에서 틀린다.** 브라우저는 프론트와만 말하고 **Next 서버가 백엔드를 중계**하므로 백엔드에 닿는 요청은 내부망 평문 HTTP 다 — 사용자가 HTTPS 를 써도 백엔드는 알 방법이 없다. 스킴이나 `X-Forwarded-Proto` 가 https 면 설정과 무관하게 붙이지만(켜야 할 때 끄지 않기 위해), **반대 방향은 하지 않는다** |
| 쿠키 값 | **자격증명을 쿠키에 담지 않는다.** 서명된 세션 값(발급시각 + HMAC)을 담는다. 원문을 담으면 XSS 한 번에 영구 자격증명이 샌다 |
| 실패 | 401. **왜 틀렸는지 알려주지 않는다** — 아이디/비밀번호/OTP 중 무엇이 틀렸는지 구분해 주면 아이디가 맞는지부터 알려 주는 셈이다. 네 경우가 **같은 문구**여야 한다 |
| 브루트포스 | 로그인 실패를 IP 기준으로 세어 분당 10회를 넘으면 429. 한도에 걸린 뒤에는 **맞는 자격증명이어도** 막는다 |

**자격증명 생성**: `backend/scripts/make_admin_credentials.py` 가 아이디·비밀번호를 물어 해시·OTP 비밀키·서명키를 만들고, 인증 앱으로 찍을 QR 을 터미널에 그린다. 손으로 만들지 않는다.

> **프론트 세션에게.** 로그인 폼이 **입력 세 칸**이 된다(아이디·비밀번호·OTP 6자리). `otp` 는 숫자 6자리이므로 `inputMode="numeric"` · `autoComplete="one-time-code"` 가 맞다. 503 안내 문구의 `ADMIN_TOKEN` 언급도 함께 고쳐야 한다. **중계 프록시가 `X-Forwarded-Proto: https` 를 붙여 주면** 백엔드가 설정 없이도 `Secure` 를 올바르게 판단한다 — 붙여 주면 좋다.

#### 응답

```json
{
  "summary": [
    {"job_name": "news", "run_cnt": 168, "success_cnt": 168, "failed_cnt": 0,
     "running_cnt": 0, "collected_sum": 412,
     "last_started_at": "2026-08-28T10:00:00+09:00",
     "last_success_at": "2026-08-28T10:00:00+09:00"}
  ],
  "items": [
    {
      "run_id": 121, "job_name": "video_search", "exec_type": "manual",
      "status": "success",
      "started_at": "2026-08-28T10:17:02+09:00",
      "finished_at": "2026-08-28T10:18:03+09:00",
      "duration_sec": 61,
      "collected_count": 50,
      "error": null,
      "stat": {"fetched": 119, "deduped": 113, "channel_ok": 112, "on_topic": 103,
               "rule_clean": 70, "llm_clean": 52, "fresh": 52, "stored": 50},
      "logs": [{"t": "2026-08-28T10:17:40+09:00", "lv": "WARNING",
                "logger": "worker.jobs.video_channel", "msg": "채널명이 바뀌었다: ..."}]
    }
  ],
  "next_before_id": 121
}
```

`stat` 과 `logs` 는 **`null` 일 수 있다.** 2026-08-28 이전에 실행된 잡은 두 컬럼이 없었다. 프론트는 없는 경우를 정상으로 다룬다.

`stat` 의 키는 **잡마다 다르고 앞으로 늘어난다.** 프론트가 키를 하드코딩해 표를 만들지 않는다 — 받은 키를 그대로 순회해 표시한다. 그래야 워커가 단계를 추가해도 화면이 따라간다.

#### 페이징 — 커서

목록 봉투를 쓰지 **않는다.** 잡 이력은 끊임없이 추가되어 `OFFSET` 이면 조회 중에 경계에서 같은 행이 두 번 보이거나 빠진다. `next_before_id` 를 다음 요청의 `before_id` 로 넘긴다. `total` 도 주지 않는다 — 수십만 행을 매번 세는 비용이 화면에 주는 값보다 크다.

#### 프론트 규칙

| 규칙 | 이유 |
|---|---|
| **`metadata.robots = "noindex, nofollow"`** | 검색에 노출되면 안 된다 |
| **`sitemap.ts` 에 넣지 않는다** | 화이트리스트 방식이라 자동 제외되지만, 실수로 넣지 않는다 |
| **`robots.txt` 에 `Disallow` 를 넣지 않는다** | 크롤을 막으면 크롤러가 `noindex` 를 못 읽어 URL 만 색인될 수 있다. 기존 `/v2` 판단과 같다 |
| **광고를 넣지 않는다** | 운영자만 보는 화면이다 |
| **면책·가이드 문구를 넣지 않는다** | 공개 화면이 아니다 |
| 링크를 걸지 않는다 | 헤더·푸터 어디에도. 주소를 아는 사람만 들어온다 |

#### 화면 구성 제안

```
/admin          로그인 (토큰 입력 폼 하나)
/admin/logs     상단: 잡별 7일 요약 카드 (실행 횟수 · 성공/실패 · 수집 합계 · 마지막 성공)
                필터: 잡 이름 · 상태
                목록: 시각 · 잡 · 실행구분 · 상태 · 소요 · 수집건수
                      행을 펼치면 stat 표 + logs 타임라인 + error 전문
                하단: "더 보기" (커서 페이징)
```

**실패한 실행이 눈에 띄어야 한다** — 이 화면의 목적이 "무엇이 잘못됐는지 나중에 고치는 것"이다. 상태 배지에 색을 주고, 기본 정렬은 최신순이되 실패만 보는 필터를 한 번에 걸 수 있게 한다.

---

관련: [[api-contract]] · [[env-vars]] · [[worker-jobs]] · [[component-boundaries]]
