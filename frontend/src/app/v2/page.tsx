/**
 * 새 메인 화면 시안 `/v2`.
 *
 * 운영 홈(`src/app/page.tsx`)을 **교체하지 않는다.** 전혀 다른 디자인 언어의 메인을 하나 더
 * 두고 두 안을 비교하기 위한 화면이다. 컨셉과 규칙의 정본은
 * `docs/wiki/20-design/home-v2-concept.md` 다.
 *
 * 시그니처는 45칸 격자 하나다. 히어로에서 최신 당첨번호를 마킹으로 보여주고, 스크롤이
 * 통계 구간에 닿으면 같은 격자가 최근 20회 히트맵으로 번진다. 격자는 그 구간 내내
 * `sticky` 로 화면에 남는다.
 */
import Link from 'next/link'

import {
  getFrequency,
  getHotCold,
  getLatestRound,
  getNews,
  getPairs,
  serverRecommend,
} from '@/lib/api'
import { SITE_NAME } from '@/lib/env'
import { formatDrawDate } from '@/lib/format'
import { dDay, nextDrawTime, nextRoundNo, toKstDateTimeString } from '@/lib/lotto'
import { DISCLAIMER } from '@/lib/site'
import { HOME_STRATEGIES } from '@/lib/strategies'

import { HbBallRow } from './_components/HbBalls'
import { HbCountdown } from './_components/HbCountdown'
import { HbMarkGrid } from './_components/HbMarkGrid'
import { HbNumberStack } from './_components/HbNumberStack'
import { HbPhaseScope } from './_components/HbPhaseScope'
import { HbAbout, HbGuides, HbNews, HbServices } from './_components/HbSections'
import { HbShaderCanvas } from './_components/HbShaderCanvas'
import { HbDock, HbHeader } from './_components/HbShell'
import { buildRows, gridAriaLabel } from './_lib/grid'

import type { Metadata } from 'next'

/**
 * 운영 홈과 같은 성격의 화면이므로 같은 재검증 주기(1시간)를 쓴다.
 *
 * ⚠ 리터럴이어야 한다. `REVALIDATE.home` 처럼 참조로 쓰면 Next.js 의 정적 분석기가
 *   `Unsupported node type "MemberExpression"` 으로 빌드를 거부한다 — 세그먼트 설정은
 *   번들 이전에 읽히기 때문이다. 값의 정본은 `src/lib/api.ts` 의 REVALIDATE.home 이므로
 *   그쪽이 바뀌면 여기도 함께 고친다.
 *
 * 주기를 더 짧게 잡고 싶은 유혹이 있지만, 재검증마다 `serverRecommend` 5개가 백엔드의
 * 몬테카를로를 돌린다. 1시간이 그 비용과 신선도의 균형점이다.
 */
export const revalidate = 3600

/** 격자 히트맵과 통계 요약의 관찰 구간. 운영 홈과 같은 20회를 쓴다. */
const WINDOW = 20

/**
 * ⚠ 이 화면은 **검색에 노출하지 않는다.**
 *
 * - `robots.index:false` 가 정본이다. 루트 레이아웃이 `index:true` 를 선언하므로 통째로 덮는다.
 * - `alternates.canonical` 을 반드시 명시한다. 생략하면 루트의 `canonical: '/'` 를 상속해
 *   **이 페이지가 자기를 홈이라고 주장한다.**
 * - `sitemap.ts` 는 URL 화이트리스트라 아무것도 하지 않으면 자동으로 빠진다.
 * - `robots.txt` 에는 `Disallow` 를 넣지 않는다 — 크롤을 막으면 크롤러가 이 noindex 를
 *   읽지 못해 오히려 URL 만 색인될 수 있다.
 * → docs/wiki/30-seo/metadata-strategy.md 비공개 프리뷰 라우트
 */
export const metadata: Metadata = {
  title: '새 메인 시안 (v2)',
  description:
    '로또 6/45 당첨결과·번호 통계·재미용 번호 조합을 하나의 번호판에서 보는 새 메인 화면 시안입니다.',
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
  alternates: { canonical: '/v2' },
}

export default async function V2Page() {
  // 서로 의존하지 않는 요청이라 병렬로 던진다. 하나가 실패해도 나머지는 그려진다.
  const [latest, hotCold, frequency, pairs, newsPage, ...recommends] = await Promise.all([
    getLatestRound(),
    getHotCold(WINDOW),
    getFrequency(WINDOW),
    getPairs(WINDOW),
    getNews(1, 3),
    ...HOME_STRATEGIES.map((strategy) => serverRecommend(strategy, 1)),
  ])

  const rows = buildRows(latest, frequency)
  const stackItems = HOME_STRATEGIES.map((strategy, index) => ({
    strategy,
    initial: recommends[index]?.sets?.[0] ?? null,
  }))

  /*
    ⚠ 서버가 계산한 시각은 ISR 캐시에 굳는다. 토요일 20:35 직후 최대 한 시간 동안 이전
    상태가 남을 수 있다 — 운영 홈의 NextDrawCard 와 같은 트레이드오프다. 남은 시간의
    초 단위 표시는 클라이언트(HbCountdown)가 브라우저 시각으로 채운다.
  */
  const drawMs = nextDrawTime()
  const remainDays = dDay(Date.now(), drawMs)
  const upcomingRound = nextRoundNo(latest?.round_no)

  const hot = hotCold?.hot?.slice(0, 5) ?? []
  const overdue = hotCold?.overdue?.slice(0, 5) ?? []
  const topPairs = pairs?.pairs?.slice(0, 3) ?? []
  const analyzed = hotCold?.rounds_analyzed ?? frequency?.rounds_analyzed ?? null

  return (
    <>
      <HbHeader />

      {/*
        히어로 텍스트 · 격자 · 통계를 한 그리드로 묶는다. 격자가 이 스테이지 범위 안에서만
        sticky 로 붙어야 하므로 세 조각이 같은 부모여야 한다.
        DOM 순서는 히어로 → 격자 → 통계다. 모바일(1열)에서 그대로 읽히는 순서이고,
        <h1> 이 문서 맨 앞에 오는 순서이기도 하다.
      */}
      <HbPhaseScope>
        {/* 셰이더는 순수 장식이다. 정보는 전부 아래 텍스트와 격자가 전달한다. */}
        <HbShaderCanvas seed={(latest?.round_no ?? 0) % 100} />

        <section className="hb-hero" aria-labelledby="hb-hero-title">
          <p className="hb-eyebrow">
            {upcomingRound ? `제${upcomingRound}회 추첨까지` : '다음 추첨까지'}
            <span className="hb-eyebrow-dday">{remainDays === 0 ? 'D-DAY' : `D-${remainDays}`}</span>
            <HbCountdown drawTimeMs={drawMs} />
          </p>

          <h1 id="hb-hero-title">
            45칸 중, <em>여섯 칸</em>
          </h1>

          <p className="hb-lede">
            이번 주 당첨번호와 최근 {WINDOW}회의 흐름을 하나의 번호판에서 봅니다. 번호판의 다섯
            줄은 각각 볼 색이 같은 구간입니다.
          </p>

          <p className="hb-hero-when">
            다음 추첨{' '}
            <time dateTime={toKstDateTimeString(drawMs)}>
              {formatDrawDate(toKstDateTimeString(drawMs).slice(0, 10))} 오후 8시 35분경
            </time>
          </p>

          <div className="hb-cta">
            <a className="hb-btn hb-btn-primary" href="#hb-pick">
              번호 뽑아보기
            </a>
            <Link className="hb-btn hb-btn-quiet" href="/lotto">
              지난 회차 보기
            </Link>
          </div>
        </section>

        {/* ── 시그니처: 45칸 격자 (스테이지 안에서 sticky) ───────────── */}
        <div className="hb-gridpanel">
          <HbMarkGrid rows={rows} ariaLabel={gridAriaLabel(latest, WINDOW)} />

          <div className="hb-gridcap">
            {latest ? (
              <>
                <p className="hb-gridcap-head">
                  <span className="hb-round">제{latest.round_no}회</span>
                  <time dateTime={latest.draw_date}>{formatDrawDate(latest.draw_date)}</time>
                </p>
                <HbBallRow numbers={latest.numbers} bonus={latest.bonus} />
              </>
            ) : (
              <p className="hb-empty">
                최신 회차를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.
              </p>
            )}

            {/*
              격자의 두 상태를 말로 설명한다. 색 변화만으로 무슨 일이 일어났는지 전달하면
              색각 이상이 있는 사용자와 모션을 끈 사용자에게 닿지 않는다.
            */}
            <p className="hb-gridcap-legend">
              <span className="hb-legend-mark" data-on="mark">
                진한 칸 = 이번 회차 당첨번호
              </span>
              <span className="hb-legend-mark" data-on="heat">
                밝은 칸 = 최근 {WINDOW}회에 자주 나온 번호
              </span>
              <span className="hb-legend-mark" data-on="bonus">
                테두리 칸 = 보너스 번호
              </span>
            </p>
          </div>
        </div>

        {/* ── 통계 — 이 섹션이 화면 중앙에 닿으면 격자가 히트맵으로 바뀐다 ── */}
        <section className="hb-stats" aria-labelledby="hb-stats-title" data-hb-sentinel="">
          <h2 id="hb-stats-title">
            최근 {WINDOW}회, 어느 칸이 자주 나왔나
            {analyzed !== null && <span className="hb-note">집계 {analyzed}회차</span>}
          </h2>

          {hot.length === 0 && overdue.length === 0 ? (
            <p className="hb-empty">
              통계를 불러오지 못했습니다. 번호판의 밝기는 데이터가 도착하면 채워집니다.
            </p>
          ) : (
            <div className="hb-statgrid">
              {hot.length > 0 && (
                <div className="hb-statblock">
                  <h3>자주 나온 번호</h3>
                  <ul className="hb-statlist">
                    {hot.map((item) => (
                      <li key={item.number}>
                        <HbBallRow numbers={[item.number]} />
                        <span className="hb-statlist-value">{item.count}회</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {overdue.length > 0 && (
                <div className="hb-statblock">
                  {/* 화면에 영문 라벨을 쓰지 않는다(002 R9). 내부 필드명만 유지한다. */}
                  <h3>안 나오던 번호</h3>
                  <ul className="hb-statlist">
                    {overdue.map((item) => (
                      <li key={item.number}>
                        <HbBallRow numbers={[item.number]} />
                        <span className="hb-statlist-value">{item.rounds_since}회째</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="hb-statblock">
                <h3>함께 나온 짝</h3>
                {topPairs.length > 0 ? (
                  <ul className="hb-statlist hb-statlist-pair">
                    {topPairs.map((pair) => (
                      <li key={pair.numbers.join('-')}>
                        <HbBallRow numbers={[...pair.numbers]} />
                        <span className="hb-statlist-value">{pair.count}회</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="hb-empty">준비 중입니다.</p>
                )}
              </div>
            </div>
          )}

          <p className="hb-more">
            <Link href="/lotto/stat">번호 통계 전체 보기</Link>
          </p>

          {/* 통계 화면에는 면책이 반드시 붙는다(→ 40-domain/forbidden-expressions.md). */}
          <p className="hb-disclaimer">{DISCLAIMER.stats}</p>
        </section>
      </HbPhaseScope>

      {/* ── 번호 뽑기 ─────────────────────────────────────────── */}
      <section className="hb-section" id="hb-pick" aria-labelledby="hb-pick-title">
        {/* 데스크톱에서는 설명과 스택을 2열로 나눈다 — 스택만 가운데 뜨면 제목과 축이 어긋난다. */}
        <div className="hb-wrap hb-pick">
          <div className="hb-pick-intro">
            <h2 id="hb-pick-title">여섯 칸 골라보기</h2>
            <p className="hb-section-lede">
              다섯 가지 방식으로 조합을 만듭니다. 어떤 방식도 추첨 결과에 영향을 주지 않으며,
              맨 앞의 완전 랜덤이 나머지를 견줄 기준입니다.
            </p>
            <p className="hb-disclaimer">{DISCLAIMER.recommend}</p>
          </div>

          <div className="hb-pick-stack">
            {stackItems.some((item) => item.initial) ? (
              <HbNumberStack items={stackItems} />
            ) : (
              <p className="hb-empty">
                조합을 만들려면 데이터가 더 필요합니다. 통계 기반 방식은 회차가 50개 이상 쌓인
                뒤에 동작합니다.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ── 조용한 구역 ───────────────────────────────────────── */}
      <section className="hb-section" aria-labelledby="hb-services-title">
        <div className="hb-wrap">
          <h2 id="hb-services-title">{SITE_NAME}에서 할 수 있는 것</h2>
          <HbServices />
        </div>
      </section>

      <section className="hb-section" aria-labelledby="hb-news-title">
        <div className="hb-wrap">
          <div className="hb-head">
            <h2 id="hb-news-title">복권 뉴스</h2>
            <Link className="hb-more-link" href="/news">
              더보기
            </Link>
          </div>
          <HbNews items={newsPage.items} />
        </div>
      </section>

      <section className="hb-section" aria-labelledby="hb-guide-title">
        <div className="hb-wrap">
          <div className="hb-head">
            <h2 id="hb-guide-title">로또 가이드</h2>
            <Link className="hb-more-link" href="/guide">
              더보기
            </Link>
          </div>
          <HbGuides />
        </div>
      </section>

      <section className="hb-section" aria-labelledby="hb-about-title">
        <div className="hb-wrap">
          <h2 id="hb-about-title">{SITE_NAME}는 어떤 서비스인가요?</h2>
          <HbAbout siteName={SITE_NAME} />
        </div>
      </section>

      <HbDock />
    </>
  )
}
