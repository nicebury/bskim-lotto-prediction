/**
 * /v2 의 조용한 구역 — 서비스·뉴스·가이드·소개 본문.
 *
 * 이 시안의 대담함은 격자 하나에 몰아 두었다(→ 20-design/home-v2-concept.md). 여기부터는
 * 장식을 덜어내고 읽히는 것만 남긴다. 전부 서버 컴포넌트다.
 *
 * ⚠ 소개 본문을 지우지 않는다. "아이콘만 있는 메인홈"은 저가치 페이지로 읽히고,
 *   애드센스 심사 기준에 정면으로 걸린다(→ 30-seo/adsense-readiness.md).
 */
import Link from 'next/link'

import { SERVICE_ICONS } from '@/components/icons'
import type { NewsItem } from '@/lib/api-types'
import { formatPubDate } from '@/lib/format'
import { GUIDES, SERVICE_TILES } from '@/lib/site'

/* ────────────────────────────────────────────────────────────
 * 서비스 6타일
 * ──────────────────────────────────────────────────────────── */

export function HbServices() {
  return (
    <ul className="hb-tiles">
      {SERVICE_TILES.map((tile) => {
        const Icon = SERVICE_ICONS[tile.accent]
        // 준비 중 항목은 링크가 아니다. 빈 페이지를 만들지 않는다(애드센스 심사 기준).
        const body = (
          <>
            <span className="hb-tile-glyph" data-accent={tile.accent}>
              <Icon />
            </span>
            <span className="hb-tile-title">
              {tile.title}
              {'badge' in tile && tile.badge && <span className="hb-tile-badge">{tile.badge}</span>}
            </span>
            <span className="hb-tile-summary">{tile.summary}</span>
          </>
        )

        return (
          <li key={tile.title}>
            {tile.href ? (
              <Link className="hb-tile" href={tile.href}>
                {body}
              </Link>
            ) : (
              <span className="hb-tile" data-disabled="">
                {body}
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/* ────────────────────────────────────────────────────────────
 * 뉴스 3건
 * ──────────────────────────────────────────────────────────── */

export function HbNews({ items }: { items: NewsItem[] }) {
  if (items.length === 0) {
    return <p className="hb-empty">표시할 뉴스가 없습니다. 잠시 후 다시 확인해 주세요.</p>
  }

  return (
    <ul className="hb-news">
      {items.map((item) => (
        <li key={item.id}>
          {/*
            외부 언론사로 나가는 링크다. rel 에 nofollow 를 붙이는 것은 우리가 그 문서를
            보증하지 않는다는 표시이고, noopener 는 새 탭이 이 페이지를 조작하지 못하게 한다.
          */}
          <a href={item.link} target="_blank" rel="nofollow noopener noreferrer">
            <span className="hb-news-title">{item.title}</span>
            <span className="hb-news-meta">
              {item.source} · <time dateTime={item.pub_date}>{formatPubDate(item.pub_date)}</time>
            </span>
          </a>
        </li>
      ))}
    </ul>
  )
}

/* ────────────────────────────────────────────────────────────
 * 가이드 5카드
 * ──────────────────────────────────────────────────────────── */

export function HbGuides() {
  return (
    <ul className="hb-guides">
      {GUIDES.map((guide) => (
        <li key={guide.slug}>
          <Link className="hb-guide" href={`/guide/${guide.slug}`} data-accent={guide.accent}>
            <span className="hb-guide-title">{guide.title}</span>
            <span className="hb-guide-summary">{guide.summary}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

/* ────────────────────────────────────────────────────────────
 * 소개 본문
 *
 * 검색엔진과 애드센스 심사자가 읽는 문장이다. 이 서비스가 무엇이고 **무엇이 아닌지**를
 * 분명히 적는다 — 판매·구매대행이 아니라는 사실, 통계가 다음 회차와 무관하다는 사실.
 * ──────────────────────────────────────────────────────────── */

export function HbAbout({ siteName }: { siteName: string }) {
  return (
    <div className="hb-prose">
      <p>
        {siteName}는 로또 6/45의 당첨결과와 번호 통계를 정리해 보여주는 복권 정보
        대시보드입니다. 매주 토요일 추첨이 끝나면 당첨번호와 보너스 번호, 1등 당첨자 수와
        당첨금을 회차별로 정리합니다. 회차 상세 페이지에서는 그 회차의 번호 조합이 어떤 성향을
        가졌는지 — 홀짝 비율, 고저 비율, 번호 합계, 번호대 분포 — 를 함께 볼 수 있습니다.
      </p>
      <p>
        번호 통계에서는 최근 20회, 50회, 100회, 역대 전체를 기준으로 각 번호가 몇 번 나왔는지,
        어떤 번호가 오래 나오지 않았는지를 확인할 수 있습니다. 통계는 과거 회차의 분포를
        이해하기 위한 참고 정보입니다. 로또 번호는 매 회차 무작위로 추첨되며, 45개 중 6개를
        고르는 조합의 수는 8,145,060가지입니다. 과거에 어떤 번호가 몇 번 나왔든 다음 회차에서
        각 조합이 뽑힐 가능성은 모두 같습니다.
      </p>
      <p>
        번호 뽑기는 재미용 시뮬레이션입니다. 완전 랜덤부터 번호대 균형, 최근 통계 참고까지
        여러 방식으로 조합을 만들고, 만들어진 조합의 성향을 설명합니다. 어떤 방식도 추첨
        결과에 영향을 주지 않으며, {siteName}는 복권을 판매하거나 구매를 대행하지 않습니다.
        복권 구매는 기획재정부 복권위원회가 지정한 공식 사업자를 통해서만 가능하며, 19세
        미만은 복권을 구매할 수 없습니다.
      </p>
    </div>
  )
}
