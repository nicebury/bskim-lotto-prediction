import { useEffect } from 'react';
import { Link } from 'react-router-dom';

const SITE_NAME = '로또 당첨번호 대시보드';
const CONTACT_EMAIL = 'soclabai0002@gmail.com';

export default function AboutPage() {
  useEffect(() => {
    document.title = `소개 | ${SITE_NAME}`;
    return () => {
      document.title = '로또 당첨번호 조회 · 6/45 회차별 통계 대시보드';
    };
  }, []);

  return (
    <main className="legal-page">
      <header className="legal-head">
        <h1>사이트 소개</h1>
        <p className="muted-sm">{SITE_NAME} 이 어떤 서비스인지 소개합니다.</p>
      </header>

      <section>
        <h2>무엇을 제공하나요?</h2>
        <p>
          본 사이트는 <b>동행복권 로또 6/45</b> 의 1회부터 최신 회차까지의 당첨번호,
          1등 당첨금, 1등 당첨자 수를 한 곳에서 조회할 수 있는 무료 대시보드입니다.
          추가로 역대 데이터 통계에 근거한 <b>번호 추천</b>, 전통 해몽 자료 기반의
          <b> 꿈 → 로또 번호</b> 추천 기능을 재미 목적으로 제공합니다.
        </p>
      </section>

      <section>
        <h2>데이터는 어디서 왔나요?</h2>
        <ul>
          <li>
            역대 1~1,204회차 데이터는 공개 GitHub 데이터셋{' '}
            <a
              href="https://github.com/happylie/lotto_data"
              target="_blank"
              rel="noopener noreferrer"
            >
              happylie/lotto_data
            </a>
            에서 일괄 적재했습니다.
          </li>
          <li>
            이후 최신 회차는 매주 토요일 추첨 직후 <b>네이버 검색 위젯</b>에서 증분 수집합니다.
          </li>
          <li>
            공식 결과는 반드시{' '}
            <a href="https://dhlottery.co.kr" target="_blank" rel="noopener noreferrer">
              동행복권(dhlottery.co.kr)
            </a>{' '}
            에서 확인해 주세요.
          </li>
        </ul>
      </section>

      <section>
        <h2>추천·예측은 어떻게 동작하나요?</h2>
        <ul>
          <li>
            역대 당첨번호의 빈도·지연·최근 N회차 가중치·홀짝/고저/연속 패턴을 분석하여
            4가지 알고리즘의 가중 합산 점수를 만들고, 몬테카를로 시뮬레이션으로
            번호 조합을 생성합니다.
          </li>
          <li>
            꿈 해몽 기능은 이용자의 꿈 문장을 형태소 분석(kiwipiepy)한 뒤,
            4,800여 개의 전통 해몽 단어가 담긴 벡터 DB(ChromaDB) 에서 의미가 비슷한
            단어를 찾고, 각 단어에 연결된 번호 풀로 조합을 만듭니다.
          </li>
          <li>
            <b>중요:</b> 본 서비스의 모든 추천 결과는 <b>재미 목적</b>이며 실제 당첨을
            보장하지 않습니다. 자세한 내용은{' '}
            <Link to="/terms">이용약관</Link>을 참고해 주세요.
          </li>
        </ul>
      </section>

      <section>
        <h2>기술 스택</h2>
        <ul>
          <li>Backend — FastAPI, aiosqlite, httpx, numpy, kiwipiepy, sentence-transformers, chromadb</li>
          <li>Frontend — Vite, React 18, react-router-dom</li>
          <li>데이터 저장소 — SQLite (로또 당첨번호), ChromaDB (꿈해몽 단어 벡터)</li>
        </ul>
      </section>

      <section>
        <h2>운영자 정보</h2>
        <ul>
          <li>운영자: bskim</li>
          <li>이메일 문의: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></li>
          <li>관련 문서: <Link to="/privacy">개인정보처리방침</Link> · <Link to="/terms">이용약관</Link></li>
        </ul>
      </section>
    </main>
  );
}
