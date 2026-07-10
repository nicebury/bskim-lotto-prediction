/**
 * 조합 성향(traits)을 사람이 읽는 문장·행으로 옮긴다.
 *
 * **여기서 계산하지 않는다.** 서버가 준 사실을 한국어로 서술할 뿐이다.
 * "최근 20회 HOT 번호가 2개 포함되어 있다" 는 검증 가능한 **사실**이고,
 * "당첨 가능성이 높다" 는 **주장**이다. 주장을 쓰지 않는다.
 * → docs/wiki/40-domain/forbidden-expressions.md
 *
 * 회차 상세 페이지가 "동일 템플릿만 반복되는 표"가 되지 않게 하는 SEO 본문이기도 하다.
 *
 * ⚠ 두 종류의 traits 가 있다. 회차 상세·꿈해몽은 **여섯 필드**(Traits), 번호 추천은
 *   거기에 hot_count·cold_count 를 더한 **여덟 필드**(CombinationTraits)다. HOT/COLD 는
 *   "어느 시점의 최근 몇 회차 기준인가" 라는 선택이 개입하므로 회차 페이지에 쓰지 않는다.
 */
import type { CombinationTraits, Traits } from './api-types'
import { formatNumber } from './format'
import { eunNeun } from './korean'

/** hot/cold 가 붙어 있는지 판별. 둘 다 null 이면(데이터 부족) 없는 것으로 본다. */
function hasHotCold(traits: Traits | CombinationTraits): traits is CombinationTraits {
  const t = traits as CombinationTraits
  return typeof t.hot_count === 'number' || typeof t.cold_count === 'number'
}

/** 카드에 뿌릴 라벨-값 쌍. 값이 없는 항목은 빼서 빈 줄을 만들지 않는다. */
export function traitRows(traits: Traits | CombinationTraits): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = []

  if (traits.odd_even) rows.push({ label: '홀짝 비율', value: traits.odd_even })
  if (traits.high_low) rows.push({ label: '고저 비율', value: traits.high_low })
  if (typeof traits.sum === 'number') {
    rows.push({ label: '번호 합계', value: formatNumber(traits.sum) })
  }
  if (traits.range_distribution) {
    const parts = Object.entries(traits.range_distribution).map(
      ([range, count]) => `${range}: ${count}개`,
    )
    if (parts.length > 0) rows.push({ label: '번호대 분포', value: parts.join(' · ') })
  }

  // 추천 결과에만 있다. 기준 회차 수(hot_window)는 호출부가 문구로 덧붙인다.
  if (hasHotCold(traits)) {
    if (typeof traits.hot_count === 'number') {
      rows.push({ label: '자주 나온 번호 포함', value: `${traits.hot_count}개` })
    }
    if (typeof traits.cold_count === 'number') {
      rows.push({ label: '드물게 나온 번호 포함', value: `${traits.cold_count}개` })
    }
  }

  if (typeof traits.has_consecutive === 'boolean') {
    rows.push({ label: '연속번호', value: traits.has_consecutive ? '포함' : '미포함' })
  }
  if (typeof traits.tail_variety === 'number') {
    rows.push({ label: '끝수 가짓수', value: `${traits.tail_variety}종` })
  }

  return rows
}

/** 캐러셀 카드처럼 좁은 자리에 넣는 한 줄 요약. */
export function traitSummaryLine(traits: Traits): string {
  const parts: string[] = []
  if (traits.odd_even) parts.push(`홀짝 ${traits.odd_even}`)
  if (traits.high_low) parts.push(`고저 ${traits.high_low}`)
  if (typeof traits.sum === 'number') parts.push(`합계 ${traits.sum}`)
  return parts.join(' · ')
}

/**
 * 조합 성향을 서술하는 문단.
 *
 * `subject` 로 주어를 바꿔 같은 문장이 회차 페이지 1,231개에 그대로 복제되지 않게 한다 —
 * 값이 회차마다 다르므로 문장도 달라진다.
 *
 * `hotWindow` 를 주면 HOT/COLD 문장에 기준 회차 수를 명시한다. 기준 없이 "자주 나온 번호"
 * 라고만 쓰면 독자는 그것이 어느 구간 기준인지 알 수 없다.
 */
export function traitSentence(
  traits: Traits | CombinationTraits,
  subject: string,
  hotWindow?: number | null,
): string {
  const clauses: string[] = []

  // 주어의 받침에 따라 은/는이 달라진다. "당첨번호은" 이 되지 않게 조사를 계산한다.
  const topic = eunNeun(subject)

  if (traits.odd_even && traits.high_low) {
    clauses.push(`${topic} 홀짝 ${traits.odd_even}, 고저 ${traits.high_low} 구성입니다`)
  } else if (traits.odd_even) {
    clauses.push(`${topic} 홀짝 ${traits.odd_even} 구성입니다`)
  } else {
    clauses.push(`${subject}의 구성은 다음과 같습니다`)
  }

  if (typeof traits.sum === 'number') {
    clauses.push(`여섯 번호의 합계는 ${formatNumber(traits.sum)}입니다`)
  }

  if (hasHotCold(traits)) {
    const hot = traits.hot_count ?? 0
    const cold = traits.cold_count ?? 0
    const basis = typeof hotWindow === 'number' ? `최근 ${hotWindow}회 기준 ` : '최근 회차에서 '
    clauses.push(
      `${basis}자주 나온 번호가 ${hot}개, 드물게 나온 번호가 ${cold}개 포함되어 있습니다`,
    )
  }

  if (typeof traits.has_consecutive === 'boolean') {
    clauses.push(
      traits.has_consecutive
        ? '연속된 번호가 포함되어 있습니다'
        : '연속된 번호는 포함되지 않았습니다',
    )
  }

  if (typeof traits.tail_variety === 'number') {
    clauses.push(`끝수는 ${traits.tail_variety}종류로 나타납니다`)
  }

  return `${clauses.join('. ')}.`
}

/**
 * 번호대 분포를 문장으로. 회차 상세의 차별화 문장에 쓴다.
 * 특정 구간에 번호가 몰렸는지를 **사실로만** 서술한다.
 */
export function rangeSentence(traits: Traits): string | null {
  const dist = traits.range_distribution
  if (!dist || Object.keys(dist).length === 0) return null

  const entries = Object.entries(dist)
  const maxCount = Math.max(...entries.map(([, count]) => count))
  const peaks = entries.filter(([, count]) => count === maxCount).map(([range]) => range)
  const zeros = entries.filter(([, count]) => count === 0).map(([range]) => range)

  const parts = [`번호대별로는 ${peaks.join(', ')} 구간에 ${maxCount}개가 분포했습니다`]
  if (zeros.length > 0) {
    parts.push(`${zeros.join(', ')} 구간에서는 번호가 나오지 않았습니다`)
  }
  return `${parts.join('. ')}.`
}

/** 비율(0.0~1.0)을 퍼센트 문자열로. 소수 첫째 자리까지. */
export function toPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`
}

/**
 * 분포 맵(`{"3:3": 0.33, "4:2": 0.24}`)을 상위 N개 행으로.
 * 백엔드가 비율 내림차순으로 정렬해 보내므로 여기서 다시 정렬하지 않는다.
 */
export function distributionRows(
  dist: Record<string, number> | undefined,
  limit = 4,
): { label: string; value: string }[] {
  if (!dist) return []
  return Object.entries(dist)
    .slice(0, limit)
    .map(([key, ratio]) => ({ label: key, value: toPercent(ratio) }))
}
