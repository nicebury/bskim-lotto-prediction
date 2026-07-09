import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import LottoBall from './LottoBall.jsx';

function formatDate(iso) {
  if (!iso) return '-';
  return iso.slice(0, 10);
}

function formatWon(n) {
  if (n === null || n === undefined) return null;
  if (n >= 1_0000_0000) {
    const eok = n / 1_0000_0000;
    return `${eok.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}억`;
  }
  if (n >= 10_000) {
    return `${Math.round(n / 10_000).toLocaleString('ko-KR')}만원`;
  }
  return `${n.toLocaleString('ko-KR')}원`;
}

function formatCount(n) {
  if (n === null || n === undefined) return null;
  return `${n.toLocaleString('ko-KR')}명`;
}

const PAGE_SIZES = [10, 20, 50, 100];

export default function ResultsBrowser() {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [data, setData] = useState({ total: 0, items: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [searchInput, setSearchInput] = useState('');
  const [searchedRound, setSearchedRound] = useState(null); // null = 목록 모드

  const tableTopRef = useRef(null);

  // SEO: 검색 시에만 동적 타이틀 업데이트 (펼치지 않은 상태에선 기본 유지)
  useEffect(() => {
    const baseTitle = '로또 당첨번호 조회 · 6/45 회차별 통계 대시보드';
    if (open && searchedRound !== null) {
      document.title = `로또 ${searchedRound}회 당첨번호 | 6/45 회차 조회`;
      return () => { document.title = baseTitle; };
    }
  }, [open, searchedRound]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(data.total / pageSize)),
    [data.total, pageSize]
  );

  const loadPage = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.results(page, pageSize);
      setData(res);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize]);

  useEffect(() => {
    if (open && searchedRound === null) loadPage();
  }, [open, loadPage, searchedRound]);

  const handleSearch = async (e) => {
    e?.preventDefault?.();
    const round = parseInt(searchInput, 10);
    if (!round || round < 1) {
      setError('유효한 회차 번호를 입력해 주세요.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const item = await api.resultByRound(round);
      setData({ total: 1, items: [item] });
      setSearchedRound(round);
    } catch (e) {
      setError(e.message);
      setData({ total: 0, items: [] });
      setSearchedRound(round);
    } finally {
      setLoading(false);
    }
  };

  const clearSearch = () => {
    setSearchInput('');
    setSearchedRound(null);
    setError(null);
    setPage(1);
  };

  const gotoPage = (p) => {
    const next = Math.min(totalPages, Math.max(1, p));
    setPage(next);
    tableTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const onPageSizeChange = (size) => {
    setPageSize(size);
    setPage(1);
  };

  const items = data.items ?? [];
  const panelId = 'results-browser-panel';

  return (
    <section
      className={`table-section browser-card${open ? ' open' : ''}`}
      ref={tableTopRef}
      aria-labelledby="results-browser-title"
    >
      <button
        type="button"
        className="browser-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
      >
        <span className="browser-toggle-icon" aria-hidden>📋</span>
        <span className="browser-toggle-text">
          <h2 id="results-browser-title" className="browser-toggle-title">전체 회차 조회</h2>
          <span className="browser-toggle-sub">
            1 회부터 최신 회차까지 · 회차 번호로 바로 검색
          </span>
        </span>
        <span className="browser-toggle-chevron" aria-hidden>{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div id={panelId} className="browser-body">
      <div className="table-head browser-head">
        <div className="browser-title">
          {searchedRound === null ? (
            <span className="count">
              총 {data.total.toLocaleString('ko-KR')}건 · {page}/{totalPages}페이지
            </span>
          ) : (
            <span className="count">🔍 {searchedRound}회 검색 결과</span>
          )}
        </div>

        <form className="browser-search" onSubmit={handleSearch}>
          <input
            type="number"
            inputMode="numeric"
            min="1"
            className="search-input"
            placeholder="회차 번호로 검색 (예: 1170)"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <button type="submit" className="btn btn-ghost">검색</button>
          {searchedRound !== null && (
            <button type="button" className="btn btn-text" onClick={clearSearch}>
              ✕ 초기화
            </button>
          )}
          <select
            className="page-size"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            disabled={searchedRound !== null}
            aria-label="페이지당 행 수"
          >
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>{s}개씩</option>
            ))}
          </select>
        </form>
      </div>

      {error && <div className="alert error" role="alert">⚠ {error}</div>}

      {/* 데스크탑: 테이블 */}
      <div className="table-scroll table-desktop">
        <table className="results-table">
          <thead>
            <tr>
              <th>회차</th>
              <th>추첨일</th>
              <th>당첨번호</th>
              <th>보너스</th>
              <th className="num">1등 당첨금</th>
              <th className="num">1등 당첨자</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <SkeletonRows count={Math.min(5, pageSize)} />
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty">
                  {searchedRound !== null
                    ? `${searchedRound}회차 데이터를 찾을 수 없습니다.`
                    : '데이터가 없습니다.'}
                </td>
              </tr>
            ) : (
              items.map((r) => (
                <tr key={r.round_no}>
                  <td className="round">
                    <Link
                      to={`/round/${r.round_no}`}
                      className="round-link"
                      aria-label={`${r.round_no}회차 상세 페이지로 이동`}
                    >
                      {r.round_no}
                    </Link>
                  </td>
                  <td>
                    <time dateTime={r.draw_date}>{formatDate(r.draw_date)}</time>
                  </td>
                  <td>
                    <div className="balls" aria-label={`당첨번호 ${r.numbers.join(', ')}`}>
                      {r.numbers.map((n) => (
                        <LottoBall key={n} number={n} />
                      ))}
                    </div>
                  </td>
                  <td><LottoBall number={r.bonus} bonus /></td>
                  <td className="num">{formatWon(r.first_win_amount) ?? '-'}</td>
                  <td className="num">{formatCount(r.first_winner_count) ?? '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 모바일: 카드 */}
      <div className="result-cards table-mobile" role="list">
        {loading ? (
          <CardSkeletons count={Math.min(4, pageSize)} />
        ) : items.length === 0 ? (
          <div className="empty">
            {searchedRound !== null
              ? `${searchedRound}회차 데이터를 찾을 수 없습니다.`
              : '데이터가 없습니다.'}
          </div>
        ) : (
          items.map((r) => <ResultCard key={r.round_no} item={r} />)
        )}
      </div>

      {searchedRound === null && totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          onChange={gotoPage}
        />
      )}
        </div>
      )}
    </section>
  );
}

function Pagination({ page, totalPages, onChange }) {
  const pages = buildPageWindow(page, totalPages);
  return (
    <nav className="pagination" aria-label="페이지 네비게이션">
      <button
        className="pg-btn"
        onClick={() => onChange(1)}
        disabled={page === 1}
        aria-label="첫 페이지"
      >«</button>
      <button
        className="pg-btn"
        onClick={() => onChange(page - 1)}
        disabled={page === 1}
        aria-label="이전 페이지"
      >‹</button>
      {pages.map((p, i) =>
        p === '…' ? (
          <span key={`e${i}`} className="pg-ellipsis">…</span>
        ) : (
          <button
            key={p}
            className={`pg-btn${p === page ? ' active' : ''}`}
            onClick={() => onChange(p)}
            aria-current={p === page ? 'page' : undefined}
          >
            {p}
          </button>
        )
      )}
      <button
        className="pg-btn"
        onClick={() => onChange(page + 1)}
        disabled={page === totalPages}
        aria-label="다음 페이지"
      >›</button>
      <button
        className="pg-btn"
        onClick={() => onChange(totalPages)}
        disabled={page === totalPages}
        aria-label="마지막 페이지"
      >»</button>
    </nav>
  );
}

function buildPageWindow(current, total, radius = 2) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out = new Set([1, total, current]);
  for (let i = 1; i <= radius; i++) {
    out.add(current - i);
    out.add(current + i);
  }
  const sorted = [...out].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const result = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push('…');
    result.push(sorted[i]);
  }
  return result;
}

function SkeletonRows({ count }) {
  return Array.from({ length: count }).map((_, i) => (
    <tr key={i}>
      {Array.from({ length: 6 }).map((__, j) => (
        <td key={j}><span className="skeleton">------</span></td>
      ))}
    </tr>
  ));
}

function CardSkeletons({ count }) {
  return Array.from({ length: count }).map((_, i) => (
    <div key={i} className="result-card">
      <span className="skeleton">------</span>
    </div>
  ));
}

function ResultCard({ item }) {
  const winAmt = formatWon(item.first_win_amount);
  const winners = formatCount(item.first_winner_count);
  return (
    <article className="result-card" role="listitem">
      <header className="result-card-head">
        <Link
          to={`/round/${item.round_no}`}
          className="result-card-round round-link"
          aria-label={`${item.round_no}회차 상세 페이지로 이동`}
        >
          {item.round_no}회
        </Link>
        <time className="result-card-date" dateTime={item.draw_date}>
          {formatDate(item.draw_date)}
        </time>
      </header>

      <div className="result-card-balls" aria-label={`당첨번호 ${item.numbers.join(', ')}, 보너스 ${item.bonus}`}>
        {item.numbers.map((n) => (
          <LottoBall key={n} number={n} />
        ))}
        <span className="result-card-plus" aria-hidden>+</span>
        <LottoBall number={item.bonus} bonus />
      </div>

      {(winAmt || winners) && (
        <dl className="result-card-prize">
          {winAmt && (
            <div>
              <dt>1등 당첨금</dt>
              <dd>{winAmt}</dd>
            </div>
          )}
          {winners && (
            <div>
              <dt>1등 당첨자</dt>
              <dd>{winners}</dd>
            </div>
          )}
        </dl>
      )}
    </article>
  );
}
