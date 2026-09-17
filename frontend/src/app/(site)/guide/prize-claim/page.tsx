import Link from 'next/link'
import type { Metadata } from 'next'

import { Breadcrumb } from '@/components/Breadcrumb'
import { Disclaimer } from '@/components/Disclaimer'
import { Faq } from '@/components/Faq'
import { GuideHeroImage } from '@/components/GuideHeroImage'
import { GuideNav } from '@/components/GuideNav'
import { GuideRail } from '@/components/GuideRail'
import { JsonLd, articleLd } from '@/components/JsonLd'
import { InfoIcon, ScaleIcon } from '@/components/icons'
import { SITE_NAME, SITE_URL } from '@/lib/env'

/**
 * 로또 당첨금 수령 방법 (`/guide/prize-claim`).
 *
 * ── 2026-09-17 구조 개편 ────────────────────────────────────────────
 * 이 글은 **표로 읽어야 할 내용이 문장으로 늘어서 있었다.** 수령처(등수별)와
 * 세율(구간별)은 항목마다 값이 하나씩 대응하는 자료라, 줄글로 읽으면 자기
 * 경우를 찾기 위해 문단 전체를 훑어야 한다. 표로 옮기니 한 줄만 보면 된다.
 *
 * ⚠ **금액·세율 문장을 지어내지 않았다.** 종전 원고의 값을 그대로 옮겼고,
 *   표에 담기지 않는 단서(판매점 현금 사정, 세법 개정 가능성)는 표 아래
 *   문장으로 남겼다 — 표는 단서를 담지 못해, 빼면 틀린 정보가 된다.
 *
 * ⚠ `Disclaimer` 를 유지한다. 수령 절차·세율은 바뀔 수 있고 이 사이트는 수령을
 *   대행하지 않는다는 고지가 법적으로 필요하다([[forbidden-expressions]]).
 */

export const metadata: Metadata = {
  title: '로또 당첨금 수령 방법 — 수령처·서류·세금·지급기한',
  description:
    '로또 당첨금을 등수별로 어디서 받는지, 필요한 서류와 1년 지급 기한, 구간별 세율, 인터넷 구매분 수령 방법을 표로 정리했습니다.',
  alternates: { canonical: '/guide/prize-claim' },
  openGraph: {
    type: 'article',
    url: '/guide/prize-claim',
    title: '로또 당첨금 수령 방법 — 수령처·서류·세금·지급기한',
    description:
      '등수별 수령처와 필요 서류, 지급 기한, 세금, 인터넷 구매분 수령 방법을 안내합니다.',
  },
}

const FAQ_ITEMS = [
  {
    question: '당첨금은 언제까지 받아야 하나요?',
    answer:
      '해당 회차 지급개시일로부터 1년 이내에 청구해야 합니다. 기한을 넘기면 미수령 당첨금은 복권기금으로 귀속되어 받을 수 없습니다.',
  },
  {
    question: '1등 당첨금은 어느 은행에서 받나요?',
    answer:
      '1등은 NH농협은행 본점에서만 지급합니다. 2등은 NH농협은행 전국 지점에서 받을 수 있고, 소액(4·5등)은 로또 판매점에서 바로 받을 수 있습니다.',
  },
  {
    question: '세금은 얼마나 떼나요?',
    answer:
      '당첨금 200만원 이하는 비과세입니다. 200만원 초과 3억원 이하는 22%(기타소득세 20% + 지방소득세 2%), 3억원 초과분은 33%(기타소득세 30% + 지방소득세 3%)가 원천징수됩니다. 실제 수령액은 세금을 뗀 뒤 금액입니다.',
  },
]

const TOC = [
  { id: 'where', label: '수령처' },
  { id: 'papers', label: '필요 서류' },
  { id: 'deadline', label: '지급 기한' },
  { id: 'tax', label: '세금' },
  { id: 'online', label: '인터넷 구매분' },
  { id: 'safety', label: '안전하게' },
] as const

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
        <section className="section gd-head">
          <h1>로또 당첨금 수령 방법</h1>
          <p className="gd-lede">
            얼마를 맞혔느냐에 따라 받는 곳이 다릅니다. 판매점에서 바로 받는 소액부터
            본점에서만 지급하는 1등까지, 서류와 기한과 세금을 정리했습니다.
          </p>
          <GuideHeroImage
            slug="prize-claim"
            alt="서류 봉투와 동전 더미, 은행 건물이 어우러진 당첨금 수령 일러스트"
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

        <section className="section gd-sec gd-reveal" id="where">
          <h2>어디서 받나</h2>
          <p>당첨금 액수에 따라 창구가 달라집니다.</p>
          {/*
            ⚠ 3등 행을 넣었다가 뺐다. 종전 원고에 없던 내용이라 근거가 없다 —
              표는 줄글보다 단정적으로 읽혀서, 확인하지 않은 값을 한 줄 끼워 넣으면
              그 줄만 사실이 아닌 표가 된다. 원고가 말하던 범위(4·5등 / 2등 / 1등)만 담고,
              그 사이 금액대는 아래 문장이 "공식 안내를 확인하라" 로 받는다.
          */}
          {/* ⚠ `tabindex` 를 준다 — 좁은 화면에서 가로로 미는 영역은 키보드로도 닿아야 한다. */}
          <div className="gd-tablewrap" tabIndex={0} role="region" aria-label="등수별 수령처">
            <table className="gd-table">
              <caption className="sr-only">등수별 당첨금 수령처</caption>
              <thead>
                <tr>
                  <th scope="col">등수</th>
                  <th scope="col">받는 곳</th>
                  <th scope="col">비고</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">5등·4등</th>
                  <td>전국 로또 판매점</td>
                  <td>바로 받습니다</td>
                </tr>
                <tr>
                  <th scope="row">2등</th>
                  <td>NH농협은행 전국 지점</td>
                  <td>본점이 아니어도 됩니다</td>
                </tr>
                <tr>
                  <th scope="row">1등</th>
                  <td>NH농협은행 본점</td>
                  <td>지점에서는 받을 수 없습니다</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            판매점에서 받는 소액도 그날 판매점이 가진 현금 사정에 따라 은행 방문을
            안내받을 수 있습니다. 기준 금액과 창구는 시기에 따라 달라질 수 있으니 수령
            전에 공식 안내를 확인하세요.
          </p>
        </section>

        <section className="section gd-sec gd-reveal" id="papers">
          <h2>가져갈 것은 두 가지</h2>
          <ul className="gd-versus">
            <li data-accent="lotto">
              <h3>당첨 복권 원본</h3>
              <p>
                사본이나 사진으로는 지급되지 않습니다. 종이 복권은 훼손되면 바코드를 읽지
                못해 지급이 거절될 수 있습니다. 접거나 물에 닿게 하지 마세요.
              </p>
            </li>
            <li data-accent="stats">
              <h3>신분증과 본인 명의 계좌</h3>
              <p>
                본인 확인용 신분증이 필요합니다. 당첨금은 계좌로 지급되므로 본인 명의
                계좌도 함께 준비합니다.
              </p>
            </li>
          </ul>
          <div className="gd-callout">
            <p className="gd-callout-head">
              <InfoIcon className="gd-callout-icon" />
              확인했다면 뒷면에 먼저 서명하세요
            </p>
            <p>
              복권 뒷면 서명란에 <strong>바로 서명</strong>해 두면, 잃어버리거나 도난당했을
              때 소유를 다투는 근거가 됩니다. 수령처로 출발하기 전에 하는 편이 좋습니다.
            </p>
          </div>
        </section>

        <section className="section gd-sec gd-reveal" id="deadline">
          <h2>기한은 1년, 넘기면 끝입니다</h2>
          <dl className="gd-figures">
            <div className="gd-figure">
              <dt>청구 기한</dt>
              <dd>
                1<span>년</span>
              </dd>
              <p>해당 회차 지급개시일부터.</p>
            </div>
            <div className="gd-figure">
              <dt>기한을 넘기면</dt>
              <dd>
                복권기금<span>으로 귀속</span>
              </dd>
              <p>사정과 무관하게 받을 수 없습니다.</p>
            </div>
          </dl>
          <p>
            지급기한일이 토·일·공휴일이면 다음 영업일까지 청구할 수 있습니다. 1년은 길어
            보이지만 미루다 잊는 경우가 실제로 있습니다. 확인했다면 그 주에 처리하는 편이
            안전합니다.
          </p>
        </section>

        <section className="section gd-sec gd-reveal" id="tax">
          <h2>세금은 받을 때 떼고 줍니다</h2>
          <p>당첨금 구간에 따라 지급 시점에 원천징수됩니다.</p>
          <div className="gd-tablewrap" tabIndex={0} role="region" aria-label="구간별 세율">
            <table className="gd-table">
              <caption className="sr-only">당첨금 구간별 원천징수 세율</caption>
              <thead>
                <tr>
                  <th scope="col">당첨금 구간</th>
                  <th scope="col" data-num="">
                    세율
                  </th>
                  <th scope="col">내역</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">200만원 이하</th>
                  <td data-num="">비과세</td>
                  <td>떼지 않습니다</td>
                </tr>
                <tr>
                  <th scope="row">200만원 초과 ~ 3억원 이하</th>
                  <td data-num="">22%</td>
                  <td>기타소득세 20% + 지방소득세 2%</td>
                </tr>
                <tr>
                  <th scope="row">3억원 초과분</th>
                  <td data-num="">33%</td>
                  <td>기타소득세 30% + 지방소득세 3%</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            <strong>3억원을 넘는 부분에만</strong> 33%가 붙습니다. 전체 금액에 33%를
            매기는 것이 아닙니다. 그래서 공시된 당첨금과 손에 쥐는 금액이 다릅니다. 세율은
            세법 개정으로 바뀔 수 있으니 수령할 때 받는 내역서를 확인하세요.
          </p>
        </section>

        <section className="section gd-sec gd-reveal" id="online">
          <h2>인터넷으로 샀다면</h2>
          <p>동행복권 온라인 구매분은 종이 복권과 수령 방식이 다릅니다.</p>
          <ol className="gd-steps">
            <li className="gd-step">
              <h3>200만원 이하는 자동 입금</h3>
              <p>
                추첨 다음 날 새벽부터 신청 없이 동행복권 예치금 계좌로 들어옵니다. 이후
                마이페이지에서 출금을 신청해 본인 계좌로 옮깁니다.
              </p>
            </li>
            <li className="gd-step">
              <h3>200만원을 넘으면 은행 방문</h3>
              <p>
                온라인에서 당첨을 확인한 뒤 신분증을 지참하고 지정된 NH농협은행 지점을
                방문합니다. 1등은 종이 복권과 마찬가지로 본점에서만 받습니다.
              </p>
            </li>
          </ol>
        </section>

        <section className="section gd-sec gd-reveal" id="safety">
          <h2>알리는 범위를 줄이세요</h2>
          <p>
            고액 당첨 사실이 알려지면 원치 않는 연락과 요구가 따라옵니다. 수령 절차가 끝날
            때까지 아는 사람을 최소한으로 두는 편이 안전합니다.
          </p>
          <div className="gd-callout" data-tone="warn">
            <p className="gd-callout-head">
              <ScaleIcon className="gd-callout-icon" />
              대신 받아주겠다는 연락은 사기입니다
            </p>
            <p>
              당첨금 수령에 <strong>중개인은 필요하지 않습니다.</strong> 수수료를 요구하거나
              대신 받아주겠다는 연락, 당첨을 확인해 주겠다며 복권 사진이나 계좌를 요구하는
              연락은 응하지 마세요. 공식 창구는 판매점과 NH농협은행뿐입니다.
            </p>
          </div>
          <p>
            당첨번호를 확인하는 방법은{' '}
            <Link href="/guide/how-to-check">당첨번호 확인 방법</Link>에서 다룹니다.
          </p>
        </section>

        <Faq items={FAQ_ITEMS} />

        <Disclaimer>
          이 페이지는 동행복권 공식 안내를 바탕으로 일반적인 절차를 정리한 참고 자료입니다.
          수령 장소·지급 기한·세율 등 구체적인 사항은 변경될 수 있으므로 반드시 공식 발표를
          확인하시기 바랍니다. 행운상자는 복권을 판매하거나 당첨금 수령을 대행하지 않습니다.
        </Disclaimer>
      </article>

      <GuideNav current="prize-claim" />

      <JsonLd
        data={articleLd({
          headline: '로또 당첨금 수령 방법 — 수령처·서류·세금·지급기한',
          description:
            '로또 당첨금을 등수별로 어디서 받는지, 필요 서류와 지급 기한, 세금, 인터넷 구매분 수령 방법을 안내합니다.',
          siteName: SITE_NAME,
          siteUrl: SITE_URL,
          datePublished: '2026-07-09',
          dateModified: '2026-09-17',
        })}
      />
    </div>
  )
}
