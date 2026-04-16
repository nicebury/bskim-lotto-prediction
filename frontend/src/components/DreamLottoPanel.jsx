import { useMemo, useState } from 'react';
import { api } from '../api.js';
import LottoBall from './LottoBall.jsx';

const GUBUN_LABEL = { 1: '정확일치', 2: '포함', 3: '유사' };
const GUBUN_COLOR = { 1: 'exact', 2: 'contain', 3: 'similar' };

const MAX_CHARS = 200;

export default function DreamLottoPanel() {
  const [text, setText] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [analyzed, setAnalyzed] = useState(null);   // { query, words: [...] }
  const [checked, setChecked] = useState(new Set()); // set of result keys
  const [tiers, setTiers] = useState(null);
  const [error, setError] = useState(null);

  const remaining = MAX_CHARS - text.length;

  const handleAnalyze = async () => {
    if (text.trim().length < 2) {
      setError('꿈 내용을 2자 이상 입력해 주세요.');
      return;
    }
    setError(null);
    setAnalyzing(true);
    setTiers(null);
    try {
      const res = await api.dreamAnalyze(text);
      setAnalyzed(res);
      // 기본: 모든 매칭 체크
      const initialChecked = new Set();
      res.words.forEach((w, wi) => {
        w.results.forEach((r, ri) => {
          initialChecked.add(keyOf(wi, ri));
        });
      });
      setChecked(initialChecked);

      if (!res.words.length) {
        setError('분석 가능한 단어를 찾지 못했습니다. 다른 단어로 다시 입력해 주세요.');
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const toggle = (key) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAll = (select) => {
    if (!analyzed) return;
    const next = new Set();
    if (select) {
      analyzed.words.forEach((w, wi) => {
        w.results.forEach((_, ri) => next.add(keyOf(wi, ri)));
      });
    }
    setChecked(next);
  };

  const selectedPayload = useMemo(() => {
    if (!analyzed) return [];
    const out = [];
    analyzed.words.forEach((w, wi) => {
      w.results.forEach((r, ri) => {
        if (checked.has(keyOf(wi, ri))) {
          out.push({ gubun: r.gubun, lotto_number: r.lotto_number });
        }
      });
    });
    return out;
  }, [analyzed, checked]);

  const handleGenerate = async () => {
    if (!selectedPayload.length) {
      setError('최소 1개 이상의 키워드를 선택해 주세요.');
      return;
    }
    setError(null);
    setGenerating(true);
    try {
      const res = await api.dreamLotto({
        selected: selectedPayload,
        setsPerTier: 10,
      });
      setTiers(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  };

  const reset = () => {
    setText('');
    setAnalyzed(null);
    setTiers(null);
    setChecked(new Set());
    setError(null);
  };

  return (
    <section className="dream-section" aria-labelledby="dream-title">
      <div className="dream-head">
        <div>
          <h2 id="dream-title">💭 꿈 해몽 → 로또 추천</h2>
          <p className="muted-sm">
            꿈 내용을 입력하면 형태소를 분석해 유사한 꿈 단어와 연관된 로또 번호를 찾아드립니다.
            선택한 단어들로 3단계 풀(정확일치 / +포함 / +유사)에서 각 10조합을 생성합니다.
          </p>
        </div>
      </div>

      <div className="dream-input-area">
        <textarea
          className="dream-textarea"
          placeholder="예) 호랑이가 산에서 내려와 물고기를 물고 있었다"
          value={text}
          maxLength={MAX_CHARS}
          onChange={(e) => setText(e.target.value)}
          rows={3}
        />
        <div className="dream-input-bottom">
          <span className="dream-charcount">{remaining}자 남음</span>
          <div className="dream-actions">
            {(analyzed || tiers) && (
              <button className="btn btn-text" onClick={reset} disabled={analyzing || generating}>
                ✕ 초기화
              </button>
            )}
            <button
              className="btn btn-primary"
              onClick={handleAnalyze}
              disabled={analyzing || !text.trim()}
            >
              {analyzing ? (<><span className="spinner" /> 분석 중...</>) : '🔍 꿈 분석'}
            </button>
          </div>
        </div>
      </div>

      {error && <div className="alert error" role="alert">⚠ {error}</div>}

      {analyzed && analyzed.words.length > 0 && (
        <div className="dream-results">
          <div className="dream-results-head">
            <h3>분석된 키워드</h3>
            <div className="dream-head-actions">
              <span className="muted-sm">
                선택 {selectedPayload.length}개 / 전체{' '}
                {analyzed.words.reduce((s, w) => s + w.results.length, 0)}개
              </span>
              <button className="btn btn-text" onClick={() => toggleAll(true)}>
                전체선택
              </button>
              <button className="btn btn-text" onClick={() => toggleAll(false)}>
                전체해제
              </button>
            </div>
          </div>

          <div className="dream-word-list">
            {analyzed.words.map((w, wi) => (
              <div key={w.dream_word + wi} className="dream-word-block">
                <div className="dream-word-title">
                  <span className="dream-keyword">🔑 {w.dream_word}</span>
                  <span className="muted-sm">{w.results.length}개 매칭</span>
                </div>
                <div className="dream-match-grid">
                  {w.results.map((r, ri) => {
                    const k = keyOf(wi, ri);
                    const isChecked = checked.has(k);
                    return (
                      <button
                        type="button"
                        key={k}
                        className={`dream-match ${GUBUN_COLOR[r.gubun]}${isChecked ? ' checked' : ''}`}
                        onClick={() => toggle(k)}
                        aria-pressed={isChecked}
                        title={`유사도 ${(r.score * 100).toFixed(1)}%`}
                      >
                        <span className="dream-match-check">{isChecked ? '✓' : ''}</span>
                        <div className="dream-match-body">
                          <div className="dream-match-top">
                            <span className={`dream-gubun ${GUBUN_COLOR[r.gubun]}`}>
                              {GUBUN_LABEL[r.gubun]}
                            </span>
                            <span className="dream-match-word">{r.word}</span>
                            {r.importance > 0 && (
                              <span className={`dream-importance i${Math.min(r.importance, 5)}`}>
                                {importanceLabel(r.importance)}
                              </span>
                            )}
                          </div>
                          <div className="dream-match-nums">
                            {r.lotto_number.length > 0 ? (
                              r.lotto_number.map((n) => (
                                <span key={n} className="dream-num-chip">{n}</span>
                              ))
                            ) : (
                              <span className="muted-sm">연결 번호 없음</span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="dream-generate-bar">
            <button
              className="btn btn-primary btn-lg"
              onClick={handleGenerate}
              disabled={generating || selectedPayload.length === 0}
            >
              {generating ? (<><span className="spinner" /> 생성 중...</>) : '🎱 번호 생성'}
            </button>
            <span className="muted-sm">풀에서 고유한 10개 조합 생성, 부족분은 랜덤으로 채움</span>
          </div>
        </div>
      )}

      {tiers && <TierResults tiers={tiers} />}

      <p className="predict-disclaimer">
        ⚠ 꿈 단어–번호 매핑은 전통적 해몽 자료 기반이며 실제 당첨 확률과 무관합니다.
      </p>
    </section>
  );
}

function keyOf(wi, ri) {
  return `${wi}:${ri}`;
}

function importanceLabel(n) {
  if (n >= 5) return '강력';
  if (n >= 3) return '매우';
  if (n >= 1) return '추천';
  return '일반';
}

function TierResults({ tiers }) {
  const tierMeta = [
    { key: 'tier1', label: '세트 1 · 정확일치 전용',   color: 'exact'   },
    { key: 'tier2', label: '세트 2 · 정확 + 포함',    color: 'contain' },
    { key: 'tier3', label: '세트 3 · 전체 풀',       color: 'similar' },
  ];
  return (
    <div className="tier-results">
      <h3>🎯 추천 번호 세트</h3>
      {tierMeta.map(({ key, label, color }) => {
        const t = tiers[key];
        if (!t) return (
          <div key={key} className="tier-empty">
            <span className={`dream-gubun ${color}`}>{label}</span>
            <span className="muted-sm">해당 풀이 없습니다</span>
          </div>
        );
        return (
          <div key={key} className="tier-block">
            <div className="tier-head">
              <span className={`dream-gubun ${color}`}>{label}</span>
              <span className="muted-sm">
                풀 {t.pool_size}개 · 조합 {t.combos.length}개
              </span>
            </div>
            <div className="tier-combos">
              {t.combos.map((combo, i) => (
                <div key={i} className="tier-combo">
                  <span className="tier-combo-idx">{i + 1}</span>
                  <div className="balls">
                    {combo.map((n) => <LottoBall key={n} number={n} />)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
