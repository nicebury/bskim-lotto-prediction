import type { Metadata } from 'next'

import { AdSlot } from '@/components/AdSlot'
import { Breadcrumb } from '@/components/Breadcrumb'
import { Card, EmptyState } from '@/components/Card'
import { NewsFilter } from '@/components/NewsFilter'
import { NewsList } from '@/components/NewsList'
import { Pagination } from '@/components/Pagination'
import { getNews } from '@/lib/api'
import type { NewsPeriod } from '@/lib/api-types'
import { formatNumber } from '@/lib/format'

export const revalidate = 3600

const PAGE_SIZE = 20

/** 허용 기간값. 잘못된 값이 URL 로 들어오면 화면 기본값(1w)으로 되돌린다. */
const PERIODS: NewsPeriod[] = ['1w', '2w', '1m', '3m', '6m', 'all']
const PERIOD_LABEL: Record<NewsPeriod, string> = {
  '1w': '최근 1주',
  '2w': '최근 2주',
  '1m': '최근 1개월',
  '3m': '최근 3개월',
  '6m': '최근 6개월',
  all: '전체 기간',
}

export const metadata: Metadata = {
  title: '복권 뉴스 — 로또 관련 최신 소식',
  description:
    '네이버 검색으로 수집한 로또·복권 관련 최신 뉴스를 키워드와 기간으로 검색하고, 출처·발행일·요약과 함께 확인하세요.',
  alternates: { canonical: '/news' },
  openGraph: {
    type: 'website',
    url: '/news',
    title: '복권 뉴스 — 로또 관련 최신 소식',
    description: '네이버 검색으로 수집한 로또·복권 관련 최신 뉴스를 키워드·기간으로 확인하세요.',
  },
}

/**
 * 복권 뉴스 큐레이션 (002 R29~R33).
 *
 * 조회 조건(키워드·기간)과 페이지는 **URL 쿼리스트링**으로 관리한다 — 각 조회 결과가
 * 서버 렌더링되어 검색엔진이 읽고, 공유·새로고침·뒤로가기가 자연스럽다. 화면 기본값은
 * `period=1w`(최근 1주)이고, API 기본값(all)과 구분한다([[api-contract]] 뉴스 절).
 *
 * 제목만 복사해 나열하지 않는다. 출처·발행일·요약·키워드를 함께 보여주고, 원문은 외부
 * 링크로 보낸다. 뉴스 상세 페이지는 만들지 않는다(우리가 쓰지 않은 글에 우리 URL 을
 * 붙이지 않는다).
 *
 * ⚠ searchParams 를 읽으므로 이 라우트는 dynamic 이다. 뉴스는 조회 조건이 본질이라
 *   ISR 로 굳히기보다 매 요청 렌더가 맞다(revalidate 는 fetch 데이터 캐시에만 적용).
 */
export default async function NewsPage({
  searchParams,
}: {
  searchParams: Promise<{ keyword?: string; period?: string; page?: string }>
}) {
  const params = await searchParams

  const keyword = (params.keyword ?? '').trim()
  const period: NewsPeriod = PERIODS.includes(params.period as NewsPeriod)
    ? (params.period as NewsPeriod)
    : '1w'
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1)

  const newsPage = await getNews(page, PAGE_SIZE, { keyword, period })
  const { items, total } = newsPage

  // 현재 필터를 유지한 채 page 만 바꾸는 링크 빌더(페이지네이션이 쓴다).
  const buildHref = (nextPage: number) => {
    const query = new URLSearchParams()
    if (keyword) query.set('keyword', keyword)
    if (period !== '1w') query.set('period', period)
    if (nextPage > 1) query.set('page', String(nextPage))
    const qs = query.toString()
    return qs ? `/news?${qs}` : '/news'
  }

  const hasFilter = keyword !== '' || period !== '1w'

  return (
    <div className="container">
      <Breadcrumb
        items={[
          { name: '홈', href: '/' },
          { name: '복권 뉴스', href: '/news' },
        ]}
      />

      <section className="section">
        <h1>복권 뉴스</h1>
        <p className="muted" style={{ marginTop: 'var(--space-2)' }}>
          로또와 복권 관련 최신 소식을 모았습니다. 제목을 누르면 원문으로 이동합니다.
        </p>
      </section>

      <section className="section" aria-labelledby="news-list-title">
        <h2 id="news-list-title" className="sr-only">
          뉴스 검색과 목록
        </h2>

        <NewsFilter keyword={keyword} period={period} />

        {/* 현재 조회 조건과 건수를 알려 준다 — 필터가 적용됐음을 명확히. */}
        <p className="news-result-meta">
          {keyword ? (
            <>
              <strong>&lsquo;{keyword}&rsquo;</strong> · {PERIOD_LABEL[period]}
            </>
          ) : (
            PERIOD_LABEL[period]
          )}{' '}
          <span className="muted">검색 결과 {formatNumber(total)}건</span>
        </p>

        <Card>
          {items.length > 0 ? (
            <NewsList items={items} />
          ) : (
            <EmptyState>
              {hasFilter
                ? '조건에 맞는 뉴스가 없습니다. 키워드나 기간을 바꿔 보세요.'
                : '표시할 뉴스가 없습니다. 잠시 후 다시 확인해 주세요.'}
            </EmptyState>
          )}
        </Card>

        <Pagination page={page} total={total} size={PAGE_SIZE} buildHref={buildHref} />
      </section>

      <AdSlot slot="news-bottom" />

      <section className="section prose" aria-labelledby="news-about">
        <h2 id="news-about">뉴스는 어떻게 수집하나요?</h2>
        <p>
          이 목록의 뉴스는 <strong>네이버 검색 API</strong>로 수집합니다. 로또·복권 관련
          키워드로 검색된 기사 중 최근에 발행된 것을 모아 제목, 언론사, 발행일, 짧은 요약과 함께
          정리합니다.
        </p>
        <p>
          본문 전체를 옮겨 오지 않으며, 기사를 읽으려면 원문 링크를 통해 해당 언론사로 이동해야
          합니다. 기사에 담긴 견해와 사실 관계는 각 언론사의 책임입니다. 행운상자는 기사 내용을
          검증하거나 보증하지 않으며, 특정 기사에 담긴 당첨 관련 서술을 지지하지 않습니다.
        </p>
      </section>
    </div>
  )
}
