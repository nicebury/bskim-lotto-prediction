import { AdminLogs } from './AdminLogs'

/**
 * 운영자 수집 이력 화면.
 *
 * ⚠ `metadata` 를 여기서 export 하지 않는다. 상위 `admin/layout.tsx` 의
 *   `robots: noindex, nofollow` 가 덮이기 때문이다 — 이 화면이 검색에 노출되면 안 된다.
 *
 * ⚠ 데이터는 **브라우저에서** 받는다. 서버 컴포넌트로 받으면 인증 쿠키를 서버가 대신
 *   들고 가야 하고, 그 응답이 캐시되면 다른 요청이 남의 세션 결과를 볼 수 있다.
 *   운영자 한 사람이 보는 화면이라 SEO·초기 렌더 속도를 맞바꿀 이유가 없다.
 */
export default function AdminLogsPage() {
  return <AdminLogs />
}
