import type { Metadata } from 'next'

/**
 * 운영자 전용 구역.
 *
 * ── ⚠ 이 레이아웃이 존재하는 이유는 `noindex` 하나다 ────────────────
 * 계약(`docs/wiki/10-contracts/api-contract.md` 운영자 절)이 정한 프론트 규칙:
 *
 * | 규칙 | 이유 |
 * |---|---|
 * | `robots: noindex, nofollow` | 검색에 노출되면 안 된다 |
 * | `sitemap.ts` 에 넣지 않는다 | 화이트리스트 방식이라 자동 제외되지만, 실수로 넣지 않는다 |
 * | **`robots.txt` 에 `Disallow` 를 넣지 않는다** | 크롤을 막으면 크롤러가 `noindex` 를 **읽지 못해** URL 만 색인될 수 있다. 막는 것과 숨기는 것은 다르다 |
 * | 광고를 넣지 않는다 | 운영자만 보는 화면이다 |
 * | 면책·가이드 문구를 넣지 않는다 | 공개 화면이 아니다 |
 * | 링크를 걸지 않는다 | 헤더·푸터 어디에도. 주소를 아는 사람만 들어온다 |
 *
 * ⚠ 하위 페이지에서 `metadata` 를 새로 export 하면 **이 `robots` 가 덮인다.** 하위는
 *   `title` 만 두거나, 두더라도 `robots` 를 함께 적는다.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: '운영자',
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  /*
    ⚠ 공개 셸(`(site)/layout.tsx`)이 붙지 않는 구역이라 **랜드마크를 직접 둔다.**
      `<main>` 이 없으면 스크린리더가 본문의 시작을 알 수 없고 axe `landmark-one-main` 이
      걸린다. 헤더·푸터가 없는 것은 의도다 — 계약이 면책·가이드 문구를 금지한다.
  */
  return (
    <main id="main" className="container admin">
      {children}
    </main>
  )
}
