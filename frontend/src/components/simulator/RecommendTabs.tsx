'use client'

import { useId, useRef, useState } from 'react'

/**
 * 추천 방식 두 갈래를 **탭으로 나란히** 놓는다.
 *
 * ── 왜 탭인가 ──────────────────────────────────────────────────────
 * 처음에는 위아래로 쌓고 "메인 / 서브 시뮬레이터" 라고 이름 붙였다. 두 가지가 잘못됐다.
 *
 *   ① **아래 것이 묻힌다.** 위 도구를 쓰고 나면 스크롤을 더 내릴 이유가 없어 아래에
 *      다른 방식이 있다는 것을 모른다(사용자 지적).
 *   ② **'메인 / 서브' 는 우리 사정이다.** 사용자에게는 "무엇이 다른가" 가 알고 싶은
 *      것이지 어느 쪽이 주력인지가 아니다.
 *
 * 그래서 **이름이 차이를 말하게** 바꿨다 — `AI 번호추천`(여러 분석을 종합하고 가상 추첨까지
 * 돌린다)과 `6가지 추천`(한 가지 기준으로 바로 뽑는다). 탭으로 나란히 두면 둘 다 있다는
 * 것이 첫 화면에서 보인다.
 *
 * ⚠ 뒤쪽 이름은 처음에 `기준별 추천` 이었다. 2026-09-01 에 **몇 가지인지를 이름에 넣어**
 *   `6가지 추천` 으로 바꿨다 — 고르기 전에 규모를 알 수 있고, 옆 탭의 `7단계 분석` 배지와
 *   짝이 맞는다.
 *
 * ── ⚠ 접근성: WAI-ARIA 탭 패턴을 지킨다 ────────────────────────────
 * `role="tablist"` · `role="tab"`(+`aria-selected`·`aria-controls`) · `role="tabpanel"`
 * (+`aria-labelledby`). **좌우 화살표로 탭을 옮길 수 있어야 한다** — 탭은 Tab 키로
 * 하나씩 도는 것이 아니라 화살표로 고르고 Tab 으로 패널에 들어가는 것이 표준이다.
 * 그래서 선택되지 않은 탭은 `tabIndex={-1}` 이다(로빙 tabindex).
 *
 * ── ⚠ 숨긴 패널도 DOM 에 남긴다 ────────────────────────────────────
 * `hidden` 으로 감출 뿐 마운트를 풀지 않는다. 언마운트하면 탭을 오갈 때마다 그 안의
 * 추천 결과가 사라져, 두 방식을 **견주어 보려는 사용자**가 매번 다시 뽑아야 한다.
 *
 * ⚠ 각 방식의 **설명 본문도 패널 안에 함께 들어간다**(2026-09-01). 종전에는 탭 밖 하단에
 *   둘 다 늘 떠 있어, 어느 탭을 고르든 **관계없는 설명이 절반**이었다. 지금은 고른 쪽
 *   설명만 보인다.
 *
 *   ⚠ 그래도 **마운트를 풀지 않는 것이 중요해졌다.** 이 설명들은 페이지의 고유 본문이라
 *     검색엔진이 읽어야 한다([[metadata-strategy]]). `hidden` 은 DOM 에 남으므로 읽히고,
 *     언마운트하면 사라진다. 위 '숨긴 패널도 DOM 에 남긴다' 규칙이 SEO 근거를 하나 더
 *     갖게 된 셈이다.
 */
export interface RecommendTab {
  key: string
  label: string
  /** 탭 아래 한 줄. **무엇이 다른지**를 여기서 말한다. */
  hint: string
  /** 라벨 옆 작은 배지. 걸리는 시간처럼 고르는 데 필요한 사실을 적는다. */
  badge: string
  panel: React.ReactNode
}

export function RecommendTabs({ tabs }: { tabs: RecommendTab[] }) {
  const [active, setActive] = useState(0)
  const baseId = useId()
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  /** 화살표로 탭을 옮긴다. 끝에서 반대편으로 감는다 — 막다른 끝을 만들지 않는다. */
  const onKeyDown = (event: React.KeyboardEvent) => {
    const map: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      Home: -active,
      End: tabs.length - 1 - active,
    }
    const move = map[event.key]
    if (move === undefined) return
    event.preventDefault()
    const next = (active + move + tabs.length) % tabs.length
    setActive(next)
    refs.current[next]?.focus()
  }

  return (
    <div className="reco-tabs">
      <div className="reco-tablist" role="tablist" aria-label="추천 방식 선택">
        {tabs.map((tab, i) => (
          <button
            key={tab.key}
            ref={(node) => {
              refs.current[i] = node
            }}
            type="button"
            role="tab"
            id={`${baseId}-tab-${i}`}
            aria-controls={`${baseId}-panel-${i}`}
            aria-selected={i === active}
            // 로빙 tabindex — 선택된 탭만 Tab 순서에 든다(ARIA 탭 패턴).
            tabIndex={i === active ? 0 : -1}
            className="reco-tab"
            data-active={i === active ? '' : undefined}
            onClick={() => setActive(i)}
            onKeyDown={onKeyDown}
          >
            <span className="reco-tab-label">{tab.label}</span>
            <span className="reco-tab-badge">{tab.badge}</span>
          </button>
        ))}
      </div>

      {/* 고른 탭이 무엇을 하는지 한 줄. 탭 라벨만으로는 차이가 다 전달되지 않는다. */}
      <p className="reco-tab-hint">{tabs[active].hint}</p>

      {tabs.map((tab, i) => (
        <div
          key={tab.key}
          role="tabpanel"
          id={`${baseId}-panel-${i}`}
          aria-labelledby={`${baseId}-tab-${i}`}
          hidden={i !== active}
          /*
            ⚠ 패널 자체가 포커스를 받아야 한다. 탭에서 Tab 을 누르면 패널 안으로 들어가는
              것이 표준 동작이고, 그러려면 패널이 tab 순서에 있어야 한다.
          */
          tabIndex={0}
        >
          {tab.panel}
        </div>
      ))}
    </div>
  )
}
