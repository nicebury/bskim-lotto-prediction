'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { LottoBall } from '@/components/LottoBall'
import { browserNumberStat } from '@/lib/api'
import type { NumberStat, RoundIndexEntry } from '@/lib/api-types'
import { ratePercent, TREND_DISPLAY } from '@/lib/stat-insight'

import { ScopeCaption } from './ScopeCaption'
import { StatQueryBar, type StatScope } from './StatQueryBar'

const NUMBERS = Array.from({ length: 45 }, (_, i) => i + 1)

/**
 * 처음 열었을 때 자동으로 골라 둘 번호.
 *
 * 종전에는 아무것도 선택되지 않은 채 45개 버튼만 떠 있어서, **무엇을 누르면 무엇이 나오는지**
 * 눌러 보기 전에는 알 수 없었다(사용자 지적). 1번을 미리 골라 두면 결과 화면의 생김새가
 * 바로 보이고, 다른 번호를 누르면 그 자리가 바뀐다는 것도 자연스럽게 전달된다.
 */
const INITIAL_NUMBER = 1

/**
 * 번호의 '성격' 배지.
 *
 * ⚠ 여기서 통계를 만들지 않는다 — 서버가 준 `rank`·`trend`·`rounds_since`·`max_gap` 을
 *   **말로 옮기는 표시 매핑**일 뿐이다. 그리고 어떤 배지도 미래를 말하지 않는다.
 *   "나올 때가 됐다" 는 도박사의 오류이고 이 서비스가 쓰지 않는 표현이다
 *   (→ docs/wiki/40-domain/forbidden-expressions.md).
 */
function badges(stat: NumberStat): { label: string; tone: string }[] {
  const out: { label: string; tone: string }[] = []

  if (stat.rank <= 10) out.push({ label: '자주 나온 편', tone: 'hot' })
  else if (stat.rank >= 36) out.push({ label: '뜸했던 편', tone: 'cold' })
  else out.push({ label: '중간쯤', tone: 'flat' })

  if (stat.trend === 'up') out.push({ label: '구간 후반에 더 나옴', tone: 'up' })
  if (stat.trend === 'down') out.push({ label: '구간 후반에 덜 나옴', tone: 'down' })

  // 지금 미출현 기간이 역대 최장 기록에 가까우면 그 사실 자체가 흥미롭다.
  if (typeof stat.max_gap === 'number' && stat.max_gap > 0 && stat.rounds_since >= stat.max_gap) {
    out.push({ label: '역대 최장 기록 경신 중', tone: 'cold' })
  }

  return out
}

interface Props {
  roundIndex: RoundIndexEntry[] | null
  rangeSupported: boolean
  /** 이 엔드포인트 자체가 준비됐는지. 서버가 한 번 찔러 보고 알려준다. */
  supported: boolean
}

export function NumberInspector({ roundIndex, rangeSupported, supported }: Props) {
  const [selected, setSelected] = useState<number | null>(null)
  const [scope, setScope] = useState<StatScope>({ mode: 'window', window: 50 })
  const [stat, setStat] = useState<NumberStat | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback((n: number, next: StatScope) => {
    setSelected(n)
    setScope(next)
    setBusy(true)
    setError(null)

    const query =
      next.mode === 'window'
        ? { window: next.window }
        : { fromRound: next.fromRound, toRound: next.toRound }

    browserNumberStat(n, query)
      .then(setStat)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : '번호 통계를 불러오지 못했습니다.'),
      )
      .finally(() => setBusy(false))
  }, [])

  /*
    첫 진입 시 1번을 대신 눌러 준다.
    ⚠ 서버에서 미리 받아 넘기지 않고 여기서 조회하는 이유: 이 화면은 조회 조건(구간)을
      바꿔 가며 보는 곳이라 어차피 브라우저가 부른다. 서버가 한 벌 더 받아 두면 같은 값을
      두 곳에서 관리하게 되고, 구간을 한 번만 바꿔도 그 값은 버려진다.
    ⚠ 실행은 한 번뿐이다. `load` 가 `selected`·`scope` 를 바꾸므로 의존성에 넣으면 무한
      루프가 된다. 그래서 ref 로 최초 1회를 잠근다(StrictMode 의 이중 마운트도 함께 막힌다).
      `supported` 가 false 면 화면 자체가 없으므로 부르지 않는다.
  */
  const didInit = useRef(false)
  useEffect(() => {
    if (!supported || didInit.current) return
    didInit.current = true
    load(INITIAL_NUMBER, { mode: 'window', window: 50 })
  }, [supported, load])

  if (!supported) {
    return (
      <p className="empty-state">
        번호 하나만 골라 보는 기능은 준비 중입니다. 위의 순위 목록에서 확인해 주세요.
      </p>
    )
  }

  const trend = stat ? TREND_DISPLAY[stat.trend] : null

  return (
    <div className="num-inspector">
      <p className="num-inspector-lede">
        보고 싶은 번호를 누르면 그 번호만의 기록을 보여 드립니다. 처음에는 {INITIAL_NUMBER}번을
        골라 두었습니다.
      </p>

      {/* 45개 버튼. 시각 크기는 작아도 히트 영역은 44px 를 지킨다(.num-pick 참조). */}
      <div className="num-pick" role="group" aria-label="번호 선택">
        {NUMBERS.map((n) => (
          <button
            key={n}
            type="button"
            className="num-pick-btn"
            data-active={selected === n ? '' : undefined}
            aria-pressed={selected === n}
            disabled={busy}
            onClick={() => load(n, scope)}
          >
            <LottoBall number={n} size="sm" />
          </button>
        ))}
      </div>

      {selected !== null && (
        <div className="num-result">
          <StatQueryBar
            value={scope}
            onChange={(next) => load(selected, next)}
            roundIndex={roundIndex}
            rangeSupported={rangeSupported}
            busy={busy}
          />

          {error && (
            <p className="stat-error" role="status">
              {error}
            </p>
          )}

          {stat && !error && (
            <>
              <ScopeCaption data={stat} busy={busy} />

              {/*
                한 문장으로 먼저 말한다. 표부터 보여주면 사용자가 숫자를 스스로 해석해야
                한다. 문장은 전부 서버가 준 값이고 미래를 말하지 않는다.
              */}
              <p className="num-headline">
                <LottoBall number={stat.number} size="lg" />
                <span>
                  <strong>{stat.number}번</strong>은 이 구간 {stat.rounds_analyzed}회 중{' '}
                  <strong>{stat.count}회</strong> 나와 45개 번호 가운데{' '}
                  <strong>{stat.rank}위</strong>입니다.
                </span>
              </p>

              <ul className="num-badges">
                {badges(stat).map((badge) => (
                  <li key={badge.label} className="num-badge" data-tone={badge.tone}>
                    {badge.label}
                  </li>
                ))}
              </ul>

              <dl className="num-facts">
                <div>
                  <dt>출현 비율</dt>
                  <dd>{ratePercent(stat.appearance_rate)}</dd>
                </div>
                <div>
                  <dt>마지막 출현</dt>
                  <dd>
                    {stat.last_seen_round === null
                      ? '기록 없음'
                      : `${stat.last_seen_round}회 · ${stat.rounds_since}회 전`}
                  </dd>
                </div>
                <div>
                  <dt>구간 추세</dt>
                  <dd>
                    {trend && (
                      <span className={`trend trend-${trend.tone}`}>
                        <span aria-hidden="true">{trend.symbol}</span> {trend.label}
                      </span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>역대 최장 공백</dt>
                  <dd>{stat.max_gap === null ? '-' : `${stat.max_gap}회`}</dd>
                </div>
              </dl>

              {stat.companions.length > 0 && (
                <div className="num-section">
                  {/* ⚠ 감싸는 섹션 제목이 h2(번호 하나만 골라 보기)라 여기는 h3 다. h4 로 두면 h3 를
                      건너뛰어 스크린리더의 목차가 끊긴다(axe heading-order). 종전에는 결과
                      패널이 번호를 고르기 전까지 렌더되지 않아 감사에 걸리지 않았을 뿐이다. */}
                  <h3>이 번호와 함께 나온 번호</h3>
                  <ul className="num-companions">
                    {stat.companions.map((companion) => (
                      <li key={companion.number}>
                        <LottoBall number={companion.number} size="sm" />
                        <span>{companion.count}회</span>
                      </li>
                    ))}
                  </ul>
                  <p className="muted">
                    함께 나온 기록일 뿐, 두 번호 사이에 어떤 인과관계도 없습니다.
                  </p>
                </div>
              )}

              {stat.recent_appearances.length > 0 && (
                <div className="num-section">
                  <h3>이 구간에서 나온 회차</h3>
                  {/*
                    ⚠ 종전에는 회차가 그냥 나열된 것처럼 보여 **누를 수 있는지 알 수 없었다**
                      (사용자 지적). 링크이긴 했지만 알려 주는 것이 색뿐이었다. 세 가지를
                      함께 둔다 — ① 어디로 가는지 한 줄로 먼저 말하고 ② 각 항목에 이동
                      화살표를 붙이고 ③ aria-label 로 목적지를 문장으로 준다.
                      화살표만으로는 색 없이 안 보이는 사용자에게 전달되지 않는다.
                  */}
                  <p className="num-rounds-hint">
                    회차를 누르면 그 회차의 당첨결과 화면으로 이동합니다.
                  </p>
                  <ul className="num-rounds">
                    {stat.recent_appearances.map((item) => (
                      <li key={item.round_no}>
                        {/*
                          ⚠ aria-label 로 이름을 통째로 갈아 끼우지 않는다. 보이는 글자
                            ("1237회 2026.08.15")가 접근성 이름 안에 **그 순서 그대로** 들어
                            있어야 한다(WCAG 2.5.3 Label in Name) — 음성 명령 사용자는 화면에
                            보이는 글자를 읽어 말하기 때문이다. aria-label 을 쓰면 "당첨결과
                            보기" 가 중간에 끼어들어 규칙이 깨진다(axe 실측, 2026-08-21).
                            보이는 글자는 그대로 두고 **뒤에 sr-only 로 덧붙인다.**
                        */}
                        <a href={`/lotto/round/${item.round_no}`}>
                          {item.round_no}회
                          <time dateTime={item.draw_date}>
                            {item.draw_date.replace(/-/g, '.')}
                          </time>
                          <span className="sr-only">당첨결과 보기</span>
                          {/* 이동을 뜻하는 시각 표식. 뜻은 위 sr-only 가 말한다. */}
                          <span className="num-rounds-go" aria-hidden="true">
                            ›
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {busy && !stat && <p className="empty-state">불러오는 중입니다…</p>}
        </div>
      )}
    </div>
  )
}
