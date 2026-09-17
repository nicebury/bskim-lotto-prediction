import type { GameSlug } from '@/games/core/types'

/**
 * 게임 목록 카드의 썸네일 — **게임마다 다른 그림**.
 *
 * → docs/wiki/20-design/playground.md
 *
 * ── 왜 만들었나 ────────────────────────────────────────────────────
 * 2단계에서는 `SERVICE_ICONS`(별·6/45·막대 …)를 임시로 재사용했다. 색은 구분됐지만
 * **"오리 사격장" 옆의 별 아이콘이 게임 내용을 전혀 가리키지 않았다.** 목록에서 무엇을
 * 고르는지 알 수 없다는 뜻이라, 실제 게임 화면을 보고 각각을 다시 그렸다.
 *
 * ── ⚠ 캔버스 스냅샷을 쓰지 않는 이유 ───────────────────────────────
 * 진짜 화면을 찍어 넣는 방법도 있지만 둘 다 막힌다.
 *
 *   ① **런타임 렌더** — 목록에서 게임 모듈을 불러 그려야 한다. 그러면 목록 페이지에
 *      게임 여섯 개가 딸려 들어가 번들 경계가 무너진다("First Load +5KB 이내" 위반).
 *   ② **빌드 타임 PNG** — headless 브라우저가 빌드에 끼어들고, 여섯 장 × 라이트/다크
 *      = 열두 장을 만들어 최적화해야 한다. 의존성을 늘리지 않는다는 선을 넘는다
 *      ([[0014-number-playground]]).
 *
 * 인라인 SVG 는 **서버 HTML 에 그대로 실려** JS 가 0이고, `currentColor` 라 다크모드가
 * 저절로 따라온다. 그림이 조금 단순한 대신 그 셋을 다 지킨다.
 *
 * ── ⚠ 공통 규격 ────────────────────────────────────────────────────
 * - `viewBox="0 0 120 68"` — 카드 상단을 채우는 가로 비율
 * - 색은 **`currentColor` 하나**. 농담은 `opacity` 로만 낸다. 여섯이 한 벌로 보여야 한다
 * - `aria-hidden` — 제목과 설명이 바로 옆에 있으므로 그림은 장식이다
 */

const BASE = {
  viewBox: '0 0 120 68',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.4,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
} as const

/** 오리 사격장 — 천막 차양, 컨베이어, 오리, 조준 십자. */
function ShootingThumb() {
  return (
    <svg {...BASE}>
      {/* 차양 — 반원 넷 */}
      <path d="M8 14a7 7 0 0 1 14 0M22 14a7 7 0 0 1 14 0M36 14a7 7 0 0 1 14 0M50 14a7 7 0 0 1 14 0M64 14a7 7 0 0 1 14 0M78 14a7 7 0 0 1 14 0M92 14a7 7 0 0 1 14 0" opacity="0.45" />
      {/* 컨베이어 두 줄 */}
      <path d="M14 38h92M14 56h92" opacity="0.3" />
      {/* 오리 — 몸통·머리·부리 */}
      <path d="M30 34c5 0 9-3 9-6 0-2-2-4-5-4-2 0-4 1-5 3-3-1-6 0-6 3s3 4 7 4Z" fill="currentColor" stroke="none" opacity="0.85" />
      <circle cx="36" cy="25" r="0.9" fill="currentColor" stroke="none" opacity="0.35" />
      {/* 조준 십자 */}
      <circle cx="80" cy="46" r="9" />
      <path d="M80 33v6M80 53v6M67 46h6M87 46h6" />
    </svg>
  )
}

/**
 * 크레인 뽑기 — 레일, **전자석**, 동물 볼 줄.
 *
 * ⚠ 처음에는 캡슐(위아래 반쪽이 갈린 모양)로 그렸다가 실제 화면을 보고 고쳤다.
 *   게임 안의 상품은 **귀가 달린 동물 얼굴 볼**이고 `catalog` 의 소개도 "동물 볼" 이다.
 *   목록 그림이 실제와 다르면 직관적으로 보여 주려던 목적 자체가 무너진다.
 *
 * ⚠ **2026-09-16 에 집게 → 전자석으로 다시 그렸다.** 게임의 기구가 바뀌었는데(발톱이 볼
 *   앞을 덮어 맞물리는 느낌이 없어 자석으로 교체) **목록 그림만 옛 기구를 가리키고 있었다.**
 *   G03 이 야구로 바뀌며 썸네일을 다시 그린 것과 같은 항목이고, [[playground]] 가
 *   *"게임이 바뀌면 썸네일도 함께 본다"* 고 적어 둔 그 자리다.
 *   ⚠ 자석을 **가운데 볼 바로 위**에 세운다 — 조준이 이 게임의 전부인데, 빈 곳에 떠 있으면
 *     "무엇을 하는 게임인지" 가 그림에서 빠진다.
 */
function CraneThumb() {
  return (
    <svg {...BASE}>
      {/* 레일 */}
      <path d="M12 12h96" opacity="0.4" />
      {/* 케이블 — 레일에서 자석까지 */}
      <path d="M60 12v10" />
      {/* 자석 몸체. 게임 안에서도 가로로 넓은 사각형(44×26)이다 */}
      <rect x="50" y="22" width="20" height="12" rx="3" />
      {/* 코일 — 전자석으로 읽히게 하는 가장 싼 신호(게임 안과 같은 장치) */}
      <path d="M54 26h12M54 30h12" opacity="0.45" />
      {/*
        자기장 — 접촉면 아래로 퍼지는 호 둘. 자력이 흐르는 쪽이 아래임을 말한다.
        ⚠ 아래 호가 **볼의 귀(y≈46)를 넘지 않게** 둔다. 처음에 y43·폭26 으로 그렸더니
          가운데 볼의 귀를 정확히 가로질러 그 볼만 귀가 묻혔다(캡처로 확인).
      */}
      <path d="M53 36.5q7 4 14 0" opacity="0.55" />
      <path d="M50 40q10 5 20 0" opacity="0.3" />
      {/*
        동물 볼 셋 — 둥근 얼굴에 귀 두 개.
        ⚠ **가운데를 가장 진하게** 둔다. 자석이 겨누고 있는 볼이라, 그 볼이 흐리면
          "무엇을 노리는 그림인지" 가 거꾸로 읽힌다(농담 리듬보다 의미가 먼저다).
      */}
      <g fill="currentColor" stroke="none">
        <path d="M24 47a3 3 0 0 1 4 2M36 47a3 3 0 0 0-4 2" stroke="currentColor" strokeWidth="2.4" fill="none" opacity="0.55" />
        <circle cx="30" cy="56" r="8" opacity="0.55" />
        <path d="M54 47a3 3 0 0 1 4 2M66 47a3 3 0 0 0-4 2" stroke="currentColor" strokeWidth="2.4" fill="none" opacity="0.9" />
        <circle cx="60" cy="56" r="8" opacity="0.9" />
        <path d="M84 47a3 3 0 0 1 4 2M96 47a3 3 0 0 0-4 2" stroke="currentColor" strokeWidth="2.4" fill="none" opacity="0.55" />
        <circle cx="90" cy="56" r="8" opacity="0.55" />
      </g>
    </svg>
  )
}

/** 로또볼 홈런 — 타자와 배트, 타구 궤적, 최소 비거리선. */
function FlyballThumb() {
  /*
    ⚠ **2026-09-16 에 다시 그렸다.** 종전 그림은 발사대와 착지 구간 여덟 칸이었는데,
      게임이 야구 타격으로 통째로 바뀌어(각도·파워 게이지 폐기) **목록 그림만 옛 게임을
      가리키고 있었다.** 목록 썸네일이 실제와 다르면 "무엇을 고르는지 보여 준다" 는 목적
      자체가 무너진다(2026-09-10 크레인에서 같은 일을 겪었다).
  */
  return (
    <svg {...BASE}>
      {/* 지면 */}
      <path d="M8 58h104" opacity="0.3" />
      {/* 타자 — 머리·몸통·다리 */}
      <circle cx="22" cy="26" r="7" />
      <path d="M22 33v13M22 46l-5 10M22 46l5 10" />
      {/*
        배트 — 어깨 뒤로 세운 대기 자세.
        ⚠ 처음엔 `M27 36 14 18` 로 그었다가 **선이 머리 한가운데를 관통했다.** 손을 몸통
          왼쪽으로 내리고 끝을 더 왼쪽으로 빼면 머리 원(중심 22,26 · 반지름 7)에서 9.3px
          떨어져 비껴 간다. 캔버스 쪽 타자에서 똑같은 실수를 한 번 했는데 SVG 에서 반복했다.
      */}
      <path d="M18 38 8 20" strokeWidth="3.4" opacity="0.85" />
      {/* 타구 궤적 */}
      <path d="M34 34C52 8 78 6 96 24" strokeDasharray="4 5" opacity="0.5" />
      {/* 날아가는 공 */}
      <circle cx="96" cy="24" r="6.5" fill="currentColor" stroke="none" opacity="0.85" />
      {/* 최소 비거리선 */}
      <path d="M74 44v14" strokeDasharray="3 4" opacity="0.45" />
    </svg>
  )
}

/** 얼음판 컬링 — 스톤과 칸 보드. */
function CurlingThumb() {
  return (
    <svg {...BASE}>
      {/* 보드 격자 — 위쪽에 칸이 펼쳐진다 */}
      <path d="M28 10h64v26H28z" opacity="0.4" />
      <path d="M44 10v26M60 10v26M76 10v26M28 23h64" opacity="0.28" />
      {/* 미끄러진 자취 */}
      <path d="M60 60c0-10 0-14 0-20" strokeDasharray="3 5" opacity="0.5" />
      {/* 스톤 — 몸통과 손잡이 */}
      <ellipse cx="60" cy="58" rx="10" ry="6" fill="currentColor" stroke="none" opacity="0.85" />
      <path d="M60 52v-4" opacity="0.6" />
    </svg>
  )
}

/** 플린코 낙하 — 못 격자와 떨어지는 볼, 하단 빈. */
function PlinkoThumb() {
  return (
    <svg {...BASE}>
      {/* 못 — 세 줄 엇갈리게 */}
      <g fill="currentColor" stroke="none" opacity="0.45">
        <circle cx="30" cy="18" r="2.6" />
        <circle cx="52" cy="18" r="2.6" />
        <circle cx="74" cy="18" r="2.6" />
        <circle cx="96" cy="18" r="2.6" />
        <circle cx="41" cy="32" r="2.6" />
        <circle cx="63" cy="32" r="2.6" />
        <circle cx="85" cy="32" r="2.6" />
        <circle cx="30" cy="46" r="2.6" />
        <circle cx="52" cy="46" r="2.6" />
        <circle cx="74" cy="46" r="2.6" />
        <circle cx="96" cy="46" r="2.6" />
      </g>
      {/* 튕기며 내려가는 자취 */}
      <path d="M52 8l-11 12 11 12-11 12" strokeDasharray="3 4" opacity="0.6" />
      <circle cx="41" cy="44" r="6" fill="currentColor" stroke="none" opacity="0.9" />
      {/* 하단 빈 */}
      <path d="M20 60h80M34 54v6M48 54v6M62 54v6M76 54v6M90 54v6" opacity="0.35" />
    </svg>
  )
}

/** 링 통과 비행 — 파이프 사이의 번호 링과 나는 것. */
function RingdashThumb() {
  return (
    <svg {...BASE}>
      {/* 파이프 위아래 */}
      <path d="M78 4v18h16V4" opacity="0.5" />
      <path d="M78 64V46h16v18" opacity="0.5" />
      {/* 통과할 링 */}
      <circle cx="86" cy="34" r="9" />
      <circle cx="86" cy="34" r="4.5" opacity="0.4" />
      {/* 나는 것 — 몸통과 날개 */}
      <circle cx="30" cy="36" r="7" fill="currentColor" stroke="none" opacity="0.85" />
      <path d="M24 34c-5-3-9-2-11 1 3 3 7 3 11 1Z" fill="currentColor" stroke="none" opacity="0.55" />
      {/* 지나온 자취 */}
      <path d="M8 48c6-4 10-8 14-10" strokeDasharray="3 4" opacity="0.45" />
    </svg>
  )
}

const THUMBS: Record<GameSlug, () => React.ReactElement> = {
  shooting: ShootingThumb,
  crane: CraneThumb,
  flyball: FlyballThumb,
  curling: CurlingThumb,
  plinko: PlinkoThumb,
  ringdash: RingdashThumb,
}

export function GameThumb({ slug }: { slug: GameSlug }) {
  const Thumb = THUMBS[slug]
  return <Thumb />
}
