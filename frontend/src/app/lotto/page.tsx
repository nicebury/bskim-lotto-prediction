import Link from 'next/link'
import type { Metadata } from 'next'

import { AdSlot } from '@/components/AdSlot'
import { Breadcrumb } from '@/components/Breadcrumb'
import { Card, EmptyState, MoreLink } from '@/components/Card'
import { Disclaimer } from '@/components/Disclaimer'
import { LatestRoundCard } from '@/components/LatestRoundCard'
import { NewsList } from '@/components/NewsList'
import { NextDrawCard } from '@/components/NextDrawCard'
import { ColdCard, FrequencyCard, HotCard, PatternCard } from '@/components/StatCards'
import { OverdueList } from '@/components/stats'
import { getFrequency, getHotCold, getLatestRound, getNews, getPattern } from '@/lib/api'
import { DISCLAIMER } from '@/lib/site'

export const revalidate = 3600

export const metadata: Metadata = {
  title: '로또 6/45 대시보드 — 최신 당첨결과와 번호 통계',
  description:
    '최신 회차 당첨번호, 최근 20회 HOT·COLD 번호, 출현 빈도, 패턴 요약을 한눈에 봅니다.',
  alternates: { canonical: '/lotto' },
  openGraph: {
    type: 'website',
    url: '/lotto',
    title: '로또 6/45 대시보드 — 최신 당첨결과와 번호 통계',
    description:
      '최신 회차 당첨번호, 최근 20회 HOT·COLD 번호, 출현 빈도, 패턴 요약을 한눈에 봅니다.',
  },
}

const WINDOW = 20

/**
 * 로또 대시보드. 홈보다 데이터 중심으로 구성하되 카드 수를 늘리지 않는다.
 * 첫 화면에서 모든 것을 보여주려 하지 않고 "자세히 보기"로 상세 페이지 이동을 유도한다.
 * → docs/raw/작업지시초안.md 7장
 */
export default async function LottoDashboardPage() {
  const [latest, hotCold, frequency, pattern, newsPage] = await Promise.all([
    getLatestRound(),
    getHotCold(WINDOW),
    getFrequency(WINDOW),
    getPattern(WINDOW),
    getNews(1, 4),
  ])

  const news = newsPage.items

  return (
    <div className="container">
      <Breadcrumb
        items={[
          { name: '홈', href: '/' },
          { name: '로또 6/45', href: '/lotto' },
        ]}
      />

      <section className="section">
        <h1>로또 6/45 대시보드</h1>
        <p className="muted" style={{ marginTop: 'var(--space-2)' }}>
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
          <Card as="article" title="최근 복권 뉴스" action={<MoreLink href="/news" />}>
            <NewsList items={news} compact limit={4} />
          </Card>
        </div>
      </section>

      {/* 중단: 통계 4카드 + 오래 안 나온 번호 */}
      <section className="section" aria-labelledby="stat-title">
        <div className="section-head">
          <h2 id="stat-title">
            번호 통계
            <span className="section-note">(최근 {WINDOW}회 기준)</span>
          </h2>
          <MoreLink href="/lotto/stat" />
        </div>

        <div className="stat-grid">
          <HotCard data={hotCold} />
          <ColdCard data={hotCold} />
          <FrequencyCard data={frequency} />
          <PatternCard data={pattern} />
        </div>

        <div style={{ marginTop: 'var(--space-4)' }}>
          <Card
            as="article"
            title="오래 안 나온 번호"
            titleAs="h3"
            action={<MoreLink href="/lotto/stat/hot-cold" />}
          >
            {hotCold && hotCold.overdue.length > 0 ? (
              <OverdueList items={hotCold.overdue.slice(0, 5)} />
            ) : (
              <EmptyState>통계를 불러오지 못했습니다.</EmptyState>
            )}
            <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: 'var(--space-3)' }}>
              마지막 출현 이후 지난 회차 수입니다. 오래 나오지 않았다고 해서 나올 차례가 된 것은
              아닙니다.
            </p>
          </Card>
        </div>

        <Disclaimer spaced>{DISCLAIMER.stats}</Disclaimer>
      </section>

      <AdSlot slot="lotto-mid" />

      {/* 하단: 추천·꿈해몽 진입 */}
      <section className="section" aria-labelledby="entry-title">
        <h2 id="entry-title" className="sr-only">
          번호 생성 서비스
        </h2>
        <div className="split-3" style={{ gridTemplateColumns: '1fr' }}>
          <div className="guide-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
            <article>
              <Link className="guide-card" href="/lotto/recommend" data-accent="reco">
                <h3>재미용 추천번호 생성</h3>
                <p>
                  랜덤, 번호대 균형, 최근 통계 참고 등 여섯 가지 방식으로 번호를 만들고 조합의
                  성향을 확인합니다.
                </p>
                <span className="more-link">
                  번호 생성하기 <span aria-hidden="true">›</span>
                </span>
              </Link>
            </article>
            <article>
              <Link className="guide-card" href="/dream" data-accent="dream">
                <h3>꿈해몽 번호 추천</h3>
                <p>꿈에서 본 장면을 입력하면 관련 키워드를 찾아 재미용 번호를 만듭니다.</p>
                <span className="more-link">
                  꿈해몽 보기 <span aria-hidden="true">›</span>
                </span>
              </Link>
            </article>
          </div>
        </div>
      </section>

      {/* 검색엔진이 읽는 본문. 표만 있는 페이지로 만들지 않는다. */}
      <section className="section prose" aria-labelledby="about-lotto">
        <h2 id="about-lotto">로또 6/45는 어떻게 진행되나요?</h2>
        <p>
          로또 6/45는 1부터 45까지의 번호 중 6개를 고르는 게임입니다. 매주 토요일 저녁 추첨에서
          당첨번호 6개와 보너스 번호 1개가 나옵니다. 6개를 모두 맞히면 1등, 5개와 보너스 번호를
          맞히면 2등, 5개를 맞히면 3등, 4개는 4등, 3개는 5등입니다. 보너스 번호는 2등 판정에만
          쓰입니다.
        </p>
        <p>
          이 페이지의 통계는 과거 회차에서 각 번호가 몇 번 나왔는지를 세어 정리한 것입니다.
          최근에 자주 나온 번호를 HOT, 적게 나온 번호를 COLD라고 부르지만 이는 지난 회차를 요약한
          이름일 뿐입니다. 추첨은 매 회차 독립적으로 이루어지므로, 특정 번호가 최근에 자주
          나왔거나 오래 나오지 않았다는 사실은 다음 회차의 결과에 아무런 영향을 주지 않습니다.
        </p>
        <p>
          번호를 고르는 방법이 궁금하다면{' '}
          <Link href="/guide/auto-vs-manual">자동과 수동의 차이</Link>를, 통계를 어떻게 읽어야
          하는지 궁금하다면 <Link href="/guide/lotto-rule">로또 기본 규칙</Link>을 함께 보세요.
        </p>
      </section>
    </div>
  )
}
