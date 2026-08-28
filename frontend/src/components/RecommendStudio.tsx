"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { browserRecommend } from "@/lib/api";
import type { RecommendSet, RecommendStrategy } from "@/lib/api-types";
import { STRATEGIES, strategyMeta } from "@/lib/strategies";
import { traitRows, traitSentence, traitSummaryLine } from "@/lib/traits";
import { BulkActions } from "./BulkActions";
import { Card, EmptyState } from "./Card";
import { LottoBall } from "./LottoBall";
import { NumberActions } from "./NumberActions";
import { KeyValueList } from "./stats";

/**
 * 번호 추천 시뮬레이터.
 *
 * 초기 결과는 **서버가 렌더링해 넘긴다** — JS 를 끈 상태에서도 조합과 성향 설명이 보인다.
 * 전략을 바꾸거나 다시 생성할 때만 브라우저가 백엔드를 부른다.
 *
 * 생성 후 조합의 성향을 함께 보여준다. 단순 번호 출력이 아니라 "번호를 해석해주는 경험"이
 * 체류시간을 만든다(초안 10.1). 해석은 전부 **사실 서술**이다 — 확률·적중률을 말하지 않는다.
 */
/** 추천 개수 선택지. 계약이 허용하는 범위 그대로다(1~10). */
const SET_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export function RecommendStudio({
  initialStrategy,
  initialSets,
  initialHotWindow,
  disclaimer,
}: {
  initialStrategy: RecommendStrategy;
  initialSets: RecommendSet[];
  /** hot_count·cold_count 의 기준 회차 수. 데이터가 없으면 null. */
  initialHotWindow: number | null;
  /** 백엔드가 응답에 담아 준 면책 문구. 없으면 호출부가 폴백을 넘긴다. */
  disclaimer: string;
}) {
  const [strategy, setStrategy] = useState<RecommendStrategy>(initialStrategy);
  /**
   * 한 번에 만들 조합 수. 계약상 1~10 이다([[api-contract]]).
   * 서버가 처음 넘겨준 개수를 그대로 이어받아 화면과 값이 어긋나지 않게 한다.
   */
  const [count, setCount] = useState<number>(initialSets.length || 5);
  const [sets, setSets] = useState<RecommendSet[]>(initialSets);
  const [hotWindow, setHotWindow] = useState<number | null>(initialHotWindow);
  const [loading, setLoading] = useState(false);

  /*
   * 기준 줄에 옆으로 더 있다는 것을 알리기 위한 상태.
   *
   * ⚠ 페이드만으로는 부족했다 — "그냥 보면 메뉴 3개만 있는 것처럼 보인다"(사용자 지적).
   *   그래서 **좌우 화살표**를 함께 둔다. 화살표는 "여기 더 있다" 를 말할 뿐 아니라
   *   밀지 못하는 사용자(마우스만 쓰는 좁은 창)에게 실제 이동 수단이 된다.
   * ⚠ 넘치지 않을 때는 아예 렌더링하지 않는다. 640px 이상에서는 줄바꿈해 다 보이므로
   *   화살표가 나올 일이 없다. 비활성 화살표를 띄워 두면 "왜 안 눌리지" 가 된다.
   */
  const pickerRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const syncArrows = useCallback(() => {
    const el = pickerRef.current;
    if (!el) return;
    // 1px 여유 — 브라우저가 소수점 스크롤 위치를 주어 정확히 0/최대가 되지 않는다.
    setCanLeft(el.scrollLeft > 1);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const el = pickerRef.current;
    if (!el) return;
    syncArrows();
    el.addEventListener("scroll", syncArrows, { passive: true });
    // 화면 폭이 바뀌면 넘침 여부 자체가 달라진다(640px 에서 줄바꿈으로 전환).
    const ro = new ResizeObserver(syncArrows);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", syncArrows);
      ro.disconnect();
    };
  }, [syncArrows]);

  /** 보이는 폭의 80% 만큼 민다. 100% 를 밀면 경계의 칩을 건너뛴 것처럼 보인다. */
  const nudge = (dir: -1 | 1) => {
    const el = pickerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
  };
  const [error, setError] = useState<string | null>(null);

  const generate = async (
    next: RecommendStrategy,
    nextCount: number = count,
  ) => {
    setStrategy(next);
    setCount(nextCount);
    setLoading(true);
    setError(null);
    try {
      const result = await browserRecommend(next, nextCount);
      setSets(result.sets);
      setHotWindow(result.hot_window);
    } catch (err) {
      // 회차가 50개 미만이면 백엔드가 422 와 함께 사유를 준다. 그대로 보여준다.
      setError(
        err instanceof Error ? err.message : "번호를 생성하지 못했습니다.",
      );
      setSets([]);
    } finally {
      setLoading(false);
    }
  };

  const meta = strategyMeta(strategy);

  return (
    <div>
      {/*
        추천 기준 선택.

        ⚠ 종전에는 `.tabs`(알약 트랙 + `overflow-x: auto`)였는데 **모바일에서 아래에 가로
          스크롤바가 생겨** 메뉴처럼 보이지 않았다(사용자 지적). 이제 버튼을 그대로 늘어
          놓고, 넘치면 **손가락으로 밀어서** 넘긴다 — 스크롤바는 감추고 스냅을 건다.
          640px 이상에서는 줄바꿈해 한눈에 다 보이므로 밀 일이 없다.
        ⚠ `role="tablist"` 를 쓰지 않는다. 탭 위젯은 좌우 방향키로 이동하고 Tab 으로는
          하나만 잡히는 규약인데, 여기 버튼들은 각각 독립적으로 눌러야 하고 누르면 결과가
          새로 생성된다 — 탭 전환이 아니라 실행에 가깝다. `aria-pressed` 가 맞는 표현이다.
      */}
      <div
        className="strategy-picker-wrap"
        data-more={canRight ? "" : undefined}
      >
        {canLeft && (
          <button
            type="button"
            className="strategy-nav is-prev"
            onClick={() => nudge(-1)}
            aria-label="이전 기준 보기"
          >
            <ChevronIcon dir="left" />
          </button>
        )}

        <div
          className="strategy-picker"
          ref={pickerRef}
          role="group"
          aria-label="추천 기준 선택"
        >
          {STRATEGIES.map((item) => (
            <button
              key={item.key}
              type="button"
              className="strategy-chip"
              data-active={item.key === strategy ? "" : undefined}
              aria-pressed={item.key === strategy}
              disabled={loading}
              onClick={() => generate(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {canRight && (
          <button
            type="button"
            className="strategy-nav is-next"
            onClick={() => nudge(1)}
            aria-label="다음 기준 보기"
          >
            <ChevronIcon dir="right" />
          </button>
        )}
      </div>

      {/*
        글자로도 한 번 더 알린다. 화살표를 못 알아보는 사용자가 있고, 이 사이트의 주 사용자
        층에게 "옆으로 숨은 것" 은 발견성이 낮다(→ docs/wiki/20-design/responsive-rules.md).
        끝까지 밀면 사라지므로 계속 잔소리하지 않는다.
      */}
      {/*
        ⚠ 조건부로 **렌더링**하지 않고 항상 그린 뒤 보이기만 토글한다.
          `canRight` 는 마운트 뒤에야 정해지므로, 없다가 생기면 아래 내용이 밀려
          레이아웃이 흔들린다(실측 CLS 0 → 0.02). 자리를 처음부터 차지하면 흔들리지 않는다.
          `visibility: hidden` 이라 접근성 트리에서도 빠진다.
      */}
      <p className="strategy-hint" data-show={canRight ? "" : undefined}>
        <span aria-hidden="true">→</span> 옆으로 밀면 {STRATEGIES.length}가지
        기준을 모두 볼 수 있어요
      </p>

      <p
        className="muted"
        style={{ fontSize: "var(--fs-sm)", marginTop: "var(--space-3)" }}
      >
        {meta.description}
      </p>

      {/*
        추천 개수. 계약이 1~10 을 허용하므로 열 개를 모두 낸다 — 선택지를 줄이면
        "왜 5개만 되지" 가 된다. 좁은 화면에서는 줄바꿈해 두 줄이 된다.
      */}
      <div className="set-count">
        <span className="set-count-label" id="set-count-label">
          추천 개수
        </span>
        <div
          className="set-count-chips"
          role="group"
          aria-labelledby="set-count-label"
        >
          {SET_COUNTS.map((n) => (
            <button
              key={n}
              type="button"
              className="set-count-chip"
              data-active={n === count ? "" : undefined}
              aria-pressed={n === count}
              disabled={loading}
              onClick={() => generate(strategy, n)}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="hero-cta">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => generate(strategy)}
          disabled={loading}
        >
          {loading ? "생성 중…" : `${count}조합 다시 생성`}
        </button>
      </div>

      {/* 비동기 상태를 스크린리더에 알린다. */}
      <div
        aria-live="polite"
        aria-busy={loading}
        style={{ marginTop: "var(--space-6)" }}
      >
        {error ? (
          <Card>
            <EmptyState>{error}</EmptyState>
          </Card>
        ) : sets.length === 0 ? (
          <Card>
            <EmptyState>
              추천번호를 생성하려면 데이터가 더 필요합니다. 통계 기반 방식은
              회차가 50개 이상 쌓인 뒤에 동작합니다.
            </EmptyState>
          </Card>
        ) : (
          <>
            {/* 조합이 여럿일 때 하나씩 열 번 복사하지 않아도 되게. 개별 버튼은 그대로 둔다. */}
            <BulkActions
              sets={sets.map((set) => set.numbers)}
              strategyLabel={meta.label}
            />

            <ol
              className="stat-grid"
              style={{
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              }}
            >
              {sets.map((set, index) => (
                <li key={set.numbers.join("-")}>
                  <Card as="article" title={`${index + 1}번째 조합`}>
                    <div
                      className="ball-row"
                      style={{ justifyContent: "space-between" }}
                    >
                      {set.numbers.map((n) => (
                        <LottoBall key={n} number={n} />
                      ))}
                    </div>

                    <p
                      className="reco-traits"
                      style={{ marginTop: "var(--space-4)" }}
                    >
                      {traitSentence(set.traits, "이 조합", hotWindow)}
                    </p>

                    <div style={{ marginTop: "var(--space-4)" }}>
                      <KeyValueList rows={traitRows(set.traits)} />
                    </div>

                    {/* 번호를 가져가려고 들어온 자리다. 세 가지를 모두 낸다. */}
                    <NumberActions
                      numbers={set.numbers}
                      strategyLabel={meta.label}
                      subtitle={traitSummaryLine(set.traits)}
                    />
                  </Card>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>

      {/* 면책 고지는 결과 바로 아래에 둔다. 사용자가 결과를 보고 나서 읽는 자리다. */}
      <p
        className="disclaimer is-center"
        style={{ marginTop: "var(--space-6)" }}
      >
        <span className="disclaimer-icon" aria-hidden="true">
          ⓘ
        </span>
        <span>{disclaimer}</span>
      </p>
    </div>
  );
}

/** 좌우 이동 화살표. 방향만 다르고 규격은 하나다. */
function ChevronIcon({ dir }: { dir: "left" | "right" }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={dir === "left" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
    </svg>
  );
}
