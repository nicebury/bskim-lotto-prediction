import Link from 'next/link'
import type { Metadata } from 'next'

import { Breadcrumb } from '@/components/Breadcrumb'
import { Faq } from '@/components/Faq'
import { GuideHeroImage } from '@/components/GuideHeroImage'
import { GuideNav } from '@/components/GuideNav'
import { GuideRail } from '@/components/GuideRail'
import { JsonLd, articleLd } from '@/components/JsonLd'
import { InfoIcon, ScaleIcon } from '@/components/icons'
import { SITE_NAME, SITE_URL } from '@/lib/env'

/**
 * 자동과 수동의 차이 (`/guide/auto-vs-manual`).
 *
 * ── 2026-09-17 구조 개편 ────────────────────────────────────────────
 * 이 글이 다루는 것은 **견주기**인데 정작 화면에서는 견줄 수 없었다. 세 방식이
 * `ul` 한 줄씩으로 늘어서 있어 무엇이 어떻게 다른지 눈으로 비교되지 않았다.
 * 세 방식을 나란한 카드로 세우고, 다른 점과 같은 점을 표로 갈랐다.
 *
 * ⚠ 이 페이지에 **처음으로 헤더 그림이 생겼다**(2026-09-17). 다섯 상세 중 여기만
 *   그림이 없어 허브에서도 이 카드만 비어 보였다. 전용 일러스트가 들어오면서
 *   `auto-vs-manual-hero.png` 로 규약에 맞춰 놓았다.
 *
 * ── ⚠ 이 글에서 가장 조심할 것 ──────────────────────────────────────
 * "자동이 잘 맞는다" 를 **부정하는 근거를 정확히** 써야 한다. 1등 중 자동이 많다는
 * 통계는 사실이고, 그것을 부정하면 거짓이 된다. 사실은 인정하되 **원인이 구매 비율**
 * 이라는 점을 말한다. 여기서 '확률'·'가능성' 같은 낱말을 쓰지 않는다
 * ([[forbidden-expressions]]) — 구조를 설명하면 그 낱말이 필요 없다.
 */

export const metadata: Metadata = {
  title: '자동과 수동의 차이 — 당첨 판정은 같습니다',
  description:
    '로또 자동·수동·반자동은 번호를 고르는 방법만 다를 뿐 당첨 판정 기준이 같습니다. 1등에 자동이 많은 이유와, 그래도 남는 실제 차이 하나를 정리했습니다.',
  alternates: { canonical: '/guide/auto-vs-manual' },
  openGraph: {
    type: 'article',
    url: '/guide/auto-vs-manual',
    title: '자동과 수동의 차이 — 당첨 판정은 같습니다',
    description:
      '자동·수동·반자동의 차이와, 1등 당첨자에 자동이 많은 진짜 이유.',
  },
}

const FAQ_ITEMS = [
  {
    question: '자동과 수동 중 어느 쪽이 유리한가요?',
    answer:
      '당첨 판정에는 아무 차이가 없습니다. 추첨기는 그 번호를 사람이 골랐는지 기계가 골랐는지 알지 못하니까요. 1등이 자동에서 많이 나온다는 이야기가 있지만, 그건 애초에 자동으로 사는 사람이 훨씬 많기 때문입니다.',
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

const TOC = [
  { id: 'three', label: '세 가지 방식' },
  { id: 'same', label: '같은 점' },
  { id: 'myth', label: '자동이 잘 맞는다?' },
  { id: 'real', label: '진짜 차이 하나' },
] as const

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
        <section className="section gd-head">
          <h1>자동과 수동의 차이</h1>
          <p className="gd-lede">
            번호를 고르는 방법이 다를 뿐, 당첨 판정은 완전히 같습니다. 그런데 딱 하나,
            결과와 무관하지 않은 차이가 남습니다.
          </p>
          <GuideHeroImage
            slug="auto-vs-manual"
            alt="연필로 칠한 용지와 발권 단말기에서 나오는 용지를 나란히 둔 일러스트"
          />
          <nav aria-label="이 글에서 다루는 것">
            <ul className="gd-toc">
              {TOC.map((item) => (
                <li key={item.id}>
                  <a href={`#${item.id}`}>{item.label}</a>
                </li>
              ))}
            </ul>
          </nav>
        </section>

        {/* 넓은 화면의 오른쪽 목차 레일. 머리의 칩과 같은 TOC 를 쓴다(→ GuideRail 주석). */}
        <GuideRail items={TOC} />

        <section className="section gd-sec gd-reveal" id="three">
          <h2>세 가지 방식</h2>
          <p>판매점에서 고를 수 있는 방법은 셋입니다.</p>
          <ul className="gd-versus">
            <li data-accent="reco">
              <h3>자동</h3>
              <p>단말기가 여섯 개를 무작위로 골라 줍니다. 용지에 표시할 것이 없습니다.</p>
            </li>
            <li data-accent="lotto">
              <h3>수동</h3>
              <p>용지에 여섯 개를 직접 칠합니다. 원하는 번호를 그대로 넣을 수 있습니다.</p>
            </li>
            <li data-accent="stats">
              <h3>반자동</h3>
              <p>일부만 직접 고르고 나머지는 단말기가 채웁니다. 둘을 섞은 방식입니다.</p>
            </li>
          </ul>
        </section>

        <section className="section gd-sec gd-reveal" id="same">
          <h2>추첨기는 어느 쪽인지 모릅니다</h2>
          <p>
            추첨기 앞에 놓이는 것은 <strong>여섯 개의 숫자</strong>뿐입니다. 그 숫자가
            단말기에서 나왔는지 한참 고민해 고른 것인지는 어디에도 기록되지 않습니다.
            8,145,060가지 중 하나라는 점에서 세 방식은 같은 자리에 섭니다.
          </p>
          <div className="gd-tablewrap" tabIndex={0} role="region" aria-label="세 방식 비교">
            <table className="gd-table">
              <caption className="sr-only">자동·수동·반자동 비교</caption>
              <thead>
                <tr>
                  <th scope="col">항목</th>
                  <th scope="col">자동</th>
                  <th scope="col">수동</th>
                  <th scope="col">반자동</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">번호를 고르는 주체</th>
                  <td>단말기</td>
                  <td>구매자</td>
                  <td>둘이 나눠서</td>
                </tr>
                <tr>
                  <th scope="row">한 게임 가격</th>
                  <td>1,000원</td>
                  <td>1,000원</td>
                  <td>1,000원</td>
                </tr>
                <tr>
                  <th scope="row">당첨 판정 기준</th>
                  <td>같음</td>
                  <td>같음</td>
                  <td>같음</td>
                </tr>
                <tr>
                  <th scope="row">당첨금 지급 절차</th>
                  <td>같음</td>
                  <td>같음</td>
                  <td>같음</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="section gd-sec gd-reveal" id="myth">
          <h2>&ldquo;자동이 잘 맞는다&rdquo;는 말은 어디서 왔나</h2>
          <p>
            1등 당첨자 중 자동 구매자가 많다는 이야기는 <strong>사실입니다</strong>. 다만
            그 통계가 말해 주는 것은 자동의 성능이 아니라 사람들의 구매 습관입니다.
          </p>
          <div className="gd-callout">
            <p className="gd-callout-head">
              <ScaleIcon className="gd-callout-icon" />
              열 명 중 여덟 명이 자동으로 산다면
            </p>
            <p>
              당첨자 중에서도 대략 여덟 명은 자동일 수밖에 없습니다. 많이 팔린 방식에서
              당첨자가 많이 나오는 것은 <strong>산수의 결과</strong>이지 그 방식이 나아서가
              아닙니다. &ldquo;수동이 정성이 들어가서 낫다&rdquo;는 말도 같은 이유로
              성립하지 않습니다.
            </p>
          </div>
        </section>

        <section className="section gd-sec gd-reveal" id="real">
          <h2>그래도 남는 차이 하나</h2>
          <p>
            판정은 같지만, <strong>당첨금을 몇 명이 나누느냐</strong>는 달라질 수 있습니다.
            사람이 고르는 번호는 고르게 흩어지지 않기 때문입니다.
          </p>
          <p>
            생일에 쓰이는 <strong>1~31</strong>에 몰리고, 용지에서 줄을 맞춘 모양이나
            가지런한 연속번호도 자주 선택됩니다. 그런 조합이 추첨되면 같은 번호를 든 사람이
            한꺼번에 나와 당첨금이 잘게 쪼개집니다.
          </p>
          <div className="gd-callout">
            <p className="gd-callout-head">
              <InfoIcon className="gd-callout-icon" />
              이것은 판정이 아니라 분배 이야기입니다
            </p>
            <p>
              번호를 어떻게 고르든 맞을지 안 맞을지는 달라지지 않습니다. 달라지는 것은
              맞았을 때 <strong>몇 명과 나누는가</strong>입니다. 32 이상 번호를 섞으면
              사람들이 덜 고르는 구간이라 나눌 사람이 줄어들 수는 있습니다.
            </p>
          </div>
          <p>
            결국 남는 기준은 취향입니다. 고르는 과정이 즐거우면 수동, 빠른 쪽이 좋으면
            자동입니다. 기념일을 넣고 싶다면 그렇게 하세요. 어느 쪽도 손해가 아닙니다.
          </p>
          <p>
            번호를 만들어 보고 싶다면{' '}
            <Link href="/lotto/recommend">번호 추천 시뮬레이터</Link>가 있습니다. 그 도구도
            당첨 결과를 바꾸지 않습니다 — 고르는 과정을 대신 해 볼 뿐입니다. 사람들이 어떤
            번호를 자주 고르는지는 <Link href="/lotto/stat">번호 통계</Link>에서 볼 수
            있습니다.
          </p>
        </section>

        <Faq items={FAQ_ITEMS} />
      </article>

      <GuideNav current="auto-vs-manual" />

      <JsonLd
        data={articleLd({
          headline: '자동과 수동의 차이 — 당첨 판정은 같습니다',
          description:
            '로또 자동·수동·반자동의 차이와 당첨 판정이 같은 이유, 1등에 자동이 많은 배경을 설명합니다.',
          siteName: SITE_NAME,
          siteUrl: SITE_URL,
          datePublished: '2026-07-09',
          dateModified: '2026-09-17',
        })}
      />
    </div>
  )
}
