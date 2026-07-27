/**
 * 추천 전략의 **표시 문구**. 알고리즘 설명은 docs/wiki/40-domain/prediction-algorithm.md.
 *
 * ⚠ 문구에 "고확률·적중·당첨 보장" 을 쓰지 않는다. 각 전략이 **무엇을 기준으로 뽑는지**를
 *   서술할 뿐, 그 결과가 더 나은 결과를 낳는다고 말하지 않는다.
 *   pure_random 을 목록 맨 앞에 두는 이유도 같다 — 그것이 통제군이고, 다른 전략의 결과가
 *   랜덤과 구분되지 않는다는 사실을 감추지 않는 것이 이 서비스의 정직함이다.
 */
import type { RecommendStrategy } from './api-types'

export interface StrategyMeta {
  key: RecommendStrategy
  label: string
  /** 캐러셀 카드 아래 한 줄. */
  short: string
  /** 추천 페이지 본문. 서버 렌더링되어 검색엔진이 읽는다. */
  description: string
}

export const STRATEGIES: StrategyMeta[] = [
  {
    key: 'pure_random',
    label: '완전 랜덤',
    short: '1~45에서 균등하게 무작위 추출',
    description:
      '1번부터 45번까지 어떤 가중치도 두지 않고 균등하게 6개를 뽑습니다. 실제 추첨과 같은 방식이며, 다른 방식의 결과를 비교해 볼 기준이 됩니다.',
  },
  {
    key: 'ensemble',
    label: '통계 종합',
    short: '빈도·미출현·최근 흐름·패턴을 함께 참고',
    description:
      '역대 출현 빈도, 마지막 출현 이후 지난 회차 수, 최근 회차의 출현 흐름, 과거 조합의 패턴을 가중해 번호별 참고 점수를 만들고, 그 점수에 따라 조합을 추출합니다. 과거 분포를 요약한 값일 뿐 앞으로의 추첨 결과와는 관계가 없습니다.',
  },
  {
    key: 'balanced_range',
    label: '번호대 균형',
    short: '1-15 · 16-30 · 31-45에서 각 2개',
    description:
      '번호를 세 구간으로 나누고 각 구간에서 두 개씩 고릅니다. 구간 안에서는 역대 출현 빈도를 참고합니다. 한쪽 번호대에 몰리지 않은 조합을 원할 때 씁니다.',
  },
  {
    key: 'golden_combo',
    label: '홀짝·고저 균형',
    short: '합계 120~150, 홀짝 3:3, 고저 3:3',
    description:
      '합계가 120에서 150 사이이고 홀짝과 고저가 각각 3대 3이며, 끝수가 다섯 종류 이상이고 연속번호를 한 쌍 포함하는 조합을 찾습니다. 과거 당첨 조합에서 비교적 자주 관찰된 형태이지만, 그것이 다음 회차를 예고하지는 않습니다.',
  },
  {
    // key(cold_return)는 API 계약이라 유지. 화면 라벨만 "안 나오던 번호"로 쓴다(002 R9).
    key: 'cold_return',
    label: '안 나오던 번호 되짚기',
    short: '오래 안 나오다 최근 다시 나온 번호',
    description:
      '30회차 이상 나오지 않다가 최근 5회차 안에 다시 등장한 번호를 우선합니다. 오래 안 나온 번호가 나올 차례라는 뜻이 아닙니다 — 모든 번호의 추첨 가능성은 매 회차 동일합니다.',
  },
  {
    key: 'pair_affinity',
    label: '동반 출현',
    short: '역대 함께 나온 적이 많은 번호끼리',
    description:
      '역대 회차에서 두 번호가 함께 나온 횟수를 세어, 동반 출현이 잦았던 번호들로 조합을 만듭니다. 과거의 동시 등장 기록일 뿐 번호 사이에 인과관계는 없습니다.',
  },
]

/** 홈 캐러셀에 노출할 5장. 통제군(pure_random)을 반드시 포함한다. */
export const HOME_STRATEGIES: RecommendStrategy[] = [
  'pure_random',
  'ensemble',
  'balanced_range',
  'golden_combo',
  'cold_return',
]

export function strategyMeta(key: RecommendStrategy): StrategyMeta {
  return STRATEGIES.find((s) => s.key === key) ?? STRATEGIES[0]
}
