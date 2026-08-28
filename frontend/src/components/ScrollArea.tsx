'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * 가로로 스크롤되는 영역의 공용 껍데기.
 *
 * ⚠ 이 컴포넌트가 있는 첫째 이유는 **키보드 접근**이다. `overflow-x: auto` 컨테이너 안에
 *   포커스 받을 요소가 하나도 없으면(표·차트가 딱 그렇다) 키보드만 쓰는 사용자는 그 영역을
 *   **좌우로 움직일 방법이 아예 없다.** 화면에는 멀쩡히 보이는데 잘린 열을 영영 볼 수 없다 —
 *   axe `scrollable-region-focusable` 이 이것을 잡는다(2026-08-21 실측: 표 7곳 + 차트 1곳).
 *
 *   `tabIndex={0}` 하나면 규칙은 통과하지만 그러면 이름 없는 상자에 포커스가 떨어진다.
 *   그래서 `role="region"` 과 `label` 을 함께 요구한다 — `label` 을 선택항목으로 두지
 *   않은 것도 그래서다.
 *
 * ⚠ 둘째 이유는 **더 있다는 신호**다(2026-08-27 추가). 잘려 있다는 것을 모르면 스크롤할
 *   생각 자체를 하지 않는다. 번호추천 화면의 기준 선택에서 이미 같은 지적을 받았고
 *   ("그냥 보면 메뉴 3개만 있는 것처럼 보여"), 거기서 쓴 신호 셋을 그대로 가져왔다.
 *     ① 가장자리 페이드 — 내용이 이어진다
 *     ② 좌우 화살표 — 더 있다 + **실제로 옮기는 수단**(PC 에서 특히 중요하다. 마우스
 *        휠로는 가로 스크롤이 안 되므로 화살표가 없으면 사실상 못 본다)
 *     ③ 안내 문구 — 화살표를 못 알아보는 사용자를 위해
 *
 * ⚠ 표·차트에는 배경 그림자 기법(`background-attachment: local`)을 **쓸 수 없다.**
 *   표의 행과 차트 막대가 불투명해서 컨테이너 배경을 완전히 가리기 때문이다. 알약 트랙처럼
 *   내용이 비치는 곳(`.tabs`)에만 그 기법이 통한다.
 *
 * ⚠ 페이드와 화살표는 **스크롤 컨테이너 바깥 래퍼**에 건다. 스크롤되는 요소 안에 absolute
 *   로 두면 내용과 함께 흘러가 가장자리에 머물지 못한다(실제로 한 번 겪었다).
 *
 * ⚠ 새로 `overflow-x: auto` 컨테이너를 만들 때는 <div> 대신 이걸 쓴다. 안에 버튼처럼
 *   포커스 받는 요소가 이미 있다면(예: 45개 막대차트) 접근성 목적으로는 필요 없지만,
 *   신호가 필요하면 여전히 쓸 수 있다.
 */
export function ScrollArea({
  className,
  label,
  hint = '옆으로 밀면 더 볼 수 있어요',
  children,
}: {
  /** 스크롤 동작 외의 모양을 정하는 클래스. 예: `table-scroll`, `hist`. */
  className: string
  /** 이 영역이 무엇인지. 스크린리더가 읽는다. */
  label: string
  /** 안내 문구. 넘칠 때만 보인다. `null` 이면 문구를 두지 않는다. */
  hint?: string | null
  children: React.ReactNode
}) {
  const viewport = useRef<HTMLDivElement>(null)
  const [canLeft, setCanLeft] = useState(false)
  const [canRight, setCanRight] = useState(false)

  // 양쪽 끝에 닿았는지 다시 계산한다. 1px 여유는 소수점 스크롤 위치 때문이다 —
  // 끝까지 밀어도 scrollLeft 가 딱 떨어지지 않아 화살표가 남는 일이 있다.
  const sync = useCallback(() => {
    const el = viewport.current
    if (!el) return
    setCanLeft(el.scrollLeft > 1)
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  }, [])

  useEffect(() => {
    const el = viewport.current
    if (!el) return
    sync()

    /*
      ⚠ 마운트 직후 한 번으로는 부족하다. 폰트가 늦게 붙거나 창 폭이 바뀌면 넘침 여부가
        달라진다. ResizeObserver 로 컨테이너와 내용 양쪽을 본다 — 내용만 보면 창 축소를,
        컨테이너만 보면 내용 증가를 놓친다.
    */
    const observer = new ResizeObserver(sync)
    observer.observe(el)
    if (el.firstElementChild) observer.observe(el.firstElementChild)
    return () => observer.disconnect()
  }, [sync])

  /** 보이는 폭의 80% 만큼 옮긴다. 100% 로 옮기면 경계의 열이 통째로 건너뛰어 맥이 끊긴다. */
  const nudge = (direction: 1 | -1) => {
    const el = viewport.current
    if (!el) return
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: 'smooth' })
  }

  const overflowing = canLeft || canRight

  return (
    <div
      className="scroll-area"
      data-more-left={canLeft ? '' : undefined}
      data-more-right={canRight ? '' : undefined}
    >
      {/*
        ⚠ 안내 문구는 스크롤 영역 **위**에 둔다. 아래에 두었더니 회차 표처럼 세로로 긴
          표에서는 문구가 8,000px 아래에 놓여 아무도 보지 못했다. 위에 있어야 표를 만나는
          순간 읽힌다.
        ⚠ 넘칠 때만 보이게 하되 자리는 항상 차지한다. 넘침 여부는 마운트 뒤에 정해지므로
          없다가 생기면 아래 내용이 밀린다(CLS). 기준 선택에서 이미 겪은 문제다.
      */}
      {hint !== null && (
        <p className="scroll-area-hint" data-show={overflowing ? '' : undefined}>
          <Chevron direction="right" />
          {hint}
        </p>
      )}

      {/*
        화살표는 **뷰포트에 붙어 다녀야 한다.** `.scroll-area` 자체에 top:50% 로 붙이면
        영역 높이의 한가운데에 놓이는데, 긴 표에서는 그 지점이 화면 밖이라 화살표를 볼 수
        없다. 그래서 영역 전체를 덮는 레일을 두고 그 안에서 sticky 로 세워 둔다 —
        레일이 화면에 걸쳐 있는 동안 화살표는 늘 화면 중앙 높이에 머문다.

        ⚠ 레일에 `aria-hidden` 을 걸지 않는다. 조상에 걸면 안의 버튼도 함께 숨겨지고
          (자손이 되돌릴 수 없다), 포커스는 받는데 이름이 없는 버튼이 되어 axe
          `aria-hidden-focus` 에 걸린다. 레일은 클릭만 통과시킨다.
      */}
      {(canLeft || canRight) && (
        <div className="scroll-area-rail">
          {canLeft && (
            <button
              type="button"
              className="scroll-area-nav is-prev"
              onClick={() => nudge(-1)}
              aria-label={`${label} 왼쪽으로 이동`}
            >
              <Chevron direction="left" />
            </button>
          )}
          {/* 왼쪽 버튼이 없을 때도 오른쪽은 오른쪽 끝에 붙어야 한다. */}
          {canRight && (
            <button
              type="button"
              className="scroll-area-nav is-next"
              onClick={() => nudge(1)}
              aria-label={`${label} 오른쪽으로 이동`}
            >
              <Chevron direction="right" />
            </button>
          )}
        </div>
      )}

      <div
        ref={viewport}
        className={className}
        role="region"
        aria-label={label}
        tabIndex={0}
        onScroll={sync}
      >
        {children}
      </div>
    </div>
  )
}

function Chevron({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={direction === 'left' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} />
    </svg>
  )
}
