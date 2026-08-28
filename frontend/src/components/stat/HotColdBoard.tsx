'use client'

import { useEffect, useState } from 'react'

import { LottoBall } from '@/components/LottoBall'
import { browserHotCold } from '@/lib/api'
import type { HotColdResult, OverdueNumber, RankedNumber } from '@/lib/api-types'
import { appearanceRate, ratePercent, TREND_DISPLAY } from '@/lib/stat-insight'
import { STAT_TOP_DEFAULT, STAT_TOP_OPTIONS } from '@/lib/site'

import { HelpTip } from './HelpTip'
import { ScopeCaption } from './ScopeCaption'
import { StatQueryBar, type StatScope } from './StatQueryBar'

import type { RoundIndexEntry } from '@/lib/api-types'
import { ScrollArea } from '@/components/ScrollArea'

interface Props {
  /** 서버가 미리 구운 구간별 결과(top=기본값 기준). 키는 window 문자열. */
  initial: Partial<Record<string, HotColdResult>>
  roundIndex: RoundIndexEntry[] | null
  latestRound: number | null
  rangeSupported: boolean
}

/** 마지막 출현을 "1230회 · 2회 전" 처럼. 회차 번호만으로는 얼마나 최근인지 모른다. */
function lastSeenText(lastSeen: number | null | undefined, latestRound: number | null): string {
  if (typeof lastSeen !== 'number') return '기록 없음'
  if (latestRound === null) return `${lastSeen}회`
  const gap = latestRound - lastSeen
  if (gap <= 0) return `${lastSeen}회 · 최신`
  return `${lastSeen}회 · ${gap}회 전`
}

/**
 * 순위 표 — 출현 횟수 · 출현 비율 · 최근 출현 · 추세.
 *
 * 홈의 주요 통계와 **같은 네 지표**를 쓴다(사용자 요청). 같은 사실을 두 화면이 다른 열로
 * 보여주면 사용자가 두 화면을 대조할 수 없다.
 */
function RankTable({
  rows,
  roundsAnalyzed,
  latestRound,
  tone,
}: {
  rows: RankedNumber[]
  roundsAnalyzed: number
  latestRound: number | null
  tone: 'hot' | 'cold'
}) {
  return (
    <ScrollArea className="table-scroll" label="번호 순위 표">
      <table className="stat-table stat-table-rank">
        <thead>
          <tr>
            <th scope="col">순위</th>
            <th scope="col">번호</th>
            <th scope="col">출현</th>
            <th scope="col">비율</th>
            <th scope="col">최근 출현</th>
            <th scope="col">추세</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item, index) => {
            const trend = TREND_DISPLAY[item.trend ?? 'flat']
            return (
              <tr key={item.number}>
                <td className="rank-num">{index + 1}</td>
                <td>
                  <LottoBall number={item.number} size="sm" />
                </td>
                <td className="stat-num">{item.count}회</td>
                <td className="stat-num">
                  {ratePercent(appearanceRate(item, roundsAnalyzed))}
                </td>
                <td className="stat-sub">{lastSeenText(item.last_seen_round, latestRound)}</td>
                <td>
                  {/* 추세는 색만으로 전달하지 않는다 — 기호와 말을 함께 준다. */}
                  <span className={`trend trend-${trend.tone}`} data-tone={tone}>
                    <span aria-hidden="true">{trend.symbol}</span>
                    {/*
                      좁은 화면에서는 이 라벨을 시각적으로만 감춘다(CSS 에서 sr-only 와 같은
                      방식). 텍스트를 따로 복제하면 스크린리더가 두 번 읽는다.
                    */}
                    <span className="trend-label">{trend.label}</span>
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/*
        추세 설명을 팝업이 아니라 **표 아래 상시 범례**로 둔다.
        열 머리글에 팝오버를 달았더니 `.table-scroll` 의 `overflow-x: auto` 에 잘려 내용이
        반만 보였다(사용자 지적). 스크롤 컨테이너 안에서는 absolute 팝업이 원리상 빠져
        나올 수 없다 — 위치를 계산하는 대신 팝업을 쓰지 않기로 했다.
        항상 보이므로 누르지 않아도 뜻이 전달된다는 이점도 있다.
      */}
      <p className="trend-legend">
        <strong>추세</strong>는 고른 구간을 반으로 잘라 앞뒤를 비교한 값입니다. 뒤쪽 절반에서
        더 많이 나왔으면 <span className="trend trend-up">↑ 후반에 더</span>, 덜 나왔으면{' '}
        <span className="trend trend-down">↓ 후반에 덜</span>, 같으면{' '}
        <span className="trend trend-flat">— 비슷</span> 입니다. 지나간 구간을 둘로 나눠 세어
        본 결과일 뿐, 앞으로의 출현과는 관계가 없습니다.
      </p>
    </ScrollArea>
  )
}

/** 미출현 표 — 비율·추세는 의미가 없어 열을 두지 않는다(계약도 그 두 필드를 주지 않는다). */
function OverdueTable({
  rows,
  latestRound,
}: {
  rows: OverdueNumber[]
  latestRound: number | null
}) {
  return (
    <ScrollArea className="table-scroll" label="오래 안 나온 번호 표">
      <table className="stat-table stat-table-rank stat-table-overdue">
        <thead>
          <tr>
            <th scope="col">순위</th>
            <th scope="col">번호</th>
            <th scope="col">안 나온 기간</th>
            <th scope="col">마지막 출현</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item, index) => (
            <tr key={item.number}>
              <td className="rank-num">{index + 1}</td>
              <td>
                <LottoBall number={item.number} size="sm" />
              </td>
              <td className="stat-num">{item.rounds_since}회째</td>
              <td className="stat-sub">{lastSeenText(item.last_seen_round, latestRound)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollArea>
  )
}

export function HotColdBoard({ initial, roundIndex, latestRound, rangeSupported }: Props) {
  const [scope, setScope] = useState<StatScope>({ mode: 'window', window: 20 })
  const [top, setTop] = useState<number>(STAT_TOP_DEFAULT)
  const [remote, setRemote] = useState<HotColdResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /*
    서버가 구워 둔 결과를 쓸 수 있는 조건: 프리셋 구간이고 표시 개수가 기본값일 때.
    이 경우 네트워크를 타지 않으므로 첫 화면이 즉시 뜨고, JS 가 꺼져 있어도 같은 내용이
    서버 HTML 에 들어 있다.
  */
  const cached =
    scope.mode === 'window' && top === STAT_TOP_DEFAULT
      ? (initial[String(scope.window)] ?? null)
      : null
  const data = cached ?? remote

  /*
    '몇 회 전' 의 기준 회차.

    ⚠ 최신 회차(`/lotto/latest`, 10분 캐시)와 통계 응답(1주 캐시)은 **재검증 주기가 달라**
    서로 다른 시점을 볼 수 있다. 실제로 "1213~1232회 구간" 을 보면서 "1232회 · 5회 전"
    이라고 표시되는 일이 났다(최신은 이미 1237인데 통계는 1232까지 집계된 상태).
    그래서 응답이 말하는 구간의 끝을 우선 기준으로 삼는다 — 화면 안에서 숫자가 서로
    맞는 편이, 바깥의 최신 회차와 맞는 것보다 덜 혼란스럽다.
  */
  const baseRound = data?.to_round ?? latestRound

  useEffect(() => {
    if (cached) {
      // 캐시로 돌아왔으면 이전 원격 결과를 버린다 — 안 버리면 조건과 화면이 어긋난다.
      setRemote(null)
      setError(null)
      return
    }

    let alive = true
    setBusy(true)
    setError(null)

    const query =
      scope.mode === 'window'
        ? { window: scope.window, top }
        : { fromRound: scope.fromRound, toRound: scope.toRound, top }

    browserHotCold(query)
      .then((result) => {
        if (alive) setRemote(result)
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : '통계를 불러오지 못했습니다.')
      })
      .finally(() => {
        if (alive) setBusy(false)
      })

    // 응답이 늦게 도착해 이전 조건의 결과를 덮어쓰는 것을 막는다.
    return () => {
      alive = false
    }
  }, [cached, scope, top])

  return (
    <div className="statboard-v3">
      <StatQueryBar
        value={scope}
        onChange={setScope}
        roundIndex={roundIndex}
        rangeSupported={rangeSupported}
        busy={busy}
      >
        <div className="statbar-row">
          <span className="statbar-label" id="top-count-label">
            표시 개수
          </span>
          <div className="statbar-presets" role="group" aria-labelledby="top-count-label">
            {STAT_TOP_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                className="scope-chip"
                data-active={top === option ? '' : undefined}
                aria-pressed={top === option}
                disabled={busy}
                onClick={() => setTop(option)}
              >
                {option}위
              </button>
            ))}
          </div>
        </div>
      </StatQueryBar>

      <ScopeCaption data={data} busy={busy} />

      {error && (
        <p className="stat-error" role="status">
          {error} 잠시 후 다시 시도해 주세요.
        </p>
      )}

      {data ? (
        <div className="stat-blocks">
          <section className="stat-block" aria-labelledby="hot-title">
            <h3 id="hot-title">
              자주 나온 번호
              <HelpTip title="자주 나온 번호">
                고른 구간 안에서 <strong>출현 횟수가 많은 순</strong>으로 줄을 세운 것입니다.
                예를 들어 &ldquo;6회&rdquo;는 그 구간의 여러 회차 중 여섯 번 뽑혔다는 뜻이고,
                비율은 그것을 회차 수로 나눈 값입니다. 다음 회차에 또 나온다는 뜻은 아닙니다.
              </HelpTip>
            </h3>
            <RankTable
              rows={data.hot.slice(0, top)}
              roundsAnalyzed={data.rounds_analyzed}
              latestRound={baseRound}
              tone="hot"
            />
          </section>

          <section className="stat-block" aria-labelledby="cold-title">
            {/* 화면에 영문 라벨을 쓰지 않는다(002 R9). 내부 필드명 cold 는 유지한다. */}
            <h3 id="cold-title">
              안 나오던 번호
              <HelpTip title="안 나오던 번호">
                같은 구간에서 <strong>출현 횟수가 적은 순</strong>입니다. 위 목록을 거꾸로
                뒤집은 것이라고 보면 됩니다. 0회는 그 구간에 한 번도 안 나왔다는 뜻입니다.
              </HelpTip>
            </h3>
            <RankTable
              rows={data.cold.slice(0, top)}
              roundsAnalyzed={data.rounds_analyzed}
              latestRound={baseRound}
              tone="cold"
            />
          </section>

          <section className="stat-block" aria-labelledby="overdue-title">
            <h3 id="overdue-title">
              오래 안 나온 번호
              <HelpTip title="오래 안 나온 번호">
                이 목록만은 <strong>고른 구간과 상관없이 역대 전체</strong>에서 셉니다.
                &ldquo;최근 20회에 안 나왔다&rdquo;고만 하면 22회째든 200회째든 전부 같은 값이
                되어 버리기 때문입니다. 22회째라면 약 5개월 동안 안 나왔다는 뜻입니다.
              </HelpTip>
            </h3>
            <OverdueTable rows={data.overdue.slice(0, top)} latestRound={baseRound} />
          </section>
        </div>
      ) : (
        !error && <p className="empty-state">{busy ? '통계를 불러오는 중입니다…' : '표시할 통계가 없습니다.'}</p>
      )}
    </div>
  )
}
