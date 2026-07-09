---
type: external
title: "네이버 검색 API (뉴스)"
description: "복권 뉴스 수집에 쓸 네이버 검색 API의 확인된 사실과 미확인 항목(쿼터·약관)"
tags: [external]
owner: worker
status: stable
sources: ["raw:작업지시서초안_보완.md#13.1", "raw:작업지시서초안_보완.md#8.1"]
created: 2026-07-09
updated: 2026-07-09
---

# 네이버 검색 API (뉴스)

worker 의 `news` 잡이 복권 관련 뉴스를 수집할 때 쓰는 API 다. `dhlottery` 차단으로 회차 데이터를 긁어오는 위젯 파싱(`[[dhlottery-blocked]]`)과는 **다른 소스**다 — 이쪽은 공식 오픈 API 다.

## 일일 쿼터 — 25,000 회 ★

**사용자가 확인했다 (2026-07-09).** 이 값이 `NEWS_CRON` 빈도를 결정한다.

현재 사용량은 **하루 48회** — 매시간(`0 * * * *`) × 검색어 2개(`로또`, `복권`). 쿼터의 **0.2%** 다.

호출을 매시간으로 잡은 이유는 부하 때문이 아니라 [당일 필터](#당일-필터--발행일--실행일) 때문이다. 당일 기사만 저장하므로 **실행 간격이 곧 놓치는 시간 창의 크기**가 된다. 하루 3회로 돌리면 18시부터 자정까지 6시간치 기사가 통째로 사라진다.

여유가 크므로 검색어를 늘리거나(`연금복권` 등) `NAVER_NEWS_DISPLAY` 를 100 까지 올려도 된다. 검색어 `q` 개 × 시간당 1회 = `24q` 회/일.

## 당일 필터 — 발행일 = 실행일

`sort=date` 로 요청해도 **네이버는 며칠 전 기사를 함께 준다.** 실측(2026-07-09, 94건): 당일 60건, 전날 14건, 이틀 전 19건, 사흘 전 1건. 과거 기사가 계속 섞여 들어오면 '최신 뉴스' 목록이 며칠씩 밀린다.

→ **발행일자(KST)가 수집 실행일자(KST)와 다른 기사는 저장하지 않는다** (`NEWS_SAME_DAY_ONLY=true`).

날짜를 뗄 때 반드시 **KST 로 변환한 뒤** 뗀다. UTC 로 비교하면 한국 시각 오전 9시 이전에 발행된 기사가 전날로 밀려 통째로 버려진다.

발행일을 모르는 기사(`pubDate` 파싱 실패)도 버린다. 날짜를 확인할 수 없으면 통과시킬 근거가 없다.

**감수한 대가.** 마지막 실행 시각과 자정 사이에 발행된 기사는 영영 들어오지 않는다 — 다음날 검색되더라도 발행일자가 실행일자와 달라 걸러진다. 매시간 실행이면 최대 1시간 창이다. 과거 기사까지 담아야 하면 `NEWS_SAME_DAY_ONLY=false` 로 끈다.

## 중복 제거

세 겹으로 막는다. 실측상 `link_url`·제목·`orig_link_url` 중복 모두 **0건**이다.

1. **같은 실행 안에서** — 검색어별 결과를 `link_url` 로 병합한다. '로또' 와 '복권' 양쪽에 걸린 기사는 같은 링크로 두 번 온다. 병합해 두면 `keyword_list` 에 `['로또','복권']` 이 한 번에 들어간다. 따로 INSERT 하면 두 번째가 `DO NOTHING` 으로 죽어 키워드가 하나만 남는다.
2. **실행들 사이에서** — `uk_lotto_news_link_url` UNIQUE + `INSERT ... ON CONFLICT (link_url) DO NOTHING`.
3. **집계** — `collected_cnt` 는 조회 건수가 아니라 실제 INSERT 된 행 수(`rowcount` 합)다.

## 확인된 사실

### 인증

애플리케이션 등록 후 발급받는 두 값을 요청 헤더에 넣는다.

```
X-Naver-Client-Id: <ID>
X-Naver-Client-Secret: <SECRET>
```

두 값은 `worker/.env_worker` 의 `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` 로 주입한다(`[[env-vars]]`). Claude 는 `.env*` 를 읽지 않으므로 `env.sample` 의 키만 참고한다.

**키는 발급되어 채워져 있다 (2026-07-09 확인).** `news` 잡이 동작한다.

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

## 남은 미확인 (사람이 직접 확인해야 함)

일일 쿼터는 확인됐다(25,000). 아래 둘은 `developers.naver.com` 이 자동 조회를 차단해 **확인하지 못했다.** 저장 정책(제목·요약·링크만)이 보수적인 쪽이라 잡을 막지는 않지만, 공개 전에 확인한다.

- **뉴스 검색 결과 재배포 약관.** "제목·요약·링크만 저장" 정책이 약관과 정합한지.
- **출처 표기 의무** 여부.

## 관련 문서

- 잡 스케줄: `[[worker-jobs]]`
- 저장 테이블: `[[db-schema]]`
- 환경변수: `[[env-vars]]`
- 회차 데이터 소스(별개): `[[dhlottery-blocked]]`
