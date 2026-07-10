import Link from 'next/link'
import type { Metadata } from 'next'

import { Breadcrumb } from '@/components/Breadcrumb'
import { Disclaimer } from '@/components/Disclaimer'
import { JsonLd, articleLd } from '@/components/JsonLd'
import { SITE_NAME, SITE_URL } from '@/lib/env'

export const metadata: Metadata = {
  title: '로또 당첨금 수령 방법',
  description:
    '등수별 로또 당첨금 수령 장소와 필요 서류, 지급 기한, 세금 원천징수에 대해 안내합니다.',
  alternates: { canonical: '/guide/prize-claim' },
  openGraph: {
    type: 'article',
    url: '/guide/prize-claim',
    title: '로또 당첨금 수령 방법',
    description: '등수별 수령 장소와 필요 서류, 지급 기한을 안내합니다.',
  },
}

export default function PrizeClaimPage() {
  return (
    <div className="container">
      <Breadcrumb
        items={[
          { name: '홈', href: '/' },
          { name: '가이드', href: '/guide' },
          { name: '당첨금 수령 방법', href: '/guide/prize-claim' },
        ]}
      />

      <article>
        <section className="section">
          <h1>로또 당첨금 수령 방법</h1>
          <p className="muted" style={{ marginTop: 'var(--space-2)' }}>
            당첨금 액수에 따라 수령 장소와 필요한 서류가 달라집니다.
          </p>
        </section>

        <section className="section prose">
          <h2>수령 장소는 금액에 따라 다르다</h2>
          <p>
            소액 당첨금은 복권을 구매한 판매점에서 바로 받을 수 있습니다. 금액이 커지면 지정된
            금융기관을 방문해야 하며, 1등처럼 고액인 경우에는 본점에서만 지급합니다. 정확한 기준
            금액과 지급 창구는 시기에 따라 달라질 수 있으므로 <strong>수령 전에 공식 안내를 반드시
            확인</strong>하시기 바랍니다.
          </p>

          <h2>필요한 서류</h2>
          <ul>
            <li>당첨된 복권 용지 원본 — 사본이나 사진으로는 지급되지 않습니다</li>
            <li>본인 확인이 가능한 신분증</li>
            <li>고액 당첨의 경우 본인 명의 계좌</li>
          </ul>
          <p>
            용지가 훼손되어 번호나 바코드를 읽을 수 없으면 지급이 거절될 수 있습니다. 당첨을
            확인했다면 용지를 접거나 물에 닿게 하지 말고 그대로 보관하세요.
          </p>

          <h2>지급 기한이 있다</h2>
          <p>
            당첨금에는 청구 기한이 있습니다. 기한이 지나면 당첨금을 받을 수 없으며, 미지급 당첨금은
            복권기금으로 귀속됩니다. 추첨일로부터 계산되므로 당첨을 확인했다면 미루지 말고 수령
            절차를 밟는 편이 좋습니다. 정확한 기한은 공식 안내에서 확인하세요.
          </p>

          <h2>세금이 원천징수된다</h2>
          <p>
            일정 금액을 넘는 당첨금에는 기타소득세와 지방소득세가 부과되며, 지급 시점에
            원천징수됩니다. 실제로 손에 쥐는 금액은 표시된 당첨금보다 적습니다. 세율은 당첨금
            구간에 따라 달라지고 세법 개정에 따라 바뀔 수 있으므로, 이 페이지에서는 구체적인
            숫자를 적지 않습니다. 수령 시 안내받는 내역서를 확인하시기 바랍니다.
          </p>

          <h2>당첨 사실을 함부로 알리지 않는다</h2>
          <p>
            고액 당첨 사실이 알려지면 원치 않는 연락과 요구에 시달리는 경우가 있습니다. 수령
            절차가 끝날 때까지 알리는 범위를 최소한으로 두는 편이 안전합니다. 당첨을 대신
            받아주겠다거나 수수료를 요구하는 연락은 사기일 가능성이 높습니다. 당첨금 수령에
            중개인은 필요하지 않습니다.
          </p>
        </section>

        <Disclaimer>
          이 페이지는 일반적인 절차를 안내하는 참고 자료입니다. 수령 장소, 지급 기한, 세율 등
          구체적인 사항은 변경될 수 있으므로 반드시 공식 발표를 확인하시기 바랍니다. 행운상자는
          복권을 판매하거나 당첨금 수령을 대행하지 않습니다.
        </Disclaimer>

        <section className="section prose">
          <p className="muted">
            당첨 여부를 먼저 확인하려면{' '}
            <Link href="/guide/how-to-check">당첨번호 확인 방법</Link>을 참고하세요.
          </p>
        </section>
      </article>

      <JsonLd
        data={articleLd({
          headline: '로또 당첨금 수령 방법',
          description: '등수별 당첨금 수령 절차와 필요 서류, 지급 기한을 안내합니다.',
          siteName: SITE_NAME,
          siteUrl: SITE_URL,
          datePublished: '2026-07-09',
        })}
      />
    </div>
  )
}
