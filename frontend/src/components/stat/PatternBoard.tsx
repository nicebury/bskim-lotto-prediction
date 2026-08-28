'use client'

import { useEffect, useState } from 'react'

import { browserPattern } from '@/lib/api'
import type { PatternResult, RoundIndexEntry } from '@/lib/api-types'

import { HelpTip } from './HelpTip'
import { ScopeCaption } from './ScopeCaption'
import { StatQueryBar, type StatScope } from './StatQueryBar'
import { ScrollArea } from '@/components/ScrollArea'

interface Props {
  initial: Partial<Record<string, PatternResult>>
  roundIndex: RoundIndexEntry[] | null
  rangeSupported: boolean
}

/** 목록에서 값이 가장 큰 행. 카드의 결론 한 줄과 막대 강조가 같은 행을 가리키게 한다. */
function maxRow<T extends { value: number }>(rows: T[]): T | undefined {
  return rows.reduce<T | undefined>(
    (best, row) => (best === undefined || row.value > best.value ? row : best),
    undefined,
  )
}

/** 0.334 → "33.4%" — 패턴 비율은 소수점 한 자리까지 봐야 순위가 구분된다. */
function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

/**
 * 비율 막대 목록. 홀짝·고저·연속번호가 공유한다.
 *
 * 막대는 장식이고 옆의 숫자가 정보다 — 길이만으로 값을 전달하지 않는다(WCAG 1.4.1).
 * 값은 서버가 준 비율 그대로이고 여기서 다시 계산하지 않는다.
 *
 * ⚠ 색을 카드마다 다르게 칠하지 않는다. 종전에는 서비스 팔레트를 카드별로 배정했는데
 *   **홀짝이 왜 보라색인지 설명할 근거가 없었다** — 뜻 없는 색은 장식일 뿐이고 화면을
 *   템플릿처럼 보이게 한다. 대신 **가장 흔한 모양 하나만 진하게** 칠해 색이 사실을
 *   가리키게 했다. 나머지는 같은 색의 옅은 톤이라 서로 비교된다.
 */
function DistBars({ rows }: { rows: { label: string; value: number; note?: string }[] }) {
  const peak = Math.max(0.0001, ...rows.map((row) => row.value))

  return (
    <ul className="dist-list">
      {rows.map((row) => {
        // 계약상 분포 맵은 비율 내림차순으로 오지만, 연속번호는 개수 순이라 정렬을 믿지 않는다.
        const isTop = row.value === peak
        return (
          <li className="dist-row" key={row.label} data-top={isTop ? '' : undefined}>
            <span className="dist-label">
              {row.label}
              {row.note && <span className="dist-note">{row.note}</span>}
            </span>
            <span className="dist-bar" aria-hidden="true">
              <span
                className="dist-bar-fill"
                style={{ width: `${Math.max(3, (row.value / peak) * 100)}%` }}
              />
            </span>
            <span className="dist-value">{pct(row.value)}</span>
          </li>
        )
      })}
    </ul>
  )
}

/** 합계 히스토그램. 값이 **회차 수**라 비율 막대와 서식을 달리한다. */
function SumHistogram({ histogram }: { histogram: Record<string, number> }) {
  const entries = Object.entries(histogram)
  const peak = Math.max(1, ...entries.map(([, count]) => count))

  return (
    <ScrollArea className="hist" label="여섯 번호 합계 구간별 회차 수 그래프">
      {entries.map(([range, count]) => (
        <div
          className="hist-col"
          key={range}
          data-top={count === peak ? '' : undefined}
          title={`${range} · ${count}회차`}
        >
          <span
            className="hist-bar"
            style={{ height: `${Math.max(3, (count / peak) * 100)}%` }}
            aria-hidden="true"
          />
          <span className="hist-label">{range.split('-')[0]}</span>
          <span className="sr-only">
            합계 {range} 구간 {count}회차
          </span>
        </div>
      ))}
    </ScrollArea>
  )
}

/**
 * 패턴 카드 한 장.
 *
 * 카드마다 색을 달리하는 대신 **그 카드의 결론 한 줄**(`lead`)을 제목 아래 크게 둔다.
 * 색은 훑을 때 구분만 시켜 줄 뿐 아무 뜻도 없었지만, 결론 문장은 그 카드가 무엇을
 * 말하는지 즉시 알려 준다 — 훑는 사람에게 더 필요한 것은 후자다.
 */
function PatternCard({
  title,
  lead,
  help,
  children,
  footer,
}: {
  title: string
  /** 이 카드가 말하는 한 가지. 서버 값으로 조립하며 과거 사실만 서술한다. */
  lead?: React.ReactNode
  help: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <section className="pattern-card">
      <h3 className="pattern-card-title">
        {title}
        <HelpTip title={title}>{help}</HelpTip>
      </h3>
      {lead && <p className="pattern-card-lead">{lead}</p>}
      <div className="pattern-card-body">{children}</div>
      {footer && <p className="pattern-card-foot">{footer}</p>}
    </section>
  )
}

export function PatternBoard({ initial, roundIndex, rangeSupported }: Props) {
  const [scope, setScope] = useState<StatScope>({ mode: 'window', window: 'all' })
  const [remote, setRemote] = useState<PatternResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cached = scope.mode === 'window' ? (initial[String(scope.window)] ?? null) : null
  const data = cached ?? remote

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
        ? { window: scope.window }
        : { fromRound: scope.fromRound, toRound: scope.toRound }

    browserPattern(query)
      .then((result) => {
        if (alive) setRemote(result)
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : '통계를 불러오지 못했습니다.')
      })
      .finally(() => {
        if (alive) setBusy(false)
      })

    return () => {
      alive = false
    }
  }, [cached, scope])

  const oddEven = data ? Object.entries(data.odd_even).map(([label, value]) => ({ label, value })) : []
  const highLow = data ? Object.entries(data.high_low).map(([label, value]) => ({ label, value })) : []

  // 연속번호: 003 신규 필드가 있으면 개수별 분포, 없으면 포함/미포함 두 줄로 폴백한다.
  const consecutive = data?.consecutive_counts
    ? Object.entries(data.consecutive_counts).map(([label, value]) => ({
        label: label === '0' ? '연속 없음' : `연속 ${label}쌍`,
        value,
      }))
    : data
      ? [
          { label: '연속번호 포함', value: data.consecutive_ratio },
          { label: '연속번호 없음', value: 1 - data.consecutive_ratio },
        ]
      : []

  const tails = data
    ? Object.entries(data.tail_counts).map(([label, count]) => ({ label: `${label}로 끝`, count }))
    : []
  const tailPeak = Math.max(1, ...tails.map((tail) => tail.count))

  return (
    <div className="statboard-v3">
      <StatQueryBar
        value={scope}
        onChange={setScope}
        roundIndex={roundIndex}
        rangeSupported={rangeSupported}
        busy={busy}
      />

      <ScopeCaption data={data} busy={busy} />

      {error && (
        <p className="stat-error" role="status">
          {error} 잠시 후 다시 시도해 주세요.
        </p>
      )}

      {data ? (
        <div className="pattern-grid">
          <PatternCard
            title="홀수와 짝수"
            lead={
              oddEven[0] && (
                <>
                  가장 흔한 모양은 <strong>{oddEven[0].label}</strong> · {pct(oddEven[0].value)}
                </>
              )
            }
            help={
              <>
                여섯 개 번호 중 <strong>홀수가 몇 개였는지</strong>를 센 분포입니다.
                &ldquo;3:3&rdquo;은 홀수 셋 짝수 셋이라는 뜻입니다. 홀수도 짝수도 각각 스무
                개 남짓이라 3:3 근처가 가장 흔하게 나옵니다 — 동전 여섯 번 던져 앞뒤가 3:3
                나오는 일이 가장 잦은 것과 같은 이치입니다.
              </>
            }
          >
            <DistBars rows={oddEven} />
          </PatternCard>

          <PatternCard
            title="큰 수와 작은 수"
            lead={
              highLow[0] && (
                <>
                  가장 흔한 모양은 <strong>{highLow[0].label}</strong> · {pct(highLow[0].value)}
                </>
              )
            }
            help={
              <>
                <strong>23 이상을 &lsquo;고&rsquo;, 22 이하를 &lsquo;저&rsquo;</strong>로 나눠
                센 것입니다. &ldquo;3:3&rdquo;은 큰 수 셋 작은 수 셋이라는 뜻입니다. 45를 절반
                으로 자른 기준이라 이것도 3:3 언저리가 가장 흔합니다.
              </>
            }
          >
            <DistBars rows={highLow} />
          </PatternCard>

          <PatternCard
            title="여섯 번호의 합계"
            lead={
              <>
                열에 아홉은 <strong>{data.sum_range.min}~{data.sum_range.max}</strong> 사이
              </>
            }
            help={
              <>
                당첨번호 여섯 개를 모두 더한 값입니다. 가장 작은 합은 1+2+3+4+5+6=21,
                가장 큰 합은 40+41+42+43+44+45=255 입니다. 하지만 실제로는{' '}
                <strong>가운데 근처에 몰립니다</strong> — 아주 작은 번호만 여섯 개 뽑히거나 아주
                큰 번호만 여섯 개 뽑히는 조합의 수가 압도적으로 적기 때문입니다.
              </>
            }
            footer={
              <>
                한가운데(중앙값)는 <strong>{data.sum_range.peak}</strong> 입니다
              </>
            }
          >
            {data.sum_histogram ? (
              <SumHistogram histogram={data.sum_histogram} />
            ) : (
              <p className="muted">
                합계 분포 그래프는 준비 중입니다. 아래 요약 범위로 확인해 주세요.
              </p>
            )}
          </PatternCard>

          <PatternCard
            title="연속번호"
            /*
              lead 는 다른 카드와 같은 규칙(= 막대에서 강조된 최댓값)을 따른다. 여기만
              `consecutive_ratio` 를 쓰면 "51.8%" 라고 말해 놓고 색은 "연속 없음 48.2%" 를
              가리켜 둘이 어긋난다. 뒤집어 말한 사실은 아래 footer 로 옮겼다.
            */
            lead={
              consecutive[0] && (
                <>
                  가장 흔한 건 <strong>{maxRow(consecutive)?.label}</strong> ·{' '}
                  {pct(maxRow(consecutive)?.value ?? 0)}
                </>
              )
            }
            help={
              <>
                <strong>7, 8처럼 이웃한 두 수</strong>가 함께 뽑힌 경우를 셉니다. 의외로 흔해서
                절반 가까운 회차에 한 쌍 이상 들어 있습니다. &ldquo;연속번호는 잘 안 나온다&rdquo;는
                말이 자주 도는데, 기록은 그 반대에 가깝습니다.
              </>
            }
            footer={
              <>
                바꿔 말하면 <strong>{pct(data.consecutive_ratio)}</strong> 의 회차에는 이웃한
                두 수가 한 쌍 이상 있었어요
              </>
            }
          >
            <DistBars rows={consecutive} />
          </PatternCard>

          <PatternCard
            title="끝자리"
            lead={
              <>
                한 회차에 평균 <strong>{data.tail_variety_avg.toFixed(1)}</strong>가지 끝자리가
                섞였어요
              </>
            }
            help={
              <>
                번호의 <strong>일의 자리</strong>를 센 것입니다. 3, 13, 23, 33, 43 은 모두
                &ldquo;3으로 끝&rdquo;입니다. 끝자리가 0인 번호는 10·20·30·40 넷뿐이라 다른
                끝자리보다 조금 적게 나옵니다 — 개수가 적으니 당연한 결과입니다.
              </>
            }
          >
            <ul className="tail-list">
              {tails.map((tail) => (
                <li className="tail-row" key={tail.label} data-top={tail.count === tailPeak ? '' : undefined}>
                  <span className="tail-label">{tail.label}</span>
                  <span className="tail-bar" aria-hidden="true">
                    <span
                      className="tail-bar-fill"
                      style={{ width: `${Math.max(3, (tail.count / tailPeak) * 100)}%` }}
                    />
                  </span>
                  <span className="tail-value">{tail.count}</span>
                </li>
              ))}
            </ul>
          </PatternCard>
        </div>
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
