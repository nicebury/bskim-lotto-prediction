import Link from "next/link";
import type { Metadata } from "next";

import { Breadcrumb } from "@/components/Breadcrumb";
import { Disclaimer } from "@/components/Disclaimer";
import { GuideHeroImage } from "@/components/GuideHeroImage";
import { GuideNav } from "@/components/GuideNav";
import { JsonLd, articleLd } from "@/components/JsonLd";
import { SITE_NAME, SITE_URL } from "@/lib/env";

export const metadata: Metadata = {
  title: "건전한 복권 이용 안내",
  description:
    "복권을 오락으로 즐기기 위한 기준과 과도한 이용의 신호, 도움을 받을 수 있는 방법을 안내합니다.",
  alternates: { canonical: "/guide/responsible-lottery" },
  openGraph: {
    type: "article",
    url: "/guide/responsible-lottery",
    title: "건전한 복권 이용 안내",
    description: "복권을 즐겁게 이용하기 위한 기준을 안내합니다.",
  },
};

export default function ResponsibleLotteryPage() {
  return (
    <div className="container">
      <Breadcrumb
        items={[
          { name: "홈", href: "/" },
          { name: "가이드", href: "/guide" },
          { name: "건전한 복권 이용", href: "/guide/responsible-lottery" },
        ]}
      />

      <article>
        <section className="section">
          <h1>건전한 복권 이용 안내</h1>
          <p className="muted" style={{ marginTop: "var(--space-2)" }}>
            복권은 투자가 아니라 오락입니다. 즐길 수 있는 범위 안에서
            이용하세요.
          </p>
          <GuideHeroImage
            slug="responsible-lottery"
            alt="균형 저울과 하트, 달력이 어우러진 건전한 이용 일러스트"
          />
        </section>

        <section className="section prose">
          <h2>복권은 오락이다</h2>
          <p>
            복권 한 장을 사는 일은 영화표를 사는 일과 비슷합니다. 얼마간의
            기대와 즐거움을 얻고, 그 대가로 정해진 금액을 지불합니다. 차이가
            있다면 아주 낮은 가능성으로 큰 금액이 돌아올 수 있다는 점이지만,{" "}
            <strong>
              그 가능성에 기대어 지출을 늘리는 순간 오락은 도박이 됩니다.
            </strong>
          </p>
          <p>
            수학적으로 복권 구매는 장기적으로 지출한 금액보다 적게 돌려받는
            활동입니다. 이것은 비관적인 전망이 아니라 복권 제도의 설계입니다.
            판매금 일부는 당첨금으로, 일부는 복권기금으로 쓰이기 때문입니다.
            따라서 복권으로 수익을 내겠다는 계획은 성립하지 않습니다.
          </p>

          <h2>스스로 지킬 기준</h2>
          <ul>
            <li>매달 쓸 수 있는 금액을 미리 정하고 넘지 않습니다.</li>
            <li>잃어도 생활에 지장이 없는 돈으로만 구매합니다.</li>
            <li>돈을 빌려서 구매하지 않습니다.</li>
            <li>잃은 금액을 되찾으려고 구매를 늘리지 않습니다.</li>
            <li>스트레스나 우울한 기분을 달래려고 구매하지 않습니다.</li>
          </ul>

          <h2>과도한 이용의 신호</h2>
          <p>아래에 해당하는 것이 있다면 이용 습관을 돌아볼 때입니다.</p>
          <ul>
            <li>구매 금액이나 횟수를 가족이나 주변에 숨긴다</li>
            <li>정해 둔 예산을 자주 넘긴다</li>
            <li>당첨되지 않으면 초조하거나 화가 난다</li>
            <li>복권 생각 때문에 일상에 집중하기 어렵다</li>
            <li>당첨금으로 빚을 갚을 계획을 세운다</li>
          </ul>
          <p>
            이런 신호가 반복된다면 혼자 해결하려 하지 말고 전문 상담기관의
            도움을 받으시기 바랍니다. 도박 문제는 의지의 문제가 아니라 도움을
            받아 다룰 수 있는 문제입니다.
          </p>
          <p>
            <strong>한국도박문제예방치유원</strong>이 도박 문제를 무료로 상담해
            줍니다. 전국 어디서나 <strong>국번 없이 1336</strong>으로 전화하면
            24시간 상담받을 수 있고, 본인은 물론 가족도 상담을 신청할 수
            있습니다. 비밀은 보장됩니다.
          </p>

          <h2>19세 미만은 구매할 수 없다</h2>
          <p>
            법률에 따라 19세 미만은 복권을 구매할 수 없습니다. 미성년자를 대신해
            구매해 주는 것도 금지됩니다.
          </p>

          <h2>사칭과 사기를 조심하세요</h2>
          <p>
            &ldquo;당첨 번호를 알려 준다&rdquo;, &ldquo;번호를 맞혀
            준다&rdquo;며 금액을 요구하는 연락은 모두 사기입니다. 그런 정보는
            존재하지 않습니다. 복권 구매를 대행해 준다는 사이트, 당첨금 수령에
            수수료를 요구하는 연락도 마찬가지입니다.
          </p>
          <p>
            국내에서 복권 판매는 기획재정부 복권위원회가 지정한 공식 사업자만 할
            수 있습니다. 그 밖의 경로로 판매되는 복권은 합법이 아닙니다.
          </p>
        </section>

        <Disclaimer>
          행운상자는 복권 관련 정보와 통계를 제공하는 서비스이며, 복권을
          판매하거나 구매를 대행하지 않습니다. 번호 추천은 통계와 AI를 활용한
          시뮬레이션이며 당첨을 보장하지 않습니다. 19세 미만은 복권을 구매할 수
          없습니다.
        </Disclaimer>

        <section className="section prose">
          <p className="muted">
            추천번호가 왜 참고용인지에 대한 설명은{" "}
            <Link href="/lotto/recommend">번호 추천 시뮬레이터</Link> 페이지
            하단에도 있습니다.
          </p>
        </section>
      </article>

      <GuideNav current="responsible-lottery" />

      <JsonLd
        data={articleLd({
          headline: "건전한 복권 이용 안내",
          description:
            "복권을 오락으로 즐기기 위한 기준과 과도한 이용의 신호를 안내합니다.",
          siteName: SITE_NAME,
          siteUrl: SITE_URL,
          datePublished: "2026-07-09",
          dateModified: "2026-07-15",
        })}
      />
    </div>
  );
}
