import type { SimulateStages } from './api-types'
import { formatNumber } from './format'

/**
 * AI 번호추천 시뮬레이터의 **일곱 단계**.
 *
 * ── 왜 이렇게 쓰는가 ────────────────────────────────────────────────
 * 시안(`docs/raw/추천알고리즘설명화면.png`)이 "지난 20년간 로또 당첨번호를 공책에 꼬박꼬박
 * 적어온 로또판매점 사장님" 이라는 비유로 알고리즘을 풀었다. **그 말투를 지킨다.**
 * 통계 용어를 그대로 던지면 대부분의 사용자에게 아무 뜻도 전달되지 않는다.
 *
 * ⚠ 2026-09-02 에 **사장님을 일곱 단계 전부에 등장시켰다**(사용자 요청). 그전에는 비유가
 *   1단계에만 남아 있고 나머지는 설명체라, 읽다 보면 비유가 사라져 딱딱해졌다. 사장님의
 *   말을 큰따옴표로 직접 인용해 각 단계가 무슨 일인지 한 문장으로 잡히게 했다.
 *
 * ⚠ **재미있게 쓰되 없는 능력을 붙이지 않는다.**
 *
 * ⚠ 2026-09-02 어투 정비: 일곱 단계가 **전부 "~는 아닙니다" 로 끝나** 설명이 경고문 일곱
 *   장처럼 읽혔다(사용자 지적). 사실은 그대로 두되 **한 번만 분명히 말한다** — 2단계의
 *   "추첨기는 지난주에 뭐가 나왔는지 기억하지 못한다" 가 그 자리이고, 마지막 단계의
 *   "그래도 토요일은 아무도 몰라요" 가 닫는 말이다. 나머지 다섯 단계는 **무엇을 하는지**만
 *   말한다. 공통 고지는 결과 화면의 `disclaimer` 가 맡는다.
 *
 * ⚠ 그렇다고 **없는 능력을 말하지 않는다.** 각 단계는 "무엇을 세는가" 를 말할 뿐,
 *   그 결과가 다음 추첨을 맞힌다고 하지 않는다(→ [[forbidden-expressions]]).
 *
 * ⚠ `detail` 은 **응답의 실제 수치**로만 만든다. 백엔드가 그 단계를 계산하지 못했으면
 *   `null` 을 돌려주고 화면은 설명만 보여준다 — **지어낸 수치를 넣지 않는다**(계약).
 */
export interface SimulatorStep {
  key: keyof SimulateStages | 'final'
  /** 단계 번호 옆에 붙는 짧은 이름. */
  title: string
  /** 진행 중에 보여줄 한 줄. 현재형으로 쓴다. */
  running: string
  /**
   * 설명 카드의 큰 글씨 — 사장님이 하는 **한마디**(2026-09-17 추가).
   *
   * ⚠ 설명 절이 "절차를 정리한 문서 같다" 는 지적을 받았다. 긴 본문을 먼저 내밀면
   *   읽기 전에 지친다. 한마디로 **무슨 일인지 잡히게** 하고 본문은 그 아래 둔다.
   * ⚠ `description` 과 어긋나는 말을 넣지 않는다. 한마디는 본문의 요약이지 새 주장이 아니다.
   */
  quote: string
  /** 한마디 아래 붙는 **무엇을 세는가** 한 줄. 비유를 걷어 낸 사실 문장이다. */
  summary: string
  /** 자세히 보기(설명 팝업)에 담을 본문. 시안의 비유를 지킨다. */
  description: string
  /** 응답에서 이 단계의 실제 수치를 한 줄로 뽑는다. 없으면 `null`. */
  detail: (stages: SimulateStages) => string | null
}

export const SIMULATOR_STEPS: SimulatorStep[] = [
  {
    key: 'frequency',
    title: '빈도 분석',
    running: '역대 당첨번호를 펼쳐 놓고 세는 중입니다',
    quote: '1번은 몇 번 나왔더라?',
    summary: '번호마다 역대 몇 번 나왔는지 셉니다.',
    description:
      '사장님이 20년 치 공책을 카운터에 쫙 펼칩니다. "1번은 몇 번 나왔나" 하고 45번까지 하나하나 세죠. 보너스 번호까지 빠짐없이 셉니다. 여기서 나오는 건 지금까지 쌓인 기록 그 자체입니다.',
    detail: (s) =>
      s.frequency
        ? `역대 ${formatNumber(s.frequency.rounds_analyzed)}회를 셌습니다. ` +
          `가장 많이 나온 번호는 ${s.frequency.most
            .slice(0, 3)
            .map((m) => `${m.number}번(${formatNumber(m.count)}회)`)
            .join(' · ')} 입니다.`
        : null,
  },
  {
    key: 'cycle',
    title: '출현 주기 분석',
    running: '각 번호가 몇 회째 쉬고 있는지 훑는 중입니다',
    quote: '34번이 요즘 통 안 보이네.',
    summary: '번호마다 마지막으로 나온 뒤 몇 회를 쉬었는지 적습니다.',
    description:
      '"34번이 요즘 통 안 보이네." 사장님이 번호마다 마지막으로 나온 뒤 몇 회를 쉬었는지 적어 둡니다. 다만 사장님도 압니다. 추첨기는 지난주에 뭐가 나왔는지 기억하지 못한다는 걸요. 그래서 이건 참고하는 값 하나로만 씁니다.',
    detail: (s) =>
      s.cycle && s.cycle.longest_waiting.length > 0
        ? `가장 오래 쉰 번호는 ${s.cycle.longest_waiting
            .slice(0, 3)
            .map((c) => `${c.number}번(${formatNumber(c.rounds_since)}회째)`)
            .join(' · ')} 입니다.`
        : null,
  },
  {
    key: 'trend',
    title: '최근 흐름 살피기',
    running: '최근 회차의 흐름을 살피는 중입니다',
    quote: '요즘 공책을 더 자주 들춰 보죠.',
    summary: '최근 회차일수록 무게를 더 실어 자주 보인 번호를 추립니다.',
    description:
      '사장님도 10년 전 공책보다 지난달 공책을 더 자주 들춰 봅니다. 그래서 최근 회차일수록 무게를 더 실어, 요즘 얼굴을 자주 비추는 번호를 추립니다. 여기까지가 "흐름" 이라고 부를 수 있는 부분입니다.',
    detail: (s) =>
      s.trend && s.trend.rising.length > 0
        ? `최근 ${formatNumber(s.trend.window)}회에서 ` +
          `${s.trend.rising
            .slice(0, 3)
            .map((t) => `${t.number}번(${formatNumber(t.count)}회)`)
            .join(' · ')} 이 자주 보였습니다.`
        : null,
  },
  {
    key: 'pattern',
    title: '조합 패턴 거르기',
    running: '역대 당첨 조합의 생김새와 견주는 중입니다',
    quote: '1,2,3,4,5,6? 그런 건 안 나왔어.',
    summary: '홀짝·합계·연속번호가 지난 조합과 너무 다른 모양을 거릅니다.',
    description:
      '"1,2,3,4,5,6? 그런 건 20년 동안 한 번도 안 나왔어." 사장님 말이 맞습니다. 지난 당첨 조합들은 생김새가 비슷합니다. 홀짝이 한쪽으로 안 몰리고, 여섯 수의 합이 어느 구간에 들고, 연속된 번호가 하나쯤 끼고, 끝자리가 흩어져 있죠. 그 생김새에서 너무 벗어난 조합은 여기서 걸러 냅니다.',
    detail: (s) =>
      s.pattern
        ? `홀짝 3:3 이 ${pct(s.pattern.odd_even_3_3_rate)}, ` +
          `합계 ${formatNumber(s.pattern.sum_range.from)}~${formatNumber(s.pattern.sum_range.to)} 구간이 ${pct(s.pattern.sum_range.rate)}, ` +
          `연속번호 포함이 ${pct(s.pattern.consecutive_rate)} 였습니다.`
        : null,
  },
  {
    key: 'ensemble',
    title: '네 가지 관점 종합',
    running: '앞의 네 가지를 한데 모으는 중입니다',
    quote: '넷을 한 상에 올려 보자고.',
    summary: '네 가지 기록을 모아 1번부터 45번까지 참고 순서를 매깁니다.',
    description:
      '많이 나온 번호, 오래 쉰 번호, 요즘 자주 뵈는 번호, 조합 생김새. 넷을 따로 보면 답이 제각각입니다. 그래서 넷을 한 상에 올려놓고 1번부터 45번까지 순서를 매깁니다. 지나간 20년을 한 장으로 정리한 셈입니다.',
    detail: (s) =>
      s.ensemble && s.ensemble.top_numbers.length > 0
        ? `종합했을 때 앞선 번호는 ${s.ensemble.top_numbers.slice(0, 8).join(' · ')} 순이었습니다.`
        : null,
  },
  {
    key: 'montecarlo',
    title: '가상 추첨 반복',
    running: '가상 추첨을 수만 번 돌리는 중입니다',
    quote: '손으로 하면 평생 걸릴 일이죠.',
    summary: '순서가 앞선 번호가 조금 더 자주 뽑히는 가상 추첨을 수만 번 돌립니다.',
    description:
      '사장님이 손으로 하면 평생 걸릴 일을 컴퓨터가 대신합니다. 가상 추첨을 수만 번 돌리는데, 앞 순서가 높은 번호가 조금 더 자주 뽑히고, 4단계의 생김새 기준을 통과한 조합만 살아남습니다. 토요일 저녁의 진짜 추첨기와는 별개로, 여기서만 도는 추첨입니다.',
    detail: (s) =>
      s.montecarlo
        ? `${formatNumber(s.montecarlo.trials)}번을 돌려 ` +
          `${formatNumber(s.montecarlo.valid_combinations)}개 조합이 기준을 통과했습니다.`
        : null,
  },
  {
    key: 'final',
    title: '추천 번호 뽑기',
    running: '살아남은 조합에서 번호를 고르는 중입니다',
    quote: '그래도 토요일은 아무도 몰라요.',
    summary: '가상 추첨에서 기준을 통과해 자주 살아남은 조합을 골라 드립니다.',
    description:
      '수만 번을 돌리고 나면 유난히 자주 살아남은 조합들이 보입니다. 그걸 골라 보여 드립니다. 뜻은 딱 하나, "이 조합이 제일 자주 살아남았다" 입니다. 사장님도 번호를 건네주며 늘 한마디 덧붙이죠. "그래도 토요일은 아무도 몰라요."',
    // 마지막 단계의 결과는 번호 그 자체다. 따로 수치를 적지 않는다.
    detail: () => null,
  },
]

/** 비율 → `33%`. 소수 자리를 남기지 않는다 — 이 화면에서 소수점은 정밀해 보이기만 한다. */
function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`
}
