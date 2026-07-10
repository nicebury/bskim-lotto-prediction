import type { MetadataRoute } from 'next'

import { getDreamKeywords, getSitemapEntries } from '@/lib/api'
import { absoluteUrl } from '@/lib/env'
import { GUIDES, POLICY_PAGES, STAT_PAGES } from '@/lib/site'

/**
 * sitemap.xml (Next.js 파일 규약).
 *
 * 회차가 1,200건이 넘으므로 목록 API 를 페이징으로 긁지 않는다. 백엔드가 전용
 * 엔드포인트(`/api/meta/sitemap-entries`)로 URL 과 lastmod 만 내려준다.
 * 오리진은 프론트가 NEXT_PUBLIC_SITE_URL 로 조립한다.
 * → docs/wiki/30-seo/metadata-strategy.md
 *
 * ⚠ 백엔드가 없으면 정적 URL 만 담긴 사이트맵을 낸다. 빌드를 실패시키지 않는다.
 * ⚠ 뉴스는 상세 페이지가 없다(URL 구조에 `/news` 목록 하나뿐). 그래서 뉴스 엔트리는
 *   개별 URL 이 아니라 `/news` 의 lastmod 를 정하는 데만 쓴다.
 */
export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [entries, dreamKeywords] = await Promise.all([getSitemapEntries(), getDreamKeywords()])

  const staticPages: MetadataRoute.Sitemap = [
    { url: absoluteUrl('/'), changeFrequency: 'weekly', priority: 1.0 },
    { url: absoluteUrl('/lotto'), changeFrequency: 'weekly', priority: 0.9 },
    { url: absoluteUrl('/lotto/latest'), changeFrequency: 'weekly', priority: 0.9 },
    { url: absoluteUrl('/lotto/recommend'), changeFrequency: 'monthly', priority: 0.7 },
    { url: absoluteUrl('/lotto/stat'), changeFrequency: 'weekly', priority: 0.8 },
    ...STAT_PAGES.map((page) => ({
      url: absoluteUrl(`/lotto/stat/${page.slug}`),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
    { url: absoluteUrl('/dream'), changeFrequency: 'monthly', priority: 0.7 },
    // 꿈 키워드 페이지는 롱테일 SEO 확장의 핵심이다("돼지꿈 로또번호" 같은 검색어).
    // 빌드 시 미리 굽는 것은 앞쪽 일부뿐이지만(→ dream/[keyword]/page.tsx), 사이트맵에는
    // **전부** 싣는다. 색인은 빌드와 무관하고, 나머지는 크롤러가 오면 ISR 로 생성된다.
    // 슬러그는 한글이다. `new URL()` 이 퍼센트 인코딩을 알아서 처리한다.
    ...dreamKeywords.map((keyword) => ({
      url: absoluteUrl(`/dream/${keyword.slug}`),
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    })),
    { url: absoluteUrl('/guide'), changeFrequency: 'monthly', priority: 0.6 },
    ...GUIDES.map((guide) => ({
      url: absoluteUrl(`/guide/${guide.slug}`),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
    ...POLICY_PAGES.map((page) => ({
      url: absoluteUrl(page.href),
      changeFrequency: 'yearly' as const,
      priority: 0.3,
    })),
  ]

  // 뉴스 목록의 lastmod 는 가장 최근 기사의 발행 시각이다.
  //
  // ⚠ `news` 는 계약상 **id 오름차순**이다 — `[0]` 은 가장 오래된 기사이지 최신이 아니다.
  // ⚠ `published_dttm` 이 null 인 기사는 `lastmod` 도 null 이다. `new Date(null)` 은
  //   1970-01-01 이 되어 검색엔진에 거짓 신선도를 준다. 걸러낸 뒤 최댓값을 취한다.
  //   ISO 8601 문자열은 사전순 정렬이 곧 시간순이므로 파싱 없이 비교할 수 있다.
  const newsLastmod = (entries?.news ?? [])
    .map((item) => item.lastmod)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1)

  staticPages.push({
    url: absoluteUrl('/news'),
    changeFrequency: 'daily',
    priority: 0.6,
    ...(newsLastmod ? { lastModified: new Date(newsLastmod) } : {}),
  })

  // 회차 상세는 SEO 유입의 핵심이다. 과거 회차는 사실상 불변이라 yearly.
  const roundPages: MetadataRoute.Sitemap = (entries?.rounds ?? []).map((round) => ({
    url: absoluteUrl(`/lotto/round/${round.round_no}`),
    lastModified: new Date(round.lastmod),
    changeFrequency: 'yearly',
    priority: 0.6,
  }))

  return [...staticPages, ...roundPages]
}
