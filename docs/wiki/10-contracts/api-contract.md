---
type: contract
title: "백엔드 REST API 계약"
description: "프론트엔드가 의존하는 백엔드 엔드포인트·응답 스키마·표현 규약"
tags: [contract, api, policy]
owner: backend
status: stable
sources: ["backend/app/routers/", "raw:작업지시서초안_보완.md#8.2", "raw:작업지시초안.md#13.3", "raw:002-작업지시서_두번째_보완.md#4.2"]
created: 2026-07-09
updated: 2026-08-18
---

# 백엔드 REST API 계약

> 2026-07-09 보강: 응답 스키마가 비어 있던 여섯 곳(페이지네이션 봉투, 회차 `traits`, `stats/pattern`, `hot-cold`, `dream/*`, `news`)을 확정했다. 엔드포인트·필드명·표현 규약은 바뀌지 않았다. 경위는 [log.md](../log.md).
>
> **2026-07-15 계약 변경 (002 개편)**: 세 가지를 더했다 — ① `hot-cold` 응답의 `hot`·`cold` 항목에 `appearance_rate`·`last_seen_round`·`trend` 를 추가, ② 신규 엔드포인트 `GET /api/lotto/stats/pairs`(동반 출현), ③ `GET /api/news` 에 `keyword`·`period` 파라미터 추가. **기존 필드·엔드포인트는 그대로**라 하위호환이며, 근거는 [`002-작업지시서_두번째_보완.md`](../../raw/002-작업지시서_두번째_보완.md) 4·5장, 경위는 [log.md](../log.md).

> **2026-08-18 계약 변경 (003 통계 개편)**: 통계 화면 전면 개편에 따라 다섯 가지를 더한다 — ① 전 통계 엔드포인트에 **기간 조회**(`from_round`·`to_round`) 추가와 응답의 구간 메타(`from_round`/`to_round`/`from_date`/`to_date`), ② `hot-cold` 에 `top` 파라미터, ③ 신규 `GET /api/lotto/stats/number/{n}`(번호 하나의 통계), ④ 신규 `GET /api/lotto/rounds/index`(회차-날짜 경량 목록), ⑤ `pattern` 에 `sum_histogram`·`consecutive_counts` 추가. **기존 파라미터·필드는 그대로 두는 하위호환 변경**이고, 새 필드는 전부 추가다. 프론트는 응답에 구간 메타가 없으면 구버전 백엔드로 보고 기간 UI 를 잠근다. 경위는 [log.md](../log.md). **이 다섯 가지는 2026-08-18 분할로 전부 [[api-contract-stats]] 에 있다.**

> **2026-08-28 계약 변경 (꿈해몽 보강)**: `POST /api/dream/recommend` 에 요청 `exclude: number[]`(최대 39) 와 응답 `matched_words[].from_text: boolean` 을 더한다. 프론트 세션이 [[dream-pipeline]] 에 남긴 요청이고, **둘 다 추가만 하는 하위호환 변경**이다. 함께 `_stem_to_noun` 이 만든 비단어(`크함`·`꾸음`)를 검색 후보에서 걸렀다 — 응답 필드는 그대로이고 근거 없는 항목이 사라진다. 자세한 것은 [꿈해몽](#2026-08-28-계약-변경--exclude-와-from_text) 절.

> **2026-08-28 계약 변경 (유튜브 영상 추가)**: 신규 리소스 `GET /api/videos` · `GET /api/videos/{id}` 를 더한다. 원천은 워커가 새로 만드는 `lotto_video` 테이블이다([[db-schema]]). **기존 엔드포인트·필드는 전혀 바뀌지 않는다.** 이 리소스에는 다른 리소스에 없는 제약이 셋 있다 — ① 응답 캐시 TTL 24시간 상한(YouTube 30일 보관 정책), ② 표시 조건 WHERE 절 필수, ③ 쇼츠 여부를 boolean 으로 노출 금지. 계획은 [`004-유튜브영상수집계획.md`](../../raw/004-유튜브영상수집계획.md), 경위는 [log.md](../log.md).

> **2026-08-28 계약 변경 (AI 번호추천 시뮬레이터)** — **2026-09-08 구현 완료**: 신규 `POST /api/lotto/simulate` 를 더한다. 기존 `POST /api/lotto/recommend` 는 **그대로 두고**, 그 위에 **7단계 분석 과정을 사용자에게 보여주기 위한** 엔드포인트를 얹는다. 화면이 단계마다 실제 수치를 띄우므로 응답에 각 단계의 근거가 담긴다. **기존 엔드포인트·필드는 전혀 바뀌지 않는다.** 시안은 [`추천알고리즘설명화면.png`](../../raw/추천알고리즘설명화면.png), 경위는 [log.md](../log.md).

> **2026-08-31 계약 변경 (운영자 로그인 방식)**: `POST /api/admin/login` 의 요청 본문이 `{token}` → **`{username, password, otp}`** 로 바뀐다. 사용자가 아이디·비밀번호 방식을 요청했고, 그것'만'으로는 종전(64자 랜덤 토큰)보다 약해지므로 **OTP(TOTP)를 2단계로 함께** 받는다. ⚠ **하위호환이 아닌 유일한 변경**이지만 `ADMIN_TOKEN` 이 아직 어디에도 설정되지 않아(운영자 화면이 한 번도 열린 적 없다) 실제 마이그레이션 부담은 없다. 프론트의 로그인 폼이 세 칸이 된다. 경위는 [log.md](../log.md).

> **2026-08-28 계약 변경 (운영자 전용 수집 로그)** — 2026-09-08 에 [[api-contract-admin]] 으로 분리: `POST /api/admin/login` · `POST /api/admin/logout` · `GET /api/admin/job-logs` 를 더한다. **사이트 운영자 한 사람만 보는 화면**의 데이터원이고, 공개 API 가 아니다 — 인증·`noindex`·사이트맵 제외가 계약의 일부다. 원천은 워커의 `collect_job_log` 이며 2026-08-28 에 `stat_json`·`log_list` 두 컬럼이 추가됐다([[db-schema]]). 경위는 [log.md](../log.md).

이 페이지는 **계약**이다. 프론트엔드는 이 문서만 읽고 개발한다 — 백엔드 코드를 읽지 않는다. 백엔드는 이 문서를 구현한다. 어긋나면 코드가 틀린 것이다.

모든 응답은 JSON. 시각은 ISO 8601, 타임존은 KST(`+09:00`). 금액은 원 단위 정수.

## DB 컬럼명 ≠ API 필드명 ★

**응답 필드명은 DB 컬럼명과 다르다.** DB 는 한국형 표준(`draw_ymd`, `first_prize_amt`)을 따르지만, 이 API 는 아래 필드명을 유지한다. **백엔드가 매핑한다.**

공개 API 가 DB 스키마에 결합되면 컬럼 하나를 정리할 때마다 프론트엔드와 검색엔진에 노출된 JSON 구조가 함께 흔들린다. 프론트 세션이 DB 의 존재를 모르는 것이 설계 의도다 ([[component-boundaries]]).

매핑표는 [[db-schema]] 에 있고, 근거는 [[0010-db-naming-standard]] 다. **이 문서의 필드명을 DB 이름에 맞춰 바꾸지 않는다.**

---

## 표현 규약 ★

이 절이 API 계약에서 가장 중요하다. 필드 이름 하나가 서비스 전체의 법적·정책적 포지션을 바꾼다.

**금지되는 응답 필드명**: `probability`, `win_rate`, `accuracy`, `confidence`, `hit_rate`, `expected_value`, `score` 를 사용자에게 노출하는 어떤 형태로도 쓰지 않는다.

이유는 초안 8.3 과 17장에 있다. 이 서비스는 "당첨 예측 사이트" 가 아니라 "정보형 대시보드" 다. 응답 필드가 `probability: 0.13` 이면 프론트가 무엇을 렌더링하든 그 JSON 을 본 사람은 확률을 제공받았다고 이해한다. 애드센스 심사자도 마찬가지다.

**대신 조합의 성향을 서술한다.** 확률이 아니라 관찰된 속성이다.

```json
{
  "numbers": [3, 12, 19, 27, 33, 41],
  "traits": {
    "odd_even": "5:1",
    "high_low": "3:3",
    "sum": 135,
    "range_distribution": { "1-15": 2, "16-30": 2, "31-45": 2 },
    "hot_count": 2,
    "cold_count": 1,
    "has_consecutive": false,
    "tail_variety": 6
  }
}
```

위 값들은 `[3, 12, 19, 27, 33, 41]` 을 실제로 센 결과다. 홀수 다섯 개(3·19·27·33·41), 23 이상 세 개(27·33·41), 끝자리 여섯 종류. **예시의 숫자를 눈대중으로 적지 않는다** — 프론트가 이것을 테스트 픽스처로 쓴다.

`hot_count` 는 "최근 N회 HOT 번호가 몇 개 포함됐는가" 라는 **사실**이다. `probability` 는 **주장**이다. 사실만 반환한다.

> 참고: 기존 `CLAUDE.md` 는 `confidence` 를 "조합의 6개 번호가 유효 조합에서 평균적으로 등장한 비율" 로 정의했다고 적었으나, **실제 코드에는 `confidence` 라는 식별자가 존재하지 않는다.** `backend/app/prediction/montecarlo.py:70-74` 의 `avg_number_hits` 가 그것에 해당한다. 신규 API 는 이 값을 사용자에게 노출하지 않는다. 자세한 내용은 [[prediction-algorithm]] 참조.

---

## 엔드포인트

### 헬스체크

```
GET /health → 200 { "status": "ok" }
```

DB 연결을 확인하지 않는 얕은 체크다. DB 를 포함한 준비 상태가 필요하면 별도 엔드포인트를 만든다.

### 로또 회차

```
GET /api/lotto/latest                         # 데이터가 하나도 없으면 404
GET /api/lotto/rounds?page=1&size=20          # size 최대 200
GET /api/lotto/rounds/{round_no}              # 없으면 404
```

회차 객체:

```json
{
  "round_no": 1231,
  "draw_date": "2026-07-04",
  "numbers": [5, 11, 18, 27, 33, 42],
  "bonus": 16,
  "first_win_amount": 2457819200,
  "first_winner_count": 10,
  "total_sell_amount": null,
  "first_accum_amount": null
}
```

`numbers` 는 항상 오름차순 6개다 — [[db-schema]] 의 `CHECK` 제약이 보장한다. `total_sell_amount` 와 `first_accum_amount` 는 **거의 항상 `null`** 이다. 현재 수집 소스에 없다 ([[dhlottery-blocked]]). 프론트는 `null` 을 `-` 로 표시하며, 이 필드가 언젠가 채워질 수 있음을 전제로 만든다.

#### 페이지네이션 봉투

목록을 반환하는 엔드포인트(`/api/lotto/rounds`, `/api/news`)는 **같은 봉투**를 쓴다. 배열을 최상위에 두지 않는다 — 총 개수를 나중에 덧붙이려면 응답 타입이 바뀌기 때문이다.

```json
{ "total": 1231, "page": 1, "size": 20, "items": [ /* 회차 객체 또는 기사 객체 */ ] }
```

`page` 는 1부터. `total` 은 필터 적용 후 전체 건수이고 `items` 길이가 아니다. 범위를 벗어난 `page` 는 404 가 아니라 **빈 `items` 와 함께 200** 이다. 목록의 끝은 오류가 아니다.

`/api/lotto/rounds` 의 정렬은 `round_no` **내림차순**이다. 최신 회차가 첫 페이지 맨 위에 온다.

#### 회차 상세

회차 상세(`/rounds/{round_no}`)는 위에 더해 등위별 정보와 성향을 붙인다.

```json
{
  "...": "위 회차 객체와 동일",
  "prize_tiers": [],
  "traits": {
    "odd_even": "4:2",
    "high_low": "3:3",
    "sum": 136,
    "range_distribution": { "1-15": 2, "16-30": 2, "31-45": 2 },
    "has_consecutive": false,
    "tail_variety": 6
  }
}
```

(위 회차 객체의 `numbers` 인 `[5, 11, 18, 27, 33, 42]` 를 실제로 센 값이다.)

`prize_tiers` 는 **현재 항상 빈 배열**이다. 소스가 확보되면 `[{ "rank": 1, "winner_count": 10, "prize_per_game": 2457819200 }, ...]` 형태로 채워진다. 프론트는 빈 배열일 때 해당 섹션을 렌더링하지 않는다.

`traits` 는 그 회차 당첨번호의 성향이다. 초안 8.1 이 요구하는 "이번 회차 번호 패턴" 이고, 회차 상세 페이지가 단순 표가 되지 않게 하는 SEO 콘텐츠이기도 하다.

**회차 상세의 `traits` 에는 `hot_count` 와 `cold_count` 가 없다.** 위 여섯 필드는 그 회차의 여섯 숫자만 보면 계산되는 사실이지만, HOT/COLD 는 "어느 시점의 최근 몇 회차 기준인가" 라는 선택이 개입한다. 과거 회차 페이지에 "HOT 번호 2개 포함" 이라고 적으면 독자는 그것이 *지금* 기준인지 *그때* 기준인지 알 수 없다. 두 값은 기준 `window` 를 명시적으로 받는 [번호 추천](#번호-추천) 응답에만 등장한다.

### 조합 분석 → [[api-contract-analysis]] 로 옮겼다

```
GET /api/lotto/analyze?numbers=3,11,24,29,38,41
```

번호 6개를 받아 **역대 회차와 대조**한다 — 번호별 지표, 조합 패턴(AC값·이월수·끝수합), 과거 회차 일치 분포와 근접 회차, "1회차부터 매주 샀다면" 가정 집계. 추천·꿈해몽 결과의 **"분석"** 버튼이 여는 화면([[number-analysis-page]])이 이 하나를 부른다.

**2026-09-02 구현 완료(`stable`).** 프론트 세션이 화면 요구에서 역산해 먼저 적었고, 백엔드가 필드명·형식을 하나도 바꾸지 않고 그대로 구현했다. 경위는 [log.md](../log.md).

### 통계 → [[api-contract-stats]] 로 옮겼다

빈도 · HOT/COLD · 패턴 · 동반 출현 · 번호 하나의 통계, 그리고 **기간 조회**(`from_round`·`to_round`)와 **구간 메타**는 전부 **[[api-contract-stats|통계 API 계약]]** 에 있다.

```
GET /api/lotto/stats/frequency      GET /api/lotto/stats/pairs
GET /api/lotto/stats/hot-cold       GET /api/lotto/stats/number/{n}
GET /api/lotto/stats/pattern        GET /api/lotto/rounds/index
```

002·003 두 번의 개편이 전부 통계로 쌓여 이 문서의 43%를 차지하게 됐고, [SCHEMA.md](../SCHEMA.md) 의 원자성 규칙에 따라 2026-08-18 에 분리했다. **옮겼을 뿐 계약의 지위는 같다** — 이 문서의 [표현 규약](#표현-규약-)과 [오류 형식](#오류-형식)은 그쪽 응답에도 그대로 적용된다.

> `GET /api/lotto/rounds/index`(회차-날짜 경량 목록)도 그쪽에 있다. 회차 엔드포인트처럼 보이지만 **기간 조회 UI 전용**이라 통계와 함께 두는 편이 읽기 좋다.

### 번호 추천

```
POST /api/lotto/recommend?strategy=<name>&sets=5&seed=<int>
```

`strategy` 는 `ensemble`(기본), `pair_affinity`, `balanced_range`, `cold_return`, `golden_combo`, `pure_random` 중 하나다. 다른 값은 `422`. 전략 설명은 [[prediction-algorithm]].

`sets` 는 1~10, 기본 5. `seed` 를 주면 **같은 seed 는 항상 같은 결과**를 낸다. 재현 가능성은 테스트와 사용자 신뢰 양쪽에 필요하다. 생략하면 매번 다른 결과가 나오고, 응답의 `seed` 는 `null` 이다.

응답은 위 "표현 규약" 절의 조합 객체 배열 + 면책 문구다.

```json
{
  "strategy": "ensemble",
  "seed": 1,
  "sets": [ { "numbers": [...], "traits": {...} } ],
  "hot_window": 20,
  "disclaimer": "추천번호는 과거 당첨번호 통계와 랜덤 알고리즘을 활용한 참고용 시뮬레이션입니다. 당첨을 보장하지 않습니다."
}
```

여기의 `traits` 는 [회차 상세](#회차-상세)의 여섯 필드에 `hot_count` 와 `cold_count` 를 더한 여덟 개다. 두 값의 기준은 응답의 `hot_window`(현재 `20`)이며, `/api/lotto/stats/hot-cold?window=20` 의 `hot`·`cold` 배열과 **같은 정의**를 쓴다 — 사용자가 두 화면을 대조해 검증할 수 있어야 한다. `pure_random` 을 포함해 모든 전략이 같은 `traits` 를 담는다. 조합의 출처가 무엇이든 성향은 같은 방식으로 서술된다.

`disclaimer` 를 응답에 포함하는 이유는 프론트가 그것을 잊지 못하게 하기 위해서다. 초안 8.3 이 요구하는 면책 고지가 API 레벨에서 강제된다.

**최소 데이터 요구**: 통계 기반 전략은 회차가 50개 미만이면 계산할 수 없다 (`backend/app/prediction/config.py:19`). 이때 `422` 와 함께 사유를 반환한다.

**`pure_random` 만은 예외로 200 을 반환한다.** 이 전략은 1~45 균등 무작위이고 과거 회차를 읽지 않는다. 데이터가 없다는 이유로 막을 근거가 없다. 다만 `traits` 의 `hot_count`·`cold_count` 는 계산할 데이터가 없으면 `null` 이고, `hot_window` 도 `null` 이다. `pure_random` 은 다른 전략의 결과가 무작위와 구분되지 않음을 보여주는 **통제군**이므로, 데이터가 비었을 때에도 살아 있는 편이 정직하다 ([[prediction-algorithm]]).

### AI 번호추천 시뮬레이터 (2026-08-28 신설)

```
POST /api/lotto/simulate    { "sets": 5, "trials": 100000, "seed": null }
```

`POST /api/lotto/recommend?strategy=ensemble` 과 **같은 번호를 만든다.** 다른 점은 하나뿐이다 — **어떻게 그 번호에 이르렀는지를 단계별 수치로 함께 준다.**

#### 왜 별도 엔드포인트인가

`recommend` 는 여섯 전략이 공유하는 얇은 계약이고, 거기에 단계별 근거를 얹으면 `pure_random` 에도 "빈도 분석 결과" 가 붙는다 — 아무것도 분석하지 않는 전략에 분석 결과가 딸려 오는 응답은 거짓말이다. 시뮬레이터는 **앙상블 한 갈래의 과정을 드러내는 것**이므로 자기 엔드포인트를 갖는다.

#### 파라미터

| 이름 | 범위 | 기본 | 설명 |
|---|---|---|---|
| `sets` | 1~10 | 5 | 추천받을 번호 조합 수 |
| `trials` | `10000` \| `50000` \| `100000` | `100000` | 몬테카를로 가상 추첨 횟수. **그 외 값은 `422`** |
| `seed` | int \| null | null | 같은 seed 는 항상 같은 결과 |

⚠ `trials` 를 **자유 정수로 받지 않는다.** 화면이 세 단계만 제공하고, 열린 값을 받으면 누군가 1,000만을 넣어 서버를 오래 붙잡는다. [[0012-serialize-monte-carlo]] 가 몬테카를로를 한 번에 하나만 돌리기로 한 것과 같은 이유다.

⚠ **`trials` 가 커도 응답이 오래 걸리면 안 된다.** 화면은 단계마다 2초 이상 머물며 **총 15초쯤** 진행 표시를 돌린다. 그 사이에 응답이 오면 된다. 넘칠 것 같으면 `trials` 상한을 낮추는 편이 낫다 — 화면이 기다리게 만들지 않는다.

#### 응답

```json
{
  "sets": [ { "numbers": [3, 12, 19, 27, 33, 41], "traits": { "...": "recommend 와 동일" } } ],
  "trials": 100000,
  "seed": null,
  "hot_window": 20,
  "stages": {
    "frequency": {
      "rounds_analyzed": 1238,
      "include_bonus": true,
      "most": [{ "number": 34, "count": 187 }],
      "least": [{ "number": 9, "count": 142 }]
    },
    "cycle": {
      "longest_waiting": [{ "number": 4, "rounds_since": 37 }]
    },
    "trend": {
      "window": 20,
      "recency_weight": 2.0,
      "rising": [{ "number": 27, "count": 8 }]
    },
    "pattern": {
      "odd_even_3_3_rate": 0.33,
      "sum_range": { "from": 98, "to": 177, "rate": 0.80 },
      "consecutive_rate": 0.52,
      "tail_variety_avg": 5.1
    },
    "ensemble": {
      "top_numbers": [34, 27, 12, 45, 3, 18, 21, 39, 7, 30]
    },
    "montecarlo": {
      "trials": 100000,
      "valid_combinations": 34210,
      "filtered_out": 65790
    }
  },
  "disclaimer": "추천번호는 과거 당첨번호 통계와 랜덤 알고리즘을 활용한 참고용 시뮬레이션입니다. 당첨을 보장하지 않습니다."
}
```

#### ★ 단계별 수치는 **실제 값**이어야 한다

화면이 "역대 1,238회를 분석했습니다 · 34번이 187회로 가장 많이 나왔습니다" 라고 말한다. 그 수치가 지어낸 것이면 **그 순간 이 서비스는 정보형 대시보드가 아니라 연출이 된다.** 각 단계는 실제로 수행한 계산의 결과를 담는다.

계산할 수 없는 단계가 있으면 그 키를 **`null` 로 준다.** 프론트는 `null` 인 단계를 "이번에는 수치를 함께 보여드리지 못했습니다" 로 표시하고 넘어간다 — **빈 값을 0 으로 채우지 않는다.**

#### ★ 금지 필드명이 여기에도 적용된다

앙상블 단계는 번호별 **순위만** 준다(`top_numbers`). `score`·`weight`·`probability` 를 응답에 담지 않는다([위 표현 규약](#표현-규약-)). 시안에 "최종 점수를 매깁니다" 라는 **설명 문구**가 있는 것과, 그 점수를 **응답 필드로 노출하는 것**은 다르다. 설명은 알고리즘이 무엇을 하는지 말하는 것이고, 필드는 사용자가 그 값을 근거로 삼게 만든다.

`montecarlo.valid_combinations` 는 "패턴 필터를 통과한 조합 수" 라는 **사실**이다. 그것이 당첨 가능성을 뜻하지 않는다는 것을 프론트가 문구로 밝힌다.

#### 재현성

`seed` 를 주면 `sets` 와 `stages.montecarlo` 가 모두 재현된다. `stages` 의 나머지 넷은 회차 데이터에만 의존하므로 seed 와 무관하게 같다.

#### ✅ 구현 완료 (2026-09-08)

`backend/app/domain/simulate.py`(계산) · `backend/app/routers/simulate.py`(라우팅) · `backend/tests/test_simulate.py`(18개). **필드명·형식을 하나도 바꾸지 않고** 계약대로 구현했다.

- **`recommend?strategy=ensemble` 과 같은 번호·같은 `traits`** 를 낸다(같은 `seed`·같은 `trials` 기준). `predictor.predict()` 를 같은 방식으로 부르고 `traits` 도 같은 함수로 만든다 — 실측으로 확인했고 테스트가 고정한다.
- **단계 수치는 전부 실제 계산 결과다.** `frequency`·`cycle`·`trend`·`pattern` 은 `domain/stats.py` 의 같은 함수에서 나온다. ⚠ 특히 빈도는 예측 모듈의 **정규화 점수(0~1)가 아니라 실제 횟수**를 쓴다 — 화면이 "34번이 214회" 라고 말하는데 정규화 값을 실으면 "0.87회" 가 된다.
- `trend.recency_weight: 2.0` 은 **지어낸 값이 아니다.** `analyzer/hot_cold.py` 가 최근 회차에 1.0, 가장 오래된 회차에 0.5 를 주는 실제 규칙의 비다. 분석기를 고치면 이 값도 함께 고친다.
- ★ **`recommend` 와 같은 게이트**(`concurrency.heavy_slot`)를 쓴다. 각자 슬롯을 가지면 몬테카를로 둘이 동시에 돌아 [[0012-serialize-monte-carlo]] 가 막으려던 상황이 그대로 재현된다.
- 실측: `trials=10000` 에 **0.57초**, `50000` 에 2.5초 안팎. 계약이 말한 "총 15초쯤" 안에 든다.

#### 백엔드가 없을 때 (프론트 규칙)

이 엔드포인트가 `404` 면 프론트는 **기존 API 를 조합해 화면을 채운다** — `recommend?strategy=ensemble` 로 번호를, `stats/frequency`·`stats/hot-cold`·`stats/pattern` 으로 단계 수치를 얻는다. 화면은 똑같이 돌고, 백엔드가 이 엔드포인트를 만들면 **호출 한 번으로 줄어들 뿐**이다.

⚠ 그 폴백에서도 **수치를 지어내지 않는다.** 얻을 수 없는 단계는 수치 없이 설명만 보여준다.

### 꿈해몽

```
GET  /api/dream/keywords
POST /api/dream/recommend   { "text": "돼지가 나오는 꿈을 꿨어요",
                              "sets_per_tier": 10, "seed": null, "exclude": [] }
```

`/keywords` 는 `/dream/{keyword}` 정적 페이지를 생성하기 위한 목록이다 — Next.js 의 `generateStaticParams` 가 쓴다. 키워드 슬러그와 한국어 표기를 함께 준다.

```json
{ "total": 4802, "keywords": [ { "slug": "돼지", "word": "돼지" } ] }
```

**슬러그는 한글 표기 그대로다.** 로마자로 바꾸지 않는다. `/dream/돼지` 는 검색어 `돼지꿈 로또번호` 와 URL 이 일치해 롱테일 유입에 유리하고, 로마자 변환 규칙을 새로 만들면 `돼지`→`dwaeji`/`dweji` 중 무엇이 정본인지 아무도 모르게 된다. 브라우저와 Next.js 가 퍼센트 인코딩을 알아서 처리한다. `slug` 와 `word` 를 둘 다 주는 것은, 언젠가 슬러그 규칙이 바뀌어도 프론트가 필드 하나만 갈아끼우면 되게 하기 위해서다.

이 엔드포인트는 **임베딩 모델을 로드하지 않는다.** ChromaDB 의 문서 목록만 읽으므로 아래의 20초 함정과 무관하게 즉시 응답한다.

`/recommend` 는 꿈 텍스트를 형태소 분석하고 벡터 유사도로 단어를 찾아 번호를 만든다. 파이프라인은 [[dream-pipeline]] 참조. 응답에는 어떤 단어가 매칭됐는지 함께 담는다 — 사용자가 결과를 납득하려면 근거가 보여야 한다.

```json
{
  "text": "돼지가 나오는 꿈을 꿨어요",
  "matched_words": [
    { "dream_word": "돼지",
      "from_text": true,
      "matches": [ { "gubun": 1, "word": "돼지", "numbers": [5, 33, 39] } ] }
  ],
  "tiers": {
    "tier1": { "pool": [5, 33, 39], "sets": [ { "numbers": [...], "traits": {...} } ] },
    "tier2": null,
    "tier3": null
  },
  "disclaimer": "꿈해몽 번호는 재미용 콘텐츠입니다. 꿈과 당첨 사이에 인과관계는 없습니다."
}
```

`gubun` 은 `1`=정확일치 `2`=포함 `3`=벡터 유사다. tier 는 gubun 을 **누적**한다 — tier1 은 gubun 1 만, tier2 는 1+2, tier3 는 1+2+3. 풀이 비면 그 tier 는 `null` 이고, 프론트는 해당 탭을 렌더링하지 않는다. tier 당 세트 수는 요청의 `sets_per_tier`(1~30, 기본 10)다. `seed` 를 주면 재현된다.

각 세트의 `traits` 는 [회차 상세](#회차-상세)와 **같은 여섯 필드**다. `hot_count`·`cold_count` 는 없다 — 꿈 단어에서 나온 번호를 최근 회차 통계와 엮으면, 둘 사이에 관계가 있다는 인상을 준다.

**유사도 점수를 응답에 담지 않는다.** `searcher.py` 는 L2 거리를 `0~1` 로 뒤집은 값을 들고 있지만 (`score`), 그것을 JSON 에 실으면 사용자는 확률로 읽는다. `score` 는 [금지 필드명](#표현-규약-)이다 ([[forbidden-expressions]]).

**첫 요청은 느리다.** 임베딩 모델이 lazy 싱글톤으로 로드되며 약 20초가 걸린다 (`backend/app/dream/state.py`). 프론트는 이 요청에 로딩 상태를 반드시 표시한다.

#### 2026-08-28 계약 변경 — `exclude` 와 `from_text`

프론트 세션이 [[dream-pipeline]] 에 남긴 요청 둘을 구현하면서 더한다. **둘 다 추가만 하는 하위호환 변경**이고, 보내지 않거나 읽지 않으면 종전과 완전히 같다.

**① 요청에 `exclude: number[]`(선택, 기본 `[]`)**

사용자가 "이 번호는 쓰기 싫다" 고 뺀 번호다. 종전에는 이 파라미터가 없어 프론트가 **보여줄 개수의 세 배를 받아 걸러 내고** 있었다 — 풀이 좁고 여러 번호를 빼면 남는 조합이 금세 바닥나는 우회였다.

- 번호는 **풀에서도 빠지고 채움에서도 빠진다.** 풀에서만 빼면 "뺐는데 또 나온다" 가 되고, 사용자에게는 제외 스위치가 고장 난 것으로 읽힌다.
- 응답의 `tiers.tierN.pool` 에서도 빠진다. 그래야 프론트의 `pool` ↔ `numbers` 대조가 계속 성립한다.
- 어떤 tier 의 풀이 **통째로** 제외되면 그 tier 는 `null` 이다(빈 풀과 같게 다룬다).
- **최대 39개.** 6개를 만들려면 최소 6개가 남아야 한다(45 − 39 = 6). 40개 이상은 `422` 다 — 만들 수 없는 요청을 받아 두면 빈 결과가 나오고 화면은 원인을 알 수 없다.
- 1~45 를 벗어난 번호도 `422`. 조용히 무시하면 사용자는 뺐다고 믿는데 그 번호가 계속 나온다.
- `seed` 재현성은 그대로 유지된다.

**② 응답 `matched_words[].from_text: boolean`**

⚠ **`dream_word` 는 사용자가 적은 단어가 아닐 수 있다.** 형태소 분석 1단계의 유의어 확장 때문에 `집` 하나가 `집안`·`건물` 을 데려오고, 그 둘은 표제어와 정확히 일치해 `gubun=1` 로 내려온다. 화면이 그것을 "적어 주신 상징" 으로 세우면 사용자는 **자기가 쓰지 않은 말을 자기 말로 읽는다.**

`from_text` 가 그 둘을 가른다. 판정은 원문에 대한 **단순 문자열 포함**이다 — 프론트가 이미 하던 방식과 같은 규칙을 서버로 옮긴 것이라, 화면의 분류가 조용히 달라지지 않는다. 프론트는 자기 쪽 포함 판정을 걷어내면 된다.

**③ 비단어를 후보에서 거른다 (응답 변화 없음)**

`_stem_to_noun` 은 어간에 '음'·'함' 을 붙여 명사형을 만드는데, 규칙이 빗나가면 `크함`·`꾸음` 처럼 **사전에도 없고 뜻도 없는 문자열**이 나온다. 그것이 벡터 검색에 들어가면 유사도만으로 엉뚱한 표제어를 끌어왔다 — 실측으로 `크함` 이 `큰북`·`큰방`·`대형` 을 데려와 번호 3개를 보태고 있었다. 사용자는 "큰" 이라고 썼을 뿐인데 그 번호의 출처를 설명할 방법이 없다.

이제 **규칙이 만들어 낸 단어는 정확 일치(`gubun=1`)가 있을 때만** 쓴다. 정확 일치가 있다면 사전에 실재하는 표제어이므로 규칙이 우연히 맞은 것이고 버릴 이유가 없다. 통째로 막지 않는 이유다. `matched_words` 에서 해당 항목이 사라지므로 **응답이 짧아질 수 있으나 필드는 그대로**다.

### 뉴스

```
GET /api/news?page=1&size=20&keyword=&period=all    # size 최대 100
```

응답은 [페이지네이션 봉투](#페이지네이션-봉투)이고, `items` 의 기사 객체는 `id`, `title`, `description`, `link`, `orig_link`, `source`, `pub_date`, `keywords` 다. 정렬은 `pub_date` 내림차순. `description` 은 원문이 아니라 요약이다. 프론트는 `link` 를 `rel="nofollow noopener"` 와 `target="_blank"` 로 연다.

**002 개편으로 조회 조건 두 개를 더한다** (하위호환 — 생략하면 종전과 동일):

- **`keyword`**(선택) — 공백 제거 후 비어 있지 않으면, `title`·`description`·`keywords` 중 하나라도 그 문자열을 **대소문자 무시 포함**하는 기사만 남긴다. 원천에 `keyword_list`(text[])·제목·요약이 이미 저장돼 있어 워커 변경 없이 백엔드 WHERE 로 처리한다.
- **`period`**(선택, 기본 `all`) — `pub_date` 기준 최근 기간 필터. 허용값 `1w | 2w | 1m | 3m | 6m | all`. `1w` = 최근 7일(`pub_date >= now() - interval '7 days'`), `1m`=30일, `3m`=90일, `6m`=180일. 그 외 값은 `422`.

`total` 은 **필터 적용 후** 건수다(페이지네이션 봉투 규약 그대로). 두 조건은 AND 로 결합한다.

> **API 기본값은 `all` 이다** — 사이트맵·홈 등 기존 호출이 영향받지 않게 하기 위해서다. 반면 **뉴스 페이지(`/news`)의 화면 기본값은 `period=1w`(최근 1주일)** 이다(R30). "API 기본값" 과 "화면 기본값" 을 구분한다 — 프론트가 최초 진입 시 `period=1w` 를 명시적으로 붙인다.

`id` 는 `/api/meta/sitemap-entries` 의 `news[].id` 와 같은 값이다 — 사이트맵의 URL 과 목록의 항목을 잇는 유일한 키라서 목록에도 실어야 한다.

**`lotto_news` 는 당분간 비어 있다.** 워커의 `news` 잡이 네이버 API 키를 기다리는 중이다 ([[env-vars]]). 그동안 이 엔드포인트는 `{"total": 0, "page": 1, "size": 20, "items": []}` 를 반환한다. 404 가 아니다.

### 영상

```
GET /api/videos?kind=all&page=1&size=20&round=&game=&q=&sort=latest&period=all      # size 최대 100
GET /api/videos/{id}
```

응답은 [페이지네이션 봉투](#페이지네이션-봉투)이고, `items` 의 영상 객체는 이렇다.

| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | int | 대리키 |
| `video_key` | string | 유튜브 영상 ID(11자). URL 조립에 쓴다 |
| `title` | string | **원문 그대로.** 낱말을 바꾸지 않는다 |
| `channel` | string \| null | 채널명 |
| `thumbnail` | string \| null | 썸네일 URL. 핫링크한다 |
| `published_at` | string | ISO 8601 (KST) |
| `duration_sec` | int \| null | 재생시간(초). 포맷은 프론트가 한다 |
| `views` | int \| null | 조회수 |
| `shorts_hint` | string | `likely` \| `unlikely` \| `unknown` |
| `round` | int \| null | 제목에서 파싱한 회차 |
| `game` | string | `lotto` \| `pension` \| `unknown` |
| `keywords` | string[] | |

정렬은 `published_at` 내림차순, 동시각은 `id` 내림차순으로 확정한다(정렬이 불안정하면 페이지 경계에서 같은 항목이 두 번 보이거나 빠진다).

**파라미터**

- **`kind`**(선택, 기본 `all`) — `all` \| `normal` \| `shorts`. `shorts` 는 `shorts_hint='likely'`, `normal` 은 `'unlikely'` 만 남긴다. **`'unknown'` 은 `normal` 에도 `shorts` 에도 들어가지 않는다** — 모르는 것을 어느 한쪽으로 밀면 그 순간 추정이 확정이 된다. `all` 에서만 보인다. 그 외 값은 `422`
- **`round`**(선택) — 회차. `game` 과 함께 써야 의미가 있다
- **`game`**(선택) — `lotto` \| `pension`. 그 외 값은 `422`

**2026-09-17 추가 — 검색·정렬** — **2026-09-17 구현 완료** (하위호환 — 셋 다 생략하면 종전과 같다. 프론트 요청: 영상 목록에서 검색하고 최신순·조회수순으로 보고 싶다는 사용자 요구)

- **`q`**(선택) — 공백 제거 후 비어 있지 않으면 `title_nm`·`channel_nm`·`keyword_list` 중 하나라도 그 문자열을 **대소문자 무시 포함**하는 영상만 남긴다. 뉴스의 `keyword` 와 같은 규칙이다. 50자를 넘으면 `422`.
- **`sort`**(선택, 기본 `latest`) — `latest` \| `views`.
  - `latest` = 종전 정렬(`published_at` 내림차순, 동시각 `id` 내림차순).
  - `views` = `view_cnt` 내림차순 **NULLS LAST**, 동률은 `published_at` 내림차순, 그다음 `id` 내림차순. 정렬 키가 끝까지 확정돼야 페이지 경계에서 중복·누락이 없다.
  - 그 외 값은 `422`.
- **`period`**(선택, 기본 `all`) — `published_at` 기준 최근 기간. `1w`(7일) \| `1m`(30일) \| `3m`(90일) \| `all`. 그 외 값은 `422`.

⚠ **"최근 일주일 조회수 순" 은 `period=1w&sort=views` 다** — *최근 7일 안에 올라온 영상을 지금 조회수로* 줄 세운다. **"지난 7일 동안 늘어난 조회수" 가 아니다.** `lotto_video` 는 조회수 이력을 두지 않고 현재값(`view_cnt`) 하나만 갱신하므로 증가분은 계산할 수 없다. 화면 문구도 "최근 1주 인기" 로 쓰고 "주간 조회수" 라고 쓰지 않는다.

모든 조건은 AND 로 결합하고, `total` 은 필터 적용 후 건수다. 표시 조건 WHERE 절(아래)은 그대로 먼저 건다.

**워커·DB 변경 없음.** 기존 컬럼만으로 WHERE·ORDER BY 가 된다. `view_cnt` 정렬이 느려지면 인덱스는 백엔드가 아니라 워커의 DDL 소유이므로 [[db-schema]] 변경 절차를 따른다(지금 행 수 수백 건이라 필요 없다).

**프론트 동작.** 백엔드가 아직 이 파라미터를 모르면 무시하고 종전 목록을 준다(FastAPI 는 모르는 쿼리를 버린다). 그래서 프론트가 먼저 배포돼도 화면은 깨지지 않되, 그동안 검색·정렬이 **효과 없이** 보인다.

✅ **2026-09-17 백엔드 구현 완료 — 이제 효과가 있다.** `backend/app/repository.py`(WHERE·ORDER BY) · `backend/app/routers/video.py`(파라미터·422) · `backend/tests/test_video.py`(신규 15개). 개발 DB 611건 실측: `period` 는 1w 224건 / 1m·3m·all 611건, `q=로또` 587건 · `q=당첨` 312건, 파라미터를 전부 생략한 응답이 종전과 **바이트 단위로 동일**(하위호환 확인). 응답 3~5ms.

#### ★ 표시 조건 — 백엔드가 반드시 건다

```sql
WHERE privacy_status_cd = 'public'
  AND embeddable_cd     = 'yes'
  AND made_for_kids_cd  = 'no'
```

워커가 수집 시점에 이미 걸렀지만 갱신 주기(25일) 사이에 상태가 바뀐 행이 있을 수 있다. 비공개로 전환됐거나 임베드가 막힌 영상을 내보내면 화면에 깨진 플레이어가 뜬다. `made_for_kids` 는 YouTube 정책 III.E.4.10 의 조회 의무와 직결된다.

이 세 컬럼은 **응답에 내보내지 않는다.** WHERE 절 재료일 뿐이다.

#### ★ 응답 캐시 TTL 은 24시간을 넘기지 않는다

`lotto_video` 의 행은 YouTube 개발자 정책 III.E.4 에 따라 30일 안에 갱신되거나 삭제된다. 백엔드가 응답을 오래 캐시하면 워커가 지운 데이터를 계속 내보내게 되고, **그 시점부터 정책 위반의 주체는 백엔드다.** 다른 리소스와 달리 이 제약이 계약에 명시된 이유다.

#### ★ `shorts_hint` 를 boolean 으로 바꾸지 않는다

쇼츠를 판별하는 공식 API 필드가 없어 재생시간·게시일로 **추정**한 값이다(원본 화면비를 얻을 수 없다). `is_shorts: true` 로 내보내는 순간 추정이 확정으로 둔갑하고, 프론트가 그것을 사실로 표시한다. 문자열 3-값을 그대로 전달한다.

#### 회차 연결 — `game` 을 반드시 함께 본다

`GET /api/videos/{id}` 는 `round` 가 있으면 그 회차의 당첨 정보를 함께 담는다(또는 프론트가 기존 회차 API 를 따로 부른다 — 어느 쪽이든 백엔드 판단).

**`game='lotto'` 일 때만 `lotto_draw` 와 조인한다.** 회차 번호만 보고 조인하면 **연금복권 330회 영상에 로또 330회 당첨번호가 붙는다** — 에러 없이 조용히 틀린 번호가 화면에 뜬다. `game='pension'` 과 `'unknown'` 은 조인 대상이 아니다.

`round` 가 아직 추첨 전 회차일 수 있으므로 **조인 결과가 없는 경우를 정상 경로로 다룬다.** 404 가 아니라 회차 정보 없이 응답한다.

#### 빈 테이블

**`lotto_video` 는 당분간 비어 있다.** 워커의 `video_*` 잡이 `YOUTUBE_API_KEY` 를 기다린다([[env-vars]]). 그동안 이 엔드포인트는 `{"total": 0, "page": 1, "size": 20, "items": []}` 를 반환한다. 404 가 아니다.

### 운영자 전용 → [[api-contract-admin]] 으로 옮겼다

```
POST /api/admin/login   ·   POST /api/admin/logout   ·   GET /api/admin/job-logs
```

**공개 API 가 아니다.** 사이트 운영자 한 사람만 쓰는 화면의 데이터원이고, 인증·쿠키·브루트포스·페이징까지 **나머지 엔드포인트와 규칙이 전부 다르다.** 그 다름이 98줄을 차지해 2026-09-08 에 분리했다([SCHEMA](../SCHEMA.md) 의 원자성 규칙 — 한 페이지는 한 주제).

**옮겼을 뿐 계약의 지위는 같다** — 이 문서의 [표현 규약](#표현-규약-)과 [오류 형식](#오류-형식)은 그쪽에도 그대로 적용된다.

### 사이트맵 데이터

```
GET /api/meta/sitemap-entries
```

Next.js 의 `app/sitemap.ts` 가 호출한다. 회차 URL 과 뉴스 URL, 각각의 `lastmod` 를 반환한다. 프론트가 회차 목록 전체를 페이징으로 긁지 않게 하려는 전용 엔드포인트다.

```json
{
  "rounds": [{ "round_no": 1231, "lastmod": "2026-07-04" }],
  "news":   [{ "id": 42, "lastmod": "2026-07-08T10:00:00+09:00" }]
}
```

`rounds` 는 `round_no` 오름차순, `news` 는 `id` 오름차순이다. 페이징이 없다 — 사이트맵은 전체를 한 번에 봐야 한다. `published_dttm` 이 `null` 인 기사는 `lastmod` 도 `null` 이고, 프론트는 그 항목의 `<lastmod>` 를 생략한다.

---

## 오류 형식

```json
{ "detail": "사람이 읽을 수 있는 한국어 메시지" }
```

FastAPI 기본 형식을 따른다. `404` 는 자원 없음, `422` 는 요청은 유효하나 처리 조건 미충족(회차 부족 등), `500` 은 서버 오류.

**백엔드는 절대 `403 permission denied` 를 사용자에게 흘리지 않는다.** 그것이 보이면 [[db-schema]] 의 롤 권한이 잘못된 것이고, 500 으로 감싸되 서버 로그에는 원문을 남긴다.

---

## 이 계약이 지키는 경계

백엔드는 [[worker-jobs|워커]]의 존재를 모른다. 수동 트리거를 프록시하지 않고, 크롤링하지 않고, DB 에 쓰지 않는다.

프론트엔드는 DB 를 모른다. 빈도·패턴 집계를 브라우저에서 다시 계산하지 않는다 — 그러면 서버와 클라이언트의 숫자가 달라지고, 어느 쪽이 맞는지 아무도 모르게 된다.

관련: [[component-boundaries]] · [[db-schema]] · [[prediction-algorithm]] · [[dream-pipeline]] · [[forbidden-expressions]] · [[0003-worker-writes-backend-reads]]
