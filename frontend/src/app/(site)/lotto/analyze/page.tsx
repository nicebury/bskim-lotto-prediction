import type { Metadata } from 'next'

import { AnalyzeBack } from '@/components/analyze/AnalyzeBack'
import { CombinationBoard } from '@/components/analyze/CombinationBoard'
import { FrequencyGrid } from '@/components/analyze/FrequencyGrid'
import { NumberFacts } from '@/components/analyze/NumberFacts'
import { PastMatchBoard } from '@/components/analyze/PastMatchBoard'
import { Retrospect } from '@/components/analyze/Retrospect'
import { Card, EmptyState } from '@/components/Card'
import { formatNumber } from '@/lib/format'
import { LottoBall } from '@/components/LottoBall'
import { NumberActions } from '@/components/NumberActions'
import { getAnalyze } from '@/lib/api'
import { SITE_NAME } from '@/lib/env'
import { DISCLAIMER } from '@/lib/site'

/**
 * 번호 분석 화면.
 *
 * 설계와 근거는 docs/wiki/20-design/number-analysis-page.md,
 * 응답 계약은 docs/wiki/10-contracts/api-contract-analysis.md 에 있다.
 *
 * ── 데이터는 한 번의 호출에서 온다 ─────────────────────────────────
 * 네 블록 전부 `GET /api/lotto/analyze` 하나가 준다([[api-contract-analysis]]).
 *
 * ⚠ **2026-09-03 에 임시 구현을 걷어냈다.** 그전에는 백엔드가 이 엔드포인트를 만들기 전이라
 *   프론트가 회차 1,239개를 200개씩 일곱 번 받아 `lib/analyze.ts` 에서 직접 계산했다.
 *   백엔드 세션이 **전수 대조로 두 계산의 값이 같음을 확인**한 뒤(log.md 2026-09-03)
 *   교체했다. 왕복 15번이 1번이 됐고, 무엇보다 **같은 계산이 두 곳에서 돌지 않는다.**
 *
 * ⚠ 응답이 없으면 안내를 그린다. 이 화면의 전부인 데이터라 조용히 빈 화면을 보이지 않는다.
 */

export const metadata: Metadata = {
  title: `번호 분석 | ${SITE_NAME}`,
  description: '고른 번호를 역대 당첨번호와 견주어 살펴봅니다.',
  /*
    ⚠ **색인하지 않는다.** 조합은 814만 가지다. 색인되면 얇은 페이지가 무한히 생기는 것과
      같고, 애드센스 심사에서 자동 생성 콘텐츠로 읽힌다. `follow` 는 남겨 링크는 따라가게 한다.
      사이트맵에도 넣지 않는다(→ 20-design/number-analysis-page.md).
  */
  robots: { index: false, follow: true },
}

/**
 * 주소에서 번호 여섯 개를 읽는다.
 *
 * ⚠ 계약과 **같은 규칙**으로 검사한다(정확히 6개, 1~45, 중복 없음). 화면이 느슨하게 받고
 *   서버가 엄격하면, 사용자는 여기까지 와서야 오류를 본다.
 * ⚠ 오름차순으로 맞춘다. `41,3,11,…` 과 `3,11,…,41` 은 같은 조합이다.
 */
function parseNumbers(raw: string | undefined): number[] | null {
  if (!raw) return null
  const parts = raw.split(',').map((p) => p.trim())
  if (parts.length !== 6) return null

  const nums: number[] = []
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null
    const n = Number(part)
    if (n < 1 || n > 45) return null
    if (nums.includes(n)) return null
    nums.push(n)
  }
  return nums.sort((a, b) => a - b)
}

export default async function AnalyzePage({
  searchParams,
}: {
  searchParams: Promise<{ numbers?: string }>
}) {
  const { numbers: raw } = await searchParams
  const numbers = parseNumbers(raw)

  /*
    ⚠ 번호가 유효할 때만 부른다. 형식이 틀린 요청을 서버에 보내 422 를 받을 이유가 없다.
  */
  const data = numbers ? await getAnalyze(numbers) : null

  return (
    <div className="container">
      <section className="section">
        <h1>번호 분석</h1>

        {numbers === null ? (
          <Card>
            <EmptyState>
              분석할 번호를 읽지 못했습니다. 추천 화면에서 번호 옆의 &lsquo;분석&rsquo;을
              눌러 주세요.
            </EmptyState>
          </Card>
        ) : (
          <>
            <p className="muted" style={{ marginTop: 'var(--space-2)' }}>
              이 번호를 역대 당첨번호와 견주어 살펴봅니다.
            </p>

            {/*
              ⚠ 분석할 번호를 맨 위에 두고 **바로 아래에 내보내기 버튼**을 붙인다. 이 화면까지
                온 사람은 그 번호를 어딘가에 남기고 싶을 때가 많은데, 종전에는 추천 화면으로
                되돌아가야만 복사·저장·공유를 할 수 있었다.
              ⚠ **'분석' 버튼은 빼야 한다**(`showAnalyze={false}`). 여기서 그것은 자기 자신으로
                가는 링크라 눌러도 아무 일이 일어나지 않는다 — 고장으로 읽힌다.
              ⚠ `sourcePath` 가 **이 분석 주소**다. 공유받은 사람이 같은 분석을 그대로 본다.
            */}
            <Card>
              <div className="ball-row" style={{ justifyContent: 'center' }}>
                {numbers.map((n) => (
                  <LottoBall key={n} number={n} />
                ))}
              </div>

              <NumberActions
                numbers={numbers}
                strategyLabel="분석한 번호"
                subtitle={
                  data === null ? undefined : `역대 ${formatNumber(data.rounds_analyzed)}회 대조`
                }
                sourcePath={`/lotto/analyze?numbers=${numbers.join(',')}`}
                showAnalyze={false}
              />
            </Card>

            {data === null ? (
              <Card>
                <EmptyState>
                  분석 정보를 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.
                </EmptyState>
              </Card>
            ) : (
              <>
                {/*
                  ⚠ **화면 순서는 계약의 블록 번호와 다르다**(2026-09-08 사용자 요청).
                    계약([[api-contract-analysis]])의 번호는 응답 구조를 가리키는 것이고,
                    화면은 **사용자가 먼저 보고 싶어 하는 순서**로 놓는다.

                    가정 집계(내가 샀다면 얼마) → 과거 대조(몇 개나 맞았나) 가 가장 먼저다.
                    둘 다 "내 번호" 이야기라 바로 와닿고, 번호별 기록·격자·조합 지표는
                    그 뒤에 더 들여다보고 싶은 사람을 위한 것이다.
                */}
                {/* ── 블록 0: 가정 집계 ──────────────────────── */}
                <section className="section" aria-labelledby="rt-title">
                  <div className="section-head">
                    <h2 id="rt-title">1회차부터 매주 샀다면?</h2>
                  </div>
                  <p className="muted" style={{ marginBottom: 'var(--space-4)' }}>
                    이 번호 하나로 첫 회차부터 지금까지 매주 샀다고 가정해 보았습니다.
                  </p>
                  <Card>
                    <Retrospect data={data.retrospect} />
                  </Card>
                </section>
                {/* ── 블록 3: 과거 회차 대조 ─────────────────── */}
                <section className="section" aria-labelledby="pm-title">
                  <div className="section-head">
                    <h2 id="pm-title">역대 당첨번호와 맞춰보면</h2>
                  </div>
                  <p className="muted" style={{ marginBottom: 'var(--space-4)' }}>
                    이 번호로 매주 샀다면 몇 개씩 맞았을지 세어 보았습니다.
                  </p>
                  <Card>
                    <PastMatchBoard
                      data={data.past_match}
                      roundsAnalyzed={data.rounds_analyzed}
                    />
                  </Card>
                </section>

                {/* ── 블록 1: 번호마다 지나온 기록 ───────────── */}
                <section className="section" aria-labelledby="nf-title">
                  <div className="section-head">
                    <h2 id="nf-title">번호마다 지나온 기록</h2>
                  </div>
                  <p className="muted" style={{ marginBottom: 'var(--space-4)' }}>
                    역대 {formatNumber(data.rounds_analyzed)}회에서 이 여섯 번호가 각각
                    어떻게 지냈는지 모았습니다.
                  </p>
                  <Card>
                    <NumberFacts facts={data.per_number} />
                  </Card>
                </section>

                {/* ── 블록 1-2: 45칸 빈도 격자 ───────────────── */}
                <section className="section" aria-labelledby="fg-title">
                  <div className="section-head">
                    <h2 id="fg-title">45개 번호 가운데 내 번호</h2>
                  </div>
                  <Card>
                    <FrequencyGrid grid={data.frequency_grid} mine={data.numbers} />
                  </Card>
                </section>

                {/* ── 블록 2: 조합 패턴 ─────────────────────── */}
                <section className="section" aria-labelledby="cb-title">
                  <div className="section-head">
                    <h2 id="cb-title">이 조합은 어떤 모양인가</h2>
                  </div>
                  <p className="muted" style={{ marginBottom: 'var(--space-4)' }}>
                    여섯 숫자만 보면 나오는 값들입니다. 오른쪽은 역대 회차에서 같은 값이
                    얼마나 흔했는지입니다.
                  </p>
                  <Card>
                    <CombinationBoard combination={data.combination} />
                  </Card>
                </section>

              </>
            )}

            <p className="disclaimer" style={{ marginTop: 'var(--space-4)' }}>
              <span className="disclaimer-icon" aria-hidden="true">
                ⓘ
              </span>
              {/*
                ⚠ **백엔드가 내려준 면책을 쓴다.** 계약이 그렇게 정했다 — 프론트가 고지를
                  잊지 못하게 하려는 장치다. 응답이 없을 때만 프론트 폴백을 쓴다.
              */}
              <span>{data?.disclaimer ?? DISCLAIMER.stats}</span>
            </p>
          </>
        )}

        <AnalyzeBack />
      </section>
    </div>
  )
}
