import type { MetadataRoute } from 'next'

import { SITE_URL } from '@/lib/env'

/**
 * robots.txt (Next.js 파일 규약).
 *
 * 순수 프론트 라우트만 있으므로 Disallow 는 최소한으로 유지한다. 백엔드 API 를 프론트가
 * 프록시하지 않으므로 차단할 내부 경로가 없다.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
