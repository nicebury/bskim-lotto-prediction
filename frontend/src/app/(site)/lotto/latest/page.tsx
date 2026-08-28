import Link from "next/link";
import type { Metadata } from "next";

import { Breadcrumb } from "@/components/Breadcrumb";
import { Card, EmptyState } from "@/components/Card";
import { Disclaimer } from "@/components/Disclaimer";
import { LottoBall } from "@/components/LottoBall";
import {
  GuideNote,
  GuideSection,
  SpecimenCard,
  SpecimenGrid,
} from "@/components/GuideSection";
import { BallIcon, SlipIcon, TableRowIcon } from "@/components/icons";
import { Faq } from "@/components/Faq";
import { LatestRoundCard } from "@/components/LatestRoundCard";
import { NextDrawCard } from "@/components/NextDrawCard";
import { RoundTable } from "@/components/RoundTable";
import { getLatestRound, getRounds } from "@/lib/api";
import { formatDrawDate, formatNumber } from "@/lib/format";

/** 최신 결과는 짧게 재검증한다(추첨 직후 갱신 지연을 줄인다). */
export const revalidate = 600;

export const metadata: Metadata = {
  title: "최신 로또 당첨번호와 1등 당첨금",
  description:
    "이번 주 로또 6/45 당첨번호와 보너스 번호, 1등 당첨자 수와 당첨금, 최근 회차별 당첨결과를 확인하세요.",
  alternates: { canonical: "/lotto/latest" },
  openGraph: {
    type: "website",
    url: "/lotto/latest",
    title: "최신 로또 당첨번호와 1등 당첨금",
    description:
      "이번 주 로또 6/45 당첨번호와 보너스 번호, 1등 당첨자 수와 당첨금을 확인하세요.",
  },
};

export default async function LatestPage() {
  const [latest, roundPage] = await Promise.all([
    getLatestRound(),
    getRounds(1, 20),
  ]);
  // 백엔드가 round_no 내림차순으로 보장한다. 프론트가 다시 정렬하지 않는다.
  const rounds = roundPage.items;

  return (
    <div className="container">
      <Breadcrumb
        items={[
          { name: "홈", href: "/" },
          { name: "로또 6/45", href: "/lotto" },
          { name: "최신 당첨결과", href: "/lotto/latest" },
        ]}
      />

      <section className="section">
        <h1>
          {latest
            ? `제${latest.round_no}회 로또 당첨번호`
            : "최신 로또 당첨번호"}
        </h1>
        <p className="muted" style={{ marginTop: "var(--space-2)" }}>
          {latest ? (
            <>
              <time dateTime={latest.draw_date}>
                {formatDrawDate(latest.draw_date)}
              </time>{" "}
              추첨된 가장 최근 회차의 당첨결과입니다.
            </>
          ) : (
            "가장 최근 회차의 당첨결과입니다."
          )}
        </p>
      </section>

      <section className="section" aria-labelledby="result-title">
        <h2 id="result-title" className="sr-only">
          최신 회차 당첨결과와 다음 추첨 일정
        </h2>
        <div className="split-3" style={{ gridTemplateColumns: "1fr" }}>
          <LatestRoundCard round={latest} />
        </div>
        <div style={{ marginTop: "var(--space-4)" }}>
          <NextDrawCard latestRoundNo={latest?.round_no ?? null} />
        </div>
      </section>

      <section className="section" aria-labelledby="recent-title">
        <div className="section-head">
          <h2 id="recent-title">최근 회차별 당첨결과</h2>
        </div>
        {rounds.length > 0 ? (
          <RoundTable rounds={rounds} />
        ) : (
          <Card>
            <EmptyState>
              회차 목록을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.
            </EmptyState>
          </Card>
        )}
        <p
          className="muted"
          style={{ fontSize: "var(--fs-xs)", marginTop: "var(--space-3)" }}
        >
          회차 번호를 누르면 그 회차의 당첨번호와 번호 패턴을 자세히 볼 수
          있습니다.
          {roundPage.total > rounds.length &&
            ` 지금까지 ${formatNumber(roundPage.total)}회차가 기록되어 있습니다.`}
        </p>
      </section>

      {/* ── 확인하는 법: 표본 해부 ─────────────────────────── */}
      <GuideSection
        headingId="check-title"
        title="당첨 확인은 어떻게 하나요?"
        lede="구매한 용지의 번호와 위 당첨번호를 하나씩 맞춰 봅니다. 숫자는 설명용 예시입니다."
      >
        <SpecimenGrid>
          <SpecimenCard
            accent="news"
            icon={<TableRowIcon />}
            title="등수는 맞은 개수로"
            specimen={
              <>
                <LottoBall number={7} size="sm" />
                <LottoBall number={14} size="sm" />
                <LottoBall number={24} size="sm" />
                <span className="muted">3개 맞음 · 5등</span>
              </>
            }
            notes={[
              {
                label: "1등",
                text: "당첨번호 여섯 개를 모두 맞힌 경우입니다.",
              },
              {
                label: "2등",
                text: "다섯 개 + 보너스 번호. 보너스는 여기서만 쓰입니다.",
              },
              {
                label: "3~5등",
                text: "다섯 개는 3등, 네 개는 4등, 세 개는 5등입니다.",
              },
            ]}
            example="세 개를 맞히면 5등입니다"
          />

          <SpecimenCard
            accent="lotto"
            icon={<BallIcon />}
            title="보너스 번호의 자리"
            specimen={
              <>
                <LottoBall number={34} size="sm" />
                <span className="ball-plus" aria-hidden="true">
                  +
                </span>
                <LottoBall number={36} size="sm" bonus />
              </>
            }
            notes={[
              {
                label: "언제 뽑나",
                text: "당첨번호 여섯 개를 뽑은 뒤 일곱 번째로 한 개 더 뽑습니다.",
              },
              {
                label: "쓰임",
                text: "2등을 가릴 때만 씁니다. 1등이나 3등 판정에는 관여하지 않습니다.",
              },
            ]}
            example="5개 + 보너스 = 2등 · 5개만 = 3등"
          />

          <SpecimenCard
            accent="reco"
            icon={<SlipIcon />}
            title="한 용지에 여러 게임"
            specimen={
              <>
                <span className="spec-rank">A</span>
                <span className="muted">3개 맞음</span>
                <span className="spec-rank">B</span>
                <span className="muted">1개 맞음</span>
              </>
            }
            notes={[
              {
                label: "따로 판정",
                text: "A~E 각 줄이 독립된 게임입니다. 줄마다 따로 맞춰 봐야 합니다.",
              },
              {
                label: "종이 복권",
                text: "판매점 단말기나 스캐너로도 조회할 수 있습니다.",
              },
            ]}
            example="A줄 3개 · B줄 1개 — 줄마다 따로 셉니다"
          />
        </SpecimenGrid>

        <GuideNote title="여기 숫자는 참고용입니다">
          <p>
            이 페이지의 당첨결과는 수집된 데이터를 정리한 것입니다. 실제 당첨
            여부와 당첨금은 반드시 <strong>공식 발표</strong>를 통해 확인하시기
            바랍니다.
          </p>
          <p>
            확인 절차는{" "}
            <Link href="/guide/how-to-check">로또 당첨번호 확인 방법</Link>,
            수령 절차와 세금은{" "}
            <Link href="/guide/prize-claim">당첨금 수령 방법</Link>에
            정리했습니다.
          </p>
        </GuideNote>
      </GuideSection>

      <Faq
        headingId="latest-faq"
        intro="당첨 확인과 수령에서 자주 헷갈리는 부분을 모았습니다."
        items={[
          {
            question: "추첨은 언제 하나요?",
            answer:
              "매주 토요일 저녁에 추첨합니다. 결과는 추첨 직후 공식 채널에 공개되고, 이 페이지도 수집이 끝나는 대로 반영합니다. 조금 늦게 보이더라도 잠시 기다리시면 됩니다.",
          },
          {
            question: "보너스 번호는 어디에 쓰이나요?",
            answer:
              "2등을 가릴 때만 쓰입니다. 당첨번호 여섯 개 중 다섯 개를 맞혔을 때, 남은 하나가 보너스 번호와 같으면 2등이고 아니면 3등입니다. 1등이나 4등·5등을 정할 때는 쓰이지 않습니다.",
          },
          {
            question: "당첨금은 언제까지 받을 수 있나요?",
            answer:
              "지급이 시작된 날부터 1년입니다. 이 기한이 지나면 받을 수 없으니 용지를 잃어버리지 않도록 잘 보관하셔야 합니다. 수령 방법과 필요한 서류는 가이드의 당첨금 수령 방법에 정리해 두었습니다.",
          },
          {
            question: "여기 표시된 당첨금이 실제와 다릅니다.",
            answer:
              "이 페이지는 수집한 데이터를 정리해 보여 주는 정보 서비스라, 수집 시점이나 출처에 따라 값이 조금 다를 수 있습니다. 실제 금액과 당첨 여부는 반드시 공식 발표로 확인해 주세요.",
          },
        ]}
      />

      <Disclaimer>
        본 페이지는 과거 추첨 결과를 정리해 제공하는 정보 서비스입니다. 복권을
        판매하거나 구매를 대행하지 않습니다.
      </Disclaimer>
    </div>
  );
}
