import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import ResultsBrowser from './ResultsBrowser.jsx';
import PredictionPanel from './PredictionPanel.jsx';
import AltStrategies from './AltStrategies.jsx';
import DreamLottoPanel from './DreamLottoPanel.jsx';

const RECO_MODES = [
  {
    id: 'predict',
    icon: '🎯',
    title: '로또 번호 예측',
    description: '역대 당첨 데이터 AI 분석 알고리즘 + 몬테카를로 시뮬레이션으로 번호를 예측',
    cta: '어떻게 예측하나요?',
  },
  {
    id: 'dream',
    icon: '🌙',
    title: '꿈으로 로또 추천',
    description: '내가 꿈꾼 내용을 입력하면 꿈을 분석하여 로또 번호를 추천',
    cta: '어떻게 추천하나요?',
  },
  {
    id: 'strategies',
    icon: '🎲',
    title: '5가지 추천전략',
    description: '이런 번호가 나오지 않을까? 5가지 번호 추천방식 제공',
    cta: '5가지 방식이란?',
  },
];

function formatDateTime(iso) {
  if (!iso) return '-';
  return iso.replace('T', ' ').slice(0, 19);
}

function formatNumber(n) {
  if (n === null || n === undefined) return '-';
  return n.toLocaleString('ko-KR');
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [recoMode, setRecoMode] = useState('predict');

  const loadDashboard = useCallback(async () => {
    try {
      const res = await api.dashboard();
      setData(res);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const summary = data?.summary;

  return (
    <main className="dashboard" itemScope itemType="https://schema.org/WebApplication">
      <meta itemProp="applicationCategory" content="UtilitiesApplication" />
      <meta itemProp="operatingSystem" content="Web" />

      <header className="header">
        <div className="brand">
          <div className="brand-logo" aria-hidden>🎱</div>
          <div>
            <h1 itemProp="name">로또 6/45 당첨번호 조회 대시보드</h1>
            <p itemProp="description">
              1회부터 최신 회차까지 당첨번호·1등 당첨금·당첨자 수를 한눈에
            </p>
          </div>
        </div>
      </header>

      <section className="cards">
        <SummaryCard
          icon="Σ"
          label="총 수집 회차"
          value={summary ? `${formatNumber(summary.total_count)}건` : null}
          loading={loading}
        />
        <SummaryCard
          icon="🏷"
          label="최신 회차"
          value={summary?.latest_round ? `${summary.latest_round}회` : '-'}
          hint={summary?.latest_draw_date ? `추첨일 ${summary.latest_draw_date}` : null}
          loading={loading}
        />
        <SummaryCard
          icon="⏱"
          label="최종 수집"
          value={formatDateTime(summary?.last_collected_at)}
          loading={loading}
        />
      </section>

      {error && <div className="alert error" role="alert">⚠ {error}</div>}

      <section className="reco-zone" aria-labelledby="reco-zone-title">
        <header className="reco-zone-head">
          <span className="reco-zone-eyebrow" aria-hidden>✨ RECOMMENDATION</span>
          <h2 id="reco-zone-title" className="reco-zone-title">
            이번 주 번호 추천
          </h2>
          <p className="reco-zone-sub">
            세 가지 추천 방식 중 원하는 스타일을 선택해 보세요. 역대 데이터 분석부터 꿈 해몽까지.
          </p>
        </header>

        <RecoModeSelector mode={recoMode} onSelect={setRecoMode} />

        <div
          className="reco-slot"
          id={`reco-panel-${recoMode}`}
          role="tabpanel"
          aria-live="polite"
        >
          {recoMode === 'predict' && <PredictionPanel />}
          {recoMode === 'dream' && <DreamLottoPanel />}
          {recoMode === 'strategies' && <AltStrategies />}
        </div>
      </section>

      <ResultsBrowser />

      <FaqSection />
    </main>
  );
}

function RecoModeSelector({ mode, onSelect }) {
  return (
    <section className="reco-modes" role="tablist" aria-label="번호 추천 방식 선택">
      {RECO_MODES.map((m) => {
        const active = m.id === mode;
        return (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={`reco-panel-${m.id}`}
            className={`reco-mode${active ? ' active' : ''}`}
            onClick={() => onSelect(m.id)}
          >
            <div className="reco-mode-icon" aria-hidden>{m.icon}</div>
            <h3 className="reco-mode-title">{m.title}</h3>
            <p className="reco-mode-desc">{m.description}</p>
            <span className="reco-mode-cta">{m.cta}</span>
          </button>
        );
      })}
    </section>
  );
}

function SummaryCard({ icon, label, value, hint, loading }) {
  return (
    <div className="card">
      <div className="card-head">
        <span className="card-icon" aria-hidden>{icon}</span>
        <span>{label}</span>
      </div>
      <div className={`card-value${loading ? ' skeleton' : ''}`}>
        {loading ? '000,000건' : (value ?? '-')}
      </div>
      {hint && <div className="card-hint">{hint}</div>}
    </div>
  );
}

const FAQS = [
  {
    q: '로또 6/45 당첨번호는 어디에서 추첨되나요?',
    a: '매주 토요일 오후 8시 35분 MBC 생방송으로 추첨되며, 공식 결과는 동행복권(dhlottery.co.kr)에서 확인할 수 있습니다.',
  },
  {
    q: '이 대시보드의 데이터는 어디서 가져오나요?',
    a: '역대 1~1204회차는 GitHub 공개 데이터셋(happylie/lotto_data)에서, 이후 최신 회차는 네이버 검색 위젯에서 주 1~2회 증분 수집합니다.',
  },
  {
    q: '회차별 당첨번호를 어떻게 검색하나요?',
    a: '페이지의 "전체 회차 조회" 섹션에서 원하는 회차 번호(예: 1170)를 입력하면 해당 회차의 당첨번호와 1등 당첨금을 즉시 확인할 수 있습니다.',
  },
  {
    q: '1등 당첨금과 당첨자 수는 어떤 기준인가요?',
    a: '1등 당첨금은 해당 회차 1등 당첨자 1인당 지급된 실수령 전 금액이며, 당첨자 수는 1등 복권을 보유한 전체 인원수입니다.',
  },
];

function FaqSection() {
  return (
    <section className="faq" aria-labelledby="faq-title">
      <h2 id="faq-title">자주 묻는 질문</h2>
      <dl className="faq-list">
        {FAQS.map(({ q, a }) => (
          <details key={q} className="faq-item">
            <summary className="faq-q">{q}</summary>
            <dd className="faq-a">{a}</dd>
          </details>
        ))}
      </dl>
    </section>
  );
}
