import { useMemo, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { api } from '../api.js';
import LottoBall from './LottoBall.jsx';
import { ResultActions } from './PredictionPanel.jsx';

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
  const [toast, setToast] = useState(null);
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
          전통적 해몽 데이터가 있습니다. 이걸 AI 임베딩(벡터)으로 바꿔
          여러분의 꿈 문장과 가장 비슷한 단어를 찾아줍니다.
        </p>

        <div className="how-steps">
          <div className="how-step">
            <div className="how-step-num">1</div>
            <div className="how-step-body">
              <div className="how-step-title">✂️ 형태소 분석</div>
              <p>
                입력한 꿈 문장을 <b>kiwipiepy</b> 로 쪼개서 명사·동사 등
                의미 있는 키워드만 추립니다.
                예) "호랑이가 물고기를 물었다" → <b>호랑이, 물고기</b>
              </p>
            </div>
          </div>

          <div className="how-step">
            <div className="how-step-num">2</div>
            <div className="how-step-body">
              <div className="how-step-title">🧠 꿈해몽 사전 검색</div>
              <p>
                4,800여 개의 꿈 단어가 담긴 <b>ChromaDB 벡터 DB</b> 에서
                각 키워드와 의미가 가장 비슷한 단어를 찾습니다.
                단어별로 <b>정확일치 / 포함 / 유사</b> 3단계로 분류해요.
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
                매칭된 단어들에서 번호를 모아 <b>풀(pool)</b> 을 만듭니다.
              </p>
            </div>
          </div>

          <div className="how-step">
            <div className="how-step-num">4</div>
            <div className="how-step-body">
              <div className="how-step-title">🎱 3단계 조합 생성</div>
              <p>
                사용자가 선택한 단어의 번호 풀에서 <b>6개 조합을 10세트</b> 만듭니다.
              </p>
              <div className="how-facts">
                <span className="how-fact">세트1 · 정확일치만</span>
                <span className="how-fact">세트2 · 정확 + 포함</span>
                <span className="how-fact">세트3 · 전체 풀</span>
              </div>
              <p>
                풀이 6개 미만이면 부족분은 랜덤으로 채웁니다.
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
  const meta = [
    ['세트 1 · 정확일치 전용', tiers.tier1],
    ['세트 2 · 정확 + 포함',  tiers.tier2],
    ['세트 3 · 전체 풀',      tiers.tier3],
  ];
  meta.forEach(([label, t]) => {
    if (!t) {
      lines.push(`${label}: (해당 풀 없음)`);
      return;
    }
    lines.push(`${label} (풀 ${t.pool_size}개)`);
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
