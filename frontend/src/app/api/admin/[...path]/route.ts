import type { NextRequest } from 'next/server'

import { API_BASE_URL } from '@/lib/env'

/**
 * 운영자 API 중계.
 *
 * ── ⚠ 왜 브라우저가 백엔드를 직접 부르지 않는가 ────────────────────
 * 관리자 인증은 **쿠키**로 한다(계약: `httpOnly` · `SameSite=Lax`). 그런데 브라우저가
 * 백엔드를 직접 부르면 프론트(:3000)와 백엔드(:8005)가 **다른 출처**라
 *
 *   ① `SameSite=Lax` 쿠키는 크로스 사이트 XHR 에 붙지 않는다 — 로그인은 되는데
 *      다음 요청부터 401 이 되고, 원인이 화면에 드러나지 않는다.
 *   ② 붙이려면 `SameSite=None; Secure` + CORS `allow_credentials` 가 필요한데,
 *      그것은 관리자 쿠키를 아무 사이트에서나 실어 보낼 수 있게 여는 일이다.
 *
 * 그래서 **프론트 서버가 중계한다.** 브라우저는 같은 출처(`/api/admin/*`)로만 말하고,
 * 백엔드 주소는 브라우저에 노출되지 않는다.
 *
 * ⚠ **프론트는 `ADMIN_TOKEN` 을 모른다.** 토큰은 로그인 요청 본문으로 지나갈 뿐이고,
 *   여기서 저장하거나 로그에 남기지 않는다. 인증의 주체는 백엔드다 — 두 곳이 각자
 *   인증하면 규칙이 갈라진다.
 *
 * ⚠ 응답의 `Set-Cookie` 를 **그대로 흘려보낸다.** 도메인이 프론트로 바뀌므로 브라우저는
 *   이 사이트의 쿠키로 저장하고, 다음 요청에 자동으로 붙는다.
 *
 * ⚠ 이 경로는 **절대 캐시하지 않는다.** 운영자 화면의 응답이 캐시되면 다른 요청이 남의
 *   세션 결과를 볼 수 있다.
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

/** 계약에 있는 것만 통과시킨다. 임의 경로를 백엔드로 넘기는 열린 프록시를 만들지 않는다. */
const ALLOWED: Record<string, 'GET' | 'POST'> = {
  login: 'POST',
  logout: 'POST',
  'job-logs': 'GET',
}

async function proxy(request: NextRequest, path: string[]) {
  const segment = path.join('/')
  const method = ALLOWED[segment]

  // 계약에 없는 경로·메서드는 백엔드에 닿기 전에 막는다.
  if (!method || method !== request.method) {
    return Response.json({ detail: '지원하지 않는 요청입니다.' }, { status: 404 })
  }

  const url = new URL(`${API_BASE_URL}/api/admin/${segment}`)
  request.nextUrl.searchParams.forEach((value, key) => url.searchParams.set(key, value))

  const headers = new Headers({ Accept: 'application/json' })
  // 세션 쿠키를 백엔드로 넘긴다. 그 밖의 헤더는 넘기지 않는다.
  const cookie = request.headers.get('cookie')
  if (cookie) headers.set('cookie', cookie)
  if (method === 'POST') headers.set('Content-Type', 'application/json')

  let upstream: Response
  try {
    upstream = await fetch(url, {
      method,
      headers,
      body: method === 'POST' ? await request.text() : undefined,
      cache: 'no-store',
    })
  } catch {
    // 백엔드가 꺼져 있다. 원인을 그대로 노출하지 않되 상태는 구분해 준다.
    return Response.json({ detail: '서버에 연결하지 못했습니다.' }, { status: 502 })
  }

  const body = await upstream.text()
  const out = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })

  /*
    ⚠ **204·304 는 본문을 가질 수 없다.** 빈 문자열이라도 실으면 `Response` 생성자가
      던지고, 프록시가 500 을 낸다 — 로그아웃(204)이 실제로 그렇게 깨졌다(실측).
      상태 코드만 그대로 흘려보낸다.
  */
  const noBody = upstream.status === 204 || upstream.status === 304

  /*
    ⚠ `Set-Cookie` 는 여러 개일 수 있다. `headers.get()` 은 그것을 쉼표로 이어 붙여
      **만료 날짜 안의 쉼표와 구분되지 않는다.** `getSetCookie()` 로 배열을 받는다.
  */
  for (const value of upstream.headers.getSetCookie()) out.append('set-cookie', value)

  return new Response(noBody ? null : body, { status: upstream.status, headers: out })
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(request, (await ctx.params).path)
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(request, (await ctx.params).path)
}
