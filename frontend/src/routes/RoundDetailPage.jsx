import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import LottoBall from '../components/LottoBall.jsx';

function formatDate(iso) {
  if (!iso) return '-';
  return iso.slice(0, 10);
}

function formatWon(n) {
  if (n === null || n === undefined) return '-';
  if (n >= 1_0000_0000) {
    const eok = n / 1_0000_0000;
    return `${eok.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}억원`;
  }
  if (n >= 10_000) {
    return `${Math.round(n / 10_000).toLocaleString('ko-KR')}만원`;
  }
  return `${n.toLocaleString('ko-KR')}원`;
}

export default function RoundDetailPage() {
  const { roundNo } = useParams();
  const parsed = Number(roundNo);
  const isValid = Number.isInteger(parsed) && parsed >= 1;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!isValid) {
      setError('회차 번호가 올바르지 않습니다.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.resultByRound(parsed);
      setData(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [isValid, parsed]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (data) {
      document.title = `로또 ${data.round_no}회 당첨번호 (${data.draw_date}) | 6/45 회차 조회`;
    } else if (isValid) {
      document.title = `로또 ${parsed}회 당첨번호 | 6/45 회차 조회`;
    }
    return () => {
      document.title = '로또 당첨번호 조회 · 6/45 회차별 통계 대시보드';
    };
  }, [data, isValid, parsed]);

  return (
    <main className="round-detail" itemScope itemType="https://schema.org/Article">
      <nav aria-label="이동 경로" className="breadcrumb">
        <Link to="/">홈</Link> <span aria-hidden>›</span>{' '}
        <span aria-current="page">{isValid ? `${parsed}회 당첨번호` : '회차 상세'}</span>
      </nav>

      <header className="round-detail-head">
        <h1 itemProp="headline">
          {isValid ? `로또 6/45 ${parsed}회 당첨번호` : '로또 회차 상세'}
        </h1>
        {data?.draw_date && (
          <p className="muted-sm">
            추첨일 <time dateTime={data.draw_date} itemProp="datePublished">
              {formatDate(data.draw_date)}
            </time>
          </p>
        )}
      </header>

      {loading && <div className="alert">데이터 불러오는 중...</div>}
      {error && !loading && (
        <div className="alert error" role="alert">
          ⚠ {error}
          <div style={{ marginTop: 10 }}>
            <Link to="/" className="btn btn-text">← 메인으로 돌아가기</Link>
          </div>
        </div>
      )}

      {data && !loading && (
        <>
          <section className="round-numbers" aria-label="당첨번호">
            <h2>당첨번호</h2>
            <div
              className="balls"
              aria-label={`당첨번호 ${data.numbers.join(', ')}, 보너스 ${data.bonus}`}
            >
              {data.numbers.map((n) => (
                <LottoBall key={n} number={n} />
              ))}
              <span className="ball-plus" aria-hidden>+</span>
              <LottoBall number={data.bonus} bonus />
              <span className="ball-bonus-label">보너스</span>
            </div>
          </section>

          <section className="round-prize" aria-label="1등 당첨 정보">
            <h2>1등 당첨 정보</h2>
            <dl className="round-prize-grid">
              <div>
                <dt>1등 당첨자 수</dt>
                <dd>{data.first_winner_count != null ? `${data.first_winner_count.toLocaleString('ko-KR')}명` : '-'}</dd>
              </div>
              <div>
                <dt>1인당 당첨금</dt>
                <dd>{formatWon(data.first_win_amount)}</dd>
              </div>
              <div>
                <dt>총 판매금액</dt>
                <dd>{data.total_sell_amount != null ? formatWon(data.total_sell_amount) : '-'}</dd>
              </div>
              <div>
                <dt>1등 누적 당첨금</dt>
                <dd>{data.first_accum_amount != null ? formatWon(data.first_accum_amount) : '-'}</dd>
              </div>
            </dl>
          </section>

          <section className="round-nav" aria-label="회차 이동">
            {parsed > 1 && (
              <Link to={`/round/${parsed - 1}`} className="btn btn-text">
                ← {parsed - 1}회
              </Link>
            )}
            <Link to="/" className="btn btn-text">전체 회차 보기</Link>
            <Link to={`/round/${parsed + 1}`} className="btn btn-text">
              {parsed + 1}회 →
            </Link>
          </section>

          <p className="predict-disclaimer" itemProp="disclaimer">
            ⚠ 실제 당첨 여부는 반드시{' '}
            <a href="https://dhlottery.co.kr" target="_blank" rel="noopener noreferrer">
              동행복권 공식 사이트
            </a>
            에서 확인해 주세요.
          </p>
        </>
      )}
    </main>
  );
}
