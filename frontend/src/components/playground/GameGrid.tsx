import Link from 'next/link'

import { GAMES } from '@/games/core/catalog'
import { GameThumb } from './GameThumb'

/**
 * 목록 페이지의 게임 6카드.
 *
 * ⚠ **서버 컴포넌트다.** `catalog.ts` 만 읽고 게임 구현을 import 하지 않는다 — 그것이
 *   `catalog`(데이터)와 `loaders`(코드)를 가른 이유다. 목록에 게임 여섯이 딸려 들어가면
 *   첫 화면이 여섯 배로 무거워진다(→ docs/wiki/20-design/playground.md).
 *
 * ── 2026-09-18 재설계 ──────────────────────────────────────────────
 * 사용자 지적: "세련되고 요즘 트렌드에 맞게, 흥미를 끌어서 게임을 하게끔". 종전 카드는
 * 옅은 파스텔 바탕에 선 그림 하나와 제목·설명·"약 60초" 였다. 셋을 바꿨다.
 *
 *   ① **그림을 키우고 입체감을 준다.** 그라디언트 바탕 + 빛무리 + 커서를 올리면 살짝 확대.
 *   ② **"약 60초" 를 뺀다**(사용자 요청). 고르기 전에 시간부터 재는 인상을 준다 —
 *      `paceSeconds` 는 상세 화면에 남아 있고, 여기서는 "해볼까?" 만 남긴다.
 *   ③ **첫 카드를 크게.** 여섯 장이 똑같은 크기로 늘어서면 어디부터 볼지 눈이 헤맨다.
 *
 * ⚠ 카탈로그(`catalog.ts`)는 고치지 않는다. 이 화면은 **보여 주는 방법**만 바꾼다 —
 *   게임 여섯의 데이터는 게임 세션이 소유한다.
 */
export function GameGrid() {
  return (
    <ul className="pg-grid">
      {GAMES.map((game, index) => (
        <li key={game.slug} className={index === 0 ? 'is-feature' : undefined}>
          <Link className="pg-card" href={`/playground/${game.slug}`} data-accent={game.accent}>
            {/*
              ⚠ 썸네일이 카드 **위쪽 전체**를 쓴다. 옆에 붙은 작은 아이콘으로는 무슨 게임인지
                알아볼 수 없다 — 그림이 제목만큼 자리를 가져야 한다.
            */}
            <span className="pg-card-thumb" data-accent={game.accent}>
              <GameThumb slug={game.slug} />
              {/* 재생 배지. 커서를 올리면 떠오른다 — 카드가 '들어가는 문' 임을 손이 먼저 안다. */}
              <span className="pg-card-play" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                  <path d="M8 5.5v13a1 1 0 0 0 1.52.85l10.4-6.5a1 1 0 0 0 0-1.7L9.52 4.65A1 1 0 0 0 8 5.5Z" />
                </svg>
              </span>
            </span>

            <span className="pg-card-body">
              <span className="pg-card-title">{game.title}</span>
              <span className="pg-card-tagline">{game.tagline}</span>
              <span className="pg-card-cta" aria-hidden="true">
                해보기 →
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
