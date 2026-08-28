import Link from "next/link";
import type { Metadata } from "next";

import { AdSlot } from "@/components/AdSlot";
import { Breadcrumb } from "@/components/Breadcrumb";
import {
  GuideNote,
  GuideSection,
  SpecimenCard,
  SpecimenGrid,
} from "@/components/GuideSection";
import { BallIcon, ScaleIcon, SpreadIcon } from "@/components/icons";
import { Faq } from "@/components/Faq";
import { RecommendStudio } from "@/components/RecommendStudio";
import { serverRecommend } from "@/lib/api";
import { DISCLAIMER } from "@/lib/site";
import { STRATEGIES } from "@/lib/strategies";

/**
 * 추천 시뮬레이터. **SSG 셸 + 클라이언트 인터랙션**이다.
 *
 * 생성 결과 자체는 매번 달라 색인 대상이 아니다. 색인되는 것은 설명·기준·면책 본문이고,
 * 그것은 서버가 렌더링한다(→ docs/wiki/30-seo/metadata-strategy.md).
 * 첫 조합만 서버에서 받아 JS 없이도 화면이 비어 보이지 않게 한다.
 */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "로또 번호 추천 시뮬레이터",
  description:
    "랜덤, 번호대 균형, 최근 통계 참고 방식으로 참고용 로또 번호를 만들고 조합 성향을 확인해 보세요.",
  alternates: { canonical: "/lotto/recommend" },
  openGraph: {
    type: "website",
    url: "/lotto/recommend",
    title: "로또 번호 추천 시뮬레이터",
    description:
      "여섯 가지 방식으로 참고용 로또 번호를 만들고 조합의 성향을 확인하세요.",
  },
};

export default async function RecommendPage() {
  const initial = await serverRecommend("ensemble", 5);

  return (
    <div className="container">
      <Breadcrumb
        items={[
          { name: "홈", href: "/" },
          { name: "로또 6/45", href: "/lotto" },
          { name: "번호 추천", href: "/lotto/recommend" },
        ]}
      />

      <section className="section">
        <h1>로또 번호 추천 시뮬레이터</h1>
        <p className="muted" style={{ marginTop: "var(--space-2)" }}>
          여섯 가지 기준으로 참고용 번호 조합을 만들고, 만들어진 조합이 어떤
          성향을 가졌는지 살펴봅니다.
        </p>
      </section>

      <section className="section" aria-labelledby="studio-title">
        <h2 id="studio-title" className="sr-only">
          번호 생성
        </h2>
        <RecommendStudio
          initialStrategy="ensemble"
          initialSets={initial?.sets ?? []}
          initialHotWindow={initial?.hot_window ?? null}
          // 백엔드가 면책 문구를 내려주지만, 응답이 없을 때도 고지는 사라지면 안 된다.
          disclaimer={initial?.disclaimer ?? DISCLAIMER.recommend}
        />
      </section>

      {/* 생성 버튼 주변에 광고를 두지 않는다. 오클릭을 유도하는 배치로 읽힌다. */}
      <AdSlot slot="recommend-bottom" />

      <section className="section" aria-labelledby="criteria-title">
        <div className="section-head">
          <h2 id="criteria-title">추천 기준 여섯 가지</h2>
        </div>
        <p className="muted" style={{ marginBottom: "var(--space-4)" }}>
          기준마다 <strong>어떤 번호 묶음에서 뽑는지</strong>가 다릅니다. 어느
          쪽으로 뽑아도 다음 회차 결과는 달라지지 않습니다.
        </p>

        {/*
          ⚠ 줄글(`.prose`)이 아니라 목록이다. 여섯 항목이 같은 구조(이름 · 한 줄 요약 ·
            설명)를 반복하므로, 문단으로 이어 붙이면 어디까지가 한 기준인지 흐려진다.
          ⚠ 번호를 붙이는 이유는 **순서에 뜻이 있기 때문**이다. 1번 완전 랜덤이 통제군이고
            나머지는 그것과 견주라는 배치다(→ lib/strategies.ts). 순서가 뜻을 갖지 않는
            목록에는 번호를 붙이지 않는다.
        */}
        <ol className="strategy-list">
          {STRATEGIES.map((strategy, index) => (
            <li
              key={strategy.key}
              className="strategy-item"
              data-control={strategy.key === "pure_random" ? "" : undefined}
            >
              <span className="strategy-num" aria-hidden="true">
                {index + 1}
              </span>
              <div>
                <h3>{strategy.label}</h3>
                <span className="strategy-short">{strategy.short}</span>
                <p>{strategy.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ── 왜 참고용인가: 표본 해부 ─────────────────────── */}
      <GuideSection
        headingId="why-title"
        title="추천번호는 왜 참고용이어야 할까요?"
        lede="이 도구가 무엇을 하고 무엇을 하지 않는지 조각별로 짚었습니다."
      >
        <SpecimenGrid>
          <SpecimenCard
            accent="news"
            icon={<ScaleIcon />}
            title="조합의 성향"
            specimen={
              <>
                <span className="muted">홀:짝</span>
                <strong>3:3</strong>
                <span className="muted">합계</span>
                <strong>138</strong>
              </>
            }
            notes={[
              {
                label: "보여 주는 것",
                text: "만들어진 조합이 어떤 모양인지 — 홀짝이 어떻게 섞였는지, 번호가 한쪽에 몰렸는지.",
              },
              {
                label: "사실만",
                text: "여섯 숫자만 보면 계산되는 값입니다. 어떤 예측도 섞여 있지 않습니다.",
              },
            ]}
            example="홀:짝 3:3 · 합계 138 · 연속번호 없음"
          />

          <SpecimenCard
            accent="lotto"
            icon={<SpreadIcon />}
            title="기준마다 뽑는 방식이 다릅니다"
            specimen={
              <>
                <span className="spec-rank">1</span>
                <span className="muted">완전 랜덤</span>
                <span className="spec-rank">2</span>
                <span className="muted">번호대 균형</span>
                <span className="spec-rank">3</span>
                <span className="muted">최근 통계 참고</span>
              </>
            }
            notes={[
              {
                label: "차이",
                text: "어떤 번호 풀에서 뽑는지가 다를 뿐입니다.",
              },
              {
                label: "결과",
                text: "어느 기준으로 뽑든 다음 회차 결과는 달라지지 않습니다.",
              },
            ]}
            example="완전 랜덤 · 번호대 균형 · 최근 통계 참고"
          />

          <SpecimenCard
            accent="reco"
            icon={<BallIcon />}
            title="완전 랜덤이 맨 앞인 이유"
            specimen={
              <>
                <span className="spec-minibars" aria-hidden="true">
                  <span
                    className="spec-minibar is-top"
                    style={{ height: "100%" }}
                  />
                  <span className="spec-minibar" style={{ height: "100%" }} />
                  <span className="spec-minibar" style={{ height: "100%" }} />
                </span>
                <span className="muted">어느 기준이든 같은 높이</span>
              </>
            }
            notes={[
              {
                label: "뜻",
                text: "통계를 참고한 조합과 아무 근거 없이 뽑은 조합은 결과적으로 구분되지 않습니다.",
              },
              {
                label: "그래서",
                text: "그 사실을 감추지 않는 것이 이 도구가 할 수 있는 유일한 정직함입니다.",
              },
            ]}
            example="어느 기준으로 뽑아도 8,145,060분의 1"
          />
        </SpecimenGrid>

        <GuideNote title="이 도구가 하는 일">
          <p className="spec-figure">
            <strong>1 / 8,145,060</strong>
            <span>어떤 기준으로 만든 조합이든 뽑힐 가능성은 같습니다.</span>
          </p>
          <p>
            번호를 고르는 일을 조금 더 수월하게 만들고, 만들어진 조합이 어떤
            모양인지 보여 줍니다. 그것이 전부이며 그 이상을 약속하지 않습니다.
          </p>
          <p>
            번호 통계를 직접 보고 싶다면{" "}
            <Link href="/lotto/stat">번호 통계</Link>, 꿈 키워드로 번호를 만들어
            보고 싶다면 <Link href="/dream">꿈해몽 번호 추천</Link>을 이용해
            보세요. 복권을 건전하게 이용하는 방법은{" "}
            <Link href="/guide/responsible-lottery">건전한 복권 이용 안내</Link>
            에 정리했습니다.
          </p>
        </GuideNote>
      </GuideSection>

      <Faq
        headingId="recommend-faq"
        intro="이 도구가 무엇을 하고 무엇을 하지 않는지에 대한 답입니다."
        items={[
          {
            question: "어떤 기준이 가장 나은가요?",
            answer:
              "더 나은 기준은 없습니다. 기준마다 어떤 번호 묶음에서 뽑는지가 다를 뿐이고, 어느 쪽으로 뽑아도 결과가 달라지지 않습니다. 완전 랜덤을 목록 맨 앞에 둔 이유가 그것입니다 — 통계를 참고한 조합과 아무 근거 없이 뽑은 조합은 결과적으로 구분되지 않습니다.",
          },
          {
            question: "같은 조합이 또 나올 수 있나요?",
            answer:
              "나올 수 있습니다. 누를 때마다 새로 뽑기 때문에 앞서 만든 조합과 겹칠 수 있습니다. 같은 결과를 다시 보고 싶다면 seed 값을 그대로 주면 됩니다.",
          },
          {
            question: "조합의 성향은 무엇을 계산한 건가요?",
            answer:
              "여섯 숫자만 보면 바로 계산되는 값들입니다. 홀수와 짝수의 비율, 23 이상과 이하의 비율, 여섯 수를 더한 합계, 번호대 분포, 연속번호가 들어 있는지, 끝자리가 몇 가지인지입니다. 전부 지금 이 조합에 대한 사실이고, 앞으로 어떻게 될지에 대한 예측은 하나도 섞여 있지 않습니다.",
          },
          {
            question: "이 번호를 그대로 사면 되나요?",
            answer:
              "참고용으로 만든 조합입니다. 어떤 조합도 결과를 보장하지 않으니, 구매 여부와 금액은 스스로 판단하고 감당할 수 있는 선에서 정해 주세요.",
          },
        ]}
      />
    </div>
  );
}
