import Link from 'next/link'
import type { Metadata } from 'next'

import { Breadcrumb } from '@/components/Breadcrumb'
import { Card } from '@/components/Card'
import { CONTACT_EMAIL, SITE_NAME } from '@/lib/env'

export const metadata: Metadata = {
  title: '문의',
  description: `${SITE_NAME}에 오류 제보, 데이터 정정 요청, 제휴 문의를 보내는 방법을 안내합니다.`,
  alternates: { canonical: '/contact' },
}

/**
 * 문의 페이지. 애드센스 필수 정책 페이지 4종 중 하나다 — 심사자는 연락 수단의 존재를 본다.
 *
 * ⚠ 문의 **폼**을 만들지 않는다. 폼은 서버에 개인정보(이메일·내용)를 받는다는 뜻이고,
 *   그 순간 개인정보처리방침에 수집 항목과 보유 기간을 적어야 한다. 지금 이 서비스는
 *   이용자 식별 정보를 일절 저장하지 않는다는 것이 방침의 핵심이므로, 메일 링크만 둔다.
 */
export default function ContactPage() {
  return (
    <div className="container">
      <Breadcrumb
        items={[
          { name: '홈', href: '/' },
          { name: '문의', href: '/contact' },
        ]}
      />

      <section className="section">
        <h1>문의</h1>
        <p className="muted" style={{ marginTop: 'var(--space-2)' }}>
          오류 제보, 데이터 정정 요청, 그 밖의 문의를 받습니다.
        </p>
      </section>

      <section className="section" aria-labelledby="contact-method">
        <h2 id="contact-method" className="sr-only">
          연락 방법
        </h2>
        <Card>
          {CONTACT_EMAIL ? (
            <>
              <p>아래 주소로 이메일을 보내 주시면 확인 후 답변드립니다.</p>
              <p style={{ marginTop: 'var(--space-3)' }}>
                <a className="btn btn-primary" href={`mailto:${CONTACT_EMAIL}`}>
                  {CONTACT_EMAIL}
                </a>
              </p>
            </>
          ) : (
            // 값이 없으면 없는 대로 정직하게 알린다. 가짜 주소를 만들어 두지 않는다.
            <p className="muted">
              현재 문의 창구를 준비하고 있습니다. 연락처가 마련되는 대로 이 페이지에 안내하겠습니다.
            </p>
          )}
        </Card>
      </section>

      <section className="section prose" aria-labelledby="contact-guide">
        <h2 id="contact-guide">문의하실 때 참고해 주세요</h2>

        <h3>당첨결과가 실제와 다릅니다</h3>
        <p>
          본 사이트의 데이터는 외부 출처에서 수집합니다. 수집 오류나 갱신 지연이 있을 수 있습니다.
          어느 회차의 어떤 값이 잘못되었는지 알려 주시면 확인하겠습니다. 다만 실제 당첨 여부와
          당첨금은 반드시 공식 발표를 통해 확인하시기 바랍니다.
        </p>

        <h3>당첨 번호를 알려 주실 수 있나요</h3>
        <p>
          불가능합니다. 로또 번호는 무작위로 추첨되며 어떤 방법으로도 미리 알 수 없습니다. 본
          사이트의 번호 추천은 재미용 시뮬레이션이며 당첨을 보장하지 않습니다. 자세한 내용은{' '}
          <Link href="/disclaimer">면책 고지</Link>를 참고하세요.
        </p>

        <h3>복권을 구매하고 싶습니다</h3>
        <p>
          본 사이트는 복권을 판매하거나 구매를 대행하지 않습니다. 국내에서 복권 판매는 기획재정부
          복권위원회가 지정한 공식 사업자만 할 수 있습니다.
        </p>

        <h3>뉴스 기사 삭제를 요청합니다</h3>
        <p>
          본 사이트는 기사 제목과 요약, 원문 링크만 표시하며 본문을 복제하지 않습니다. 게재된
          정보에 문제가 있다면 해당 기사의 링크와 함께 알려 주시기 바랍니다.
        </p>
      </section>
    </div>
  )
}
