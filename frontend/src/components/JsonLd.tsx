/**
 * JSON-LD 구조화 데이터 주입.
 *
 * ★ 절대 원칙: **페이지에 실제로 보이지 않는 내용을 넣지 않는다.** 마크업은 화면
 *   콘텐츠의 기계 판독용 표현이지 별도의 과장 채널이 아니다. Review/AggregateRating 은
 *   만들지 않는다(리뷰 기능이 없다). FAQPage 는 화면에 실제 FAQ 가 보일 때만.
 *   → docs/wiki/30-seo/structured-data.md
 *
 * ⚠ 보안: JSON 안에 `</script>` 문자열이 들어가면 브라우저가 스크립트 태그를 조기
 *   종료하고 뒤따르는 내용을 마크업으로 해석한다(XSS 경로). 뉴스 제목·꿈 키워드처럼
 *   외부에서 온 문자열이 섞이므로 `<` 를 유니코드 이스케이프해 원천 차단한다.
 */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c')

  return (
    <script
      type="application/ld+json"
      // 위에서 '<' 를 전부 이스케이프했으므로 태그가 조기 종료될 수 없다.
      dangerouslySetInnerHTML={{ __html: json }}
    />
  )
}

/* ────────────────────────────────────────────────────────────
 * 타입별 빌더. 오리진 조립을 한 곳으로 모아 오타를 막는다.
 * ──────────────────────────────────────────────────────────── */

export function organizationLd(siteName: string, siteUrl: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: siteName,
    url: siteUrl,
    logo: `${siteUrl}/logo.svg`,
  }
}

/**
 * 사이트 단위 정보.
 * `potentialAction`(sitelinks searchbox)은 **사이트 내 검색 UI 가 실제로 존재할 때만**
 * 넣는다. 우리 헤더의 검색은 회차 번호 이동이라 전체 검색이 아니다 — 넣지 않는다.
 */
export function webSiteLd(siteName: string, siteUrl: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: siteName,
    url: siteUrl,
    inLanguage: 'ko-KR',
  }
}

export function breadcrumbLd(items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  }
}

export function articleLd(params: {
  headline: string
  description: string
  siteName: string
  siteUrl: string
  datePublished: string
  dateModified?: string
}) {
  const publisher = {
    '@type': 'Organization',
    name: params.siteName,
    logo: { '@type': 'ImageObject', url: `${params.siteUrl}/logo.svg` },
  }
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: params.headline,
    description: params.description,
    author: { '@type': 'Organization', name: params.siteName },
    publisher,
    datePublished: params.datePublished,
    dateModified: params.dateModified ?? params.datePublished,
  }
}

/** 통계 페이지. 수치가 아니라 "무엇에 대한 데이터인가"를 설명한다. */
export function datasetLd(params: {
  name: string
  description: string
  siteName: string
  siteUrl: string
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: params.name,
    description: params.description,
    creator: { '@type': 'Organization', name: params.siteName },
    license: `${params.siteUrl}/terms`,
  }
}

/**
 * FAQPage — **화면에 렌더링된 질문/답변과 텍스트가 정확히 일치할 때만** 호출한다.
 * 화면에 없는 질문을 마크업에만 채우면 정책 위반이며 수동 조치 대상이다.
 */
export function faqLd(items: { question: string; answer: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  }
}
