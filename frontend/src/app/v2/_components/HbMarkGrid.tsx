/**
 * 45칸 마킹 격자 — 이 시안의 시그니처.
 *
 * **서버 컴포넌트다.** 45칸과 당첨 마킹이 HTML 에 그대로 들어가야 JS 를 끈 상태에서도
 * 최신 당첨번호가 보인다. 스크롤 전환은 이 위에 얹히는 장식이지 정보 전달 수단이 아니다
 * (→ docs/wiki/20-design/accessibility.md).
 *
 * 배치는 10열 × 5행이고 **행이 곧 볼 공식 5구간**이다. 색-구간 매핑이 레이아웃으로
 * 드러나므로 범례가 필요 없고, 행 왼쪽 라벨(`1–10`)이 색 단독 전달을 막는다.
 *
 * ⚠ 셀을 절대 클릭 가능하게 만들지 않는다. 375px 폭에서 셀은 약 28px 라 터치 타겟
 *   44×44px 규칙을 지킬 수 없다(→ 20-design/responsive-rules.md). 번호별 이동이
 *   필요해지면 격자 밖에 별도 링크 목록을 둔다.
 */
import { Fragment } from 'react'

import type { HbRow } from '../_lib/grid'

interface Props {
  rows: HbRow[]
  /** 격자 전체를 대신 읽히는 문구. → _lib/grid.ts gridAriaLabel */
  ariaLabel: string
}

export function HbMarkGrid({ rows, ariaLabel }: Props) {
  return (
    /*
      45개 칸을 하나씩 읽히면 소음이라 role="img" 로 묶어 한 문장으로 전달한다.
      role="img" 안쪽은 접근성 트리에서 무시되므로 자식에 aria-hidden 을 또 붙이지 않는다.
      당첨번호 자체는 격자 옆의 볼 목록이 텍스트로 제공한다.
    */
    <div className="hb-grid" role="img" aria-label={ariaLabel}>
      {rows.map((row) => (
        <Fragment key={row.range}>
          <span className="hb-grid-label">{row.label}</span>
          {row.cells.map((cell) => (
            <span
              key={cell.n}
              className="hb-cell"
              data-range={cell.range}
              /*
                값이 없는 속성으로 둔다(`data-win`). CSS 는 `[data-win]` 존재만 보면 되고,
                React 는 undefined 인 속성을 렌더링하지 않으므로 HTML 이 깔끔하다.
              */
              data-win={cell.win ? '' : undefined}
              data-bonus={cell.bonus ? '' : undefined}
              // 0~1 정규화된 히트 강도. 서버가 계산해 박는다(브라우저는 집계하지 않는다).
              style={{ '--hb-heat': cell.heat } as React.CSSProperties}
            >
              <span className="hb-cell-heat" />
              <span className="hb-cell-num">{cell.n}</span>
            </span>
          ))}
        </Fragment>
      ))}
    </div>
  )
}
