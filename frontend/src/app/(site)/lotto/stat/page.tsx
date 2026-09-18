import Link from 'next/link'
import type { Metadata } from 'next'

import { Breadcrumb } from '@/components/Breadcrumb'
import { Disclaimer } from '@/components/Disclaimer'
import { Faq } from '@/components/Faq'
import { LottoBall } from '@/components/LottoBall'
import { NumberInspector } from '@/components/stat/NumberInspector'
import { HotColdBoard } from '@/components/stat/HotColdBoard'
import { StatNav } from '@/components/stat/StatNav'
import {
  GuideNote,
  GuideSection,
  SpecimenCard,
  SpecimenGrid,
} from '@/components/GuideSection'
import { ClockIcon, SpreadIcon, TrendIcon } from '@/components/icons'
import { JsonLd, datasetLd } from '@/components/JsonLd'
import {
  getHotCold,
  getLatestRound,
  getNumberStat,
  getRoundIndex,
  supportsRangeQuery,
} from '@/lib/api'
import { SITE_NAME, SITE_URL } from '@/lib/env'
import { DISCLAIMER, STAT_TOP_DEFAULT, STAT_WINDOWS } from '@/lib/site'

import type { HotColdResult } from '@/lib/api-types'

export const revalidate = 604800

/**
 * 번호분석 — 많이 나온 번호와 안 나온 번호 (2026-09-18 개편).
 *
 * ★ 003 개편 이래 이 URL 이 곧 '많이 나온 번호와 안 나온 번호' 화면이다.
 * `/lotto/stat/hot-cold` 는 이리로 영구 리다이렉트한다.
 *
 * ── 2026-09-18 무엇을 바꿨나 ───────────────────────────────────────
 * ① 여섯 열 표 → **막대 목록**(길이가 곧 횟수) + 구간 한 줄 요약
 * ② 이동 카드 셋 → **넷**. 넷째가 '내 번호 분석' 이고, 번호 6개를 고르면 '샀다면?' 화면으로 간다
 * ③ 안내 절은 **디자인을 그대로 두고 내용만** 쉽게 고쳤다(사용자 지시 — 다른 화면과의 통일성)
 *
 * 먼저 `/lotto/stat2` 로 시안을 만들어 확인받고 이 자리로 옮겼다(그 주소는 지웠다).
 * 데이터·호출은 개편 전과 같다 — 보이는 모양만 바뀌었다.
 */
export const metadata: Metadata = {
  title: '많이 나온 로또 번호와 안 나온 번호',
  description:
    '로또 6/45 번호별 출현 횟수와 비율, 최근 출현, 추세를 막대로 봅니다. 회차 구간을 직접 골라 조회하고, 번호 하나만 따로 보거나 내 번호 여섯 개로 역대 기록을 확인할 수도 있습니다.',
  alternates: { canonical: '/lotto/stat' },
  openGraph: {
    type: 'website',
    url: '/lotto/stat',
    title: '많이 나온 로또 번호와 안 나온 번호',
    description: '출현 횟수·비율·최근 출현·추세를 막대로 정리했습니다.',
  },
}

export default async function StatHotColdPage() {
  /*
    구간 4종을 미리 굽는다. 프리셋을 누르면 네트워크 없이 즉시 바뀌고, JS 가 꺼져 있어도
    기본 구간(최근 20회)의 목록이 HTML 에 들어 있다.
  */
  const [results, latest, roundIndex, numberProbe] = await Promise.all([
    Promise.all(STAT_WINDOWS.map((option) => getHotCold(option.value, { top: STAT_TOP_DEFAULT }))),
    getLatestRound(),
    getRoundIndex(),
    getNumberStat(1, 50),
  ])

  const initial: Partial<Record<string, HotColdResult>> = {}
  STAT_WINDOWS.forEach((option, index) => {
    const value = results[index]
    if (value) initial[String(option.value)] = value
  })

  const base = initial['20'] ?? null

  return (
    <div className="container">
      <Breadcrumb
        items={[
          { name: '홈', href: '/' },
          { name: '로또 6/45', href: '/lotto' },
          { name: '번호분석', href: '/lotto/stat' },
        ]}
      />

      <section className="s2-hero" aria-labelledby="s2-title">
        <p className="s2-eyebrow">로또 6/45 번호분석</p>
        <h1 id="s2-title">번호마다, 얼마나 나왔을까?</h1>
        <p className="s2-lede">
          고른 구간에서 각 번호가 몇 번 나왔는지 막대로 봅니다. 구간을 직접 정하거나 번호 하나만
          따로 볼 수 있고, 내 번호 여섯 개를 골라 역대 기록을 확인할 수도 있습니다.
        </p>
      </section>

      {/* 이동 카드 넷. 넷째('내 번호 분석')를 누르면 그 아래로 번호판이 열린다(→ StatNav). */}
      <section className="section">
        <StatNav current="hot-cold" />
      </section>

      <section className="section" aria-labelledby="board-title">
        <h2 id="board-title" className="sr-only">
          번호 순위
        </h2>
        {base ? (
          <HotColdBoard
            initial={initial}
            roundIndex={roundIndex?.rounds ?? null}
            latestRound={latest?.round_no ?? null}
            rangeSupported={supportsRangeQuery(base)}
          />
        ) : (
          <p className="empty-state">통계를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.</p>
        )}
        <Disclaimer spaced>{DISCLAIMER.stats}</Disclaimer>
      </section>

      <section className="section" aria-labelledby="number-title">
        <div className="section-head">
          <h2 id="number-title">번호 하나만 골라 보기</h2>
        </div>
        <NumberInspector
          roundIndex={roundIndex?.rounds ?? null}
          rangeSupported={supportsRangeQuery(base)}
          supported={numberProbe !== null}
        />
      </section>

      {/*
        ── 읽는 법 ───────────────────────────────────────
        ⚠ **디자인(표본 카드 셋 + 안내 상자)은 건드리지 않는다**(2026-09-18 사용자 지시 —
          다른 화면과 통일성). 바꾼 것은 **내용**뿐이다.
          ① 제목을 "이 표…" 에서 "이 그림들…" 로 — 화면이 표가 아니라 막대다.
          ② 설명을 값의 정의가 아니라 **"무엇을 보면 되는지"** 로 다시 썼다.
          ③ 예시 숫자를 화면과 같은 모양(막대 · 번호 · 횟수)으로 맞췄다.
      */}
      <GuideSection
        headingId="read-title"
        title="이 그림들, 뭘 보면 되나요?"
        lede="화면에 실제로 보이는 조각을 하나씩 짚었습니다. 숫자는 설명용 예시입니다."
      >
        <SpecimenGrid>
          <SpecimenCard
            accent="news"
            icon={<SpreadIcon />}
            title="막대 한 줄"
            specimen={
              <>
                <span className="spec-rank">1</span>
                <LottoBall number={28} size="sm" />
                <span className="spec-minibars" aria-hidden="true">
                  <span className="spec-minibar is-top" style={{ height: '100%' }} />
                  <span className="spec-minibar" style={{ height: '70%' }} />
                  <span className="spec-minibar" style={{ height: '45%' }} />
                </span>
                <strong>6번</strong>
                <span className="muted">30%</span>
              </>
            }
            notes={[
              {
                label: '먼저 볼 것',
                text: '막대 길이입니다. 길수록 그 구간에서 자주 나왔다는 뜻이라, 숫자를 읽지 않아도 순서가 보입니다.',
              },
              {
                label: '6번',
                text: '고른 20회 중 이 번호가 뽑힌 횟수입니다. 옆의 30%는 6 ÷ 20 입니다.',
              },
              {
                label: '같은 자',
                text: '‘많이 나온’ 과 ‘적게 나온’ 두 목록은 같은 자로 그립니다. 그래서 두 목록의 막대 길이를 그대로 견줄 수 있습니다.',
              },
            ]}
            example="6 ÷ 20 = 30% — 지난 20회의 기록입니다"
          />

          <SpecimenCard
            accent="lotto"
            icon={<TrendIcon />}
            title="추세 배지"
            specimen={
              <>
                <span className="trend trend-up">
                  <span aria-hidden="true">↑</span>
                  <span className="sr-only">후반에 더</span>
                </span>
                <span className="muted">후반에 더</span>
                <span className="trend trend-down">
                  <span aria-hidden="true">↓</span>
                  <span className="sr-only">후반에 덜</span>
                </span>
                <span className="muted">후반에 덜</span>
                <span className="trend trend-flat">
                  <span aria-hidden="true">—</span>
                  <span className="sr-only">비슷</span>
                </span>
                <span className="muted">비슷</span>
              </>
            }
            notes={[
              {
                label: '한 줄로',
                text: '고른 구간의 앞쪽 절반과 뒤쪽 절반 중 어디에서 더 나왔는지입니다.',
              },
              {
                label: '예',
                text: '최근 50회를 골랐다면 앞 25회와 뒤 25회를 견줍니다. 앞에서 2번, 뒤에서 5번 나왔으면 ‘후반에 더’ 입니다.',
              },
              {
                label: '주의',
                text: '지나간 구간을 둘로 잘라 세어 본 것입니다. 앞으로도 그러리라는 뜻은 아닙니다.',
              },
            ]}
            example="앞 25회 2번 · 뒤 25회 5번 → “후반에 더”"
          />

          <SpecimenCard
            accent="reco"
            icon={<ClockIcon />}
            title="‘오래 안 나온 번호’ 는 기준이 다릅니다"
            specimen={
              <>
                <span className="spec-rank">1</span>
                <LottoBall number={5} size="sm" />
                <strong>24회째</strong>
                <span className="muted">약 6개월</span>
              </>
            }
            notes={[
              {
                label: '기준',
                text: '이 목록만은 위에서 고른 구간과 상관없이 역대 전체에서 셉니다.',
              },
              {
                label: '왜',
                text: '최근 20회만 보면 22회째 쉰 번호와 200회째 쉰 번호가 똑같이 “20회”로 뭉개지기 때문입니다.',
              },
              {
                label: '개월 표기',
                text: '추첨이 매주 한 번이라 회차를 달로 바꿔 함께 적었습니다. 24회면 약 6개월입니다.',
              },
            ]}
            example="5번은 1213회 이후 24회째 안 나왔습니다"
          />
        </SpecimenGrid>

        <GuideNote title="‘나올 때가 됐다’ 는 느낌에 대하여">
          <p className="spec-figure">
            <strong>8,145,060</strong>
            <span>45개 중 6개를 고르는 방법의 수. 매 회차 모두 같습니다.</span>
          </p>
          <p>
            오래 안 나온 번호를 보면 슬슬 나올 차례처럼 느껴집니다. 아주 흔한 생각이고, 여기엔{' '}
            <strong>도박사의 오류</strong>라는 이름까지 붙어 있습니다. 앞면이 열 번 연속 나온
            동전도 다음은 여전히 반반입니다. 동전은 자기가 방금 무엇이었는지 모르니까요.
          </p>
          <p>
            그래서 이 화면은 지나온 기록을 들여다보는 곳입니다. 내가 늘 쓰는 번호가 지난 구간
            동안 어떻게 지냈는지 확인하는 곳이지요. 그 번호로 <strong>예전부터 샀다면</strong>{' '}
            어땠을지가 궁금하면 위의 <Link href="#mynum">내 번호 분석</Link>에서 여섯 개를
            골라 보세요.
          </p>
          <p>
            번호별 전체 분포는 <Link href="/lotto/stat/frequency">번호별 출현 빈도</Link>, 당첨
            조합의 모양은 <Link href="/lotto/stat/pattern">홀짝·고저·합계 패턴</Link>에서 볼 수
            있습니다.
          </p>
        </GuideNote>
      </GuideSection>

      <Faq
        headingId="stat-faq"
        intro="화면을 보다 막히는 지점을 순서대로 풀어 두었습니다."
        items={[
          {
            question: '비율 30%는 다음 회차에 30% 확률로 나온다는 뜻인가요?',
            answer:
              '아닙니다. 고른 20회 중 여섯 번 나왔다는, 이미 지나간 기록입니다. 20번 중 6번이니 30%인 것이지요. 다음 회차에 어떤 번호가 나올지는 이 숫자와 아무 상관이 없습니다. 추첨기는 지난주에 무엇을 뽑았는지 기억하지 못하니까요.',
          },
          {
            question: '막대 길이는 무엇을 기준으로 그린 건가요?',
            answer:
              '그 화면에서 가장 많이 나온 번호를 가장 긴 막대로 두고, 나머지를 그 비율로 그립니다. ‘많이 나온 번호’ 와 ‘적게 나온 번호’ 두 목록이 같은 자를 쓰기 때문에 두 목록의 막대를 그대로 견줄 수 있습니다. ‘오래 안 나온 번호’ 는 세는 것이 횟수가 아니라 쉰 기간이라 그 목록 안에서 따로 그립니다.',
          },
          {
            question: '‘추세’는 무엇과 무엇을 비교한 건가요?',
            answer:
              '고른 구간을 딱 반으로 잘라, 뒤쪽 절반과 앞쪽 절반에서 몇 번씩 나왔는지 견준 것입니다. 최근 50회를 골랐다면 뒤 25회와 앞 25회를 비교합니다. 앞에서 두 번, 뒤에서 다섯 번 나왔다면 ‘후반에 더’ 로 표시됩니다. 지나간 50회를 둘로 나눠 세어 본 결과일 뿐, 앞으로도 그럴 거라는 뜻은 아닙니다.',
          },
          {
            question: '‘오래 안 나온 번호’ 만 왜 기준이 다른가요?',
            answer:
              '이 목록만은 고른 구간을 무시하고 역대 전체에서 셉니다. 그러지 않으면 숫자가 뭉개지기 때문입니다. 예를 들어 최근 20회만 본다면, 22회째 안 나온 번호와 200회째 안 나온 번호가 똑같이 “20회 안 나옴” 으로 나옵니다. 둘은 전혀 다른 이야기인데 말이지요. 그래서 마지막으로 나온 회차부터 지금까지를 통째로 세고, 이해를 돕기 위해 “약 6개월” 처럼 기간도 함께 적습니다.',
          },
          {
            question: '내 번호 분석은 무엇을 보여 주나요?',
            answer:
              '고른 여섯 개로 1회차부터 매주 샀다고 가정하면 얼마를 쓰고 얼마를 돌려받았을지, 역대 당첨번호와 몇 개씩 맞았을지, 가장 많이 맞았던 회차는 언제였는지를 보여 줍니다. 지나간 회차를 대조한 기록이며 다음 회차와는 관계가 없습니다.',
          },
          {
            question: '회차 구간을 바꾸면 결과도 달라지나요?',
            answer:
              '달라집니다. 세는 범위가 달라지니 순위도 바뀝니다. 재미있는 건 구간을 넓힐수록 번호들 사이의 차이가 줄어든다는 점입니다. 20회에서는 6회와 0회처럼 차이가 크게 벌어지지만, 역대 전체로 보면 45개 번호가 고만고만해집니다. 구간 버튼을 눌러 직접 확인해 보세요.',
          },
          {
            question: '볼 색깔은 무슨 뜻인가요?',
            answer:
              '번호대를 나타냅니다. 1~10은 노랑, 11~20은 파랑, 21~30은 빨강, 31~40은 회색, 41~45는 초록입니다. 동행복권 추첨 방송에서 나오는 공과 같은 규칙이라, 색만 봐도 몇 번대인지 바로 알 수 있습니다.',
          },
        ]}
      />

      <JsonLd
        data={datasetLd({
          name: '로또 6/45 번호별 출현 순위',
          description:
            '회차 구간별 로또 번호 출현 횟수·비율·최근 출현·추세와 장기 미출현 번호 통계.',
          siteName: SITE_NAME,
          siteUrl: SITE_URL,
        })}
      />
    </div>
  )
}
