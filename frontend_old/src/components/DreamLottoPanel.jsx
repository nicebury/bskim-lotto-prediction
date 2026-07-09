import { useMemo, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { api } from '../api.js';
import LottoBall from './LottoBall.jsx';
import { ResultActions } from './PredictionPanel.jsx';

const GUBUN_LABEL = {
  1: '⭐⭐⭐ 딱 맞아요',
  2: '⭐⭐ 관련 있어요',
  3: '⭐ 비슷한 느낌',
};
const GUBUN_COLOR = { 1: 'exact', 2: 'contain', 3: 'similar' };

const TIER_META = [
  { key: 'tier1', label: '🎯 꿈에 충실형', color: 'exact' },
  { key: 'tier2', label: '⚖️ 균형형',     color: 'contain' },
  { key: 'tier3', label: '🎲 확장형',     color: 'similar' },
];

const MAX_CHARS = 200;

export default function DreamLottoPanel() {
  const [text, setText] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [analyzed, setAnalyzed] = useState(null);   // { query, words: [...] }
  const [checked, setChecked] = useState(new Set()); // set of result keys
  const [tiers, setTiers] = useState(null);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [mode, setMode] = useState('auto'); // 'auto' | 'manual'
  const [expandedWords, setExpandedWords] = useState(new Set()); // Set<wi>
  const captureRef = useRef(null);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const handleCopyTiers = async () => {
    if (!tiers) return;
    try {
      await navigator.clipboard.writeText(buildDreamCopyText(text, tiers));
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
      link.download = `dream-lotto-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      showToast('📸 이미지가 저장되었습니다');
    } catch {
      showToast('⚠ 이미지 저장에 실패했습니다');
    }
  };

  const remaining = MAX_CHARS - text.length;

  const handleAnalyze = async () => {
    if (text.trim().length < 2) {
      setError('꿈 내용을 2자 이상 입력해 주세요.');
      return;
    }
    setError(null);
    setAnalyzing(true);
    setTiers(null);
    setExpandedWords(new Set());
    try {
      const res = await api.dreamAnalyze(text);
      setAnalyzed(res);

      // 기본: 모든 매칭 체크
      const initialChecked = new Set();
      const payload = [];
      res.words.forEach((w, wi) => {
        w.results.forEach((r, ri) => {
          initialChecked.add(keyOf(wi, ri));
          payload.push({ gubun: r.gubun, lotto_number: r.lotto_number });
        });
      });
      setChecked(initialChecked);

      if (!res.words.length) {
        setError('분석 가능한 단어를 찾지 못했습니다. 다른 단어로 다시 입력해 주세요.');
        return;
      }

      // 자동 모드: 분석 직후 바로 번호 생성까지 체이닝
      if (mode === 'auto') {
        setGenerating(true);
        try {
          const tierRes = await api.dreamLotto({
            selected: payload,
            setsPerTier: 10,
          });
          setTiers(tierRes);
        } finally {
          setGenerating(false);
        }
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const switchToManual = () => {
    setMode('manual');
  };

  const backToAuto = () => {
    setMode('auto');
    setExpandedWords(new Set());
  };

  const toggleExpanded = (wi) => {
    setExpandedWords((prev) => {
      const next = new Set(prev);
      if (next.has(wi)) next.delete(wi);
      else next.add(wi);
      return next;
    });
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
    setMode('auto');
    setExpandedWords(new Set());
  };

  return (
    <section className="dream-section" aria-labelledby="dream-title">
      <div className="dream-head">
        <div>
          <h2 id="dream-title">💭 꿈 해몽 → 로또 추천</h2>
          <p className="muted-sm">
            꿈 내용을 입력하면 중요 단어를 뽑아 비슷한 꿈 단어와 연결된 로또 번호를 찾아드립니다.
            기본은 자동 추천이며, 원하시면 결과에서 "직접 골라보기" 로 세부 매칭을 고를 수 있습니다.
          </p>
          <DreamHowItWorks />
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
              disabled={analyzing || generating || !text.trim()}
            >
              {analyzing ? (<><span className="spinner" /> 분석 중...</>)
                : generating ? (<><span className="spinner" /> 번호 생성 중...</>)
                : '🔮 꿈 해몽 → 번호 추천'}
            </button>
          </div>
        </div>
      </div>

      {error && <div className="alert error" role="alert">⚠ {error}</div>}

      {mode === 'auto' && analyzed && analyzed.words.length > 0 && tiers && (
        <div className="dream-auto-summary">
          <div className="dream-auto-chips">
            <span className="muted-sm">해몽된 키워드</span>
            {analyzed.words.map((w) => (
              <span key={w.dream_word} className="dream-keyword">🔑 {w.dream_word}</span>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-text"
            onClick={switchToManual}
          >
            🔧 직접 골라보기
          </button>
        </div>
      )}

      {mode === 'manual' && analyzed && analyzed.words.length > 0 && (
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
              <button className="btn btn-text" onClick={backToAuto}>
                🔙 자동 추천으로
              </button>
            </div>
          </div>

          <div className="dream-word-list">
            {analyzed.words.map((w, wi) => {
              const topIdx = topMatchIndex(w.results);
              const isExpanded = expandedWords.has(wi);
              const visible = isExpanded
                ? w.results.map((r, i) => ({ r, i }))
                : [{ r: w.results[topIdx], i: topIdx }];
              const hiddenCount = w.results.length - 1;
              return (
                <div key={w.dream_word + wi} className="dream-word-block">
                  <div className="dream-word-title">
                    <span className="dream-keyword">🔑 {w.dream_word}</span>
                    <span className="muted-sm">{w.results.length}개 매칭</span>
                  </div>
                  <div className="dream-match-grid">
                    {visible.map(({ r, i: ri }) => {
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
                  {hiddenCount > 0 && (
                    <button
                      type="button"
                      className="btn btn-text dream-more-btn"
                      onClick={() => toggleExpanded(wi)}
                      aria-expanded={isExpanded}
                    >
                      {isExpanded ? '▴ 접기' : `▾ 더보기 (${hiddenCount}개)`}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="dream-generate-bar">
            <button
              className="btn btn-primary btn-lg"
              onClick={handleGenerate}
              disabled={generating || selectedPayload.length === 0}
            >
              {generating ? (<><span className="spinner" /> 생성 중...</>) : '🎱 번호 생성'}
            </button>
            <span className="muted-sm">추천 대상에서 고유한 10 개 조합을 만듭니다. 대상이 6 개 이하면 자동으로 번호가 추천됩니다.</span>
          </div>
        </div>
      )}

      {toast && <div className="result-toast">{toast}</div>}

      {tiers && (
        <>
          <ResultActions
            onRerun={reset}
            onCopy={handleCopyTiers}
            onSaveImage={handleSaveImage}
            rerunLabel="🔄 다시 분석"
            position="top"
          />
          <div ref={captureRef} className="predict-capture">
            <TierResults tiers={tiers} />
          </div>
          <ResultActions
            onRerun={reset}
            onCopy={handleCopyTiers}
            onSaveImage={handleSaveImage}
            rerunLabel="🔄 다시 분석"
            position="bottom"
          />
        </>
      )}

      <p className="predict-disclaimer">
        ⚠ 꿈 단어–번호 매핑은 전통적 해몽 자료 기반이며 실제 당첨 확률과 무관합니다.
      </p>
    </section>
  );
}

function DreamHowItWorks() {
  return (
    <details className="how-it-works">
      <summary>🤔 어떻게 추천하나요? <span className="how-hint">(꿈해몽)</span></summary>
      <div className="how-body">
        <p className="how-intro">
          오래된 <b>꿈해몽 사전</b>에는 단어마다 "이런 꿈을 꾸면 이런 숫자가 좋다"는
          전통적 해몽 데이터가 있습니다. 해몽 데이터를 AI 가 분석하여
          여러분의 꿈 문장과 가장 비슷한 단어를 찾아드립니다.
        </p>

        <div className="how-steps">
          <div className="how-step">
            <div className="how-step-num">1</div>
            <div className="how-step-body">
              <div className="how-step-title">✂️ 꿈 분석 · 중요 단어 추출</div>
              <p>
                입력한 꿈 문장을 분석하여 의미 있는
                <b> 중요 단어</b>만 추출합니다.
                예) "호랑이가 물고기를 물었다" → <b>호랑이, 물고기</b>
              </p>
            </div>
          </div>

          <div className="how-step">
            <div className="how-step-num">2</div>
            <div className="how-step-body">
              <div className="how-step-title">🧠 꿈해몽 사전 검색</div>
              <p>
                4,800여 개의 꿈 단어를 <b>AI 가 읽을 수 있는 데이터 형태</b>로
                변환해 두었습니다. AI 가 꿈의 중요 단어와 일치하거나
                의미가 유사한 단어를 찾아냅니다.
                신뢰도는 별점으로 표시해요: <b>⭐⭐⭐ 딱 맞아요 / ⭐⭐ 관련 있어요 / ⭐ 비슷한 느낌</b>.
              </p>
            </div>
          </div>

          <div className="how-step">
            <div className="how-step-num">3</div>
            <div className="how-step-body">
              <div className="how-step-title">🔢 연관 번호 추출</div>
              <p>
                꿈해몽 사전의 각 단어에는 전통적으로 연결된
                <b> 로또 번호(1~45)</b>가 매핑되어 있습니다.
                매칭된 단어들에서 번호를 모아 <b>추천 대상</b>을 선정합니다.
                추천 대상이 6 개 이하면 자동으로 번호가 추천됩니다.
              </p>
            </div>
          </div>

          <div className="how-step">
            <div className="how-step-num">4</div>
            <div className="how-step-body">
              <div className="how-step-title">🎱 3단계 조합 생성</div>
              <p>
                사용자가 선택한 단어의 추천 대상 번호에서
                <b> 6 개 조합을 10 세트</b> 만듭니다.
              </p>
              <div className="how-facts">
                <span className="how-fact">🎯 꿈에 충실형 · ⭐⭐⭐ 만</span>
                <span className="how-fact">⚖️ 균형형 · ⭐⭐⭐ + ⭐⭐</span>
                <span className="how-fact">🎲 확장형 · 전체 대상</span>
              </div>
              <p>
                추천 대상이 6 개 이하면 자동으로 번호가 추천됩니다.
              </p>
            </div>
          </div>
        </div>
      </div>
    </details>
  );
}

function buildDreamCopyText(query, tiers) {
  const lines = [
    `💭 꿈 해몽 로또 추천 결과`,
    `꿈: ${query || '-'}`,
    '',
  ];
  const meta = TIER_META.map(({ key, label }) => [label, tiers[key]]);
  meta.forEach(([label, t]) => {
    if (!t) {
      lines.push(`${label}: (추천 대상 없음)`);
      return;
    }
    lines.push(`${label} (추천 대상 ${t.pool_size}개)`);
    t.combos.forEach((combo, i) => {
      const nums = combo.map((n) => String(n).padStart(2, '0')).join('  ');
      lines.push(`  ${i + 1}. ${nums}`);
    });
    lines.push('');
  });
  return lines.join('\n');
}

function keyOf(wi, ri) {
  return `${wi}:${ri}`;
}

function topMatchIndex(results) {
  let best = 0;
  let bestScore = -1;
  results.forEach((r, i) => {
    if (r.score > bestScore) {
      bestScore = r.score;
      best = i;
    }
  });
  return best;
}

function importanceLabel(n) {
  if (n >= 5) return '강력';
  if (n >= 3) return '매우';
  if (n >= 1) return '추천';
  return '일반';
}

function TierResults({ tiers }) {
  return (
    <div className="tier-results">
      <h3>🎯 추천 번호 세트</h3>
      {TIER_META.map(({ key, label, color }) => {
        const t = tiers[key];
        if (!t) return (
          <div key={key} className="tier-empty">
            <span className={`dream-gubun ${color}`}>{label}</span>
            <span className="muted-sm">추천 대상이 없습니다</span>
          </div>
        );
        return (
          <div key={key} className="tier-block">
            <div className="tier-head">
              <span className={`dream-gubun ${color}`}>{label}</span>
              <span className="muted-sm">
                추천 대상 {t.pool_size}개 · 조합 {t.combos.length}개
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
