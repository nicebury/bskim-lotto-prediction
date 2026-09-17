---
type: contract
title: "번호놀이터 게임 모듈 계약"
description: "게임 세션 6개가 서로를 모른 채 개발하기 위한 인터페이스. GameModule·NumberPool·입력·좌표계·소유 경계"
tags: [contract, design, a11y]
owner: shared
status: stable
sources: ["raw:work_order/task5_game.md", "frontend/src/lib/share.ts:120", "frontend/src/styles/tokens.css:71"]
created: 2026-09-08
updated: 2026-09-16
---

# 번호놀이터 게임 모듈 계약

**게임 여섯 개를 여섯 세션이 동시에 만든다.** 이 페이지가 그 여섯의 유일한 접점이다.
자기 게임의 사양서(`20-design/game-gNN-*.md`)와 이 페이지만 읽고 구현한다.
**다른 게임의 코드를 읽지 않는다.**

계약 페이지의 지위는 [[component-boundaries]] 와 같다 — 계약과 코드가 다르면 코드가 틀린 것이다.

## 게임 목록과 ID

| ID | 게임 | slug | 유형 | 사양서 |
|----|------|------|------|--------|
| G01 | 오리 사격장 | `shooting` | 은닉 | [[game-g01-shooting]] |
| G02 | 크레인 뽑기 | `crane` | **은닉** | [[game-g02-crane]] |
| G03 | 로또볼 홈런 | `flyball` | 색힌트 | [[game-g03-flyball]] |
| G04 | 얼음판 컬링 | `curling` | **은닉** | [[game-g04-curling]] |
| G05 | 플린코 낙하 | `plinko` | 예약 | [[game-g05-plinko]] |
| G06 | 링 통과 비행 | `ringdash` | 예약 | [[game-g06-ringdash]] |

`ringdash` 는 "플래피" 계열이지만 그 이름을 쓰지 않는다 — 상표 분쟁 이력이 있는 이름이다
([[trademark-check]] 의 판단 기준과 같은 이유).

## 설계 원칙 세 줄

1. **게임은 순수 함수 덩어리다.** `fixedUpdate` · `draw` · `handle` 만 구현한다.
   rAF · DPR · 리사이즈 · 가시성 · 입력 정규화 · 번호 중복 방지 · HUD · 결과 화면은 **전부 호스트**가 한다.
2. **번호는 게임이 만들지 않는다.** 게임은 "이 자리를 잡았다" 고 신고만 하고, 실제 1~45 값은
   호스트가 준다. 게임 코드에 `Math.random()` 이나 `1..45` 리터럴이 있으면 반려한다.
3. **공유 파일은 선행 단계에서 전부 확정하고 잠근다.** 게임 세션은 자기 폴더 밖을 한 글자도 고치지 않는다.

---

## GameModule — 게임이 export 하는 것

```ts
// src/games/core/types.ts   (선행 단계 소유 · 게임 착수와 동시에 동결)

export type GameSlug = 'shooting' | 'crane' | 'flyball' | 'curling' | 'plinko' | 'ringdash'

export interface StageSize { readonly width: number; readonly height: number }

/**
 * ⚠ 이 타입을 담는 모듈(core/catalog.ts)은 **서버 컴포넌트가 import 한다** —
 *   목록 페이지 SSR 텍스트·generateMetadata·sitemap 이 읽는다.
 *   따라서 catalog.ts 에 canvas·window 참조가 한 줄이라도 있으면 빌드가 깨진다.
 */
export interface GameMeta {
  slug: GameSlug
  code: 'G01' | 'G02' | 'G03' | 'G04' | 'G05' | 'G06'
  title: string              // '오리 사격장'
  tagline: string            // 한 문장 목표. 목록 카드 + meta description
  intro: string              // 2~3문장. 상세 페이지 SSR 본문(JS 꺼도 보이는 글)
  howTo: readonly string[]   // 조작 3~4줄. <ol> 로 SSR 렌더된다
  keyGuide: string           // 키보드 조작 한 줄 (접근성)
  stage: StageSize
  paceSeconds: number        // 6개 수집 목표 시간. 카드에 "약 90초" 로 표시
  accent: 'lotto' | 'stats' | 'reco' | 'dream' | 'news' | 'play'
}

export interface GameModule {
  readonly meta: GameMeta
  /** 재시작은 destroy 후 create 를 다시 부른다. 상태를 되돌리지 않는다. */
  create(ctx: GameContext): GameInstance
}

export interface GameInstance {
  /** dt 는 **항상** 1/60 이다. 이 값을 신뢰해도 된다. */
  fixedUpdate(dt: number): void
  /**
   * @param alpha 0~1 보간 계수. 마지막 스텝 이후 경과 비율. 위치를 lerp 해 그린다
   * @param timeMs 시작부터의 누적 밀리초(일시정지 동안 멈춘다). 반짝임·물결에 쓴다
   */
  draw(c: CanvasRenderingContext2D, alpha: number, timeMs: number): void
  handle?(input: GameInput): void
  onPause?(): void
  onResume?(): void
  destroy?(): void
}
```

## GameContext — 호스트가 주입하는 것

```ts
export interface GameContext {
  readonly stage: StageSize
  readonly pool: NumberPool     // ★ 번호 중복 방지의 유일한 통로
  readonly rng: Rng             // ★ Math.random 대체
  readonly palette: Palette     // ★ hex 리터럴 대체
  readonly input: InputState    // 눌림 상태 폴링
  readonly draw: DrawKit        // 공용 그리기 프리미티브
  emit(event: GameEvent): void  // 캔버스 밖 DOM HUD 에 말을 건다
  readonly reducedMotion: boolean
  readonly quality: { readonly level: 'high' | 'low' }
}

export type GameEvent =
  | { type: 'status'; text: string }                        // aria-live 로 읽힌다
  | { type: 'hint'; text: string }                          // 캔버스 아래 보조 문구
  | { type: 'haptic'; ms: 10 | 20 | 40 }                    // navigator.vibrate
  | { type: 'attempt'; used: number; total: number | null }  // "3/12발" HUD
  | { type: 'retry'; reason: 'duplicate' | 'out' | 'short' }
```

---

## ★ NumberPool — 중복 방지를 인터페이스로 강제한다

게임마다 중복 제거를 따로 구현하면 여섯 개 중 하나는 반드시 어긋난다. 그래서 **게임에서
번호를 고를 권한을 완전히 빼앗는다.** 게임이 다룰 수 있는 값은 두 가지뿐이다 — 호스트가 준
`Reservation` 토큰과, 호스트가 배치해 준 보드 칸 번호.

```ts
export type SlotIndex = 0 | 1 | 2 | 3 | 4 | 5

/** 아직 확정되지 않았지만 다른 누구도 가져갈 수 없는 번호. 라벨(링·캡슐·칸)에 쓴다. */
export interface Reservation { readonly token: number; readonly value: number }

export type ClaimResult =
  | { ok: true; slot: SlotIndex; value: number; complete: boolean }
  | { ok: false; reason: 'taken' | 'stale' | 'full' }

export interface NumberPool {
  readonly awarded: readonly number[]
  readonly slotsLeft: number
  readonly complete: boolean
  isAwarded(n: number): boolean
  isFree(n: number): boolean

  // ── 예약형: 라벨이 미리 보이는 게임 ─────────────────
  reserve(): Reservation | null
  reserveMany(count: number): Reservation[]     // 부족하면 가능한 만큼만
  release(token: number): void                  // 링이 지나갔다 / 캡슐이 사라졌다
  commit(token: number): ClaimResult            // 'stale' = 이미 release 됐다

  // ── 보드형: 물리가 칸을 정하는 게임 ─────────────────
  claimExact(n: number): ClaimResult            // 'taken' = 재투 대상
  board(): readonly { readonly value: number; readonly awarded: boolean }[]

  // ── 은닉형: 맞히는 순간 처음 정해지는 게임 ──────────
  awardHidden(): ClaimResult
}
```

**호스트가 지키는 불변식.** 게임이 어겨도 깨지지 않도록 호스트 안에서 방어한다.

| 불변식 | 구현 |
|--------|------|
| `reserve()` 는 이미 획득했거나 이미 예약된 값을 절대 내지 않는다 | `Set<number> awarded` + `Map<token,value> live` 로 판정 |
| 같은 토큰을 두 번 `commit` 할 수 없다 | commit 시 `live.delete(token)`, 없으면 `stale` |
| `complete` 이후 모든 claim 은 `full` | 슬롯 6개 소진 즉시 차단 |
| 게임이 죽어도 예약이 새지 않는다 | `destroy()` 시 호스트가 `live` 전체를 release |

### 세 유형이 이 하나의 API 에 어떻게 맞는가

| 유형 | 게임 | 쓰는 메서드 | 왜 맞는가 |
|------|------|-----------|----------|
| **은닉형** | G01 · G02 · **G04** | `awardHidden()` | 번호가 맞힌 순간(G01) · 볼이 깨지는 순간(G02) · 칸이 뒤집히는 순간(G04)에 처음 존재한다. 사용자에게 사전 정보가 없으므로 남은 풀에서 뽑아도 모순이 없다. **중복이 구조적으로 불가능하다** |
| **색힌트형** | G03 · G05 · G06 | `reserve` → `commit`/`release` | 예약형과 **API 가 같고 화면만 다르다** — 값을 숨기고 `ballRange(value)` 색만 보여준다. 아래 절을 반드시 읽는다 |
| ~~보드형~~ | (없음) | ~~`board()` → `claimExact(n)`~~ | **2026-09-17 에 비었다.** G04 가 유일한 사용처였는데 은닉형으로 옮겼다 — 아래 "G04 를 보드형에서 은닉형으로" 를 본다. API 는 `pool.ts` 에 그대로 두되 **쓰는 게임이 없다** |

### ★ 번호를 미리 보여주지 않는다 — 색 힌트형 (2026-09-10, 사용자 결정)

**여섯 게임 전부, 번호는 손에 넣는 순간 처음 드러난다.** 미리 보여주는 게임은 없다.

원래 예약형 셋(G03 · G05 · G06)은 링·구간·빈에 번호를 적어 두고 "저 7번을 노린다" 를
만들려고 했다. 그런데 그러면 **놀이가 조준 문제로 좁아진다** — 원하는 번호가 한 자리에
고정돼 있으니 그 자리만 맞히면 끝이고, 못 맞히면 원하지 않는 번호를 억지로 받는다.
번호가 숨어 있어야 "무엇이 나올까" 가 살아 있고, 그것이 로또를 뽑는 경험과 같다.

**대신 색은 보여준다.** 공식 5구간 색(노랑 1~10 / 파랑 11~20 / 빨강 21~30 / 회색 31~40 /
초록 41~45)만 알려 주면 "이번엔 파란 볼이네" 정도의 기대가 생기고, 사이트 전체에서 학습한
색-구간 대응도 함께 강화된다. 번호 자체는 얻는 순간 **볼이 깨지며** 드러난다.

#### API 는 그대로다 — `reserve()` 를 쓰되 값을 그리지 않는다

```ts
// 한 번의 시도 전에 하나 잡는다
const slot = pool.reserve()                     // { token, value }

// 화면에는 색만. ⚠ value 를 절대 그리지 않는다
drawBall(x, y, r, palette.ball[ballRange(slot.value)])   // 무지 볼

// 얻었다 → 깨지며 공개
const result = pool.commit(slot.token)          // result.value 를 이때 처음 그린다

// 놓쳤다 → 되돌린다. 다음 시도에서 새로 reserve 한다
pool.release(slot.token)
```

**`awardHidden()` 을 쓰지 않는 이유.** 그것은 색조차 미리 정하지 않는다. 색을 보여주려면
값이 먼저 정해져 있어야 하고, 정해진 값은 풀에서 빠져 있어야 한다 — 그것이 곧 `reserve()` 다.
**색을 보여주는 순간부터 그 번호는 이미 예약된 것**이라, 화면과 풀이 어긋날 여지가 없다.

⚠ **거짓말이 되지 않는지 확인하는 기준 한 줄:** *화면에 보이는 색이 실제로 받게 될 번호의
구간과 같은가.* 같으면 참이다. 색을 무작위로 칠하고 번호를 따로 뽑으면 그 순간 거짓이 된다.

⚠ **놓친 볼은 반드시 `release` 한다.** 안 하면 그 번호가 판이 끝날 때까지 잠긴다.

### 중복이 났을 때 — 게임별 규약

**규칙 한 줄: 번호가 화면에 보였다면 자동 대체 금지(재투). 보이지 않았다면 중복을 아예 만들지 않는다.**

| 게임 | 중복 가능? | 규약 |
|------|-----------|------|
| **여섯 게임 전부** | 불가 | — (호스트가 미리 배제) |

**2026-09-17 부터 중복이 날 수 있는 게임은 하나도 없다.** 마지막까지 남아 있던 G04 가
은닉형으로 바뀌면서 재투 규약도 함께 사라졌다 — 아래 절을 본다.

### G04 를 보드형에서 은닉형으로 (2026-09-17 · 사용자 결정)

G04 는 45칸에 번호를 **적어 두고** 있었다. 여섯 게임 중 유일한 예외였고, 위
["번호를 미리 보여주지 않는다"](#-번호를-미리-보여주지-않는다--색-힌트형-2026-09-10-사용자-결정)
가 2026-09-10 에 정한 *"여섯 게임 전부, 번호는 손에 넣는 순간 처음 드러난다"* 와 어긋난 채였다.
이제 **45칸이 전부 뒷면**이고, 스톤이 멈춘 칸만 뒤집히며 번호가 나온다.

| 무엇 | 전 | 후 |
|---|---|---|
| API | `board()` → `claimExact(n)` | **`awardHidden()`** |
| 중복 | 가능 → **재투**(기회 소모 없음) | **불가능** |
| 이미 얻은 칸 | 체크 표시(그냥 지나간다) | **장애물 — 스톤이 튕긴다** |
| 기회 | 무제한 | **9번** (`failed` 단계가 생겼다) |
| 꽝 | 없음 | **45칸 중 9칸** |

⚠ **은닉형으로 바뀌었어도 "화면이 거짓말을 하지 않는다" 는 기준은 그대로다.** 전에는
*"스톤이 17번 칸에 멈췄는데 33번을 주면 안 된다"* 였는데, 이제 칸에 번호가 없으므로 그
모순 자체가 성립하지 않는다. 대신 **뒤집힌 칸이 보여 준 번호는 반드시 그 투구로 얻은 것**
이어야 한다.

⚠ **이미 얻은 칸을 장애물로 삼는 것이 재투를 대신한다.** 중복을 "일어난 뒤에 무르는" 대신
**물리적으로 일어나지 않게** 만든 것이다. 무를 일이 없으니 "이 투구는 없던 것" 이라는
설명도, 그 설명을 못 읽는 사용자를 위한 배려도 필요 없어졌다.

---

## 게임 루프 — 호스트가 한다

```ts
const STEP_MS = 1000 / 60   // 16.667ms 고정
const MAX_STEPS = 5         // 한 프레임 최대 5스텝. 그 이상은 버린다
const CLAMP_MS = 250        // 탭 복귀 직후 누적치 폭발 방지
```

- **고정 타임스텝 + 렌더 보간.** 저사양 폰에서 프레임이 튀어도 물리가 달라지지 않는다 —
  컬링 스톤이 30fps 에서 두 배로 미끄러지는 사고를 원천 차단한다.
- **DPR 캡.** `min(devicePixelRatio, 2)`, `hardwareConcurrency <= 4` 이면 `1.5`.
- **좌표계 고정.** 매 리사이즈마다 `ctx.setTransform(s*dpr, 0, 0, s*dpr, 0, 0)`.
  **게임은 언제나 논리 좌표(예: 360×560)로만 그린다.**
  ⚠ 게임 코드에 `devicePixelRatio` 라는 문자열이 등장하면 반려한다. 여섯 세션이 DPR 을 각자
  다루면 그중 하나는 반드시 흐릿하게 나온다.
- **리사이즈.** `ResizeObserver`. 0.5px 미만 변화는 무시한다 — iOS 주소창 애니메이션 중
  초당 60회 재할당을 막는다. 논리 좌표가 불변이므로 게임은 아무것도 하지 않아도 된다.
- **일시정지.** `visibilitychange` 만 신호로 쓴다. `blur` 는 iOS 에서 오탐이 많아 쓰지 않는다.
- **품질 워치독.** 최근 90프레임 평균이 24ms 를 넘으면 `quality.level` 을 `'low'` 로 한 번
  내리고 **되돌리지 않는다** — 오르내리며 깜빡이는 편이 더 나쁘다.

### prefers-reduced-motion — 게임에서의 예외

[[accessibility]] 는 *"JS 애니메이션도 `matchMedia` 로 감지해 타이머 자체를 걸지 않는다"* 고
정한다. 그러나 게임은 애니메이션이 곧 콘텐츠다. **타이머를 끄면 게임이 존재하지 않는다.**

그래서 **장식과 본체를 가른다.** 사용자가 링크를 눌러 명시적으로 시작한 상호작용이라
자동 재생되는 장식과 성격이 다르다. 게임은 `ctx.reducedMotion` 으로 다음 넷만 반응한다.

1. 배경 패럴랙스 정지  2. 파티클 0  3. 화면 흔들림 0  4. 번호 공개 연출을 페이드로 대체

게임 물리와 이동은 그대로 둔다. **여섯 게임이 이 해석을 똑같이 한다.**

---

## ★ 이미 끝난 판으로 시작될 때 — 여섯 게임 전부 대응한다

### 증상

**게임 페이지에 들어왔는데 게임이 없고 "다시하기" 버튼만 있다.** 눌러야 비로소 게임이 뜬다.
한 번 완주하면 그 게임은 **30분 동안 계속 그렇게 열린다.** 사용자에게는 고장으로 보인다.

### 원인 (2026-09-10 확인)

`run-store` 는 획득할 때마다 진행을 `sessionStorage` 에 저장하고(`STALE_MS` = 30분),
`GameStage` 는 첫 마운트에서 그것을 복원한다. 예전에는 복원된 기록이 **완료 상태이면
캔버스를 아예 렌더하지 않고** 결과 패널만 띄웠다.

> *"이미 6개를 모은 사람에게 다시 캔버스를 내미는 것은 한 일을 무르는 것처럼 보인다"*

의도는 그랬지만 실제로는 정반대로 읽혔다. **게임을 하러 온 사람에게 게임이 없는 화면**을
내미는 것이 훨씬 크게 잘못이다.

### 고친 방법

**호스트** — 캔버스를 항상 띄운다. 결과 패널은 그 아래에 그대로 두므로 "한 일" 도 사라지지
않는다. (`GameStage` 의 `setPlaying(!saved.complete)` 제거. **이미 반영됐다.**)

**게임** — 그러면 이번에는 *이미 6개를 모은 판*이 캔버스에 올라온다. 호스트가 획득 번호를
`pool` 에 미리 채운 채로 `create` 하기 때문이다. 이때 `ready` 를 보내면 더 모을 것이 없는
사람에게 "시작" 버튼을 내밀게 되고, 눌러도 아무것도 얻지 못하는 판이 돌아간다.

**첫 `fixedUpdate` 에서 풀을 확인하고 곧바로 `cleared` 로 간다.**

```ts
if (!started) {
  started = true
  emit({ type: 'attempt', used: 0, total: MAX_ATTEMPTS })

  // ★ 호스트가 완주 기록을 복원했다면 이미 끝난 판이다.
  if (pool.complete) {
    step = 'done'                                   // 게임 내부 상태도 멈춰 둔다
    emit({ type: 'phase', phase: 'cleared',
           title: '6개 모으기 완료', text: '번호 6개를 모았어요' })
    return
  }

  emit({ type: 'phase', phase: 'ready', title: meta.title, text: '…' })
}
```

⚠ **`step` 을 멈춘 상태로 두는 것까지 해야 한다.** `phase` 만 보내고 내부 상태를 `playing`
으로 두면, 호스트 오버레이 뒤에서 판이 계속 굴러간다. 오버레이의 "다시하기" 를 누르기 전에
집게가 혼자 움직이는 화면이 된다.

⚠ 이 처리를 하지 않는 게임은 **깨지지는 않는다** — `pool` 이 모든 claim 에 `full` 을 돌려주기
때문이다. 다만 사용자는 아무것도 얻지 못하는 판을 계속 돌리게 된다.

### 확인하는 법

한 판을 끝까지 완주한 뒤 **같은 게임 페이지를 새로고침**한다. 게임기가 그려진 채로
"6개 모으기 완료 · 다시하기 · 번호보기" 오버레이가 떠야 한다. 빈 화면에 버튼만 있으면 미대응.

→ G02 가 먼저 부딪혀 정한 것이다([[game-g02-crane]]). **다섯 게임이 같게 한다.**

## 입력 — 두 채널로 온다

포인터와 키보드를 하나로 뭉개면 조준형(좌표 필요)과 타이밍형(누름만 필요)이 둘 다 불편해진다.

```ts
export type GameAction = 'primary' | 'left' | 'right' | 'up' | 'down'

export type GameInput =
  | { kind: 'pointer'; phase: 'down'|'move'|'up'|'cancel'; x: number; y: number; id: number }
  | { kind: 'action'; phase: 'down'|'up'; action: GameAction; source: 'pointer'|'key' }

export interface InputState {
  down(action: GameAction): boolean            // 꾹 누름 폴링(집게 이동 등)
  readonly pointer: { active: boolean; x: number; y: number }
}
```

| 원천 | 산출 |
|------|------|
| `pointerdown`(캔버스) | `pointer down` **과** `action primary down` 둘 다 |
| `pointerup` / `pointercancel` | `pointer up`/`cancel` + `action primary up` |
| `Space` / `Enter` | `action primary` (`e.repeat` 무시, `preventDefault`) |
| 방향키 / `WASD` | 해당 방향 action (`preventDefault` 로 페이지 스크롤 차단) |

- 좌표는 **논리 좌표로 변환되어** 도착한다. 게임이 `getBoundingClientRect` 를 부를 일이 없다.
- `setPointerCapture` 를 down 에서 건다 → 컬링 드래그가 캔버스 밖으로 나가도 끊기지 않는다.
- **멀티터치는 첫 포인터만** 전달한다. 두 손가락 확대 시도 중 오발사를 막는다.
- `pointercancel` 은 호스트가 `up` 과 같게 취급해 전달한다. iOS 스와이프에서 자주 발생한다.
- 캔버스 밖 **DOM 조작 버튼**(발사/정지/드롭)을 호스트가 항상 함께 그린다. 그 클릭도
  `action primary` 로 들어온다. 키보드·스크린리더 사용자와 "어디를 눌러야 하는지 모르겠는"
  사용자를 동시에 구제한다.
- ⚠ **버튼 라벨은 게임이 정하지 않는다.** `GameMeta` 에도 `GameEvent` 에도 라벨을 넘길 통로가
  없고, 그것을 만들려면 동결된 `types.ts` 를 고쳐 여섯 게임이 동시에 깨진다. 호스트가 고정
  라벨을 쓰고, **지금 눌러야 할 것은 게임이 `emit({type:'hint'})` 로** 말한다("원하는 캡슐
  위에서 멈추세요" → "한 번 더 눌러 집게를 내립니다"). 캔버스 아래 문구는 항상 노출되므로
  스크린리더 사용자도 같은 안내를 받는다.
  → G02 가 가장 먼저 부딪혀 정한 것이다([[game-g02-crane]] "구현 결정"). **다섯 게임이 같게 한다.**

---

## 난수 — mulberry32

```ts
export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
```

**왜 이것인가.** 12줄이면 끝나 라이브러리 금지 제약과 맞는다. 주기 2³²(약 43억)인데 한 판에
쓰는 난수는 많아야 수만 개다. `Math.imul` 만 쓰므로 저사양 폰에서도 빠르다.
xoshiro128\*\* 은 상태 4개 초기화가 필요하고 PCG32 는 64비트라 `BigInt` 가 드는데,
2분짜리 미니게임에 과하다.

**결정론이 필요한 실제 이유:** "플린코가 특정 시드에서 못에 끼인다" 같은 버그를 시드만 받아
재현할 수 있다. 번호 배정(`reserve` 순서)도 같은 rng 를 타므로 한 판 전체가 재현된다.

시드는 `(Date.now() ^ crypto.getRandomValues(new Uint32Array(1))[0]) >>> 0`.
재시작마다 새로 뽑는다. 개발 중에는 `?seed=12345` 로 고정할 수 있다.

`Rng` 표면: `next()` `int(min,maxInclusive)` `range(min,max)` `pick(arr)` `sign()` `gauss()`
`fork()`. `fork()` 는 배경 연출용 독립 스트림이다 — 배경 파티클이 물리 난수를 소비해
재현성을 깨는 것을 막는다.

**검증 게이트:** `grep -rn "Math.random" src/games/` 결과가 비어 있어야 한다.

---

## 팔레트 — 캔버스에서 디자인 토큰 쓰기

`share.ts` 는 볼 색 hex 를 하드코딩해 두었다. 그것은 **오프스크린 캔버스라 `document` 에
붙어 있지 않아서**다. 놀이터 캔버스는 DOM 에 붙으므로 사정이 다르다.

```ts
getComputedStyle(document.documentElement).getPropertyValue('--ball-1-10').trim()
```

마운트 시 1회 수집하고, `MutationObserver`(`documentElement`, `attributeFilter: ['data-theme']`)
와 `matchMedia('(prefers-color-scheme: dark)')` 변경 시 재수집해 게임에 새 객체를 준다.

덕분에 **게임 코드에 hex 리터럴이 하나도 없고**, 다크모드가 캔버스 안까지 저절로 따라온다.

```ts
export interface Palette {
  bg, surface, surface2, border, text, textMuted: string
  primary, onAccent, success, warning, danger, info: string
  svc: Record<'lotto'|'stats'|'reco'|'dream'|'news'|'play', string>
  ball: Record<1|2|3|4|5, string>      // ballRange() 결과를 그대로 키로 쓴다
  ballFg: string; ballFgDark: string
  fontSans: string
}
```

**캔버스 안에서도 공식 5구간 색을 지킨다**([[0009-official-ball-colors-over-mockup]]).
게임 아트는 자유롭게 꾸미되, 번호가 붙은 볼·캡슐·링·칸만은
`1~10 노랑 / 11~20 파랑 / 21~30 빨강 / 31~40 회색 / 41~45 초록` 을 따른다.
밝은 볼(노랑·초록) 위 숫자는 `ballFgDark` 를 쓴다 — 흰 글자는 AA 미달이다.
게임마다 볼 색을 새로 정하면 사용자가 사이트 전체에서 학습한 색-구간 대응이 깨진다.

---

## DrawKit — "허접하지 않음" 의 실제 담보

여섯 게임이 각자 그림자·볼·글자를 그리면 **여섯 개의 다른 제품**이 된다.

```ts
export interface DrawKit {
  roundRect(c, x, y, w, h, r): void
  ball(c, x, y, r, n: number, o?: { alpha?; dim?; ring? }): void
  mysteryBall(c, x, y, r, o?): void
  capsule(c, x, y, r, hue: string, label?: string): void
  softShadow(c, x, y, rx, ry, alpha?): void      // 아래 방향 타원. shadowBlur 를 쓰지 않는다
  bgGradient(c, stage, from, to): void           // 내부 캐시됨
  vignette(c, stage, alpha?): void
  gauge(c, x, y, w, h, ratio, color): void
  text(c, s, x, y, o: { size; weight?; align?; color; alpha? }): void
  particles(max: number): ParticleField          // 풀링. burst(x,y,count,color,spread)
  clamp, lerp, approach, easeOutCubic, ellipseHit
}
```

`ball()` 사양(전 게임 공통): `palette.ball[ballRange(n)]` 채움 → 중심 `(-0.35r, -0.35r)` 에
흰색 α0.55 방사 하이라이트 → 1px 안쪽 링(α0.18 검정) → 숫자 `700 ${r*0.95}px ${fontSans}`,
색은 구간 1·5면 `ballFgDark` 아니면 `ballFg`. `dim` 이면 α0.35 + 체크 표시.

### 시각 언어 4대 규칙 — 여섯 게임 전부 준수

1. 배경 = 세로 그라디언트 1장 + 비네트 1장 + 실루엣 패럴랙스 2겹.
   **정적 배경은 오프스크린 캔버스에 한 번 그려 캐시하고 `drawImage` 로만 쓴다.**
   ⚠ **오프스크린에 구울 때 `draw.bgGradient()` 를 부르지 않는다.** `DrawKit` 은 그라디언트를
   내부 캐시하는데 `CanvasGradient` 는 **그것을 만든 컨텍스트에 묶여 있다.** 오프스크린에서
   만든 것이 캐시에 들어가면 이후 메인 캔버스가 그 캐시를 꺼내 쓰면서 배경이 통째로 사라진다.
   오프스크린 안에서는 받은 컨텍스트로 직접 `createLinearGradient` 를 만든다.
   ⚠ 오프스크린은 **고정 배율(2배)** 로 굽는다. 논리 크기로 구우면 고해상도 화면에서 배경만
   흐리다. 화면 배율을 직접 읽는 것은 금지이므로 고정 배율이 유일한 답이다.
   `quality.level === 'low'` 면 1배로 낮춘다. **생성 실패는 한 번만 시도하고 기억한다** —
   실패를 기억하지 않으면 매 프레임 캔버스를 새로 만들고 버린다.
   → G02 가 먼저 부딪혔다([[game-g02-crane]] "구현 결정").
2. 모든 물체는 지면에 `softShadow` 를 갖는다(부유감 제거).
3. 모든 물체 상단에 1~2px 밝은 림라이트(α0.35). **광원은 항상 좌상단.**
4. 숫자는 반드시 `ball()` 로만 그린다 — 사이트 전체가 쓰는 그 볼과 같아야 한다.

### 오프스크린 캐시의 배율 — `getTransform()` 을 읽는다

규칙 1 이 "정적 배경은 오프스크린 캔버스에 캐시하라" 고 하지만, **게임은 화면 배율을 알 수
없다** — 그 이름을 참조하면 반려된다(위 "좌표계 고정"). 논리 크기(예: 360×620)로 캐시를
만들면 고배율 화면에서 그 한 장만 흐리게 뭉갠다. 캐시를 쓰지 않으면 규칙 1 을 어긴다.

**호스트가 `setTransform(s*dpr, …)` 을 걸어 두므로 그 행렬을 읽으면 된다.**

```ts
const m = c.getTransform()          // 논리 좌표 → 실제 픽셀 배율
const scale = m.a > 0 ? m.a : 1     // 구형 사파리 방어
cache.width = Math.round(W * scale) // 캐시는 실제 픽셀로 만들고
cctx.setTransform(scale, 0, 0, scale, 0, 0)
c.drawImage(cache, x, y, W, H)      // 그릴 때는 논리 크기로
```

배율이 달라졌으면(리사이즈·창 이동) 캐시를 다시 만든다. **게임이 배율을 다루는 것이 아니라
호스트가 정한 배율을 읽기만 하는 것**이라 "여섯 세션이 각자 DPR 을 다루면 하나는 흐려진다"
는 금지 취지에 어긋나지 않는다. 2026-09-08 에 G04 가 실제로 부딪혀 계약에 적었다.

⚠ **캐시 무효화 신호에 팔레트를 넣을 수 없다.** `ctx.palette` 는 `create()` 시점의 스냅샷
이라 테마가 바뀌어도 그 객체는 변하지 않는다(`DrawKit` 은 최신 팔레트를 본다). 그래서
캐시는 **주기적으로도**(1~2초) 다시 그려 테마 전환을 흡수한다 — 45칸을 매 프레임 그리는
것보다 두 자릿수 싸다. → [[log]] 2026-09-08

---

## 파일 소유 경계 — 충돌 제로 설계

```
frontend/src/games/
├── core/                    ← [선행 세션 소유 · 게임 착수와 동시에 동결]
│   ├── types.ts   catalog.ts   loop.ts   input.ts
│   ├── rng.ts     pool.ts      palette.ts  draw.ts
│   └── loaders.ts           ★ slug → () => import(...) 정적 맵
├── g01-shooting/            ← [세션 1] index.ts 가 GameModule 을 default export
├── g02-crane/               ← [세션 2]
├── g03-flyball/             ← [세션 3]
├── g04-curling/             ← [세션 4]
├── g05-plinko/              ← [세션 5]
└── g06-ringdash/            ← [세션 6]

frontend/src/components/playground/   ← [선행 세션 소유]
frontend/src/styles/playground.css    ← [선행 세션 소유]
frontend/src/app/(site)/playground/** ← [선행 세션 소유]
```

**게임 세션이 건드릴 수 있는 것은 `src/games/gNN-*/` **뿐이다.**

`loaders.ts` 는 선행 단계에서 **여섯 항목을 모두 채운 채로** 만든다. 변수 경로 `import()` 는
코드 스플리팅이 되지 않으므로 여섯 줄을 손으로 적는다.

```ts
export const GAME_LOADERS: Record<GameSlug, () => Promise<{ default: GameModule }>> = {
  shooting: () => import('@/games/g01-shooting'),
  crane:    () => import('@/games/g02-crane'),
  flyball:  () => import('@/games/g03-flyball'),
  curling:  () => import('@/games/g04-curling'),
  plinko:   () => import('@/games/g05-plinko'),
  ringdash: () => import('@/games/g06-ringdash'),
}
```

그리고 선행 단계가 여섯 폴더에 **스텁 `index.ts`** 를 만들어 둔다("준비 중" 을 그리는 유효한
`GameModule`). 그래야 게임 세션이 자기 폴더만 덮어쓰면 되고, 타입체크와 빌드가 **항상 통과
상태**를 유지한다. 스텁이 없으면 한 세션이 끝날 때까지 빌드가 깨져 병렬 작업 자체가 불가능하다.

**게임별 CSS 파일을 만들지 않는다.** 캔버스 안에는 CSS 가 없다. 게임이 CSS 를 필요로 한다면
그것은 호스트가 해야 할 일을 게임이 하려는 것이므로 설계가 잘못된 것이다.

**`core/` 는 게임 착수와 동시에 동결한다.** 프리미티브가 더 필요하면 자기 폴더에 로컬 함수로
둔다 — **중복이 충돌보다 싸다.** 정말 공통이면 통합 단계에서 승격한다.

---

## 금지 식별자 — 대체어 고정

[[forbidden-expressions]] 가 코드 식별자에도 적용된다. 게임에서 자연스럽게 튀어나오는
낱말들이라 미리 대체어를 못 박는다.

| 쓰지 않는다 | 대신 |
|------------|------|
| `score` | `points` |
| `probability` · `accuracy` · `hitRate` · `hit_rate` | **개념 자체를 쓰지 않는다** |
| `winRate` · `expectedValue` · `confidence` | 쓰지 않는다 |
| 명중률 · 성공률 표시 | `landed` · `cleared` (횟수만) |
| 시도 횟수 | `attempts` |

검증: `grep -rniE "score|probability|win_rate|accuracy|confidence|hit_rate|expected_value" src/games/` 가 비어야 한다.

---

## ✅ 선행 1단계 완료 — 게임 세션 착수 가능 (2026-09-08)

`src/games/core/` 아홉 파일과 여섯 폴더의 스텁 `index.ts` 가 **모두 존재하고 빌드가 통과한다.**
게임 세션은 자기 폴더의 `index.ts` 를 덮어쓰기만 하면 된다.

| 파일 | 무엇을 준다 |
|---|---|
| `types.ts` | 이 문서의 모든 타입 (동결) |
| `catalog.ts` | `GAMES` 6개 · `findGame(slug)` · `GAME_SLUGS`. **브라우저 API 참조 0** |
| `pool.ts` | `createNumberPool(rng, onAward?, initial?)` → `HostNumberPool`(+`releaseAll()`) |
| `rng.ts` | `mulberry32` · `createRng(seed)` · `createSeed()` |
| `palette.ts` | `readPalette()` · `watchPalette(cb)` → 해제 함수 |
| `draw.ts` | `createDrawKit(() => palette)` → `DrawKit` |
| `input.ts` | `createInput(canvas, stage, emit)` → `InputHost`(+`pressAction`) |
| `loop.ts` | `createLoop({canvas, stage, getInstance, onQualityDrop?})` → `LoopHandle` |
| `loaders.ts` | `GAME_LOADERS` 여섯 줄 (정적 경로) |

**검증 결과.** `npm run typecheck` · `npm run build` 통과. 검증 게이트(브라우저 표준 난수 ·
`devicePixelRatio` · 금지 식별자 · 게임 폴더 hex 리터럴) 전부 0건.
`pool.ts` 는 이 문서가 못 박은 불변식 네 가지와 세 유형(은닉·예약·보드)의 동작을 **31개 항목으로
검산**해 전부 통과했다 — 여섯 게임이 의존하는 중복 방지의 근거다.

⚠ **아직 화면이 없다.** `/playground` 라우트·`GameStage`·`playground.css`·전역 연결(메뉴·타일·
사이트맵·광고)은 선행 2단계다. 게임 세션은 **코드를 쓸 수는 있지만 브라우저에서 돌려 볼 수는
없다.** 2단계가 끝나면 그때부터 눈으로 확인하며 다듬을 수 있다.

⚠ **`--svc-play` 토큰이 아직 `tokens.css` 에 없다**(2단계 항목). `palette.svc.play` 는 그때까지
폴백 청록색을 돌려준다 — 값이 비어 캔버스가 검게 되는 일은 없다.

---

## 게임 세션의 완료 기준

- 6개 번호를 **중복 없이** 끝까지 수집 가능. 사양서의 목표 시간 ±30% 안.
- 중저가 안드로이드에서 **55fps 이상**. 루프 안에서 `shadowBlur` 사용 **0회**.
- `Math.random` 0회, `devicePixelRatio` 0회, hex 리터럴 0회, 금지 식별자 0회.
- 키보드만으로 완주 가능. 획득 시 `emit({type:'status'})` 로 상태를 알린다.
- 375px 폭에서 캔버스가 넘치지 않는다.
- 자기 폴더 밖 파일 변경 **0건**.

**계약에 없는 것이 필요하면 임의로 정하지 말고 멈춰서 보고한다.** 여섯 세션이 각자 빈틈을
다르게 메우면 통합 때 전부 다시 짜야 한다.

## 진행 단계와 오버레이 — `phase` 이벤트 (2026-09-08 추가)

"시작" · "실패" · "완료" 는 **버튼이 필요한 상태**다. 그런데 캔버스 안에 그린 버튼은
보조기술에 완전히 투명하고, 페이지를 스크롤하거나 판을 다시 만드는 일은 애초에 캔버스가
할 수 없다. 그래서 **게임은 단계만 알리고 버튼은 호스트가 캔버스 위 DOM 으로 그린다.**

```ts
export type GamePhase = 'ready' | 'playing' | 'failed' | 'cleared'

// GameEvent 에 추가됨
| { type: 'phase'; phase: GamePhase; title?: string; text?: string }
```

| 단계 | 뜻 | 호스트가 그리는 버튼 |
|---|---|---|
| `ready` | 화면은 그려져 있지만 시작 전 | **게임시작** |
| `playing` | 진행 중 | 없음 |
| `failed` | 기회를 다 썼는데 6개를 못 모았다 | **다시하기 · 다른 게임하기** |
| `cleared` | 번호 6개를 다 모았다 | **다시하기 · 번호확인** |

### ⚠ 마무리 문구는 게임이 정하지 않는다 (2026-09-16 에 뒤집혔다)

**2026-09-10 에는 이 자리에서 "게임이 `title`·`text` 를 아래 문구로 고정해 보낸다" 고 정했다.
그 규칙은 폐기됐다.** 이제 **호스트가 `defaultCopy()` 로 기본 문구를 갖고**, 게임은
"게임마다 달라야 하는 것" 만 덮는다. 문구를 여섯 군데에 복사해 두면 하나를 고칠 때
나머지 다섯이 남는다 — 실제로 "번호분석" → "번호확인" 을 바꿀 때 그 일이 났다.

**정본은 아래 [팝업 문구는 호스트가 기본값을 갖는다] 절이다.** 여기서는 버튼 구성만 본다.

⚠ **실패에 "번호확인" 을 두지 않는다.** 6개가 안 모였으면 확인할 조합 자체가 없다.
⚠ **완료에 "다른 게임하기" 를 두지 않는다.** 방금 모은 번호를 보러 가는 것이 먼저다.
   목록으로 가는 길은 결과 카드 아래에 이미 있다.

> ⚠ **★ `ready` 를 보냈으면 시작할 때 반드시 `playing` 을 다시 보낸다.**
> 호스트는 `phase !== 'playing'` 인 **동안 내내** 캔버스를 오버레이로 덮는다. `ready` 만
> 보내고 게임을 시작해 버리면 **"시작" 을 눌러도 팝업이 사라지지 않고**, 그 뒤에서 판이
> 혼자 굴러간다(2026-09-10 G03 에서 실제로 났다).
>
> ⚠ 보내는 자리는 **판이 실제로 시작되는 지점**이다. 시작 함수의 첫 줄에서 보내면, 이미
> 끝난 판(6개를 다 모은 복원 판)에서도 `playing` 이 나가 **완료 오버레이를 지워 버린다.**
>
> ⚠ 매 라운드마다 부르는 자리라면 **직전 값과 같으면 보내지 않는다.** 거르지 않으면
> 호스트의 상태 갱신이 초당 여러 번 돈다.

- `title` 은 큰 글씨 한 줄, `text` 는 그 아래 보조 문구다.
- **이 이벤트를 쓰지 않는 게임은 아무것도 하지 않아도 된다.** 한 번도 보내지 않으면 호스트는
  계속 `'playing'` 으로 보고 오버레이를 그리지 않는다(기본값이 `'playing'` 인 이유).
- 오버레이의 "시작" 은 `InputHost.pressAction('primary')` 를 흘려보낸다 — 게임 입장에서는
  **스페이스바와 완전히 같은 입력**이라 따로 다룰 것이 없다.
- "다시하기" 는 호스트가 `key` 를 올려 인스턴스를 통째로 교체한다(계약: 재시작은 `destroy`
  후 `create`). 게임이 스스로 상태를 되돌리지 않는다.
- "번호보기" 는 결과 패널로 스크롤한다. 결과 패널의 "다시하기" 는 반대로 게임으로 데려온다.

⚠ **모바일에서 소개글을 길게 쓰지 않는다.** 상세 페이지는 제목·소개글이 캔버스 **위**에
얹히는 구조라, 네 줄짜리 소개가 게임을 화면 밖으로 밀어낸다. `intro` 는 한두 문장으로 목표만
말하고 나머지는 `howTo` 가 맡는다(G01 에서 실제로 겪어 줄인 항목).

⚠ **`stage.height` 도 같은 문제를 만든다.** 캔버스가 세로로 길면 그 아래 "모은 번호 n/6" 볼
여섯 칸이 화면 밖으로 밀려, 무엇을 모았는지 보려면 스크롤해야 한다. **420~450 안에서 끝낸다** —
G02 가 430 으로 줄였고 G03 이 520 → 430 으로 따라갔다(2026-09-10). 세로가 더 필요하면
카메라를 쓰거나 배치를 바꾼다. 늘리지 않는다.

### 남은 기회는 캔버스 **안**에도 그린다

`emit({ type:'attempt', used, total })` 은 계약에 있지만 **호스트 HUD 가 아직 쓰지 않는다**
(`GameCanvas` 가 조용히 버린다). 그래서 기회 제한이 있는 게임은 **캔버스 상단에 직접** 남은
기회를 그린다. 보내는 것은 그대로 보낸다 — 호스트가 나중에 쓰기 시작하면 저절로 이어진다.

⚠ 캔버스 안 표시는 보조기술에 투명하므로 **`status` 로도 알린다** — 기회가 줄어드는 순간
`emit({type:'status', text:'…남은 기회 3번'})` 처럼 숫자를 말로 함께 준다.

---

## 게임 화면 레이아웃과 팝업 문구 (2026-09-16 · 호스트가 여섯 게임에 일괄 적용)

**여섯 게임 모두 이미 적용돼 있다. 게임 세션이 할 일은 아래 ⚠ 두 가지 확인뿐이다.**

### 화면을 해상도에 맞춘다

모바일에서 "스크롤해야 플레이할 수 있다" 가 가장 큰 마찰이었다. 셋을 고쳤다.

| 무엇 | 어떻게 |
|---|---|
| 제목 | `.pg-title` 로 **1.3rem**(기본 `--fs-h1` 1.75rem보다 작다). 게임 페이지에서 가장 커야 할 것은 제목이 아니라 게임 화면이다 |
| 소개글 | `.pg-head` 로 위아래 여백 압축. `intro` 는 **한두 문장**으로 짧게 쓴다 |
| 무대 높이 | `clamp(260px, calc(100svh - var(--pg-chrome)), 660px)` |
| 첫 화면 | 마운트 시 `scrollIntoView({ block:'nearest' })` 로 게임을 화면에 올린다. 이미 스크롤된 상태면 건드리지 않는다 |

`--pg-chrome` 은 **화면에서 게임이 아닌 것들의 합**이다(헤더 + 제목·소개 + HUD + 하단 탭바).
모바일 292px, 768px 이상 236px. 단순히 `76svh` 로 두면 **하단 탭바(56px)에 캔버스 바닥이
가린다** — 실제로 그랬다.

⚠ **자기 게임의 `stage` 세로 비율을 다시 본다.** 이제 높이가 먼저 걸리고 `aspect-ratio` 가
폭을 줄이므로, **세로로 긴 무대일수록 모바일에서 좁아진다.** 390×760 기준 실측:

| 무대 | 화면에 그려지는 폭 |
|---|---|
| 360×430 (G03 · G04) | **폭 상한에 먼저 걸린다** (높이 제한상 392px 까지 가능) |
| 360×440 (G01) | **폭 상한에 먼저 걸린다** (2026-09-16 에 560 에서 줄였다) |
| 360×430 (G02) | **폭 상한에 먼저 걸린다** (G03 과 같다. 2026-09-08 에 600 → 430) |
| 360×640 (G05) | **263px** |

표의 값은 `360 × 468 / 무대높이` 다(468 = 760 − `--pg-chrome` 292). G03 은 이 식이
392px 를 내놓지만 그 전에 **`.pg-stage` 의 `max-width`·컨테이너 폭**에 걸리므로 화면 폭을
거의 다 쓴다.

⚠ **거꾸로 읽으면 이것은 지렛대다.** 세로를 줄이면 가로가 넓어진다 — 가로로 넓은 조작부가
필요한 게임은 `stage` 세로를 깎는 것이 가장 싼 해법이다.

조작부가 가로로 넓은 게임(컬링의 45칸 보드, 플린코의 9빈)은 이 폭에서 글자가 읽히는지
반드시 확인한다. 안 되면 `catalog.ts` 의 `stage` 높이를 줄이는 쪽이 옳다.

> **G04 가 실제로 그 길을 갔다 (2026-09-16).** 620 에서는 **스톤이 화면 밖이라 던질 수가
> 없었다.** 430 으로 줄여 잘림이 사라졌고, 칸을 30→23px 로 줄인 대신 물리를 다시 맞췄다.
> ⚠ **세로를 줄이면 좌우 도달 범위도 함께 줄어든다** — 발사점과 표적이 가까워져 같은 각도로도
> 덜 벌어지기 때문이다. G04 는 각도 한계를 ±20°→±26° 로 넓혀야 맨 아래 행 양끝 칸에 닿았다.
> **무대를 줄인 뒤에는 세로만이 아니라 가로 끝까지 닿는지도 다시 잰다.**

### 스크롤은 **가리는 것들을 빼고** 계산한다 (2026-09-16)

`scrollIntoView({ block:'start' })` 는 요소의 위끝을 뷰포트 위끝에 맞춘다. 그런데 이 사이트는
**sticky 헤더(60px)가 위를, 하단 탭바(56px)가 아래를 덮는다.** 그대로 쓰면 결과 카드가 제목부터
잘려 "번호확인을 눌렀는데 분석 버튼만 보인다" 가 된다(실측).

`GameStage.scrollTo()` 가 **실제로 떠 있는 두 막대의 높이를 DOM 에서 재서** 쓸 수 있는 세로
공간을 구하고, 그 안에 요소가 들어가면 **가운데에**, 들어가지 않으면 **위를 맞춰** 세운다.

```
available = innerHeight - 헤더높이 - 탭바높이
offset    = 요소높이 <= available ? (available - 요소높이) / 2 : 8
scrollTo(문서상_요소상단 - 헤더높이 - offset)
```

- 탭바는 768px 이상에서 `display:none` 이라 높이가 0 이 된다 — **미디어쿼리를 따로 두지 않아도**
  데스크톱에서 저절로 맞는다.
- `behavior` 를 넘기지 않아 CSS `scroll-behavior` 를 따른다. 움직임 최소화에서는 base.css 가
  이미 `auto` 로 눌러 두었다.
- **여섯 게임 모두 이 경로를 쓴다.** "번호확인"·"다시하기" 가 전부 이 함수를 지난다.

### 팝업 문구는 호스트가 기본값을 갖는다

```ts
// GameStage.defaultCopy()
ready   → { title: meta.title,           text: meta.tagline }
cleared → { title: '6개 공을 모두 모았습니다', text: '아래에서 모은 번호를 확인할 수 있어요.' }
failed  → { title: '6개 번호 모으기 실패',    text: '다시 도전해 보세요.' }
```

**게임이 `title`·`text` 를 보내면 그쪽이 이긴다.** 그러나 보내지 않는 것이 기본이다 —
게임마다 문구를 따로 쓰면 여섯 개가 제각각이 된다.

⚠ **게임이 채우는 것은 "게임마다 달라야 하는 것" 뿐이다.** 예를 들어 G01 은 실패 시
`text` 만 `"3개를 모았습니다. 다시 도전해 보세요."` 로 덮고, 제목은 호스트 기본값을 쓴다.
시작 화면의 보조 문구(`"실탄 12발로 오리 여섯 마리를 맞혀 보세요."`)도 같은 이유로 덮는다.

### 버튼 구성 (호스트 고정)

| 단계 | 버튼 |
|---|---|
| `ready` | **게임시작** |
| `cleared` | **다시하기** · **번호확인**(결과 카드로 스크롤) |
| `failed` | **다시하기** · **다른 게임하기**(`/playground`) |

"다시하기" 는 새 인스턴스의 `'ready'` 를 호스트가 대신 눌러 줘 **"게임시작" 을 두 번 누르지
않게** 한다. 게임 쪽에서 할 일은 없다.

---

## 효과음 — `sfx` 이벤트 (2026-09-10 추가)

**게임은 "무슨 일이 났는지" 만 말하고, 실제로 소리를 낼지는 호스트가 정한다.**
`haptic` 과 완전히 같은 구조다 — 게임은 음소거 상태를 알 필요가 없고 알아서도 안 된다.

```ts
export type SfxName = 'shoot' | 'hit' | 'miss' | 'blank' | 'clear' | 'fail'

// GameEvent 에 추가됨
| { type: 'sfx'; name: SfxName }
```

| 이름 | 언제 | 소리 |
|---|---|---|
| `shoot` | 발사·투척·드롭 등 **사용자의 능동적 행동** | 짧고 낮은 톡 |
| `hit` | 번호를 하나 얻었다 | 두 음이 올라가는 딩 |
| `miss` | 빗나갔다·놓쳤다 | 둔탁하게 떨어지는 음 |
| `blank` | 맞았지만 소득이 없다(꽝·중복 재투) | 무너지는 음 + 노이즈 |
| `clear` | 번호 6개를 다 모았다 | 도-미-솔 팡파르 |
| `fail` | 그 판이 실패로 끝났다 | 두 음이 내려감 |

**이름이 곧 여섯 게임의 공용 어휘다.** 게임마다 새 이름을 만들면 소리가 제각각이 되어 한
제품으로 들리지 않는다. 새 이름이 필요하면 이 표를 먼저 고친다(= 계약 변경).

### 붙이는 법 — 한 줄이다

```ts
ctx.emit({ type: 'sfx', name: 'hit' })
```

기존 `haptic` 을 부르는 자리 바로 옆에 한 줄 더 두면 끝난다. 재생기·음소거·저장은 전부
호스트가 한다. **`sfx` 를 한 번도 보내지 않는 게임은 그냥 조용할 뿐 아무 문제가 없다.**

### 규칙

- **기본은 음소거다.** 사용자가 HUD 의 "소리 켜기" 를 누르기 전에는 아무 소리도 나지 않고,
  `AudioContext` 자체가 만들어지지 않는다. 켜는 그 클릭이 곧 브라우저가 요구하는 사용자
  제스처라 자동재생 정책에 걸릴 여지가 없다.
- 설정은 `localStorage` 에 남는다(판 기록과 달리 취향은 탭을 닫아도 유지된다).
- **음원 파일을 쓰지 않는다.** `core/audio.ts` 가 오실레이터로 합성한다 — 파일 0개, 요청 0회.
  의존성 셋(`next`·`react`·`react-dom`)을 지키는 것과 같은 이유다.
- 발사음은 **명중 여부와 무관하게 먼저** 울린다. 결과를 기다리면 손끝과 귀가 어긋난다.
- 완주 시 `hit` 와 `clear` 를 겹쳐 보내지 않는다. 팡파르가 뭉개지고, 마지막 한 개는 어차피
  팡파르가 말해 준다.
- ⚠ **음소거 버튼을 생략하지 않는다.** iOS 무음 스위치는 웹 오디오에 일관되게 적용되지
  않아, 기기 스위치를 믿으면 끌 방법이 없는 사용자가 생긴다.

### 아직 붙지 않은 게임

2026-09-10 기준 **G01 만 `sfx` 를 보낸다.** 나머지 다섯은 위 표를 보고 각자 자기 게임의
행동에 맞춰 한 줄씩 넣으면 된다. 기반(`core/audio.ts` · 호스트 · 음소거 버튼)은 이미 있다.

---

## ⚠ 병렬 세션 운용 함정 (2026-09-08 · G01 세션이 실제로 밟았다)

여섯 세션이 **같은 저장소·같은 `frontend/` 에서 동시에** 돌기 때문에, 코드 소유 경계를
지켜도 **빌드 산출물과 프로세스**를 통해 서로를 깨뜨릴 수 있다. 셋 다 실제로 겪은 일이다.

### 1. 임시 라우트를 만들지 않는다

호스트가 없던 동안 G01 세션이 화면 확인용으로 `src/app/g01-probe/` 를 잠깐 만들었다.
그 사이 빌드한 세션들의 `.next-g05/types` · `.next-g06/types` 에 **그 라우트의 타입 파일이
구워졌고**, 프로브를 지우자 **전원의 `tsc` 와 `next build` 가 깨졌다** — 자기 코드에 없는
파일을 못 찾는다는 오류로.

원인은 `tsconfig.json` 의 `exclude` 가 `.next` · `.next-prod` · `.next-probe` 만 막고
**`.next-g*` 는 막지 않는 것**이다. 남의 빌드 산출물이 내 타입체크 대상에 들어온다.

- **응급 처치**: 오염된 `.next-gNN/types` 만 지운다(빌드 산출물은 보존되고 다음 빌드에 자동
  재생성된다). `rm -rf .next-gNN` 까지 갈 필요가 없다.
- **근본 수정**: `tsconfig.json` 의 `exclude` 에 `.next-*` 를 넣는다. **공유 파일이므로 게임
  세션이 고치지 않는다** — 호스트/통합 담당이 한다.
- 화면을 봐야 하면 임시 라우트 대신 **호스트의 `/playground/<slug>`** 를 쓴다.

### 2. 넓은 패턴의 `pkill` 을 쓰지 않는다

`pkill -f "next dev"` · `pkill -f "next-server"` 는 **남의 개발 서버를 죽인다.**
실제로 G01 세션이 3000번에 떠 있던 다른 세션의 서버를 죽였다.
포트를 지정한 패턴(`pkill -f "next dev -p 3201"`)이나 PID 만 쓴다.

### 3. 빌드 산출물을 세션마다 가른다

`rm -rf .next` 도 금지다 — 남이 그 디렉토리로 빌드 중일 수 있다.
각자 `NEXT_DIST_DIR=.next-gNN`(빌드) · `.next-gNNdev`(dev) 로 갈라 쓰고, 포트도 겹치지 않게
잡는다. 끝나면 자기 것만 지운다.

---

관련: [[0014-number-playground]] · [[playground]] · [[component-boundaries]] · [[forbidden-expressions]] · [[accessibility]] · [[design-tokens]]
