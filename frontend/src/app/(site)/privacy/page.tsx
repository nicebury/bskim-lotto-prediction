import Link from "next/link";
import type { Metadata } from "next";

import { Breadcrumb } from "@/components/Breadcrumb";
import { CONTACT_EMAIL, SITE_NAME } from "@/lib/env";

export const metadata: Metadata = {
  title: "개인정보처리방침",
  description: `${SITE_NAME}의 개인정보 수집 항목, 이용 목적, 보유 기간, 쿠키와 광고 사업자의 쿠키 사용에 대해 안내합니다.`,
  alternates: { canonical: "/privacy" },
};

/**
 * 개인정보처리방침. 애드센스 필수 정책 페이지 4종 중 하나다.
 *
 * 로그인이 없어도 서버 로그·쿠키·광고 식별자·애널리틱스 때문에 안내가 필요하다.
 * **Google AdSense 및 제3자 광고 사업자의 쿠키 사용 가능성**을 반드시 명시한다.
 * → docs/wiki/30-seo/adsense-readiness.md
 */
export default function PrivacyPage() {
  return (
    <div className="container">
      <Breadcrumb
        items={[
          { name: "홈", href: "/" },
          { name: "개인정보처리방침", href: "/privacy" },
        ]}
      />

      <article className="section prose">
        <h1>개인정보처리방침</h1>
        <p>
          {SITE_NAME}(이하 &ldquo;본 사이트&rdquo;)은 이용자의 개인정보를 소중히
          다루며, 관련 법령을 준수합니다. 본 방침은 본 사이트가 어떤 정보를
          수집하고 어떻게 이용하는지를 설명합니다.
        </p>

        <h2>1. 회원가입과 로그인</h2>
        <p>
          본 사이트는{" "}
          <strong>회원가입과 로그인 기능을 제공하지 않습니다.</strong> 따라서
          이름, 전화번호, 이메일 주소 등 이용자를 직접 식별할 수 있는 정보를
          수집하거나 서버에 저장하지 않습니다.
        </p>

        <h2>2. 자동으로 수집되는 정보</h2>
        <p>
          서비스 이용 과정에서 다음 정보가 자동으로 생성되어 수집될 수 있습니다.
        </p>
        <ul>
          <li>접속 IP 주소, 접속 일시, 서비스 이용 기록</li>
          <li>브라우저 종류와 버전, 운영체제, 화면 해상도</li>
          <li>방문 경로(유입 검색어, 참조 페이지)</li>
        </ul>
        <p>
          이 정보는 서비스 운영과 오류 분석, 이용 통계 파악을 위해 사용되며,
          특정 개인을 식별하는 목적으로 이용하지 않습니다.
        </p>

        <h2>3. 브라우저에 저장되는 정보</h2>
        <p>
          이용자가 선택한 화면 테마(라이트/다크) 설정은 이용자의 브라우저
          저장소(localStorage)에 보관됩니다. 이 값은 본 사이트 서버로 전송되지
          않으며, 이용자가 브라우저 데이터를 삭제하면 함께 사라집니다.
        </p>

        <h2>4. 쿠키의 사용</h2>
        <p>
          본 사이트는 이용 통계 분석과 광고 게재를 위해 쿠키를 사용할 수
          있습니다. 쿠키는 웹사이트가 이용자의 브라우저에 저장하는 작은 텍스트
          파일입니다.
        </p>
        <p>
          이용자는 브라우저 설정에서 쿠키 저장을 거부하거나 삭제할 수 있습니다.
          다만 쿠키를 거부할 경우 일부 기능이 정상적으로 동작하지 않을 수
          있습니다.
        </p>

        <h2>5. 광고와 제3자 쿠키</h2>
        <p>
          본 사이트는 Google AdSense를 비롯한 제3자 광고 사업자의 광고를 게재할
          수 있습니다. 이때 다음 사항이 적용됩니다.
        </p>
        <ul>
          <li>
            Google을 포함한 제3자 광고 사업자는 쿠키를 사용하여 이용자의 이전
            방문 기록을 바탕으로 광고를 게재할 수 있습니다.
          </li>
          <li>
            Google의 광고 쿠키 사용으로 Google과 그 파트너는 본 사이트 또는 다른
            사이트 방문 기록을 기반으로 이용자에게 광고를 표시할 수 있습니다.
          </li>
          <li>
            이용자는{" "}
            <a
              href="https://adssettings.google.com"
              target="_blank"
              rel="nofollow noopener noreferrer"
            >
              Google 광고 설정
            </a>
            에서 맞춤 광고를 해제할 수 있습니다.
          </li>
          <li>
            제3자 광고 사업자의 쿠키 사용을 해제하려면{" "}
            <a
              href="https://www.aboutads.info"
              target="_blank"
              rel="nofollow noopener noreferrer"
            >
              www.aboutads.info
            </a>
            를 참고하시기 바랍니다.
          </li>
        </ul>

        <h2>6. 분석 도구의 이용</h2>
        <p>
          본 사이트는 방문자 수와 유입 경로, 페이지별 체류 시간을 파악하기 위해
          Google Analytics 등 웹 분석 도구를 이용할 수 있습니다. 이들 도구는
          쿠키를 통해 익명화된 이용 정보를 수집하며, 수집된 정보는 서비스 개선
          목적으로만 사용됩니다.
        </p>

        {/*
          ⚠ 유튜브 임베드는 **제3자 데이터 수집이 실제로 일어나는 지점**이다. 실측으로
            확인했다 — `youtube-nocookie.com` 을 쓰는데도 Chrome 이 쿠키 이슈를 기록한다
            (Lighthouse 모범사례 `inspector-issues`). 영상을 걸었으면 방침에도 적어야 한다.
          ⚠ 절 번호는 **뒤가 밀린다.** 여기 하나를 끼우면 아래 번호를 전부 고쳐야 한다.
        */}
        <h2>7. 유튜브 영상의 재생</h2>
        <p>
          본 사이트의 영상 페이지는 YouTube 공식 임베드 플레이어를 이용합니다. 영상
          파일과 썸네일 이미지는 본 사이트에 저장되지 않으며, 재생은 YouTube가 담당합니다.
        </p>
        <p>
          영상이 포함된 페이지를 열거나 영상을 재생하면 YouTube(Google LLC)가 이용자의
          기기 정보와 시청 기록을 수집할 수 있습니다. 본 사이트는 추적을 줄이기 위해
          개인정보 보호가 강화된 도메인(youtube-nocookie.com)을 사용하고 자동 재생을
          사용하지 않으나, <strong>이용자가 영상을 재생하면 YouTube의 개인정보처리방침이
          함께 적용됩니다.</strong>
        </p>
        <p>
          자세한 내용은{" "}
          <a
            href="https://policies.google.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google 개인정보처리방침
          </a>
          을 참고하시기 바랍니다.
        </p>

        <h2>8. 개인정보의 보유와 파기</h2>
        <p>
          본 사이트는 이용자를 식별할 수 있는 개인정보를 별도로 수집·보관하지
          않습니다. 자동 수집되는 접속 기록은 서비스 운영과 통계 목적으로만
          이용되며, 관련 법령이 정한 기간이 지나면 파기됩니다.
        </p>

        <h2>9. 이용자의 권리</h2>
        <p>
          이용자는 언제든지 브라우저 설정을 통해 쿠키 저장을 거부하거나 이미
          저장된 쿠키와 로컬 저장소 데이터를 삭제할 수 있습니다. 맞춤 광고를
          원하지 않는 경우 위 5항의 방법으로 해제할 수 있습니다.
        </p>

        <h2>10. 아동의 개인정보</h2>
        <p>
          본 사이트는 만 19세 미만 이용자를 대상으로 하지 않으며, 복권 구매는
          법률에 따라 19세 미만에게 허용되지 않습니다.
        </p>

        <h2>11. 문의</h2>
        <p>
          개인정보 처리에 관한 문의는 아래 연락처로 보내 주시기 바랍니다.
          {CONTACT_EMAIL ? (
            <>
              {" "}
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
            </>
          ) : (
            <>
              {" "}
              연락처는 <Link href="/contact">문의 페이지</Link>에서 확인하실 수
              있습니다.
            </>
          )}
        </p>

        <h2>12. 방침의 변경</h2>
        <p>
          본 방침의 내용이 변경되는 경우 변경 사항을 본 페이지에 게시합니다.
          변경된 방침은 게시한 시점부터 적용됩니다.
        </p>
      </article>
    </div>
  );
}
