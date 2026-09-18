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
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const BASE: IconProps = {
  viewBox: "0 0 24 24",
  fill: "currentColor",
  "aria-hidden": true,
  focusable: false,
};

/**
 * 로또 6/45 — 흰 원에서 "6/45" 글자를 **도려낸다.** 뚫린 자리로 타일의 그라디언트 배경이
 * 비쳐 보인다(시안과 같은 효과). 글자를 흰 원 위에 얹으면 색을 하드코딩해야 하는데,
 * 타일 색은 CSS 변수라서 SVG 안에서는 알 수 없다. 마스크가 그 문제를 우회한다.
 *
 * ⚠ 마스크 id 는 문서 전역이다. 이 아이콘은 홈에 하나뿐이라 고정 id 로 충분하다.
 *   여러 번 렌더링하게 되면 id 를 prop 으로 받아야 한다.
 */
export function LottoIcon(props: IconProps) {
  const maskId = "svc-lotto-glyph";
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
      <circle
        cx="12"
        cy="12"
        r="10"
        fill="currentColor"
        mask={`url(#${maskId})`}
      />
    </svg>
  );
}

/** 번호 통계 — 막대 세 개. 가운데가 가장 높다. */
export function StatsIcon(props: IconProps) {
  return (
    <svg {...BASE} {...props}>
      <rect x="3.5" y="13" width="4" height="8" rx="1.6" />
      <rect x="10" y="6" width="4" height="15" rx="1.6" />
      <rect x="16.5" y="9.5" width="4" height="11.5" rx="1.6" />
    </svg>
  );
}

/** 번호 추천 — 별. 꼭짓점을 살짝 둥글게 깎아 시안의 부드러운 인상을 따른다. */
export function RecoIcon(props: IconProps) {
  return (
    <svg {...BASE} {...props}>
      <path d="M12 2.6c.5 0 .96.29 1.18.75l2.3 4.75 5.2.76c.5.07.92.43 1.08.92.16.5.03 1.04-.34 1.4l-3.77 3.7.89 5.2c.09.5-.12 1.02-.53 1.32-.42.3-.97.34-1.42.1L12 19.05l-4.6 2.45c-.44.24-.99.2-1.4-.1-.42-.3-.63-.81-.54-1.32l.89-5.2-3.77-3.7a1.32 1.32 0 0 1-.34-1.4c.16-.49.58-.85 1.09-.92l5.19-.76 2.3-4.75c.22-.46.68-.75 1.18-.75Z" />
    </svg>
  );
}

/** 꿈해몽 — 구름과 떨어지는 물방울. */
export function DreamIcon(props: IconProps) {
  return (
    <svg {...BASE} {...props}>
      <path d="M7 16.5a4.5 4.5 0 0 1-.36-8.99 5.5 5.5 0 0 1 10.5-1.02A4.25 4.25 0 0 1 17.5 16.5H7Z" />
      {/* 물방울: 꿈에서 번호가 흘러나온다는 은유. 시안의 글리프를 따른다. */}
      <path d="M12 17.4c.9 1.2 1.5 2.1 1.5 2.85a1.5 1.5 0 0 1-3 0c0-.75.6-1.65 1.5-2.85Z" />
    </svg>
  );
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
  );
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
  );
}

/**
 * 번호놀이터 — 게임패드.
 *
 * ⚠ **`fill` 로 그린다.** `playground.md` 는 "stroke 1.8" 로 적었지만, 이 파일의
 *   `SERVICE_ICONS` 여섯 개는 전부 `fill="currentColor"` 실루엣이다(파일 첫 주석의 규약).
 *   한 줄에 나란히 서는 타일에서 하나만 선 그림이면 그것만 얇게 튄다. 규약을 따르고
 *   그 사실을 [[playground]] 에 남겼다.
 *
 * 몸체를 채우고 십자키·버튼을 **도려낸다**(`evenodd`) — 뚫린 자리로 타일 배경이 비쳐
 * 다른 다섯 아이콘과 같은 인상이 된다.
 */
export function PlayIcon(props: IconProps) {
  return (
    <svg {...BASE} {...props}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M8.2 5.5h7.6a5.6 5.6 0 0 1 5.53 4.68l.83 5A4.3 4.3 0 0 1 17.92 20a4.3 4.3 0 0 1-3.4-1.66l-.72-.92h-3.6l-.72.92A4.3 4.3 0 0 1 6.08 20a4.3 4.3 0 0 1-4.24-4.82l.83-5A5.6 5.6 0 0 1 8.2 5.5Zm-.65 2.9a.9.9 0 0 0-.9.9v.85h-.85a.9.9 0 0 0 0 1.8h.85v.85a.9.9 0 0 0 1.8 0v-.85h.85a.9.9 0 0 0 0-1.8H8.45V9.3a.9.9 0 0 0-.9-.9Zm7.55 1.15a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2Zm2.6 2.6a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2Z"
      />
    </svg>
  );
}

/** 타일 슬러그 → 아이콘. site.ts 의 `accent` 값과 키를 맞춘다. */
export const SERVICE_ICONS = {
  lotto: LottoIcon,
  stats: StatsIcon,
  reco: RecoIcon,
  dream: DreamIcon,
  news: NewsIcon,
  pension: PensionIcon,
  play: PlayIcon,
} as const;

export type ServiceIconKey = keyof typeof SERVICE_ICONS;

/**
 * 뉴스 썸네일 팔레트 (002 R13/R32).
 *
 * **모양은 뉴스(신문) 아이콘 하나로 통일하고 색만 바꾼다.** 종전에는 5종 아이콘(신문·
 * 트로피·티켓·그래프·확성기)이 모양·색 모두 달라 제각각으로 보였다. 이제 아이콘은 항상
 * `NewsIcon` 이고 `accent`(색)만 기사마다 다르게 배정한다. `accent` 는 `--svc-*` 토큰
 * 접미어다 — 사이트가 이미 쓰는 색에서만 고른다.
 */
export const NEWS_THUMBS = [
  { accent: "news", Icon: NewsIcon },
  { accent: "lotto", Icon: NewsIcon },
  { accent: "reco", Icon: NewsIcon },
  { accent: "stats", Icon: NewsIcon },
  { accent: "dream", Icon: NewsIcon },
] as const;

/** 문자열 해시. 같은 기사는 언제나 같은 값을 낸다. */
function hashOf(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return hash;
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
  const used = new Set<number>();
  let previous = -1;

  return items.map((item) => {
    const start = hashOf(keyOf(item)) % NEWS_THUMBS.length;
    let pick = start;

    if (used.size < NEWS_THUMBS.length) {
      // 아직 안 쓴 색이 있으면 해시 위치에서 앞으로 밀며 찾는다.
      for (let step = 0; step < NEWS_THUMBS.length; step += 1) {
        const candidate = (start + step) % NEWS_THUMBS.length;
        if (!used.has(candidate)) {
          pick = candidate;
          break;
        }
      }
    } else if (pick === previous) {
      // 팔레트를 다 썼다(6번째 기사부터). 색 반복은 피할 수 없지만,
      // 바로 위 기사와 같은 색이 되는 것만은 막는다 — 그것이 가장 눈에 띈다.
      pick = (pick + 1) % NEWS_THUMBS.length;
    }

    used.add(pick);
    previous = pick;
    return NEWS_THUMBS[pick];
  });
}

/* ────────────────────────────────────────────────────────────
 * 선(stroke) 계열 아이콘 — 안내 절 표본 카드용
 *
 * 위 서비스 타일 아이콘은 **채움(fill)** 이다. 진한 배경 위 흰 실루엣이라 그렇다.
 * 반면 표본 카드의 아이콘은 파스텔 배경 위에 놓이고 크기도 작아, 같은 문법으로 그리면
 * 덩어리져 보인다. 그래서 선으로 그린다.
 *
 * ⚠ 코드베이스의 strokeWidth 가 1.8 / 2 / 2.2 / 3 으로 흩어져 있다(Header·NumberActions·
 *   StatNav·Faq). **새 아이콘만이라도** 한 값으로 통일해 두어야 나중에 정리할 수 있다.
 *   기존 파일은 이번에 건드리지 않는다.
 * ⚠ 트로피를 그리지 않는다 — '당첨' 을 암시해 심사에서 도박 조장으로 읽힐 수 있다.
 *   달력도 그리지 않는다 — 이 화면들은 날짜가 아니라 번호에 관한 것이다
 *   (→ docs/wiki/40-domain/forbidden-expressions.md).
 * ──────────────────────────────────────────────────────────── */

const STROKE_BASE: IconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: false,
};

/** 표 한 줄 — 위쪽 머리글 줄과 그 아래 데이터 줄. */
export function TableRowIcon(props: IconProps) {
  return (
    <svg {...STROKE_BASE} {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 10h18" />
      <path d="M9 10v9" />
    </svg>
  );
}

/** 추세 — 위아래 화살표 한 쌍. '오른다' 가 아니라 '비교한다' 는 뜻이다. */
export function TrendIcon(props: IconProps) {
  return (
    <svg {...STROKE_BASE} {...props}>
      <path d="M7 20V6" />
      <path d="M4 9l3-3 3 3" />
      <path d="M17 4v14" />
      <path d="M14 15l3 3 3-3" />
    </svg>
  );
}

/** 번호 볼 — 원 안의 점 하나. 공식 5구간 색은 CSS 가 정하므로 여기서는 형태만. */
export function BallIcon(props: IconProps) {
  return (
    <svg {...STROKE_BASE} {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/** 45칸 번호판 — 일부 칸이 채워진 격자. */
export function GridIcon(props: IconProps) {
  return (
    <svg {...STROKE_BASE} {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18" />
      <path d="M15 3v18" />
      <path d="M3 9h18" />
      <path d="M3 15h18" />
      <rect
        x="9"
        y="9"
        width="6"
        height="6"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}

/** 켜진 체크박스 — 옵션을 켠 상태. */
export function CheckboxIcon(props: IconProps) {
  return (
    <svg {...STROKE_BASE} {...props}>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M7.5 12.5l3 3 6-6" />
    </svg>
  );
}

/** 걸러 내기 — 깔때기. */
export function FilterIcon(props: IconProps) {
  return (
    <svg {...STROKE_BASE} {...props}>
      <path d="M4 5h16l-6.2 7.4V19l-3.6-2v-4.6L4 5Z" />
    </svg>
  );
}

/** 최근성 — 시계. 날짜(달력)가 아니라 '얼마나 지났나' 다. */
export function ClockIcon(props: IconProps) {
  return (
    <svg {...STROKE_BASE} {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

/** 구매 용지 — 마킹된 줄이 있는 종이. */
export function SlipIcon(props: IconProps) {
  return (
    <svg {...STROKE_BASE} {...props}>
      <path d="M6 3h12a1 1 0 0 1 1 1v17l-2.5-1.5L14 21l-2-1.5L10 21l-2.5-1.5L5 21V4a1 1 0 0 1 1-1Z" />
      <path d="M9 8h6" />
      <path d="M9 12h6" />
    </svg>
  );
}

/** 흩어진 분포 — 서로 다른 높이의 막대 셋. */
export function SpreadIcon(props: IconProps) {
  return (
    <svg {...STROKE_BASE} {...props}>
      <path d="M4 20h16" />
      <path d="M7 20v-6" />
      <path d="M12 20V5" />
      <path d="M17 20v-9" />
    </svg>
  );
}

/** 낱말 — 문장에서 단어를 뽑아내는 일. */
export function WordIcon(props: IconProps) {
  return (
    <svg {...STROKE_BASE} {...props}>
      <path d="M4 6h16" />
      <path d="M4 11h10" />
      <path d="M4 16h6" />
      <circle cx="17.5" cy="15.5" r="3.5" />
      <path d="M20 18l2 2" />
    </svg>
  );
}

/** 사전 대조 — 펼친 책. */
export function BookIcon(props: IconProps) {
  return (
    <svg {...STROKE_BASE} {...props}>
      <path d="M12 6.5C10.5 5 8.5 4.5 4 4.5v13c4.5 0 6.5.5 8 2 1.5-1.5 3.5-2 8-2v-13c-4.5 0-6.5.5-8 2Z" />
      <path d="M12 6.5V20" />
    </svg>
  );
}

/** 안내 — 원 안의 i. 결론 블록이 쓴다. */
export function InfoIcon(props: IconProps) {
  return (
    <svg {...STROKE_BASE} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 7.6v.4" />
    </svg>
  );
}

/** 문서 — 기사 한 건. */
export function ArticleIcon(props: IconProps) {
  return (
    <svg {...STROKE_BASE} {...props}>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8" />
      <path d="M8 12h8" />
      <path d="M8 16h5" />
    </svg>
  );
}

/** 저울 — '무엇을 말하고 무엇을 말하지 않는가' 처럼 견주는 카드. */
export function ScaleIcon(props: IconProps) {
  return (
    <svg {...STROKE_BASE} {...props}>
      <path d="M12 4v16" />
      <path d="M6 20h12" />
      <path d="M4 8h16" />
      <path d="M4 8l-2 5a3 3 0 0 0 6 0L6 8" />
      <path d="M18 8l-2 5a3 3 0 0 0 6 0L20 8" />
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────
 * 번호 추천 화면 아이콘 (2026-09-17)
 *
 * 정밀 분석의 일곱 단계와 여섯 가지 기준에 붙는다. "절차 문서 같다" 는 지적을 받고
 * 단계·기준마다 **모양으로 먼저 읽히게** 하려고 만들었다. 위 선 계열(`STROKE_BASE`)과
 * 같은 굵기다 — 한 화면에 나란히 놓인다.
 *
 * ⚠ 트로피·왕관·돈다발을 그리지 않는다. 결과를 약속하는 그림으로 읽힌다
 *   (→ docs/wiki/40-domain/forbidden-expressions.md).
 * ──────────────────────────────────────────────────────────── */

/** 빈도 — 공책에 바를 정(正) 자 세듯 긋는 금. */
export function TallyIcon(props: IconProps) {
  return (
    <svg {...STROKE_BASE} {...props}>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8v8" />
      <path d="M11 8v8" />
      <path d="M14 8v8" />
      <path d="M7 15l10-6" />
    </svg>
  );
}

/** 출현 주기 — 모래시계. '얼마나 쉬었나' 를 센다. */
export function HourglassIcon(props: IconProps) {
  return (
    <svg {...STROKE_BASE} {...props}>
      <path d="M6 3h12" />
      <path d="M6 21h12" />
      <path d="M7 3c0 5 10 5 10 9s-10 4-10 9" />
      <path d="M17 3c0 5-10 5-10 9s10 4 10 9" />
    </svg>
  );
}

/** 최근 흐름 — 꺾은선. */
export function WaveIcon(props: IconProps) {
  return (
    <svg {...STROKE_BASE} {...props}>
      <path d="M3 17l5-5 4 3 8-8" />
      <path d="M15 7h5v5" />
    </svg>
  );
}

/** 종합 — 겹쳐 쌓은 종이 석 장. 네 관점을 한 상에 올린다. */
export function LayersIcon(props: IconProps) {
  return (
    <svg {...STROKE_BASE} {...props}>
      <path d="M12 3l9 5-9 5-9-5 9-5Z" />
      <path d="M3 12.5l9 5 9-5" />
      <path d="M3 17l9 5 9-5" />
    </svg>
  );
}

/** 가상 추첨 — 주사위. 무작위로 수없이 굴린다는 뜻. */
export function DiceIcon(props: IconProps) {
  return (
    <svg {...STROKE_BASE} {...props}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="3.5" />
      <circle cx="8.5" cy="8.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="8.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="8.5" cy="15.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="15.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** 추천 번호 — 번호가 적힌 표 한 장(가장자리가 파인 티켓). */
export function TicketIcon(props: IconProps) {
  return (
    <svg {...STROKE_BASE} {...props}>
      <path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4V8Z" />
      <path d="M9 6v12" strokeDasharray="1.5 2.5" />
    </svg>
  );
}

/** 번호대 균형 — 세 구간에서 둘씩. */
export function SegmentsIcon(props: IconProps) {
  return (
    <svg {...STROKE_BASE} {...props}>
      <rect x="3" y="5" width="5" height="14" rx="1.5" />
      <rect x="9.5" y="5" width="5" height="14" rx="1.5" />
      <rect x="16" y="5" width="5" height="14" rx="1.5" />
      <circle cx="5.5" cy="9.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="5.5" cy="14.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="12" cy="9.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="12" cy="14.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="18.5" cy="9.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="18.5" cy="14.5" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** 안 나오던 번호 되짚기 — 돌아오는 화살표. */
export function ReturnIcon(props: IconProps) {
  return (
    <svg {...STROKE_BASE} {...props}>
      <path d="M9 14l-5-5 5-5" />
      <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
    </svg>
  );
}

/** 동반 출현 — 맞물린 두 고리. */
export function PairIcon(props: IconProps) {
  return (
    <svg {...STROKE_BASE} {...props}>
      <circle cx="9" cy="12" r="5.5" />
      <circle cx="15" cy="12" r="5.5" />
    </svg>
  );
}

/** 실행 — 재생 삼각형. 시뮬레이션 시작 버튼에 붙는다. */
export function PlayGlyph(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable={false} {...props}>
      <path d="M8 5.5v13a1 1 0 0 0 1.52.85l10.4-6.5a1 1 0 0 0 0-1.7L9.52 4.65A1 1 0 0 0 8 5.5Z" />
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────
 * 영상·뉴스 화면 아이콘 (2026-09-17)
 *
 * 선 계열(`STROKE_BASE`)이다. ⚠ 유튜브 로고·쇼츠 로고를 흉내 내지 않는다 — 상표다
 * (→ components/video/YouTubeAttribution.tsx 머리말). 쇼츠는 '세로로 긴 화면' 으로만 그린다.
 * ──────────────────────────────────────────────────────────── */

/** 검색 — 돋보기. */
export function SearchGlyph(props: IconProps) {
  return (
    <svg {...STROKE_BASE} {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </svg>
  );
}

/** 세로 영상 — 세로로 긴 화면 + 재생 표시. '쇼츠' 배지와 탭에 붙는다. */
export function PortraitIcon(props: IconProps) {
  return (
    <svg {...STROKE_BASE} {...props}>
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
      <path d="M10.5 9.5v5l4-2.5-4-2.5Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** 가로 영상 — 가로로 긴 화면 + 재생 표시. */
export function LandscapeIcon(props: IconProps) {
  return (
    <svg {...STROKE_BASE} {...props}>
      <rect x="2.5" y="5.5" width="19" height="13" rx="2.5" />
      <path d="M10.5 9.5v5l4-2.5-4-2.5Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** 모아 보기 — 네 칸 격자. '전체' 탭. */
export function TilesIcon(props: IconProps) {
  return (
    <svg {...STROKE_BASE} {...props}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </svg>
  );
}

/** 왼쪽 화살표 — '목록으로'. */
export function ArrowLeftIcon(props: IconProps) {
  return (
    <svg {...STROKE_BASE} {...props}>
      <path d="M19 12H5" />
      <path d="M11 6l-6 6 6 6" />
    </svg>
  );
}

/** 오른쪽 화살표 — '다음' · 이어지는 링크. */
export function ArrowRightIcon(props: IconProps) {
  return (
    <svg {...STROKE_BASE} {...props}>
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  );
}

/** 바깥으로 — 새 창에서 원문 열기. */
export function ExternalIcon(props: IconProps) {
  return (
    <svg {...STROKE_BASE} {...props}>
      <path d="M14 4h6v6" />
      <path d="M20 4l-9 9" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </svg>
  );
}

/** 불꽃 — '인기순'. 조회수가 많다는 뜻일 뿐, 결과를 약속하지 않는다. */
export function FlameIcon(props: IconProps) {
  return (
    <svg {...STROKE_BASE} {...props}>
      <path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.3 2.4-5.4 3.6-7.8.3 1.8 1.2 3 2.4 3.6-.2-3 1.1-5.6 3.6-7.1-.3 2.7.6 4.6 2.1 6.3 1.3 1.5 1.3 3.2 1.3 5C18.5 18.4 15.9 21 12 21Z" />
    </svg>
  );
}

/** 저장하지 않음 — 서랍에 사선. '영상 파일은 저장하지 않습니다'. */
export function NoStoreIcon(props: IconProps) {
  return (
    <svg {...STROKE_BASE} {...props}>
      <path d="M4 8h16v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V8Z" />
      <path d="M3 4h18v4H3z" />
      <path d="M4 21L20 5" />
    </svg>
  );
}

/* ── 번호 분석 '이 돈이면' 환산 (2026-09-17) ───────────────────────── */

/** 치킨 — 닭다리. */
export function DrumstickIcon(props: IconProps) {
  return (
    <svg {...STROKE_BASE} {...props}>
      <path d="M15.5 3.5a5 5 0 0 1 5 5c0 3.6-3.8 6.2-7.2 6.2l-3 3a2 2 0 1 1-2.6 2.6 2 2 0 1 1-2.6-2.6 2 2 0 1 1 2.6-2.6l3-3c0-3.4 2.3-8.6 4.8-8.6Z" />
    </svg>
  );
}

/** 커피 — 손잡이 달린 잔. */
export function CupIcon(props: IconProps) {
  return (
    <svg {...STROKE_BASE} {...props}>
      <path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9Z" />
      <path d="M16 11h1.5a2.5 2.5 0 0 1 0 5H16" />
      <path d="M8 3v3" />
      <path d="M12 3v3" />
    </svg>
  );
}

/** 영화 — 필름 한 칸. */
export function FilmIcon(props: IconProps) {
  return (
    <svg {...STROKE_BASE} {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 4v16" />
      <path d="M17 4v16" />
      <path d="M3 9h4" />
      <path d="M3 15h4" />
      <path d="M17 9h4" />
      <path d="M17 15h4" />
    </svg>
  );
}

/**
 * 되감기 시계 — '샀다면?'(과거로 돌아가 본다).
 * ⚠ `NumberActions` 안의 같은 그림과 **모양을 맞춘다.** 한 사이트에서 같은 뜻의 아이콘이
 *   두 모양이면 다른 기능으로 읽힌다. 그쪽은 버튼 전용 규격(16px)이라 파일 안에 두었다.
 */
export function RewindGlyph(props: IconProps) {
  return (
    <svg {...STROKE_BASE} {...props}>
      <path d="M3 12a9 9 0 1 0 2.64-6.36" />
      <path d="M3 3v5h5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}
