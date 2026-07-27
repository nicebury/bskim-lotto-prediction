import Link from 'next/link'
import type { Metadata } from 'next'

import { Breadcrumb } from '@/components/Breadcrumb'
import { Faq } from '@/components/Faq'
import { GuideNav } from '@/components/GuideNav'
import { JsonLd, articleLd } from '@/components/JsonLd'
import { SITE_NAME, SITE_URL } from '@/lib/env'

export const metadata: Metadata = {
  title: '자동과 수동의 차이',
  description:
    '로또 자동 선택과 수동 선택의 차이, 반자동이 무엇인지, 어느 쪽을 고르는 것이 좋은지 설명합니다.',
  alternates: { canonical: '/guide/auto-vs-manual' },
  openGraph: {
    type: 'article',
    url: '/guide/auto-vs-manual',
    title: '자동과 수동의 차이',
    description: '자동 선택과 수동 선택의 차이를 설명합니다.',
  },
}

const FAQ_ITEMS = [
  {
    question: '자동과 수동 중 어느 쪽이 유리한가요?',
    answer:
      '어느 쪽도 유리하지 않습니다. 추첨은 구매 방식과 무관하게 진행되므로, 자동으로 받은 번호와 직접 고른 번호는 같은 처지에 있습니다.',
  },
  {
    question: '1등 당첨자 중에 자동이 많다고 들었습니다.',
    answer:
      '자동으로 구매하는 사람이 수동보다 많기 때문입니다. 구매 비율이 그대로 당첨자 비율에 반영된 결과이며, 자동이 더 잘 맞는다는 뜻이 아닙니다.',
  },
  {
    question: '반자동은 무엇인가요?',
    answer:
      '일부 번호만 직접 고르고 나머지를 자동으로 채우는 방식입니다. 고르는 방법이 섞여 있을 뿐 당첨 판정 기준은 자동, 수동과 완전히 같습니다.',
  },
]

export default function AutoVsManualPage() {
  return (
    <div className="container">
      <Breadcrumb
        items={[
          { name: '홈', href: '/' },
          { name: '가이드', href: '/guide' },
          { name: '자동과 수동의 차이', href: '/guide/auto-vs-manual' },
        ]}
      />

      <article>
        <section className="section">
          <h1>자동과 수동의 차이</h1>
          <p className="muted" style={{ marginTop: 'var(--space-2)' }}>
            번호를 고르는 방법이 다를 뿐, 당첨 판정은 완전히 같습니다.
          </p>
        </section>

        <section className="section prose">
          <h2>세 가지 방식</h2>
          <ul>
            <li>
              <strong>자동</strong> — 단말기가 무작위로 여섯 개를 골라 줍니다.
            </li>
            <li>
              <strong>수동</strong> — 구매자가 용지에 여섯 개를 직접 표시합니다.
            </li>
            <li>
              <strong>반자동</strong> — 일부만 직접 고르고 나머지를 자동으로 채웁니다.
            </li>
          </ul>

          <h2>당첨 판정에는 차이가 없다</h2>
          <p>
            추첨기는 그 번호가 어떻게 선택되었는지 알지 못합니다. 자동으로 받은 조합이든 오래
            생각해 고른 조합이든, 8,145,060가지 조합 중 하나라는 사실은 같습니다. 따라서 두 방식의
            결과는 구분되지 않습니다.
          </p>

          <h2>&ldquo;자동이 잘 맞는다&rdquo;는 말은 어디서 왔나</h2>
          <p>
            1등 당첨자 중 자동 구매자가 많다는 통계는 사실입니다. 그러나 이것은 <strong>자동으로
            구매하는 사람이 훨씬 많기</strong> 때문입니다. 열 명 중 여덟 명이 자동으로 산다면
            당첨자 중에서도 대략 여덟 명이 자동일 것입니다. 그 비율은 자동의 성능이 아니라 구매
            습관을 보여 줍니다.
          </p>
          <p>
            반대로 &ldquo;수동이 정성이 들어가서 낫다&rdquo;는 말도 근거가 없습니다. 정성은 추첨기에
            전달되지 않습니다.
          </p>

          <h2>그럼 무엇을 기준으로 고를까</h2>
          <p>
            결과가 같다면 남는 것은 <strong>취향</strong>입니다. 번호를 고르는 과정 자체가
            즐겁다면 수동을, 빠르고 간편한 쪽이 좋다면 자동을 고르면 됩니다. 기념일이나 좋아하는
            숫자를 넣고 싶다면 그렇게 하세요. 어느 쪽도 손해가 아닙니다.
          </p>
          <p>
            다만 사람들이 자주 고르는 번호(생일 범위인 1~31번 등)에 몰린 조합이 1등이 되면 당첨금을
            나눌 사람이 많아질 수는 있습니다. 이것은 당첨 가능성이 아니라 <strong>당첨금 분배</strong>에
            관한 이야기입니다.
          </p>
          <p>
            재미로 번호를 만들어 보고 싶다면{' '}
            <Link href="/lotto/recommend">번호 추천 시뮬레이터</Link>를 이용해 보세요. 그 도구
            역시 당첨 결과를 개선하지 않습니다.
          </p>
        </section>

        <Faq items={FAQ_ITEMS} />
      </article>

      <GuideNav current="auto-vs-manual" />

      <JsonLd
        data={articleLd({
          headline: '자동과 수동의 차이',
          description: '로또 자동 선택과 수동 선택의 차이를 설명합니다.',
          siteName: SITE_NAME,
          siteUrl: SITE_URL,
          datePublished: '2026-07-09',
          dateModified: '2026-07-15',
        })}
      />
    </div>
  )
}
