import Link from 'next/link'

import { AdSlot } from '@/components/AdSlot'
import { Card, EmptyState, MoreLink } from '@/components/Card'
import { Disclaimer } from '@/components/Disclaimer'
import { GuideCard } from '@/components/GuideCard'
import { HowRecommendWorks } from '@/components/HowRecommendWorks'
import { LatestRoundCard } from '@/components/LatestRoundCard'
import { NewsList } from '@/components/NewsList'
import { NextDrawCard } from '@/components/NextDrawCard'
import { RecommendCarousel } from '@/components/RecommendCarousel'
import { ServiceTiles } from '@/components/ServiceTiles'
import { HeroArt } from '@/components/HeroArt'
import { ColdCard, FrequencyCard, HotCard, PatternCard } from '@/components/StatCards'
import {
  getFrequency,
  getHotCold,
  getLatestRound,
  getNews,
  getPattern,
  serverRecommend,
} from '@/lib/api'
import { DISCLAIMER, GUIDES } from '@/lib/site'
import { HOME_STRATEGIES } from '@/lib/strategies'

/** 홈은 추첨 후 갱신된다. → docs/wiki/30-seo/metadata-strategy.md 렌더링 전략 */
export const revalidate = 3600

/** 홈 통계의 기본 관찰 구간. 시안·초안 모두 최근 20회를 기준으로 한다. */
const HOME_WINDOW = 20

export default async function HomePage() {
  // 서로 의존하지 않는 요청이므로 병렬로 던진다. 하나가 실패해도 나머지는 그려진다.
  const [latest, hotCold, frequency, pattern, newsPage, ...recommends] = await Promise.all([
    getLatestRound(),
    getHotCold(HOME_WINDOW),
    getFrequency(HOME_WINDOW),
    getPattern(HOME_WINDOW),
    getNews(1, 3),
    ...HOME_STRATEGIES.map((strategy) => serverRecommend(strategy, 1)),
  ])

  const carouselItems = HOME_STRATEGIES.map((strategy, index) => ({
    strategy,
    initial: recommends[index]?.sets?.[0] ?? null,
  }))

  const news = newsPage.items

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
            </span>{' '}
            <span className="hero-line">
              <em>여기서 확인</em>하세요
            </span>
          </h1>
          <p>
            최신 당첨결과, 번호 통계, 복권 뉴스, 재미있는 번호 추천까지 한 곳에서 쉽고 빠르게
            확인할 수 있습니다.
          </p>
          <div className="hero-cta">
            <Link className="btn btn-primary" href="/lotto/latest">
              최신 로또 결과 보기
            </Link>
            <Link className="btn btn-secondary" href="/lotto/recommend">
              번호 추천 시뮬레이션
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
          <Card as="article" title="복권 뉴스" action={<MoreLink href="/news" />}>
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
        <div className="stat-grid">
          <HotCard data={hotCold} />
          <ColdCard data={hotCold} />
          <FrequencyCard data={frequency} />
          <PatternCard data={pattern} />
        </div>
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
            <span className="section-note">다양한 방식으로 생성한 재미용 번호</span>
          </h2>
          <MoreLink href="/lotto/recommend" />
        </div>

        {carouselItems.some((item) => item.initial) ? (
          <RecommendCarousel items={carouselItems} />
        ) : (
          <Card>
            <EmptyState>
              추천번호를 생성하려면 데이터가 더 필요합니다. 통계 기반 방식은 회차가 50개 이상
              쌓인 뒤에 동작합니다.
            </EmptyState>
          </Card>
        )}

        <Disclaimer center spaced>
          {DISCLAIMER.recommend}
        </Disclaimer>
      </section>

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
      <section className="section prose" aria-labelledby="about-title">
        <h2 id="about-title">행운상자는 어떤 서비스인가요?</h2>
        <p>
          행운상자는 로또 6/45의 당첨결과와 번호 통계를 정리해 보여주는 복권 정보 대시보드입니다.
          매주 토요일 추첨이 끝나면 당첨번호와 보너스 번호, 1등 당첨자 수와 당첨금을 회차별로
          정리합니다. 회차 상세 페이지에서는 그 회차 번호 조합이 어떤 성향을 가졌는지 — 홀짝
          비율, 고저 비율, 번호 합계, 번호대 분포 — 를 함께 볼 수 있습니다.
        </p>
        <p>
          번호 통계 페이지에서는 최근 20회, 50회, 100회, 역대 전체를 기준으로 각 번호가 몇 번
          나왔는지, 어떤 번호가 오래 나오지 않았는지를 확인할 수 있습니다. 통계는 과거 회차의
          분포를 이해하기 위한 참고 정보입니다. 로또 번호는 매 회차 무작위로 추첨되며, 45개 중
          6개를 고르는 조합의 수는 8,145,060가지입니다. 과거에 어떤 번호가 몇 번 나왔든 다음
          회차에서 각 조합이 뽑힐 가능성은 모두 같습니다.
        </p>
        <p>
          번호 추천은 재미용 시뮬레이션입니다. 완전 랜덤부터 번호대 균형, 최근 통계 참고까지 여러
          방식으로 조합을 만들고, 만들어진 조합의 성향을 설명합니다. 어떤 방식도 당첨 결과에
          영향을 주지 않으며, 행운상자는 복권을 판매하거나 구매를 대행하지 않습니다. 복권 구매는
          기획재정부 복권위원회가 지정한 공식 사업자를 통해서만 가능하며, 19세 미만은 복권을
          구매할 수 없습니다.
        </p>
      </section>
    </div>
  )
}
