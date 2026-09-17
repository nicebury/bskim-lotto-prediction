/**
 * 추천 전략의 **표시 문구**. 알고리즘 설명은 docs/wiki/40-domain/prediction-algorithm.md.
 *
 * ⚠ 문구에 "고확률·적중·당첨 보장" 을 쓰지 않는다. 각 전략이 **무엇을 기준으로 뽑는지**를
 * ⚠ 2026-09-02 어투 정비: 설명 여섯 개가 전부 "~는 아닙니다" 로 끝나 목록 전체가 경고문처럼
 *   읽혔다(사용자 지적). **무엇을 하는지로 끝맺고**, 오해가 실제로 잦은 '안 나오던 번호'
 *   하나에만 짧게 사실을 남겼다. 공통 고지는 페이지 하단 `DISCLAIMER.recommend` 가 맡는다.
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
      '1번부터 45번까지 모두 같은 무게로 놓고 6개를 뽑습니다. 실제 추첨과 같은 방식이라, 나머지 다섯 가지를 견주어 볼 기준이 됩니다.',
  },
  {
    key: 'ensemble',
    label: '통계 종합',
    short: '빈도·미출현·최근 흐름·패턴을 함께 참고',
    description:
      '역대 출현 빈도, 마지막으로 나온 뒤 지난 회차 수, 최근 회차의 흐름, 과거 조합의 패턴을 함께 놓고 번호마다 참고 순서를 매겨 조합을 뽑습니다. 지나간 기록을 한 장으로 요약한 값입니다.',
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
      '합계가 120에서 150 사이이고 홀짝과 고저가 각각 3대 3이며, 끝수가 다섯 종류 이상이고 연속번호를 한 쌍 포함하는 조합을 찾습니다. 과거 당첨 조합에서 비교적 자주 보이던 생김새입니다.',
  },
  {
    // key(cold_return)는 API 계약이라 유지. 화면 라벨만 "안 나오던 번호"로 쓴다(002 R9).
    key: 'cold_return',
    label: '안 나오던 번호 되짚기',
    short: '오래 안 나오다 최근 다시 나온 번호',
    description:
      '30회차 넘게 안 보이다가 최근 5회차 안에 다시 나온 번호를 먼저 놓습니다. 흔히 "이제 나올 차례" 라고들 하지만, 추첨기는 지난 회차를 기억하지 못합니다. 45개 번호의 사정은 매 회차 똑같습니다.',
  },
  {
    key: 'pair_affinity',
    label: '동반 출현',
    short: '역대 함께 나온 적이 많은 번호끼리',
    description:
      '역대 회차에서 두 번호가 함께 나온 횟수를 세어, 자주 짝지어 나왔던 번호들로 조합을 만듭니다. 지나간 회차의 동행 기록을 모은 것입니다.',
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
