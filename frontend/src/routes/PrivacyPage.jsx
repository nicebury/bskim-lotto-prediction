import { useEffect } from 'react';

const SITE_NAME = '로또 당첨번호 대시보드';
const CONTACT_EMAIL = 'soclabai0002@gmail.com';
const LAST_UPDATED = '2026-04-20';

export default function PrivacyPage() {
  useEffect(() => {
    document.title = `개인정보처리방침 | ${SITE_NAME}`;
    return () => {
      document.title = '로또 당첨번호 조회 · 6/45 회차별 통계 대시보드';
    };
  }, []);

  return (
    <main className="legal-page">
      <header className="legal-head">
        <h1>개인정보처리방침</h1>
        <p className="muted-sm">최종 수정일: {LAST_UPDATED}</p>
      </header>

      <section>
        <h2>1. 총칙</h2>
        <p>
          {SITE_NAME}(이하 "본 사이트")은 이용자의 개인정보를 중요하게 생각하며,
          「개인정보 보호법」 및 관련 법령을 준수합니다. 본 방침은 본 사이트가
          어떤 정보를 수집하고 어떻게 사용하는지 설명합니다.
        </p>
      </section>

      <section>
        <h2>2. 수집하는 정보</h2>
        <p>본 사이트는 회원가입·로그인 기능이 없으며, 이름·전화번호 등의 개인식별정보를 직접 수집하지 않습니다. 다만 서비스 운영 과정에서 아래 정보가 자동으로 수집될 수 있습니다.</p>
        <ul>
          <li>접속 로그 (IP 주소, 접속 시각, 참조 URL, 브라우저 정보)</li>
          <li>쿠키 및 유사 기술로 저장되는 식별자 (광고·분석 목적)</li>
          <li>이용자가 꿈 해몽 기능에 입력한 텍스트 — 분석을 위해 서버로 전송되며 응답 생성 후 즉시 폐기됩니다(별도 저장 안 함)</li>
        </ul>
      </section>

      <section>
        <h2>3. 이용 목적</h2>
        <ul>
          <li>로또 당첨번호 조회·통계·추천 서비스 제공</li>
          <li>서비스 개선을 위한 사용 패턴 분석</li>
          <li>부정 접근·악성 봇 방지 등 보안 유지</li>
          <li>광고 게재 (Google AdSense 등 제3자 광고 서비스 이용 시)</li>
        </ul>
      </section>

      <section>
        <h2>4. 쿠키 및 제3자 광고</h2>
        <p>
          본 사이트는 Google AdSense 등 제3자 광고 서비스를 활용할 수 있습니다.
          Google 을 포함한 제3자 공급업체는 쿠키를 사용하여 이용자의 이전 방문 기록을
          기반으로 광고를 게재합니다.
        </p>
        <ul>
          <li>
            Google 의 광고 쿠키 사용은{' '}
            <a
              href="https://policies.google.com/technologies/ads"
              target="_blank"
              rel="noopener noreferrer"
            >
              Google 광고 및 쿠키 정책
            </a>
            에 따릅니다.
          </li>
          <li>
            이용자는{' '}
            <a
              href="https://adssettings.google.com/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Google 광고 설정
            </a>{' '}
            페이지에서 맞춤 광고를 해제할 수 있습니다.
          </li>
          <li>
            브라우저 설정에서 쿠키를 거부할 수 있으나, 이 경우 일부 기능이 정상 동작하지 않을 수 있습니다.
          </li>
        </ul>
      </section>

      <section>
        <h2>5. 데이터 보관 및 파기</h2>
        <p>
          접속 로그는 보안 및 통계 목적으로 최대 90일 보관 후 자동 파기되며,
          꿈 해몽 입력 텍스트는 별도 저장되지 않습니다. 본 사이트가 데이터베이스에
          저장하는 정보는 공개된 로또 당첨번호 데이터뿐입니다.
        </p>
      </section>

      <section>
        <h2>6. 이용자의 권리</h2>
        <p>
          이용자는 본 사이트에 개인식별정보를 제공하지 않으므로 별도의 열람/정정/삭제 요구는
          발생하지 않습니다. 다만 광고 쿠키 관련 문의나 개인정보 관련 의견이 있으시면
          아래 연락처로 요청해 주시기 바랍니다.
        </p>
      </section>

      <section>
        <h2>7. 책임자 및 연락처</h2>
        <ul>
          <li>운영자: bskim</li>
          <li>이메일: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></li>
        </ul>
      </section>

      <section>
        <h2>8. 개정 이력</h2>
        <p>본 방침은 서비스 정책 변경에 따라 사전 고지 후 개정될 수 있으며, 본 페이지 상단에 최종 수정일을 표기합니다.</p>
      </section>
    </main>
  );
}
