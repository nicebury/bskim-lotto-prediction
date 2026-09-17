import Link from 'next/link'

import { SERVICE_TILES } from '@/lib/site'
import { SERVICE_ICONS, type ServiceIconKey } from './icons'

/**
 * 홈 아이콘 6타일. 데스크톱 6열, 태블릿·모바일 3×2.
 *
 * 아이콘만 있는 홈은 저가치 페이지로 읽힌다. 각 타일에 **짧은 설명**을 반드시 붙인다.
 *
 * ⚠ **2026-09-08 부터 여섯 칸이 전부 링크다.** 그전에는 '연금복권 준비중' 타일이 `href: null`
 *   이라 링크가 아니었고, 이 컴포넌트도 그 경우를 분기해 `<div class="is-disabled">` 를
 *   그렸다. 번호놀이터가 그 자리를 대신하면서 분기가 **도달 불가능한 코드**가 됐고
 *   타입까지 깨뜨려(`never`) 걷어냈다.
 *
 *   연금복권이 열려 다시 '준비중' 타일이 필요해지면 그때 되살린다. 규칙은 그대로다 —
 *   **링크가 아닌 타일은 `<a>` 로 만들지 않는다.** 누를 수 없다는 사실이 마크업에도
 *   남아야 하고, 빈 페이지를 만들지 않는다(애드센스 심사 기준). `.tile.is-disabled` 와
 *   `.tile-badge` CSS 는 그 복원을 위해 남겨 두었다.
 *
 * 글리프는 진한 컬러 그라디언트 타일 위의 흰 SVG 다(시안). 색과 아이콘은 `accent` 하나가
 * 함께 고르므로 어긋날 수 없다.
 */
export function ServiceTiles() {
  return (
    <ul className="tiles">
      {SERVICE_TILES.map((tile) => {
        const Icon = SERVICE_ICONS[tile.accent as ServiceIconKey]

        return (
          <li key={tile.title}>
            <Link className="tile" href={tile.href} data-accent={tile.accent}>
              <span className="tile-glyph">
                {/* 옆 제목이 이미 설명하므로 아이콘은 접근성 트리에서 숨긴다. */}
                <Icon width={26} height={26} />
              </span>
              <span className="tile-title">{tile.title}</span>
              <span className="tile-summary">{tile.summary}</span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
