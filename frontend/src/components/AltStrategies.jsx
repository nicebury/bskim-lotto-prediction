import { useCallback, useEffect, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { api } from '../api.js';
import LottoBall from './LottoBall.jsx';
import { ResultActions } from './PredictionPanel.jsx';

const STRATEGIES = [
  {
    id: 'pair_affinity',
    icon: '💕',
    name: '궁합번호',
    tagline: '자주 같이 나온 단짝 번호',
    renderMeta: (m) => (
      <>
        💠 역대 최다 궁합: <b>{m.top_pair.a}번 ↔ {m.top_pair.b}번</b>{' '}
        ({m.top_pair.count}회 동반 출현)
      </>
    ),
  },
  {
    id: 'balanced_range',
    icon: '⚖️',
    name: '구간 균형',
    tagline: '1-15 / 16-30 / 31-45 에서 각 2개',
    renderMeta: (m) => (
      <>
        📐 구간 빈도 비율:{' '}
        1-15 <b>{(m.bucket_ratios['1-15'] * 100).toFixed(1)}%</b> ·{' '}
        16-30 <b>{(m.bucket_ratios['16-30'] * 100).toFixed(1)}%</b> ·{' '}
        31-45 <b>{(m.bucket_ratios['31-45'] * 100).toFixed(1)}%</b>
      </>
    ),
  },
  {
    id: 'cold_return',
    icon: '🌙',
    name: '부활 번호',
    tagline: '장기 잠수 후 최근 부활한 번호',
    renderMeta: (m) => (
      <>
        🔁 부활 후보 <b>{m.candidates_count}개</b>
        {m.sample_candidates?.length > 0 && (
          <span className="cold-sample">
            {' · 최장 잠수: '}
            {m.sample_candidates.slice(0, 3).map((c, i) => (
              <span key={c.number}>
                {i > 0 && ', '}
                <b>{c.number}번</b>({c.prev_gap}회)
              </span>
            ))}
          </span>
        )}
      </>
    ),
  },
  {
    id: 'golden_combo',
    icon: '🏆',
    name: '황금 조합',
    tagline: '역대 "모범" 조합의 분포를 복제',
    renderMeta: (m) => (
      <>
        🥇 역대 황금 조합 <b>{m.golden_count}개</b>{' '}
        (전체 {m.total_rounds}회 중 {(m.golden_ratio * 100).toFixed(1)}%)
      </>
    ),
  },
  {
    id: 'pure_random',
    icon: '🎲',
    name: '완전 랜덤',
    tagline: '분석 없음. 통제군.',
    renderMeta: () => (
      <>🎯 실제 확률은 다른 모든 전략과 동일 (통제군)</>
    ),
  },
];

export default function AltStrategies() {
  const [active, setActive] = useState('pair_affinity');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1_000_000));
  const [toast, setToast] = useState(null);
  const captureRef = useRef(null);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const load = useCallback(async (newSeed) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.strategies({ sets: 1, seed: newSeed });
      setData(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(seed);
  }, [load, seed]);

  const regenerate = () => {
    setSeed(Math.floor(Math.random() * 1_000_000));
  };

  const activeStrategy = STRATEGIES.find((s) => s.id === active);
  const result = data?.[active];

  const handleCopy = async () => {
    if (!result || !activeStrategy) return;
    try {
      const lines = [
        `✨ 또 다른 추천 방식 · ${activeStrategy.name}`,
        `${activeStrategy.tagline}`,
        '',
      ];
      result.sets.forEach((set, i) => {
        const nums = set.numbers.map((n) => String(n).padStart(2, '0')).join('  ');
        lines.push(`세트 ${i + 1}: ${nums}`);
      });
      await navigator.clipboard.writeText(lines.join('\n'));
      showToast('📋 결과가 클립보드에 복사되었습니다');
    } catch {
      showToast('⚠ 복사에 실패했습니다');
    }
  };

  const handleSaveImage = async () => {
    if (!captureRef.current) return;
    try {
      showToast('📸 이미지 생성 중...');
      const canvas = await html2canvas(captureRef.current, {
        backgroundColor: null,
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const link = document.createElement('a');
      link.download = `alt-${active}-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      showToast('📸 이미지가 저장되었습니다');
    } catch {
      showToast('⚠ 이미지 저장에 실패했습니다');
    }
  };

  return (
    <section className="alt-section" aria-labelledby="alt-title">
      <div className="alt-head">
        <div>
          <h2 id="alt-title">✨ 또 다른 추천 방식</h2>
          <p className="muted-sm">
            앙상블(확률 가중)과 다른 각도의 전략 5종. 실제 확률은 모두 동일하지만
            근거가 다릅니다.
          </p>
          <AltHowItWorks />
        </div>
      </div>

      {toast && <div className="result-toast">{toast}</div>}

      {!loading && !error && result && (
        <ResultActions
          onRerun={regenerate}
          onCopy={handleCopy}
          onSaveImage={handleSaveImage}
          rerunLabel="🔄 새로 생성"
          position="top"
        />
      )}

      <nav className="alt-tabs" role="tablist">
        {STRATEGIES.map((s) => (
          <button
            key={s.id}
            role="tab"
            aria-selected={active === s.id}
            className={`alt-tab${active === s.id ? ' active' : ''}`}
            onClick={() => setActive(s.id)}
          >
            <span className="alt-tab-icon">{s.icon}</span>
            <span className="alt-tab-name">{s.name}</span>
          </button>
        ))}
      </nav>

      <div ref={captureRef} className="alt-panel" role="tabpanel">
        <div className="alt-tagline">
          <span className="alt-panel-icon">{activeStrategy.icon}</span>
          <div>
            <div className="alt-panel-name">{activeStrategy.name}</div>
            <div className="alt-panel-desc">{activeStrategy.tagline}</div>
          </div>
        </div>

        {loading ? (
          <div className="alt-loading">
            <span className="spinner" /> 계산 중...
          </div>
        ) : error ? (
          <div className="alt-error">⚠ {error}</div>
        ) : result ? (
          <>
            <div className="alt-meta">{activeStrategy.renderMeta(result.meta)}</div>
            <div className="alt-sets">
              {result.sets.map((set, i) => (
                <div key={i} className="alt-set">
                  <span className="alt-set-label">추천</span>
                  <div className="balls">
                    {set.numbers.map((n) => (
                      <LottoBall key={n} number={n} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </div>

      {!loading && !error && result && (
        <ResultActions
          onRerun={regenerate}
          onCopy={handleCopy}
          onSaveImage={handleSaveImage}
          rerunLabel="🔄 새로 생성"
          position="bottom"
        />
      )}
    </section>
  );
}

function AltHowItWorks() {
  return (
    <details className="how-it-works">
      <summary>🤔 5가지 방식이란? <span className="how-hint">(전략 설명)</span></summary>
      <div className="how-body">
        <p className="how-intro">
          앙상블·몬테카를로 예측 말고도, <b>서로 다른 각도로 번호를 고르는 5가지 전략</b>을
          제공합니다. 실제 당첨 확률은 모두 동일하지만, 번호를 뽑는 근거가 달라요.
        </p>

        <div className="how-steps">
          <div className="how-step">
            <div className="how-step-num">1</div>
            <div className="how-step-body">
              <div className="how-step-title">💕 궁합번호</div>
              <p>
                역대 회차에서 <b>같이 자주 나온 단짝 번호</b>를 찾습니다.
                "3번과 17번이 역대 80번이나 같이 나왔다" → 먼저 한 번호를 정하고,
                그 번호와 궁합이 좋은 번호를 계속 붙여가며 6개를 완성해요.
              </p>
            </div>
          </div>

          <div className="how-step">
            <div className="how-step-num">2</div>
            <div className="how-step-body">
              <div className="how-step-title">⚖️ 구간 균형</div>
              <p>
                번호판을 <b>1-15 / 16-30 / 31-45</b> 세 구간으로 나누고
                각 구간에서 정확히 2개씩 뽑습니다.
                한쪽으로 몰리는 걸 방지하는 방식이에요.
              </p>
            </div>
          </div>

          <div className="how-step">
            <div className="how-step-num">3</div>
            <div className="how-step-body">
              <div className="how-step-title">🌙 부활 번호</div>
              <p>
                <b>30회차 이상 한 번도 안 나오다</b> 최근 5회차 안에
                깜짝 등장한 "부활" 번호들을 풀에 모아 6개를 고릅니다.
                "오래 쉬다 돌아온 애가 또 나온다"는 직감을 수식화한 전략입니다.
              </p>
            </div>
          </div>

          <div className="how-step">
            <div className="how-step-num">4</div>
            <div className="how-step-body">
              <div className="how-step-title">🏆 황금 조합</div>
              <p>
                역대 당첨 조합 중 <b>5가지 조건을 모두 만족</b>하는
                "모범 조합"만 뽑아서 그 분포로 번호를 만듭니다.
              </p>
              <div className="how-facts">
                <span className="how-fact">합계 120~150</span>
                <span className="how-fact">홀짝 3:3</span>
                <span className="how-fact">고저 3:3</span>
                <span className="how-fact">끝자리 5종 이상</span>
                <span className="how-fact">연속 1쌍 이상</span>
              </div>
            </div>
          </div>

          <div className="how-step">
            <div className="how-step-num">5</div>
            <div className="how-step-body">
              <div className="how-step-title">🎲 완전 랜덤</div>
              <p>
                분석 없이 <b>1~45에서 균등 랜덤</b>으로 6개.
                수학적으로는 가장 정직한 방법이자, 다른 전략의 <b>대조군</b>입니다.
              </p>
            </div>
          </div>
        </div>
      </div>
    </details>
  );
}
