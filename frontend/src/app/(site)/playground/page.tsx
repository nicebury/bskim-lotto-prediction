import type { Metadata } from 'next'

import { AdSlot } from '@/components/AdSlot'
import { Breadcrumb } from '@/components/Breadcrumb'
import { Faq } from '@/components/Faq'
import { GameGrid } from '@/components/playground/GameGrid'
import { GAMES } from '@/games/core/catalog'
import { SITE_NAME } from '@/lib/env'
import { DISCLAIMER } from '@/lib/site'

/**
 * 번호놀이터 목록.
 *
 * → docs/wiki/20-design/playground.md
 *
 * ⚠ **서버 컴포넌트다.** `catalog.ts` 의 `GameMeta` 여섯 개만 읽는다 — 게임 코드는 딸려오지
 *   않는다. 그것이 `catalog`(데이터)와 `loaders`(코드)를 가른 이유다.
 *   검증: `next build` 후 이 페이지의 First Load JS 가 기존 페이지 대비 **+5KB 이내**.
 */

export const metadata: Metadata = {
  title: `번호놀이터 | ${SITE_NAME}`,
  description:
    '미니게임 여섯 가지로 로또 번호 6개를 모아 보세요. 모은 번호는 바로 분석·저장·공유할 수 있습니다.',
  alternates: { canonical: '/playground' },
}

export default function PlaygroundPage() {
  return (
    <div className="container">
      <Breadcrumb
        items={[
          { name: '홈', href: '/' },
          { name: '번호놀이터', href: '/playground' },
        ]}
      />

      {/*
        ⚠ 2026-09-18 재설계(사용자 요청: "흥미를 끌어서 게임을 하게끔"). 제목 한 줄 + 회색
          설명이던 머리를 히어로 카드로 세우고, 고르기 전에 알면 좋은 사실을 칩으로 짧게 낸다.
        ⚠ 칩에 **걸리는 시간을 적지 않는다** — 카드에서 "약 60초" 를 뺀 것과 같은 이유다.
      */}
      <section className="pg-hero" aria-labelledby="pg-title">
        <p className="pg-eyebrow">미니게임 6가지</p>
        <h1 id="pg-title">놀다 보면, 번호 여섯 개</h1>
        <p className="pg-lede">
          쏘고 뽑고 굴리다 보면 번호가 하나씩 쌓입니다. 여섯 개를 모으면 그대로 한 조합이 되고,
          바로 분석·저장·공유할 수 있습니다.
        </p>
        <ul className="pg-hero-chips">
          <li>설치 없이 바로</li>
          <li>모으면 곧장 분석</li>
          <li>같은 번호는 두 번 안 나와요</li>
        </ul>
      </section>

      <section className="section" aria-labelledby="pg-list-title">
        <div className="section-head">
          <h2 id="pg-list-title">무엇부터 해볼까요?</h2>
        </div>
        <GameGrid />
      </section>

      {/*
        ⚠ SSR 텍스트다. 카드만 있는 페이지는 저가치로 읽힌다(→ 30-seo/adsense-readiness.md).
      */}
      <section className="section" aria-labelledby="pg-how-title">
        <div className="section-head">
          <h2 id="pg-how-title">이렇게 즐기세요</h2>
        </div>
        <ol className="pg-steps">
          <li>
            <h3>게임을 고릅니다</h3>
            <p>
              여섯 가지 가운데 마음에 드는 것을 고릅니다. 조작은 모두 다르지만, 어느 것이든
              번호 6개를 모으면 끝납니다.
            </p>
          </li>
          <li>
            <h3>번호를 모읍니다</h3>
            <p>
              게임을 진행하면 번호가 하나씩 쌓입니다. 같은 번호가 두 번 나오지 않도록
              되어 있어, 여섯 개가 모이면 그대로 한 조합이 됩니다.
            </p>
          </li>
          <li>
            <h3>모은 번호를 살펴봅니다</h3>
            <p>
              여섯 개를 다 모으면 분석·복사·이미지 저장·공유를 바로 할 수 있습니다. 분석을
              누르면 그 번호가 역대 당첨번호와 어땠는지 견주어 볼 수 있습니다.
            </p>
          </li>
        </ol>
      </section>

      <AdSlot slot="playground-list" />

      <Faq
        headingId="pg-faq"
        intro="번호놀이터에 대해 자주 받는 질문입니다."
        items={[
          {
            question: '게임을 잘해야 좋은 번호가 나오나요?',
            answer:
              '아닙니다. 게임 실력은 번호를 모으는 데 걸리는 시간에만 영향을 줍니다. 어떤 번호가 나오는지는 게임마다 정해진 방식으로 결정되고, 추첨은 그것과 상관없이 매 회차 무작위로 진행됩니다. 편한 마음으로 즐겨 주세요.',
          },
          {
            question: '중간에 나갔다 오면 모은 번호가 사라지나요?',
            answer:
              '같은 탭에서 돌아오면 그대로 남아 있습니다. 브라우저 탭을 닫으면 사라지고, 모으던 중이었다면 30분이 지난 기록도 지워집니다. 여섯 개를 다 모은 기록은 탭이 살아 있는 동안 계속 유지됩니다.',
          },
          {
            question: '같은 번호가 두 번 나올 수도 있나요?',
            answer:
              '나오지 않습니다. 이미 모은 번호는 그 판에서 다시 나오지 않도록 되어 있습니다. 컬링처럼 이미 모은 칸에 멈출 수 있는 게임에서는 그 투구를 없던 것으로 하고 다시 던집니다.',
          },
        ]}
      />

      <p className="disclaimer">
        <span className="disclaimer-icon" aria-hidden="true">
          ⓘ
        </span>
        <span>{DISCLAIMER.playground}</span>
      </p>

      {/* 게임 수를 본문에서도 밝힌다 — 목록이 비었을 때 이유를 알 수 있어야 한다. */}
      <p className="sr-only">현재 이용할 수 있는 게임은 {GAMES.length}가지입니다.</p>
    </div>
  )
}
