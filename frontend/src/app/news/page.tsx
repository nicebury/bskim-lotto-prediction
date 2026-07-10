import type { Metadata } from 'next'

import { AdSlot } from '@/components/AdSlot'
import { Breadcrumb } from '@/components/Breadcrumb'
import { Card } from '@/components/Card'
import { NewsList } from '@/components/NewsList'
import { getNews } from '@/lib/api'

export const revalidate = 3600

export const metadata: Metadata = {
  title: '복권 뉴스',
  description:
    '로또와 복권 관련 최근 뉴스를 모아 출처, 발행일, 요약과 함께 정리했습니다.',
  alternates: { canonical: '/news' },
  openGraph: {
    type: 'website',
    url: '/news',
    title: '복권 뉴스',
    description: '로또와 복권 관련 최근 이슈를 확인하세요.',
  },
}

/**
 * 복권 뉴스 큐레이션.
 *
 * 제목만 복사해 나열하지 않는다. 출처·발행일·요약·키워드를 함께 보여주고, 원문은 외부
 * 링크로 보낸다(`rel="nofollow noopener"`). 원문 복제는 저작권과 저품질 콘텐츠 양쪽에서
 * 문제가 된다 — 백엔드가 저장하는 `description` 도 원문이 아니라 요약이다.
 *
 * 뉴스 상세 페이지는 만들지 않는다(URL 구조에 없다). 우리가 쓰지 않은 글에 우리 URL 을
 * 붙이지 않는 것이 옳다.
 */
export default async function NewsPage() {
  const newsPage = await getNews(1, 20)

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
          로또와 복권 관련 최근 소식을 모았습니다. 제목을 누르면 원문으로 이동합니다.
        </p>
      </section>

      <section className="section" aria-labelledby="news-list-title">
        <h2 id="news-list-title" className="sr-only">
          최근 복권 뉴스 목록
        </h2>
        <Card>
          <NewsList items={newsPage.items} />
        </Card>
      </section>

      <AdSlot slot="news-bottom" />

      <section className="section prose" aria-labelledby="news-about">
        <h2 id="news-about">뉴스는 어떻게 수집하나요?</h2>
        <p>
          복권 관련 키워드로 검색된 기사 중 최근에 발행된 것을 모아 제목, 언론사, 발행일, 짧은
          요약과 함께 정리합니다. 본문 전체를 옮겨 오지 않으며, 기사를 읽으려면 원문 링크를 통해
          해당 언론사로 이동해야 합니다.
        </p>
        <p>
          기사에 담긴 견해와 사실 관계는 각 언론사의 책임입니다. 행운상자는 기사 내용을 검증하거나
          보증하지 않으며, 특정 기사에 담긴 당첨 관련 서술을 지지하지 않습니다.
        </p>
      </section>
    </div>
  )
}
