import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import LottoBall from './LottoBall.jsx';

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

  return (
    <section className="alt-section" aria-labelledby="alt-title">
      <div className="alt-head">
        <div>
          <h2 id="alt-title">✨ 또 다른 추천 방식</h2>
          <p className="muted-sm">
            앙상블(확률 가중)과 다른 각도의 전략 5종. 실제 확률은 모두 동일하지만
            근거가 다릅니다.
          </p>
        </div>
        <button
          className="btn btn-ghost"
          onClick={regenerate}
          disabled={loading}
          title="새로운 시드로 모든 전략 재생성"
        >
          🔄 새로 생성
        </button>
      </div>

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

      <div className="alt-panel" role="tabpanel">
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
    </section>
  );
}
