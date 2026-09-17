import type { StageSize } from '@/games/core/types'

/**
 * G05 플린코 — **판의 기하**.
 *
 * → 사양서: docs/wiki/20-design/game-g05-plinko.md
 *
 * ── 왜 이 파일을 따로 두는가 ───────────────────────────────────────
 * 못 86개와 빈 9개의 좌표는 물리(`physics.ts`)와 렌더(`render.ts`)가 **똑같이** 봐야 한다.
 * 한쪽만 고치면 "화면에는 못이 없는데 볼이 튕기는" 종류의 버그가 나고, 그런 버그는 원인을
 * 찾는 데 몇 시간이 든다. 그래서 좌표를 만드는 곳을 하나로 못 박는다.
 *
 * ⚠ 여기 수치는 대부분 사양서가 못 박은 값이다. 바꾸기 전에 사양서를 먼저 고친다.
 */

/** 논리 좌표계. 호스트가 `meta.stage` 로도 같은 값을 준다. */
export const STAGE: StageSize = { width: 360, height: 430 }

/* ── 못 (사양서 "물리와 수치") ──────────────────────────────────── */

/*
  ⚠ **11행 → 9행, 간격 38 → 29, 못 r 4.5 → 4** (2026-09-16).
    계약이 `stage.height` 를 420~450 으로 못 박아 판 전체를 640 에서 430 으로 줄였다.
    행을 그대로 두고 간격만 좁히면 **수직 통로가 볼보다 좁아져 끼인다** — 간격 22 에
    못 지름 9 면 통로가 13px 인데 볼 지름이 16px 이다. 그래서 행 수를 먼저 줄이고,
    볼·못도 함께 줄여 통로에 여유를 남겼다(29 − 8 = 21px 통로 대 볼 지름 14px).
*/
export const PEG_ROWS = 9
export const PEG_FIRST_Y = 100
export const PEG_ROW_GAP = 29
export const PEG_COL_GAP = 40
export const PEG_R = 4

/* ── 빈 (사양서 "★ 왜 45칸이 아니라 9빈인가") ──────────────────── */

export const BIN_COUNT = 9
/** 360 ÷ 9 = 40. **두 자리 숫자가 시원하게 들어가는 최소 폭**이 이 게임의 출발점이다. */
export const BIN_W = STAGE.width / BIN_COUNT
/** 칸막이 상단. 마지막 못 행(y=332)에서 20px 아래. */
export const BIN_TOP = 352
/** 칸막이 높이. */
export const BIN_H = 44
export const BIN_FLOOR = BIN_TOP + BIN_H
/** 칸막이 두께 5px 의 절반. 충돌은 "반지름 2.5 의 선분" 으로 푼다. */
export const DIVIDER_HALF = 2.5

/**
 * 빈 안에 그리는 **구간 색 볼**의 반지름.
 *
 * ⚠ 이제 이 볼에는 **번호가 없다**(계약: 색 힌트형). 그래서 크기 기준이 "두 자리 숫자가
 *   들어가는가" 에서 "40px 빈 안에서 색이 또렷한가" 로 바뀌었다. 지름 26px 이라 좌우 7px 씩
 *   남고, 44px 높이 컵 안에도 위아래가 잘리지 않는다.
 */
export const BIN_BALL_R = 13

/* ── 볼과 투하 ──────────────────────────────────────────────────── */

export const BALL_R = 7
/** 볼이 대기하는 높이. 첫 못 행(100)까지 38px 의 자유낙하 구간을 준다. */
export const DROP_Y = 62
/** 투하 레일. 벽에서 볼 반지름 + 여유만큼 띄운다. */
export const DROP_MIN_X = 24
export const DROP_MAX_X = STAGE.width - DROP_MIN_X
/** 방향키를 꾹 눌렀을 때 초당 이동 거리. 360px 판을 약 1.6초에 훑는다. */
export const DROP_SPEED = 220

/* ── 난이도 곡선 (사양서 "난이도 곡선") ────────────────────────── */

/**
 * 좌우로 흔들리는 못 **넷**. `{ 행, 열 }` 을 직접 못 박는다.
 *
 * ⚠ **2026-09-17 에 2개 → 4개로 늘리고 "3회차부터" 를 없앴다**(사용자 지시). 기회가 아홉
 *   번으로 제한되면서, 앞의 두 번이 "판이 고정된 연습 구간" 이 되면 조준 난이도가 한 판
 *   안에서 들쭉날쭉해지기 때문이다.
 *
 * ── ⚠ 이 넷을 바꿀 때 반드시 확인할 것 세 가지 ──────────────────
 * ① **홀수 행만 쓴다.** 짝수 행 못은 `x = 0` 과 `x = 360` 에 **벽 위에 얹혀 있어서**(아래
 *    `createPegs` 주석) 그 행의 양 끝 열을 고르면 흔들린 못이 **벽 밖으로 나가 사라진다.**
 *    홀수 행은 `x = 20 … 340` 이라 진폭 14 로 흔들어도 `6 … 354` 안에 머문다.
 * ② **열을 흩는다.** 넷을 같은 x 에 세우면 **세로 한 줄이 통째로 열렸다 닫히고**, 볼은 그
 *    줄을 피해 다니게 된다. 조준을 흔들려던 것이 오히려 새 통로를 만들어 준다.
 *    좌(100) · 우(260) · 좌(140) · 우(220) 로 번갈아 벌린다.
 * ③ **행 1·3·5·7 은 9행 판을 정확히 사등분한다.** 위아래 어느 쪽으로도 치우치지 않는다.
 */
export const WOBBLE_PEGS: readonly { readonly row: number; readonly col: number }[] = [
  { row: 1, col: 2 }, // x=100
  { row: 3, col: 6 }, // x=260
  { row: 5, col: 3 }, // x=140
  { row: 7, col: 5 }, // x=220
]
/** 진폭 ±14px. 열 간격(40px)의 3분의 1 남짓이라 조준의 의미는 남는다. */
export const WOBBLE_AMP = 14
/** 각속도(rad/s). 한 왕복에 약 3.9초 — 눈으로 따라갈 수 있는 속도다. */
export const WOBBLE_SPEED = 1.6

/**
 * 못 배치.
 *
 * ── ⚠ 벽에 못을 박는다 — 실측으로 두 번 갈아엎은 배치 ─────────────
 * 사양서는 "열 간격 40px, 홀수 행 20px 오프셋" 만 정한다. 어느 쪽에 오프셋을 주느냐가
 * 분포를 완전히 바꾼다. 헤드리스로 1,800회씩 떨어뜨려 실측하며 세 배치를 시험했다.
 *
 * | 배치 | 결과 |
 * |------|------|
 * | 빈 중앙 열을 벽 옆(x=20)에 둠 | **벽이 미끄럼틀이 된다.** 벽(볼 중심 최소 8)과 못(20) 사이 통로가 15.5px 인데 볼 지름이 16px 이다. 볼이 그 틈에 들어가면 못 왼쪽면에 눌린 채 아래 행의 같은 자리 못으로 이어 미끄러져 곧장 끝 빈으로 빠진다 — 끝 빈 385·382 대 중앙 112~173 |
 * | 벽 옆 못을 아예 뺌(x=60 부터) | **더 나쁘다.** 양 끝 40px 폭에 못이 하나도 없어 자유낙하가 된다 — 드롭 0·8 이 200/200 확정. "튕김이 결과를 정한다" 가 통째로 사라진다 |
 * | **벽에 못을 박음(x=0·360)** | 채택. 아래 참조 |
 *
 * 그래서 **짝수 행 못을 벽 위(x=0 과 x=360)에 얹는다.** 처음에는 "벽과 못이 서로 다른
 * 위치로 밀어 볼이 떨린다" 고 보고 배제했는데, 실제로는 **못이 벽보다 강한 제약**이라
 * (못은 볼 중심을 12.5px 까지, 벽은 8px 까지 밀어낸다) 벽 클램프가 아예 발동하지 않는다.
 * 좁은 틈 자체가 사라지므로 미끄럼틀도 생기지 않는다. 실제 플린코 판의 생김새이기도 하다.
 *
 * - 짝수 행 10개: x = 0, 40, … 360  (빈 **경계=칸막이** 위. 양 끝은 벽에 반쯤 박힌다)
 * - 홀수 행  9개: x = 20, 60, … 340  (빈 **중앙** 위)
 *
 * 마지막 행(8, 짝수)이 칸막이 바로 위에 오므로 볼이 거기서 좌우로 갈라져 인접한 두 빈 중
 * 하나로 들어간다. 벽 쪽에서는 홀수 행 못(x=20)이 볼을 **안쪽으로 되돌리는 램프** 역할을 한다.
 */
export interface PegLayout {
  /** 흔들림을 뺀 원래 x. */
  readonly baseX: Float32Array
  readonly y: Float32Array
  /** **매 스텝 갱신되는 실제 x.** 물리와 렌더가 이 하나만 본다. */
  readonly x: Float32Array
  /** 행 r 의 못은 `[rowStart[r], rowStart[r + 1])` 구간이다. 근처 행만 검사하려고 둔다. */
  readonly rowStart: Int32Array
  /** 흔들리는 못의 인덱스. 매 스텝 86개를 훑지 않으려고 미리 뽑아 둔다. */
  readonly wobble: readonly { index: number; phase: number }[]
  /** 흔들리는 못인가. 렌더가 강조 링을 두를 때 인덱스로 바로 묻는다. */
  readonly wobbling: Uint8Array
  readonly count: number
}

export function createPegs(): PegLayout {
  const baseXs: number[] = []
  const ys: number[] = []
  const rowStart = new Int32Array(PEG_ROWS + 1)
  const wobble: { index: number; phase: number }[] = []

  for (let row = 0; row < PEG_ROWS; row += 1) {
    rowStart[row] = baseXs.length
    const y = PEG_FIRST_Y + row * PEG_ROW_GAP
    const even = row % 2 === 0
    // 짝수 행은 칸막이 위(0 + 40k, 양 끝은 벽에 박힘), 홀수 행은 빈 중앙(20 + 40k)에 선다.
    const firstX = even ? 0 : PEG_COL_GAP / 2
    const cols = even ? BIN_COUNT + 1 : BIN_COUNT

    for (let col = 0; col < cols; col += 1) {
      const index = baseXs.length
      baseXs.push(firstX + col * PEG_COL_GAP)
      ys.push(y)
      const slot = WOBBLE_PEGS.findIndex((w) => w.row === row && w.col === col)
      if (slot >= 0) {
        /*
          ⚠ 위상을 **90도씩 어긋나게** 준다(`k · π/2`). 같은 위상이면 넷이 한 몸처럼 움직여,
            위 행에서 밀린 방향으로 아래 행에서도 똑같이 밀려 **산포가 오히려 좁아진다.**
          ⚠ `slot` 은 배열 순서다 — 발견 순서(행·열 순회)를 쓰면 `WOBBLE_PEGS` 를 재배열할
            때 위상이 조용히 바뀐다.
        */
        wobble.push({ index, phase: (slot * Math.PI) / 2 })
      }
    }
  }
  rowStart[PEG_ROWS] = baseXs.length

  /*
    배치가 틀리면 조용히 흔들림이 사라진다 — 못 하나가 안 움직이는 것은 눈으로 잡기 어렵다.
    개발 중에 바로 알아차리도록 여기서 끊는다.
  */
  if (wobble.length !== WOBBLE_PEGS.length) {
    throw new Error(
      `WOBBLE_PEGS 배치 오류: ${WOBBLE_PEGS.length}개를 지정했는데 ${wobble.length}개만 찾았습니다`,
    )
  }

  const wobbling = new Uint8Array(baseXs.length)
  for (const w of wobble) wobbling[w.index] = 1

  return {
    baseX: Float32Array.from(baseXs),
    y: Float32Array.from(ys),
    x: Float32Array.from(baseXs),
    rowStart,
    wobble,
    wobbling,
    count: baseXs.length,
  }
}

/**
 * 흔들리는 못의 위치를 갱신한다. **`fixedUpdate` 에서만 부른다.**
 *
 * ⚠ 렌더가 `draw` 의 `timeMs` 로 따로 계산하면 물리가 보는 못과 화면의 못이 어긋난다.
 *   "못을 비껴갔는데 튕겼다" 로 보이는 그 버그다. 그래서 시뮬레이션 시간만 쓴다.
 * ⚠ **`reducedMotion` 이어도 끄지 않는다.** 이것은 시각 효과가 아니라 **게임 규칙**이다 —
 *   끄면 움직임 최소화를 켠 사람만 고정된 판에서 조준하게 되어 판이 쉬워진다.
 *
 * @param simSeconds 게임 시작부터의 시뮬레이션 시간(초)
 */
export function updateWobble(pegs: PegLayout, simSeconds: number): void {
  for (const w of pegs.wobble) {
    pegs.x[w.index] = pegs.baseX[w.index] + Math.sin(simSeconds * WOBBLE_SPEED + w.phase) * WOBBLE_AMP
  }
}

/** 볼이 멈춘 x 로 빈 번호를 구한다. 경계 밖은 양 끝 빈으로 자른다. */
export function binIndexAt(x: number): number {
  const raw = Math.floor(x / BIN_W)
  return raw < 0 ? 0 : raw > BIN_COUNT - 1 ? BIN_COUNT - 1 : raw
}

/** 빈 i 의 중심 x. */
export function binCenterX(index: number): number {
  return index * BIN_W + BIN_W / 2
}
