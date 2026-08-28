import type { NumberStat } from '@/lib/api-types'
import { formatNumber } from '@/lib/format'
import { Card } from './Card'
import { LottoBall } from './LottoBall'

/**
 * 그 회차의 여섯 번호가 **그 회차까지** 어떤 이력을 가졌는지.
 *
 * ── 왜 만들었나 ──────────────────────────────────────────────────────
 * 회차 상세 1,238장을 실측했더니 서로 다른 낱말이 36개인데 겹치는 낱말이 186개였다.
 * 본문의 80% 이상이 회차마다 똑같은 문구라는 뜻이다. 당첨번호·날짜라는 사실 데이터가
 * 있으니 얇다고 단정할 수는 없지만, 색인 대상 URL 의 96%가 이 페이지들이라
 * (→ docs/wiki/30-seo/metadata-strategy.md) 회차마다 실제로 다른 문장이 필요했다.
 *
 * 여기서 나오는 문장은 **회차마다 전부 다르다** — 번호가 다르고 그 번호의 이력이 다르다.
 *
 * ── ⚠ 반드시 지킬 것: 그 회차 시점의 사실만 말한다 ──────────────────
 * `/stats/number/{n}` 은 `from_round`·`to_round` 를 주면 `count` · `rank` ·
 * `recent_appearances` 를 **그 구간 기준**으로 계산해 준다. 그러나 `rounds_since` ·
 * `last_seen_round` · `max_gap` 세 개는 계약상 **항상 최신 회차 기준**이다
 * (→ docs/wiki/10-contracts/api-contract-stats.md). 실측으로도 확인했다 —
 * `to_round=900` 으로 물어도 `last_seen_round` 는 1235 를 준다.
 *
 * 그래서 그 셋을 **여기서 쓰지 않는다.** 900회 페이지에 "3회 만에 나왔습니다" 라고 적으면
 * 그건 오늘의 사실이지 2020년 그 회차의 사실이 아니다. 대신 `recent_appearances` 에서
 * 직전 출현 회차를 찾아 뺄셈한다 — 구간 기준이라 어느 회차에서도 참이다.
 *
 * ⚠ 뺄셈은 집계가 아니다. 빈도·순위는 전부 백엔드가 준 값을 그대로 쓴다
 *   (→ docs/wiki/10-contracts/component-boundaries.md 비즈니스 계산 금지).
 */
export function RoundNumberHistory({
  roundNo,
  stats,
}: {
  roundNo: number
  /** 여섯 번호의 통계. 백엔드가 못 주면 그 자리에 null 이 온다. */
  stats: (NumberStat | null)[]
}) {
  const rows = stats.filter((s): s is NumberStat => s !== null)

  /*
    ⚠ **여섯 개를 다 받았을 때만 그린다.** 일부만 받고 그리면 두 가지가 잘못된다.
      ① 요약이 거짓이 된다 — 셋만 보고 "여섯 개 가운데 가장 자주 나온 번호는 X" 라고 적게
         된다. 실제로 그런 페이지가 구워진 것을 발견했다(1238회, 2026-08-28).
      ② 회차마다 보이는 번호 수가 달라 사용자가 이유를 알 수 없다.
    빌드 순간 백엔드가 재시작 중이면 이런 일이 생긴다. 그때는 절을 통째로 비우고,
    ISR 재검증 때 채워지게 둔다 — 틀린 문장을 캐시하는 것보다 없는 편이 낫다.
  */
  if (stats.length === 0 || rows.length !== stats.length) return null

  const summary = buildSummary(roundNo, rows)

  return (
    <section className="section" aria-labelledby="history-title">
      <div className="section-head">
        <h2 id="history-title">제{roundNo}회 번호들의 그때까지 기록</h2>
      </div>

      <Card>
        {/* 회차마다 완전히 다른 문장. 이 절의 값어치가 여기 있다. */}
        <p className="round-history-lede">{summary}</p>

        <ul className="round-history">
          {rows.map((stat) => (
            <li key={stat.number} className="round-history-row">
              <LottoBall number={stat.number} />
              <div className="round-history-body">
                {/*
                  ⚠ 짧게 끊는다. "45개 번호 가운데 37위" 로 길게 썼더니 375px 에서 "가 /
                    운데" 로 쪼개져 읽혔다(실측). 어느 회차까지인지는 절 제목과 요약이 이미
                    말하고 있으므로 행마다 되풀이하지 않는다.
                */}
                <p className="round-history-main">
                  이 회차까지 <strong>{formatNumber(stat.count)}번</strong>
                  <span className="round-history-sep" aria-hidden="true"> · </span>
                  45개 중 <strong>{stat.rank}위</strong>
                </p>
                <p className="round-history-sub">{gapSentence(roundNo, stat)}</p>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {/*
        ⚠ 면책을 반드시 붙인다. 출현 횟수와 순위를 나란히 두면 "많이 나온 번호가 또 나온다"
          로 읽히기 쉽다. 매 회차 추첨은 앞선 결과와 무관하다는 사실을 같은 화면에 둔다
          (→ docs/wiki/40-domain/forbidden-expressions.md).
      */}
      <p className="disclaimer" style={{ marginTop: 'var(--space-4)' }}>
        <span className="disclaimer-icon" aria-hidden="true">
          ⓘ
        </span>
        <span>
          위 기록은 이 회차까지 실제로 나온 횟수를 센 것입니다. 로또는 매 회차 앞선 결과와
          무관하게 새로 추첨하므로, 많이 나온 번호가 다시 나오기 쉽다는 뜻이 아닙니다.
        </span>
      </p>
    </section>
  )
}

/**
 * 직전에 얼마나 쉬었는지 한 문장.
 *
 * `recent_appearances` 는 구간 안에서 **최신순**이다. `to_round` 를 이 회차로 주고 불렀으므로
 * `[0]` 은 이 회차 자신이고 `[1]` 이 직전 출현이다. 다만 응답 순서를 믿고 인덱스로 집는 대신
 * **이 회차보다 작은 회차 중 가장 큰 것**을 찾는다 — 정렬이 바뀌어도 문장이 틀리지 않는다.
 */
function gapSentence(roundNo: number, stat: NumberStat): string {
  const previous = stat.recent_appearances
    .map((a) => a.round_no)
    .filter((n) => n < roundNo)
    .sort((a, b) => b - a)[0]

  // 구간 안에 앞선 출현이 없다. 목록이 20개로 잘렸을 수도 있어 "처음" 이라고 단정하지 않는다.
  if (previous === undefined) {
    return stat.count <= 1
      ? '이 회차에서 처음 나온 번호입니다.'
      : '직전에 나온 회차는 최근 기록 밖에 있습니다.'
  }

  const rested = roundNo - previous - 1
  /*
    ⚠ 회차 번호에는 천단위 구분을 넣지 않는다. 이 페이지의 다른 문장이 전부 "제1238회" 로
      적고 있어 "제1,233회" 가 섞이면 다른 것을 가리키는 것처럼 읽힌다(실제로 그렇게 나왔다).
      출현 **횟수**에는 넣는다 — 그쪽은 세는 수다.
  */
  if (rested === 0) return `직전 제${previous}회에 이어 두 회차 연속으로 나왔습니다.`
  return `제${previous}회에 나온 뒤 ${formatNumber(rested)}회를 쉬고 다시 나왔습니다.`
}

/**
 * 회차 전체를 한 문장으로. 검색 결과에 뜨는 문장이자 이 페이지의 고유 본문이다.
 *
 * ⚠ 가장 자주 나온 번호와 가장 뜸했던 번호를 **순위로** 고른다. 횟수로 고르면 동점이 잦아
 *   회차마다 같은 번호가 뽑히는 일이 생긴다. 순위는 백엔드가 동점 규칙까지 정해 두었다.
 */
function buildSummary(roundNo: number, rows: NumberStat[]): string {
  const byRank = [...rows].sort((a, b) => a.rank - b.rank)
  const most = byRank[0]
  const least = byRank[byRank.length - 1]

  const parts = [
    `제${roundNo}회 당첨번호 여섯 개 가운데 그때까지 가장 자주 나온 번호는 ` +
      `${most.number}번(${formatNumber(most.count)}회, ${most.rank}위)이고, ` +
      `가장 뜸했던 번호는 ${least.number}번(${formatNumber(least.count)}회, ${least.rank}위)입니다.`,
  ]

  // 가장 오래 쉬었다 나온 번호가 있으면 덧붙인다. 회차마다 달라지는 두 번째 문장이다.
  const rests = rows
    .map((stat) => {
      const previous = stat.recent_appearances
        .map((a) => a.round_no)
        .filter((n) => n < roundNo)
        .sort((a, b) => b - a)[0]
      return previous === undefined ? null : { number: stat.number, rested: roundNo - previous - 1 }
    })
    .filter((x): x is { number: number; rested: number } => x !== null)
    .sort((a, b) => b.rested - a.rested)

  if (rests.length > 0 && rests[0].rested > 0) {
    parts.push(
      `이 가운데 ${rests[0].number}번은 ${formatNumber(rests[0].rested)}회를 쉬고 나왔습니다.`,
    )
  }

  return parts.join(' ')
}
