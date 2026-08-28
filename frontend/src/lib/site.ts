import { DREAM_MEANINGS } from './dream-meanings'

/**
 * 사이트 구조 상수. 내비게이션·홈 타일·가이드 목록·면책 문구의 단일 출처.
 *
 * 헤더/푸터/홈/사이트맵이 같은 목록을 각자 하드코딩하면 링크 하나를 추가할 때 네 곳을
 * 고쳐야 하고 결국 어긋난다. URL 구조의 정본은 docs/raw/작업지시초안.md 5.1 절이다.
 */

/** 면책 고지 — 추천 결과·꿈해몽 결과·통계 페이지에 **반드시** 붙는다. */
export const DISCLAIMER = {
  /** 추천번호 화면. 백엔드가 응답에 disclaimer 를 담아 주지만, 응답이 없을 때의 폴백. */
  recommend:
    '추천번호는 과거 당첨번호 통계와 랜덤 알고리즘을 활용한 참고용 시뮬레이션입니다. 당첨을 보장하지 않습니다.',
  /** 통계 페이지 전체 공통. */
  stats:
    '로또 번호는 무작위로 추첨되므로 과거 통계가 향후 당첨을 보장하지 않습니다. 본 통계는 과거 회차의 분포를 이해하기 위한 참고 정보입니다.',
  /** 꿈해몽 화면. 꿈과 당첨 사이에 인과관계를 주장하지 않는다. */
  dream:
    '꿈해몽 번호는 전통적인 꿈 해석 자료를 바탕으로 만든 참고용 콘텐츠입니다. 꿈과 당첨 사이에는 아무런 인과관계가 없으며, 당첨을 보장하지 않습니다.',
  /** localStorage 안내(로그인이 없다는 사실을 명확히 알린다). */
  localStorage:
    '저장한 번호는 현재 브라우저에만 보관됩니다. 브라우저 데이터를 삭제하거나 다른 기기에서 접속하면 저장 정보가 유지되지 않을 수 있습니다.',
} as const

/** 헤더 내비게이션. 모바일 드로어도 같은 목록을 쓴다. */
export const NAV_ITEMS = [
  { href: '/lotto', label: '로또' },
  { href: '/lotto/stat', label: '번호통계' },
  { href: '/lotto/recommend', label: '번호추천' },
  { href: '/dream', label: '꿈해몽번호' },
  { href: '/videos', label: '영상' },
  { href: '/news', label: '뉴스' },
  { href: '/guide', label: '가이드' },
] as const

/**
 * 홈 아이콘 6타일. 각 타일에 **짧은 설명**을 붙인다 — 아이콘만 있는 홈은 저가치 페이지로
 * 읽힌다(→ docs/wiki/30-seo/adsense-readiness.md 콘텐츠 최소 기준).
 *
 * `accent` 는 `--svc-*` 토큰 접미어이자 `SERVICE_ICONS` 의 키다. 하나가 색과 아이콘을
 * 동시에 고르므로 둘이 어긋날 수 없다. 이모지는 쓰지 않는다(→ components/icons.tsx).
 */
export const SERVICE_TILES = [
  {
    href: '/lotto',
    accent: 'lotto',
    title: '로또 6/45',
    summary: '최신 당첨결과와 회차별 정보',
  },
  {
    href: '/lotto/stat',
    accent: 'stats',
    title: '번호 통계',
    summary: '출현 빈도, 패턴 분석 통계',
  },
  {
    href: '/lotto/recommend',
    accent: 'reco',
    title: '번호 추천',
    summary: '여섯 가지 방식의 번호 추천',
  },
  {
    href: '/dream',
    accent: 'dream',
    title: '꿈해몽 추천',
    summary: '꿈 키워드로 번호 찾기',
  },
  {
    href: '/news',
    accent: 'news',
    title: '복권 뉴스',
    summary: '복권 관련 최신 뉴스 모음',
  },
  {
    // 준비 중 타일은 링크가 아니다. 빈 페이지를 만들지 않는다(애드센스 심사 기준).
    href: null,
    accent: 'pension',
    title: '연금복권',
    summary: '곧 업데이트됩니다',
    badge: '준비중',
  },
] as const

/** 로또 가이드. 홈 하단 5카드 · /guide 허브 · 사이트맵이 공유한다. */
export const GUIDES = [
  {
    slug: 'how-to-check',
    title: '로또 당첨번호 확인 방법',
    summary: '당첨번호 확인부터 당첨금 조회까지',
    accent: 'lotto',
  },
  {
    slug: 'prize-claim',
    title: '로또 당첨금 수령 방법',
    summary: '등수별 수령 방법과 지급기한 안내',
    accent: 'news',
  },
  {
    // 002 R26: '로또 기본 규칙' → 흥미 중심 제목. URL(slug)은 유지해 색인·링크를 보존한다.
    slug: 'lotto-rule',
    title: '로또의 재미있는 사실',
    summary: '조합의 수·확률 비유·세계의 로또 이야기',
    accent: 'stats',
  },
  {
    slug: 'auto-vs-manual',
    title: '자동과 수동의 차이',
    summary: '자동 구매와 수동 구매의 차이 알아보기',
    accent: 'reco',
  },
  {
    slug: 'responsible-lottery',
    title: '건전한 복권 이용',
    summary: '복권을 즐겁게 이용하는 올바른 방법',
    accent: 'dream',
  },
] as const

export type GuideSlug = (typeof GUIDES)[number]['slug']

/**
 * 통계 화면 3종. 상단 탭 내비·사이트맵이 공유한다.
 *
 * ⚠ **`/lotto/stat` 자체가 '많이 나온 번호와 안 나온 번호' 화면이다**(003 개편).
 *   종전에는 허브였고 hot-cold 가 하위 URL 이었는데, 사용자가 통계에 들어오면 곧바로 그
 *   화면을 보길 원했다. `/lotto/stat/hot-cold` 는 여기로 영구 리다이렉트한다.
 *   아직 배포 전이라 색인된 URL 이 없어 URL 하나를 줄여도 잃을 것이 없다.
 *
 * `short` 는 좁은 화면의 탭 라벨이다. 제목을 그대로 쓰면 3개가 한 줄에 들어가지 않는다.
 */
export const STAT_PAGES = [
  {
    key: 'hot-cold',
    href: '/lotto/stat',
    short: '많이·안 나온',
    title: '많이 나온 번호 · 안 나온 번호',
    summary: '자주 나온 번호, 뜸했던 번호, 오래 안 나온 번호를 순위로 봅니다.',
    /** 카드 배경에 쓰는 서비스 색 키. 사이트 전체가 같은 색 언어를 쓴다. */
    accent: 'stats',
  },
  {
    key: 'frequency',
    href: '/lotto/stat/frequency',
    short: '출현 빈도',
    title: '번호별 출현 빈도',
    summary: '1번부터 45번까지 각 번호가 몇 번 나왔는지 한눈에 봅니다.',
    accent: 'lotto',
  },
  {
    key: 'pattern',
    href: '/lotto/stat/pattern',
    short: '조합 패턴',
    title: '홀짝 · 고저 · 합계 패턴',
    summary: '당첨 조합이 어떤 모양이었는지 분포로 살펴봅니다.',
    accent: 'reco',
  },
] as const

export type StatPageKey = (typeof STAT_PAGES)[number]['key']

/**
 * hot-cold 순위 목록의 표시 개수 선택지 (003). **기본 10.**
 *
 * 종전 기본값은 15였는데, 첫 화면에 15줄짜리 표가 둘(자주 나온 / 안 나온) 쌓여 훑기가
 * 부담스러웠다(사용자). 10은 "TOP 10" 이라는 익숙한 단위이기도 하다. 더 보고 싶으면
 * 칩으로 늘린다 — 선택지 자체는 그대로 둔다.
 */
export const STAT_TOP_OPTIONS = [10, 15, 20, 25, 30, 35, 40] as const
export const STAT_TOP_DEFAULT = 10


/**
 * 검색에 노출할 꿈 키워드 (003).
 *
 * 사전에는 표제어가 4,802개 있고 종전에는 그것을 **전부** 사이트맵에 실었다. 그러나 백엔드는
 * 표제어와 번호만 주고 해몽 풀이 본문은 주지 않는다 — 풀이 없는 4,802개는 서로 거의 같은
 * 얇은 페이지다. 그런 페이지가 사이트맵의 79%를 차지하면 사이트 전체가 저품질로 평가될
 * 위험이 있고, 애드센스 심사에서도 같은 기준이 적용된다(→ [[adsense-readiness]]).
 *
 * 그래서 **손으로 쓴 민간 해석이 있는 소재만** 색인 대상으로 남긴다. 나머지 키워드도 URL 로는
 * 그대로 열리고 꿈 분석도 정상 동작한다 — 색인만 하지 않는 것이다.
 *
 * ⚠ 목록을 **`DREAM_MEANINGS` 에서 그대로 끌어온다.** 두 곳에 따로 적으면 어긋난다 —
 *   풀이 없는 소재를 색인하면 얇은 페이지가 되고, 풀이가 있는데 색인하지 않으면 애써 쓴
 *   원고가 검색에 나오지 않는다. 소재를 늘리려면 `dream-meanings.ts` 에 풀이를 쓰면 되고,
 *   그것이 곧 "풀이 없이 색인하지 않는다" 는 규칙의 강제이기도 하다.
 * ⚠ 슬러그는 **한글 표기 그대로**다. 로마자로 바꾸지 않는다([[api-contract]]).
 *   30개 전부 백엔드 사전에 실제로 있는지 확인했다(2026-08-27, 표제어 4,802개 기준).
 */
export const DREAM_INDEXED_KEYWORDS: readonly string[] = Object.keys(DREAM_MEANINGS)

/** 정책 페이지. 애드센스 신청 전 4종이 모두 실제 콘텐츠로 채워져 있어야 한다. */
export const POLICY_PAGES = [
  { href: '/terms', label: '이용약관' },
  { href: '/privacy', label: '개인정보처리방침' },
  { href: '/disclaimer', label: '면책 고지' },
  { href: '/contact', label: '문의하기' },
] as const

/** 통계 window 선택지. 계약이 허용하는 값만 나열한다. */
export const STAT_WINDOWS = [
  { value: 20, label: '최근 20회' },
  { value: 50, label: '최근 50회' },
  { value: 100, label: '최근 100회' },
  { value: 'all', label: '역대 전체' },
] as const

/**
 * 구간을 사람이 읽는 문구로. "최근 20회" / "역대 전체"
 *
 * ⚠ 이 함수는 서버 컴포넌트와 클라이언트 컴포넌트가 모두 쓴다. 그래서 'use client' 파일이
 *   아니라 여기(공용 모듈)에 둔다. 클라이언트 모듈에서 export 한 일반 함수를 서버
 *   컴포넌트가 import 하면 클라이언트 참조가 되어 호출할 수 없다.
 */
export function windowLabel(window: 20 | 50 | 100 | 'all'): string {
  return window === 'all' ? '역대 전체' : `최근 ${window}회`
}
