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
}

export default nextConfig
