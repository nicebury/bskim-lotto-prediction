import Link from 'next/link'

import { absoluteUrl } from '@/lib/env'
import { JsonLd, breadcrumbLd } from './JsonLd'

export interface Crumb {
  name: string
  /** 마지막 항목(현재 페이지)은 href 를 주되 링크로 렌더링하지 않는다. */
  href: string
}

/**
 * 계층 경로. **화면의 breadcrumb 항목과 JSON-LD BreadcrumbList 가 일치해야 한다** —
 * 그래서 한 컴포넌트가 둘을 함께 렌더링한다. 따로 두면 언젠가 어긋난다.
 * → docs/wiki/30-seo/structured-data.md
 */
export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <>
      <nav aria-label="현재 위치">
        <ol className="breadcrumb">
          {items.map((item, index) => {
            const isLast = index === items.length - 1
            return (
              <li key={item.href}>
                {index > 0 && (
                  <span className="breadcrumb-sep" aria-hidden="true">
                    ›
                  </span>
                )}
                {isLast ? (
                  <span aria-current="page">{item.name}</span>
                ) : (
                  <Link href={item.href}>{item.name}</Link>
                )}
              </li>
            )
          })}
        </ol>
      </nav>

      <JsonLd
        data={breadcrumbLd(items.map((item) => ({ name: item.name, url: absoluteUrl(item.href) })))}
      />
    </>
  )
}
