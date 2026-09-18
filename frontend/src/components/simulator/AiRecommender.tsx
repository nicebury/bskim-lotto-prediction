'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { browserSimulate, simulateFallback } from '@/lib/api'
import { scrollToResultSoon } from '@/lib/scroll-to'
import type { RecommendSet, SimulateResult, SimulateTrials } from '@/lib/api-types'
import { formatNumber } from '@/lib/format'
import { loadReco, saveReco } from '@/lib/reco-store'
import { traitRows, traitSentence, traitSummaryLine } from '@/lib/traits'
import { BulkActions } from '../BulkActions'
import { Card, EmptyState } from '../Card'
import { LottoBall } from '../LottoBall'
import { NumberActions } from '../NumberActions'
import { KeyValueList } from '../stats'
import {
  DiceIcon,
  FilterIcon,
  HourglassIcon,
  LayersIcon,
  PlayGlyph,
  TallyIcon,
  TicketIcon,
  WaveIcon,
} from '../icons'
import { CountStepper } from './CountStepper'
import { SimulatorRunner } from './SimulatorRunner'

/**
 * AI 번호추천 — **이 사이트의 메인 시뮬레이터**.
 *
 * ── 왜 메인인가 ────────────────────────────────────────────────────
 * 나머지 여섯(완전 랜덤·번호대 균형·동반 출현 …)은 **한 가지 기준만 보는 서브 시뮬레이터**다.
 * 이것은 그 넷을 종합하고 가상 추첨까지 돌리는 갈래라, 화면에서도 크기와 자리로 그 차이를
 * 드러낸다(→ docs/wiki/20-design/components.md).
 *
 * ⚠ **"AI" 라는 말을 쓰는 근거**: 이 갈래는 여러 분석을 가중 종합하고 몬테카를로로 반복
 *   추첨한다. 학습된 모델은 없으므로 "AI 가 예측한다" 고 말하지 않는다 — 화면 문구는 늘
 *   **무엇을 세는가**에 머문다(→ docs/wiki/40-domain/forbidden-expressions.md).
 *
 * ⚠ 결과가 나오기까지 **일곱 단계를 전부 보여준다.** 응답이 먼저 와도 건너뛰지 않는다 —
 *   어떤 실행은 일곱 단계, 어떤 실행은 두 단계가 보이면 사용자는 무엇이 달랐는지 모른다.
 */

/**
 * 가상 추첨 횟수.
 *
 * ⚠ **계약이 셋으로 고정했다.** 자유 입력을 두면 누군가 1,000만을 넣어 서버를 붙잡는다
 *   (→ api-contract.md, [[0012-serialize-monte-carlo]]).
 */
const TRIALS: { value: SimulateTrials; label: string; note: string }[] = [
  { value: 10000, label: '1만 번', note: '가볍게' },
  { value: 50000, label: '5만 번', note: '보통' },
  { value: 100000, label: '10만 번', note: '넉넉하게' },
]

export function AiRecommender() {
  const [count, setCount] = useState(5)
  const [trials, setTrials] = useState<SimulateTrials>(100000)
  const [result, setResult] = useState<SimulateResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  /** 진행 대화상자가 떠 있는가. 응답 도착과 별개다 — 단계는 끝까지 돈다. */
  const [running, setRunning] = useState(false)
  /** 응답이 도착했는가(성공·실패 무관). 마지막 단계가 이것을 기다린다. */
  const [arrived, setArrived] = useState(false)
  /** 단계가 도는 동안 받아 둔 결과. 끝나면 화면으로 옮긴다. */
  const [pending, setPending] = useState<SimulateResult | null>(null)

  /*
   * 분석 화면에 갔다 돌아왔을 때 **뽑아 둔 번호를 되살린다**(2026-09-01 사용자가 "중요" 로
   * 표시). App Router 는 컴포넌트 상태를 복원하지 않아 그냥 두면 빈 화면이 된다.
   *
   * ⚠ **첫 마운트에 한 번만** 본다. 의존성이 비어 있는 것은 그래서다 — 사용자가 새로
   *   뽑은 뒤에 옛 결과로 되돌아가면 안 된다.
   * ⚠ 모양을 확인한 뒤에만 쓴다. 배포로 타입이 바뀌면 낡은 JSON 이 남아 있을 수 있다.
   */
  useEffect(() => {
    const saved = loadReco<SimulateResult>('ai', isSimulateResult)
    if (saved) setResult(saved)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 첫 마운트 한 번만 되살린다.
  }, [])

  const start = async () => {
    setRunning(true)
    setArrived(false)
    setPending(null)
    setError(null)
    setResult(null)

    try {
      /*
        계약의 시뮬레이터를 먼저 부른다. 백엔드가 아직 만들지 않았으면 `null` 이고,
        그때는 기존 API 를 조합해 같은 화면을 채운다(계약의 프론트 규칙).
      */
      const next = (await browserSimulate(count, trials)) ?? (await simulateFallback(count, trials))
      setPending(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : '번호를 추천하지 못했습니다.')
    } finally {
      setArrived(true)
    }
  }

  /** 결과 블록. 단계가 끝나면 여기로 화면을 옮긴다(전체 복사 버튼이 맨 위에 있다). */
  const resultRef = useRef<HTMLDivElement>(null)

  /** 단계가 모두 끝났다. 그때 비로소 결과를 화면에 올린다. */
  const finish = useCallback(() => {
    setRunning(false)
    setResult(pending)
    /*
      ⚠ **결과 자리로 화면을 옮긴다**(2026-09-18 사용자 요청). 팝업이 닫히면 사용자는 여전히
        설정 화면을 보고 있어 뽑힌 번호를 스스로 찾아 내려가야 했다.
      ⚠ 결과가 없으면(요청 실패) 움직이지 않는다 — 빈 자리로 끌고 가면 더 헷갈린다.
    */
    if (pending) scrollToResultSoon(() => resultRef.current)
    /*
      ⚠ **여기서 담는다.** '분석' 을 누를 때가 아니다 — 뒤로가기·스와이프처럼 버튼을 거치지
        않는 이동에서도 돌아왔을 때 번호가 남아 있어야 한다(→ lib/reco-store.ts).
    */
    if (pending) saveReco('ai', pending)
  }, [pending])

  /*
    ⚠ `useCallback` 으로 안정화한다. 인라인 함수로 두면 렌더마다 새 함수가 되어
      `useModalBehavior` 의 effect 가 매번 재실행되고, 그때마다 포커스가 첫 요소로
      되돌아간다 — 사용자가 '설명' 버튼에 두었던 포커스를 빼앗긴다.
  */
  const cancel = useCallback(() => {
    setRunning(false)
    setPending(null)
    setArrived(false)
  }, [])

  const trialMeta = TRIALS.find((t) => t.value === trials) ?? TRIALS[TRIALS.length - 1]

  return (
    <div className="ai-reco">
      {/*
        ── 설정 콘솔 ──────────────────────────────────────────
        ⚠ 2026-09-17 재설계. 사용자 지적 셋: "화면만 봐서는 뭔지 모르겠다", "재미없다",
          "그냥 랜덤하게 번호 뽑는 것처럼 보인다". 숫자 칩 열 개와 칸 세 개만 있으면
          **무엇을 돌리는지**가 화면 어디에도 없었다.

          그래서 세 부분으로 나눴다.
            ① 몇 개 받을지 — 스테퍼 + 표 칸(양이 보이게)
            ② 몇 번 돌릴지 — 점 밀도로 '많이 돌린다' 가 보이는 칸
            ③ **이렇게 돌아갑니다** — 고른 값이 그대로 들어간 네 단계 흐름도
          ③ 이 핵심이다. 값을 바꾸면 흐름도의 "10만 번" · "5개" 가 함께 바뀌어, 지금 고르는
          것이 **시뮬레이션의 어느 부분인지** 손으로 알게 된다.
      */}
      <div className="sim-console">
        <div className="sim-console-fields">
          <div className="sim-field">
            <p className="sim-field-title" id="ai-count-label">
              <span className="sim-field-num" aria-hidden="true">1</span>
              몇 개 받을까요?
            </p>
            <CountStepper
              value={count}
              onChange={setCount}
              labelId="ai-count-label"
              disabled={running}
            />
          </div>

          <div className="sim-field">
            {/*
              ⚠ **알고리즘 이름을 함께 낸다**(2026-09-02 사용자 요청). 실제로 돌리는 것이
                몬테카를로 시뮬레이션이므로 그 이름을 밝힌다. 지어낸 이름이 아니다 — 백엔드가
                `montecarlo.simulate()` 를 돌린다(→ docs/wiki/40-domain/prediction-algorithm.md).
            */}
            <p className="sim-field-title" id="ai-trials-label">
              <span className="sim-field-num" aria-hidden="true">2</span>
              가상 추첨을 몇 번 돌릴까요?
            </p>
            <p className="sim-field-sub">몬테카를로 시뮬레이션 · 횟수가 많을수록 표본이 커집니다</p>
            <div className="sim-trials" role="group" aria-labelledby="ai-trials-label">
              {TRIALS.map((t, i) => (
                <button
                  key={t.value}
                  type="button"
                  className="sim-trial"
                  data-active={t.value === trials ? '' : undefined}
                  aria-pressed={t.value === trials}
                  disabled={running}
                  onClick={() => setTrials(t.value)}
                >
                  {/*
                    점 밀도 = 추첨 횟수. 숫자 "1만 / 10만" 은 자릿수만 다를 뿐 크기 차이가
                    눈에 안 들어온다. 점이 촘촘해지는 것으로 열 배 차이를 보이게 한다.
                  */}
                  <span className="sim-trial-dots" data-level={i} aria-hidden="true" />
                  <span className="sim-trial-label">{t.label}</span>
                  <span className="sim-trial-note">{t.note}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/*
          ③ 흐름도. 고른 값이 들어간다.
          ⚠ `<ol>` 이다 — 순서가 곧 뜻이다. 화살표는 CSS 장식이라 낭독기는 목록 순서로 듣는다.
          ⚠ 여기 수치는 **사용자가 고른 값**뿐이다. 결과 수치(통과 조합 수 등)를 미리 지어
            넣지 않는다 — 그것은 실행 뒤 진행 화면과 결과 요약이 실제 응답으로 보여 준다.
        */}
        <div className="sim-flow-wrap">
          <p className="sim-flow-title">이렇게 돌아갑니다</p>
          <ol className="sim-flow">
            <li className="sim-flow-node">
              <span className="sim-flow-icons" aria-hidden="true">
                <TallyIcon />
                <HourglassIcon />
                <WaveIcon />
                <FilterIcon />
              </span>
              <strong>기록 네 가지 읽기</strong>
              <span>빈도 · 쉰 기간 · 최근 흐름 · 조합 모양</span>
            </li>
            <li className="sim-flow-node">
              <span className="sim-flow-icon" aria-hidden="true">
                <LayersIcon />
              </span>
              <strong>45개 번호에 순서 매기기</strong>
              <span>네 기록을 한데 모아서</span>
            </li>
            <li className="sim-flow-node is-hot">
              <span className="sim-flow-icon sim-flow-dice" aria-hidden="true">
                <DiceIcon />
              </span>
              <strong>가상 추첨 {trialMeta.label}</strong>
              <span>모양 기준을 통과한 조합만 남김</span>
            </li>
            <li className="sim-flow-node">
              <span className="sim-flow-icon" aria-hidden="true">
                <TicketIcon />
              </span>
              <strong>추천 {count}개</strong>
              <span>가장 자주 살아남은 조합</span>
            </li>
          </ol>
        </div>

        {/*
          실행 줄.
          ⚠ 고른 값을 한 문장으로 되짚는 줄(`#ai-reco-plan`)을 남긴다. 버튼이
            `aria-describedby` 로 가리켜 **실행 직전에 한 번** 들린다. `aria-live` 는 걸지
            않는다 — 값을 바꿀 때마다 떠든다.
        */}
        <div className="sim-go-row">
          <p className="sim-go-plan" id="ai-reco-plan">
            번호 <strong>{count}개</strong>를 가상 추첨 <strong>{trialMeta.label}</strong>으로
            골라 드립니다.
          </p>
          <button
            type="button"
            className="btn btn-primary sim-go"
            onClick={() => void start()}
            disabled={running}
            aria-describedby="ai-reco-plan"
          >
            <PlayGlyph width={18} height={18} />
            <span>
              {running ? '시뮬레이션 중…' : result ? '다시 돌려 보기' : '시뮬레이션 시작'}
            </span>
          </button>
        </div>
      </div>

      {error && (
        <Card>
          <EmptyState>{error}</EmptyState>
        </Card>
      )}

      {result && <SimulateResultView result={result} anchorRef={resultRef} />}

      {running && (
        <SimulatorRunner
          stages={pending?.stages ?? null}
          firstSet={pending?.sets[0]?.numbers ?? null}
          trials={trials}
          done={arrived}
          onCancel={cancel}
          onFinished={finish}
        />
      )}
    </div>
  )
}

function SimulateResultView({
  result,
  anchorRef,
}: {
  result: SimulateResult
  /** 결과가 나오면 이 자리로 화면이 옮겨 온다(→ `scrollToResultSoon`). */
  anchorRef?: React.RefObject<HTMLDivElement | null>
}) {
  if (result.sets.length === 0) {
    return (
      <Card>
        <EmptyState>추천할 번호를 만들지 못했습니다. 잠시 뒤 다시 시도해 주세요.</EmptyState>
      </Card>
    )
  }

  return (
    <div className="ai-reco-result" ref={anchorRef}>
      {/*
        결과 위에 무엇을 했는지 한 줄. 팝업이 닫힌 뒤에도 근거가 화면에 남아야 한다 —
        단계는 지나가지만 사실은 남는다.
      */}
      <p className="ai-reco-summary">
        가상 추첨 <strong>{formatNumber(result.trials)}번</strong>을 돌려{' '}
        <strong>{formatNumber(result.sets.length)}개</strong>를 추천했습니다.
        {result.stages.montecarlo &&
          ` 그 가운데 ${formatNumber(result.stages.montecarlo.valid_combinations)}개 조합이 패턴 기준을 통과했습니다.`}
      </p>

      <BulkActions
        sets={result.sets.map((s) => s.numbers)}
        strategyLabel="정밀 분석 추천"
        sourcePath="/lotto/recommend"
      />

      <ol className="ai-reco-sets">
        {result.sets.map((set, index) => (
          <li key={set.numbers.join('-')}>
            <SetCard set={set} index={index} hotWindow={result.hot_window} />
          </li>
        ))}
      </ol>

      <p className="disclaimer" style={{ marginTop: 'var(--space-4)' }}>
        <span className="disclaimer-icon" aria-hidden="true">
          ⓘ
        </span>
        <span>{result.disclaimer}</span>
      </p>
    </div>
  )
}

/**
 * 추천 한 벌.
 *
 * ⚠ **성향을 문장과 표로 함께 낸다**(2026-09-01 사용자 요청). 종전에는 `traitSummaryLine`
 *   한 줄("홀짝 3:3 · 고저 3:3 · 합계 129")뿐이라, 여섯 가지 추천 쪽이 훨씬 자세한
 *   역전 현상이 있었다 — 정작 이쪽이 일곱 단계를 돌린 결과인데도.
 *
 * ⚠ **문장과 표를 둘 다 두는 이유**가 있다. 표는 훑어보기 좋고 문장은 읽어야 뜻이 통한다.
 *   화면을 보지 않는 사용자에게는 표의 라벨-값 나열보다 문장이 훨씬 잘 전해지고,
 *   검색엔진이 읽는 것도 문장 쪽이다. 같은 사실을 두 형태로 낸다.
 *
 * ⚠ `hotWindow` 를 반드시 넘긴다. 없으면 "최근 회차에서 자주 나온 번호" 라고만 쓰여
 *   **어느 구간 기준인지 알 수 없다**(→ lib/traits.ts).
 */
function SetCard({
  set,
  index,
  hotWindow,
}: {
  set: RecommendSet
  index: number
  hotWindow: number | null
}) {
  return (
    // ⚠ "n번째 조합" 이 아니라 "추천 n" 이다. 화면 전체에서 '조합' 대신 '추천' 을 쓴다.
    <Card as="article" title={`추천 ${index + 1}`}>
      <div className="ball-row" style={{ justifyContent: 'space-between' }}>
        {set.numbers.map((n) => (
          <LottoBall key={n} number={n} />
        ))}
      </div>

      <p className="reco-traits" style={{ marginTop: 'var(--space-4)' }}>
        {traitSentence(set.traits, '이 번호', hotWindow)}
      </p>

      <div style={{ marginTop: 'var(--space-4)' }}>
        <KeyValueList rows={traitRows(set.traits)} />
      </div>

      <NumberActions
        numbers={set.numbers}
        strategyLabel="정밀 분석 추천"
        subtitle={traitSummaryLine(set.traits)}
        sourcePath="/lotto/recommend"
      />
    </Card>
  )
}

/**
 * 담아 둔 JSON 이 이 화면이 쓸 수 있는 모양인지 확인한다.
 *
 * ⚠ 깊게 파고들지 않는다. `sets` 가 배열이고 `stages` 가 객체라는 것까지만 본다 — 그
 *   두 가지가 렌더링에서 바로 쓰이는 것이고, 나머지가 조금 달라도 화면은 서지 않는다.
 */
function isSimulateResult(value: unknown): value is SimulateResult {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Partial<SimulateResult>
  return Array.isArray(v.sets) && typeof v.stages === 'object' && v.stages !== null
}
