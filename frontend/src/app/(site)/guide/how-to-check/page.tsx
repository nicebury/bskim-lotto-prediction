import Link from 'next/link'
import type { Metadata } from 'next'

import { Breadcrumb } from '@/components/Breadcrumb'
import { Faq } from '@/components/Faq'
import { GuideHeroImage } from '@/components/GuideHeroImage'
import { GuideNav } from '@/components/GuideNav'
import { GuideRail } from '@/components/GuideRail'
import { JsonLd, articleLd } from '@/components/JsonLd'
import { RankExplainer } from '@/components/RankExplainer'
import { ClockIcon, InfoIcon } from '@/components/icons'
import { SITE_NAME, SITE_URL } from '@/lib/env'

/**
 * 로또 당첨번호 확인 방법 (`/guide/how-to-check`).
 *
 * ── 2026-09-17 구조 개편 ────────────────────────────────────────────
 * **문장은 대부분 그대로 두고 그릇만 바꿨다.** 내용은 이미 정확했고, 문제는
 * `h2` + 문단 + `ul` 이 끝까지 반복돼 어디가 절차이고 어디가 주의사항인지
 * 화면이 구분해 주지 않은 것이었다.
 *
 * - 확인 절차 → `.gd-steps` (번호가 붙은 카드)
 * - 확인 창구 셋 → `.gd-versus` (나란히 견주는 카드)
 * - 주의할 점 → `.gd-callout` (문단 속에 묻히면 안 되는 말)
 *
 * ⚠ `RankExplainer` 와 `Faq` 는 손대지 않았다. 둘 다 이 화면 밖에서도 쓰이거나
 *   JSON-LD 와 문구가 **정확히 일치해야 하는** 컴포넌트다.
 */

export const metadata: Metadata = {
  title: '로또 당첨번호 확인 방법 — 동행복권·네이버 검색',
  description:
    '로또 6/45 당첨번호를 동행복권 공식 사이트와 네이버 검색으로 확인하는 방법, 등수 판정 기준, 확인 시 주의할 점을 정리했습니다.',
  alternates: { canonical: '/guide/how-to-check' },
  openGraph: {
    type: 'article',
    url: '/guide/how-to-check',
    title: '로또 당첨번호 확인 방법 — 동행복권·네이버 검색',
    description:
      '동행복권·네이버 검색으로 당첨번호를 확인하는 방법과 등수 판정 기준을 안내합니다.',
  },
}

/**
 * 화면에 렌더링되는 FAQ.
 * ⚠ JSON-LD 와 텍스트가 정확히 일치해야 한다 — `Faq` 가 둘을 함께 만든다.
 *   보이는 글과 구조화 데이터가 다르면 검색엔진이 스팸으로 본다.
 */
const FAQ_ITEMS = [
  {
    question: '로또 당첨번호는 어디서 확인하나요?',
    answer:
      '공식 확인은 동행복권 홈페이지(dhlottery.co.kr)에서 합니다. 간편하게는 네이버·구글에 "로또 당첨번호"를 검색하면 최신 회차 결과가 바로 나옵니다. 우리 사이트의 최신 당첨결과 페이지에서도 회차별로 볼 수 있습니다.',
  },
  {
    question: '지난 회차 당첨번호도 확인 가능한가요?',
    answer:
      '가능합니다. 동행복권 홈페이지의 당첨결과 메뉴에서 회차를 선택하거나, 우리 사이트의 회차 상세 페이지에서 원하는 회차의 당첨번호·보너스 번호·1등 당첨금을 회차별로 확인할 수 있습니다.',
  },
  {
    question: '보너스 번호는 어떤 등수에 사용되나요?',
    answer:
      '보너스 번호는 2등 판정에만 사용됩니다. 당첨번호 5개를 맞히고 나머지 하나가 보너스 번호와 일치하면 2등, 보너스 번호와 다르면 3등입니다.',
  },
]

const TOC = [
  { id: 'when', label: '추첨 시각' },
  { id: 'where', label: '확인하는 곳' },
  { id: 'rank', label: '등수 판정' },
  { id: 'caution', label: '주의할 점' },
] as const

export default function HowToCheckPage() {
  return (
    <div className="container">
      <Breadcrumb
        items={[
          { name: '홈', href: '/' },
          { name: '가이드', href: '/guide' },
          { name: '당첨번호 확인 방법', href: '/guide/how-to-check' },
        ]}
      />

      <article>
        <section className="section gd-head">
          <h1>로또 당첨번호 확인 방법</h1>
          <p className="gd-lede">
            토요일 저녁에 번호가 나오면, 확인은 세 곳 중 한 곳에서 하면 됩니다. 등수는
            맞은 개수로 정해지고, 2등과 3등만 보너스 번호로 갈립니다.
          </p>
          <GuideHeroImage
            slug="how-to-check"
            alt="로또 용지와 돋보기로 당첨번호를 확인하는 일러스트"
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

        <section className="section gd-sec gd-reveal" id="when">
          <h2>추첨은 토요일 저녁 8시 35분쯤</h2>
          <p>
            추첨에서는 당첨번호 6개와 보너스 번호 1개가 순서대로 나옵니다. 번호가 뽑힌
            순서는 판정에 <strong>아무 영향을 주지 않습니다</strong>. 그래서 결과는 보통
            작은 수부터 정리해 보여 줍니다.
          </p>
          <div className="gd-callout">
            <p className="gd-callout-head">
              <ClockIcon className="gd-callout-icon" />
              언제 확인하면 될까
            </p>
            <p>
              추첨 직후에는 판매점 단말기와 공식 사이트가 붐빕니다. 급하지 않다면 잠시 뒤에
              확인하는 편이 수월합니다. 당첨금 지급 기한은 1년이라 서두를 이유가 없습니다.
            </p>
          </div>
        </section>

        <section className="section gd-sec gd-reveal" id="where">
          <h2>확인하는 곳은 세 군데</h2>
          <p>어디서 보든 번호는 같습니다. 다만 성격이 다릅니다.</p>
          <ul className="gd-versus">
            <li data-accent="lotto">
              <h3>동행복권 공식 사이트</h3>
              <p>
                <code>dhlottery.co.kr</code> 첫 화면이나 &lsquo;당첨결과&rsquo; 메뉴에서
                최신 회차와 지난 회차를 모두 볼 수 있습니다. <strong>공식 출처</strong>라
                최종 확인은 여기서 합니다.
              </p>
            </li>
            <li data-accent="stats">
              <h3>포털 검색</h3>
              <p>
                네이버·구글에 &ldquo;로또 당첨번호&rdquo;를 검색하면 최신 회차가 결과
                상단에 바로 뜹니다. 가장 빠른 방법입니다.
              </p>
            </li>
            <li data-accent="reco">
              <h3>행운상자</h3>
              <p>
                <Link href="/lotto/latest">최신 당첨결과</Link> 페이지와 회차 상세에서
                회차별로 정리해 봅니다. 지난 회차를 훑어보기 좋습니다.
              </p>
            </li>
          </ul>
        </section>

        <section className="section gd-sec gd-reveal" id="rank">
          <h2>등수는 맞은 개수로 정해진다</h2>
          <p>
            용지에 적힌 여섯 개를 당첨번호와 하나씩 맞춰 보고, 몇 개가 일치하는지 셉니다.
            한 장에 여러 게임이 인쇄돼 있으면 <strong>게임마다 따로</strong> 봐야 합니다.
            판매점 단말기나 스캐너로도 조회할 수 있습니다.
          </p>
          <p>
            아래는 판정 방식을 색으로 보여 준 것입니다. 색이 있는 볼이 맞은 번호, 회색
            볼이 못 맞은 번호입니다.
          </p>

          <RankExplainer />

          <div className="gd-callout">
            <p className="gd-callout-head">
              <InfoIcon className="gd-callout-icon" />2등과 3등을 가르는 것은 번호 하나
            </p>
            <p>
              다섯 개를 맞혔다면 나머지 한 번호가 보너스 번호와 같은지 꼭 확인하세요.
              같으면 2등, 다르면 3등입니다. 보너스 번호는 <strong>2등 판정에만</strong>
              쓰이고 다른 등수에는 영향을 주지 않습니다.
            </p>
          </div>
        </section>

        <section className="section gd-sec gd-reveal" id="caution">
          <h2>확인할 때 주의할 점</h2>
          <ol className="gd-steps">
            <li className="gd-step">
              <h3>공식 발표와 다시 대조한다</h3>
              <p>
                인터넷에 옮겨진 번호가 틀렸을 가능성은 늘 있습니다. 당첨이 확인됐다면
                동행복권 공식 발표와 한 번 더 맞춰 보세요. 이 사이트를 포함한 정보 제공
                서비스의 표시는 참고용이며 당첨 여부를 확정하지 않습니다.
              </p>
            </li>
            <li className="gd-step">
              <h3>용지를 잃어버리지 않는다</h3>
              <p>
                종이 복권은 용지가 곧 권리입니다. 잃어버리면 당첨금을 받을 수 없습니다.
                지급 기한이 끝날 때까지 접히거나 젖지 않게 보관하세요.
              </p>
            </li>
            <li className="gd-step">
              <h3>사진을 찍어 두면 마음이 놓인다</h3>
              <p>
                용지 사진만으로는 당첨금을 받을 수 없지만, 번호를 다시 확인하거나 분실
                상황을 설명할 때 도움이 됩니다. 원본 용지는 그대로 보관하세요.
              </p>
            </li>
          </ol>
          <p>
            당첨금을 실제로 받는 절차는{' '}
            <Link href="/guide/prize-claim">로또 당첨금 수령 방법</Link>에서 안내합니다.
          </p>
        </section>

        <Faq items={FAQ_ITEMS} />
      </article>

      <GuideNav current="how-to-check" />

      <JsonLd
        data={articleLd({
          headline: '로또 당첨번호 확인 방법 — 동행복권·네이버 검색',
          description:
            '로또 6/45 당첨번호를 동행복권 공식 사이트와 네이버 검색으로 확인하는 방법과 등수 판정 기준을 안내합니다.',
          siteName: SITE_NAME,
          siteUrl: SITE_URL,
          datePublished: '2026-07-09',
          dateModified: '2026-09-17',
        })}
      />
    </div>
  )
}
