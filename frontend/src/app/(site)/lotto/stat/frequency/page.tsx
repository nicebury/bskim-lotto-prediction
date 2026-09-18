import Link from "next/link";
import type { Metadata } from "next";

import { Breadcrumb } from "@/components/Breadcrumb";
import { LottoBall } from "@/components/LottoBall";
import { Disclaimer } from "@/components/Disclaimer";
import { Faq } from "@/components/Faq";
import { JsonLd, datasetLd } from "@/components/JsonLd";
import { FrequencyBoard } from "@/components/stat/FrequencyBoard";
import {
  GuideNote,
  GuideSection,
  SpecimenCard,
  SpecimenGrid,
} from "@/components/GuideSection";
import { CheckboxIcon, GridIcon, SpreadIcon } from "@/components/icons";
import { NumberInspector } from "@/components/stat/NumberInspector";
import { StatNav } from "@/components/stat/StatNav";
import {
  getFrequency,
  getNumberStat,
  getRoundIndex,
  supportsRangeQuery,
} from "@/lib/api";
import { SITE_NAME, SITE_URL } from "@/lib/env";
import { DISCLAIMER, STAT_WINDOWS } from "@/lib/site";

import type { FrequencyResult } from "@/lib/api-types";

export const revalidate = 604800;

export const metadata: Metadata = {
  title: "로또 번호별 출현 빈도 통계",
  description:
    "1번부터 45번까지 각 번호가 몇 번 나왔는지 막대차트·번호판 히트맵·번호대별 합계로 봅니다. 회차 구간을 직접 골라 조회할 수 있습니다.",
  alternates: { canonical: "/lotto/stat/frequency" },
  openGraph: {
    type: "website",
    url: "/lotto/stat/frequency",
    title: "로또 번호별 출현 빈도 통계",
    description:
      "1번부터 45번까지의 출현 횟수를 세 가지 그림으로 정리했습니다.",
  },
};

export default async function FrequencyPage() {
  // 구간 4종 × 보너스 포함 여부 2종을 미리 받는다. 프리셋 전환은 네트워크를 타지 않는다.
  const combos = STAT_WINDOWS.flatMap((option) =>
    [false, true].map((includeBonus) => ({
      window: option.value,
      includeBonus,
    })),
  );

  const [results, roundIndex, numberProbe] = await Promise.all([
    Promise.all(
      combos.map((combo) => getFrequency(combo.window, combo.includeBonus)),
    ),
    getRoundIndex(),
    getNumberStat(1, 50),
  ]);

  const initial: Partial<Record<string, FrequencyResult>> = {};
  combos.forEach((combo, index) => {
    const value = results[index];
    if (value) initial[`${combo.window}:${combo.includeBonus}`] = value;
  });

  const base = initial["20:false"] ?? null;

  return (
    <div className="container">
      <Breadcrumb
        items={[
          { name: "홈", href: "/" },
          { name: "로또 6/45", href: "/lotto" },
          { name: "번호분석", href: "/lotto/stat" },
          { name: "출현 빈도", href: "/lotto/stat/frequency" },
        ]}
      />

      <section className="section">
        <h1>번호별 출현 빈도</h1>
        <p className="muted" style={{ marginTop: "var(--space-2)" }}>
          1번부터 45번까지 각 번호가 몇 번 나왔는지를 세 가지 그림으로 봅니다.
          순위만 보고 싶다면{" "}
          <Link href="/lotto/stat">많이 나온 번호와 안 나온 번호</Link>가 더
          편합니다.
        </p>
        <StatNav current="frequency" />
      </section>

      <section className="section" aria-labelledby="freq-title">
        <h2 id="freq-title" className="sr-only">
          출현 빈도 차트
        </h2>
        {base ? (
          <FrequencyBoard
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

      <section className="section" aria-labelledby="number-title">
        <div className="section-head">
          <h2 id="number-title">번호 하나만 골라 보기</h2>
        </div>
        <NumberInspector
          roundIndex={roundIndex?.rounds ?? null}
          rangeSupported={supportsRangeQuery(base)}
          supported={numberProbe !== null}
        />
      </section>

      {/* ── 친절 설명 ─────────────────────────────────────── */}
      {/* ── 읽는 법: 표본 해부 ───────────────────────────── */}
      <GuideSection
        headingId="freq-read"
        title="이 그림들, 뭘 보면 되나요?"
        lede="세 그림은 모두 같은 숫자를 다르게 그린 것입니다. 답하는 질문이 다릅니다."
      >
        <SpecimenGrid>
          <SpecimenCard
            accent="news"
            icon={<SpreadIcon />}
            title="번호별 막대"
            specimen={
              <>
                <span className="spec-minibars" aria-hidden="true">
                  <span
                    className="spec-minibar bar-range-2"
                    style={{ height: "40%" }}
                  />
                  <span
                    className="spec-minibar bar-range-2"
                    style={{ height: "100%" }}
                  />
                  <span
                    className="spec-minibar bar-range-2"
                    style={{ height: "65%" }}
                  />
                </span>
                <span className="muted">13번 · 6회</span>
              </>
            }
            notes={[
              { label: "답하는 것", text: "“13번이 정확히 몇 번 나왔지?”" },
              {
                label: "쓰는 법",
                text: "막대를 가리키거나 좌우 방향키로 옮기면 번호와 횟수가 위에 표시됩니다.",
              },
              {
                label: "색",
                text: "막대 색도 번호대입니다. 볼과 같은 5구간 규칙입니다.",
              },
            ]}
            example="13번 막대를 가리키면 “13번 · 6회”"
          />

          <SpecimenCard
            accent="lotto"
            icon={<GridIcon />}
            title="번호판 히트맵"
            specimen={
              <>
                <span
                  className="spec-heatcell"
                  style={{ "--heat": "0.85" } as React.CSSProperties}
                >
                  <LottoBall number={28} size="sm" />
                </span>
                <span
                  className="spec-heatcell"
                  style={{ "--heat": "0.25" } as React.CSSProperties}
                >
                  <LottoBall number={31} size="sm" />
                </span>
                <span
                  className="spec-heatcell"
                  style={{ "--heat": "0" } as React.CSSProperties}
                >
                  <LottoBall number={5} size="sm" />
                </span>
              </>
            }
            notes={[
              { label: "답하는 것", text: "“어느 번호대가 몰렸지?”" },
              {
                label: "진하기",
                text: "볼 뒤 칸이 진할수록 많이 나온 번호입니다.",
              },
              {
                label: "색 없는 칸",
                text: "이 구간에 한 번도 나오지 않았다는 뜻입니다. 그것도 기록입니다.",
              },
            ]}
            example="진한 칸일수록 많이 나온 번호"
          />

          <SpecimenCard
            accent="reco"
            icon={<CheckboxIcon />}
            title="보너스 번호 포함"
            specimen={
              <>
                <span className="spec-checkbox" aria-hidden="true">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M4 12.5l5 5L20 6.5" />
                  </svg>
                </span>
                <span className="muted">보너스 번호 포함해서 세기</span>
              </>
            }
            notes={[
              {
                label: "보너스란",
                text: "일곱 번째로 뽑히는 공이고 2등을 가릴 때만 쓰입니다.",
              },
              {
                label: "기본값",
                text: "역할이 달라 기본 집계에서는 뺐습니다. 켜면 포함해 다시 셉니다.",
              },
              {
                label: "결과",
                text: "순위가 조금 뒤바뀌는 것을 바로 보실 수 있습니다.",
              },
            ]}
            example="켜면 순위가 조금 뒤바뀝니다"
          />
        </SpecimenGrid>

        <GuideNote title="차이가 커 보여도 사실은 작습니다">
          <p className="spec-figure">
            <strong>2.7회</strong>
            <span>
              최근 20회에서 번호 하나가 나올 평균 횟수. 공은 20회 × 6개 = 120번
              뽑힙니다.
            </span>
          </p>
          <p>
            어떤 번호는 6회, 어떤 번호는 0회입니다. 여섯 배 차이니 대단해
            보이지만, 번호당 평균이 2.7회인 표본에서 이 정도는 흔히 생기는
            흔들림입니다. 동전을 스무 번 던져 앞면이 열세 번 나오는 일과
            비슷합니다.
          </p>
          <p>
            구간 버튼을 50회, 100회, 역대 전체로 옮겨 보세요.{" "}
            <strong>막대들의 높이가 점점 고르게 펴지는 것</strong>이 바로
            보입니다. 자주 나온 번호가 유리해서가 아니라, 표본이 작아서
            들쭉날쭉했던 것입니다.
          </p>
          <p>
            조합의 모양(홀짝·고저·합계)은{" "}
            <Link href="/lotto/stat/pattern">홀짝·고저·합계 패턴</Link>에서 볼
            수 있습니다.
          </p>
        </GuideNote>
      </GuideSection>

      <Faq
        headingId="freq-faq"
        intro="그림 세 개를 읽다 보면 떠오르는 질문들입니다."
        items={[
          {
            question: "막대차트와 히트맵은 뭐가 다른가요?",
            answer:
              "같은 숫자를 다르게 그린 것이라 답하는 질문이 다릅니다. 막대차트는 “13번이 정확히 몇 번 나왔지?” 에 답하고, 히트맵은 “어느 번호대가 붐볐지?” 에 답합니다. 하나는 값을 읽는 데, 하나는 전체 모양을 훑는 데 좋습니다.",
          },
          {
            question:
              "어떤 번호는 6회, 어떤 번호는 0회인데 차이가 큰 것 아닌가요?",
            answer:
              "생각보다 작은 차이입니다. 20회 추첨이면 공이 모두 120번 뽑히고, 45개 번호가 고르게 나눠 가지면 번호당 2.7회쯤 됩니다. 이렇게 적은 횟수에서는 6회와 0회 정도의 들쭉날쭉은 흔히 생깁니다. 동전을 스무 번 던져 앞면이 열세 번 나오는 일과 비슷하지요. 구간을 100회나 역대 전체로 넓혀 보면 막대들이 눈에 띄게 고르게 펴집니다.",
          },
          {
            question: "보너스 번호는 왜 기본으로 빠져 있나요?",
            answer:
              "역할이 다르기 때문입니다. 보너스 번호는 일곱 번째로 뽑히는 공이고, 2등을 가릴 때만 쓰입니다. 당첨번호 여섯 개와 성격이 달라 기본 집계에서는 뺐습니다. 체크박스를 켜면 포함해서 다시 세는데, 순위가 조금 뒤바뀌는 것을 바로 보실 수 있습니다.",
          },
          {
            question: "색이 없는 칸은 무슨 뜻인가요?",
            answer:
              "고른 구간에서 한 번도 나오지 않았다는 뜻입니다. 나오지 않은 것도 하나의 기록이라 칸을 지우지 않고 색만 비워 둡니다. 구간을 넓히면 대부분 색이 채워집니다.",
          },
          {
            question: "자주 나온 번호를 고르면 유리한가요?",
            answer:
              "아닙니다. 추첨기에는 기억이 없어서, 지난주에 많이 나온 번호라고 이번 주에 더 잘 나오지는 않습니다. 이 페이지는 지나간 기록이 어떻게 분포했는지 구경하는 곳입니다.",
          },
        ]}
      />

      <JsonLd
        data={datasetLd({
          name: "로또 6/45 번호별 출현 빈도",
          description:
            "회차 구간별 1~45번 출현 횟수 집계(보너스 포함 여부 선택 가능).",
          siteName: SITE_NAME,
          siteUrl: SITE_URL,
        })}
      />
    </div>
  );
}
