import Link from 'next/link'
import type { Metadata } from 'next'

import { Breadcrumb } from '@/components/Breadcrumb'
import { JsonLd, articleLd } from '@/components/JsonLd'
import { SITE_NAME, SITE_URL } from '@/lib/env'

export const metadata: Metadata = {
  title: '로또 기본 규칙',
  description:
    '로또 6/45의 게임 방식, 등위 판정 기준, 추첨 일정, 번호 볼 색상 규칙과 조합의 수를 설명합니다.',
  alternates: { canonical: '/guide/lotto-rule' },
  openGraph: {
    type: 'article',
    url: '/guide/lotto-rule',
    title: '로또 기본 규칙',
    description: '로또 6/45의 게임 방식과 등위 판정 기준을 설명합니다.',
  },
}

export default function LottoRulePage() {
  return (
    <div className="container">
      <Breadcrumb
        items={[
          { name: '홈', href: '/' },
          { name: '가이드', href: '/guide' },
          { name: '로또 기본 규칙', href: '/guide/lotto-rule' },
        ]}
      />

      <article>
        <section className="section">
          <h1>로또 기본 규칙</h1>
          <p className="muted" style={{ marginTop: 'var(--space-2)' }}>
            게임 방식과 등위 판정, 추첨 일정, 그리고 번호에 담긴 숫자의 의미를 정리했습니다.
          </p>
        </section>

        <section className="section prose">
          <h2>게임 방식</h2>
          <p>
            1부터 45까지의 번호 중에서 <strong>6개를 고릅니다.</strong> 추첨에서는 당첨번호 6개와
            보너스 번호 1개가 나옵니다. 고른 번호와 당첨번호가 몇 개 일치하는지에 따라 등수가
            정해집니다.
          </p>

          <h2>등위 판정</h2>
          <ul>
            <li>1등 — 당첨번호 6개 일치</li>
            <li>2등 — 당첨번호 5개와 보너스 번호 일치</li>
            <li>3등 — 당첨번호 5개 일치</li>
            <li>4등 — 당첨번호 4개 일치</li>
            <li>5등 — 당첨번호 3개 일치</li>
          </ul>
          <p>
            보너스 번호는 <strong>2등 판정에만</strong> 쓰입니다. 3등은 다섯 개를 맞혔지만 나머지
            하나가 보너스 번호가 아닌 경우입니다. 통계 페이지에서 &ldquo;보너스 번호 포함/제외&rdquo;
            옵션을 두는 이유가 여기 있습니다. 보너스는 당첨번호와 성격이 다릅니다.
          </p>
          <p>
            등위별 당첨금은 회차마다 다릅니다. 총 판매금액과 각 등수의 당첨자 수에 따라 나뉘기
            때문입니다. 그래서 같은 1등이라도 회차에 따라 받는 금액이 크게 차이 납니다.
          </p>

          <h2>추첨 일정</h2>
          <p>
            추첨은 <strong>매주 토요일 저녁</strong>에 진행됩니다. 결과는 추첨 직후 공개되며, 이
            사이트의 회차 데이터도 추첨이 끝난 뒤 수집됩니다. 다음 추첨까지 남은 시간은 홈과 로또
            대시보드의 D-day 카드에서 볼 수 있습니다.
          </p>

          <h2>번호 볼의 색</h2>
          <p>
            번호는 열 개 단위로 색이 나뉩니다. 1~10번은 노랑, 11~20번은 파랑, 21~30번은 빨강,
            31~40번은 회색, 41~45번은 초록입니다. 색은 번호대를 한눈에 알아보게 도울 뿐 당첨과는
            아무 관계가 없습니다.
          </p>

          <h2>조합의 수</h2>
          <p>
            45개 번호에서 순서 없이 6개를 고르는 방법은{' '}
            <strong>8,145,060가지</strong>입니다. 이것은 게임 규칙에서 곧바로 계산되는 사실입니다.
            그리고 이 8,145,060개의 조합은 매 회차 <strong>모두 같은 처지</strong>에 있습니다.
          </p>
          <p>
            어떤 조합이 과거에 한 번도 나오지 않았다는 사실은 그 조합의 처지를 바꾸지 않습니다.
            1, 2, 3, 4, 5, 6이라는 조합이 나올 가능성은 여러분이 방금 고른 조합이 나올 가능성과
            정확히 같습니다. 추첨기는 지난 회차를 기억하지 못합니다.
          </p>
          <p>
            과거 회차의 분포가 궁금하다면 <Link href="/lotto/stat">번호 통계</Link>에서 볼 수
            있습니다. 다만 그 통계는 이미 일어난 일의 기록이며, 앞으로 일어날 일에 대해서는 아무
            말도 하지 않습니다.
          </p>
        </section>
      </article>

      <JsonLd
        data={articleLd({
          headline: '로또 기본 규칙',
          description: '로또 6/45의 게임 방식, 등위 판정 기준, 추첨 일정을 설명합니다.',
          siteName: SITE_NAME,
          siteUrl: SITE_URL,
          datePublished: '2026-07-09',
        })}
      />
    </div>
  )
}
