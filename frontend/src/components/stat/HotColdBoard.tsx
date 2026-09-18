'use client'

import { useEffect, useState } from 'react'

import { LottoBall } from '@/components/LottoBall'
import { browserHotCold } from '@/lib/api'
import type { HotColdResult, OverdueNumber, RankedNumber, RoundIndexEntry } from '@/lib/api-types'
import { appearanceRate, ratePercent, TREND_DISPLAY } from '@/lib/stat-insight'
import { STAT_TOP_DEFAULT, STAT_TOP_OPTIONS } from '@/lib/site'

import { HelpTip } from '@/components/stat/HelpTip'
import { ScopeCaption } from '@/components/stat/ScopeCaption'
import { StatQueryBar, type StatScope } from '@/components/stat/StatQueryBar'

/**
 * 많이 나온 번호 · 안 나오던 번호 · 오래 안 나온 번호 (2026-09-18 개편).
 *
 * ── 왜 표를 걷어냈나 ───────────────────────────────────────────────
 * 사용자 요청: "통계 분석인데 일반인도 딱 보고 이해가 쉬웠으면". 종전 화면은 한 목록이
 * 여섯 열(순위·번호·출현·비율·최근 출현·추세)짜리 표였고, 좁은 화면에서는 가로로 밀어야 했다.
 * 숫자를 읽기 전에는 **무엇이 많고 적은지조차** 알 수 없었다.
 *
 * 지금은 한 줄이 **막대 하나**다. 길이가 곧 횟수라 훑기만 해도 차이가 보이고, 숫자는 그
 * 옆에 그대로 남는다. 세 목록이 **같은 자(가장 많이 나온 번호 기준)** 를 쓰므로
 * "안 나오던 번호" 의 막대가 짧은 것 자체가 정보다.
 *
 * ── ⚠ 계산하지 않는다 ──────────────────────────────────────────────
 * 값은 전부 응답에서 온다. 여기서 하는 산술은 **막대 길이(비율)** 와 "약 몇 개월" 환산뿐이다.
 * 비율은 백엔드가 주면 그 값을 쓰고, 안 주면 `count / rounds_analyzed`(공용 헬퍼)로 채운다.
 *
 * ── ⚠ 색만으로 전달하지 않는다 ─────────────────────────────────────
 * 추세는 기호(↑↓—)와 말("후반에 더")을 함께 낸다. 막대 길이에도 숫자가 따라붙는다.
 *
 * ⚠ 데이터 흐름(프리셋 캐시 · 원격 조회 · 기준 회차)은 종전 표 화면의 규칙을 그대로 옮겼다.
 *   보이는 모양만 바뀌었고 숫자를 만드는 방법은 같다.
 */

interface Props {
  /** 서버가 미리 구운 구간별 결과(top=기본값 기준). 키는 window 문자열. */
  initial: Partial<Record<string, HotColdResult>>
  roundIndex: RoundIndexEntry[] | null
  latestRound: number | null
  rangeSupported: boolean
}

/** "1230회 · 2회 전". 회차 번호만으로는 얼마나 최근인지 알 수 없다. */
function lastSeenText(lastSeen: number | null | undefined, latestRound: number | null): string {
  if (typeof lastSeen !== 'number') return '기록 없음'
  if (latestRound === null) return `${lastSeen}회`
  const gap = latestRound - lastSeen
  if (gap <= 0) return `${lastSeen}회 · 최신`
  return `${lastSeen}회 · ${gap}회 전`
}

/**
 * 회차 수 → "약 N개월". 추첨은 매주 한 번이라 4.35주를 한 달로 본다.
 * ⚠ 어림이라는 것을 '약' 으로 밝힌다. 3개월 미만은 주 단위가 더 와닿아 그대로 둔다.
 */
function monthsText(rounds: number): string | null {
  if (rounds < 13) return null
  return `약 ${Math.round(rounds / 4.35)}개월`
}

export function HotColdBoard({ initial, roundIndex, latestRound, rangeSupported }: Props) {
  const [scope, setScope] = useState<StatScope>({ mode: 'window', window: 20 })
  const [top, setTop] = useState<number>(STAT_TOP_DEFAULT)
  const [remote, setRemote] = useState<HotColdResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /*
    서버가 구워 둔 결과를 쓸 수 있는 조건: 프리셋 구간이고 표시 개수가 기본값일 때.
    네트워크를 타지 않아 첫 화면이 즉시 뜨고, JS 가 꺼져 있어도 같은 내용이 HTML 에 있다.
  */
  const cached =
    scope.mode === 'window' && top === STAT_TOP_DEFAULT
      ? (initial[String(scope.window)] ?? null)
      : null
  const data = cached ?? remote

  /*
    '몇 회 전' 의 기준 회차. 최신 회차(10분 캐시)와 통계(1주 캐시)는 재검증 주기가 달라 서로
    다른 시점을 볼 수 있다. 화면 안에서 숫자가 서로 맞는 편이 덜 혼란스러워 **응답 구간의 끝**을
    우선 기준으로 삼는다(2026-09-02 에 실측으로 정한 규칙).
  */
  const baseRound = data?.to_round ?? latestRound

  useEffect(() => {
    if (cached) {
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

  /** 세 목록이 함께 쓰는 자. 가장 많이 나온 횟수가 100%다. */
  const maxCount = data ? Math.max(1, ...data.hot.map((item) => item.count)) : 1
  const maxOverdue = data ? Math.max(1, ...data.overdue.map((item) => item.rounds_since)) : 1
  const topHot = data?.hot?.[0] ?? null
  const topOverdue = data?.overdue?.[0] ?? null

  return (
    <div className="sb-board">
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
        <>
          {/*
            ── 한 줄 요약 ───────────────────────────────
            표를 읽기 전에 **이 구간에서 무슨 일이 있었는지** 한 문장으로 말한다. 숫자는 전부
            응답 값이고, 문장은 그것을 잇기만 한다.
          */}
          {(topHot || topOverdue) && (
            <p className="sb-summary">
              고른 <strong>{data.rounds_analyzed}회</strong> 안에서{' '}
              {topHot && (
                <>
                  <strong>{topHot.number}번</strong>이 <strong>{topHot.count}번</strong>으로 가장
                  많이 나왔고
                </>
              )}
              {topHot && topOverdue && ', '}
              {topOverdue && (
                <>
                  <strong>{topOverdue.number}번</strong>은{' '}
                  <strong>{topOverdue.rounds_since}회째</strong> 나오지 않았습니다
                </>
              )}
              .
            </p>
          )}

          <div className="sb-lists">
            <RankList
              id="hot"
              title="많이 나온 번호"
              lede="고른 구간에서 가장 자주 나온 순서입니다."
              help={
                <>
                  고른 구간 안에서 <strong>출현 횟수가 많은 순</strong>입니다. &ldquo;6번&rdquo;은
                  그 구간에서 여섯 번 뽑혔다는 뜻이고, 옆의 비율은 그것을 회차 수로 나눈 값입니다.
                </>
              }
              rows={data.hot.slice(0, top)}
              roundsAnalyzed={data.rounds_analyzed}
              latestRound={baseRound}
              maxCount={maxCount}
              tone="hot"
            />

            <RankList
              id="cold"
              title="적게 나온 번호"
              lede="같은 구간에서 가장 뜸했던 순서입니다. 막대는 위 목록과 같은 자로 그렸습니다."
              help={
                <>
                  같은 구간에서 <strong>출현 횟수가 적은 순</strong>입니다. 위 목록을 거꾸로
                  뒤집은 것이라고 보면 됩니다. 0번은 그 구간에 한 번도 안 나왔다는 뜻입니다.
                </>
              }
              rows={data.cold.slice(0, top)}
              roundsAnalyzed={data.rounds_analyzed}
              latestRound={baseRound}
              maxCount={maxCount}
              tone="cold"
            />
          </div>

          <OverdueList
            rows={data.overdue.slice(0, top)}
            latestRound={baseRound}
            max={maxOverdue}
          />
        </>
      ) : (
        !error && (
          <p className="empty-state">
            {busy ? '통계를 불러오는 중입니다…' : '표시할 통계가 없습니다.'}
          </p>
        )
      )}
    </div>
  )
}

/**
 * 순위 목록 — 한 줄이 막대 하나.
 *
 * ⚠ 막대 길이는 **같은 자**(`maxCount`)로 그린다. 목록마다 자기 최댓값으로 그리면 0번과
 *   6번이 같은 길이가 되어 두 목록을 나란히 놓은 뜻이 사라진다.
 * ⚠ 0회는 막대가 없다. 대신 숫자로 "0번" 이 남는다 — 길이 0 을 최소 폭으로 늘리면
 *   "조금 나왔다" 로 읽힌다.
 */
function RankList({
  id,
  title,
  lede,
  help,
  rows,
  roundsAnalyzed,
  latestRound,
  maxCount,
  tone,
}: {
  id: string
  title: string
  lede: string
  help: React.ReactNode
  rows: RankedNumber[]
  roundsAnalyzed: number
  latestRound: number | null
  maxCount: number
  tone: 'hot' | 'cold'
}) {
  return (
    <section className="sb-card" aria-labelledby={`${id}-title`} data-tone={tone}>
      <div className="sb-card-head">
        <h3 id={`${id}-title`}>
          {title}
          <HelpTip title={title}>{help}</HelpTip>
        </h3>
        <p>{lede}</p>
      </div>

      {/*
        ⚠ **머리글을 둔다**(2026-09-18 사용자 요청). 막대 목록으로 바꾸면서 열 이름이 사라졌더니
          "4번" 이 출현 횟수인지 번호인지, 오른쪽 배지가 무엇인지 알 수 없었다. 표가 아니어도
          열 이름은 있어야 한다.
        ⚠ 목록과 **같은 격자**를 써서 세로선이 맞는다(`.sb-rank-head` 는 `.sb-rank > li` 와 같은
          `grid-template-columns`).
      */}
      <p className="sb-rank-head" aria-hidden="true">
        <span>순위</span>
        <span>번호</span>
        <span>출현</span>
        <span>비교</span>
        <span>최근 출현</span>
        <span>추세</span>
      </p>

      <ol className="sb-rank">
        {rows.map((item, index) => {
          const trend = TREND_DISPLAY[item.trend ?? 'flat']
          const rate = appearanceRate(item, roundsAnalyzed)
          return (
            <li key={item.number}>
              <span className="sb-rank-no" aria-hidden="true">
                {index + 1}
              </span>
              <LottoBall number={item.number} size="sm" />

              {/*
                ⚠ **횟수가 막대보다 먼저다**(2026-09-18 사용자 요청). 사람이 먼저 찾는 것은
                  숫자이고, 막대는 그 숫자를 견주는 그림이다. 순서가 뒤집혀 있으면 눈이
                  막대를 지나쳐 숫자로 갔다가 다시 돌아온다.
              */}
              <span className="sb-rank-count">
                <b>{item.count}번</b>
                <small>{ratePercent(rate)}</small>
              </span>

              <span className="sb-rank-bar">
                <span style={{ width: `${(item.count / maxCount) * 100}%` }} />
              </span>

              <span className="sb-rank-last">{lastSeenText(item.last_seen_round, latestRound)}</span>

              {/* 추세는 색만으로 전달하지 않는다 — 기호와 말을 함께 준다. */}
              <span className={`trend trend-${trend.tone}`} data-tone={tone}>
                <span aria-hidden="true">{trend.symbol}</span>
                <span className="trend-label">{trend.label}</span>
              </span>
            </li>
          )
        })}
      </ol>

      <p className="sb-legend">
        막대가 길수록 자주 나왔다는 뜻입니다. <strong>추세</strong>는 고른 구간을 반으로 잘라
        뒤쪽 절반이 앞쪽보다 많으면 <span className="trend trend-up">↑ 후반에 더</span>, 적으면{' '}
        <span className="trend trend-down">↓ 후반에 덜</span>, 같으면{' '}
        <span className="trend trend-flat">— 비슷</span> 입니다.
      </p>
    </section>
  )
}

/**
 * 오래 안 나온 번호.
 *
 * ⚠ 이 목록만은 **고른 구간과 상관없이 역대 전체** 기준이다(계약). 그 사실을 제목 아래
 *   한 줄로 늘 밝힌다 — 도움말 안에만 두면 아무도 읽지 않는다.
 * ⚠ 회차를 "약 N개월" 로 함께 적는다. "28회째" 는 세어 본 사람만 감이 오지만, "약 6개월"
 *   은 누구나 안다.
 */
function OverdueList({
  rows,
  latestRound,
  max,
}: {
  rows: OverdueNumber[]
  latestRound: number | null
  max: number
}) {
  return (
    <section className="sb-card is-wide" aria-labelledby="overdue-title" data-tone="overdue">
      <div className="sb-card-head">
        <h3 id="overdue-title">
          오래 안 나온 번호
          <HelpTip title="오래 안 나온 번호">
            &ldquo;최근 20회에 안 나왔다&rdquo;고만 하면 22회째든 200회째든 전부 같은 값이 되어
            버립니다. 그래서 이 목록만은 <strong>마지막으로 나온 회차부터 지금까지</strong>를
            통째로 셉니다.
          </HelpTip>
        </h3>
        <p>
          위 구간 설정과 <strong>상관없이 역대 전체</strong>에서 셉니다. 마지막으로 나온 뒤 몇
          회가 지났는지입니다.
        </p>
      </div>

      <p className="sb-rank-head sb-rank-head-overdue" aria-hidden="true">
        <span>순위</span>
        <span>번호</span>
        <span>쉰 기간</span>
        <span>비교</span>
        <span>마지막 출현</span>
      </p>

      <ol className="sb-rank sb-rank-overdue">
        {rows.map((item, index) => {
          const months = monthsText(item.rounds_since)
          return (
            <li key={item.number}>
              <span className="sb-rank-no" aria-hidden="true">
                {index + 1}
              </span>
              <LottoBall number={item.number} size="sm" />

              <span className="sb-rank-count">
                <b>{item.rounds_since}회째</b>
                {months && <small>{months}</small>}
              </span>

              <span className="sb-rank-bar">
                <span style={{ width: `${(item.rounds_since / max) * 100}%` }} />
              </span>

              <span className="sb-rank-last">{lastSeenText(item.last_seen_round, latestRound)}</span>
            </li>
          )
        })}
      </ol>

      {/*
        ⚠ 이 자리에 '나올 때가 됐다' 로 읽힐 말을 쓰지 않는다. 아래 안내 절의 도박사의 오류
          설명이 그 오해를 정면으로 다룬다(→ docs/wiki/40-domain/forbidden-expressions.md).
      */}
      <p className="sb-legend">
        막대가 길수록 오래 쉬고 있다는 뜻입니다. 오래 쉰 번호가 다음에 나올 차례라는 뜻은
        아닙니다 — 추첨은 매 회차 새로 진행됩니다.
      </p>
    </section>
  )
}
