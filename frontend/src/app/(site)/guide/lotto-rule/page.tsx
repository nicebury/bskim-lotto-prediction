import Link from "next/link";
import type { Metadata } from "next";

import { Breadcrumb } from "@/components/Breadcrumb";
import { FactSpotImage } from "@/components/FactSpotImage";
import { GuideHeroImage } from "@/components/GuideHeroImage";
import { GuideNav } from "@/components/GuideNav";
import { JsonLd, articleLd } from "@/components/JsonLd";
import { SITE_NAME, SITE_URL } from "@/lib/env";

export const metadata: Metadata = {
  title: "로또의 재미있는 사실 — 조합의 수, 가능성, 세계의 로또",
  description:
    "45개 중 6개 조합은 8,145,060가지. 1등이 될 가능성, 전 조합을 사려면 드는 비용, 세계의 로또 이야기까지 로또에 얽힌 재미있는 사실을 모았습니다.",
  alternates: { canonical: "/guide/lotto-rule" },
  openGraph: {
    type: "article",
    url: "/guide/lotto-rule",
    title: "로또의 재미있는 사실 — 조합의 수, 가능성, 세계의 로또",
    description:
      "조합의 수, 1등이 될 가능성, 세계의 로또 이야기 등 로또에 얽힌 재미있는 사실을 모았습니다.",
  },
};

export default function LottoFactsPage() {
  return (
    <div className="container">
      <Breadcrumb
        items={[
          { name: "홈", href: "/" },
          { name: "가이드", href: "/guide" },
          { name: "로또의 재미있는 사실", href: "/guide/lotto-rule" },
        ]}
      />

      <article>
        <section className="section">
          <h1>로또의 재미있는 사실</h1>
          <p className="muted" style={{ marginTop: "var(--space-2)" }}>
            숫자로 보면 더 흥미로운 로또 이야기. 규칙을 넘어 &ldquo;이런 건
            몰랐죠?&rdquo; 싶은 사실들을 모았습니다.
          </p>
          <GuideHeroImage
            slug="lotto-facts"
            alt="색색의 로또 볼이 즐겁게 흩날리는 일러스트"
          />
        </section>

        <section className="section prose">
          <div className="fact-row">
            <div style={{ minWidth: 0 }}>
              <h2>1. 조합의 수는 814만 가지가 넘는다</h2>
              <p>
                45개 번호 중 순서 없이 6개를 고르는 방법의 수는 정확히{" "}
                <strong>8,145,060가지</strong>입니다. 그래서 1등이 나올 가능성은
                약 <strong>814만분의 1</strong>이 됩니다.
              </p>
              <p>
                이 숫자는 게임 규칙에서 곧바로 나오는 사실입니다. 그리고 이
                814만 개의 조합은 매 회차 <strong>모두 같은 처지</strong>에
                있습니다 — 어떤 조합도 다른 조합보다 잘 나오지 않습니다.
              </p>
            </div>
            <FactSpot
              slug="fact-combinations"
              alt="셀 수 없이 쌓인 로또 용지 일러스트"
            />
          </div>

          <div className="fact-row">
            <div style={{ minWidth: 0 }}>
              <h2>2. 벼락 맞을 가능성보다도 낮다</h2>
              <p>
                1등이 될 가능성(814만분의 1)은 흔히{" "}
                <strong>벼락 맞을 가능성</strong>과 비교됩니다. 벼락 맞을
                가능성은 자료마다 약 28만분의 1에서 60만분의 1까지로 다르게
                인용되는데, 어느 기준으로 봐도 로또 1등이 훨씬 더 낮습니다.
              </p>
              <p>
                그만큼 희박한 일이라는 뜻입니다. 그래서 로또는 &ldquo;맞히는
                것&rdquo;이 아니라 &ldquo;즐기는 것&rdquo;으로 여기는 편이
                마음이 편합니다.
              </p>
            </div>
            <FactSpot
              slug="fact-odds"
              alt="구름과 번개로 희박함을 표현한 일러스트"
            />
          </div>

          <div className="fact-row">
            <div style={{ minWidth: 0 }}>
              <h2>3. 모든 조합을 다 사면 얼마일까</h2>
              <p>
                814만 가지 조합을 한 게임(1,000원)씩 전부 사면 약{" "}
                <strong>81억 4,500만원</strong>이 듭니다. 이렇게 하면 1등은
                반드시 나오지만, 세금을 뗀 실제 1등 당첨금은 보통 그 비용보다
                적습니다.
              </p>
              <p>
                게다가 같은 회차에 1등이 여러 명이면 당첨금을 나눠 갖습니다.
                &ldquo;전부 사면 이득&rdquo; 이 성립하지 않는 이유입니다.
              </p>
            </div>
          </div>

          <div className="fact-row">
            <div style={{ minWidth: 0 }}>
              <h2>4. 세계의 로또는 상상 이상으로 크다</h2>
              <p>
                해외 로또의 당첨금 규모는 우리 상상을 훌쩍 넘습니다. 미국{" "}
                <strong>파워볼</strong>은 2022년 약{" "}
                <strong>20억 4천만 달러</strong>(원화로 약 2조 8천억원)라는 역대
                최고 당첨금을 기록했고, <strong>메가밀리언</strong>도 2023년 약
                16억 달러의 당첨금이 나왔습니다.
              </p>
              <p>
                당첨금이 이월(캐리오버)되며 계속 불어나는 방식이라, 아무도
                맞히지 못하면 다음 회차로 넘어가 점점 커집니다.
              </p>
            </div>
            <FactSpot
              slug="fact-world"
              alt="지구본에 로또 볼이 얹힌 세계의 로또 일러스트"
            />
          </div>

          <h2>그래서, 즐기는 마음으로</h2>
          <p>
            이런 숫자들이 알려 주는 건 하나입니다. 로또는 확률로 이기는 게임이
            아니라, 작은 기대와 즐거움을 사는 오락이라는 것. 통계와 번호를
            살펴보는 재미는 누리되, 지출은 즐길 수 있는 범위 안에서 하시길
            바랍니다.
          </p>
          <p>
            번호를 고르는 규칙이 궁금하다면{" "}
            <Link href="/guide/how-to-check">당첨번호 확인 방법</Link>을,
            건강하게 즐기는 법이 궁금하다면{" "}
            <Link href="/guide/responsible-lottery">건전한 복권 이용</Link>을
            함께 보세요. 과거 통계는 <Link href="/lotto/stat">번호 통계</Link>
            에서 확인할 수 있습니다.
          </p>
        </section>
      </article>

      <GuideNav current="lotto-rule" />

      <JsonLd
        data={articleLd({
          headline: "로또의 재미있는 사실 — 조합의 수, 가능성, 세계의 로또",
          description:
            "45개 중 6개 조합은 8,145,060가지. 1등이 될 가능성, 전 조합 구매 비용, 세계의 로또 이야기 등 재미있는 사실을 모았습니다.",
          siteName: SITE_NAME,
          siteUrl: SITE_URL,
          datePublished: "2026-07-09",
          dateModified: "2026-07-15",
        })}
      />
    </div>
  );
}

/** 재미있는 사실 스팟 이미지. 파일이 없으면 숨는다(GuideHeroImage 와 같은 폴백). */
function FactSpot({ slug, alt }: { slug: string; alt: string }) {
  return <FactSpotImage slug={slug} alt={alt} />;
}
