/**
 * 주요 통계 표시 유틸 (002 StatBoard).
 *
 * ⚠ 여기서 **통계를 만들지 않는다.** 서버가 준 값을 표시용으로 가공할 뿐이다.
 *   - `appearance_rate` 가 없으면 `count / rounds_analyzed` 로 계산한다(백엔드가 아직 안
 *     주는 동안의 폴백). 이건 정의상 같은 값이라 "재계산" 이 아니다.
 *   - 인사이트 문장은 백엔드 수치로 **프론트가 조립**한다(계약이 정한 방식 — 금지표현을
 *     프론트에서 관리하기 쉽다). 관찰된 사실만 서술하고 "다음에 나올" 같은 예측을 쓰지 않는다.
 */
import type { FrequencyResult, HotColdResult, RankedNumber, Trend } from './api-types'

/** 출현 비율(0~1). 백엔드가 안 주면 count/rounds 로 채운다. */
export function appearanceRate(item: RankedNumber, roundsAnalyzed: number): number {
  if (typeof item.appearance_rate === 'number') return item.appearance_rate
  if (roundsAnalyzed <= 0) return 0
  return item.count / roundsAnalyzed
}

/** 0.65 → "65%" */
export function ratePercent(rate: number): string {
  return `${Math.round(rate * 100)}%`
}

/** 추세 기호·라벨·색조. 색만으로 전달하지 않으려고 기호를 함께 준다(WCAG 1.4.1). */
export const TREND_DISPLAY: Record<Trend, { symbol: string; label: string; tone: string }> = {
  up: { symbol: '↑', label: '최근 자주', tone: 'up' },
  down: { symbol: '↓', label: '최근 뜸', tone: 'down' },
  flat: { symbol: '—', label: '비슷', tone: 'flat' },
}

/**
 * 인사이트 콜아웃 문장.
 *
 * 백엔드 수치(hot 1위, frequency 분포)로 조립한다. **과거 요약이지 예측이 아니다** —
 * "가장 자주 나왔어요"(과거) 는 쓰되 "나올 거예요"(미래) 는 쓰지 않는다.
 * 데이터가 없으면 null 을 반환하고 호출부가 콜아웃을 렌더링하지 않는다.
 */
export function buildInsight(
  hotCold: HotColdResult | null,
  frequency: FrequencyResult | null,
): string | null {
  const top = hotCold?.hot?.[0]
  if (!top || !hotCold) return null

  const window = hotCold.rounds_analyzed
  const sentences: string[] = [
    `${top.number}번이 최근 ${window}회 중 ${top.count}회로 가장 자주 나왔어요.`,
  ]

  // 번호대(십의 자리 구간)별 합을 세어 "어느 대가 강세였나" 를 덧붙인다.
  // frequency.counts 는 서버가 준 횟수다 — 여기서 합만 낸다(통계 생성 아님).
  const bandLabel = strongestBand(frequency)
  if (bandLabel) {
    sentences.push(`${bandLabel}의 출현이 전반적으로 강세입니다.`)
  }

  return sentences.join(' ')
}

/** 번호대 6구간 중 출현 합이 가장 큰 구간(들)의 라벨. */
function strongestBand(frequency: FrequencyResult | null): string | null {
  if (!frequency || Object.keys(frequency.counts).length === 0) return null

  // 1-10, 11-20, 21-30, 31-40, 41-45
  const bands = [
    { label: '1~10번대', lo: 1, hi: 10 },
    { label: '10번대 후반', lo: 11, hi: 20 },
    { label: '20번대', lo: 21, hi: 30 },
    { label: '30번대', lo: 31, hi: 40 },
    { label: '40번대', lo: 41, hi: 45 },
  ]

  let best = { label: '', sum: -1 }
  for (const band of bands) {
    let sum = 0
    for (let n = band.lo; n <= band.hi; n += 1) sum += frequency.counts[String(n)] ?? 0
    // 45는 5개뿐이라 합이 불리하다. 구간 크기로 나눠 밀도로 비교한다.
    const density = sum / (band.hi - band.lo + 1)
    if (density > best.sum) best = { label: band.label, sum: density }
  }

  return best.label || null
}
