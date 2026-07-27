'use client'

import { useRouter } from 'next/navigation'
import { useId, useState } from 'react'

import type { NewsPeriod } from '@/lib/api-types'

/**
 * 뉴스 조회 폼 — 키워드 + 기간(002 R30).
 *
 * ⚠ 상태를 컴포넌트 안에 가두지 않고 **URL 쿼리스트링**으로 실어 서버에 다시 요청한다.
 *   그래야 각 조회 결과가 SSR 되어 검색엔진이 읽고, 뒤로가기·공유·새로고침이 자연스럽다.
 *   (뉴스 목록은 CSR 로 갈아끼우는 것보다 URL 로 관리하는 편이 SEO·접근성에 낫다.)
 *
 * 폼 제출 시 page 를 1로 되돌린다 — 3페이지에서 키워드를 바꾸면 결과가 3페이지부터
 * 시작할 이유가 없다.
 */
const PERIODS: { value: NewsPeriod; label: string }[] = [
  { value: '1w', label: '최근 1주' },
  { value: '2w', label: '최근 2주' },
  { value: '1m', label: '최근 1개월' },
  { value: '3m', label: '최근 3개월' },
  { value: '6m', label: '최근 6개월' },
  { value: 'all', label: '전체 기간' },
]

export function NewsFilter({
  keyword: initialKeyword,
  period: initialPeriod,
}: {
  keyword: string
  period: NewsPeriod
}) {
  const router = useRouter()
  const baseId = useId()
  const [keyword, setKeyword] = useState(initialKeyword)
  const [period, setPeriod] = useState<NewsPeriod>(initialPeriod)

  const apply = (nextKeyword: string, nextPeriod: NewsPeriod) => {
    const query = new URLSearchParams()
    const trimmed = nextKeyword.trim()
    if (trimmed) query.set('keyword', trimmed)
    // period 기본값(1w)은 URL 에 싣지 않는다 — 깔끔한 canonical 을 위해.
    if (nextPeriod !== '1w') query.set('period', nextPeriod)
    const qs = query.toString()
    router.push(qs ? `/news?${qs}` : '/news')
  }

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    apply(keyword, period)
  }

  return (
    <form className="news-filter" onSubmit={onSubmit} role="search">
      <div className="news-filter-field">
        <label className="sr-only" htmlFor={`${baseId}-keyword`}>
          뉴스 키워드 검색
        </label>
        <input
          id={`${baseId}-keyword`}
          className="input"
          type="search"
          placeholder="키워드 (예: 1등, 판매점)"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
      </div>

      <div className="news-filter-field">
        <label className="sr-only" htmlFor={`${baseId}-period`}>
          조회 기간
        </label>
        <select
          id={`${baseId}-period`}
          className="input"
          value={period}
          onChange={(e) => {
            const next = e.target.value as NewsPeriod
            setPeriod(next)
            // 기간은 고르는 즉시 적용한다 — 제출 버튼을 한 번 더 누르게 하지 않는다.
            apply(keyword, next)
          }}
        >
          {PERIODS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <button type="submit" className="btn btn-primary news-filter-submit">
        검색
      </button>
    </form>
  )
}
