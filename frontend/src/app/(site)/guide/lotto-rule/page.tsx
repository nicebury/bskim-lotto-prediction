import Link from 'next/link'
import type { Metadata } from 'next'

import { Breadcrumb } from '@/components/Breadcrumb'
import { FactSpotImage } from '@/components/FactSpotImage'
import { GuideHeroImage } from '@/components/GuideHeroImage'
import { GuideNav } from '@/components/GuideNav'
import { GuideRail } from '@/components/GuideRail'
import { JsonLd, articleLd } from '@/components/JsonLd'
import { InfoIcon, ScaleIcon } from '@/components/icons'
import { SITE_NAME, SITE_URL } from '@/lib/env'

/**
 * 로또의 재미있는 사실 (`/guide/lotto-rule`).
 *
 * ── 2026-09-17 전면 개편 ────────────────────────────────────────────
 * 종전에는 `h2` 네 개에 문단만 붙은 형태였고 내용도 넷뿐이었다("컨텐츠가 빈약한데
 * 좀더 찾아주고" — 사용자). 사실을 여섯 가지 더 찾아 넣고, 종류마다 다른 그릇에
 * 담았다(`guide-doc.css` 머리말 참조).
 *
 * ── ⚠ 숫자에는 출처를 적는다 ────────────────────────────────────────
 * 여기 실린 기록(407억·63명·2002-12-07)은 밖에서 가져온 것이다. 출처 없이 적어 두면
 * 몇 달 뒤 누구도 **고칠 수도 지울 수도 없는 숫자**가 된다. 페이지 맨 아래 출처 절을
 * 두고, 회차와 날짜를 함께 적어 검증 가능한 형태로 남긴다.
 *
 * ── ⚠ 규칙에서 유도되는 수와 기록을 구분한다 ────────────────────────
 * 8,145,060(조합의 수)과 81억 4,506만원(전 조합 구매비)은 **게임 규칙에서 계산되는
 * 값**이라 시간이 지나도 변하지 않는다. 반면 최고 당첨금·최다 당첨자는 **깨질 수 있는
 * 기록**이다. 뒤쪽에는 "지금까지" 를 붙여 두 종류를 섞지 않는다.
 *
 * ── ⚠ 금지 표현 ────────────────────────────────────────────────────
 * '확률'·'1등 가능성' 을 쓰지 않는다([[forbidden-expressions]]). 종전 원고에는
 * "1등이 될 가능성" 이 그대로 있었다 — 목록에 명시된 표현이라 이번에 걷어냈다.
 * 대신 **수 자체**를 보여 준다("814만 가지 중 하나"). 사실을 말하는 데 금지어가
 * 필요하지 않다.
 */

export const metadata: Metadata = {
  title: '로또의 재미있는 사실 — 814만 가지 조합과 기록들',
  description:
    '45개 중 6개를 고르는 방법은 8,145,060가지. 전 조합을 사면 얼마인지, 역대 최고 당첨금과 1등이 63명 나온 회차, 추첨 볼을 경찰 입회 하에 검사하는 절차까지 로또에 얽힌 사실을 모았습니다.',
  alternates: { canonical: '/guide/lotto-rule' },
  openGraph: {
    type: 'article',
    url: '/guide/lotto-rule',
    title: '로또의 재미있는 사실 — 814만 가지 조합과 기록들',
    description:
      '조합의 수, 역대 기록, 추첨 절차, 세계의 로또까지 숫자로 보는 로또 이야기.',
  },
}

/** 목차 칩. 각 절의 `id` 와 짝이다 — 한쪽만 고치면 링크가 죽는다. */
const TOC = [
  { id: 'combinations', label: '814만 가지' },
  { id: 'buy-all', label: '전부 사면' },
  { id: 'record', label: '역대 최고 407억' },
  { id: 'many-winners', label: '1등 63명' },
  { id: 'draw', label: '추첨 절차' },
  { id: 'world', label: '세계의 로또' },
  { id: 'rare', label: '얼마나 드문가' },
] as const

export default function LottoFactsPage() {
  return (
    <div className="container">
      <Breadcrumb
        items={[
          { name: '홈', href: '/' },
          { name: '가이드', href: '/guide' },
          { name: '로또의 재미있는 사실', href: '/guide/lotto-rule' },
        ]}
      />

      <article>
        <section className="section gd-head">
          <h1>로또의 재미있는 사실</h1>
          <p className="gd-lede">
            45개 중 6개를 고르는 게임에 20년이 넘는 기록이 쌓였습니다. 숫자로 보면
            규칙만 읽을 때와 다르게 보입니다.
          </p>
          <GuideHeroImage
            slug="lotto-facts"
            alt="색색의 로또 볼이 즐겁게 흩날리는 일러스트"
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

        {/* ── 한눈에 보는 세 숫자 ─────────────────────────────────
            ⚠ 셋의 성격이 다르다. 앞의 둘은 규칙에서 나오는 값이고 마지막은 날짜다.
              깨질 수 있는 '기록' 은 여기 두지 않는다 — 한 상자에 섞이면 전부
              고정된 사실처럼 읽힌다. */}
        <section className="section" aria-labelledby="facts-glance">
          <h2 id="facts-glance" className="sr-only">
            한눈에 보는 숫자
          </h2>
          <dl className="gd-figures gd-reveal">
            <div className="gd-figure">
              <dt>45개 중 6개를 고르는 방법</dt>
              <dd>
                8,145,060<span>가지</span>
              </dd>
              <p>게임 규칙에서 곧바로 계산되는 수입니다.</p>
            </div>
            <div className="gd-figure">
              <dt>한 게임 가격</dt>
              <dd>
                1,000<span>원</span>
              </dd>
              <p>2002년 첫 회차부터 바뀌지 않았습니다.</p>
            </div>
            <div className="gd-figure">
              <dt>첫 추첨</dt>
              <dd>
                2002<span>년 12월 7일</span>
              </dd>
              <p>1등 2명이 각각 21억 9,000만원을 받았습니다.</p>
            </div>
          </dl>
        </section>

        <section className="section gd-sec gd-reveal" id="combinations">
          <div className="gd-withspot">
            <div>
              <h2>814만 가지 조합은 모두 같은 처지다</h2>
              <p>
                45개 번호에서 순서 없이 6개를 고르는 방법은 정확히{' '}
                <strong>8,145,060가지</strong>입니다. 45×44×43×42×41×40 을 6개를 배열하는
                경우의 수 720으로 나눈 값입니다.
              </p>
              <p>
                이 814만 개는 매 회차 <strong>똑같은 자격</strong>으로 추첨에 들어갑니다.
                1·2·3·4·5·6도, 지난주에 나온 조합도, 한 번도 나온 적 없는 조합도 다르지
                않습니다. 사람 눈에 &ldquo;있을 법한 조합&rdquo;과 &ldquo;없을 법한
                조합&rdquo;이 따로 보일 뿐입니다.
              </p>
            </div>
            <FactSpotImage
              slug="fact-combinations"
              alt="셀 수 없이 쌓인 로또 용지 일러스트"
            />
          </div>
        </section>

        <section className="section gd-sec gd-reveal" id="buy-all">
          <h2>전부 사면 81억, 그런데 손해일 수 있다</h2>
          <p>
            814만 가지를 한 게임씩 모두 사면 <strong>81억 4,506만원</strong>이 듭니다.
            이렇게 하면 1등은 반드시 나옵니다. 그런데 남는 장사가 되지는 않습니다.
          </p>
          <dl className="gd-figures">
            <div className="gd-figure">
              <dt>전 조합 구매 비용</dt>
              <dd>
                81.45<span>억원</span>
              </dd>
              <p>8,145,060게임 × 1,000원.</p>
            </div>
            <div className="gd-figure">
              <dt>3억 초과분 세율</dt>
              <dd>
                33<span>%</span>
              </dd>
              <p>기타소득세 30% + 지방소득세 3%.</p>
            </div>
          </dl>
          <p>
            1등 당첨금은 3억원을 넘는 부분에 <strong>33%</strong>가 원천징수됩니다. 여기에
            같은 회차 1등이 여러 명이면 당첨금을 나눠 갖습니다. 혼자 맞혀야 하고, 세금을
            떼고도 81억이 남아야 본전입니다.
          </p>
          <p>
            게다가 한 판매점에서 814만 장을 발행하는 것 자체가 현실적으로 불가능합니다.
            &ldquo;전부 사면 된다&rdquo;는 생각이 성립하지 않는 이유입니다.
          </p>
        </section>

        <section className="section gd-sec gd-reveal" id="record">
          <h2>아직 깨지지 않은 407억</h2>
          <p>
            지금까지 가장 큰 1등 당첨금은 <strong>2003년 4월 12일 19회</strong>의{' '}
            <strong>407억 2,295만원</strong>입니다. 20년이 넘도록 이 기록은 그대로입니다.
          </p>
          <p>
            이런 금액이 나온 것은 <strong>이월</strong> 때문입니다. 1등이 나오지 않으면
            그 회차 당첨금이 다음 회차로 넘어가 쌓입니다. 19회는 앞선 회차들의 이월이
            겹친 데다 당첨자가 한 명이어서 전액을 혼자 받았습니다.
          </p>
          <p>
            이월은 흔한 일이 아닙니다. 로또가 시작된 2002년부터 지금까지 손에 꼽을 만큼만
            일어났습니다.
          </p>
        </section>

        <section className="section gd-sec gd-reveal" id="many-winners">
          <h2>1등이 63명 나온 날</h2>
          <p>
            <strong>2024년 7월 13일 1128회</strong>에는 1등이 <strong>63명</strong>
            나왔습니다. 역대 가장 많은 숫자입니다. 그 전 기록은 2022년 6월 11일 1019회의
            50명이었습니다.
          </p>
          <p>
            1등이 많이 나오면 당첨금은 그만큼 나뉩니다. 같은 1등이라도 회차에 따라 받는
            금액이 크게 달라지는 이유입니다.
          </p>
          <div className="gd-callout">
            <p className="gd-callout-head">
              <ScaleIcon className="gd-callout-icon" />왜 이런 일이 생길까
            </p>
            <p>
              사람들이 고르는 번호는 고르게 흩어지지 않습니다. 생일에 쓰이는 1~31, 가지런한
              연속번호, 용지에서 줄을 맞춘 모양 같은 것에 몰립니다. 그런 조합이 추첨되면
              당첨자가 한꺼번에 쏟아집니다. 추첨이 이상해서가 아니라{' '}
              <strong>사람의 선택이 몰려 있어서</strong> 생기는 일입니다.
            </p>
          </div>
        </section>

        <section className="section gd-sec gd-reveal" id="draw">
          <h2>추첨 볼은 경찰이 보는 앞에서 무게를 잽니다</h2>
          <p>
            추첨은 매주 토요일 저녁 생방송으로 진행됩니다. 방송에 나오지 않는 준비 절차가
            따로 있습니다.
          </p>
          <ol className="gd-steps">
            <li className="gd-step">
              <h3>봉인 확인</h3>
              <p>잠금장치로 봉인된 케이스에 보관된 볼 세트의 봉인 상태를 확인합니다.</p>
            </li>
            <li className="gd-step">
              <h3>둘레와 무게 검사</h3>
              <p>
                방청객과 경찰관이 입회한 자리에서 볼의 둘레와 무게를 잽니다. 검사를 통과한
                세트만 추첨에 쓰입니다.
              </p>
            </li>
            <li className="gd-step">
              <h3>세트 선정</h3>
              <p>볼은 다섯 세트로 관리되며, 그중 어느 세트를 쓸지 그날 정합니다.</p>
            </li>
            <li className="gd-step">
              <h3>공기 혼합 후 추출</h3>
              <p>
                공기로 볼을 섞은 뒤 회전하는 드럼이 하나씩 잡아냅니다. 투입부터 추출까지
                생방송으로 나갑니다.
              </p>
            </li>
          </ol>
          <p>
            경찰관은 사전에 기기와 볼을 확인하고, 추첨 동안 방청석 첫 줄에 앉아 과정을
            지켜봅니다.
          </p>
        </section>

        <section className="section gd-sec gd-reveal" id="world">
          <div className="gd-withspot">
            <div>
              <h2>세계의 로또는 자릿수가 다르다</h2>
              <p>
                미국 <strong>파워볼</strong>은 2022년 11월 약 <strong>20억 4천만 달러</strong>
                (원화 약 2조 8천억원)라는 당첨금을 기록했습니다. 우리 로또의 역대 최고인
                407억과 견주면 60배가 넘습니다.
              </p>
              <p>
                자릿수가 다른 이유는 규칙에 있습니다. 파워볼은 69개 중 5개에 더해 26개 중
                1개를 따로 맞혀야 해서 조합의 수가 2억 9천만 가지가 넘습니다. 그만큼 1등이
                잘 나오지 않고, 나오지 않을수록 이월이 쌓입니다.
              </p>
            </div>
            <FactSpotImage
              slug="fact-world"
              alt="지구본에 로또 볼이 얹힌 세계의 로또 일러스트"
            />
          </div>
        </section>

        <section className="section gd-sec gd-reveal" id="rare">
          <div className="gd-withspot">
            <div>
              <h2>얼마나 드문 일인가</h2>
              <p>
                814만분의 1이라는 수는 감이 잘 오지 않습니다. 견주어 보면 이렇습니다.
                벼락을 맞는 경우는 자료마다 28만분의 1에서 60만분의 1까지로 다르게
                인용되는데, 어느 쪽을 기준으로 삼아도 1등 조합을 맞히는 쪽이 훨씬
                드뭅니다.
              </p>
              <p>
                그래서 이 사이트는 번호를 맞히는 방법을 알려 주지 않습니다. 그런 방법은
                없습니다. 대신 지난 회차에 무엇이 나왔는지, 사람들이 어떤 번호를 고르는지
                같은 <strong>확인할 수 있는 사실</strong>을 정리합니다.
              </p>
            </div>
            <FactSpotImage
              slug="fact-odds"
              alt="구름과 번개로 희박함을 표현한 일러스트"
            />
          </div>
        </section>

        <section className="section gd-sec gd-reveal" id="next">
          <h2>이어서 볼 만한 것</h2>
          <p>
            번호를 어떻게 고르든 당첨 판정이 같다는 점은{' '}
            <Link href="/guide/auto-vs-manual">자동과 수동의 차이</Link>에서, 당첨금을
            실제로 받는 절차는 <Link href="/guide/prize-claim">당첨금 수령 방법</Link>에서
            다룹니다. 지난 회차에 어떤 번호가 몇 번 나왔는지는{' '}
            <Link href="/lotto/stat">번호 통계</Link>에서 볼 수 있습니다.
          </p>
          <div className="gd-callout">
            <p className="gd-callout-head">
              <InfoIcon className="gd-callout-icon" />
              여기 실린 숫자에 대해
            </p>
            <p>
              조합의 수와 구매 비용은 게임 규칙에서 계산한 값이라 바뀌지 않습니다. 반면
              최고 당첨금과 최다 당첨자 수는 <strong>깨질 수 있는 기록</strong>입니다.
              회차와 날짜를 함께 적어 두었으니 최신 기록은 동행복권 공식 통계에서 확인하실
              수 있습니다.
            </p>
          </div>
          <p className="gd-source">
            기록 출처: 동행복권 로또 히스토리·당첨통계, 추첨 절차는 동행복권 추첨안내.
            파워볼 당첨금은 2022년 11월 보도 기준. 벼락 관련 수치는 인용 자료마다 달라
            범위로 적었습니다.
          </p>
        </section>
      </article>

      <GuideNav current="lotto-rule" />

      <JsonLd
        data={articleLd({
          headline: '로또의 재미있는 사실 — 814만 가지 조합과 기록들',
          description:
            '조합의 수, 전 조합 구매 비용, 역대 최고 당첨금과 최다 당첨자, 추첨 절차, 세계의 로또까지 숫자로 보는 로또 이야기.',
          siteName: SITE_NAME,
          siteUrl: SITE_URL,
          datePublished: '2026-07-09',
          dateModified: '2026-09-17',
        })}
      />
    </div>
  )
}
