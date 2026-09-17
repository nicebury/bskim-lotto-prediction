import type { Metadata } from 'next'
import Link from 'next/link'

import { Breadcrumb } from '@/components/Breadcrumb'
import { InfoIcon, ScaleIcon } from '@/components/icons'
import { GUIDES } from '@/lib/site'

/**
 * 가이드 허브 (`/guide`).
 *
 * ── 이 화면이 지금 모양이 된 경위 ──────────────────────────────────
 * 종전 허브는 파스텔 상자 5개가 같은 크기로 나란히 있고 그 아래 줄글 세 문단이
 * 붙은 형태였다. 정보는 맞지만 **무엇부터 봐야 하는지가 화면에 없었고**, 상세에만
 * 쓰이던 일러스트가 허브에는 한 장도 나오지 않았다("너무 밋밋하다" — 사용자).
 * 2026-09-08 에 `/guide2` 로 시안을 만들어 나란히 비교했고, 2026-09-17 에 채택되어
 * 이 파일이 허브가 됐다. 시안 라우트는 함께 지웠다.
 *
 * ── 구성 ───────────────────────────────────────────────────────────
 * 1. 히어로 — 좌 텍스트 / 우 일러스트
 * 2. 벤토 카드 5장 — 일러스트 + 제목 + 요약 + 상세의 실제 목차 칩
 * 3. 숫자 밴드 — 1,000원 · 토요일 · 19세
 * 4. 안내 둘 — 오락이라는 점, 판매 대행을 하지 않는다는 점
 *
 * ── ⚠ 지키는 제약 ──────────────────────────────────────────────────
 * - **URL·제목·요약 문구는 종전 그대로다.** 색인과 근육기억을 깨지 않는다.
 * - 새 hex·새 px 을 만들지 않는다. 전부 `tokens.css` 의 변수다.
 * - 강조색은 `--color-primary` **하나**. 카드 틴트는 `--svc-*-bg` 규약 그대로다.
 * - 서버 컴포넌트다. **JS 를 꺼도 글과 그림이 전부 나온다**(frontend 완료 기준).
 * - 카드 데이터는 `lib/site.ts` 의 `GUIDES` 하나만 본다. 홈·푸터·사이트맵과
 *   같은 출처라 가이드를 더해도 한 곳만 고치면 된다.
 */

export const metadata: Metadata = {
  title: '복권 이용 가이드',
  description:
    '로또 당첨번호 확인 방법, 당첨금 수령 절차, 기본 규칙, 자동과 수동의 차이, 건전한 복권 이용 안내를 정리했습니다.',
  alternates: { canonical: '/guide' },
  openGraph: {
    type: 'website',
    url: '/guide',
    title: '복권 이용 가이드',
    description: '로또를 처음 접하는 분을 위한 기본 안내를 모았습니다.',
  },
}

/**
 * 첫 화면 아래 숫자 밴드.
 *
 * 기존의 "로또 6/45는 1부터 45까지의 번호 중 6개를 고르는 게임입니다. 게임 한 회당
 * 1,000원이며, 매주 토요일 저녁에 추첨합니다" 한 문단을 **세 개의 숫자**로 쪼갰다.
 * 처음 온 사람이 알아야 할 것은 이 셋이고, 문단 속에 섞여 있으면 눈에 걸리지 않는다.
 *
 * ⚠ 지어낸 수치가 아니다. 셋 다 공식 규칙이다(1게임 1,000원 / 토요일 추첨 / 19세 이상).
 */
/**
 * 숫자 밴드.
 *
 * ⚠ `label` 이 항목명, `value` 가 값이다 — 종전에는 반대로 들어가 있었다
 *   (`dt: '1,000원'` / `dd: '게임 한 회당 가격'`). `dl` 에서 `dt` 는 term 이므로
 *   의미가 뒤집혀 있었고, 화면에서도 큰 숫자가 먼저 나오고 그게 무엇인지는
 *   나중에 나와 **읽고 나서야 무슨 숫자인지 알 수 있었다.**
 * ⚠ 단위를 떼어 둔다(`1,000` + `원`). 붙여 두면 단위까지 같은 크기로 커져
 *   숫자가 눈에 덜 들어온다. 인포그래픽에서 눈이 잡는 것은 수 자체다.
 * ⚠ 항목명을 다듬었다('이상만 구매 가능' → '구매 가능 연령'). 값과 짝이 되는
 *   이름이어야 "구매 가능 연령 — 19세 이상" 으로 읽힌다.
 */
const FACTS = [
  { label: '게임 한 회당', value: '1,000', unit: '원' },
  { label: '매주 저녁 추첨', value: '토요일', unit: '' },
  { label: '구매 가능 연령', value: '19', unit: '세 이상' },
] as const

export default function GuideHubPage() {
  return (
    <div className="container">
      <Breadcrumb
        items={[
          { name: '홈', href: '/' },
          { name: '가이드', href: '/guide' },
        ]}
      />

      {/* ── 1. 히어로 — 좌 텍스트 / 우 일러스트 ─────────────────────
          가운데 정렬을 쓰지 않는다. 읽는 순서(제목 → 설명 → 버튼)가 왼쪽 한 줄로
          내려가는 편이 훑기 쉽고, 오른쪽에 그림 자리가 생겨 첫 화면이 비지 않는다. */}
      <section className="gh-hero">
        <div className="gh-hero-copy">
          <h1 className="gh-rise" style={{ '--gh-d': '0ms' } as React.CSSProperties}>
            복권, <em>알고 나면</em>
            <br />더 즐겁습니다
          </h1>
          <p className="gh-rise" style={{ '--gh-d': '80ms' } as React.CSSProperties}>
            당첨 확인부터 수령 절차까지, 처음 보는 분도 차근차근 따라올 수 있게
            정리했습니다.
          </p>
          <div className="gh-rise" style={{ '--gh-d': '160ms' } as React.CSSProperties}>
            <Link className="btn btn-primary" href="/guide/how-to-check">
              당첨번호 확인 방법
            </Link>
          </div>
        </div>

        {/*
          히어로 일러스트.
          ⚠ `alt=""` 다. 옆의 제목과 설명이 이미 같은 말을 하고 있어 읽어 주면 같은
            뜻을 두 번 듣는다. 장식으로 다루는 편이 정확하다.
          ⚠ `width`/`height` 를 적어 로드 전에 자리를 잡는다(CLS).
          ⚠ `fetchPriority="high"` — 첫 화면의 가장 큰 그림이라 LCP 후보다.
        */}
        <div
          className="gh-hero-art gh-rise"
          style={{ '--gh-d': '120ms' } as React.CSSProperties}
        >
          <picture>
            <source srcSet="/guide/lotto-facts-hero.webp" type="image/webp" />
            <img
              src="/guide/lotto-facts-hero.png"
              alt=""
              width={1200}
              height={675}
              fetchPriority="high"
              decoding="async"
            />
          </picture>
        </div>
      </section>

      {/* ── 2. 벤토 그리드 — 5칸, 빈 칸 없음 ───────────────────────
          칸 수를 내용 수에 맞춘다. 데스크톱 4열 기준:
            1행: [당첨확인 2칸 × 2줄] [수령방법 2칸]
            2행: [당첨확인 계속]      [재미있는사실 1칸] [자동·수동 1칸]
            3행: [건전한이용 4칸]
          가로로 긴 그림 셋은 넓은 칸에, 정사각 스팟은 좁은 칸에, 그림 없는 하나는
          그림이 필요 없는 좁은 칸에 들어간다. */}
      <section className="section" aria-labelledby="gh-list">
        <h2 id="gh-list" className="sr-only">
          가이드 목록
        </h2>

        <div className="gh-bento">
          {GUIDES.map((card, index) => (
            <Link
              key={card.slug}
              href={`/guide/${card.slug}`}
              className="gh-cell"
              data-accent={card.accent}
              data-slot={card.slug}
            >
              {/*
                그림 뒤에 카드 색으로 은은한 원을 깐다.
                ⚠ 장식이 아니라 **다크 모드 대비 장치**다. 일러스트가 배경 투명 PNG 라
                  어두운 판 위에 놓이면 연한 부분이 배경에 녹는다. 같은 계열의 옅은
                  원이 받쳐 주면 양쪽 테마에서 형태가 살아난다.
              */}
              <div className="gh-cell-art" aria-hidden="true">
                <picture>
                  <source srcSet={`/guide/${card.art.name}.webp`} type="image/webp" />
                  <img
                    src={`/guide/${card.art.name}.png`}
                    alt=""
                    width={card.art.w}
                    height={card.art.h}
                    /* 첫 카드만 즉시 받는다. 나머지는 스크롤해야 보인다. */
                    loading={index === 0 ? undefined : 'lazy'}
                    decoding="async"
                  />
                </picture>
              </div>

              <div className="gh-cell-body">
                <h3>{card.title}</h3>
                <p>{card.summary}</p>
                <ul className="gh-topics">
                  {card.topics.map((topic) => (
                    <li key={topic}>{topic}</li>
                  ))}
                </ul>
              </div>

              <span className="gh-cell-go">
                자세히 보기 <span aria-hidden="true">›</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── 3. 숫자 밴드 — 카드 없이 실선 구획만 ─────────────────
          위아래가 전부 카드라 여기까지 카드로 만들면 화면이 상자로만 채워진다.
          숫자는 크게, 설명은 작게, 사이는 얇은 선 하나로 나눈다. */}
      <section className="section" aria-labelledby="gh-facts">
        <h2 id="gh-facts" className="sr-only">
          로또 6/45 기본 정보
        </h2>
        <dl className="gh-facts">
          {FACTS.map((fact) => (
            <div key={fact.value} className="gh-fact">
              <dt>{fact.label}</dt>
              <dd>
                {fact.value}
                {/* 단위는 값의 일부라 같은 `dd` 안에 둔다. 크기만 낮춘다. */}
                {fact.unit ? <span className="gh-fact-unit">{fact.unit}</span> : null}
              </dd>
            </div>
          ))}
        </dl>
        <p className="gh-facts-note">
          1부터 45까지 중 여섯 개를 고르는 게임입니다. 판매점에서 용지를 작성하거나 자동
          선택으로 구매합니다.
        </p>
      </section>

      {/* ── 4. 안내 — 항목 둘 ─────────────────────────────────────
          반드시 남아야 하는 두 가지(오락이라는 점, 판매 대행을 하지 않는다는 점)다.

          ⚠ 종전에는 제목 아래 **줄글 두 문단**이었다. 담긴 사실은 맞지만 훑어지지
            않아 "글자만 늘어놓은 것" 으로 보였다(사용자 지적). 두 문단은 원래
            **서로 다른 두 가지**를 말하고 있었으므로, 각 문단의 첫 문장을 소제목으로
            올리고 둘로 나눴다. 문장을 지우거나 고친 것이 아니라 자리를 바꾼 것이다.
          ⚠ 아이콘은 장식이다. 소제목이 이미 무슨 항목인지 말하므로 `aria-hidden`
            (icons.tsx 가 기본으로 붙인다)인 채로 둔다. */}
      <section className="section" aria-labelledby="gh-note">
        <div className="gh-note">
          <h2 id="gh-note">읽기 전에 알아 두면 좋은 것</h2>
          <ul className="gh-note-list">
            <li>
              <p className="gh-note-head">
                <ScaleIcon className="gh-note-icon" />
                복권은 오락입니다
              </p>
              <p>
                지출할 수 있는 범위 안에서, 즐길 수 있는 만큼만 이용하시기 바랍니다.
                당첨은 운에 달린 일이고, 그 점이 복권을 복권답게 만듭니다.
              </p>
            </li>
            <li>
              <p className="gh-note-head">
                <InfoIcon className="gh-note-icon" />
                판매·구매 대행을 하지 않습니다
              </p>
              <p>
                이 사이트는 복권을 팔지 않습니다. 국내에서 복권 판매는 기획재정부
                복권위원회가 지정한 공식 사업자만 할 수 있습니다.
              </p>
            </li>
          </ul>
        </div>
      </section>
    </div>
  )
}
