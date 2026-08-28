import Link from "next/link";

import { AdSlot } from "@/components/AdSlot";
import { VideoCard } from "@/components/video/VideoCard";
import { Card, EmptyState, MoreLink } from "@/components/Card";
import { Disclaimer } from "@/components/Disclaimer";
import { LottoBall } from "@/components/LottoBall";
import {
  GuideNote,
  GuideSection,
  SpecimenCard,
  SpecimenGrid,
} from "@/components/GuideSection";
import { BallIcon, SlipIcon, SpreadIcon } from "@/components/icons";
import { Faq } from "@/components/Faq";
import { GuideCard } from "@/components/GuideCard";
import { HowRecommendWorks } from "@/components/HowRecommendWorks";
import { LatestRoundCard } from "@/components/LatestRoundCard";
import { NewsList } from "@/components/NewsList";
import { NextDrawCard } from "@/components/NextDrawCard";
import { RecommendCarousel } from "@/components/RecommendCarousel";
import { ServiceTiles } from "@/components/ServiceTiles";
import { HeroArt } from "@/components/HeroArt";
import { StatBoard } from "@/components/StatBoard";
import {
  getFrequency,
  getHotCold,
  getLatestRound,
  getNews,
  getPairs,
  getVideos,
  serverRecommend,
} from "@/lib/api";
import { DISCLAIMER, GUIDES } from "@/lib/site";
import { HOME_STRATEGIES } from "@/lib/strategies";

/** 홈은 추첨 후 갱신된다. → docs/wiki/30-seo/metadata-strategy.md 렌더링 전략 */
export const revalidate = 3600;

/** 홈 통계의 기본 관찰 구간. 시안·초안 모두 최근 20회를 기준으로 한다. */
const HOME_WINDOW = 20;

export default async function HomePage() {
  // 서로 의존하지 않는 요청이므로 병렬로 던진다. 하나가 실패해도 나머지는 그려진다.
  const [latest, hotCold, frequency, pairs, newsPage, videoPage, ...recommends] =
    await Promise.all([
      getLatestRound(),
      getHotCold(HOME_WINDOW),
      getFrequency(HOME_WINDOW),
      getPairs(HOME_WINDOW), // 동반 출현 탭. 백엔드가 아직 안 주면 null → 탭이 "준비 중".
      getNews(1, 3),
      // 영상 3개. 백엔드가 아직 안 만들었으면 빈 봉투 → 그 단이 통째로 빠진다.
      getVideos("all", 1, 3),
      ...HOME_STRATEGIES.map((strategy) => serverRecommend(strategy, 1)),
    ]);

  const carouselItems = HOME_STRATEGIES.map((strategy, index) => ({
    strategy,
    initial: recommends[index]?.sets?.[0] ?? null,
  }));

  const news = newsPage.items;
  const videos = videoPage.items;

  return (
    <div className="container">
      {/* ── 1단: 히어로 ─────────────────────────────── */}
      <section className="hero" aria-labelledby="hero-title">
        <div>
          <p className="hero-eyebrow">복권 데이터를 한눈에 보는 행운상자</p>
          {/*
            줄바꿈 지점을 문장 구조에 맞춘다. 좁은 화면에서 "로또의 모든 / 정보, 여기서"
            처럼 아무 데서나 끊기면 읽는 리듬이 무너진다. 각 절을 inline-block 으로 묶어
            두 절 사이에서만 끊기게 한다.
          */}
          <h1 id="hero-title">
            <span className="hero-line">
              로또의 모든 <em>정보</em>,
            </span>{" "}
            <span className="hero-line">
              <em>여기서 확인</em>하세요
            </span>
          </h1>
          <p>
            최신 당첨결과, 번호 통계, 복권 뉴스, 재미있는 번호 추천까지 한
            곳에서 쉽고 빠르게 확인할 수 있습니다.
          </p>
          {/*
            히어로 CTA 2버튼(002 R7). 'AI' 는 예측이 아니라 '조합' 언어에 정합하게
            "AI 번호 조합 추천" 으로 쓴다([[forbidden-expressions]] AI 라벨 규칙).
            최신 회차는 네비·하단 결과 카드로 접근 가능해 히어로에서 뺀다.
          */}
          <div className="hero-cta">
            <Link className="btn btn-primary" href="/lotto/recommend">
              AI 번호 조합 추천
            </Link>
            <Link className="btn btn-secondary" href="/dream">
              꿈으로 번호찾기
            </Link>
          </div>
        </div>

        {/* 순수 장식. 옆 텍스트가 이미 모든 정보를 전달한다. */}
        <div className="hero-art" aria-hidden="true">
          <HeroArt />
        </div>
      </section>

      {/* ── 2단: 아이콘 6타일 ────────────────────────── */}
      <section className="section" aria-labelledby="services-title">
        {/* 시각적으로는 제목이 없지만 헤딩 계층을 비우지 않는다. */}
        <h2 id="services-title" className="sr-only">
          행운상자의 서비스
        </h2>
        <Card>
          <ServiceTiles />
        </Card>
      </section>

      {/* ── 3단: 최신 회차 · D-day · 뉴스 ──────────────── */}
      <section className="section" aria-labelledby="summary-title">
        <h2 id="summary-title" className="sr-only">
          오늘의 로또 요약
        </h2>
        <div className="split-3">
          <LatestRoundCard round={latest} />
          <NextDrawCard latestRoundNo={latest?.round_no ?? null} />
          <Card
            as="article"
            title="복권 뉴스"
            action={<MoreLink href="/news" />}
          >
            <NewsList items={news} compact limit={3} />
          </Card>
        </div>
      </section>

      {/* ── 4단: 주요 통계 4카드 ──────────────────────── */}
      <section className="section" aria-labelledby="stats-title">
        <div className="section-head">
          <h2 id="stats-title">
            주요 통계
            {/* 관찰 구간의 숫자를 강조한다 — 이 수치가 아래 네 카드 전부의 전제다. */}
            <span className="section-note">
              (최근 <strong>{HOME_WINDOW}</strong>회 기준)
            </span>
          </h2>
          <MoreLink href="/lotto/stat" />
        </div>
        <StatBoard
          hotCold={hotCold}
          frequency={frequency}
          pairs={pairs}
          window={HOME_WINDOW}
        />
        <Disclaimer spaced>{DISCLAIMER.stats}</Disclaimer>
      </section>

      {/* 광고 슬롯은 콘텐츠 사이의 자연스러운 경계에 둔다. '다시 생성' 버튼 주변에 두지 않는다. */}
      <AdSlot slot="home-mid" />

      {/* ── 5단: 오늘의 추천번호 캐러셀 ─────────────────── */}
      <section className="section" aria-labelledby="reco-title">
        <div className="section-head">
          <h2 id="reco-title">
            오늘의 추천 번호
            {/* 카드의 숫자가 생성 조건으로 오해받기 쉽다. 설명을 한 번에 열 수 있게 둔다. */}
            <HowRecommendWorks />
            <span className="section-note">
              여러 기준으로 만든 참고용 번호 조합
            </span>
          </h2>
          <MoreLink href="/lotto/recommend" />
        </div>

        {carouselItems.some((item) => item.initial) ? (
          <RecommendCarousel items={carouselItems} />
        ) : (
          <Card>
            <EmptyState>
              추천번호를 생성하려면 데이터가 더 필요합니다. 통계 기반 방식은
              회차가 50개 이상 쌓인 뒤에 동작합니다.
            </EmptyState>
          </Card>
        )}

        <Disclaimer center spaced>
          {DISCLAIMER.recommend}
        </Disclaimer>
      </section>

      {/*
        ── 영상 3편 ───────────────────────────────────
        ⚠ **여기서 재생하지 않는다.** 썸네일만 걸고 누르면 전용 페이지로 보낸다
          (docs/raw/004-유튜브영상수집계획.md: "홈·카드는 썸네일 3개만"). 임베드
          플레이어는 전용 페이지에만 둔다 — 홈에 iframe 을 깔면 느려지고, 정책 III.G.1.d
          의 "독립적 가치" 판단도 홈까지 끌고 들어오게 된다.
        ⚠ 출처 표시(III.F.2)는 **홈 카드에도** 붙는다. `VideoCard` 가 담당한다.
        ⚠ 영상이 없으면 이 단을 그리지 않는다. 빈 제목만 남은 단은 홈을 얇게 만든다.
      */}
      {videos.length > 0 && (
        <section className="section" aria-labelledby="video-title">
          <div className="section-head">
            <h2 id="video-title">로또 영상</h2>
            <MoreLink href="/videos" />
          </div>
          <ul className="video-grid">
            {videos.map((video) => (
              <li key={video.id}>
                <VideoCard video={video} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── 6단: 로또 가이드 5카드 ─────────────────────── */}
      <section className="section" aria-labelledby="guide-title">
        <div className="section-head">
          <h2 id="guide-title">로또 가이드</h2>
          <MoreLink href="/guide" />
        </div>
        <div className="guide-grid">
          {GUIDES.map((guide) => (
            <GuideCard
              key={guide.slug}
              href={`/guide/${guide.slug}`}
              title={guide.title}
              summary={guide.summary}
              accent={guide.accent}
            />
          ))}
        </div>
      </section>

      {/*
        검색엔진과 애드센스 심사자가 읽는 본문. 아이콘만 있는 홈은 저가치 페이지로 읽힌다.
        이 서비스가 무엇이고 무엇이 아닌지를 사람이 읽는 문장으로 남긴다.
      */}
      {/* ── 서비스 소개: 표본 해부 ───────────────────────── */}
      <GuideSection
        headingId="about-title"
        title="행운상자는 어떤 서비스인가요?"
        lede="로또 6/45의 당첨결과와 번호 통계를 정리해 보여 주는 정보 사이트입니다."
      >
        <SpecimenGrid>
          <SpecimenCard
            accent="news"
            icon={<SlipIcon />}
            title="당첨결과"
            specimen={
              <>
                <LottoBall number={10} size="sm" />
                <LottoBall number={23} size="sm" />
                <LottoBall number={37} size="sm" />
                <span className="muted">1등 23명</span>
              </>
            }
            notes={[
              {
                label: "회차별",
                text: "당첨번호와 보너스 번호, 1등 당첨자 수와 당첨금을 정리합니다.",
              },
              {
                label: "상세",
                text: "그 회차 조합의 홀짝·고저 비율, 합계, 번호대 분포도 함께 봅니다.",
              },
            ]}
            example="2026.08.15 추첨 · 1등 23명 · 12억 1493만 원"
          />

          <SpecimenCard
            accent="lotto"
            icon={<SpreadIcon />}
            title="번호 통계"
            specimen={
              <>
                <span className="spec-minibars" aria-hidden="true">
                  <span
                    className="spec-minibar is-top"
                    style={{ height: "100%" }}
                  />
                  <span className="spec-minibar" style={{ height: "62%" }} />
                  <span className="spec-minibar" style={{ height: "38%" }} />
                </span>
                <span className="muted">최근 20 · 50 · 100회 · 역대 전체</span>
              </>
            }
            notes={[
              {
                label: "무엇을",
                text: "각 번호가 몇 번 나왔는지, 어떤 번호가 오래 나오지 않았는지 봅니다.",
              },
              {
                label: "성격",
                text: "과거 회차의 분포를 이해하기 위한 참고 정보입니다.",
              },
            ]}
            example="최근 20회에서 가장 많이 나온 번호는 6회, 한 번도 안 나온 번호는 0회"
          />

          <SpecimenCard
            accent="reco"
            icon={<BallIcon />}
            title="번호 만들어 보기"
            specimen={
              <>
                <span className="muted">
                  통계 참고 · 번호대 균형 · 완전 랜덤 · 꿈 키워드
                </span>
              </>
            }
            notes={[
              {
                label: "방식",
                text: "여러 기준으로 조합을 만들고, 만들어진 조합의 성향을 설명합니다.",
              },
              {
                label: "한계",
                text: "어떤 방식도 결과에 영향을 주지 않습니다. 그 사실을 감추지 않습니다.",
              },
            ]}
            example="완전 랜덤 · 번호대 균형 · 최근 통계 참고 · 꿈 키워드"
          />
        </SpecimenGrid>

        <GuideNote title="여기서 하지 않는 일">
          <p className="spec-figure">
            <strong>8,145,060</strong>
            <span>
              45개 중 여섯 개를 고르는 방법의 수. 매 회차 모두 같습니다.
            </span>
          </p>
          <p>
            행운상자는{" "}
            <strong>복권을 판매하거나 구매를 대행하지 않습니다.</strong> 복권
            구매는 기획재정부 복권위원회가 지정한 공식 사업자를 통해서만
            가능하며, 19세 미만은 복권을 구매할 수 없습니다.
          </p>
          <p>
            과거에 어떤 번호가 몇 번 나왔든 다음 회차에서 각 조합이 뽑힐
            가능성은 모두 같습니다. 이 사이트는 그 사실 위에서 지나간 기록을
            정리해 보여 줍니다.
          </p>
        </GuideNote>
      </GuideSection>

      <Faq
        headingId="home-faq"
        intro="행운상자를 처음 보신다면 이 정도만 알면 충분합니다."
        items={[
          {
            question: "여기서 복권을 살 수 있나요?",
            answer:
              "살 수 없습니다. 행운상자는 당첨결과와 통계를 정리해 보여 주는 정보 사이트이고, 복권을 판매하거나 구매를 대행하지 않습니다. 복권 구매는 기획재정부 복권위원회가 지정한 공식 사업자를 통해서만 가능합니다.",
          },
          {
            question: "당첨결과는 언제 갱신되나요?",
            answer:
              "추첨은 매주 토요일 저녁에 있고, 결과가 공개되면 수집해서 반영합니다. 다만 실제 당첨 여부와 당첨금은 반드시 공식 발표로 확인해 주세요.",
          },
          {
            question: "통계를 보면 어떤 번호가 좋은지 알 수 있나요?",
            answer:
              "알 수 없습니다. 통계는 지나간 회차의 기록이고, 추첨은 매번 독립적으로 이루어집니다. 45개 중 여섯 개를 고르는 8,145,060가지 조합은 매 회차 똑같은 가능성을 가집니다. 통계는 내가 늘 쓰는 번호가 그동안 어떻게 지냈는지 살펴보는 용도로 봐 주세요.",
          },
          {
            question: "이용료가 있나요?",
            answer:
              "없습니다. 모든 기능을 무료로 이용하실 수 있고, 번호를 판매하지도 않습니다.",
          },
        ]}
      />
    </div>
  );
}
