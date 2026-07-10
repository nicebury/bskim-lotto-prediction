/**
 * 서비스 타일 아이콘.
 *
 * 이모지(📊 ★ ☁ 📰 ⚙)를 쓰지 않는다. 이모지는 OS·폰트마다 모양과 색이 달라 브랜드 색을
 * 따르지 못하고, 안드로이드·윈도우에서는 시안과 전혀 다른 그림이 나온다. 시안의 글리프는
 * 단색 실루엣이므로 `currentColor` 를 쓰는 SVG 가 정확한 표현이다.
 *
 * 모든 아이콘은 24×24 뷰박스에 맞추고 `fill="currentColor"` 로 색을 상속받는다.
 * 타일이 색을 정하므로 아이콘 자신은 색을 모른다.
 *
 * 접근성: 타일 제목이 옆에 이미 있으므로 아이콘은 장식이다. `aria-hidden` 을 붙인다.
 */
import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

const BASE: IconProps = {
  viewBox: '0 0 24 24',
  fill: 'currentColor',
  'aria-hidden': true,
  focusable: false,
}

/**
 * 로또 6/45 — 흰 원에서 "6/45" 글자를 **도려낸다.** 뚫린 자리로 타일의 그라디언트 배경이
 * 비쳐 보인다(시안과 같은 효과). 글자를 흰 원 위에 얹으면 색을 하드코딩해야 하는데,
 * 타일 색은 CSS 변수라서 SVG 안에서는 알 수 없다. 마스크가 그 문제를 우회한다.
 *
 * ⚠ 마스크 id 는 문서 전역이다. 이 아이콘은 홈에 하나뿐이라 고정 id 로 충분하다.
 *   여러 번 렌더링하게 되면 id 를 prop 으로 받아야 한다.
 */
export function LottoIcon(props: IconProps) {
  const maskId = 'svc-lotto-glyph'
  return (
    <svg {...BASE} {...props}>
      <mask id={maskId}>
        <circle cx="12" cy="12" r="10" fill="#fff" />
        <text
          x="12"
          y="12.9"
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="7.6"
          fontWeight="700"
          fontFamily="inherit"
          fill="#000"
        >
          6/45
        </text>
      </mask>
      <circle cx="12" cy="12" r="10" fill="currentColor" mask={`url(#${maskId})`} />
    </svg>
  )
}

/** 번호 통계 — 막대 세 개. 가운데가 가장 높다. */
export function StatsIcon(props: IconProps) {
  return (
    <svg {...BASE} {...props}>
      <rect x="3.5" y="13" width="4" height="8" rx="1.6" />
      <rect x="10" y="6" width="4" height="15" rx="1.6" />
      <rect x="16.5" y="9.5" width="4" height="11.5" rx="1.6" />
    </svg>
  )
}

/** 번호 추천 — 별. 꼭짓점을 살짝 둥글게 깎아 시안의 부드러운 인상을 따른다. */
export function RecoIcon(props: IconProps) {
  return (
    <svg {...BASE} {...props}>
      <path d="M12 2.6c.5 0 .96.29 1.18.75l2.3 4.75 5.2.76c.5.07.92.43 1.08.92.16.5.03 1.04-.34 1.4l-3.77 3.7.89 5.2c.09.5-.12 1.02-.53 1.32-.42.3-.97.34-1.42.1L12 19.05l-4.6 2.45c-.44.24-.99.2-1.4-.1-.42-.3-.63-.81-.54-1.32l.89-5.2-3.77-3.7a1.32 1.32 0 0 1-.34-1.4c.16-.49.58-.85 1.09-.92l5.19-.76 2.3-4.75c.22-.46.68-.75 1.18-.75Z" />
    </svg>
  )
}

/** 꿈해몽 — 구름과 떨어지는 물방울. */
export function DreamIcon(props: IconProps) {
  return (
    <svg {...BASE} {...props}>
      <path d="M7 16.5a4.5 4.5 0 0 1-.36-8.99 5.5 5.5 0 0 1 10.5-1.02A4.25 4.25 0 0 1 17.5 16.5H7Z" />
      {/* 물방울: 꿈에서 번호가 흘러나온다는 은유. 시안의 글리프를 따른다. */}
      <path d="M12 17.4c.9 1.2 1.5 2.1 1.5 2.85a1.5 1.5 0 0 1-3 0c0-.75.6-1.65 1.5-2.85Z" />
    </svg>
  )
}

/** 복권 뉴스 — 신문. 접힌 면과 기사 줄. */
export function NewsIcon(props: IconProps) {
  return (
    <svg {...BASE} {...props}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-13Zm2.6 2a.9.9 0 0 0-.9.9v3.2c0 .5.4.9.9.9h3.3c.5 0 .9-.4.9-.9V8.4a.9.9 0 0 0-.9-.9H6.6Zm7.1.4a.9.9 0 1 0 0 1.8h3.7a.9.9 0 1 0 0-1.8h-3.7Zm0 3.2a.9.9 0 1 0 0 1.8h3.7a.9.9 0 1 0 0-1.8h-3.7ZM6.6 15a.9.9 0 0 0 0 1.8h10.8a.9.9 0 0 0 0-1.8H6.6Z"
      />
    </svg>
  )
}

/** 연금복권 — 톱니바퀴. '준비 중'을 뜻한다(배지가 그것을 말로도 알린다). */
export function PensionIcon(props: IconProps) {
  return (
    <svg {...BASE} {...props}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M10.6 2.5a1.4 1.4 0 0 0-1.36 1.06l-.3 1.2a7.6 7.6 0 0 0-1.5.87l-1.18-.37a1.4 1.4 0 0 0-1.63.63l-1.4 2.42a1.4 1.4 0 0 0 .27 1.72l.9.82a7.7 7.7 0 0 0 0 1.74l-.9.82a1.4 1.4 0 0 0-.27 1.72l1.4 2.42c.33.57 1 .82 1.63.63l1.18-.37c.46.35.97.64 1.5.87l.3 1.2A1.4 1.4 0 0 0 10.6 21.5h2.8a1.4 1.4 0 0 0 1.36-1.06l.3-1.2c.53-.23 1.04-.52 1.5-.87l1.18.37c.62.19 1.3-.06 1.63-.63l1.4-2.42a1.4 1.4 0 0 0-.27-1.72l-.9-.82a7.7 7.7 0 0 0 0-1.74l.9-.82a1.4 1.4 0 0 0 .27-1.72l-1.4-2.42a1.4 1.4 0 0 0-1.63-.63l-1.18.37a7.6 7.6 0 0 0-1.5-.87l-.3-1.2A1.4 1.4 0 0 0 13.4 2.5h-2.8ZM12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"
      />
    </svg>
  )
}

/** 타일 슬러그 → 아이콘. site.ts 의 `accent` 값과 키를 맞춘다. */
export const SERVICE_ICONS = {
  lotto: LottoIcon,
  stats: StatsIcon,
  reco: RecoIcon,
  dream: DreamIcon,
  news: NewsIcon,
  pension: PensionIcon,
} as const

export type ServiceIconKey = keyof typeof SERVICE_ICONS

/* ────────────────────────────────────────────────────────────
 * 뉴스 썸네일용 아이콘.
 *
 * 백엔드가 기사 이미지를 주지 않는다([[api-contract]] 의 기사 객체에 이미지 필드가 없다).
 * 빈 회색 사각형을 두는 대신 복권 소재의 글리프로 채운다. 순수 장식이므로 제목이 정보를
 * 전달한다 — 아이콘이 기사 내용을 뜻하지 않는다.
 * ──────────────────────────────────────────────────────────── */

/** 트로피 — 당첨 소식. */
export function TrophyIcon(props: IconProps) {
  return (
    <svg {...BASE} {...props}>
      <path d="M6 4h12v2h3v2.5A4.5 4.5 0 0 1 16.9 13a5.02 5.02 0 0 1-3.9 2.9V18h3a1 1 0 1 1 0 2H8a1 1 0 1 1 0-2h3v-2.1A5.02 5.02 0 0 1 7.1 13 4.5 4.5 0 0 1 3 8.5V6h3V4Zm0 4H5v.5A2.5 2.5 0 0 0 6.6 10.8 6.9 6.9 0 0 1 6 8Zm12 0a6.9 6.9 0 0 1-.6 2.8A2.5 2.5 0 0 0 19 8.5V8h-1Z" />
    </svg>
  )
}

/** 복권 용지 — 발권·판매점 소식. */
export function TicketIcon(props: IconProps) {
  return (
    <svg {...BASE} {...props}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2.2a2.8 2.8 0 0 0 0 5.6V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2.2a2.8 2.8 0 0 0 0-5.6V7Zm6.5 1.6a1 1 0 0 0 0 2h5a1 1 0 1 0 0-2h-5Zm0 4.8a1 1 0 1 0 0 2h5a1 1 0 1 0 0-2h-5Z"
      />
    </svg>
  )
}

/** 확성기 — 공지·발표. */
export function MegaphoneIcon(props: IconProps) {
  return (
    <svg {...BASE} {...props}>
      <path d="M19.5 3.3c.9-.5 2 .2 2 1.2v15c0 1-1.1 1.7-2 1.2L14 17.6V6.4l5.5-3.1ZM12 7v10H8.3l1 3.4a1.4 1.4 0 0 1-1.35 1.8H6.6a1.4 1.4 0 0 1-1.34-1L3.9 17H3.6A2.6 2.6 0 0 1 1 14.4V9.6A2.6 2.6 0 0 1 3.6 7H12Z" />
    </svg>
  )
}

/** 상승 그래프 — 판매액·기금 소식. */
export function TrendIcon(props: IconProps) {
  return (
    <svg {...BASE} {...props}>
      <path d="M3.7 16.3a1.2 1.2 0 0 0 1.7 1.7l4.4-4.4 2.8 2.8c.5.5 1.2.5 1.7 0l5.4-5.4V14a1.2 1.2 0 1 0 2.4 0V8.2c0-.66-.54-1.2-1.2-1.2H15a1.2 1.2 0 1 0 0 2.4h2.9l-4.4 4.4-2.8-2.8a1.2 1.2 0 0 0-1.7 0l-5.3 5.3Z" />
    </svg>
  )
}

/**
 * 뉴스 썸네일 팔레트. 아이콘과 색을 짝지어 둔다.
 * `accent` 는 `--svc-*` 토큰 접미어다 — 사이트가 이미 쓰는 색에서만 고른다.
 */
export const NEWS_THUMBS = [
  { accent: 'news', Icon: NewsIcon },
  { accent: 'lotto', Icon: TrophyIcon },
  { accent: 'reco', Icon: TicketIcon },
  { accent: 'stats', Icon: TrendIcon },
  { accent: 'dream', Icon: MegaphoneIcon },
] as const

/** 문자열 해시. 같은 기사는 언제나 같은 값을 낸다. */
function hashOf(key: string): number {
  let hash = 0
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  }
  return hash
}

/**
 * 기사 목록 → 썸네일 배정.
 *
 * 시작점은 기사 링크의 해시다. 배열 인덱스로 고르면 목록이 재정렬되거나 한 건이 사라질 때
 * 모든 기사의 색이 바뀐다.
 *
 * 다만 해시만 쓰면 **한 화면에서 색이 겹친다** — 실제로 세 기사가 `reco, dream, reco` 로
 * 나왔다. 그래서 이미 쓴 색이면 다음 칸으로 밀어 목록 안에서는 서로 다르게 만든다.
 * 팔레트(5색)보다 목록이 길면 그때부터는 순환한다 — 그 지점에선 서로 멀리 떨어져 있다.
 */
export function assignNewsThumbs<T>(items: T[], keyOf: (item: T) => string) {
  const used = new Set<number>()
  let previous = -1

  return items.map((item) => {
    const start = hashOf(keyOf(item)) % NEWS_THUMBS.length
    let pick = start

    if (used.size < NEWS_THUMBS.length) {
      // 아직 안 쓴 색이 있으면 해시 위치에서 앞으로 밀며 찾는다.
      for (let step = 0; step < NEWS_THUMBS.length; step += 1) {
        const candidate = (start + step) % NEWS_THUMBS.length
        if (!used.has(candidate)) {
          pick = candidate
          break
        }
      }
    } else if (pick === previous) {
      // 팔레트를 다 썼다(6번째 기사부터). 색 반복은 피할 수 없지만,
      // 바로 위 기사와 같은 색이 되는 것만은 막는다 — 그것이 가장 눈에 띈다.
      pick = (pick + 1) % NEWS_THUMBS.length
    }

    used.add(pick)
    previous = pick
    return NEWS_THUMBS[pick]
  })
}
