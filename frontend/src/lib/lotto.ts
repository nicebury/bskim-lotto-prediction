/**
 * 로또 도메인 순수 함수.
 *
 * 여기 있는 것은 **게임 규칙**이지 비즈니스 계산이 아니다. 빈도·패턴·HOT/COLD 집계는
 * 절대 프론트에서 하지 않는다(→ docs/wiki/10-contracts/component-boundaries.md).
 * 볼 색 구간과 추첨 일정만 프론트가 안다 — 둘 다 상수다.
 */

/** 볼 5구간. 동행복권 공식 규칙이다. 시안의 색을 따르지 않는다. */
export type BallRange = 1 | 2 | 3 | 4 | 5

/** 구간 → 색 매핑은 순수 함수다. → docs/wiki/20-design/components.md */
export function ballRange(n: number): BallRange {
  if (n <= 10) return 1 // 1~10  노랑
  if (n <= 20) return 2 // 11~20 파랑
  if (n <= 30) return 3 // 21~30 빨강
  if (n <= 40) return 4 // 31~40 회색
  return 5 //             41~45 초록
}

/** 구간의 경계. aria-label 에 "13번, 11~20 구간" 처럼 **말로** 넣기 위해 필요하다. */
const RANGE_BOUNDS: Record<BallRange, readonly [number, number]> = {
  1: [1, 10],
  2: [11, 20],
  3: [21, 30],
  4: [31, 40],
  5: [41, 45],
}

/**
 * 스크린리더용 라벨.
 * 색은 정보의 유일한 전달자가 될 수 없다(WCAG 1.4.1). 볼에는 항상 숫자가 보이고,
 * 구간은 이 라벨로 전달한다. → docs/wiki/20-design/accessibility.md
 */
export function ballAriaLabel(n: number, bonus = false): string {
  const [lo, hi] = RANGE_BOUNDS[ballRange(n)]
  return `${n}번, ${lo}~${hi} 구간${bonus ? ', 보너스' : ''}`
}

/* ────────────────────────────────────────────────────────────
 * 추첨 일정 — 매주 토요일 20:35 KST (→ docs/wiki/40-domain/lotto-rules.md)
 *
 * ⚠ 사용자의 브라우저 타임존이 무엇이든 추첨은 한국 시간에 일어난다. 그래서 로컬
 *   Date 의 getDay()/getHours() 를 절대 쓰지 않는다. UTC 밀리초로만 계산하고,
 *   "KST 벽시계"가 필요한 곳에서는 +9시간 시프트한 값의 getUTC*() 를 읽는다.
 *   이 규칙을 어기면 서버(UTC 컨테이너)와 브라우저(KST)의 D-day 가 하루 어긋난다.
 * ──────────────────────────────────────────────────────────── */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

/** 추첨 시각: 토요일(요일 6) 20시 35분 KST */
const DRAW_WEEKDAY = 6
const DRAW_HOUR = 20
const DRAW_MINUTE = 35

/** 지금(또는 주어진 시각) 이후 가장 가까운 추첨 시각을 UTC 밀리초로 돌려준다. */
export function nextDrawTime(nowMs: number = Date.now()): number {
  // KST 벽시계를 UTC 로 착각하게 만들어 요일·시각을 뽑는다.
  const kst = new Date(nowMs + KST_OFFSET_MS)

  const kstMidnightMs = Date.UTC(
    kst.getUTCFullYear(),
    kst.getUTCMonth(),
    kst.getUTCDate(),
  )
  const daysUntilSaturday = (DRAW_WEEKDAY - kst.getUTCDay() + 7) % 7

  let drawKstMs =
    kstMidnightMs +
    daysUntilSaturday * DAY_MS +
    DRAW_HOUR * HOUR_MS +
    DRAW_MINUTE * 60 * 1000

  // 토요일 20:35 를 이미 지났으면 이번 주가 아니라 다음 주다.
  if (drawKstMs <= kst.getTime()) drawKstMs += 7 * DAY_MS

  return drawKstMs - KST_OFFSET_MS
}

/**
 * D-day. **KST 날짜끼리의 차이**다. 남은 시간(밀리초)을 24로 나누면 안 된다 —
 * 금요일 23:00 에 "D-0" 이 되어버린다. 자정 경계로 세어야 사람이 읽는 D-day 와 같다.
 */
export function dDay(nowMs: number = Date.now(), drawMs: number = nextDrawTime(nowMs)): number {
  const kstDay = (ms: number) => Math.floor((ms + KST_OFFSET_MS) / DAY_MS)
  return kstDay(drawMs) - kstDay(nowMs)
}

/** 다음 추첨 회차 번호. 최신 회차 + 1. 최신 회차를 모르면 null. */
export function nextRoundNo(latestRoundNo: number | null | undefined): number | null {
  return typeof latestRoundNo === 'number' ? latestRoundNo + 1 : null
}

/** 남은 시간을 일/시/분/초로 쪼갠다. 카운트다운 표시용. */
export function splitDuration(ms: number) {
  const clamped = Math.max(0, ms)
  return {
    days: Math.floor(clamped / DAY_MS),
    hours: Math.floor((clamped % DAY_MS) / HOUR_MS),
    minutes: Math.floor((clamped % HOUR_MS) / (60 * 1000)),
    seconds: Math.floor((clamped % (60 * 1000)) / 1000),
  }
}

/** "2026-07-11" 처럼 KST 기준 날짜 문자열. `<time dateTime>` 에 넣는다. */
export function toKstDateString(ms: number): string {
  return new Date(ms + KST_OFFSET_MS).toISOString().slice(0, 10)
}

/** "2026-07-11T20:35:00+09:00" — 기계가 읽는 정확한 추첨 시각. */
export function toKstDateTimeString(ms: number): string {
  const shifted = new Date(ms + KST_OFFSET_MS).toISOString()
  return `${shifted.slice(0, 19)}+09:00`
}
