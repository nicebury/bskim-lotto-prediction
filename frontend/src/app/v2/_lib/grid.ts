/**
 * 45칸 격자의 셀 모델.
 *
 * 이 시안의 시그니처는 "45칸 중 여섯 칸"이라는 격자 하나다(→ 20-design/home-v2-concept.md).
 * 격자는 **10열 × 5행**이고, 행이 곧 볼 공식 5구간이다 — 구조 자체가 색-구간 매핑을
 * 설명하므로 범례를 따로 두지 않아도 된다.
 *
 * ⚠ 여기서 하는 일은 **집계가 아니라 표시 매핑**이다. 빈도 자체는 백엔드가 계산해
 *   `counts` 로 준 값이고, 이 파일은 그것을 0~1 로 정규화해 CSS 변수에 넣을 수 있게만
 *   바꾼다. 브라우저에서 통계를 다시 집계하지 않는다(→ 10-contracts/component-boundaries.md).
 */

import type { FrequencyResult, Round } from '@/lib/api-types'
import { ballRange } from '@/lib/lotto'

/** 격자 한 칸. */
export interface HbCell {
  n: number
  /** 볼 5구간(1~5). `--ball-*` 토큰 선택에 쓴다. */
  range: 1 | 2 | 3 | 4 | 5
  /** 최신 회차 당첨번호인가 */
  win: boolean
  /** 최신 회차 보너스 번호인가 */
  bonus: boolean
  /** 관찰 구간 안에서의 출현 횟수. 데이터가 없으면 null. */
  count: number | null
  /**
   * 히트맵 강도 0~1. **최댓값 대비 비율**이지 확률이 아니다.
   * 0 으로 두면 칸이 완전히 비어 보이므로, 한 번이라도 나온 칸에는 최소 강도를 준다.
   */
  heat: number
}

/** 격자 한 행 = 볼 한 구간. 왼쪽 라벨이 색 단독 전달을 막는다(WCAG 1.4.1). */
export interface HbRow {
  range: 1 | 2 | 3 | 4 | 5
  label: string
  cells: HbCell[]
}

/** 1~45 전체. 로또 규칙이라 상수다. */
const MAX_NUMBER = 45
const COLUMNS = 10

const RANGE_LABEL: Record<number, string> = {
  1: '1–10',
  2: '11–20',
  3: '21–30',
  4: '31–40',
  5: '41–45',
}

/**
 * 한 번이라도 나온 칸의 최소 밝기.
 *
 * 0 에서 시작하면 "1회 출현"과 "0회 출현"이 화면에서 구분되지 않는다. 둘은 다른 사실이고,
 * 특히 미출현 칸을 짚어 보는 것이 이 격자를 보는 이유 중 하나다.
 */
const MIN_HEAT = 0.18

/**
 * 최신 회차 + 빈도 응답 → 격자 5행.
 *
 * 두 인자 모두 null 일 수 있다(백엔드 미기동·회차 부족). 그때는 마킹도 히트도 없는
 * 중립 격자가 나오고, 화면은 그대로 성립한다 — 빌드가 백엔드에 의존하지 않는다는 전제를
 * 이 함수가 지킨다(→ lib/api.ts 설계 의도 1).
 */
export function buildRows(
  latest: Round | null,
  frequency: FrequencyResult | null,
): HbRow[] {
  const winners = new Set(latest?.numbers ?? [])
  const bonus = latest?.bonus ?? null
  const counts = frequency?.counts ?? null

  // 정규화 기준. 최댓값이 0 이거나 데이터가 없으면 히트맵을 통째로 끈다.
  let max = 0
  if (counts) {
    for (const value of Object.values(counts)) {
      if (typeof value === 'number' && value > max) max = value
    }
  }

  const rows: HbRow[] = []
  for (let start = 1; start <= MAX_NUMBER; start += COLUMNS) {
    const range = ballRange(start)
    const cells: HbCell[] = []

    for (let n = start; n < start + COLUMNS && n <= MAX_NUMBER; n += 1) {
      const raw = counts?.[String(n)]
      const count = typeof raw === 'number' ? raw : null

      let heat = 0
      if (count !== null && max > 0 && count > 0) {
        // 최소 밝기 위로 남은 구간에 비율을 매핑한다.
        heat = MIN_HEAT + (1 - MIN_HEAT) * (count / max)
      }

      cells.push({
        n,
        range,
        win: winners.has(n),
        bonus: bonus === n,
        count,
        // CSS 변수에 그대로 들어가므로 소수점을 잘라 HTML 크기를 줄인다.
        heat: Number(heat.toFixed(3)),
      })
    }

    rows.push({ range, label: RANGE_LABEL[range], cells })
  }

  return rows
}

/**
 * 격자 전체를 요약하는 스크린리더 문구.
 *
 * 45개 칸을 하나씩 읽히면 소음이다. 격자는 `role="img"` 로 묶어 이 문장 하나로 전달하고,
 * 당첨번호 자체는 격자 옆의 볼 목록이 텍스트로 제공한다 — 모션이나 시각 배치에
 * 정보를 의존시키지 않는다(→ 20-design/accessibility.md).
 */
export function gridAriaLabel(latest: Round | null, windowSize: number): string {
  const base = `1번부터 45번까지를 10칸씩 다섯 줄로 놓은 번호판입니다. 줄마다 볼 색 구간이 같습니다.`
  if (!latest) {
    return `${base} 최신 회차 정보를 불러오지 못해 표시된 번호가 없습니다.`
  }
  const numbers = latest.numbers.join(', ')
  return `${base} 제${latest.round_no}회 당첨번호 ${numbers}번과 보너스 ${latest.bonus}번이 표시돼 있고, 칸의 밝기는 최근 ${windowSize}회 출현 횟수를 나타냅니다.`
}
