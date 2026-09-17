import type { GameModule, GameSlug } from './types'

/**
 * slug → 게임 모듈 동적 로더.
 *
 * → docs/wiki/10-contracts/playground-game-contract.md "파일 소유 경계" 절
 *
 * ── ⚠ 여섯 줄을 손으로 적는 이유 ───────────────────────────────────
 * **변수 경로 `import()` 는 코드 스플리팅이 되지 않는다.** `import(\`@/games/${slug}\`)` 로
 * 쓰면 번들러가 대상을 특정하지 못해 여섯 게임을 **전부** 한 청크에 넣거나, 최악의 경우
 * 목록 페이지까지 딸려 들어간다. 정적 문자열이라야 slug 당 별도 청크가 된다.
 *
 * ⚠ 이 파일은 **클라이언트에서만** import 한다. 목록 페이지(서버 컴포넌트)는 `catalog.ts`
 *   만 읽는다 — 그것이 데이터와 코드를 가른 이유다.
 *
 * ⚠ 여섯 항목을 **선행 단계에서 전부 채운 채로** 만든다. 스텁이라도 있어야 타입체크와
 *   빌드가 **항상 통과 상태**를 유지하고, 그래야 여섯 세션이 병렬로 착수할 수 있다.
 */
export const GAME_LOADERS: Record<GameSlug, () => Promise<{ default: GameModule }>> = {
  shooting: () => import('@/games/g01-shooting'),
  crane: () => import('@/games/g02-crane'),
  flyball: () => import('@/games/g03-flyball'),
  curling: () => import('@/games/g04-curling'),
  plinko: () => import('@/games/g05-plinko'),
  ringdash: () => import('@/games/g06-ringdash'),
}
