'use client'

import { useId, useState } from 'react'

import type {
  FrequencyResult,
  HotColdResult,
  NumberPair,
  PairsResult,
  RankedNumber,
} from '@/lib/api-types'
import { formatNumber } from '@/lib/format'
import {
  appearanceRate,
  buildInsight,
  ratePercent,
  TREND_DISPLAY,
} from '@/lib/stat-insight'
import { FrequencyChart } from './FrequencyChart'
import { LottoBall } from './LottoBall'
import { MoreLink } from './Card'
import { ScrollArea } from './ScrollArea'

/**
 * 주요 통계 패널 (002 StatBoard).
 *
 * 4개 분리 카드를 **좌측 탭 테이블 + 우측 막대차트·인사이트의 2분할 패널**로 바꾼 것.
 * 정보 밀도를 올리되 "과거 사실의 정리" 임이 드러나 예측으로 오인되지 않게 한다.
 * → docs/wiki/20-design/components.md StatBoard 절, docs/raw/주요통계_샘플.png
 *
 * ⚠ 통계를 여기서 만들지 않는다. 서버가 준 값을 표시한다(→ lib/stat-insight.ts).
 * ⚠ 화면 어디에도 "COLD" 를 쓰지 않는다 — "안 나오던 번호"(R9). 내부 필드 cold 는 유지.
 *
 * 백엔드가 아직 안 주는 신규 필드는 우아하게 폴백한다:
 *   - appearance_rate 없으면 count/rounds 로 계산.
 *   - last_seen_round·trend 없으면 그 열을 '—' 로.
 *   - pairs(동반 출현) 없으면 그 탭을 "준비 중" 으로.
 */

type TabKey = 'hot' | 'cold' | 'overdue' | 'pairs'

const TABS: { key: TabKey; label: (w: number | string) => string }[] = [
  { key: 'hot', label: (w) => `최근 ${w}회 많이 나온 번호` },
  { key: 'cold', label: () => '안 나오던 번호' },
  { key: 'overdue', label: () => '미출현 기간' },
  { key: 'pairs', label: () => '동반 출현' },
]

export function StatBoard({
  hotCold,
  frequency,
  pairs,
  window,
  moreHref = '/lotto/stat',
}: {
  hotCold: HotColdResult | null
  frequency: FrequencyResult | null
  pairs: PairsResult | null
  window: number | string
  moreHref?: string
}) {
  const [tab, setTab] = useState<TabKey>('hot')
  const baseId = useId()

  const roundsAnalyzed = hotCold?.rounds_analyzed ?? (typeof window === 'number' ? window : 0)
  const insight = buildInsight(hotCold, frequency)

  return (
    <div className="statboard">
      {/* ── 좌측: 탭 테이블 ─────────────────────────── */}
      <div className="statboard-left">
        <div className="tabs" role="tablist" aria-label="번호 통계 탭">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              id={`${baseId}-tab-${t.key}`}
              className="tab"
              aria-selected={t.key === tab}
              aria-controls={`${baseId}-panel`}
              onClick={() => setTab(t.key)}
            >
              {t.label(window)}
            </button>
          ))}
        </div>

        <div id={`${baseId}-panel`} role="tabpanel" className="statboard-panel">
          {tab === 'hot' && (
            <RankTable items={hotCold?.hot ?? []} roundsAnalyzed={roundsAnalyzed} />
          )}
          {tab === 'cold' && (
            <RankTable items={hotCold?.cold ?? []} roundsAnalyzed={roundsAnalyzed} tone="cold" />
          )}
          {tab === 'overdue' && <OverdueTable data={hotCold} />}
          {tab === 'pairs' && <PairsTable data={pairs} />}
        </div>

        <p className="statboard-more">
          <MoreLink href={moreHref} label="전체 번호 통계 보기" />
        </p>
      </div>

      {/* ── 우측: 막대차트 + 인사이트 ────────────────── */}
      <div className="statboard-right">
        <div className="statboard-chart-head">
          <h3>
            번호 출현 빈도 <span className="muted">(최근 {window}회)</span>
          </h3>
          <MoreLink href="/lotto/stat/frequency" label="전체 구간 보기" />
        </div>

        {frequency && Object.keys(frequency.counts).length > 0 ? (
          <FrequencyChart counts={frequency.counts} />
        ) : (
          <p className="empty-state">빈도 데이터를 불러오지 못했습니다.</p>
        )}

        {insight && (
          <div className="insight">
            <span className="insight-icon" aria-hidden="true">
              <LightbulbIcon />
            </span>
            <div>
              <span className="insight-label">인사이트</span>
              <p>{insight}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────
 * 표
 * ──────────────────────────────────────────────────────────── */

const MEDALS = ['🥇', '🥈', '🥉'] // 스크린리더에는 "1위" 로 별도 제공, 이건 시각용

function RankTable({
  items,
  roundsAnalyzed,
  tone = 'hot',
}: {
  items: RankedNumber[]
  roundsAnalyzed: number
  tone?: 'hot' | 'cold'
}) {
  if (items.length === 0) {
    return <p className="empty-state">통계를 불러오지 못했습니다.</p>
  }

  return (
    <ScrollArea className="table-scroll" label="자주 나온 번호 순위 표">
      <table className="stat-table">
        <thead>
          <tr>
            <th scope="col">순위</th>
            <th scope="col">번호</th>
            <th scope="col" className="align-right">
              출현 횟수
            </th>
            <th scope="col" className="align-right">
              출현 비율
            </th>
            <th scope="col" className="align-right">
              최근 출현
            </th>
            <th scope="col" className="align-center">
              추세
            </th>
          </tr>
        </thead>
        <tbody>
          {items.slice(0, 7).map((item, index) => (
            <tr key={item.number}>
              <td>
                <Rank index={index} />
              </td>
              <td>
                <LottoBall number={item.number} size="sm" />
              </td>
              <td className="align-right">{item.count}회</td>
              <td className="align-right">
                {ratePercent(appearanceRate(item, roundsAnalyzed))}
              </td>
              <td className="align-right">
                {typeof item.last_seen_round === 'number' ? `${item.last_seen_round}회` : '—'}
              </td>
              <td className="align-center">
                <TrendCell trend={item.trend} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* '출현 비율' 이 다음 회차 확률로 오인되지 않게 표 아래 한 줄. */}
      <p className="stat-table-note">
        출현 비율은 <strong>지난 {roundsAnalyzed}회 중 나온 비율</strong>이며, 다음 회차 확률이
        아닙니다.
        {tone === 'cold' && ' 막대·순위는 적게 나온 순입니다.'}
      </p>
    </ScrollArea>
  )
}

function OverdueTable({ data }: { data: HotColdResult | null }) {
  const items = data?.overdue ?? []
  if (items.length === 0) return <p className="empty-state">통계를 불러오지 못했습니다.</p>

  return (
    <ScrollArea className="table-scroll" label="오래 안 나온 번호 표">
      <table className="stat-table">
        <thead>
          <tr>
            <th scope="col">순위</th>
            <th scope="col">번호</th>
            <th scope="col" className="align-right">
              미출현 기간
            </th>
            <th scope="col" className="align-right">
              최근 출현
            </th>
          </tr>
        </thead>
        <tbody>
          {items.slice(0, 7).map((item, index) => (
            <tr key={item.number}>
              <td>
                <Rank index={index} />
              </td>
              <td>
                <LottoBall number={item.number} size="sm" />
              </td>
              <td className="align-right">{item.rounds_since}회째</td>
              <td className="align-right">
                {typeof item.last_seen_round === 'number' ? `${item.last_seen_round}회` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="stat-table-note">
        마지막으로 나온 뒤 몇 회차가 지났는지를 셉니다.
      </p>
    </ScrollArea>
  )
}

function PairsTable({ data }: { data: PairsResult | null }) {
  // 백엔드가 아직 이 엔드포인트를 안 줬으면 null → 준비 중.
  if (!data) {
    return (
      <p className="empty-state">
        동반 출현 통계는 준비 중입니다. 곧 함께 자주 나온 번호쌍을 보여 드릴게요.
      </p>
    )
  }
  if (data.pairs.length === 0) {
    return <p className="empty-state">표시할 번호쌍이 없습니다.</p>
  }

  return (
    <ScrollArea className="table-scroll" label="함께 나온 번호쌍 표">
      <table className="stat-table">
        <thead>
          <tr>
            <th scope="col">순위</th>
            <th scope="col">함께 나온 번호</th>
            <th scope="col" className="align-right">
              동반 횟수
            </th>
          </tr>
        </thead>
        <tbody>
          {data.pairs.slice(0, 7).map((pair, index) => (
            <tr key={pair.numbers.join('-')}>
              <td>
                <Rank index={index} />
              </td>
              <td>
                <PairBalls pair={pair} />
              </td>
              <td className="align-right">{pair.count}회</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="stat-table-note">
        지나간 회차에서 이 두 번호가 같이 나온 횟수입니다.
      </p>
    </ScrollArea>
  )
}

function PairBalls({ pair }: { pair: NumberPair }) {
  return (
    <span className="pair-balls">
      <LottoBall number={pair.numbers[0]} size="sm" />
      <span className="pair-plus" aria-hidden="true">
        +
      </span>
      <LottoBall number={pair.numbers[1]} size="sm" />
    </span>
  )
}

/** 상위 3위 메달, 그 아래 숫자. 메달은 시각용이고 순위는 숫자로도 읽힌다. */
function Rank({ index }: { index: number }) {
  const rank = index + 1
  if (index < 3) {
    return (
      <span className="rank-medal">
        <span aria-hidden="true">{MEDALS[index]}</span>
        <span className="sr-only">{rank}위</span>
      </span>
    )
  }
  return <span className="rank-num">{rank}</span>
}

/**
 * 추세 셀. 색과 기호를 동시에 쓴다(색만으로 전달 금지). 값이 없으면 '—'.
 *
 * ⚠ 뜻을 `aria-label` 로 주지 않는다. **role 없는 `<span>` 에는 `aria-label` 을 붙일 수
 *   없다** — ARIA 규격이 금지하고 브라우저·스크린리더가 무시한다. 즉 배지의 뜻이 아무에게도
 *   전달되지 않으면서 통과한 것처럼 보인다(Lighthouse `aria-prohibited-attr`, 2026-08-21).
 *   같은 파일의 RankCell 이 이미 쓰는 방식대로 기호는 `aria-hidden`, 뜻은 `.sr-only`
 *   텍스트로 준다. `role="img"` 를 붙여도 규격은 만족하지만, 표 셀 안에서 굳이 이미지로
 *   선언할 이유가 없고 sr-only 쪽이 이 파일의 기존 관례다.
 */
function TrendCell({ trend }: { trend?: 'up' | 'down' | 'flat' }) {
  if (!trend) {
    return (
      <span className="trend trend-flat">
        <span aria-hidden="true">—</span>
        <span className="sr-only">추세 정보 없음</span>
      </span>
    )
  }
  const d = TREND_DISPLAY[trend]
  return (
    <span className={`trend trend-${d.tone}`}>
      <span aria-hidden="true">{d.symbol}</span>
      <span className="sr-only">추세: {d.label}</span>
    </span>
  )
}

function LightbulbIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2a7 7 0 0 0-4 12.74V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.26A7 7 0 0 0 12 2Zm-3 18.5a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V20H9v.5Z" />
    </svg>
  )
}
