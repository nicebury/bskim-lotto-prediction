'use client'

import Link from 'next/link'

import { LottoBall } from '@/components/LottoBall'
import { NumberActions } from '@/components/NumberActions'
import type { GameMeta } from '@/games/core/types'
import { DISCLAIMER } from '@/lib/site'

/**
 * 결과 패널 — 번호 6개를 다 모았을 때.
 *
 * ── ⚠ 모달이 아니다 ────────────────────────────────────────────────
 * 캔버스 **아래에 펼쳐진다.** 모달은 포커스 트랩과 캔버스가 얽히고, 스크롤·스크린샷 공유를
 * 방해한다(→ docs/wiki/20-design/playground.md).
 *
 * ── ⚠ `NumberActions` 를 그대로 쓴다 ───────────────────────────────
 * 분석·복사·저장·공유 네 버튼이 이미 구현돼 있다. "분석" 은 내부에서 `analyzeHref()` →
 * `/api/lotto/analyze` 로 간다 — **놀이터가 백엔드에 닿는 유일한 지점이고 새 코드가 0줄이다.**
 * 여기서 비슷한 것을 새로 만들면 네 화면의 공유 문구·저장 이미지가 갈라진다.
 */
export function GameResult({
  meta,
  numbers,
  onRestart,
}: {
  meta: GameMeta
  numbers: number[]
  onRestart: () => void
}) {
  /** 획득 순서가 아니라 오름차순. 사이트의 다른 화면과 같다. */
  const sorted = [...numbers].sort((a, b) => a - b)

  return (
    <section className="pg-result" aria-labelledby="pg-result-title">
      <h2 id="pg-result-title">번호 6개를 모았어요</h2>

      <ul className="pg-result-balls">
        {sorted.map((n) => (
          <li key={n}>
            <LottoBall number={n} />
          </li>
        ))}
      </ul>

      <NumberActions
        numbers={sorted}
        /* 공유 문구·저장 이미지 제목·`aria-label` 에 함께 쓰인다. */
        strategyLabel={`번호놀이터 · ${meta.title}`}
        subtitle="게임으로 모은 재미용 번호"
        /* ★ 공유 링크가 **이 게임으로** 돌아온다. 받은 사람이 같은 놀이를 할 수 있다. */
        sourcePath={`/playground/${meta.slug}`}
      />

      <p className="disclaimer">
        <span className="disclaimer-icon" aria-hidden="true">
          ⓘ
        </span>
        <span>{DISCLAIMER.playground}</span>
      </p>

      <div className="pg-result-actions">
        <button type="button" className="btn btn-primary" onClick={onRestart}>
          다시하기
        </button>
        <Link className="btn btn-secondary" href="/playground">
          다른 게임 보기
        </Link>
      </div>
    </section>
  )
}
