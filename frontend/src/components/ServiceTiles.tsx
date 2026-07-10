import Link from 'next/link'

import { SERVICE_TILES } from '@/lib/site'
import { SERVICE_ICONS, type ServiceIconKey } from './icons'

/**
 * 홈 아이콘 6타일. 데스크톱 6열, 태블릿·모바일 3×2.
 *
 * 아이콘만 있는 홈은 저가치 페이지로 읽힌다. 각 타일에 **짧은 설명**을 반드시 붙인다.
 * '준비중' 타일은 링크가 아니다 — 빈 페이지를 만들지 않는다.
 *
 * 글리프는 진한 컬러 그라디언트 타일 위의 흰 SVG 다(시안). 색과 아이콘은 `accent` 하나가
 * 함께 고르므로 어긋날 수 없다.
 */
export function ServiceTiles() {
  return (
    <ul className="tiles">
      {SERVICE_TILES.map((tile) => {
        const badge = 'badge' in tile ? tile.badge : undefined
        const Icon = SERVICE_ICONS[tile.accent as ServiceIconKey]

        const inner = (
          <>
            <span className="tile-glyph">
              {/* 옆 제목이 이미 설명하므로 아이콘은 접근성 트리에서 숨긴다. */}
              <Icon width={26} height={26} />
            </span>
            <span className="tile-title">{tile.title}</span>
            <span className="tile-summary">{tile.summary}</span>
            {badge && <span className="tile-badge">{badge}</span>}
          </>
        )

        return (
          <li key={tile.title}>
            {tile.href ? (
              <Link className="tile" href={tile.href} data-accent={tile.accent}>
                {inner}
              </Link>
            ) : (
              // 링크가 아닌 타일은 <a> 로 만들지 않는다. 누를 수 없다는 사실이 마크업에도 남아야 한다.
              <div className="tile is-disabled" data-accent={tile.accent}>
                {inner}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
