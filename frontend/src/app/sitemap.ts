import type { MetadataRoute } from 'next'

import { getDreamKeywords, getSitemapEntries } from '@/lib/api'
import { absoluteUrl } from '@/lib/env'
import { DREAM_INDEXED_KEYWORDS, GUIDES, POLICY_PAGES, STAT_PAGES } from '@/lib/site'

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

  /*
    선별 목록 중 **사전에 실제로 있는 것만** 남긴다. 사전이 바뀌어 사라진 표제어를 사이트맵에
    실으면 크롤러가 404 를 받는다. 백엔드가 죽어 목록이 비면 선별 목록을 그대로 믿는다 —
    빌드 때문에 사이트맵이 통째로 비는 편이 더 나쁘다.
  */
  const dictionary = new Set(dreamKeywords.map((keyword) => keyword.slug))
  const indexedDreamSlugs = dreamKeywords.length
    ? DREAM_INDEXED_KEYWORDS.filter((slug) => dictionary.has(slug))
    : [...DREAM_INDEXED_KEYWORDS]

  const staticPages: MetadataRoute.Sitemap = [
    { url: absoluteUrl('/'), changeFrequency: 'weekly', priority: 1.0 },
    { url: absoluteUrl('/lotto'), changeFrequency: 'weekly', priority: 0.9 },
    { url: absoluteUrl('/lotto/latest'), changeFrequency: 'weekly', priority: 0.9 },
    { url: absoluteUrl('/lotto/recommend'), changeFrequency: 'monthly', priority: 0.7 },
    { url: absoluteUrl('/lotto/stat'), changeFrequency: 'weekly', priority: 0.8 },
    /*
      003 개편으로 hot-cold 는 /lotto/stat 자체가 됐다. 위에 이미 있으므로 여기서 걸러
      내지 않으면 사이트맵에 같은 URL 이 두 번 실린다.
    */
    ...STAT_PAGES.filter((page) => page.href !== '/lotto/stat').map((page) => ({
      url: absoluteUrl(page.href),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
    { url: absoluteUrl('/dream'), changeFrequency: 'monthly', priority: 0.7 },
    /*
      꿈 키워드는 **선별한 것만** 싣는다(2026-08-19).

      종전에는 사전의 4,802개를 전부 실었다. 롱테일 SEO 를 노린 것이었지만, 백엔드가 표제어와
      번호만 주고 해몽 풀이는 주지 않으므로 그 페이지들은 서로 거의 같은 얇은 문서다. 없는
      내용을 지어내지 않기로 한 이상(→ 30-seo/metadata-strategy.md) 4,802개를 색인시키는 것은
      사이트 전체를 저품질로 끌어내릴 위험이 더 크다.
      나머지 키워드도 URL 로는 그대로 열린다 — 색인만 하지 않는다.
      슬러그는 한글이다. `new URL()` 이 퍼센트 인코딩을 알아서 처리한다.
    */
    ...indexedDreamSlugs.map((slug) => ({
      url: absoluteUrl(`/dream/${slug}`),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
    /*
      영상은 **목록만** 싣는다. 개별 영상 URL 을 실으면 안 된다 — `lotto_video` 의 행은
      YouTube 정책에 따라 30일 안에 갱신되거나 삭제되므로(→ 90-external/youtube-data-api.md)
      사이트맵에 실은 URL 이 계속 404 가 된다. 사라지는 URL 을 색인시키지 않는다.
    */
    { url: absoluteUrl('/videos'), changeFrequency: 'daily', priority: 0.6 },
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
