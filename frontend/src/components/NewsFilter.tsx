'use client'

import { useRouter } from 'next/navigation'
import { useId, useState } from 'react'

import type { NewsPeriod } from '@/lib/api-types'
import { SearchGlyph } from './icons'

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
/** 자주 찾는 낱말(고정). 아래 컴포넌트 주석 참조. */
const QUICK = ['1등', '당첨금', '판매점', '연금복권', '동행복권', '추첨']

const PERIODS: { value: NewsPeriod; label: string }[] = [
  { value: '1w', label: '1주' },
  { value: '2w', label: '2주' },
  { value: '1m', label: '1개월' },
  { value: '3m', label: '3개월' },
  { value: '6m', label: '6개월' },
  { value: 'all', label: '전체' },
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
    <form className="nfilter" onSubmit={onSubmit} role="search">
      {/*
        ⚠ 2026-09-17 재설계("투박하다"). 입력칸 · 기간 드롭다운 · 버튼이 한 줄에 같은 무게로 놓여
          검색창인지 설정 줄인지 흐렸다. 지금은 **돋보기가 든 알약형 검색창** 하나를 크게 두고,
          기간은 **칩**으로 늘어놓는다 — 드롭다운은 열어야 선택지가 보인다.
      */}
      <div className="nfilter-box">
        <label className="sr-only" htmlFor={`${baseId}-keyword`}>
          뉴스 키워드 검색
        </label>
        <SearchGlyph className="nfilter-icon" />
        <input
          id={`${baseId}-keyword`}
          type="search"
          placeholder="키워드로 찾기 (예: 1등, 판매점)"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <button type="submit" className="btn btn-primary nfilter-submit">
          검색
        </button>
      </div>

      <div className="nfilter-row">
        <div className="nfilter-periods" role="group" aria-label="조회 기간">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              className="nfilter-chip"
              data-active={p.value === period ? '' : undefined}
              aria-pressed={p.value === period}
              onClick={() => {
                setPeriod(p.value)
                // 기간은 고르는 즉시 적용한다 — 제출 버튼을 한 번 더 누르게 하지 않는다.
                apply(keyword, p.value)
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/*
          자주 찾는 낱말. 무엇을 검색할 수 있는지 **예시로** 보여 준다.
          ⚠ 고정 목록이다. 기사 키워드를 세어 인기어를 만들지 않는다 — 브라우저에서 집계하지
            않는다는 규칙(frontend/CLAUDE.md)이고, 그런 값이 필요하면 API 가 내려야 한다.
        */}
        <div className="nfilter-quick" aria-label="자주 찾는 키워드">
          {QUICK.map((word) => (
            <button
              key={word}
              type="button"
              className="nfilter-quick-word"
              data-active={word === initialKeyword ? '' : undefined}
              onClick={() => {
                setKeyword(word)
                apply(word, period)
              }}
            >
              #{word}
            </button>
          ))}
        </div>
      </div>
    </form>
  )
}
