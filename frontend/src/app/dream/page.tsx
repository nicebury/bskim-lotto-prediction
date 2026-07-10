import Link from 'next/link'
import type { Metadata } from 'next'

import { Breadcrumb } from '@/components/Breadcrumb'
import { Card } from '@/components/Card'
import { Disclaimer } from '@/components/Disclaimer'
import { DreamStudio } from '@/components/DreamStudio'
import { getDreamKeywords } from '@/lib/api'
import { formatNumber } from '@/lib/format'
import { DISCLAIMER } from '@/lib/site'

export const revalidate = 604800

/** 목록에 미리 보여줄 키워드 수. 나머지는 입력창으로 찾는다. */
const KEYWORD_PREVIEW = 60

export const metadata: Metadata = {
  title: '꿈해몽 로또 번호 추천',
  description:
    '꿈에서 본 장면을 입력하면 관련 키워드를 찾아 재미용 로또 번호를 생성합니다. 당첨을 보장하지 않습니다.',
  alternates: { canonical: '/dream' },
  openGraph: {
    type: 'website',
    url: '/dream',
    title: '꿈해몽 로또 번호 추천',
    description: '꿈 키워드를 바탕으로 재미용 로또 번호를 생성해보세요.',
  },
}

export default async function DreamPage() {
  const keywords = await getDreamKeywords()

  return (
    <div className="container">
      <Breadcrumb
        items={[
          { name: '홈', href: '/' },
          { name: '꿈해몽 번호 추천', href: '/dream' },
        ]}
      />

      <section className="section">
        <h1>꿈해몽 로또 번호 추천</h1>
        <p className="muted" style={{ marginTop: 'var(--space-2)' }}>
          꿈에서 본 장면을 문장으로 적으면 꿈해몽 사전과 연결되는 단어를 찾아 재미용 번호를
          만듭니다.
        </p>
      </section>

      <section className="section" aria-labelledby="dream-studio-title">
        <h2 id="dream-studio-title" className="sr-only">
          꿈 입력
        </h2>
        <DreamStudio />
        <Disclaimer spaced>{DISCLAIMER.dream}</Disclaimer>
      </section>

      {keywords.length > 0 && (
        <section className="section" aria-labelledby="keyword-title">
          <div className="section-head">
            <h2 id="keyword-title">꿈 키워드로 보기</h2>
            <span className="section-note">전체 {formatNumber(keywords.length)}개</span>
          </div>
          <Card>
            {/*
              사전 표제어가 4,800개가 넘는다. 전부 칩으로 뿌리면 페이지가 링크 목록이 되고
              사용자는 아무것도 고르지 못한다. 앞쪽 일부만 보여주고, 나머지는 위 입력창으로
              찾게 한다 — 어차피 원하는 꿈을 문장으로 적는 편이 빠르다.
            */}
            <ul className="keyword-chips">
              {keywords.slice(0, KEYWORD_PREVIEW).map((keyword) => (
                <li key={keyword.slug}>
                  <Link className="chip" href={`/dream/${encodeURIComponent(keyword.slug)}`}>
                    {keyword.word}
                  </Link>
                </li>
              ))}
            </ul>
            {keywords.length > KEYWORD_PREVIEW && (
              <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: 'var(--space-4)' }}>
                이 밖에도 {formatNumber(keywords.length - KEYWORD_PREVIEW)}개의 키워드가 있습니다.
                찾는 소재가 없다면 위 입력창에 꿈 내용을 그대로 적어 보세요.
              </p>
            )}
          </Card>
        </section>
      )}

      <section className="section prose" aria-labelledby="how-dream">
        <h2 id="how-dream">번호는 어떻게 만들어지나요?</h2>
        <p>
          입력하신 문장을 형태소 단위로 나누어 명사와 동사를 뽑아냅니다. 그 단어들을 꿈해몽 사전과
          대조하고, 뜻이 비슷한 단어까지 함께 찾습니다. 사전에 등록된 각 단어에는 번호가 연결되어
          있으며, 찾아낸 단어들의 번호를 모아 여섯 개의 조합을 만듭니다.
        </p>
        <p>
          꿈해몽은 오랫동안 전해 내려온 <strong>민간 해석</strong>입니다. 같은 꿈을 두고도 지역과
          시대에 따라 다른 풀이가 있습니다. 어느 풀이가 맞는지 확인할 방법은 없으며, 확인할 필요도
          없습니다. 이 기능은 꿈이라는 소재로 번호를 고르는 재미를 주기 위한 것입니다.
        </p>
        <p>
          <strong>꿈과 당첨 사이에는 아무런 인과관계가 없습니다.</strong> 돼지꿈을 꾸었다고 해서
          당첨될 가능성이 높아지지 않고, 흉몽을 꾸었다고 해서 낮아지지도 않습니다. 로또 추첨은 꿈과
          무관하게 무작위로 진행됩니다.
        </p>
        <p>
          통계를 참고한 번호 생성은 <Link href="/lotto/recommend">번호 추천 시뮬레이터</Link>에서
          이용할 수 있습니다.
        </p>
      </section>
    </div>
  )
}
