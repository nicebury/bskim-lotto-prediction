import type { MetadataRoute } from 'next'

import { SITE_URL } from '@/lib/env'

/**
 * robots.txt (Next.js 파일 규약).
 *
 * ── ⚠ 검색 크롤러는 절대 막지 않는다 ────────────────────────────────
 * 이 사이트는 **유입이 전적으로 검색**이다([[0002-nextjs-app-router]]). 서버 렌더링,
 * 사이트맵 1,287 URL, "JS 를 꺼도 본문이 보인다" 는 완료 기준까지 전부 크롤러가 잘 읽게
 * 만든 장치다. 크롤링을 폭넓게 막는 순간 그 투자가 통째로 무의미해지고, 애드센스 심사도
 * 같은 크롤러가 한다.
 *
 * ── 여기서 막는 것은 검색이 아니다 ──────────────────────────────────
 * 아래 목록은 **검색 결과에 우리를 실어 주지 않으면서 대역폭만 쓰는** 봇이다. 두 갈래다.
 *
 *   ① 생성형 AI 학습 수집기 — 우리 글을 학습에 쓰지만 우리로 오는 링크를 만들지 않는다.
 *   ② 상업용 SEO 분석 도구 — 경쟁사가 우리 구조를 뜯어보라고 도는 봇이다.
 *
 * ⚠ **`Google-Extended` 와 `Applebot-Extended` 는 검색 색인과 무관하다.** 각각 Gemini·
 *   Apple Intelligence 의 학습 여부만 제어하며, 막아도 구글 검색·Siri 검색 노출은 그대로다
 *   (양사 공식 문서). 그래서 여기 넣어도 안전하다. **`Googlebot`·`Applebot` 본체와
 *   혼동하지 않는다** — 그쪽을 막으면 사이트가 검색에서 사라진다.
 *
 * ⚠ `PetalBot`(화웨이)·`Yeti`(네이버)·`Daum`·`bingbot`·`DuckDuckBot` 은 **검색 유입이
 *   있으므로 넣지 않는다.** "부하가 크다" 는 이유만으로 검색 봇을 막지 않는다.
 *
 * ── ⚠ robots.txt 는 담장이 아니라 표지판이다 ────────────────────────
 * 지키는 봇만 지킨다. 강제력이 필요하면 서버·CDN 단의 rate limit 과 UA 차단이라야 하고,
 * 그것은 배포 인프라의 몫이다. 무엇보다 **당첨번호 자체는 이것으로 지켜지지 않는다** —
 * 브라우저가 백엔드 API 를 직접 부르므로 그 주소가 번들에 공개되어 있고, 실측하면
 * `size=200` 으로 일곱 번이면 전 회차가 나온다. 그쪽을 닫지 않는 한 여기서 막는 것은
 * 대역폭뿐이다(→ docs/wiki/50-ops/ 크롤링 방어 메모).
 */

/** 생성형 AI 학습용 수집기. 우리 글을 가져가되 우리로 오는 링크를 만들지 않는다. */
const AI_TRAINING_BOTS = [
  'GPTBot',
  'ChatGPT-User',
  'OAI-SearchBot',
  'ClaudeBot',
  'Claude-Web',
  'anthropic-ai',
  'CCBot',
  'Google-Extended',
  'Applebot-Extended',
  'PerplexityBot',
  'Bytespider',
  'Amazonbot',
  'meta-externalagent',
  'FacebookBot',
  'cohere-ai',
  'Diffbot',
  'ImagesiftBot',
  'Omgilibot',
  'Timpibot',
  'YouBot',
]

/** 상업용 SEO 분석 도구. 검색 노출에 기여하지 않고 크롤 부하만 만든다. */
const SEO_TOOL_BOTS = [
  'AhrefsBot',
  'SemrushBot',
  'MJ12bot',
  'DotBot',
  'DataForSeoBot',
  'BLEXBot',
  'MegaIndex',
  'ZoominfoBot',
  'Barkrowler',
  'SeekportBot',
]

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // 기본은 전부 허용이다. 이 줄이 먼저 와야 검색 크롤러가 막히지 않는다.
      { userAgent: '*', allow: '/' },
      { userAgent: [...AI_TRAINING_BOTS, ...SEO_TOOL_BOTS], disallow: '/' },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
