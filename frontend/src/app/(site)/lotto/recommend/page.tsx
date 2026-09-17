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
import { AiRecommender } from "@/components/simulator/AiRecommender";
import { RecommendTabs } from "@/components/simulator/RecommendTabs";
import { HowSimWorks } from "@/components/simulator/HowSimWorks";
import { SIMULATOR_STEPS } from "@/lib/simulator-steps";
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
          역대 당첨번호를 분석해 참고용 번호를 추천하고, 추천된 번호가 어떤 성향을 가졌는지
          함께 보여드립니다.
        </p>
      </section>

      {/*
        ── 추천 방식 두 갈래 ───────────────────────────
        ⚠ **탭으로 나란히 둔다**(2026-08-31 사용자 지적). 위아래로 쌓았더니 아래 것이
          묻혀 있다는 것을 아무도 몰랐다. '메인 / 서브' 라는 이름도 걷어냈다 — 그건 우리
          사정이고, 사용자가 알고 싶은 것은 **무엇이 다른가**다. 이름이 그것을 말한다.
      */}
      <section className="section" aria-labelledby="pick-title">
        <div className="section-head">
          <h2 id="pick-title">어떻게 추천받을까요?</h2>
        </div>
        {/*
          ⚠ **각 방식의 설명 글이 패널 안에 함께 들어간다**(2026-09-01 사용자 요청).
            종전에는 두 설명이 탭 아래에 나란히 늘 떠 있어, "AI 번호추천은 7단계로
            진행됩니다" 와 "여섯 가지 기준" 이 **어느 탭을 고르든 둘 다 보였다.** 지금 고른
            것과 관계없는 설명이 절반이라 페이지가 길기만 했다.

          ⚠ **숨긴 패널도 DOM 에 남는다**(`RecommendTabs` 가 `hidden` 으로만 감춘다).
            이 설명들은 이 페이지의 고유 본문이라 검색엔진이 읽어야 한다
            (→ docs/wiki/30-seo/metadata-strategy.md). 마운트를 풀면 그것이 사라진다.
        */}
        <RecommendTabs
          tabs={[
            {
              key: "ai",
              /*
        ⚠ **"AI 번호추천" 에서 바꿨다**(2026-09-02 사용자 확인). 이 기능이 실제로 하는 일은
          빈도·주기·흐름·패턴의 **가중 선형합 + 몬테카를로 확률 추출**이고, 위키가 못박아
          두었다 — "머신러닝이 아니다"([[prediction-algorithm]] 첫 문단). 학습하는 모델이
          없는데 AI 라고 부르면 그 순간 과장이 된다.
        ⚠ **꿈해몽의 "AI" 는 그대로 둔다.** 그쪽은 SentenceTransformer 임베딩(768차원)과
          벡터 검색을 실제로 돌린다([[dream-pipeline]]). 같은 단어라도 근거가 다르다.
      */
              label: "정밀 분석 추천",
              badge: `${SIMULATOR_STEPS.length}단계 · 몬테카를로`,
              hint: "역대 당첨번호의 빈도·출현 주기·최근 흐름·조합 패턴을 모두 종합하고 가상 추첨까지 돌립니다. 분석 과정을 단계별로 보여드리며 5초쯤 걸립니다.",
              panel: (
                <>
                  <AiRecommender />
          {/*
            ── 어떻게 추천하나요? ──────────────────────────
            ⚠ **펼쳐 둔다**(2026-09-17 사용자 요청). 2026-09-02 에 길다는 이유로 접었는데,
              접어 두니 이 기능이 랜덤과 무엇이 다른지 아무도 열어 보지 않았다 — "누가 봐도
              랜덤하게 뽑는 것 같다" 는 인상이 거기서 나왔다. 길이 문제는 일곱 단계를 세 막으로
              묶고 카드로 나눠 푼다(→ HowSimWorks 머리말).
            ⚠ **서버에서 렌더링한다.** 이 설명이 이 페이지의 고유 본문이다
              (→ docs/wiki/30-seo/metadata-strategy.md).
          */}
          <HowSimWorks />
                </>
              ),
            },
            {
              key: "criteria",
              /*
                ⚠ "기준별 추천" 에서 바꿨다(2026-09-01 사용자 요청). 몇 가지인지가 이름에
                  드러나야 고르기 전에 규모를 안다 — 옆 탭이 "7단계 분석" 이라 균형도 맞는다.
                ⚠ 숫자를 문자열에 박지 않고 `STRATEGIES.length` 로 만든다. 기준이 일곱 개가
                  되는 날 이름만 여섯으로 남는 일을 막는다.
              */
              label: `${STRATEGIES.length}가지 추천`,
              badge: "바로 추천",
              hint: `${STRATEGIES.length}가지 방식 가운데 하나를 고르고 개수를 정해 바로 뽑습니다. 한 가지 기준만 보므로 빠르고, 방식마다 어떤 번호 묶음에서 뽑는지가 다릅니다.`,
              panel: (
                <>
                  <RecommendStudio
                    initialStrategy="ensemble"
                    initialSets={initial?.sets ?? []}
                    initialHotWindow={initial?.hot_window ?? null}
                    // 백엔드가 면책 문구를 내려주지만, 응답이 없을 때도 고지는 사라지면 안 된다.
                    disclaimer={initial?.disclaimer ?? DISCLAIMER.recommend}
                  />
          {/*
            ⚠ 이 자리에 있던 "여섯 가지 기준" 목록을 걷어냈다(2026-09-17). 같은 설명이 이제
              위 카드 안에 들어가 있다(`RecommendStudio` — 여섯 설명 모두 DOM 에 있다).
              같은 문단을 두 번 두면 페이지가 문서처럼 길어지기만 한다.
          */}
                </>
              ),
            },
          ]}
        />

      {/* 생성 버튼 주변에 광고를 두지 않는다. 오클릭을 유도하는 배치로 읽힌다. */}
      <AdSlot slot="recommend-bottom" />
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
                text: "여섯 숫자만 보면 바로 나오는 값입니다. 지금 이 조합에 대한 사실만 담겨 있습니다.",
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
                text: "추첨은 매 회차 새로 진행됩니다. 기준은 재료를 고르는 방식일 뿐입니다.",
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
                text: "그래서 완전 랜덤을 목록 맨 앞에 두었습니다. 나머지를 견주어 볼 기준이 됩니다.",
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
            모양인지 보여 드립니다. 딱 거기까지가 이 도구의 몫입니다.
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
              "여섯 가지는 우열이 아니라 재료의 차이입니다. 어떤 번호 묶음에서 뽑는지가 다를 뿐이고, 추첨은 매 회차 무작위로 진행됩니다. 완전 랜덤을 맨 앞에 둔 것도 그래서입니다. 나머지 다섯을 견주어 볼 기준이 되니까요. 마음이 가는 방식으로 고르시면 됩니다.",
          },
          {
            question: "같은 조합이 또 나올 수 있나요?",
            answer:
              "나올 수 있습니다. 누를 때마다 새로 뽑기 때문에 앞서 만든 조합과 겹칠 수 있습니다. 같은 결과를 다시 보고 싶다면 seed 값을 그대로 주면 됩니다.",
          },
          {
            question: "조합의 성향은 무엇을 계산한 건가요?",
            answer:
              "여섯 숫자만 보면 바로 나오는 값들입니다. 홀수와 짝수의 비율, 23 이상과 이하의 비율, 여섯 수를 더한 합계, 번호대 분포, 연속번호가 들어 있는지, 끝자리가 몇 가지인지입니다. 전부 지금 이 조합의 생김새를 말해 주는 값이고, 앞일에 대한 이야기는 아닙니다.",
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
