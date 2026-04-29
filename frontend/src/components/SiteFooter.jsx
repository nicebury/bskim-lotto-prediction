import { Link } from 'react-router-dom';

export default function SiteFooter() {
  return (
    <footer className="site-footer" role="contentinfo">
      <nav className="site-footer-nav" aria-label="사이트 정책">
        <Link to="/about">사이트 소개</Link>
        <span aria-hidden>·</span>
        <Link to="/privacy">개인정보처리방침</Link>
        <span aria-hidden>·</span>
        <Link to="/terms">이용약관</Link>
      </nav>
      <div className="site-footer-meta">
        데이터: GitHub <code>happylie/lotto_data</code> 덤프 + 네이버 검색 위젯 증분
      </div>
      <div className="site-footer-disclaimer">
        본 사이트의 번호 추천은 재미 목적이며, 실제 당첨 확률을 높이지 않습니다.
        공식 결과는{' '}
        <a href="https://dhlottery.co.kr" target="_blank" rel="noopener noreferrer">
          동행복권
        </a>
        에서 확인하세요.
      </div>
    </footer>
  );
}
