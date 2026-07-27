import Link from 'next/link'

/**
 * 페이지네이션 (002 R31).
 *
 * URL 쿼리스트링 기반이라 각 페이지가 SSR 되고 크롤러가 따라간다. `buildHref` 로 현재
 * 필터(키워드·기간)를 유지한 채 page 만 바꾼다.
 *
 * 페이지 번호를 다 그리지 않는다 — 현재 주변 ±2 와 처음/끝만. 100페이지에서 100개 링크는
 * 크롤 예산과 화면 양쪽에 낭비다.
 *
 * `rel="prev"`/`rel="next"` 를 준다 — 검색엔진에 목록의 순서를 알린다.
 */
export function Pagination({
  page,
  total,
  size,
  buildHref,
}: {
  page: number
  total: number
  size: number
  /** page 번호 → href. 호출부가 현재 필터를 함께 실어 만든다. */
  buildHref: (page: number) => string
}) {
  const lastPage = Math.max(1, Math.ceil(total / size))
  if (lastPage <= 1) return null

  const pages = pageWindow(page, lastPage)

  return (
    <nav className="pagination" aria-label="뉴스 페이지 이동">
      {page > 1 ? (
        <Link className="page-btn" href={buildHref(page - 1)} rel="prev" aria-label="이전 페이지">
          ‹
        </Link>
      ) : (
        <span className="page-btn is-disabled" aria-hidden="true">
          ‹
        </span>
      )}

      {pages.map((p, index) =>
        p === ELLIPSIS ? (
          <span key={`gap-${index}`} className="page-gap" aria-hidden="true">
            …
          </span>
        ) : p === page ? (
          <span key={p} className="page-btn is-current" aria-current="page">
            {p}
          </span>
        ) : (
          <Link key={p} className="page-btn" href={buildHref(p)}>
            {p}
          </Link>
        ),
      )}

      {page < lastPage ? (
        <Link className="page-btn" href={buildHref(page + 1)} rel="next" aria-label="다음 페이지">
          ›
        </Link>
      ) : (
        <span className="page-btn is-disabled" aria-hidden="true">
          ›
        </span>
      )}
    </nav>
  )
}

const ELLIPSIS = -1

/** 현재 ±2 + 처음/끝. 사이가 벌어지면 말줄임. */
function pageWindow(current: number, last: number): number[] {
  const around = new Set<number>([1, last, current])
  for (let d = 1; d <= 2; d += 1) {
    if (current - d >= 1) around.add(current - d)
    if (current + d <= last) around.add(current + d)
  }
  const sorted = [...around].sort((a, b) => a - b)

  const result: number[] = []
  let prev = 0
  for (const p of sorted) {
    if (prev && p - prev > 1) result.push(ELLIPSIS)
    result.push(p)
    prev = p
  }
  return result
}
