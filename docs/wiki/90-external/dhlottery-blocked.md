---
type: external
title: "동행복권 공식 API 차단과 네이버 위젯 대체"
description: "동행복권 공식 .do API 차단 이력과, 대체 소스인 네이버 검색 위젯 HTML 파싱의 실제 구현"
tags: [external, pitfall]
owner: worker
status: stable
sources: ["backend/app/naver_source.py", "backend/app/crawler.py", "backend/app/config.py", "raw:작업지시서초안_보완.md#14"]
created: 2026-07-09
updated: 2026-07-09
---

# 동행복권 공식 API 차단과 네이버 위젯 대체

로또 회차 데이터를 어디서 가져오는지에 대한 함정 기록이다. 뉴스 수집(`[[naver-search-api]]`)과는 다른 소스다.

## 증상

동행복권 공식 API(`https://www.dhlottery.co.kr/common.do`)를 호출하면 데이터가 오지 않는다. 모든 `.do` 경로가 `/errorPage`(사실상 메인 페이지)로 302 리다이렉트된다. 특정 클라이언트만이 아니라 **전 클라이언트 대상**이다. (2026-04 확인.)

## 원인

동행복권이 공식 API 를 전면 차단한 상태다. `common.do?method=getLottoNumber` 같은 기존 JSON 엔드포인트가 더 이상 응답하지 않는다. 복구 여부는 모니터링 중이나 재개 시점은 미정이다.

## 해법 — 네이버 검색 위젯 HTML 파싱

공식 API 대신 **네이버 검색 위젯의 HTML 을 정규식으로 파싱**한다. 구현은 `backend/app/naver_source.py`(향후 `worker/` 로 이동).

### 요청

```
GET https://search.naver.com/search.naver?query=로또 {N}회
follow_redirects=True
```

`{N}` 은 회차 번호. 브라우저 유사 `User-Agent` / `Accept-Language: ko-KR` / `Referer` 헤더를 붙인다.

### 파싱 규칙

- **당첨번호 7개**: `class="ball type\d"` 패턴에서 숫자를 추출한다. 앞 6개가 당첨번호, 7번째가 보너스다.
- **미추첨 판정**: 추출된 balls 가 **7개 미만이면 `None` 반환**(아직 추첨되지 않은 회차). 크롤러는 `None` 을 받으면 증분 수집을 정상 종료한다.
- **회차+날짜 컨텍스트 검증**: 추첨일은 요청한 회차 번호와 같은 컨텍스트에서 `{N}회차 (YYYY.MM.DD)` 형태로 매칭한다. 회차 컨텍스트에서 날짜를 못 찾으면 위젯에 그 회차가 없는 것으로 보고 `None` 을 반환한다. 엉뚱한 회차의 날짜를 주워 담지 않기 위한 방어다.
- **1등 당첨금(1인당)**: `1등 당첨금 ... N원` 패턴.
- **1등 당첨자 수**: `1등 당첨자는 (총|모두) N명` 또는 `당첨 복권수 N개` 대체 패턴.

### 네이버 위젯에 없는 필드

위젯에 노출되지 않아 **항상 NULL** 로 저장한다.

- `total_sell_amt` (총 판매금액)
- `first_accum_prize_amt` (1등 누적 상금)
- 등위별(2~5등) 당첨자 수·당첨금 — `lotto_prize` 는 비어 있다(`[[db-schema]]`).

UI 에서는 이 값들을 `-` 로 표시한다.

### 봇 감지 완화

네이버에 부담을 주지 않도록:

- 요청 간 **2.0초 + 0~0.8초 지터** 대기.
- 실패 시 **최대 3회 재시도**, 재시도 간격 **3초**.

이 값들은 `config.py`(`CRAWL_DELAY_SEC`, `CRAWL_MAX_RETRY`, `CRAWL_RETRY_DELAY_SEC` 등)에서 온다. 코드에 박지 않는다.

## 공식 API 복구 시

동행복권 API 가 복구되면 위젯에 없던 필드를 되살릴 수 있다.

- `total_sell_amt` / `first_accum_prize_amt` 를 채우는 **enrich 스크립트**를 추가한다(기존 회차 백필).
- 등위별 데이터로 `lotto_prize` 를 채운다.

단, 회차 번호·당첨번호 자체는 위젯 파싱으로 이미 확보되므로 소스 전환은 enrich 성격이지 재수집이 아니다.

## 관련 문서

- 뉴스 소스(별개): `[[naver-search-api]]`
- 저장 스키마: `[[db-schema]]`
- 잡 스케줄: `[[worker-jobs]]`
- 로컬 셋업: `[[local-setup]]`
