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
 * ⚠ **썸네일이 게임마다 다르다**(2026-09-10). 그전에는 서비스 아이콘(별·6/45 …)을 돌려
 *   썼는데, 색은 구분돼도 **"오리 사격장" 옆의 별이 게임 내용을 가리키지 않았다.**
 *   목록에서 무엇을 고르는지 알 수 없다는 뜻이라 각 게임을 알아볼 수 있는 그림으로 바꿨다
 *   (→ `GameThumb`).
 */
export function GameGrid() {
  return (
    <ul className="pg-grid">
      {GAMES.map((game) => (
        <li key={game.slug}>
          <Link className="pg-card" href={`/playground/${game.slug}`} data-accent={game.accent}>
            {/*
              ⚠ 썸네일이 카드 **위쪽 전체**를 쓴다. 옆에 붙은 작은 아이콘으로는 무슨
                게임인지 알아볼 수 없다 — 그림이 제목만큼 자리를 가져야 한다.
            */}
            <span className="pg-card-thumb" data-accent={game.accent}>
              <GameThumb slug={game.slug} />
            </span>

            <span className="pg-card-body">
              <span className="pg-card-title">{game.title}</span>
              <span className="pg-card-tagline">{game.tagline}</span>
              {/*
                ⚠ 걸리는 시간을 밝힌다. 고르기 전에 "얼마나 붙잡힐지" 를 알아야 한다.
                  `paceSeconds` 는 6개를 다 모으는 목표 시간이다(사양서 기준).
              */}
              <span className="pg-card-pace">약 {game.paceSeconds}초</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
