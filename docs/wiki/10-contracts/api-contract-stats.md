---
type: contract
title: "통계 API 계약 — 빈도·HOT/COLD·패턴·동반출현·번호"
description: "window 와 기간 조회, 구간 메타, 정렬 규약. api-contract 에서 분리한 통계 전용 계약"
tags: [contract, api, policy]
owner: backend
status: stable
sources: ["backend/app/routers/stats.py", "backend/app/domain/stats.py", "raw:작업지시서초안_보완.md#8.2", "raw:002-작업지시서_두번째_보완.md#4.2"]
created: 2026-08-18
updated: 2026-08-18
---

# 통계 API 계약

[[api-contract]] 에서 **분리한 페이지**다(2026-08-18). 나머지 계약과 지위가 같고, 규약도 그대로 적용된다 — 특히 [표현 규약](api-contract.md#표현-규약-)의 **금지 필드명**은 이 페이지의 모든 응답에 적용된다. 여기에 확률·적중·기대값 계열 필드는 없다.

**왜 나뉘었나.** 002·003 두 번의 개편이 전부 통계로 쌓여 이 절 하나가 부모 문서의 43%(211줄)가 됐다. [SCHEMA.md](../SCHEMA.md) 의 원자성 규칙("한 페이지는 한 주제")에 따라 뗐다. 통계는 자기만의 규칙 체계 — `window`·기간 조회·구간 메타·정렬·`top` — 를 갖고 있어 독립적으로 읽힌다.

**부모 문서를 함께 읽어야 하는 것**: [응답 봉투와 오류 형식](api-contract.md#오류-형식), [DB 컬럼명 ≠ API 필드명](api-contract.md#db-컬럼명--api-필드명-), [표현 규약](api-contract.md#표현-규약-).

모든 응답은 JSON. 시각은 ISO 8601, 타임존은 KST(`+09:00`).

---

## 엔드포인트와 공통 규칙

```
GET /api/lotto/stats/frequency?window=20|50|100|all&include_bonus=false&from_round=&to_round=
GET /api/lotto/stats/hot-cold?window=20|50|100|all&top=10&from_round=&to_round=
GET /api/lotto/stats/pattern?window=20|50|100|all&from_round=&to_round=
GET /api/lotto/stats/pairs?window=20|50|100|all&number=&top=10&from_round=&to_round=
GET /api/lotto/stats/number/{n}?window=20|50|100|all&from_round=&to_round=   # 번호 하나 (2026-08-18)
GET /api/lotto/rounds/index                                                  # 회차-날짜 목록 (2026-08-18)
```

`window` 는 최근 몇 회차를 볼지다. 초안 8.2 가 20/50/100 을 모두 요구한다. 기존 구현은 `hot_rounds=20` 으로 고정돼 있었다 (`backend/app/prediction/config.py:5`) — 신규 API 는 이를 일반화한다. `all` 은 역대 전체.

`include_bonus` 의 기본값은 `false` 다. 기존 빈도 분석은 보너스 번호를 `× 0.3` 가중으로 섞어 넣었지만 (`backend/app/prediction/analyzer/frequency.py:22`), 그것은 예측 모듈의 내부 사정이다. 사용자에게 보여주는 통계는 "보너스 포함/제외" 를 명시적으로 선택하게 한다.

**다섯 엔드포인트 모두** 응답 최상위에 `window`(정수 또는 `"all"`, 기간 조회면 `null`)와 `rounds_analyzed`(실제로 집계에 쓰인 회차 수), 그리고 [구간 메타](#기간-조회-2026-08-18-신규--003-통계-개편) 넷을 담는다. `window=100` 인데 데이터가 60회차뿐이면 `rounds_analyzed: 60` 이다. 프론트는 이 두 값이 다를 수 있음을 전제로 문구를 만든다.

> 이 문장은 한때 "세 엔드포인트" 라고 적혀 있었다. 002 에서 `pairs`, 003 에서 `number/{n}` 이 늘어 다섯이 됐고 구간 메타도 함께 나가게 됐다. **엔드포인트를 더할 때 이 문장을 함께 고친다.**

## 빈도 · HOT/COLD

빈도 응답은 `{"window": 20, "rounds_analyzed": 20, "include_bonus": false, "counts": {"1": 3, "2": 1, ...}}` 형태로 번호를 키로 하는 맵이다. 키는 1~45 **전부** 존재하며, 한 번도 안 나온 번호는 `0` 이다. 정규화된 점수가 아니라 **횟수**를 반환한다 — 사용자가 검증할 수 있어야 한다.

hot-cold 응답은 `hot`, `cold`, `overdue` 세 배열이다. `hot` 과 `cold` 는 `window` 안의 출현 횟수 기준 **상위·하위 10개**이고, 동점이면 번호가 작은 쪽이 앞선다. `overdue` 는 마지막 출현 이후 지난 회차 수가 큰 상위 10개이며, 이 값만은 `window` 가 아니라 **역대 전체**에서 계산한다 — "최근 20회에 안 나왔다" 는 20 이상의 모든 값을 20 으로 뭉개므로 쓸모가 없다.

```json
{
  "window": 20,
  "rounds_analyzed": 20,
  "hot":  [{ "number": 33, "count": 13, "appearance_rate": 0.65, "last_seen_round": 1182, "trend": "up" }],
  "cold": [{ "number": 9,  "count": 0,  "appearance_rate": 0.0,  "last_seen_round": null, "trend": "flat" }],
  "overdue": [{ "number": 4, "rounds_since": 37, "last_seen_round": 1147 }]
}
```

`rounds_since` 는 최신 회차 기준이다. 최신 회차에 나온 번호는 `0` 이다. 역대 한 번도 나오지 않은 번호는 (실데이터에는 없지만) 전체 회차 수를 반환한다.

**002 개편으로 `hot`·`cold` 항목에 세 필드를 더한다** (주요통계 샘플의 표 열 — 출현 횟수·출현 비율·최근 출현·추세):

- **`appearance_rate`** — `count / rounds_analyzed`. `0.0~1.0` 의 **과거 출현 비율**이다. 프론트는 `65%` 처럼 표시하되 "지난 N회 중 나온 비율" 임이 드러나게 라벨한다. **이것은 다음 회차 확률이 아니다** — `probability` 로 이름 짓지 않고 `appearance_rate` 로 두는 이유이자, [[forbidden-expressions]] 가 요구하는 "사실만 반환" 이다.
- **`last_seen_round`** — 그 번호가 **마지막으로 나온 회차 번호**(절대값, 예 `1182`). window 밖이어도 역대 전체에서 찾는다. window 안에서 한 번도 안 나왔고 역대로도 없으면 `null`.
- **`trend`** — `"up" | "down" | "flat"`. `window` 를 회차 기준 **최근 절반 vs 이전 절반**으로 나눠 출현 횟수를 비교한다. 최근 절반이 더 많으면 `up`, 적으면 `down`, 같으면 `flat`. 홀수 window 는 가운데 회차를 최근 쪽에 넣는다. **이것도 관찰된 추세일 뿐 예측이 아니다** — UI 문구가 "오를 것" 처럼 읽히지 않게 한다. window 가 2회 미만이면 항상 `flat`.

`overdue` 에는 `last_seen_round` 만 추가한다(비율·추세는 미출현 목록에 의미가 없다).

## 동반 출현 (2026-07-15 신규)

주요통계 '동반 출현' 탭용. **함께 자주 나온 번호쌍**을 센다. `pair_affinity` 전략이 내부에서 쓰던 동시출현 집계를 사용자에게 노출하는 것이다.

```
GET /api/lotto/stats/pairs?window=20|50|100|all&number=&top=10
```

- `number`(선택, 1~45) — 주면 그 번호와 함께 나온 상대 번호를 많이 나온 순으로 준다. 생략하면 **전체 번호쌍 중 동시출현이 많은 순**.
- `top`(선택, 기본 10, 최대 45) — 반환 개수.

```json
{
  "window": 20,
  "rounds_analyzed": 20,
  "number": null,
  "pairs": [
    { "numbers": [18, 33], "count": 5 },
    { "numbers": [12, 27], "count": 4 }
  ]
}
```

`numbers` 는 항상 오름차순 2개. `count` 는 `window` 안에서 그 두 번호가 **같은 회차에 함께 나온 횟수**다. `number` 를 준 경우 각 `numbers` 는 `[요청번호, 상대번호]` 가 아니라 여전히 **오름차순**이며, 응답 최상위 `number` 로 어떤 번호 기준인지 구분한다. 동시출현 역시 관찰된 사실이고, 이 값이 "이 쌍이 또 나온다" 를 뜻하지 않는다 — 확률 표현을 붙이지 않는다.

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

## 기간 조회 (2026-08-18 신규 — 003 통계 개편)

`window` 는 "최근 N회" 만 볼 수 있다. 사용자가 **임의 구간**(예: 1100~1150회)을 보고 싶다는 요구가 나왔고, 그래서 네 통계 엔드포인트 전부에 두 파라미터를 더한다.

- **`from_round`**(선택, 정수) — 구간 시작 회차. 포함.
- **`to_round`**(선택, 정수) — 구간 끝 회차. 포함.

규칙:

- 둘 다 주면 **`window` 는 무시한다.** 둘이 함께 와야 의미가 있으므로 **하나만 오면 `422`** 다. (한쪽만 받아 "나머지는 알아서" 처리하면 사용자가 무엇을 보고 있는지 화면과 어긋난다.)
- `from_round > to_round` 면 `422`. 조용히 swap 하지 않는다 — 사용자가 잘못 입력한 것을 화면이 알려야 한다.
- 범위가 실제 데이터 밖이면 **에러가 아니라 교집합**으로 자른다. 예를 들어 `to_round=9999` 는 최신 회차로 잘린다. 이때 응답의 `to_round` 는 **잘린 실제 값**이다.
- 교집합이 비면(예: `from_round=9000&to_round=9999`) `rounds_analyzed: 0` 과 빈 결과를 **200 으로** 반환한다. 없는 구간을 물어본 것은 오류가 아니라 사실 조회다.

**"빈 결과" 가 무엇을 비우는가** (2026-08-18 구현하며 확정): **구간에서 나온 값만 비운다.**

| 값 | 구간이 비었을 때 |
|---|---|
| `hot` · `cold` | **빈 배열.** 45개를 전부 0회로 채우면 화면에 "1번 0회 · 1위" 가 뜨는데, 그것은 사실이 아니라 정렬의 부산물이다 |
| `counts`(frequency) | **1~45 키를 모두 유지하고 값은 0.** "키가 전부 있다" 는 데이터 유무와 무관한 불변식이다 |
| `pairs` · `companions` · `recent_appearances` | 빈 배열 |
| `rank` | `null`. 모든 횟수가 0 이면 정렬이 번호순이 되어 "15번은 15위" 라는 거짓이 나간다 |
| **`overdue`** | **그대로 채워진다.** 이 값만은 구간이 아니라 역대 전체에서 나오기 때문이다 |
| `last_seen_round` · `rounds_since` · `max_gap` | **그대로.** 같은 이유다 |

구간에 데이터가 없다는 것과 그 번호의 역사가 없다는 것은 다른 말이다.

**응답 최상위에 구간 메타 네 개를 항상 담는다** — `window` 로 조회했든 기간으로 조회했든 무관하다.

```jsonc
{
  "window": 20,             // 기간 조회면 null
  "rounds_analyzed": 20,
  "from_round": 1213,       // 실제 집계에 쓰인 첫 회차
  "to_round": 1232,         // 실제 집계에 쓰인 끝 회차
  "from_date": "2026-02-28",
  "to_date": "2026-07-11"
}
```

`from_date`·`to_date` 는 그 회차의 추첨일이다. 화면이 "1213~1232회 (2026.02.28 ~ 2026.07.11)" 처럼 **회차와 날짜를 함께** 보여주기 위한 것이며, 프론트가 회차→날짜를 따로 조회하지 않아도 되게 한다. `rounds_analyzed: 0` 이면 네 값 모두 `null`.

> **프론트의 버전 감지**: 응답에 `from_round` 키가 없으면 구버전 백엔드다. 이때 프론트는 기간 조회 UI 를 잠그고 `window` 기반으로만 동작한다. 세 세션이 병렬로 개발하므로 **새 필드가 없다고 화면이 깨지면 안 된다.**

## hot-cold 의 `top` (2026-08-18 신규)

- **`top`**(선택, 기본 `10`, 허용 `1~45`) — `hot`·`cold`·`overdue` 각 배열의 반환 개수. 범위 밖은 `422`.

기본값을 10 으로 두는 것은 하위호환 때문이다(기존 호출이 그대로 10개를 받는다). 화면은 15를 기본으로 명시 전달하고 10·15·20·25·30·35·40 을 선택지로 준다.

`top` 이 커도 정렬 규칙은 같다 — 출현 횟수 내림차순, 동점이면 번호가 작은 쪽이 앞. `cold` 는 오름차순이고 동점이면 역시 번호가 작은 쪽이 앞이다. **`top=45` 면 `hot` 과 `cold` 는 같은 45개를 정반대로 정렬한 목록**이 된다(정상이다).

## 번호 하나의 통계 (2026-08-18 신규)

```
GET /api/lotto/stats/number/{n}?window=20|50|100|all&from_round=&to_round=
```

화면 하단의 "내가 보고 싶은 번호" 조회용이다. `n` 은 1~45, 벗어나면 `422`.

이 엔드포인트가 따로 필요한 이유는 **순위(`rank`) 때문**이다. "15번은 최근 50회에서 25회 나와 **3위**" 같은 문장을 만들려면 45개 전부를 정렬해야 하는데, 그 집계를 브라우저에서 하면 화면과 서버의 숫자가 갈라진다([[component-boundaries]] 비즈니스 계산 금지).

```jsonc
{
  "number": 15,
  "window": 50, "rounds_analyzed": 50,
  "from_round": 1183, "to_round": 1232,
  "from_date": "2025-08-02", "to_date": "2026-07-11",

  "count": 12,                  // 구간 안 출현 횟수
  "appearance_rate": 0.24,      // count / rounds_analyzed. 다음 회차 확률이 아니다
  "rank": 3,                    // 출현 횟수 순위. 1이 가장 많이 나온 번호
  "rank_total": 45,             // 항상 45. 화면이 "45개 중 3위"로 쓴다
  "trend": "up",                // window/구간의 최근 절반 vs 이전 절반
  "last_seen_round": 1230,      // 역대 전체에서 찾는다. 없으면 null
  "rounds_since": 2,            // 최신 회차 기준 미출현 회차 수
  "max_gap": 21,                // 역대 최장 미출현 간격(회차). 데이터가 없으면 null
  "companions": [               // 구간 안에서 이 번호와 함께 나온 상대. 많은 순 최대 5개
    { "number": 33, "count": 4 }
  ],
  "recent_appearances": [       // 구간 안에서 이 번호가 나온 회차. 최신순 최대 20개
    { "round_no": 1230, "draw_date": "2026-06-27" }
  ]
}
```

- `rank` 는 **출현 횟수 내림차순 순위**이고 동점이면 번호가 작은 쪽이 앞선다(hot 정렬과 같은 규칙). 그래야 두 화면의 순위가 어긋나지 않는다. 구간에 회차가 하나도 없으면 `null` 이다(위 표).
- `max_gap` 은 구간이 아니라 **역대 전체** 기준이다. "이 번호는 최장 21회차까지 안 나온 적이 있어요" 라는 사실이 구간에 갇히면 의미가 없다. `rounds_since` 도 같은 이유로 최신 회차 기준이다.
- `companions` 는 `pairs?number={n}` 과 같은 집계다. 화면이 한 번 더 왕복하지 않게 여기 담는다.
- **금지 표현 규약이 그대로 적용된다.** 이 응답 어디에도 확률·적중·기대값 계열 필드를 두지 않는다.

## 회차-날짜 목록 (2026-08-18 신규)

```
GET /api/lotto/rounds/index
```

기간 조회 UI 가 **회차를 고를 때 날짜를 함께** 보여주려면 회차→날짜 매핑 전체가 필요하다. `/api/lotto/rounds` 는 페이지네이션 봉투에 상세 필드까지 담아 1,200여 건을 받기에 무겁고, `/api/meta/sitemap-entries` 는 이름과 용도가 사이트맵에 묶여 있다. 그래서 최소 필드만 주는 경량 목록을 따로 둔다.

```jsonc
{
  "total": 1232,
  "rounds": [
    { "round_no": 1, "draw_date": "2002-12-07" },
    { "round_no": 2, "draw_date": "2002-12-14" }
  ]
}
```

`round_no` **오름차순**이다. 페이지네이션이 없다 — 선택 UI 는 전체를 한 번에 받아야 한다. 과거 회차는 불변이라 오래 캐시된다.

응답 크기는 **1,232회차에서 51KB**다(2026-08-18 실측, 압축 전). 이 문서가 처음 "30KB 미만" 이라고 적었던 것은 추정이었고 실제로는 그 두 배다 — JSON 은 회차마다 키 이름을 되풀이한다. 그래도 한 번 받아 캐시하는 목록으로는 충분히 가볍고, 회차당 약 42바이트씩 주당 한 건 늘어난다.

## pattern 추가 필드 (2026-08-18)

기존 여섯 필드는 그대로 두고 **두 개를 더한다.** 둘 다 없으면 프론트가 해당 카드를 렌더링하지 않으므로 하위호환이다.

```jsonc
{
  "sum_histogram": { "100-109": 12, "110-119": 38 },   // 여섯 번호 합계의 구간별 회차 수
  "consecutive_counts": { "0": 0.508, "1": 0.401, "2": 0.082, "3": 0.009 }
}
```

- **`sum_histogram`** — 합계를 **10 단위 구간**으로 묶은 **회차 수**(비율이 아니라 개수다 — 사용자가 `rounds_analyzed` 와 더해 검증할 수 있어야 한다). 키는 `"100-109"` 형식이고 오름차순, 실제 데이터가 있는 구간만 담는다. 기존 `sum_range`(10·90 퍼센타일과 중앙값)는 요약값이라 분포의 모양을 보여주지 못해 히스토그램을 따로 둔다.
- **`consecutive_counts`** — 한 회차에 포함된 **연속번호 쌍의 개수**별 비율. 키는 개수(문자열), 값은 `0.0~1.0`. 기존 `consecutive_ratio`(연속을 한 쌍 이상 포함한 회차의 비율)는 `1 - consecutive_counts["0"]` 과 같아야 한다 — 두 값이 어긋나면 백엔드 버그다.

---

관련: [[api-contract]] · [[component-boundaries]] · [[db-schema]] · [[forbidden-expressions]] · [[prediction-algorithm]] · [[0012-serialize-monte-carlo]]
