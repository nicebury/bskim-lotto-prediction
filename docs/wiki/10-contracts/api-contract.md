---
type: contract
title: "백엔드 REST API 계약"
description: "프론트엔드가 의존하는 백엔드 엔드포인트·응답 스키마·표현 규약"
tags: [contract, api, policy]
owner: backend
status: stable
sources: ["backend/app/routers/", "raw:작업지시서초안_보완.md#8.2", "raw:작업지시초안.md#13.3"]
created: 2026-07-09
updated: 2026-07-09
---

# 백엔드 REST API 계약

> 2026-07-09 보강: 응답 스키마가 비어 있던 여섯 곳(페이지네이션 봉투, 회차 `traits`, `stats/pattern`, `hot-cold`, `dream/*`, `news`)을 확정했다. 엔드포인트·필드명·표현 규약은 바뀌지 않았다. 경위는 [[log|log.md]].

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
    "odd_even": "3:3",
    "high_low": "2:4",
    "sum": 135,
    "range_distribution": { "1-15": 2, "16-30": 2, "31-45": 2 },
    "hot_count": 2,
    "cold_count": 1,
    "has_consecutive": false,
    "tail_variety": 5
  }
}
```

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
    "odd_even": "3:3",
    "high_low": "3:3",
    "sum": 136,
    "range_distribution": { "1-15": 2, "16-30": 2, "31-45": 2 },
    "has_consecutive": false,
    "tail_variety": 5
  }
}
```

`prize_tiers` 는 **현재 항상 빈 배열**이다. 소스가 확보되면 `[{ "rank": 1, "winner_count": 10, "prize_per_game": 2457819200 }, ...]` 형태로 채워진다. 프론트는 빈 배열일 때 해당 섹션을 렌더링하지 않는다.

`traits` 는 그 회차 당첨번호의 성향이다. 초안 8.1 이 요구하는 "이번 회차 번호 패턴" 이고, 회차 상세 페이지가 단순 표가 되지 않게 하는 SEO 콘텐츠이기도 하다.

**회차 상세의 `traits` 에는 `hot_count` 와 `cold_count` 가 없다.** 위 여섯 필드는 그 회차의 여섯 숫자만 보면 계산되는 사실이지만, HOT/COLD 는 "어느 시점의 최근 몇 회차 기준인가" 라는 선택이 개입한다. 과거 회차 페이지에 "HOT 번호 2개 포함" 이라고 적으면 독자는 그것이 *지금* 기준인지 *그때* 기준인지 알 수 없다. 두 값은 기준 `window` 를 명시적으로 받는 [번호 추천](#번호-추천) 응답에만 등장한다.

### 통계

```
GET /api/lotto/stats/frequency?window=20|50|100|all&include_bonus=false
GET /api/lotto/stats/hot-cold?window=20|50|100|all
GET /api/lotto/stats/pattern?window=20|50|100|all
```

`window` 는 최근 몇 회차를 볼지다. 초안 8.2 가 20/50/100 을 모두 요구한다. 기존 구현은 `hot_rounds=20` 으로 고정돼 있었다 (`backend/app/prediction/config.py:5`) — 신규 API 는 이를 일반화한다. `all` 은 역대 전체.

`include_bonus` 의 기본값은 `false` 다. 기존 빈도 분석은 보너스 번호를 `× 0.3` 가중으로 섞어 넣었지만 (`backend/app/prediction/analyzer/frequency.py:22`), 그것은 예측 모듈의 내부 사정이다. 사용자에게 보여주는 통계는 "보너스 포함/제외" 를 명시적으로 선택하게 한다.

세 엔드포인트 모두 응답 최상위에 `window`(정수 또는 `"all"`)와 `rounds_analyzed`(실제로 집계에 쓰인 회차 수)를 담는다. `window=100` 인데 데이터가 60회차뿐이면 `rounds_analyzed: 60` 이다. 프론트는 이 두 값이 다를 수 있음을 전제로 문구를 만든다.

빈도 응답은 `{"window": 20, "rounds_analyzed": 20, "include_bonus": false, "counts": {"1": 3, "2": 1, ...}}` 형태로 번호를 키로 하는 맵이다. 키는 1~45 **전부** 존재하며, 한 번도 안 나온 번호는 `0` 이다. 정규화된 점수가 아니라 **횟수**를 반환한다 — 사용자가 검증할 수 있어야 한다.

hot-cold 응답은 `hot`, `cold`, `overdue` 세 배열이다. `hot` 과 `cold` 는 `window` 안의 출현 횟수 기준 **상위·하위 10개**이고, 동점이면 번호가 작은 쪽이 앞선다. `overdue` 는 마지막 출현 이후 지난 회차 수가 큰 상위 10개이며, 이 값만은 `window` 가 아니라 **역대 전체**에서 계산한다 — "최근 20회에 안 나왔다" 는 20 이상의 모든 값을 20 으로 뭉개므로 쓸모가 없다.

```json
{
  "window": 20,
  "rounds_analyzed": 20,
  "hot":  [{ "number": 12, "count": 6 }],
  "cold": [{ "number": 9,  "count": 0 }],
  "overdue": [{ "number": 4, "rounds_since": 37 }]
}
```

`rounds_since` 는 최신 회차 기준이다. 최신 회차에 나온 번호는 `0` 이다. 역대 한 번도 나오지 않은 번호는 (실데이터에는 없지만) 전체 회차 수를 반환한다.

pattern 응답은 역대 조합이 어떤 모양이었는지의 분포다. 비율(`0.0~1.0`)은 관찰된 **빈도의 비율**이지 다음 회차의 무엇이 아니다.

```json
{
  "window": "all",
  "rounds_analyzed": 1231,
  "odd_even": { "3:3": 0.33, "4:2": 0.24 },
  "high_low": { "3:3": 0.32, "2:4": 0.25 },
  "consecutive_ratio": 0.492,
  "sum_range": { "min": 100, "max": 175, "peak": 138 },
  "tail_variety_avg": 4.72,
  "tail_counts": { "0": 512, "1": 604 }
}
```

`odd_even` 키는 `홀:짝`, `high_low` 키는 `고:저` 이고 **고 = 23 이상**이다 ([[prediction-algorithm]]). `sum_range` 의 `min`/`max` 는 합계의 10·90 퍼센타일, `peak` 는 중앙값이다. 분포 맵은 비율 내림차순으로 정렬해 반환한다.

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

### 꿈해몽

```
GET  /api/dream/keywords
POST /api/dream/recommend   { "text": "돼지가 나오는 꿈을 꿨어요" }
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

### 뉴스

```
GET /api/news?page=1&size=20                  # size 최대 100
```

응답은 [페이지네이션 봉투](#페이지네이션-봉투)이고, `items` 의 기사 객체는 `id`, `title`, `description`, `link`, `orig_link`, `source`, `pub_date`, `keywords` 다. 정렬은 `pub_date` 내림차순. `description` 은 원문이 아니라 요약이다. 프론트는 `link` 를 `rel="nofollow noopener"` 와 `target="_blank"` 로 연다.

`id` 는 `/api/meta/sitemap-entries` 의 `news[].id` 와 같은 값이다 — 사이트맵의 URL 과 목록의 항목을 잇는 유일한 키라서 목록에도 실어야 한다.

**`lotto_news` 는 당분간 비어 있다.** 워커의 `news` 잡이 네이버 API 키를 기다리는 중이다 ([[env-vars]]). 그동안 이 엔드포인트는 `{"total": 0, "page": 1, "size": 20, "items": []}` 를 반환한다. 404 가 아니다.

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
