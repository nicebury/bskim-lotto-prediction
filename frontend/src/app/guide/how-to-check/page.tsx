import Link from 'next/link'
import type { Metadata } from 'next'

import { Breadcrumb } from '@/components/Breadcrumb'
import { Faq } from '@/components/Faq'
import { GuideHeroImage } from '@/components/GuideHeroImage'
import { GuideNav } from '@/components/GuideNav'
import { JsonLd, articleLd } from '@/components/JsonLd'
import { RankExplainer } from '@/components/RankExplainer'
import { SITE_NAME, SITE_URL } from '@/lib/env'

export const metadata: Metadata = {
  title: '로또 당첨번호 확인 방법 — 동행복권·네이버 검색',
  description:
    '로또 6/45 당첨번호를 동행복권 공식 사이트와 네이버 검색으로 확인하는 방법, 등수 판정 기준, 확인 시 주의할 점을 정리했습니다.',
  alternates: { canonical: '/guide/how-to-check' },
  openGraph: {
    type: 'article',
    url: '/guide/how-to-check',
    title: '로또 당첨번호 확인 방법 — 동행복권·네이버 검색',
    description: '동행복권·네이버 검색으로 당첨번호를 확인하는 방법과 등수 판정 기준을 안내합니다.',
  },
}

/** 화면에 렌더링되는 FAQ. JSON-LD 와 텍스트가 정확히 일치해야 한다. */
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
        <section className="section">
          <h1>로또 당첨번호 확인 방법</h1>
          <p className="muted" style={{ marginTop: 'var(--space-2)' }}>
            공식 사이트와 검색으로 당첨번호를 확인하고, 등수를 판정하는 방법을 정리했습니다.
          </p>
          <GuideHeroImage slug="how-to-check" alt="로또 용지와 돋보기로 당첨번호를 확인하는 일러스트" />
        </section>

        <section className="section prose">
          <h2>1. 추첨 시각을 안다</h2>
          <p>
            로또 6/45는 <strong>매주 토요일 오후 8시 35분경</strong>에 추첨합니다. 추첨에서는
            당첨번호 6개와 보너스 번호 1개가 순서대로 나옵니다. 번호가 뽑힌 순서는 당첨 판정에 아무
            영향을 주지 않으므로, 결과는 보통 오름차순으로 정리해 표시합니다.
          </p>

          <h2>2. 당첨번호를 확인한다</h2>
          <p>당첨번호는 세 가지 방법으로 확인할 수 있습니다.</p>
          <ul>
            <li>
              <strong>동행복권 공식 사이트</strong> — <code>dhlottery.co.kr</code>에 접속해 첫
              화면 또는 &lsquo;당첨결과&rsquo; 메뉴에서 최신 회차와 지난 회차를 모두 볼 수 있습니다.
              가장 정확한 공식 출처입니다.
            </li>
            <li>
              <strong>포털 검색</strong> — 네이버나 구글에 <strong>&ldquo;로또 당첨번호&rdquo;</strong>를
              검색하면 최신 회차 당첨번호가 검색 결과 상단에 바로 표시됩니다. 빠르게 확인할 때
              편리합니다.
            </li>
            <li>
              <strong>행운상자</strong> — 우리 사이트의{' '}
              <Link href="/lotto/latest">최신 당첨결과</Link> 페이지와 회차 상세 페이지에서
              회차별로 정리해 볼 수 있습니다.
            </li>
          </ul>

          <h2>3. 내 번호와 대조한다</h2>
          <p>
            구매한 용지에 적힌 여섯 개의 번호를 당첨번호와 하나씩 맞춰 봅니다. 몇 개가 일치하는지
            세면 등수가 정해집니다. 한 장의 용지에 여러 게임이 인쇄된 경우 각 게임을 따로 확인해야
            합니다. 종이 복권은 판매점 단말기나 스캐너로도 당첨 여부를 조회할 수 있습니다.
          </p>

          <h2>4. 등수를 판정한다</h2>
          <p>
            맞은 번호 개수로 등수가 정해집니다. 아래는 판정 방식을 색으로 보여 준 것입니다 — 진한
            볼이 맞은 번호, 흐린 볼이 못 맞은 번호입니다.
          </p>

          <RankExplainer />

          <p>
            2등과 3등을 가르는 것은 보너스 번호 하나입니다. 다섯 개를 맞혔다면 나머지 한 번호가
            보너스 번호와 같은지 반드시 확인하세요. 보너스 번호는 2등 판정에만 쓰이며, 그 밖의
            등수에는 영향을 주지 않습니다.
          </p>

          <h2>5. 확인할 때 주의할 점</h2>
          <p>
            인터넷에서 본 당첨번호가 잘못 옮겨졌을 가능성은 늘 있습니다. 당첨이 확인되었다면 반드시
            동행복권 공식 발표와 다시 대조하시기 바랍니다. 우리 사이트를 포함한 정보 제공 서비스의
            표시는 참고용이며, 실제 당첨 여부를 확정하지 않습니다.
          </p>
          <p>
            종이 복권은 용지를 잃어버리면 당첨금을 받을 수 없습니다. 지급 기한이 지나기 전까지
            용지를 잘 보관하세요. 당첨금 수령 절차는{' '}
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
          dateModified: '2026-07-15',
        })}
      />
    </div>
  )
}
