import Link from 'next/link'
import type { Metadata } from 'next'

import { Breadcrumb } from '@/components/Breadcrumb'
import { Disclaimer } from '@/components/Disclaimer'
import { GuideHeroImage } from '@/components/GuideHeroImage'
import { GuideNav } from '@/components/GuideNav'
import { GuideRail } from '@/components/GuideRail'
import { JsonLd, articleLd } from '@/components/JsonLd'
import { InfoIcon, ScaleIcon } from '@/components/icons'
import { SITE_NAME, SITE_URL } from '@/lib/env'

/**
 * 건전한 복권 이용 (`/guide/responsible-lottery`).
 *
 * ── 2026-09-17 구조 개편 ────────────────────────────────────────────
 * 다섯 장 중 **가장 조심해서 고친 페이지**다. 여기 담긴 것은 안내가 아니라
 * 상담 창구와 법적 고지라, 보기 좋게 만든다고 문장을 줄이면 그 자체가 손실이다.
 *
 * 그래서 **문장은 거의 그대로 두고 배치만 바꿨다.**
 * - 지킬 기준 다섯 가지 → 체크리스트 카드(훑으면서 자기 경우를 짚을 수 있게)
 * - 과도한 이용의 신호 → 같은 형태로 나란히 두어 위의 기준과 대비
 * - 1336 상담 → `.gd-figure` 로 **번호 자체를 크게**. 이 페이지에서 가장
 *   중요한 정보이고, 필요한 사람은 문단을 읽는 상태가 아닐 수 있다.
 *
 * ⚠ `Disclaimer` 와 19세 고지를 걷어내지 않는다. 애드센스 심사와 법적 포지션이
 *   여기 걸려 있다([[forbidden-expressions]], [[adsense-readiness]]).
 */

export const metadata: Metadata = {
  title: '건전한 복권 이용 안내 — 스스로 지킬 기준과 상담 창구',
  description:
    '복권은 투자가 아니라 오락입니다. 스스로 정할 수 있는 다섯 가지 기준, 이용 습관을 돌아볼 신호, 무료 상담 창구(1336), 사칭·사기 주의점을 정리했습니다.',
  alternates: { canonical: '/guide/responsible-lottery' },
  openGraph: {
    type: 'article',
    url: '/guide/responsible-lottery',
    title: '건전한 복권 이용 안내 — 스스로 지킬 기준과 상담 창구',
    description: '복권을 즐겁게 이용하기 위한 기준과 도움받을 수 있는 곳을 안내합니다.',
  },
}

/** 스스로 정하는 기준. 원고의 다섯 항목을 그대로 옮겼다. */
const RULES = [
  '매달 쓸 수 있는 금액을 미리 정하고 넘지 않습니다.',
  '잃어도 생활에 지장이 없는 돈으로만 구매합니다.',
  '돈을 빌려서 구매하지 않습니다.',
  '잃은 금액을 되찾으려고 구매를 늘리지 않습니다.',
  '스트레스나 우울한 기분을 달래려고 구매하지 않습니다.',
] as const

/** 돌아볼 신호. 원고의 다섯 항목을 그대로 옮겼다. */
const SIGNALS = [
  '구매 금액이나 횟수를 가족이나 주변에 숨긴다',
  '정해 둔 예산을 자주 넘긴다',
  '당첨되지 않으면 초조하거나 화가 난다',
  '복권 생각 때문에 일상에 집중하기 어렵다',
  '당첨금으로 빚을 갚을 계획을 세운다',
] as const

const TOC = [
  { id: 'why', label: '오락이라는 것' },
  { id: 'rules', label: '지킬 기준' },
  { id: 'signals', label: '돌아볼 신호' },
  { id: 'help', label: '도움받는 곳' },
  { id: 'fraud', label: '사기 주의' },
] as const

export default function ResponsibleLotteryPage() {
  return (
    <div className="container">
      <Breadcrumb
        items={[
          { name: '홈', href: '/' },
          { name: '가이드', href: '/guide' },
          { name: '건전한 복권 이용', href: '/guide/responsible-lottery' },
        ]}
      />

      <article>
        <section className="section gd-head">
          <h1>건전한 복권 이용 안내</h1>
          <p className="gd-lede">
            복권 한 장은 영화표에 가깝습니다. 얼마간의 기대를 사고 정해진 금액을 냅니다.
            그 선을 지키는 방법을 정리했습니다.
          </p>
          <GuideHeroImage
            slug="responsible-lottery"
            alt="균형 저울과 하트, 달력이 어우러진 건전한 이용 일러스트"
          />
          <nav aria-label="이 글에서 다루는 것">
            <ul className="gd-toc">
              {TOC.map((item) => (
                <li key={item.id}>
                  <a href={`#${item.id}`}>{item.label}</a>
                </li>
              ))}
            </ul>
          </nav>
        </section>

        {/* 넓은 화면의 오른쪽 목차 레일. 머리의 칩과 같은 TOC 를 쓴다(→ GuideRail 주석). */}
        <GuideRail items={TOC} />

        <section className="section gd-sec gd-reveal" id="why">
          <h2>수익을 내는 계획은 성립하지 않습니다</h2>
          <p>
            복권 구매는 길게 보면 <strong>낸 돈보다 적게 돌려받는</strong> 활동입니다.
            비관적인 전망이 아니라 제도의 설계가 그렇습니다. 판매금의 일부는 당첨금으로,
            일부는 복권기금으로 쓰이기 때문입니다.
          </p>
          <p>
            그래서 복권은 불릴 수단이 아니라 <strong>쓰는 즐거움</strong>입니다. 아주 낮은
            가능성으로 큰 금액이 돌아올 수 있다는 점이 다르지만, 그 가능성에 기대어 지출을
            늘리는 순간 오락은 도박이 됩니다.
          </p>
        </section>

        <section className="section gd-sec gd-reveal" id="rules">
          <h2>스스로 정하는 다섯 가지</h2>
          <p>누가 정해 주는 기준이 아니라 사기 전에 스스로 정해 두는 선입니다.</p>
          <ul className="gd-versus">
            {RULES.map((rule) => (
              <li key={rule} data-accent="lotto">
                <p>{rule}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="section gd-sec gd-reveal" id="signals">
          <h2>이럴 때는 돌아볼 때입니다</h2>
          <p>아래에 해당하는 것이 있다면 이용 습관을 점검해 보세요.</p>
          <ul className="gd-versus">
            {SIGNALS.map((signal) => (
              <li key={signal} data-accent="reco">
                <p>{signal}</p>
              </li>
            ))}
          </ul>
          <p>
            이런 신호가 반복된다면 혼자 해결하려 하지 마세요. 도박 문제는 의지의 문제가
            아니라 <strong>도움을 받아 다룰 수 있는 문제</strong>입니다.
          </p>
        </section>

        {/* ⚠ 이 절이 이 페이지의 존재 이유다. 상담 번호를 문단 속에 묻지 않는다 —
            필요한 사람은 글을 차분히 읽는 상태가 아닐 수 있다. */}
        <section className="section gd-sec gd-reveal" id="help">
          <h2>도움받을 수 있는 곳</h2>
          <dl className="gd-figures">
            <div className="gd-figure">
              <dt>한국도박문제예방치유원 상담</dt>
              <dd>
                1336<span>· 국번 없이</span>
              </dd>
              <p>24시간 · 무료 · 비밀 보장.</p>
            </div>
            <div className="gd-figure">
              <dt>상담할 수 있는 사람</dt>
              <dd>
                본인<span>과 가족</span>
              </dd>
              <p>가족도 직접 상담을 신청할 수 있습니다.</p>
            </div>
          </dl>
          <div className="gd-callout">
            <p className="gd-callout-head">
              <ScaleIcon className="gd-callout-icon" />
              19세 미만은 구매할 수 없습니다
            </p>
            <p>
              법률에 따라 19세 미만은 복권을 구매할 수 없습니다. 미성년자를{' '}
              <strong>대신 구매해 주는 것도 금지</strong>됩니다.
            </p>
          </div>
        </section>

        <section className="section gd-sec gd-reveal" id="fraud">
          <h2>사칭과 사기를 조심하세요</h2>
          <div className="gd-callout" data-tone="warn">
            <p className="gd-callout-head">
              <InfoIcon className="gd-callout-icon" />
              번호를 알려 준다는 연락은 모두 사기입니다
            </p>
            <p>
              &ldquo;당첨 번호를 알려 준다&rdquo;, &ldquo;번호를 맞혀 준다&rdquo;며 돈을
              요구하는 연락은 예외 없이 사기입니다. <strong>그런 정보는 존재하지 않습니다.</strong>{' '}
              구매를 대행해 준다는 사이트, 당첨금 수령에 수수료를 요구하는 연락도
              마찬가지입니다.
            </p>
          </div>
          <p>
            국내에서 복권 판매는 기획재정부 복권위원회가 지정한 공식 사업자만 할 수
            있습니다. 그 밖의 경로로 판매되는 복권은 합법이 아닙니다.
          </p>
          <p className="gd-source">
            추천번호가 왜 참고용인지에 대한 설명은{' '}
            <Link href="/lotto/recommend">번호 추천 시뮬레이터</Link> 페이지 하단에도
            있습니다.
          </p>
        </section>

        <Disclaimer>
          행운상자는 복권 관련 정보와 통계를 제공하는 서비스이며, 복권을 판매하거나 구매를
          대행하지 않습니다. 번호 추천은 통계와 AI를 활용한 시뮬레이션이며 당첨을 보장하지
          않습니다. 19세 미만은 복권을 구매할 수 없습니다.
        </Disclaimer>
      </article>

      <GuideNav current="responsible-lottery" />

      <JsonLd
        data={articleLd({
          headline: '건전한 복권 이용 안내 — 스스로 지킬 기준과 상담 창구',
          description:
            '복권을 오락으로 즐기기 위한 기준, 과도한 이용의 신호, 무료 상담 창구를 안내합니다.',
          siteName: SITE_NAME,
          siteUrl: SITE_URL,
          datePublished: '2026-07-09',
          dateModified: '2026-09-17',
        })}
      />
    </div>
  )
}
