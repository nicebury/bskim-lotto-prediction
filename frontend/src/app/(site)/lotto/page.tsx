import Link from "next/link";
import type { Metadata } from "next";

import { AdSlot } from "@/components/AdSlot";
import { Breadcrumb } from "@/components/Breadcrumb";
import { Card, MoreLink } from "@/components/Card";
import { Disclaimer } from "@/components/Disclaimer";
import { LottoBall } from "@/components/LottoBall";
import {
  GuideNote,
  GuideSection,
  SpecimenCard,
  SpecimenGrid,
} from "@/components/GuideSection";
import { BallIcon, TableRowIcon, TrendIcon } from "@/components/icons";
import { Faq } from "@/components/Faq";
import { LatestRoundCard } from "@/components/LatestRoundCard";
import { NewsList } from "@/components/NewsList";
import { NextDrawCard } from "@/components/NextDrawCard";
import { StatBoard } from "@/components/StatBoard";
import {
  getFrequency,
  getHotCold,
  getLatestRound,
  getNews,
  getPairs,
} from "@/lib/api";
import { DISCLAIMER } from "@/lib/site";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "로또 6/45 대시보드 — 최신 당첨결과와 번호 통계",
  description:
    "최신 회차 당첨번호, 최근 20회 많이 나온 번호와 안 나오던 번호, 출현 빈도, 패턴 요약을 한눈에 봅니다.",
  alternates: { canonical: "/lotto" },
  openGraph: {
    type: "website",
    url: "/lotto",
    title: "로또 6/45 대시보드 — 최신 당첨결과와 번호 통계",
    description:
      "최신 회차 당첨번호, 최근 20회 많이 나온 번호와 안 나오던 번호, 출현 빈도, 패턴 요약을 한눈에 봅니다.",
  },
};

const WINDOW = 20;

/**
 * 로또 대시보드. 홈보다 데이터 중심으로 구성하되 카드 수를 늘리지 않는다.
 * 첫 화면에서 모든 것을 보여주려 하지 않고 "자세히 보기"로 상세 페이지 이동을 유도한다.
 * → docs/raw/작업지시초안.md 7장
 */
export default async function LottoDashboardPage() {
  const [latest, hotCold, frequency, pairs, newsPage] = await Promise.all([
    getLatestRound(),
    getHotCold(WINDOW),
    getFrequency(WINDOW),
    getPairs(WINDOW),
    getNews(1, 4),
  ]);

  const news = newsPage.items;

  return (
    <div className="container">
      <Breadcrumb
        items={[
          { name: "홈", href: "/" },
          { name: "로또 6/45", href: "/lotto" },
        ]}
      />

      <section className="section">
        <h1>로또 6/45 대시보드</h1>
        <p className="muted" style={{ marginTop: "var(--space-2)" }}>
          최신 회차 당첨번호와 최근 {WINDOW}회 기준 번호 통계를 정리했습니다.
        </p>
      </section>

      {/* 상단: 최신 회차 + 다음 추첨 */}
      <section className="section" aria-labelledby="latest-title">
        <h2 id="latest-title" className="sr-only">
          최신 회차와 다음 추첨 일정
        </h2>
        <div className="split-3">
          <LatestRoundCard round={latest} />
          <NextDrawCard latestRoundNo={latest?.round_no ?? null} />
          <Card
            as="article"
            title="최근 복권 뉴스"
            action={<MoreLink href="/news" />}
          >
            <NewsList items={news} compact limit={4} />
          </Card>
        </div>
      </section>

      {/* 중단: 주요 통계 (홈과 같은 StatBoard) */}
      <section className="section" aria-labelledby="stat-title">
        <div className="section-head">
          <h2 id="stat-title">
            번호 통계
            <span className="section-note">
              (최근 <strong>{WINDOW}</strong>회 기준)
            </span>
          </h2>
          <MoreLink href="/lotto/stat" />
        </div>

        <StatBoard
          hotCold={hotCold}
          frequency={frequency}
          pairs={pairs}
          window={WINDOW}
        />

        <Disclaimer spaced>{DISCLAIMER.stats}</Disclaimer>
      </section>

      <AdSlot slot="lotto-mid" />

      {/* 하단: 추천·꿈해몽 진입 */}
      <section className="section" aria-labelledby="entry-title">
        <h2 id="entry-title" className="sr-only">
          번호 생성 서비스
        </h2>
        <div className="split-3" style={{ gridTemplateColumns: "1fr" }}>
          <div
            className="guide-grid"
            style={{
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            }}
          >
            <article>
              <Link
                className="guide-card"
                href="/lotto/recommend"
                data-accent="reco"
              >
                <h3>통계와 AI 기반 추천번호 생성</h3>
                <p>
                  랜덤, 번호대 균형, 최근 통계 참고 등 여섯 가지 방식으로 번호를
                  만들고 조합의 성향을 확인합니다.
                </p>
                <span className="more-link">
                  번호 생성하기 <span aria-hidden="true">›</span>
                </span>
              </Link>
            </article>
            <article>
              <Link className="guide-card" href="/dream" data-accent="dream">
                <h3>꿈해몽 번호 추천</h3>
                <p>
                  꿈에서 본 장면을 입력하면 뜻이 비슷한 단어까지 찾아 참고용
                  번호를 만듭니다.
                </p>
                <span className="more-link">
                  꿈해몽 보기 <span aria-hidden="true">›</span>
                </span>
              </Link>
            </article>
          </div>
        </div>
      </section>

      {/* 검색엔진이 읽는 본문. 표만 있는 페이지로 만들지 않는다. */}
      {/* ── 규칙: 표본 해부 ─────────────────────────────── */}
      <GuideSection
        headingId="about-lotto"
        title="로또 6/45는 어떻게 진행되나요?"
        lede="1부터 45까지 중 여섯 개를 고르는 게임입니다. 숫자는 설명용 예시입니다."
      >
        <SpecimenGrid>
          <SpecimenCard
            accent="news"
            icon={<BallIcon />}
            title="한 회차에 뽑는 공"
            specimen={
              <>
                <LottoBall number={10} size="sm" />
                <LottoBall number={20} size="sm" />
                <LottoBall number={23} size="sm" />
                <span className="ball-plus" aria-hidden="true">
                  +
                </span>
                <LottoBall number={36} size="sm" bonus />
              </>
            }
            notes={[
              {
                label: "당첨번호",
                text: "여섯 개를 뽑습니다. 순서는 등수 판정에 관계없습니다.",
              },
              {
                label: "보너스",
                text: "일곱 번째로 한 개 더 뽑습니다. 2등을 가릴 때만 씁니다.",
              },
              { label: "추첨", text: "매주 토요일 저녁에 진행됩니다." },
            ]}
            example="10 · 20 · 23 · 34 · 37 · 40 + 보너스 36"
          />

          <SpecimenCard
            accent="lotto"
            icon={<TableRowIcon />}
            title="등수는 맞은 개수로"
            specimen={
              <>
                <span className="spec-rank">1등</span>
                <span className="muted">6개</span>
                <span className="spec-rank">2등</span>
                <span className="muted">5개 + 보너스</span>
                <span className="spec-rank">3등</span>
                <span className="muted">5개</span>
              </>
            }
            notes={[
              { label: "4·5등", text: "네 개는 4등, 세 개는 5등입니다." },
              {
                label: "당첨금",
                text: "등수와 그 회차 당첨자 수에 따라 달라집니다.",
              },
            ]}
            example="여섯 개 모두 맞히면 1등, 세 개면 5등"
          />

          <SpecimenCard
            accent="reco"
            icon={<TrendIcon />}
            title="통계에 붙은 이름"
            specimen={
              <>
                <span className="trend trend-up">
                  <span aria-hidden="true">↑</span>
                  <span className="sr-only">후반에 더</span>
                </span>
                <span className="muted">자주 나온 번호</span>
                <span className="trend trend-flat">
                  <span aria-hidden="true">—</span>
                  <span className="sr-only">비슷</span>
                </span>
                <span className="muted">안 나오던 번호</span>
              </>
            }
            notes={[
              {
                label: "뜻",
                text: "지난 회차를 요약한 이름입니다. 추첨은 매 회차 독립적으로 이루어집니다.",
              },
              {
                label: "주의",
                text: "최근에 자주 나왔거나 오래 나오지 않았다는 사실은 다음 회차에 아무 영향도 주지 않습니다.",
              },
            ]}
            example="“자주 나온 번호” = 지난 20회에 많이 나왔다는 기록"
          />
        </SpecimenGrid>

        <GuideNote title="이 통계는 무엇에 쓰나요">
          <p className="spec-figure">
            <strong>8,145,060</strong>
            <span>
              45개 중 여섯 개를 고르는 방법의 수. 매 회차 모두 같습니다.
            </span>
          </p>
          <p>
            지난 회차에서 각 번호가 몇 번 나왔는지 세어 정리한 자료입니다. 내가
            늘 쓰는 번호가 그동안 어떻게 지냈는지 확인하는 데 쓰고, 다음 회차를
            고르는 근거로 쓰지 않습니다.
          </p>
          <p>
            번호를 고르는 방식은{" "}
            <Link href="/guide/auto-vs-manual">자동과 수동의 차이</Link>, 기본
            규칙은 <Link href="/guide/lotto-rule">로또 기본 규칙</Link>에
            정리했습니다.
          </p>
        </GuideNote>
      </GuideSection>

      <Faq
        headingId="lotto-faq"
        intro="로또 6/45 를 처음 접하실 때 가장 많이 묻는 것들입니다."
        items={[
          {
            question: "추첨은 언제 하나요?",
            answer:
              "매주 토요일 저녁에 추첨합니다. 결과는 추첨 직후 공식 채널에 공개되고, 이 페이지도 수집이 끝나는 대로 반영합니다. 조금 늦게 보이더라도 잠시 기다리시면 됩니다.",
          },
          {
            question: "보너스 번호는 왜 따로 뽑나요?",
            answer:
              "2등을 가리기 위해서입니다. 당첨번호 다섯 개를 맞힌 사람이 여럿일 때, 남은 한 자리가 보너스 번호와 같은 사람을 2등으로 구분합니다. 그래서 보너스 번호는 2등 판정에만 쓰이고 다른 등수에는 관여하지 않습니다.",
          },
          {
            question: "자동과 수동 중 어느 쪽이 유리한가요?",
            answer:
              "당첨 판정에는 아무 차이가 없습니다. 추첨기는 그 번호를 사람이 골랐는지 기계가 골랐는지 알지 못하니까요. 1등이 자동에서 많이 나온다는 이야기가 있지만, 그건 애초에 자동으로 사는 사람이 훨씬 많기 때문입니다.",
          },
          {
            question: "여기서 복권을 살 수 있나요?",
            answer:
              "살 수 없습니다. 행운상자는 당첨결과와 통계를 정리해 보여 주는 정보 사이트이고, 복권을 판매하거나 구매를 대행하지 않습니다. 복권 구매는 기획재정부 복권위원회가 지정한 공식 사업자를 통해서만 가능합니다.",
          },
        ]}
      />
    </div>
  );
}
