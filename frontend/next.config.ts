// ⚠ 이 두 줄은 반드시 다른 import 보다 먼저 실행되어야 한다.
//
// Next.js 가 자동 로드하는 env 파일명은 .env / .env.local / .env.development[.local] /
// .env.production[.local] 네 가지로 고정돼 있고 설정으로 바꿀 수 없다. 우리 규약의
// `.env_frontend` 는 경고도 에러도 없이 그냥 무시된다 — 모든 변수가 undefined 가 되고
// 화면에만 값이 비어 보인다. next.config.ts 는 dev·build 양쪽에서 가장 먼저 평가되므로
// 여기서 process.env 를 채우면 NEXT_PUBLIC_* 인라인 치환과 서버 컴포넌트의 process.env
// 조회가 모두 정상 동작한다.  → docs/wiki/10-contracts/env-vars.md
import { config } from 'dotenv'
config({ path: '.env_frontend' })

import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // 뉴스 썸네일은 외부 언론사 도메인에서 온다. 도메인을 미리 알 수 없어
  // next/image 최적화 대신 일반 <img> 를 쓰고 aspect-ratio 로 CLS 를 막는다.
  // (→ docs/wiki/20-design/responsive-rules.md CLS 방지)
  images: { unoptimized: true },

  // 빌드 산출물에 서버 정보를 흘리지 않는다.
  poweredByHeader: false,

  /*
   * 메타데이터를 **스트리밍하지 않고 항상 `<head>` 안에서 확정**한다.
   *
   * Next 15.2 부터 metadata 는 기본이 스트리밍이다 — 셸(`<head>`)을 먼저 흘려보내고
   * `<meta>` 는 나중에 스트림 뒤쪽, 즉 **`<body>` 안**에 꽂는다. 이 목록에 걸린 UA 에게만
   * 예전처럼 `<head>` 를 채운 뒤 응답한다. 기본 목록은 JS 를 실행하지 않는 봇들(Bingbot·
   * Slackbot·Twitterbot·Yeti 등)이고 **Googlebot 은 일부러 빠져 있다**(JS 를 실행하므로).
   *
   * 그런데 우리 사이트에서 dynamic 인 라우트는 `/news` 하나이고, 거기서 실측한 결과
   * `<meta name="description">` 이 **JS 실행 후에도 `<body>` 에 그대로 남았다**(2026-08-21).
   * meta 는 `<head>` 안에 있어야 하는 태그이고, Lighthouse SEO 도 이걸 근거로 /news 만
   * 91점을 줬다(나머지 정적 라우트는 100점). 완료 기준이 SEO 100 이라 맞춰야 한다.
   *
   * 모든 UA 를 목록에 넣어 스트리밍을 끄는 대가는 **사실상 없다.** 스트리밍 메타데이터는
   * `generateMetadata` 가 느릴 때를 위한 최적화인데, 우리 메타데이터는 전부 정적 객체이거나
   * 이미 받아 둔 값으로 만든다. 나머지 라우트는 빌드 때 미리 렌더되므로 영향 자체가 없다.
   * ⚠ 앞으로 `generateMetadata` 안에서 느린 조회를 하면 그만큼 첫 바이트가 늦어진다.
   *   그럴 일이 생기면 이 설정이 아니라 그 조회를 고친다.
   */
  htmlLimitedBots: /.*/,

  // 산출물 디렉토리. 기본은 `.next` 이고 평소에는 이 값을 건드리지 않는다.
  //
  // ⚠ 이 탈출구가 필요한 이유: `next dev` 는 떠 있는 동안 `.next` 를 계속 다시 쓴다.
  // 개발 서버를 켜 둔 채로 `next build && next start` 를 하면, 빌드된 프로덕션 산출물이
  // dev 의 산출물로 덮여 `next start` 가 **개발용 청크를 서빙한다**(`main-app.js?v=…`).
  // 에러가 나지 않아 알아채기 어렵고, 그 상태로 Lighthouse 를 돌리면 번들 크기·LCP·TBT 가
  // 전부 무의미한 값이 된다. 실측할 때는 `NEXT_DIST_DIR=.next-prod` 로 산출물을 갈라 둔다.
  //   NEXT_DIST_DIR=.next-prod npx next build
  //   NEXT_DIST_DIR=.next-prod npx next start -p 3100
  //
  // ⚠ 부작용 하나: Next 는 빌드할 때마다 `next-env.d.ts` 의 참조 경로를 현재 distDir 로
  //   다시 쓴다. 실측이 끝나면 `git checkout -- next-env.d.ts` 로 되돌린다. 안 되돌리면
  //   사라진 `.next-prod/types/...` 를 가리켜 `tsc --noEmit` 이 깨진다. 절차는 README 참조.
  distDir: process.env.NEXT_DIST_DIR || '.next',

  /*
   * ⚠ **WSL 에서 `/mnt/d` 의 파일 변경은 개발 서버가 감지하지 못한다.**
   *
   * 2026-09-08 에 실제로 사고가 났다. 개발 서버가 9월 2일에 뜬 뒤 **엿새 동안 그날의
   * 화면을 계속 서빙**했고, 그 사이 고친 것이 하나도 반영되지 않았다. 에러도 경고도 나지
   * 않아 "구현이 안 되어 있다" 로 보였다.
   *
   * 원인은 Next 도 우리 코드도 아니다. 윈도우 드라이브를 WSL 이 9P/DrvFs 로 마운트하는데,
   * 그 파일시스템은 리눅스의 `inotify` 이벤트를 **올려 보내지 않는다.** webpack 은 변경
   * 통지를 기다리다 아무것도 못 받고 그대로 앉아 있게 된다.
   *
   * 그래서 통지를 기다리는 대신 **주기적으로 직접 확인**하게 한다(폴링). 1초 간격이면
   * 저장하고 화면을 보는 사이에 반영되고, CPU 부담도 눈에 띄지 않는다.
   *
   * ⚠ **개발에서만 켠다.** 빌드는 한 번 훑고 끝나므로 감시가 필요 없다.
   * ⚠ `aggregateTimeout` 은 여러 파일을 잇달아 저장할 때 재빌드를 한 번으로 묶는 시간이다.
   *   없으면 저장할 때마다 컴파일이 겹쳐 돈다.
   * ⚠ Turbopack(`next dev --turbopack`)으로 바꾸면 **이 설정은 무시된다.** 그때는 같은
   *   증상이 다시 나므로 Turbopack 쪽 감시 옵션을 따로 찾아야 한다.
   */
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        poll: 1000,
        aggregateTimeout: 300,
        ignored: ['**/node_modules', '**/.next', '**/.next-prod', '**/.git'],
      }
    }
    return config
  },
}

export default nextConfig
