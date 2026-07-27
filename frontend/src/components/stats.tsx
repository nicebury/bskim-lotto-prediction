import { LottoBall } from './LottoBall'

/**
 * 통계 표시 컴포넌트 모음.
 *
 * ⚠ 이 파일의 어떤 함수도 **집계하지 않는다.** 서버가 계산한 값을 그리기만 한다.
 *   빈도·HOT/COLD 를 브라우저에서 다시 계산하면 서버와 숫자가 달라지고 어느 쪽이 맞는지
 *   아무도 모르게 된다(→ docs/wiki/10-contracts/component-boundaries.md).
 *   여기서 하는 유일한 산술은 **막대의 픽셀 폭 비율**이다 — 그것은 통계가 아니라 렌더링이다.
 */

export interface RankItem {
  number: number
  count: number
}

/**
 * 순위 + 볼 + 회수 막대. "많이 나온 TOP5", "안 나온 TOP5" 가 공유한다.
 *
 * `max` 를 넘기면 그 값을 막대 길이의 기준으로 삼는다. **"안 나온 번호" 는 반드시 넘겨야
 * 한다.** 그러지 않으면 적게 나온 번호들끼리 정규화되어 막대가 꽉 차 보이고, 적게 나왔다는
 * 사실이 시각적으로 뒤집힌다. 두 카드가 같은 척도를 쓸 때에만 막대를 서로 비교할 수 있다.
 */
export function RankList({
  items,
  max,
  tone = 'hot',
}: {
  items: RankItem[]
  max?: number
  tone?: 'hot' | 'cold'
}) {
  // 막대 길이의 기준. 기준값이 없으면 목록 최댓값을 쓰되 0으로 나누지 않는다.
  const peak = Math.max(1, max ?? Math.max(...items.map((item) => item.count), 1))

  return (
    <ol className="rank-list">
      {items.map((item, index) => (
        <li key={item.number} className="rank-row">
          <span className="rank-no">{index + 1}</span>
          <LottoBall number={item.number} size="sm" />
          {/* 막대는 장식이다 — 회수는 옆에 숫자로도 보인다(색·길이 단독 정보 전달 금지). */}
          <span className="rank-bar" aria-hidden="true">
            <span
              className={`rank-bar-fill${tone === 'cold' ? ' is-cold' : ''}`}
              // 0회여도 막대가 완전히 사라지지 않게 최소 폭을 준다.
              style={{ width: `${Math.max(4, (item.count / peak) * 100)}%` }}
            />
          </span>
          <span className="rank-count">{item.count}회</span>
        </li>
      ))}
    </ol>
  )
}

/** 미출현 회차 수를 함께 보여주는 목록. */
export function OverdueList({ items }: { items: { number: number; rounds_since: number }[] }) {
  const peak = Math.max(1, ...items.map((item) => item.rounds_since))

  return (
    <ol className="rank-list">
      {items.map((item, index) => (
        <li key={item.number} className="rank-row">
          <span className="rank-no">{index + 1}</span>
          <LottoBall number={item.number} size="sm" />
          <span className="rank-bar" aria-hidden="true">
            <span
              className="rank-bar-fill"
              style={{ width: `${Math.max(4, (item.rounds_since / peak) * 100)}%` }}
            />
          </span>
          <span className="rank-count">{item.rounds_since}회째</span>
        </li>
      ))}
    </ol>
  )
}

/**
 * 번호별 출현 빈도 막대차트.
 *
 * 45개 막대는 모바일 폭에서 가독성이 없다. `scroll` 을 켜면 가로 스크롤 컨테이너 안에
 * 넣어 body 가 넘치지 않게 한다(→ responsive-rules.md 차트 축약·가로 스크롤 금지).
 * 홈의 요약 카드는 상위 5개만 RankList 로 보여주고 전체는 통계 상세로 보낸다.
 */
/**
 * 라벨-값 쌍 목록. 패턴 요약·조합 성향이 공유한다.
 *
 * `strongLabels` 를 켜면 라벨을 본문색 굵은 글씨로 낸다. 패턴 분석처럼 라벨 자체가
 * "무엇을 세었는가" 라는 정보인 곳에 쓴다. 조합 성향처럼 값이 주인공인 곳에서는 끈다.
 */
export function KeyValueList({
  rows,
  strongLabels = false,
}: {
  rows: { label: string; value: string }[]
  strongLabels?: boolean
}) {
  return (
    <dl className={`kv-list${strongLabels ? ' has-strong-labels' : ''}`}>
      {rows.map((row) => (
        <div className="kv-row" key={row.label}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  )
}
