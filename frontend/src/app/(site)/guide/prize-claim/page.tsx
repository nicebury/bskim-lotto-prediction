import Link from "next/link";
import type { Metadata } from "next";

import { Breadcrumb } from "@/components/Breadcrumb";
import { Disclaimer } from "@/components/Disclaimer";
import { Faq } from "@/components/Faq";
import { GuideHeroImage } from "@/components/GuideHeroImage";
import { GuideNav } from "@/components/GuideNav";
import { JsonLd, articleLd } from "@/components/JsonLd";
import { SITE_NAME, SITE_URL } from "@/lib/env";

export const metadata: Metadata = {
  title: "로또 당첨금 수령 방법 — 수령처·서류·세금·지급기한",
  description:
    "로또 당첨금을 등수별로 어디서 받는지, 필요 서류와 지급 기한, 세금(원천징수), 인터넷 구매분 수령 방법까지 실제 절차를 정리했습니다.",
  alternates: { canonical: "/guide/prize-claim" },
  openGraph: {
    type: "article",
    url: "/guide/prize-claim",
    title: "로또 당첨금 수령 방법 — 수령처·서류·세금·지급기한",
    description:
      "등수별 수령처와 필요 서류, 지급 기한, 세금, 인터넷 구매분 수령을 안내합니다.",
  },
};

const FAQ_ITEMS = [
  {
    question: "당첨금은 언제까지 받아야 하나요?",
    answer:
      "해당 회차 지급개시일로부터 1년 이내에 청구해야 합니다. 기한을 넘기면 미수령 당첨금은 복권기금으로 귀속되어 받을 수 없습니다.",
  },
  {
    question: "1등 당첨금은 어느 은행에서 받나요?",
    answer:
      "1등은 NH농협은행 본점에서만 지급합니다. 2등은 NH농협은행 전국 지점에서 받을 수 있고, 소액(4·5등)은 로또 판매점에서 바로 받을 수 있습니다.",
  },
  {
    question: "세금은 얼마나 떼나요?",
    answer:
      "당첨금 200만원 이하는 비과세입니다. 200만원 초과 3억원 이하는 22%(기타소득세 20% + 지방소득세 2%), 3억원 초과분은 33%(기타소득세 30% + 지방소득세 3%)가 원천징수됩니다. 실제 수령액은 세금을 뗀 뒤 금액입니다.",
  },
];

export default function PrizeClaimPage() {
  return (
    <div className="container">
      <Breadcrumb
        items={[
          { name: "홈", href: "/" },
          { name: "가이드", href: "/guide" },
          { name: "당첨금 수령 방법", href: "/guide/prize-claim" },
        ]}
      />

      <article>
        <section className="section">
          <h1>로또 당첨금 수령 방법</h1>
          <p className="muted" style={{ marginTop: "var(--space-2)" }}>
            당첨금 액수에 따라 수령 장소와 절차가 다릅니다. 서류·기한·세금까지
            순서대로 정리했습니다.
          </p>
          <GuideHeroImage
            slug="prize-claim"
            alt="서류 봉투와 동전 더미, 은행 건물이 어우러진 당첨금 수령 일러스트"
          />
        </section>

        <section className="section prose">
          <h2>수령처는 당첨금 액수에 따라 다르다</h2>
          <ul>
            <li>
              <strong>5등·4등(소액)</strong> — 전국 로또 판매점에서 바로
              받습니다.
            </li>
            <li>
              <strong>2등</strong> — <strong>NH농협은행 전국 지점</strong>에서
              받습니다.
            </li>
            <li>
              <strong>1등(고액)</strong> —{" "}
              <strong>NH농협은행 본점에서만</strong> 지급합니다. 지점에서는 1등
              당첨금을 받을 수 없습니다.
            </li>
          </ul>
          <p>
            판매점에서 받는 소액도 판매점 보유 현금 사정에 따라 은행 방문을
            안내받을 수 있습니다. 정확한 기준 금액과 창구는 시기에 따라 달라질
            수 있으므로 수령 전에 공식 안내를 확인하는 것이 안전합니다.
          </p>

          <h2>필요한 서류</h2>
          <ul>
            <li>
              <strong>당첨 복권 원본</strong> — 사본이나 사진으로는 지급되지
              않습니다. 종이 복권은 훼손되면 바코드를 읽지 못해 지급이 거절될 수
              있으니 접거나 물에 닿게 하지 마세요.
            </li>
            <li>
              <strong>신분증</strong> — 본인 확인용. 당첨금은 계좌로 지급되므로
              본인 명의 계좌도 함께 준비합니다.
            </li>
          </ul>
          <p>
            당첨을 확인했다면 복권 뒷면의 서명란에 <strong>바로 서명</strong>해
            두는 것이 좋습니다. 분실·도난 시 소유를 다투는 근거가 됩니다.
          </p>

          <h2>지급 기한은 1년</h2>
          <p>
            당첨금은 해당 회차 <strong>지급개시일로부터 1년 이내</strong>에
            청구해야 합니다. 이 기한을 넘기면 미수령 당첨금은 복권기금으로
            귀속되어 받을 수 없습니다. 지급기한일이 토·일·공휴일이면 다음
            영업일까지 청구할 수 있습니다. 당첨을 확인했다면 미루지 말고 수령
            절차를 밟는 편이 안전합니다.
          </p>

          <h2>세금은 이렇게 원천징수된다</h2>
          <p>당첨금 구간에 따라 세금이 지급 시점에 원천징수됩니다.</p>
          <ul>
            <li>
              <strong>200만원 이하</strong> — 비과세.
            </li>
            <li>
              <strong>200만원 초과 ~ 3억원 이하</strong> — <strong>22%</strong>{" "}
              (기타소득세 20% + 지방소득세 2%).
            </li>
            <li>
              <strong>3억원 초과분</strong> — <strong>33%</strong> (기타소득세
              30% + 지방소득세 3%).
            </li>
          </ul>
          <p>
            그래서 실제로 손에 쥐는 금액은 공시된 당첨금보다 적습니다. 예를 들어
            3억원을 넘는 1등 당첨금은 3억원까지는 22%, 초과분은 33%가 적용된 뒤
            지급됩니다. 세율은 세법 개정에 따라 바뀔 수 있으니 수령 시 안내받는
            내역서를 확인하세요.
          </p>

          <h2>인터넷으로 구매했다면</h2>
          <p>
            동행복권 온라인에서 구매한 복권은 종이 복권과 수령 방식이 조금
            다릅니다.
          </p>
          <ul>
            <li>
              <strong>소액(200만원 이하)</strong> — 추첨 다음 날 새벽부터 별도
              신청 없이 동행복권
              <strong> 예치금 계좌로 자동 입금</strong>됩니다. 이후 마이페이지의
              출금 신청으로 본인 계좌로 이체할 수 있습니다.
            </li>
            <li>
              <strong>200만원 초과(과세 대상)</strong> — 온라인에서 당첨을
              확인한 뒤 신분증을 지참하고 지정된 NH농협은행 지점을 방문해
              수령합니다. 1등은 마찬가지로 본점에서만 받습니다.
            </li>
          </ul>

          <h2>당첨 사실을 함부로 알리지 않는다</h2>
          <p>
            고액 당첨 사실이 알려지면 원치 않는 연락과 요구에 시달리는 경우가
            있습니다. 수령 절차가 끝날 때까지 알리는 범위를 최소한으로 두는 편이
            안전합니다.{" "}
            <strong>
              당첨을 대신 받아주겠다거나 수수료를 요구하는 연락은 사기
            </strong>
            일 가능성이 높습니다. 당첨금 수령에 중개인은 필요하지 않습니다.
          </p>
        </section>

        <Faq items={FAQ_ITEMS} />

        <Disclaimer>
          이 페이지는 동행복권 공식 안내를 바탕으로 일반적인 절차를 정리한 참고
          자료입니다. 수령 장소·지급 기한·세율 등 구체적인 사항은 변경될 수
          있으므로 반드시 공식 발표를 확인하시기 바랍니다. 행운상자는 복권을
          판매하거나 당첨금 수령을 대행하지 않습니다.
        </Disclaimer>
      </article>

      <GuideNav current="prize-claim" />

      <JsonLd
        data={articleLd({
          headline: "로또 당첨금 수령 방법 — 수령처·서류·세금·지급기한",
          description:
            "로또 당첨금을 등수별로 어디서 받는지, 필요 서류와 지급 기한, 세금, 인터넷 구매분 수령 방법을 안내합니다.",
          siteName: SITE_NAME,
          siteUrl: SITE_URL,
          datePublished: "2026-07-09",
          dateModified: "2026-07-15",
        })}
      />
    </div>
  );
}
