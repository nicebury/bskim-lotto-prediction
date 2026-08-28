"use client";

import { useCallback, useRef, useState } from "react";

import { ballRange } from "@/lib/lotto";

/** 번호는 1~45 고정. 인덱스 계산에 반복해서 쓰인다. */
const TOTAL = 45;

/**
 * 번호 출현 빈도 막대차트 (1~45).
 *
 * ⚠ 여기서 **집계하지 않는다.** 서버가 준 counts 를 그리기만 한다. 유일한 산술은 막대의
 *   픽셀 높이 비율과, 포인터 x 좌표를 번호로 바꾸는 나눗셈이다
 *   (→ docs/wiki/10-contracts/component-boundaries.md).
 *
 * 어느 모드든 **막대를 가리키면 그 번호가 몇 회 나왔는지 위쪽 readout 에 표시된다.**
 * 데스크톱은 호버, 모바일은 탭, 키보드는 좌우 방향키다.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * **차트는 항상 컨테이너 폭에 맞춘다. 가로 스크롤을 만들지 않는다.**
 *
 * 종전에는 통계 상세에서 45개를 1168px 로 넓게 펼쳐 자기 컨테이너에서 가로 스크롤하게
 * 했다(막대당 24px 를 확보해 터치 타겟을 만족시키려던 것이다). 그 대가가 컸다.
 *   ① **readout 이 함께 흘러가 버린다.** 오른쪽 끝 45번을 보려고 스크롤하면 "몇 번 ·
 *      몇 회" 를 알려 주는 줄이 왼쪽으로 사라져, 정작 무엇을 짚었는지 알 수 없었다
 *      (사용자 지적).
 *   ② 카드 밖으로 넘쳐 화면이 밀린다.
 *   ③ 아래 눈금(1·10·20·30·40·45)이 실제 막대 위치와 어긋난다.
 *
 * 그래서 폭을 맞추고, 막대 하나하나를 컨트롤로 두는 대신 **차트 전체를 하나의 조작면**
 * 으로 만든다. 포인터 x 좌표를 45등분해 가장 가까운 번호를 고른다 — 조작 대상이 전폭짜리
 * 하나뿐이라 WCAG 2.5.8(터치 타겟 24×24)을 지키면서 호버·탭이 모두 동작한다. 차트
 * 툴팁의 표준 패턴이기도 하다.
 *
 * ⚠ 막대에는 `pointer-events: none` 이 걸려 있어야 좌표가 항상 컨테이너에 잡힌다
 *   (components.css `.bar-chart`). 이걸 빼면 막대 사이 gap 에서만 이벤트가 온다.
 * ⚠ 막대를 다시 <button> 45개로 되돌리지 않는다. 폭에 맞춘 막대는 6~24px 이라 터치
 *   타겟을 만족할 수 없고, 넓히면 위 세 문제가 그대로 돌아온다.
 *
 * 막대 색은 그 번호의 동행복권 공식 5구간 색을 따라 어느 번호대인지 색으로도 읽힌다.
 */
export function FrequencyChart({
  counts,
}: {
  /** 번호(문자열) → 출현 횟수. 서버가 준 그대로. */
  counts: Record<string, number>;
}) {
  const [active, setActive] = useState<number | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const numbers = Array.from({ length: TOTAL }, (_, i) => i + 1);
  const values = numbers.map((n) => counts[String(n)] ?? 0);
  const peak = Math.max(1, ...values);
  const peakNumber = numbers[values.indexOf(peak)];

  const activeValue = active !== null ? (counts[String(active)] ?? 0) : null;

  /**
   * 포인터 x 좌표 → 번호.
   *
   * 막대 폭이 아니라 **차트 전체 폭을 45등분**해서 고른다. gap 까지 어느 한쪽 번호에
   * 귀속시켜야 손가락이 막대 사이에 떨어져도 아무 일도 안 일어나는 일이 없다.
   * 가장자리에서 0/46 이 나오지 않도록 양끝을 잘라 준다.
   */
  const pickAtX = useCallback((clientX: number) => {
    const el = chartRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0) return;
    const index = Math.floor(((clientX - rect.left) / rect.width) * TOTAL);
    setActive(Math.min(TOTAL, Math.max(1, index + 1)));
  }, []);

  /**
   * 마우스가 차트를 벗어나면 선택을 지운다.
   *
   * ⚠ 터치에서는 지우지 않는다. 손가락을 떼는 순간 `pointerleave` 가 오는데, 여기서
   *   지우면 **탭한 결과가 보이기도 전에 사라진다.** 터치 사용자는 다른 막대를 다시
   *   눌러 바꾼다.
   */
  const clearIfMouse = useCallback((pointerType: string) => {
    if (pointerType === "mouse") setActive(null);
  }, []);

  /** 좌우 방향키로 번호를 옮긴다. Home/End 는 양끝. 선택이 없으면 1번부터 시작한다. */
  const moveByKey = useCallback((key: string) => {
    const delta = key === "ArrowRight" ? 1 : key === "ArrowLeft" ? -1 : 0;
    if (delta === 0 && key !== "Home" && key !== "End") return false;
    setActive((prev) => {
      if (key === "Home") return 1;
      if (key === "End") return TOTAL;
      if (prev === null) return delta > 0 ? 1 : TOTAL;
      return Math.min(TOTAL, Math.max(1, prev + delta));
    });
    return true;
  }, []);

  /**
   * 조작면의 접근성 이름.
   * 막대 45개를 하나씩 읽히면 방해만 되므로, 무엇인지와 **어떻게 조작하는지**를 한 번에 준다.
   * 값 자체는 readout 이 `aria-live` 로 알려 준다.
   */
  const chartLabel =
    `1번부터 45번까지 출현 빈도 막대그래프. 가장 많이 나온 번호는 ${peakNumber}번 ${peak}회입니다. ` +
    `좌우 방향키로 번호를 옮기면 각 번호의 출현 횟수를 확인할 수 있습니다.`;

  const bars = numbers.map((n, index) => {
    const value = values[index];
    // 막대는 그림이다. 포인터는 부모가 받는다(위 주석 참조).
    return (
      <div
        key={n}
        className={`bar bar-range-${ballRange(n)}${n === active ? " is-active" : ""}`}
        style={{ height: `${Math.max(4, (value / peak) * 100)}%` }}
      />
    );
  });

  /*
   * 아래 눈금.
   *
   * ⚠ `justify-content: space-between` 으로 여섯 개를 흩뿌리면 **막대 위치와 어긋난다** —
   *   10번 막대의 중심은 전체 폭의 (10-0.5)/45 = 21.1% 지점인데 space-between 은 20%
   *   자리에 놓고, 라벨마다 글자 폭이 달라 더 밀린다(사용자 지적: "10번째 Bar 밑에 10이
   *   있어야 하는데 엉뚱한 데 있다"). 막대와 **같은 45열 격자**에 얹어 칸을 맞춘다.
   */
  const ticks = [1, 10, 20, 30, 40, 45];

  return (
    <div className="freq-chart">
      {/* 선택된 막대 정보 — 차트 **위에** 고정한다. 스크롤 컨테이너 안에 두면 오른쪽
          끝을 볼 때 이 줄이 흘러가 버린다. aria-live 라 키보드로 옮길 때도 읽힌다.
          min-height 로 자리를 예약해 값이 바뀌어도 레이아웃이 밀리지 않는다(CLS). */}
      <div className="freq-readout" aria-live="polite">
        {active !== null ? (
          <>
            <span
              className={`freq-readout-ball ball-range-${ballRange(active)}`}
            >
              {active}
            </span>
            <strong>{active}번</strong>
            <span className="muted">{activeValue}회 나왔어요</span>
          </>
        ) : (
          <span className="muted">막대에 마우스를 올리거나 눌러 보세요</span>
        )}
      </div>

      <div
        ref={chartRef}
        className="bar-chart"
        role="group"
        aria-label={chartLabel}
        tabIndex={0}
        onPointerMove={(e) => pickAtX(e.clientX)}
        onPointerDown={(e) => pickAtX(e.clientX)}
        onPointerLeave={(e) => clearIfMouse(e.pointerType)}
        onKeyDown={(e) => {
          // 방향키가 페이지를 스크롤하지 않게 막는다. 그 외 키는 그대로 흘려보낸다.
          if (moveByKey(e.key)) e.preventDefault();
        }}
      >
        {bars}
      </div>

      <p className="chart-axis" aria-hidden="true">
        {ticks.map((n) => (
          <span key={n} style={{ gridColumn: n }}>
            {n}
          </span>
        ))}
      </p>
    </div>
  );
}
