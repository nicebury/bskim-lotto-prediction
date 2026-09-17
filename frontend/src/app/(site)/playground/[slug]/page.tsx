import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Breadcrumb } from '@/components/Breadcrumb'
import { GameStage } from '@/components/playground/GameStage'
import { GAMES, findGame } from '@/games/core/catalog'
import { SITE_NAME } from '@/lib/env'

/**
 * 게임 플레이 화면.
 *
 * → docs/wiki/20-design/playground.md
 *
 * ⚠ **서버 컴포넌트다.** 캔버스는 `GameStage`(클라이언트) 안에서 지연 로드된다 — 서버
 *   컴포넌트에서는 `ssr: false` 를 쓸 수 없기 때문이다.
 * ⚠ 소개글(`intro`)과 조작 방법(`howTo`)은 **여기서 SSR 로 그린다.** JS 를 꺼도 보이는
 *   본문이고, 이것이 이 페이지의 고유 콘텐츠다.
 */

export function generateStaticParams() {
  return GAMES.map((g) => ({ slug: g.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const meta = findGame(slug)
  if (meta === undefined) return { title: `번호놀이터 | ${SITE_NAME}` }

  return {
    title: `${meta.title} | 번호놀이터 | ${SITE_NAME}`,
    description: meta.tagline,
    alternates: { canonical: `/playground/${meta.slug}` },
  }
}

export default async function GamePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const meta = findGame(slug)
  /** ⚠ **사이트맵에 없는 URL 이 200 을 내면 안 된다.** */
  if (meta === undefined) notFound()

  /** 다른 게임 셋 — 내부 링크. 자기 자신은 뺀다. */
  const others = GAMES.filter((g) => g.slug !== meta.slug).slice(0, 3)

  return (
    <div className="container">
      <Breadcrumb
        items={[
          { name: '홈', href: '/' },
          { name: '번호놀이터', href: '/playground' },
          { name: meta.title, href: `/playground/${meta.slug}` },
        ]}
      />

      {/*
        ⚠ 게임 페이지의 머리는 **가능한 한 낮게** 둔다. 이 위에 쌓이는 픽셀만큼 게임이
          화면 밖으로 밀려나고, 모바일에서는 그것이 곧 "스크롤해야 플레이할 수 있다" 가 된다.
          제목 크기와 여백을 `.pg-head` 로 따로 잡는 이유다(→ playground.css).
      */}
      <section className="pg-head">
        <h1 className="pg-title">{meta.title}</h1>
        {/* ★ JS 꺼도 보이는 본문. */}
        <p className="muted pg-intro">{meta.intro}</p>
      </section>

      <GameStage meta={meta} />

      <section className="section" aria-labelledby="pg-howto-title">
        <div className="section-head">
          <h2 id="pg-howto-title">조작 방법</h2>
        </div>
        <ol className="pg-howto">
          {meta.howTo.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className="muted pg-howto-keys">{meta.keyGuide}</p>
      </section>

      <section className="section" aria-labelledby="pg-others-title">
        <div className="section-head">
          <h2 id="pg-others-title">다른 게임</h2>
        </div>
        <ul className="pg-others">
          {others.map((g) => (
            <li key={g.slug}>
              <Link href={`/playground/${g.slug}`}>
                <strong>{g.title}</strong>
                <span>{g.tagline}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/*
        ⚠ 게임을 할 수 없는 사용자에게 **같은 결과를 주는 다른 길**을 안내한다.
          "게임 건너뛰고 번호 받기" 버튼은 만들지 않는다 — 게임 자체를 무의미하게 만든다.
          사이트 안의 다른 길을 안내하는 것이 정직한 답이다(→ playground.md 접근성 절).
      */}
      <p className="pg-alt">
        게임 대신 통계로 번호를 받고 싶다면 <Link href="/lotto/recommend">번호추천</Link>을
        이용하실 수 있습니다.
      </p>
    </div>
  )
}
