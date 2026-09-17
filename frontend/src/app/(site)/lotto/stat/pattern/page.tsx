import Link from "next/link";
import type { Metadata } from "next";

import { Breadcrumb } from "@/components/Breadcrumb";
import { LottoBall } from "@/components/LottoBall";
import { Disclaimer } from "@/components/Disclaimer";
import { Faq } from "@/components/Faq";
import { JsonLd, datasetLd } from "@/components/JsonLd";
import { PatternBoard } from "@/components/stat/PatternBoard";
import {
  GuideNote,
  GuideSection,
  SpecimenCard,
  SpecimenGrid,
} from "@/components/GuideSection";
import { BallIcon, ScaleIcon, SpreadIcon } from "@/components/icons";
import { StatNav } from "@/components/stat/StatNav";
import { getPattern, getRoundIndex, supportsRangeQuery } from "@/lib/api";
import { SITE_NAME, SITE_URL } from "@/lib/env";
import { DISCLAIMER, STAT_WINDOWS } from "@/lib/site";

import type { PatternResult } from "@/lib/api-types";

export const revalidate = 604800;

export const metadata: Metadata = {
  title: "로또 홀짝·고저·합계·연속번호 패턴 통계",
  description:
    "로또 6/45 당첨 조합의 홀짝 비율, 고저 비율, 번호 합계 분포, 연속번호와 끝자리 통계를 회차 구간별로 확인해보세요.",
  alternates: { canonical: "/lotto/stat/pattern" },
  openGraph: {
    type: "website",
    url: "/lotto/stat/pattern",
    title: "로또 홀짝·고저·합계·연속번호 패턴 통계",
    description: "당첨 조합이 어떤 모양이었는지 다섯 가지 카드로 정리했습니다.",
  },
};

export default async function PatternPage() {
  const [results, roundIndex] = await Promise.all([
    Promise.all(STAT_WINDOWS.map((option) => getPattern(option.value))),
    getRoundIndex(),
  ]);

  const initial: Partial<Record<string, PatternResult>> = {};
  STAT_WINDOWS.forEach((option, index) => {
    const value = results[index];
    if (value) initial[String(option.value)] = value;
  });

  // 패턴은 표본이 클수록 모양이 또렷해 기본 구간을 '역대 전체'로 둔다.
  const base = initial.all ?? initial["20"] ?? null;

  return (
    <div className="container">
      <Breadcrumb
        items={[
          { name: "홈", href: "/" },
          { name: "로또 6/45", href: "/lotto" },
          { name: "번호 통계", href: "/lotto/stat" },
          { name: "조합 패턴", href: "/lotto/stat/pattern" },
        ]}
      />

      <section className="section">
        <h1>로또 번호 패턴 통계</h1>
        <p className="muted" style={{ marginTop: "var(--space-2)" }}>
          당첨 조합이 어떤 <strong>모양</strong>이었는지를 봅니다. 어떤 번호가
          나왔는지가 아니라, 여섯 숫자가 서로 어떻게 섞였는지에 대한 기록입니다.
        </p>
        <StatNav current="pattern" />
      </section>

      <section className="section" aria-labelledby="pattern-title">
        <h2 id="pattern-title" className="sr-only">
          조합 패턴 분포
        </h2>
        {base ? (
          <PatternBoard
            initial={initial}
            roundIndex={roundIndex?.rounds ?? null}
            rangeSupported={supportsRangeQuery(base)}
          />
        ) : (
          <p className="empty-state">
            통계를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.
          </p>
        )}
        <Disclaimer spaced>{DISCLAIMER.stats}</Disclaimer>
      </section>

      {/* ── 친절 설명 ─────────────────────────────────────── */}
      {/* ── 읽는 법: 표본 해부 ───────────────────────────── */}
      <GuideSection
        headingId="pattern-read"
        title="이 분포, 뭘 보면 되나요?"
        lede="번호 통계가 ‘누가’ 나왔나를 본다면, 패턴은 ‘어떻게 생긴 조합’이 나왔나를 봅니다."
      >
        <SpecimenGrid>
          <SpecimenCard
            accent="news"
            icon={<ScaleIcon />}
            title="홀짝 · 고저 분포"
            specimen={
              <>
                <strong>3:3</strong>
                <span className="spec-minibars" aria-hidden="true">
                  <span
                    className="spec-minibar is-top"
                    style={{ height: "100%" }}
                  />
                  <span className="spec-minibar" style={{ height: "72%" }} />
                  <span className="spec-minibar" style={{ height: "38%" }} />
                </span>
                <span className="muted">33.4%</span>
              </>
            }
            notes={[
              {
                label: "읽는 법",
                text: "홀수 개수 : 짝수 개수 입니다. 고저는 23 이상이 ‘고’ 입니다.",
              },
              {
                label: "왜 3:3",
                text: "45개 중 홀수가 23개, 짝수가 22개로 거의 반반입니다. 여섯 개를 뽑으면 3:3 으로 갈리는 경우의 수가 가장 많습니다.",
              },
              {
                label: "드문 쪽",
                text: "6:0 이 되려면 스물세 개 중에서만 여섯 개를 골라야 하니 훨씬 드뭅니다.",
              },
            ]}
            example="홀 3 : 짝 3 — 전체의 33.4%"
          />

          <SpecimenCard
            accent="lotto"
            icon={<SpreadIcon />}
            title="합계 히스토그램"
            specimen={
              <>
                <span className="spec-minibars" aria-hidden="true">
                  <span className="spec-minibar" style={{ height: "18%" }} />
                  <span className="spec-minibar" style={{ height: "55%" }} />
                  <span
                    className="spec-minibar is-top"
                    style={{ height: "100%" }}
                  />
                  <span className="spec-minibar" style={{ height: "58%" }} />
                  <span className="spec-minibar" style={{ height: "20%" }} />
                </span>
                <span className="muted">130–139 이 가장 두껍습니다</span>
              </>
            }
            notes={[
              {
                label: "범위",
                text: "이론상 21(1~6)부터 255(40~45)까지 가능합니다.",
              },
              {
                label: "왜 종 모양",
                text: "합계 21이 되는 조합은 1·2·3·4·5·6 하나뿐이지만, 140쯤 되는 조합은 수만 가지입니다.",
              },
              {
                label: "뜻",
                text: "가운데 값을 가진 조합이 그만큼 많다는 뜻입니다.",
              },
            ]}
            example="합계 130~139 구간이 가장 두껍습니다"
          />

          <SpecimenCard
            accent="reco"
            icon={<BallIcon />}
            title="연속번호"
            specimen={
              <>
                <LottoBall number={7} size="sm" />
                <LottoBall number={8} size="sm" />
                <span className="muted">한 쌍 이상 포함된 회차 51.8%</span>
              </>
            }
            notes={[
              {
                label: "흔한 오해",
                text: "“7, 8 같은 연속번호는 잘 안 나온다”고들 하지만 기록은 반대에 가깝습니다.",
              },
              {
                label: "이유",
                text: "45칸에서 여섯 개를 뽑으면 이웃끼리 붙을 기회가 생각보다 많습니다.",
              },
            ]}
            example="7과 8처럼 붙은 수가 있는 회차 51.8%"
          />
        </SpecimenGrid>

        <GuideNote title="‘모양’ 과 ‘조합’ 은 다릅니다">
          <p className="spec-figure">
            <strong>1 / 8,145,060</strong>
            <span>
              내가 실제로 사는 조합 하나가 뽑힐 가능성. 어떤 모양이든 같습니다.
            </span>
          </p>
          <p>
            여기서 헷갈리기 쉬운 지점이 있습니다.{" "}
            <strong>‘홀짝 3:3’ 은 모양의 이름</strong>
            이지 조합 하나가 아닙니다. 그 모양에 해당하는 조합이 수백만 가지라서
            자주 관찰되는 것뿐입니다.
          </p>
          <p>
            반면 내가 사는 것은 조합 하나입니다. 1·2·3·4·5·6 이든
            3·11·22·28·34·41 이든 가능성은 완전히 같습니다. 그래서 이 페이지는
            유리한 모양을 찾는 곳이 아니라, 지나간 당첨 조합들이 어떻게 생겼는지
            구경하는 곳입니다.
          </p>
          <p>
            번호 하나하나의 기록은{" "}
            <Link href="/lotto/stat">많이 나온 번호와 안 나온 번호</Link>, 전체
            분포는 <Link href="/lotto/stat/frequency">번호별 출현 빈도</Link>
            에서 볼 수 있습니다.
          </p>
        </GuideNote>
      </GuideSection>

      <Faq
        headingId="pattern-faq"
        intro="분포를 보면 자연스레 생기는 궁금증을 모았습니다."
        items={[
          {
            question: "왜 홀짝이 3:3인 회차가 가장 많나요?",
            answer:
              "경우의 수가 가장 많기 때문입니다. 45개 중 홀수가 23개, 짝수가 22개로 거의 반반이지요. 여기서 여섯 개를 뽑으면 3:3으로 갈리는 방법이 제일 많습니다. 동전을 여섯 번 던질 때 앞면이 세 번 나오는 경우가 가장 흔한 것과 같은 이치입니다.",
          },
          {
            question: "고저는 어디를 기준으로 나누나요?",
            answer:
              "23을 기준으로 나눕니다. 23 이상이면 ‘고’, 22 이하면 ‘저’ 입니다. 1부터 45까지를 절반으로 가르는 지점이라 그렇게 정했습니다.",
          },
          {
            question: "합계가 130~140에 몰리는 이유는 뭔가요?",
            answer:
              "그 언저리에 해당하는 조합이 압도적으로 많기 때문입니다. 합계가 21이 되는 조합은 1·2·3·4·5·6 딱 하나뿐이지만, 140쯤 되는 조합은 수만 가지입니다. 조합의 개수 자체가 다르니 가운데가 두꺼운 산봉우리 모양이 나옵니다. 가운데 숫자가 더 잘 나온다는 뜻은 아닙니다.",
          },
          {
            question: "연속번호는 잘 안 나오지 않나요?",
            answer:
              "오히려 반대에 가깝습니다. 절반 가까운 회차에 7과 8처럼 붙어 있는 수가 한 쌍 이상 들어 있습니다. 45칸에서 여섯 개를 뽑다 보면 이웃끼리 붙을 기회가 생각보다 많거든요. “연속번호는 피해야 한다” 는 말은 기록과 맞지 않습니다.",
          },
          {
            question: "그러면 3:3 모양으로 고르는 게 나은가요?",
            answer:
              "아닙니다. 여기서 헷갈리기 쉬운데, ‘3:3’ 은 모양의 이름이지 조합 하나가 아닙니다. 그 모양에 해당하는 조합이 수백만 가지라서 자주 관찰되는 것뿐입니다. 반면 내가 실제로 사는 것은 조합 하나이고, 어떤 조합이든 8,145,060분의 1로 똑같습니다.",
          },
        ]}
      />

      <JsonLd
        data={datasetLd({
          name: "로또 6/45 조합 패턴 통계",
          description:
            "회차 구간별 당첨 조합의 홀짝·고저 비율, 합계 분포, 연속번호, 끝자리 분포 집계.",
          siteName: SITE_NAME,
          siteUrl: SITE_URL,
        })}
      />
    </div>
  );
}
