import { SIMULATOR_STEPS, type SimulatorStep } from '@/lib/simulator-steps'
import { StepIcon } from './StepIcon'

/**
 * "어떻게 추천하나요?" — 정밀 분석 일곱 단계를 **세 막**으로 보여 주는 절.
 *
 * ── 2026-09-17 재설계 ──────────────────────────────────────────────
 * 종전에는 접힌 `<details>` 안에 번호 + 제목 + 긴 문단이 일곱 줄 쌓여 있었다. 사용자 지적:
 * "무슨 절차를 정리해 논 문서 같다. 흥미를 끌고 설명해 주는 게 아니라". 그리고 "펼쳐진 상태로".
 *
 * 바꾼 것 세 가지.
 *   ① **접지 않는다.** 이 기능이 랜덤과 무엇이 다른지가 바로 이 절이다. 숨기면 "누가 봐도
 *      랜덤하게 번호 뽑는 것" 이라는 인상이 그대로 남는다.
 *   ② 일곱 단계를 **세 막**으로 묶는다 — 기록 읽기(1~4) / 한 상에 모으기(5) / 수없이
 *      돌려 보기(6~7). 일곱 개를 나란히 두면 외울 것이 일곱 개지만, 막으로 묶으면 이야기가
 *      세 줄이 된다. 막 사이에는 **흐름을 그린 그림**을 둔다.
 *   ③ 카드마다 아이콘 · 사장님 한마디(큰 글씨) · 사실 한 줄 · 본문 순서. 한마디로 붙잡고
 *      본문은 궁금한 사람이 읽는다.
 *
 * ── ⚠ 서버 컴포넌트다 ──────────────────────────────────────────────
 * 이 본문이 페이지의 고유 설명이라 검색엔진이 읽어야 한다(→ docs/wiki/30-seo/metadata-strategy.md).
 * 문장은 `SIMULATOR_STEPS` 한 곳에서 오고, 진행 대화상자의 설명 팝업도 같은 문장을 쓴다.
 *
 * ── ⚠ 그림에 숫자를 지어 넣지 않는다 ───────────────────────────────
 * 흐름 그림은 **모양만** 보여 준다. "상위 번호 7, 12, 34" 같은 예시 번호를 그려 넣으면
 * 실제 분석 결과로 읽힌다. 실제 수치는 실행한 뒤 진행 화면이 응답으로 보여 준다.
 */
export function HowSimWorks() {
  const byKey = (key: SimulatorStep['key']) => {
    const index = SIMULATOR_STEPS.findIndex((s) => s.key === key)
    return { step: SIMULATOR_STEPS[index], no: index + 1 }
  }

  const reading = (['frequency', 'cycle', 'trend', 'pattern'] as const).map(byKey)
  const ensemble = byKey('ensemble')
  const drawing = (['montecarlo', 'final'] as const).map(byKey)

  return (
    <section className="section how-sim" aria-labelledby="steps-title">
      <div className="how-sim-head">
        <p className="how-sim-eyebrow">정밀 분석 추천 · {SIMULATOR_STEPS.length}단계</p>
        <h2 id="steps-title">어떻게 추천하나요?</h2>
        <p className="how-sim-lede">
          지난 20년 당첨번호를 공책에 꼬박꼬박 적어 온 <strong>판매점 사장님</strong>을 떠올려
          보세요. 사장님이 손으로 하던 일을 컴퓨터가 세 막으로 나눠 대신합니다.
        </p>
      </div>

      <ol className="how-acts">
        {/* ── 1막: 기록 읽기 ─────────────────────────── */}
        <li className="how-act">
          <div className="how-act-head">
            <span className="how-act-tag">1막</span>
            <h3>공책을 펼친다 — 기록 네 가지 읽기</h3>
          </div>
          <div className="how-cards">
            {reading.map(({ step, no }) => (
              <StepCard key={step.key} step={step} no={no} />
            ))}
          </div>
        </li>

        {/* ── 2막: 모으기 ────────────────────────────── */}
        <li className="how-act">
          <div className="how-act-head">
            <span className="how-act-tag">2막</span>
            <h3>한 상에 모은다 — 45개 번호에 순서 매기기</h3>
          </div>
          <div className="how-act-split">
            {/*
              네 기록이 한 장의 순서표로 모이는 그림. 칸은 비어 있다 — 어떤 번호가 앞설지는
              실행할 때마다 응답이 정한다(파일 머리말 "숫자를 지어 넣지 않는다").
            */}
            <figure className="how-merge" aria-hidden="true">
              <div className="how-merge-in">
                {reading.map(({ step }) => (
                  <span key={step.key}>
                    <StepIcon stepKey={step.key} />
                  </span>
                ))}
              </div>
              <div className="how-merge-arrow" />
              <div className="how-merge-out">
                {Array.from({ length: 5 }, (_, i) => (
                  <span key={i} style={{ '--w': `${100 - i * 14}%` } as React.CSSProperties}>
                    <b>{i + 1}</b>
                    <i />
                  </span>
                ))}
                <span className="how-merge-more">… 45</span>
              </div>
            </figure>
            <StepCard step={ensemble.step} no={ensemble.no} />
          </div>
        </li>

        {/* ── 3막: 돌려 보기 ─────────────────────────── */}
        <li className="how-act">
          <div className="how-act-head">
            <span className="how-act-tag">3막</span>
            <h3>수없이 돌려 본다 — 가상 추첨과 고르기</h3>
          </div>
          <div className="how-act-split">
            {/*
              깔때기. 많이 뽑고 → 모양 기준으로 거르고 → 자주 살아남은 것을 고른다.
              ⚠ 폭 차이는 '줄어든다' 는 방향만 말한다. 비율을 뜻하지 않는다.
            */}
            <figure className="how-funnel" aria-hidden="true">
              <span style={{ '--w': '100%' } as React.CSSProperties}>
                <StepIcon stepKey="montecarlo" /> 가상 추첨 수만 번
              </span>
              <span style={{ '--w': '78%' } as React.CSSProperties}>
                <StepIcon stepKey="pattern" /> 모양 기준 통과
              </span>
              <span style={{ '--w': '56%' } as React.CSSProperties}>
                <StepIcon stepKey="final" /> 자주 살아남은 조합
              </span>
            </figure>
            <div className="how-cards is-stack">
              {drawing.map(({ step, no }) => (
                <StepCard key={step.key} step={step} no={no} />
              ))}
            </div>
          </div>
        </li>
      </ol>
    </section>
  )
}

/**
 * 단계 카드 하나.
 *
 * ⚠ 한마디(`quote`)는 사장님의 말이라 따옴표로 감싸고, 사실 한 줄(`summary`)은 굵게,
 *   긴 본문(`description`)은 작게. **읽는 깊이를 세 층으로** 두어 훑는 사람도 요지를 가져간다.
 */
function StepCard({ step, no }: { step: SimulatorStep; no: number }) {
  return (
    <article className="how-card" data-step={step.key}>
      <div className="how-card-top">
        <span className="how-card-icon" aria-hidden="true">
          <StepIcon stepKey={step.key} />
        </span>
        <span className="how-card-no">{no}단계</span>
      </div>
      <h4>{step.title}</h4>
      <p className="how-card-quote">&ldquo;{step.quote}&rdquo;</p>
      <p className="how-card-summary">{step.summary}</p>
      <p className="how-card-body">{step.description}</p>
    </article>
  )
}
