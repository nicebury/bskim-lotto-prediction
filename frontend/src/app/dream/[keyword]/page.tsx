import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

import { Breadcrumb } from '@/components/Breadcrumb'
import { Disclaimer } from '@/components/Disclaimer'
import { DreamStudio } from '@/components/DreamStudio'
import { JsonLd, articleLd } from '@/components/JsonLd'
import { getDreamKeywords } from '@/lib/api'
import { SITE_NAME, SITE_URL } from '@/lib/env'
import { eulReul, eunNeun } from '@/lib/korean'
import { DISCLAIMER } from '@/lib/site'

/**
 * 꿈 키워드별 상세. 롱테일 SEO 확장의 핵심이다("돼지꿈 로또번호" 같은 검색어).
 *
 * ⚠ 키워드별 해몽 풀이 본문은 **지어내지 않는다.** 백엔드 계약(`/api/dream/keywords`)은
 *   슬러그와 표제어만 준다. 없는 데이터를 창작해 페이지를 부풀리면 그것이 곧 저품질
 *   콘텐츠다. 대신 그 키워드로 번호를 만드는 도구와, 꿈해몽이 무엇인지에 대한 공통 설명을
 *   제공한다.
 *
 * ⚠ "돼지꿈이면 당첨"처럼 인과를 확정 표현하지 않는다.
 * ⚠ 슬러그는 한글 그대로다(`/dream/돼지`). 로마자로 바꾸지 않는다 — 계약.
 */
export const revalidate = 604800
export const dynamicParams = true

/**
 * 빌드 시 미리 구울 키워드 수의 상한.
 *
 * 사전 표제어는 4,800개가 넘는다. 전부 정적 생성하면 빌드가 수십 분으로 늘어나는데, 그중
 * 대다수는 검색 유입이 없는 희귀 표제어다. 앞쪽 일부만 굽고 나머지는 첫 요청 때
 * 생성(ISR)한다 — 사용자 경험은 첫 방문자만 조금 느릴 뿐 동일하다.
 * 사이트맵에는 **전부** 싣는다(색인은 빌드와 무관하다).
 */
const PRERENDER_LIMIT = 200

export async function generateStaticParams() {
  // 백엔드가 없으면 빈 배열 → 빌드를 실패시키지 않고 전부 요청 시 생성한다.
  const keywords = await getDreamKeywords()

  if (keywords.length > PRERENDER_LIMIT) {
    // 조용히 자르지 않는다. 무엇이 빌드에서 빠졌는지 로그에 남긴다.
    console.info(
      `[dream] 키워드 ${keywords.length}개 중 ${PRERENDER_LIMIT}개만 사전 생성합니다. ` +
        '나머지는 첫 요청 시 생성됩니다(dynamicParams).',
    )
  }

  return keywords.slice(0, PRERENDER_LIMIT).map((keyword) => ({ keyword: keyword.slug }))
}

type Params = { params: Promise<{ keyword: string }> }

/** 슬러그로 키워드를 찾는다. 목록에 없으면 404 다 — 임의의 슬러그로 페이지를 열지 않는다. */
async function findKeyword(slug: string) {
  const keywords = await getDreamKeywords()
  return keywords.find((keyword) => keyword.slug === slug) ?? null
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  // 라우트 파라미터는 퍼센트 인코딩된 채로 올 수 있다. 계약의 슬러그는 한글 원문이다.
  const { keyword: raw } = await params
  const keyword = await findKeyword(decodeURIComponent(raw))
  if (!keyword) return {}

  const word = keyword.word
  const title = `${word} 꿈 로또 번호 추천 | 재미용 꿈해몽 번호 생성`
  const description = `${word} 꿈을 키워드로 재미용 로또 번호를 생성해보세요. 꿈과 당첨 사이에는 인과관계가 없으며 당첨을 보장하지 않습니다.`
  const url = `/dream/${encodeURIComponent(keyword.slug)}`

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: 'article', url, title, description },
  }
}

export default async function DreamKeywordPage({ params }: Params) {
  const { keyword: raw } = await params
  const keyword = await findKeyword(decodeURIComponent(raw))

  // 백엔드가 죽어 있으면 키워드 목록이 비어 모든 슬러그가 404 가 된다. 데이터 없이 페이지를
  // 만들어 내는 것보다 정직한 실패다.
  if (!keyword) notFound()

  const word = keyword.word

  return (
    <div className="container">
      <Breadcrumb
        items={[
          { name: '홈', href: '/' },
          { name: '꿈해몽 번호 추천', href: '/dream' },
          { name: `${word} 꿈`, href: `/dream/${encodeURIComponent(keyword.slug)}` },
        ]}
      />

      <article>
        <section className="section">
          <h1>{word} 꿈 로또 번호</h1>
          <p className="muted" style={{ marginTop: 'var(--space-2)' }}>
            {eulReul(word)} 소재로 재미용 번호를 만들어 봅니다.
          </p>
        </section>

        <section className="section" aria-labelledby="dream-input">
          <h2 id="dream-input" className="sr-only">
            꿈 내용 입력
          </h2>
          {/* 키워드를 미리 채워 두면 사용자가 바로 생성할 수 있다. 문장은 자유롭게 고칠 수 있다. */}
          <DreamStudio initialText={`${eulReul(word)} 보는 꿈을 꿨습니다`} />
          <Disclaimer spaced>{DISCLAIMER.dream}</Disclaimer>
        </section>

        <section className="section prose" aria-labelledby="about-keyword">
          <h2 id="about-keyword">{word} 꿈에 대하여</h2>
          <p>
            꿈해몽은 꿈에 나타난 소재를 두고 오랫동안 전해 내려온 <strong>민간 해석</strong>입니다.
            {word} 꿈 역시 지역과 시대에 따라 여러 갈래의 풀이가 전해집니다. 어느 풀이가 옳은지
            가릴 방법은 없으며, 이 페이지는 특정 해석을 사실로 주장하지 않습니다.
          </p>
          <p>
            위 입력창에 꿈의 내용을 자유롭게 적으면, 문장에서 꿈해몽 사전과 연결되는 단어를 찾아
            번호를 만듭니다. {eunNeun(word)} 사전의 표제어이므로 그대로 찾아지고, 함께 등장한 다른
            소재가 있다면 그것도 반영됩니다.
          </p>
          <p>
            <strong>꿈을 꾸었다고 해서 당첨될 가능성이 달라지지는 않습니다.</strong> 로또 추첨은
            꿈과 무관하게 무작위로 진행되며, 45개 번호에서 6개를 고르는 모든 조합의 처지는 매 회차
            같습니다. 이 기능은 번호를 고르는 재미를 위한 오락용 콘텐츠입니다.
          </p>
          <p>
            다른 꿈 키워드는 <Link href="/dream">꿈해몽 번호 추천</Link> 페이지에서 볼 수 있고,
            통계를 참고한 번호 생성은 <Link href="/lotto/recommend">번호 추천 시뮬레이터</Link>에
            있습니다.
          </p>
        </section>
      </article>

      <JsonLd
        data={articleLd({
          headline: `${word} 꿈 로또 번호 추천`,
          description: `${word} 꿈을 키워드로 재미용 로또 번호를 생성하는 방법과 꿈해몽 해석에 대한 안내입니다.`,
          siteName: SITE_NAME,
          siteUrl: SITE_URL,
          // 정적 콘텐츠라 발행일이 따로 없다. 페이지 생성 시점을 쓰지 않는다 — 재검증 때마다
          // 날짜가 바뀌면 검색엔진에 잘못된 신선도 신호를 준다.
          datePublished: '2026-07-09',
        })}
      />
    </div>
  )
}
