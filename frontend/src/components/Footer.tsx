import Link from "next/link";

import { GUIDES, NAV_ITEMS, POLICY_PAGES } from "@/lib/site";
import { LogoMark } from "./LogoMark";

/**
 * 푸터. 정책 페이지 4종으로 가는 링크가 여기 있다 — 애드센스 심사자가 가장 먼저 찾는
 * 곳이다(→ docs/wiki/30-seo/adsense-readiness.md).
 *
 * 링크 그룹은 데스크톱에서 다열, 모바일에서 세로 스택으로 접힌다.
 * 각 그룹의 제목은 <h2> 다 — 시각적으로 작지만 헤딩 계층을 비우지 않는다.
 */
export function Footer({ siteName }: { siteName: string }) {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand">
            <Link className="logo" href="/">
              <LogoMark />
              {siteName}
            </Link>
            <p>
              로또 당첨결과, 번호 통계, 복권 뉴스, 통계와 AI 기반 번호추천
              정보를 제공하는 복권 데이터 대시보드입니다.
            </p>
          </div>

          <nav className="footer-col" aria-labelledby="footer-service">
            <h2 id="footer-service">서비스</h2>
            <ul>
              {NAV_ITEMS.map((item) => (
                <li key={item.href}>
                  <Link href={item.href}>{item.label}</Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav className="footer-col" aria-labelledby="footer-guide">
            <h2 id="footer-guide">가이드</h2>
            <ul>
              {GUIDES.map((guide) => (
                <li key={guide.slug}>
                  <Link href={`/guide/${guide.slug}`}>{guide.title}</Link>
                </li>
              ))}
            </ul>
          </nav>

          {/*
            ⚠ `/sitemap.xml` 링크를 두지 않는다(2026-08-28에 뺐다).
              크롤러는 `robots.txt` 의 `Sitemap:` 지시자로 찾으므로 링크가 없어도 된다
              (→ app/robots.ts). 사람이 누르면 XML 원본이 뜰 뿐이라 얻는 것이 없다.
              사람용 사이트맵 역할은 이 푸터의 메뉴 목록 자체가 한다.
          */}
          <nav className="footer-col" aria-labelledby="footer-policy">
            <h2 id="footer-policy">정보</h2>
            <ul>
              {POLICY_PAGES.map((page) => (
                <li key={page.href}>
                  <Link href={page.href}>{page.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        {/*
          면책 고지는 푸터에도 상시 노출한다. 사용자가 어느 페이지에 있든 이 서비스가
          복권을 판매하지 않고 당첨을 보장하지 않는다는 사실을 볼 수 있어야 한다.
        */}
        {/*
          면책 문구를 의미 단위로 분할한다(002 R1~R4). 절제 원칙: 색은 한 곳(추천번호의 성격),
          볼드는 한 곳(당첨 미보장). 과하면 불안감을 준다. 19세 미만 안내는 별도 줄로 내린다.

          ⚠ 종전 문구는 "참고용·재미용 시뮬레이션" 이었다. 틀린 말은 아니지만 서비스가
            무엇을 하는지는 하나도 말하지 않아, 여기까지 읽은 사용자에게 "그래서 이걸 왜
            보나" 라는 인상을 남긴다(사용자 지적). 방법을 밝히는 쪽으로 바꿨다.
          ⚠ "AI" 의 근거는 **꿈해몽**이다. 번호추천(/lotto/recommend)은 통계 모듈 가중합 +
            몬테카를로라 학습된 모델이 없고, 꿈해몽(/dream)은 형태소 분석과 벡터 임베딩
            유사도를 실제로 쓴다. 두 경로 모두 '추천번호' 를 만든다.
            사용자 지시로 **사이트 전역에 "통계와 AI" 를 병기**한다(2026-08-25). 종전에는
            개별 화면에서 AI 를 빼기로 했으나 그 방침을 접었다.
          ⚠ 그래도 **방법을 구체적으로 주장하는 문장에는 사실만 쓴다** — 예를 들어 추천
            알고리즘 설명(HowRecommendWorks)에 "학습" 이나 "모델" 이라는 말을 넣지 않는다.
            거기에는 그런 것이 없다(→ docs/wiki/40-domain/prediction-algorithm.md).
          ⚠ 뒤 문장의 "당첨을 보장하지 않으며" 는 절대 빼지 않는다
            (→ docs/wiki/40-domain/forbidden-expressions.md).
        */}
        <div className="footer-bottom">
          <p className="footer-disclaimer">
            본 사이트는 복권 관련 정보와 통계를 제공하는 서비스이며,{" "}
            <span className="footer-disclaimer-accent">
              추천번호는 통계와 AI를 이용한 시뮬레이션 결과로 참고용으로만
              제공됩니다.
            </span>{" "}
            <strong>
              당첨을 보장하지 않으며, 실제 복권 구매 여부와 책임은 이용자
              본인에게 있습니다.
            </strong>
            <br />
            19세 미만은 복권을 구매할 수 없습니다.
          </p>
          <p style={{ marginTop: "var(--space-3)" }}>
            © {year} {siteName}. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
