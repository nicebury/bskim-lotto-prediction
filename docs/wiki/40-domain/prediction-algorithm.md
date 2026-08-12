---
type: domain
title: "번호 추천 알고리즘 — 앙상블과 몬테카를로"
description: "4-모듈 가중합 → 확률 가중 추출 → 패턴 필터. 실제 코드 기준 명세와 문서-코드 불일치 기록"
tags: [domain, algorithm, pitfall]
owner: backend
status: stable
sources: ["backend/app/prediction/config.py", "backend/app/prediction/ensemble.py", "backend/app/prediction/montecarlo.py", "backend/app/prediction/analyzer/", "backend/app/prediction/strategies/"]
created: 2026-07-09
updated: 2026-08-12
---

# 번호 추천 알고리즘

이 페이지는 **기존 코드를 읽고 쓴 것**이다. 문서가 아니라 코드가 출처다. 신규 백엔드는 이 모듈들을 그대로 이식한다 — 재작성하지 않는다.

머신러닝이 아니다. 과거 당첨번호의 분포를 요약해 가중치를 만들고, 그 가중치로 조합을 뽑은 뒤, 역사적으로 흔한 패턴을 벗어난 조합을 버린다. **당첨 확률을 높이지 않는다** ([[forbidden-expressions]]).

---

## 상수

`backend/app/prediction/config.py`:

| 상수 | 값 | 줄 |
|------|-----|----|
| `NUMBER_RANGE` | `(1, 45)` | 3 |
| `HOT_RECENT_ROUNDS` | `20` | 5 |
| `MONTE_CARLO_SIMULATIONS` | `50_000` | 8 |
| `WEIGHTS` | freq `0.25` / delay `0.25` / hot_cold `0.30` / pattern `0.20` | 10-15 |
| `RECOMMEND_SETS` | `5` | 17 |
| `MIN_REQUIRED_ROUNDS` | `50` | 19 |

가중치의 합은 정확히 1.0 이다. **이 값들은 백테스트 없이 정해졌다.** 바꾸려면 먼저 백테스트를 하고, 결과를 ADR 로 남긴다.

회차가 50개 미만이면 `predictor.predict` 가 `ValueError` 를 던진다. API 는 이를 `422` 로 변환한다 ([[api-contract]]).

---

## 파이프라인

`backend/app/prediction/predictor.py:68-82` 의 순서다.

```
회차 로드 (round_no ASC)
  → 50회 미만이면 ValueError
  → frequency.analyze()      ─┐
  → delay.analyze()           │  각각 번호 1~45 → 0.0~1.0 점수
  → hot_cold.analyze()        │
  → pattern.analyze()         │  (조합 레벨 분포 dict)
  → pattern.per_number()     ─┘  (번호별 보정 점수)
  → ensemble.score()             가중 선형합
  → montecarlo.simulate()        확률 가중 추출 + 패턴 필터
```

무거운 numpy 작업은 이벤트 루프를 막는다. 라우터에서 `asyncio.to_thread` 로 감싼다 (`backend/app/routers/predict.py:72, 96`). `predictor.py` 자체에는 async 코드가 없다 — 순수 동기 함수다. 이 분리를 유지한다.

`seed` 는 `predict()` 가 받아서 `montecarlo.simulate()` 에 그대로 넘긴다. 거기서 `np.random.default_rng(seed)` 가 된다. **같은 seed 는 같은 결과를 낸다.**

---

## 네 개의 분석 모듈

각 모듈은 번호 1~45 를 0.0~1.0 으로 매핑한다. **정규화는 각 모듈 안에서 min-max 로 끝난다.** 앙상블 단계에는 별도 정규화가 없다 (`ensemble.py:16-21`) — 이미 같은 스케일이라 그냥 더하면 된다.

모든 min-max 는 `max == min` 인 경우를 처리한다. 그때는 전부 `0.5` 를 준다 (예: `frequency.py:29-30`). 데이터가 없을 때 0으로 나누지 않기 위해서다.

### `frequency` — 역대 전체 출현 빈도

역대 모든 회차에서 각 번호가 몇 번 나왔는지 센다. 보너스 번호는 `× 0.3` 가중으로 더한다 (`frequency.py:22`). 보너스가 당첨번호보다 덜 중요하다는 판단이다. 그 뒤 min-max 정규화.

> 이 `0.3` 은 임의값이다. 근거 문서가 없다. 사용자에게 노출되는 통계 API 는 이 가중을 쓰지 않고 `include_bonus` 옵션으로 명시적으로 선택하게 한다 ([[api-contract]]).

### `delay` — 지연 번호

각 번호가 마지막으로 나온 이후 몇 회차가 지났는지 센다 (`delay.py:23-25`). min-max 정규화 후, **95 퍼센타일 이상으로 오래 안 나온 번호는 점수에 `× 0.85` 를 곱해 깎는다** (`delay.py:32-36`).

깎는 이유가 흥미롭다. 순수하게 "오래 안 나왔으니 나올 때가 됐다" 를 따르면 극단적 롱테일 번호가 항상 최고점을 받는다. 그것은 도박사의 오류다. 감쇠는 그 편향을 부분적으로 상쇄한다. 완전히 제거하지는 않는다.

### `hot_cold` — 최근 회차 가중 빈도

최근 `hot_rounds`(기본 20)회차만 본다. 각 회차에 가중치를 준다 (`hot_cold.py:24-25`):

```
weight = 1.0 - (최신으로부터의_순번 / n) * 0.5
```

가장 최근 회차가 `1.0`, 가장 오래된 회차가 `0.5` 다. 선형 감쇠. 이 가중 빈도를 min-max 정규화한다.

앙상블에서 가장 높은 가중치(`0.30`)를 받는 모듈이다.

### `pattern` — 두 가지 용도

`pattern.analyze(num_rows)` 는 **조합 레벨 분포**를 반환한다 (`pattern.py:14-56`).

| 키 | 뜻 |
|----|-----|
| `odd_even_dist` | 홀:짝 비율의 분포 |
| `high_low_dist` | 고:저 비율의 분포. **고 = 23 이상**, 저 = 1~22 (`pattern.py:28`) |
| `consecutive_ratio` | 연속번호 1쌍 이상 포함된 회차의 비율 |
| `sum_range` | `min`=10퍼센타일, `max`=90퍼센타일, `peak`=중앙값 |
| `tail_diversity_avg` | 끝자리 종류 수의 평균 |
| `tail_counts` | 끝자리 0~9 각각의 등장 합 |

`pattern.per_number(pattern) -> Dict[int, float]` 는 **번호별 보정 점수**를 반환한다 (`pattern.py:59-92`). 끝자리 빈도를 min-max 해서 `tail_score` 를 만들고:

```python
raw = 0.5 * tail_score + 0.5          # 0.5 ~ 1.0
hl_bonus = 0.1 if (지배적 고저 성향이 이 번호의 반쪽을 선호) else 0.0
score = min(1.0, raw + hl_bonus)
```

`raw` 의 하한이 0.5 라서 이 모듈은 어떤 번호도 0점으로 죽이지 않는다. 보정 모듈이지 선별 모듈이 아니다.

> **함정.** 기존 `CLAUDE.md` 는 "패턴 모듈은 2가지로 활용: `per_number()` 와 **조합 레벨 필터**" 라고 적었다. 그러나 `pattern.py` 에는 조합 필터 함수가 **없다.** 필터는 `montecarlo.py` 안에 인라인으로 구현돼 있고, `analyze()` 가 반환한 dict 를 직접 읽는다. 신규 백엔드로 이식할 때 "pattern 모듈의 필터 함수" 를 찾다가 시간을 버리지 않도록 여기 적어둔다.

---

## 앙상블

`ensemble.py:16-21`. 단순 가중 선형합이다.

```python
score[n] = freq[n]*0.25 + delay[n]*0.25 + hot_cold[n]*0.30 + pattern_bonus[n]*0.20
```

그게 전부다. 정규화도, 비선형 변환도, 상호작용 항도 없다.

---

## 몬테카를로

`montecarlo.py:12-115`. `simulate(ensemble_scores, pattern, *, sets, simulations, seed=None)`.

### 1. 확률 벡터

```python
probs = np.clip(scores, 1e-6, None)
probs = probs / probs.sum()
```

`clip` 이 없으면 점수 0인 번호가 뽑힐 수 없고, 합이 0이면 나누기가 터진다.

### 2. 추출

`rng.choice(1..45, size=6, replace=False, p=probs)` — 확률 가중 **비복원** 추출. 기본 50,000회.

### 3. 패턴 필터

뽑힌 조합이 아래 **네 조건을 모두** 만족해야 유효(valid)하다 (`montecarlo.py:51-56`).

```
odd_even_dist[홀짝키]  >= oe_thresh
high_low_dist[고저키]  >= hl_thresh
sum_min <= 합계 <= sum_max          # pattern 의 10~90 퍼센타일
끝자리_종류수 >= tail_diversity_avg - 1
```

임계값은 `max(0.05, min(분포의 값들))` 이다 (`montecarlo.py:35-36`). 즉 **역사적으로 한 번이라도 관찰된 만큼 흔한 패턴이면 통과**시킨다. 관대한 필터다. 극단적 조합(홀6:짝0, 합계 40 등)만 걸러낸다.

### 4. 세트 선택

유효 조합 중 **등장 빈도가 높은 순**으로 상위 `sets` 개를 고른다 (`source="frequent_combo"`). 50,000회 중 같은 조합이 여러 번 나온 것이 곧 앙상블 점수가 높은 번호들의 조합이라는 뜻이다.

부족하면 상위 10개 후보 번호에서 앙상블 점수 가중 샘플링으로 채운다. 최대 200회 시도 (`source="top10_sampling"`).

최종 정렬 기준은 `avg_number_hits` 내림차순.

### `avg_number_hits` — `confidence` 가 아니다

```python
avg_number_hits = int(sum(number_counts[n] for n in combo) / 6)
```

조합의 6개 번호가 **유효 조합 전체에서 평균 몇 번 등장했는가**. 정수다. 비율이 아니다. 확률이 아니다.

> **문서-코드 불일치.** 기존 `CLAUDE.md` 는 `confidence` 를 "조합의 6개 번호가 유효 조합에서 평균적으로 등장한 **비율**(해석 가능성 우선 정의)" 라고 적었다. 코드베이스 전체에 `confidence` 라는 식별자는 **존재하지 않는다**. 문서가 존재하지 않는 확률 개념을 발명했고, 그것이 하필 [[forbidden-expressions|금지 표현]]이다.
>
> 신규 API 는 `avg_number_hits` 를 사용자에게 노출하지 않는다. 시뮬레이션 내부 수치이고, 사용자가 해석할 방법이 없으며, 해석하려 들면 확률로 오해한다. 대신 `traits` 로 조합의 사실만 서술한다 ([[api-contract]]).

반환되는 다른 값: `hit_count`(그 조합이 정확히 등장한 횟수), `valid_combos_count`, `total_simulations`.

### ★ 비용은 전부 여기에 있다 (2026-08-12 실측)

개발 DB 1,232회차 기준으로 `predict()` 안의 시간 배분이다.

| 구간 | 시간 | 비고 |
|---|---|---|
| DB 조회(1,232행) | 5.0ms | |
| `frequency` + `delay` + `hot_cold` + `pattern` + `ensemble` | **합계 4.6ms** | 회차에만 의존 |
| **`montecarlo.simulate`** | **2,522ms** | 전체의 99.6% |

**분석기를 캐시해도 의미가 없다.** 다 합쳐 5ms 이므로, 캐시는 2.5초를 2.4954초로 만든다. 추천이 느린 이유를 찾을 때 분석기부터 뒤지지 않는다.

### ★ 함정 — 작은 numpy 호출 5만 회는 동시 실행에서 n² 로 무너진다

`simulate` 의 루프는 5만 회를 돌며 매 회 `rng.choice` · `np.sort` · `np.sum` 같은 **작은 numpy 호출**을 여러 번 한다. 작은 numpy 호출은 각각 GIL 을 잠깐 놓았다 다시 잡는데, 스레드가 둘 이상이면 이 손바꿈이 계산보다 비싸진다(convoy).

| 동시 요청 | 벽시계 | 1건 대비 |
|---|---|---|
| 1건 | 2.52s | 1.0배 |
| 2건 | 16.35s | **6.5배** |
| 4건 | 62.58s | **24.8배** |

같은 조건에서 순수 파이썬 루프는 2.0배·4.1배(= GIL 직렬화, 정상), 큰 numpy 연산도 2.2배·4.1배였다. **무너지는 것은 "작은 numpy 호출이 아주 많은" 이 코드뿐이다.**

귀결: 이 계산은 스레드를 늘려도 총 처리량이 늘지 않는다. 그래서 백엔드는 몬테카를로 경로를 **한 번에 하나만** 실행한다 ([[0012-serialize-monte-carlo]]). 알고리즘은 그대로 두고 실행 방식만 막은 것이다.

**`simulations` 를 성능을 이유로 낮추지 않는다.** 그것은 결과를 바꾸는 일이고, 아래 5번 규칙(가중치 변경 = 백테스트 + ADR)과 같은 부류다.

---

## 대체 전략 5종

`backend/app/prediction/strategies/`. 앙상블과 무관하게 각자 조합을 만든다. API 의 `strategy` 파라미터로 선택한다.

**`pair_affinity`** — 역대 동시 등장 빈도 행렬(46×46)을 만든다. 궁합 합이 높은 번호를 가중 추출해 시작점을 잡고, 이후 상위 5개 후보에서 가중 샘플링한다.

**`balanced_range`** — 1-15 / 16-30 / 31-45 세 구간에서 각 2개씩. 구간 안에서는 역대 빈도 가중.

**`cold_return`** — `min_gap`(기본 30)회차 이상 안 나오다가 최근 `recent_window`(기본 5)회차 안에 다시 나온 "부활 번호" 를 우선한다. 후보가 6개 미만이면 폴백.

**`golden_combo`** — 합계 120~150, 홀짝 3:3, 고저 3:3, 끝자리 5종 이상, 연속 1쌍 이상을 **모두** 만족하는 조합을 찾는다. 최대 400회 시도, 실패하면 전체 빈도 기반 폴백.

**`pure_random`** — 1~45 균등 무작위 6개. **통제군이다.** 이것을 지우지 않는다. 다른 전략의 결과가 랜덤과 구분되지 않는다는 사실을 보여주는 것이 이 서비스의 정직함이다.

---

## 이식할 때 지킬 것

1. **모듈을 재작성하지 않는다.** SQLite 접근부만 걷어낸다. ~~`predictor.py` 는 `sqlite3` 표준 라이브러리를 직접 쓰고 있다.~~ **완료(2026-07-09)**: `predict()` 가 `db_path` 대신 `Sequence[Draw]` 를 받는다. 데이터를 여는 쪽은 호출자다 — 백엔드의 Postgres 접근은 async 라 동기 함수인 여기서 부를 수 없다. 알고리즘은 한 줄도 바뀌지 않았다.
2. `predictor.predict()` 는 동기 함수로 유지하고, 라우터에서 `asyncio.to_thread` 로 감싼다. **다만 그 스레드에 동시에 여럿을 보내지 않는다** — 위 함정 절과 [[0012-serialize-monte-carlo]].
3. `window` 파라미터를 일반화한다. 지금은 `hot_rounds=20` 고정이지만 API 는 20/50/100/all 을 요구한다.
4. `avg_number_hits`, `hit_count`, `valid_combos_count` 를 API 응답에서 뺀다.
5. 가중치를 바꾸지 않는다. 바꾸려면 백테스트 + ADR.

관련: [[forbidden-expressions]] · [[api-contract]] · [[lotto-rules]] · [[dream-pipeline]]
