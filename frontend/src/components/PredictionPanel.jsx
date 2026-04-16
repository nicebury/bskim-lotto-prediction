import { useCallback, useState } from 'react';
import { api } from '../api.js';
import LottoBall from './LottoBall.jsx';

const STAGES = [
  { id: 'load',       icon: '📂', label: '데이터 로딩',            desc: '역대 당첨번호 데이터 불러오기' },
  { id: 'frequency',  icon: '📊', label: '전체 빈도 분석',          desc: '1~45 번호별 역대 출현 횟수 집계' },
  { id: 'delay',      icon: '⏳', label: '지연 번호 분석',          desc: '마지막 출현 이후 경과 회차 계산' },
  { id: 'hot_cold',   icon: '🔥', label: '핫/콜드 넘버 분석',       desc: '최근 20회차 가중 빈도로 트렌드 파악' },
  { id: 'pattern',    icon: '🧩', label: '패턴 분석',              desc: '홀짝·고저·연속·끝자리·합산 분포 집계' },
  { id: 'ensemble',   icon: '⚖️', label: '앙상블 스코어링',         desc: '4개 분석 점수 가중 합산' },
  { id: 'montecarlo', icon: '🎲', label: '몬테카를로 시뮬레이션',    desc: '5만 회 추출 + 패턴 필터로 조합 도출' },
];

const STAGE_INTERVAL_MS = 450;

export default function PredictionPanel() {
  const [state, setState] = useState('idle'); // idle | running | done | error
  const [stageIdx, setStageIdx] = useState(-1);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [opts, setOpts] = useState({ sets: 5, simulations: 50000 });

  const run = useCallback(async () => {
    setState('running');
    setError(null);
    setResult(null);
    setStageIdx(0);

    const started = Date.now();
    const reqPromise = api.predict(opts).catch((e) => ({ __error: e }));

    // 단계별 애니메이션 (백엔드 응답과 병렬 진행)
    for (let i = 1; i < STAGES.length; i++) {
      await new Promise((r) => setTimeout(r, STAGE_INTERVAL_MS));
      setStageIdx(i);
    }

    const res = await reqPromise;

    // 최소 표시 시간 보장
    const minTotal = STAGES.length * STAGE_INTERVAL_MS;
    const elapsed = Date.now() - started;
    if (elapsed < minTotal) {
      await new Promise((r) => setTimeout(r, minTotal - elapsed));
    }

    setStageIdx(STAGES.length); // 전 단계 완료

    if (res && res.__error) {
      setError(res.__error.message);
      setState('error');
    } else {
      setResult(res);
      setState('done');
    }
  }, [opts]);

  const reset = () => {
    setState('idle');
    setResult(null);
    setStageIdx(-1);
    setError(null);
  };

  return (
    <section className="predict-section" aria-labelledby="predict-title">
      <div className="predict-head">
        <div>
          <h2 id="predict-title">🔮 로또 번호 예측</h2>
          <p className="predict-desc">
            1,200회+ 역대 당첨 데이터를 4종 AI 분석 알고리즘으로 교차 검증 후, 몬테카를로 시뮬레이션으로 최적 조합을 도출합니다.
          </p>
          <HowItWorks />
        </div>

        {state === 'idle' && (
          <div className="predict-controls">
            <label className="predict-opt">
              추천 세트
              <select
                value={opts.sets}
                onChange={(e) => setOpts({ ...opts, sets: Number(e.target.value) })}
              >
                {[1, 3, 5, 7, 10].map((n) => (
                  <option key={n} value={n}>{n}개</option>
                ))}
              </select>
            </label>
            <label className="predict-opt">
              시뮬레이션
              <select
                value={opts.simulations}
                onChange={(e) => setOpts({ ...opts, simulations: Number(e.target.value) })}
              >
                <option value={20000}>2만회 (빠름)</option>
                <option value={50000}>5만회 (기본)</option>
                <option value={100000}>10만회 (정밀)</option>
              </select>
            </label>
            <button className="btn btn-primary btn-lg" onClick={run}>
              🔮 예측 실행
            </button>
          </div>
        )}
      </div>

      {state === 'running' && <StageList currentIdx={stageIdx} />}

      {state === 'error' && (
        <div className="alert error" role="alert">
          ⚠ {error}
          <button className="btn btn-text" onClick={reset}>다시 시도</button>
        </div>
      )}

      {state === 'done' && result && <ResultView result={result} onRerun={reset} />}
    </section>
  );
}

function HowItWorks() {
  return (
    <details className="how-it-works">
      <summary>🤔 어떻게 추천하나요? <span className="how-hint">(알고리즘 보기)</span></summary>
      <div className="how-body">
        <p className="how-intro">
          지난 20년간 로또 당첨번호를 공책에 꼬박꼬박 적어온 로또판매점 사장님이 있다고 상상해 보세요.
          이 사장님의 노하우를 알고리즘으로 옮기면 이렇게 됩니다.
        </p>

        <div className="how-steps">
          <div className="how-step">
            <div className="how-step-num">1</div>
            <div className="how-step-body">
              <div className="how-step-title">📊 빈도 분석</div>
              <p>
                사장님은 공책에 적어둔 역대 <b>1,200회+</b> 당첨번호를 펼쳐놓고
                1번부터 45번까지 각 번호가 몇 번씩 나왔는지 세어봅니다.
                보너스 번호도 빠뜨리지 않고 체크합니다.
              </p>
            </div>
          </div>

          <div className="how-step">
            <div className="how-step-num">2</div>
            <div className="how-step-body">
              <div className="how-step-title">⏳ 출현 주기 분석</div>
              <p>
                그리고 각 번호가 <b>마지막으로 나온 뒤 몇 주째 쉬고 있는지</b>
                쭉 훑어봅니다.
                "34번은 벌써 12주째 안 나왔네... 슬슬 나올 때가 됐는데?"
                하면서 잠재력 점수를 올려줍니다.
              </p>
            </div>
          </div>

          <div className="how-step">
            <div className="how-step-num">3</div>
            <div className="how-step-body">
              <div className="how-step-title">🔥 최근 트렌드 감지</div>
              <p>
                사장님은 특히 <b>최근 20회차</b>를 눈여겨봅니다.
                "요즘 27번이 자꾸 나오네. 흐름이 있어."
                최신 추첨일수록 <b>가중치를 2배</b>로 줘서 요즘 뜨는 번호를 포착합니다.
              </p>
            </div>
          </div>

          <div className="how-step">
            <div className="how-step-num">4</div>
            <div className="how-step-body">
              <div className="how-step-title">🧩 조합 패턴 필터</div>
              <p>
                사장님은 20년간 공책을 보면서 당첨 조합에 놀라운 공통점이 있다는 걸 발견했습니다.
              </p>
              <div className="how-facts">
                <span className="how-fact">홀짝 3:3 비율 <b>33%</b></span>
                <span className="how-fact">합계 98~177 구간 <b>80%</b></span>
                <span className="how-fact">연속번호 포함 <b>52%</b></span>
                <span className="how-fact">끝자리 5종+ <b>평균</b></span>
              </div>
              <p>
                "1,2,3,4,5,6 같은 조합? 역대 한 번도 안 나왔어."
                이 기준을 벗어나는 조합은 과감하게 걸러냅니다.
              </p>
            </div>
          </div>

          <div className="how-step">
            <div className="how-step-num">5</div>
            <div className="how-step-body">
              <div className="how-step-title">⚖️ 앙상블 스코어링</div>
              <p>
                사장님 혼자 판단하면 편향될 수 있으니, 위 4가지 분석 결과를
                모두 종합해 1번~45번 각 번호에 <b>최종 점수</b>를 매깁니다.
                서로 다른 관점이 교차 검증하는 거죠.
              </p>
            </div>
          </div>

          <div className="how-step">
            <div className="how-step-num">6</div>
            <div className="how-step-body">
              <div className="how-step-title">🎲 몬테카를로 시뮬레이션</div>
              <p>
                이제 컴퓨터가 사장님 대신 <b>최대 10만 번의 가상 추첨</b>을 돌립니다.
                최종 점수가 높은 번호가 더 자주 뽑히되,
                매번 4단계의 패턴 필터를 통과한 조합만 살아남습니다.
                평균 <b>3~4만 개의 유효 조합</b>이 만들어집니다.
              </p>
            </div>
          </div>

          <div className="how-step">
            <div className="how-step-num">7</div>
            <div className="how-step-body">
              <div className="how-step-title">🎯 최종 추천</div>
              <p>
                수만 개의 유효 조합 중에서 <b>가장 자주 반복 등장한 번호 조합</b>을
                사장님이 최종적으로 찍어줍니다.
                "이 번호들이 제일 자주 살아남았어. 이거 한번 넣어봐!"
              </p>
            </div>
          </div>
        </div>
      </div>
    </details>
  );
}

function StageList({ currentIdx }) {
  return (
    <ol className="stage-list" role="list">
      {STAGES.map((s, i) => {
        const status =
          i < currentIdx ? 'done'
          : i === currentIdx ? 'active'
          : 'pending';
        return (
          <li key={s.id} className={`stage stage-${status}`}>
            <span className="stage-marker" aria-hidden>
              {status === 'done' ? '✓' : status === 'active' ? <span className="stage-spin" /> : s.icon}
            </span>
            <div className="stage-body">
              <div className="stage-label">{s.label}</div>
              <div className="stage-desc">{s.desc}</div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function formatScore(n) {
  return (n * 100).toFixed(1) + '%';
}

function ResultView({ result, onRerun }) {
  const mc = result.montecarlo;
  return (
    <div className="predict-result">
      <div className="result-summary">
        <div>
          <span className="muted">분석 회차</span>
          <strong>{result.total_rounds.toLocaleString('ko-KR')}회</strong>
        </div>
        <div>
          <span className="muted">최신 회차</span>
          <strong>{result.latest_round}회</strong>
        </div>
        <div>
          <span className="muted">시뮬레이션</span>
          <strong>{mc.total_simulations.toLocaleString('ko-KR')}회</strong>
        </div>
        <div>
          <span className="muted">유효 조합</span>
          <strong>{mc.valid_combos.toLocaleString('ko-KR')}개</strong>
        </div>
      </div>

      <h3 className="result-heading">🎯 추천 번호 세트</h3>
      <div className="recommend-list">
        {result.recommendations.map((rec, i) => (
          <article key={i} className="recommend-card">
            <header className="recommend-head">
              <span className="recommend-badge">세트 {i + 1}</span>
              <span className="recommend-conf">
                번호별 평균 <b>{(rec.avg_number_hits ?? 0).toLocaleString('ko-KR')}회</b> 등장
              </span>
            </header>
            <div className="balls recommend-balls">
              {rec.numbers.map((n) => (
                <LottoBall key={n} number={n} />
              ))}
            </div>
          </article>
        ))}
      </div>

      <h3 className="result-heading">📋 분석 근거</h3>
      <div className="insight-grid">
        <InsightCard
          icon="📊"
          title="자주 나온 번호"
          desc="역대 1,200회+ 전체에서 가장 많이 당첨된 번호"
          items={result.frequency.top5}
        />
        <InsightCard
          icon="⏳"
          title="오래 쉬고 있는 번호"
          desc="마지막 출현 이후 가장 오래 기다리고 있는 번호"
          items={result.delay.top5}
        />
        <InsightCard
          icon="🔥"
          title="요즘 뜨는 번호"
          desc="최근 20회차에서 유독 자주 등장한 번호"
          items={result.hot_cold.top5}
        />
        <InsightCard
          icon="⚖️"
          title="종합 순위"
          desc="4가지 분석을 모두 종합한 최종 점수 상위 번호"
          items={result.ensemble.top10}
        />
      </div>

      <div className="predict-actions">
        <button className="btn btn-primary" onClick={onRerun}>
          🔄 다시 예측
        </button>
      </div>

      <p className="predict-disclaimer">
        본 추천은 역대 데이터 기반 분석 알고리즘의 결과이며, 당첨을 보장하지 않습니다.
      </p>
    </div>
  );
}

function InsightCard({ icon, title, desc, items }) {
  return (
    <div className="insight-card">
      <div className="insight-bubble" aria-hidden />
      <div className="insight-header">
        <span className="insight-icon">{icon}</span>
        <div>
          <div className="insight-title">{title}</div>
          <div className="insight-desc">{desc}</div>
        </div>
      </div>
      <div className="insight-balls">
        {items.map((it, i) => (
          <div key={it.number} className="insight-item">
            <span className="insight-rank">{i + 1}</span>
            <LottoBall number={it.number} />
            <span className="insight-score">{formatScore(it.score)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
