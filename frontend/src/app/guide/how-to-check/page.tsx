import Link from 'next/link'
import type { Metadata } from 'next'

import { Breadcrumb } from '@/components/Breadcrumb'
import { Faq } from '@/components/Faq'
import { JsonLd, articleLd } from '@/components/JsonLd'
import { SITE_NAME, SITE_URL } from '@/lib/env'

export const metadata: Metadata = {
  title: '로또 당첨번호 확인 방법',
  description:
    '로또 6/45 당첨번호를 확인하는 방법과 등수별 판정 기준, 당첨 조회 시 주의할 점을 안내합니다.',
  alternates: { canonical: '/guide/how-to-check' },
  openGraph: {
    type: 'article',
    url: '/guide/how-to-check',
    title: '로또 당첨번호 확인 방법',
    description: '당첨번호 확인 방법과 등수별 판정 기준을 안내합니다.',
  },
}

/** 화면에 렌더링되는 FAQ. JSON-LD 와 텍스트가 정확히 일치해야 한다. */
const FAQ_ITEMS = [
  {
    question: '로또 당첨번호는 어디서 확인하나요?',
    answer:
      '매주 추첨이 끝난 뒤 회차 상세 페이지에서 당첨번호 6개와 보너스 번호를 확인할 수 있습니다. 실제 당첨 여부와 당첨금은 공식 발표를 통해 확인하시기 바랍니다.',
  },
  {
    question: '보너스 번호는 어떤 등수에 사용되나요?',
    answer:
      '보너스 번호는 2등 판정에만 사용됩니다. 당첨번호 5개를 맞히고 나머지 하나가 보너스 번호와 일치하면 2등, 보너스 번호와 다르면 3등입니다.',
  },
  {
    question: '지난 회차의 당첨번호도 볼 수 있나요?',
    answer:
      '회차별 당첨결과 페이지에서 과거 회차의 당첨번호, 보너스 번호, 1등 당첨자 수와 당첨금을 회차별로 볼 수 있습니다.',
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
            추첨 결과를 확인하고 등수를 판정하는 방법을 순서대로 정리했습니다.
          </p>
        </section>

        <section className="section prose">
          <h2>1. 추첨 시각을 안다</h2>
          <p>
            로또 6/45는 <strong>매주 토요일 저녁</strong>에 추첨합니다. 추첨에서는 당첨번호 6개와
            보너스 번호 1개가 순서대로 나옵니다. 번호가 뽑힌 순서는 당첨 판정에 아무 영향을 주지
            않으므로, 결과는 보통 오름차순으로 정리해 표시합니다.
          </p>

          <h2>2. 내 번호와 대조한다</h2>
          <p>
            구매한 용지에 적힌 여섯 개의 번호를 당첨번호와 하나씩 맞춰 봅니다. 몇 개가 일치하는지
            세면 등수가 정해집니다. 한 장의 용지에 여러 게임이 인쇄된 경우 각 게임을 따로 확인해야
            합니다.
          </p>

          <h2>3. 등수를 판정한다</h2>
          <ul>
            <li>
              <strong>1등</strong> — 당첨번호 6개가 모두 일치
            </li>
            <li>
              <strong>2등</strong> — 당첨번호 5개 + 보너스 번호 일치
            </li>
            <li>
              <strong>3등</strong> — 당첨번호 5개 일치 (보너스 번호는 불일치)
            </li>
            <li>
              <strong>4등</strong> — 당첨번호 4개 일치
            </li>
            <li>
              <strong>5등</strong> — 당첨번호 3개 일치
            </li>
          </ul>
          <p>
            2등과 3등을 가르는 것은 보너스 번호 하나입니다. 다섯 개를 맞혔다면 나머지 한 번호가
            보너스 번호와 같은지 반드시 확인하세요. 보너스 번호는 그 밖의 등수 판정에는 쓰이지
            않습니다.
          </p>

          <h2>4. 확인할 때 주의할 점</h2>
          <p>
            인터넷에서 본 당첨번호가 잘못 옮겨졌을 가능성은 늘 있습니다. 당첨이 확인되었다면 반드시
            공식 발표와 다시 대조하시기 바랍니다. 이 사이트를 포함한 정보 제공 서비스의 표시는
            참고용이며, 실제 당첨 여부를 확정하지 않습니다.
          </p>
          <p>
            용지를 잃어버리면 당첨금을 받을 수 없습니다. 추첨일이 지나기 전까지 용지를 잘
            보관하세요. 당첨금 수령 절차는{' '}
            <Link href="/guide/prize-claim">로또 당첨금 수령 방법</Link>에서 안내합니다.
          </p>
        </section>

        <Faq items={FAQ_ITEMS} />

        <section className="section prose">
          <p className="muted">
            최신 회차의 당첨번호는 <Link href="/lotto/latest">최신 당첨결과</Link> 페이지에서 볼 수
            있습니다.
          </p>
        </section>
      </article>

      <JsonLd
        data={articleLd({
          headline: '로또 당첨번호 확인 방법',
          description: '로또 6/45 당첨번호를 확인하는 방법과 등수별 판정 기준을 안내합니다.',
          siteName: SITE_NAME,
          siteUrl: SITE_URL,
          datePublished: '2026-07-09',
        })}
      />
    </div>
  )
}
