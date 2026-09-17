import { DREAM_MEANINGS } from './dream-meanings'

/**
 * 사이트 구조 상수. 내비게이션·홈 타일·가이드 목록·면책 문구의 단일 출처.
 *
 * 헤더/푸터/홈/사이트맵이 같은 목록을 각자 하드코딩하면 링크 하나를 추가할 때 네 곳을
 * 고쳐야 하고 결국 어긋난다. URL 구조의 정본은 docs/raw/작업지시초안.md 5.1 절이다.
 */

/** 면책 고지 — 추천 결과·꿈해몽 결과·통계 페이지에 **반드시** 붙는다. */
/*
 * ⚠ **면책 고지는 걷어내지 않는다.** 2026-09-02 에 사이트 전반의 어투를 유하게 고치면서도
 *   이 넷은 남겼다 — 법적 성격의 고지이고, 본문을 부드럽게 쓸 수 있는 근거가 바로 여기
 *   있기 때문이다(사용자도 "어차피 면책 문구가 곳곳에 있으니" 라고 했다).
 *
 * ⚠ 다만 **순서를 뒤집었다.** 종전에는 "~하지 않습니다" 로 시작해 무엇인지 말하기도 전에
 *   선을 그었다. 지금은 **무엇인지 먼저 말하고 한계를 뒤에** 붙인다. 담긴 사실은 같다.
 * ⚠ "당첨을 보장하지 않습니다" 는 그대로 둔다. 이 한 줄이 [[forbidden-expressions]] 가
 *   정한 서비스 포지셔닝의 근거다.
 */
export const DISCLAIMER = {
  /** 추천번호 화면. 백엔드가 응답에 disclaimer 를 담아 주지만, 응답이 없을 때의 폴백. */
  recommend:
    '추천번호는 과거 당첨번호 통계와 랜덤 알고리즘으로 만든 참고용 시뮬레이션입니다. 당첨을 보장하지 않습니다.',
  /** 통계 페이지 전체 공통. */
  stats:
    '본 통계는 과거 회차의 분포를 살펴보기 위한 참고 정보입니다. 로또 번호는 매 회차 무작위로 추첨되며, 당첨을 보장하지 않습니다.',
  /** 꿈해몽 화면. 꿈과 당첨 사이에 인과관계를 주장하지 않는다. */
  dream:
    '꿈해몽 번호는 전해 내려온 꿈 해석 자료를 소재로 만든 참고용 콘텐츠입니다. 꿈과 당첨 사이에 인과관계는 없으며, 당첨을 보장하지 않습니다.',
  /**
   * 번호놀이터. 게임 목록·상세·결과 패널에 붙는다.
   *
   * ⚠ **"재미용" · "모으기" 만 쓴다.** 점수·랭킹·배당·적중 같은 말을 쓰지 않는다
   *   ([[forbidden-expressions]]). 어투도 2026-09-02 규칙을 따른다 — 부정문을 늘어놓지
   *   않고, 무엇인지 먼저 말한 뒤 한계를 붙인다.
   */
  playground:
    '게임으로 모은 번호는 재미로 즐기는 참고용입니다. 추첨은 매 회차 무작위로 진행되며, 당첨을 보장하지 않습니다.',
  /** localStorage 안내(로그인이 없다는 사실을 명확히 알린다). */
  localStorage:
    '저장한 번호는 현재 브라우저에만 보관됩니다. 브라우저 데이터를 삭제하거나 다른 기기에서 접속하면 저장 정보가 유지되지 않을 수 있습니다.',
} as const

/** 헤더 내비게이션. 모바일 드로어도 같은 목록을 쓴다. */
/**
 * 헤더·드로어용 내비게이션.
 *
 * ── ⚠ `/lotto` 가 여기 없다 (2026-09-08) ───────────────────────────
 * 헤더 내비는 **1024px 이상에서만** 보이고 그 폭이 한정되어 있다. `번호놀이터`(5글자)를
 * 그냥 더하면 1024px 에서 넘칠 공산이 컸다. 그래서 상위 대시보드인 `/lotto`("로또")를
 * 뺐다 — 성격으로 봐도 그것은 최신 회차·통계·뉴스를 모은 **대시보드**이고, 구성요소인
 * 번호통계·번호추천이 이미 헤더에 따로 있어 상위와 하위가 나란히 서 있던 셈이다.
 *
 * ⚠ **`/lotto` 의 전역 링크를 잃지 않는다.** 사이트맵 priority 0.9 로 홈 다음가는
 *   페이지라, 푸터용 목록(`FOOTER_SERVICE_LINKS`)과 홈 첫 타일에 그대로 남긴다.
 *   → docs/wiki/20-design/playground.md "헤더 내비 폭" 절
 *
 * ⚠ `MobileTabBar` 의 `href` 는 이 목록의 것과 **같아야 한다.** 같은 화면이 메뉴에 따라
 *   다른 주소로 열리면 색인이 갈라진다.
 */
export const NAV_ITEMS = [
  { href: '/lotto/stat', label: '번호통계' },
  { href: '/lotto/recommend', label: '번호추천' },
  // 꿈해몽을 번호추천 바로 뒤에 둔다(2026-09-17 사용자 요청) — 둘 다 '번호를 얻는' 기능이라
  // 붙어 있어야 흐름이 이어진다. 번호놀이터는 그 뒤의 놀거리다.
  { href: '/dream', label: '꿈해몽번호' },
  { href: '/playground', label: '번호놀이터' },
  { href: '/videos', label: '영상' },
  { href: '/news', label: '뉴스' },
  { href: '/guide', label: '가이드' },
] as const

/**
 * 푸터 '서비스' 그룹. **폭 제약이 없으므로 대시보드까지 전부 싣는다.**
 *
 * ⚠ `Footer.tsx` 는 이 배열의 길이를 접이식 배지 숫자로도 쓴다. 목록을 바꾸면 그 숫자도
 *   함께 바뀐다 — 한쪽만 고치면 "서비스 7" 이라 적힌 자리에 8개가 나온다.
 */
export const FOOTER_SERVICE_LINKS = [
  { href: '/lotto', label: '로또' },
  ...NAV_ITEMS,
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
    /*
      ⚠ **'연금복권 준비중' 타일을 대체했다**(2026-09-08, [[0014-number-playground]]).
        회색으로 죽어 있는 타일 하나가 홈 6칸 중 하나를 오래 차지했고, 연금복권은 수집 소스
        문제가 풀리지 않아 언제 열릴지 알 수 없다([[dhlottery-blocked]]). 이제 여섯 칸이
        전부 살아 있는 링크다. 연금복권을 포기한 것은 아니다 — 열리면 타일을 늘리거나
        메뉴에 넣는다.
    */
    href: '/playground',
    accent: 'play',
    title: '번호놀이터',
    summary: '게임으로 번호 모으기',
  },
] as const

/** 로또 가이드. 홈 하단 5카드 · /guide 허브 · 사이트맵이 공유한다. */
/*
 * ⚠ `topics` 와 `art` 는 **가이드 허브(`/guide`)만 쓴다**(2026-09-17 추가).
 *   홈 슬라이더·푸터·`GuideNav`·사이트맵은 `slug`·`title`·`summary`·`accent` 만 읽으므로
 *   필드가 늘어도 영향이 없다.
 *
 * ⚠ 이 둘을 허브 페이지 안에 따로 두지 않는 이유: 같은 다섯 항목을 두 곳에서 관리하면
 *   가이드를 하나 더할 때 한쪽만 고쳐져 **허브에는 있는데 푸터에는 없는** 상태가 된다.
 *   이 파일이 사이트 구조의 단일 출처라는 원칙(파일 맨 위 주석)을 여기에도 적용한다.
 */
export const GUIDES = [
  {
    slug: 'how-to-check',
    title: '로또 당첨번호 확인 방법',
    summary: '당첨번호 확인부터 당첨금 조회까지',
    accent: 'lotto',
    /** 상세페이지에 **실제로 있는** h2 를 줄인 것. 지어낸 홍보 문구가 아니다. */
    topics: ['추첨 시각', '번호 대조', '등수 판정'],
    art: { name: 'how-to-check-hero', w: 1200, h: 675 },
  },
  {
    slug: 'prize-claim',
    title: '로또 당첨금 수령 방법',
    summary: '등수별 수령 방법과 지급기한 안내',
    accent: 'news',
    topics: ['수령처', '필요 서류', '지급 기한 1년'],
    art: { name: 'prize-claim-hero', w: 1200, h: 675 },
  },
  {
    // 002 R26: '로또 기본 규칙' → 흥미 중심 제목. URL(slug)은 유지해 색인·링크를 보존한다.
    slug: 'lotto-rule',
    title: '로또의 재미있는 사실',
    summary: '조합의 수·확률 비유·세계의 로또 이야기',
    accent: 'stats',
    topics: ['814만 가지 조합', '세계의 로또'],
    // ⚠ 1200×675 헤더가 아니라 400×400 스팟을 쓴다. 이 카드만 좁은 칸에 들어가는데
    //   가로로 긴 그림을 넣으면 손톱만 해진다.
    art: { name: 'fact-combinations', w: 400, h: 400 },
  },
  {
    slug: 'auto-vs-manual',
    title: '자동과 수동의 차이',
    summary: '자동 구매와 수동 구매의 차이 알아보기',
    accent: 'reco',
    // ⚠ 첫 항목은 상세의 첫 h2("세 가지 방식")를 줄인 것이다.
    topics: ['자동·수동·반자동', '당첨 판정에는 차이가 없습니다'],
    art: { name: 'auto-vs-manual-hero', w: 1200, h: 675 },
  },
  {
    slug: 'responsible-lottery',
    title: '건전한 복권 이용',
    summary: '복권을 즐겁게 이용하는 올바른 방법',
    accent: 'dream',
    topics: ['스스로 지킬 기준', '19세 미만 구매 불가'],
    art: { name: 'responsible-lottery-hero', w: 1200, h: 675 },
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
