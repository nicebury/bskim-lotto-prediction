---
type: external
title: "네이버 검색 API (뉴스)"
description: "복권 뉴스 수집에 쓸 네이버 검색 API의 확인된 사실과 미확인 항목(쿼터·약관)"
tags: [external, tbd]
owner: worker
status: draft
sources: ["raw:작업지시서초안_보완.md#13.1", "raw:작업지시서초안_보완.md#8.1"]
created: 2026-07-09
updated: 2026-07-09
---

# 네이버 검색 API (뉴스)

worker 의 `news` 잡이 복권 관련 뉴스를 수집할 때 쓰는 API 다. `dhlottery` 차단으로 회차 데이터를 긁어오는 위젯 파싱(`[[dhlottery-blocked]]`)과는 **다른 소스**다 — 이쪽은 공식 오픈 API 다.

**아직 신뢰할 수 없다(`status: draft`).** 키는 발급됐지만 쿼터·약관 등 사람이 직접 확인해야 하는 항목이 미결이다.

## 확인된 사실

### 인증

애플리케이션 등록 후 발급받는 두 값을 요청 헤더에 넣는다.

```
X-Naver-Client-Id: <ID>
X-Naver-Client-Secret: <SECRET>
```

두 값은 `worker/.env_worker` 의 `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` 로 주입한다(`[[env-vars]]`). Claude 는 `.env*` 를 읽지 않으므로 `env.sample` 의 키만 참고한다.

**키는 발급되어 채워져 있다 (2026-07-09 확인).** `news` 잡이 동작한다. 남은 미결은 쿼터와 약관뿐이다.

키가 하나라도 비면 워커는 기동은 하되 `news` 잡을 크론에 등록하지 않는다. 수동 트리거는 받아 `collect_job_log` 에 실패 사유를 남긴다 — `[[worker-jobs]]`.

### 엔드포인트

```
GET https://openapi.naver.com/v1/search/news.json?query=로또&display=50&sort=date
```

- `query` — 검색어(`NAVER_NEWS_QUERY`, 쉼표 구분 가능)
- `display` — 결과 개수(`NAVER_NEWS_DISPLAY`, 예: 50)
- `sort=date` — 최신순

### 애플리케이션 등록 절차 (개발자센터)

1. [네이버 개발자센터](https://developers.naver.com) 로그인 → 애플리케이션 등록
2. 사용 API: **"검색"** 선택
3. 비로그인 오픈 API 환경: **WEB** 설정 + 서비스 URL 입력
4. `Client ID` / `Client Secret` 발급 → `worker/.env`

### 응답 필드와 저장 정책

응답의 각 아이템은 `title`, `originallink`, `link`, `description`, `pubDate` 를 갖는다.

**원문을 복제하지 않는다.** 제목·요약·출처·발행일·링크만 저장한다 — `lotto_news` 테이블(`title_nm`, `summary_desc`, `link_url`, `orig_link_url`, `published_dttm`; `[[db-schema]]`). `description` 은 네이버가 주는 요약이지 기사 원문이 아니다.

- **`link` 을 UNIQUE** 로 두어 중복 저장을 막는다.
- `title` / `description` 에는 검색어 강조용 `<b>` 태그가 섞여 온다 → **제거**하고 저장한다.

### 쿼터 초과 대응

호출 실패(쿼터 초과 포함) 시 **백오프**한다. 재시도 간격을 늘려가며 재시도하고, 한도를 넘기지 않도록 `news` 잡의 크론 빈도를 보수적으로 잡는다.

구현상 재시도 정책은 상태코드에 따라 갈린다.

| 상태코드 | 처리 | 이유 |
|---------|------|------|
| `429`(쿼터 초과) · `5xx` | 지수 백오프 후 재시도 (`NEWS_BACKOFF_BASE_SEC` × 2ⁿ, `NEWS_MAX_RETRY` 회) | 일시적일 수 있다 |
| `401` · `403` | **즉시 포기** | 키가 틀린 것이다. 재시도하면 쿼터만 태운다 |
| 그 외 `4xx` | 즉시 포기 | 요청이 잘못된 것이다 |

## 미확인 (사람이 직접 확인해야 함)

`developers.naver.com` 은 자동 조회가 차단되어 아래를 **확인하지 못했다.** 사람이 개발자센터·약관에서 직접 확인한 뒤 이 페이지를 갱신하고 `status: stable` 로 올린다.

- **일일 호출 쿼터.** 이 값이 `NEWS_CRON` 빈도를 결정한다(`[[worker-jobs]]`). 쿼터를 모른 채 크론을 촘촘히 잡으면 초과된다. 현재 `0 6,12,18 * * *` × 검색어 2개 = **하루 6회 호출**로 잡아 두었다.
- **뉴스 검색 결과 재배포 약관.** "제목·요약·링크만 저장" 정책이 약관과 정합한지.
- **출처 표기 의무** 여부.

## 관련 문서

- 잡 스케줄: `[[worker-jobs]]`
- 저장 테이블: `[[db-schema]]`
- 환경변수: `[[env-vars]]`
- 회차 데이터 소스(별개): `[[dhlottery-blocked]]`
