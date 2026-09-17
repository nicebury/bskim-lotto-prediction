/**
 * 번호놀이터 게임 모듈 계약 — 타입 정본.
 *
 * → docs/wiki/10-contracts/playground-game-contract.md
 *
 * ── ⚠ 이 파일은 동결이다 ───────────────────────────────────────────
 * 게임 여섯 개를 여섯 세션이 **동시에** 만든다. 이 파일이 그 여섯의 유일한 접점이라,
 * 시그니처를 하나 바꾸면 여섯이 동시에 깨진다. 프리미티브가 더 필요하면 자기 게임 폴더에
 * 로컬 함수로 둔다 — **중복이 충돌보다 싸다.** 정말 공통이면 통합 단계에서 승격한다.
 *
 * ⚠ 계약과 코드가 다르면 **코드가 틀린 것**이다([[component-boundaries]] 와 같은 지위).
 */

export type GameSlug = 'shooting' | 'crane' | 'flyball' | 'curling' | 'plinko' | 'ringdash'

export type GameCode = 'G01' | 'G02' | 'G03' | 'G04' | 'G05' | 'G06'

/** 논리 좌표계의 크기. 게임은 **언제나** 이 좌표로만 그린다(DPR 은 호스트가 처리한다). */
export interface StageSize {
  readonly width: number
  readonly height: number
}

/** 서비스 색 키. `--svc-*` 토큰과 1:1 이다. */
export type ServiceAccent = 'lotto' | 'stats' | 'reco' | 'dream' | 'news' | 'play'

/**
 * 게임 한 개의 메타.
 *
 * ⚠ 이 타입을 담는 모듈(`core/catalog.ts`)은 **서버 컴포넌트가 import 한다** — 목록 페이지
 *   SSR 텍스트·`generateMetadata`·`sitemap` 이 읽는다. 따라서 `catalog.ts` 에 `canvas`·
 *   `window` 참조가 한 줄이라도 있으면 빌드가 깨진다.
 */
export interface GameMeta {
  slug: GameSlug
  code: GameCode
  /** '오리 사격장' */
  title: string
  /** 한 문장 목표. 목록 카드 + meta description. */
  tagline: string
  /** 2~3문장. 상세 페이지 SSR 본문(JS 꺼도 보이는 글). */
  intro: string
  /** 조작 3~4줄. `<ol>` 로 SSR 렌더된다. */
  howTo: readonly string[]
  /** 키보드 조작 한 줄(접근성). 캔버스 바로 아래에 **항상 노출**한다. */
  keyGuide: string
  stage: StageSize
  /** 6개 수집 목표 시간. 카드에 "약 90초" 로 표시. */
  paceSeconds: number
  accent: ServiceAccent
}

/* ────────────────────────────────────────────────────────────
 * 번호 풀 — 중복 방지를 인터페이스로 강제한다
 *
 * 게임마다 중복 제거를 따로 구현하면 여섯 개 중 하나는 반드시 어긋난다. 그래서 **게임에서
 * 번호를 고를 권한을 완전히 빼앗는다.** 게임이 다룰 수 있는 값은 두 가지뿐이다 — 호스트가
 * 준 `Reservation` 토큰과, 호스트가 배치해 준 보드 칸 번호.
 * ──────────────────────────────────────────────────────────── */

export type SlotIndex = 0 | 1 | 2 | 3 | 4 | 5

/** 아직 확정되지 않았지만 다른 누구도 가져갈 수 없는 번호. 라벨(링·캡슐·칸)에 쓴다. */
export interface Reservation {
  readonly token: number
  readonly value: number
}

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
  /** 부족하면 가능한 만큼만 돌려준다. */
  reserveMany(count: number): Reservation[]
  /** 링이 지나갔다 / 캡슐이 사라졌다. */
  release(token: number): void
  /** `'stale'` = 이미 release 됐다. */
  commit(token: number): ClaimResult

  // ── 보드형: 물리가 칸을 정하는 게임 ─────────────────
  /** `'taken'` = 재투 대상. **자동 대체하지 않는다.** */
  claimExact(n: number): ClaimResult
  board(): readonly { readonly value: number; readonly awarded: boolean }[]

  // ── 은닉형: 맞히는 순간 처음 정해지는 게임 ──────────
  awardHidden(): ClaimResult
}

/* ────────────────────────────────────────────────────────────
 * 난수
 * ──────────────────────────────────────────────────────────── */

export interface Rng {
  /** 0 이상 1 미만. */
  next(): number
  /** 정수. **`max` 를 포함한다.** */
  int(min: number, maxInclusive: number): number
  /** 실수 `[min, max)`. */
  range(min: number, max: number): number
  pick<T>(arr: readonly T[]): T
  /** `-1` 또는 `1`. */
  sign(): -1 | 1
  /** 평균 0, 표준편차 1 근사 정규분포. */
  gauss(): number
  /**
   * 독립 스트림. **배경 연출용이다.**
   * ⚠ 배경 파티클이 물리 난수를 소비하면 같은 시드로도 결과가 달라져 재현성이 깨진다.
   */
  fork(): Rng
}

/* ────────────────────────────────────────────────────────────
 * 입력 — 두 채널로 온다
 *
 * 포인터와 키보드를 하나로 뭉개면 조준형(좌표 필요)과 타이밍형(누름만 필요)이 둘 다
 * 불편해진다.
 * ──────────────────────────────────────────────────────────── */

export type GameAction = 'primary' | 'left' | 'right' | 'up' | 'down'

export type PointerPhase = 'down' | 'move' | 'up' | 'cancel'

export type GameInput =
  | { kind: 'pointer'; phase: PointerPhase; x: number; y: number; id: number }
  | { kind: 'action'; phase: 'down' | 'up'; action: GameAction; source: 'pointer' | 'key' }

export interface InputState {
  /** 꾹 누름 폴링(집게 이동 등). */
  down(action: GameAction): boolean
  readonly pointer: { active: boolean; x: number; y: number }
}

/* ────────────────────────────────────────────────────────────
 * 팔레트 — 캔버스에서 디자인 토큰 쓰기
 *
 * 게임 코드에 hex 리터럴이 하나도 없게 하고, 다크모드가 캔버스 안까지 저절로 따라오게 한다.
 * ──────────────────────────────────────────────────────────── */

/** `ballRange()` 결과를 그대로 키로 쓴다. */
export type BallRangeKey = 1 | 2 | 3 | 4 | 5

export interface Palette {
  bg: string
  surface: string
  surface2: string
  border: string
  text: string
  textMuted: string
  primary: string
  onAccent: string
  success: string
  warning: string
  danger: string
  info: string
  svc: Record<ServiceAccent, string>
  /** 공식 5구간 색. 1~10 노랑 / 11~20 파랑 / 21~30 빨강 / 31~40 회색 / 41~45 초록. */
  ball: Record<BallRangeKey, string>
  /** 진한 볼(파랑·빨강·회색) 위 숫자. */
  ballFg: string
  /** 밝은 볼(노랑·초록) 위 숫자. **흰 글자는 AA 미달이다.** */
  ballFgDark: string
  fontSans: string
}

/* ────────────────────────────────────────────────────────────
 * 그리기 — "허접하지 않음" 의 실제 담보
 *
 * 여섯 게임이 각자 그림자·볼·글자를 그리면 **여섯 개의 다른 제품**이 된다.
 * ──────────────────────────────────────────────────────────── */

export interface BallOptions {
  alpha?: number
  /** 이미 획득한 번호. α0.35 + 체크 표시. */
  dim?: boolean
  /** 강조 링 색. */
  ring?: string
}

export interface TextOptions {
  size: number
  weight?: number | string
  align?: CanvasTextAlign
  color: string
  alpha?: number
}

/** 풀링된 파티클 밭. 상한을 넘으면 오래된 것부터 재사용한다. */
export interface ParticleField {
  burst(x: number, y: number, count: number, color: string, spread?: number): void
  update(dt: number): void
  draw(c: CanvasRenderingContext2D): void
  clear(): void
  readonly live: number
}

export interface DrawKit {
  roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void
  ball(c: CanvasRenderingContext2D, x: number, y: number, r: number, n: number, o?: BallOptions): void
  /** 번호가 아직 공개되지 않은 볼. 물음표를 그린다. */
  mysteryBall(c: CanvasRenderingContext2D, x: number, y: number, r: number, o?: BallOptions): void
  capsule(c: CanvasRenderingContext2D, x: number, y: number, r: number, hue: string, label?: string): void
  /** 아래 방향 타원. **`shadowBlur` 를 쓰지 않는다**(모바일 GPU 에서 극단적으로 느리다). */
  softShadow(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, alpha?: number): void
  /** 내부 캐시됨. 매 프레임 `createLinearGradient` 를 부르지 않는다. */
  bgGradient(c: CanvasRenderingContext2D, stage: StageSize, from: string, to: string): void
  vignette(c: CanvasRenderingContext2D, stage: StageSize, alpha?: number): void
  gauge(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, ratio: number, color: string): void
  text(c: CanvasRenderingContext2D, s: string, x: number, y: number, o: TextOptions): void
  particles(max: number): ParticleField

  clamp(v: number, min: number, max: number): number
  lerp(a: number, b: number, t: number): number
  /** `current` 를 `target` 쪽으로 `maxDelta` 만큼 당긴다. 넘어서지 않는다. */
  approach(current: number, target: number, maxDelta: number): number
  easeOutCubic(t: number): number
  /** 타원 안에 점이 들어 있는가. */
  ellipseHit(px: number, py: number, cx: number, cy: number, rx: number, ry: number): boolean
}

/* ────────────────────────────────────────────────────────────
 * 게임 모듈
 * ──────────────────────────────────────────────────────────── */

/**
 * 한 판의 진행 단계 (2026-09-08 추가).
 *
 * ── 왜 필요한가 ────────────────────────────────────────────────────
 * "시작" · "실패" · "완료" 는 **버튼이 필요한 상태**다. 그런데 캔버스 안에 그린 버튼은
 * 보조기술에 완전히 투명하고(→ `GameHud` 주석), 페이지를 스크롤하거나 판을 다시 만드는
 * 일은 애초에 캔버스가 할 수 없다. 그래서 게임은 **단계만 알리고**, 실제 버튼은 호스트가
 * 캔버스 위에 DOM 오버레이로 그린다.
 *
 * ⚠ 이 단계를 쓰지 않는 게임은 아무것도 하지 않아도 된다. `phase` 를 한 번도 보내지 않으면
 *   호스트는 계속 `'playing'` 으로 보고 오버레이를 그리지 않는다.
 */
export type GamePhase =
  /** 화면은 그려져 있지만 아직 시작 전. 호스트가 "시작" 버튼을 띄운다. */
  | 'ready'
  /** 진행 중. 오버레이 없음. */
  | 'playing'
  /** 더 진행할 수 없다(탄 소진 등). 호스트가 "다시하기" 를 띄운다. */
  | 'failed'
  /** 번호 6개를 다 모았다. 호스트가 "다시하기 · 번호보기" 를 띄운다. */
  | 'cleared'

/**
 * 효과음 이름 — **여섯 게임이 공유하는 어휘**.
 *
 * ⚠ 게임마다 이름을 새로 만들면 소리가 제각각이 되어 한 제품으로 들리지 않는다.
 *   새 이름이 필요하면 이 목록을 먼저 고친다(= 계약 변경).
 */
export type SfxName =
  /** 발사·투척·드롭 등 사용자의 능동적 행동. */
  | 'shoot'
  /** 번호를 하나 얻었다. */
  | 'hit'
  /** 빗나갔다·놓쳤다. */
  | 'miss'
  /** 맞았지만 소득이 없다(꽝·중복 재투 등). */
  | 'blank'
  /** 번호 6개를 다 모았다. */
  | 'clear'
  /** 그 판이 실패로 끝났다. */
  | 'fail'

export type GameEvent =
  /** `aria-live` 로 읽힌다. */
  | { type: 'status'; text: string }
  /**
   * 진행 단계가 바뀌었다. 호스트가 캔버스 위 오버레이를 그린다.
   * `title` 은 큰 글씨 한 줄, `text` 는 그 아래 보조 문구다.
   */
  | { type: 'phase'; phase: GamePhase; title?: string; text?: string }
  /** 캔버스 아래 보조 문구. */
  | { type: 'hint'; text: string }
  /** `navigator.vibrate`. iOS 는 조용히 무시하므로 폴백이 필요 없다. */
  | { type: 'haptic'; ms: 10 | 20 | 40 }
  /**
   * 효과음 (2026-09-10 추가).
   *
   * ⚠ `haptic` 과 **같은 자리**에 둔다. 둘 다 "게임은 무슨 일이 났는지만 말하고, 실제로
   *   울릴지는 호스트가 정한다" 는 구조이기 때문이다. 게임은 음소거 상태를 알 필요가 없고
   *   알아서도 안 된다.
   * ⚠ **기본이 음소거다.** 사용자가 버튼으로 켜기 전에는 아무 소리도 나지 않는다.
   */
  | { type: 'sfx'; name: SfxName }
  /** "3/12발" HUD. `total` 이 `null` 이면 무제한. */
  | { type: 'attempt'; used: number; total: number | null }
  | { type: 'retry'; reason: 'duplicate' | 'out' | 'short' }

export interface GameContext {
  readonly stage: StageSize
  /** ★ 번호 중복 방지의 유일한 통로. */
  readonly pool: NumberPool
  /** ★ 브라우저 표준 난수 대체. 게임은 이것만 쓴다. */
  readonly rng: Rng
  /** ★ hex 리터럴 대체. */
  readonly palette: Palette
  /** 눌림 상태 폴링. */
  readonly input: InputState
  /** 공용 그리기 프리미티브. */
  readonly draw: DrawKit
  /** 캔버스 밖 DOM HUD 에 말을 건다. */
  emit(event: GameEvent): void
  /**
   * 사용자가 움직임 최소화를 켰는가.
   *
   * ⚠ **타이머를 끄지 않는다.** 게임은 애니메이션이 곧 콘텐츠라 끄면 존재하지 않는다.
   *   넷만 반응한다 — ① 배경 패럴랙스 정지 ② 파티클 0 ③ 화면 흔들림 0
   *   ④ 번호 공개 연출을 페이드로 대체. **물리와 이동은 그대로 둔다.**
   */
  readonly reducedMotion: boolean
  /**
   * 품질 등급. 워치독이 `'low'` 로 **한 번만** 내리고 되돌리지 않는다 — 오르내리며
   * 깜빡이는 편이 더 나쁘다.
   */
  readonly quality: { readonly level: 'high' | 'low' }
}

export interface GameInstance {
  /** `dt` 는 **항상** 1/60 이다. 이 값을 신뢰해도 된다. */
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

export interface GameModule {
  readonly meta: GameMeta
  /** 재시작은 `destroy` 후 `create` 를 다시 부른다. 상태를 되돌리지 않는다. */
  create(ctx: GameContext): GameInstance
}
