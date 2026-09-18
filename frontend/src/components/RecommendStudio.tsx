"use client";

import { useEffect, useRef, useState, type SVGProps } from "react";

import { browserRecommend } from "@/lib/api";
import { loadReco, saveReco } from "@/lib/reco-store";
import { DrawRunner } from "./simulator/DrawRunner";
import { scrollToResultSoon } from "@/lib/scroll-to";
import type { RecommendSet, RecommendStrategy } from "@/lib/api-types";
import { STRATEGIES, strategyMeta } from "@/lib/strategies";
import { traitRows, traitSentence, traitSummaryLine } from "@/lib/traits";
import { BulkActions } from "./BulkActions";
import { Card, EmptyState } from "./Card";
import { LottoBall } from "./LottoBall";
import { NumberActions } from "./NumberActions";
import {
  DiceIcon,
  LayersIcon,
  PairIcon,
  ReturnIcon,
  ScaleIcon,
  SegmentsIcon,
} from "./icons";
import { CountStepper } from "./simulator/CountStepper";
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
  /** 지금 **고른** 방식. 아직 뽑지 않았을 수 있다. */
  const [strategy, setStrategy] = useState<RecommendStrategy>(initialStrategy);
  /**
   * 아래 결과가 **실제로 어떤 방식으로 뽑혔는지**.
   *
   * ⚠ 고른 방식과 따로 둔다(2026-09-17). 카드를 누르면 곧바로 뽑던 것을 "고르고 → 뽑기"
   *   로 바꿨기 때문에, 카드만 바꾸고 아직 안 뽑은 순간에는 둘이 다르다. 하나로 두면
   *   결과 제목이 "번호대 균형" 인데 번호는 "통계 종합" 으로 뽑힌 것인 거짓 화면이 된다.
   */
  const [resultStrategy, setResultStrategy] = useState<RecommendStrategy>(initialStrategy);
  /**
   * 한 번에 만들 조합 수. 계약상 1~10 이다([[api-contract]]).
   * 서버가 처음 넘겨준 개수를 그대로 이어받아 화면과 값이 어긋나지 않게 한다.
   */
  const [count, setCount] = useState<number>(initialSets.length || 5);
  const [sets, setSets] = useState<RecommendSet[]>(initialSets);
  const [hotWindow, setHotWindow] = useState<number | null>(initialHotWindow);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
    ── 뽑는 과정 팝업(2026-09-18) ──────────────────────────────────
    ⚠ 응답이 오자마자 결과를 그리지 않는다. 정밀 분석과 마찬가지로 **과정을 보여 준 뒤** 그린다
      (사용자 요청). 그래서 받은 결과를 `pending` 에 잠시 담아 두고, 팝업이 끝나면 화면에 올린다.
    ⚠ 팝업이 도는 동안 결과를 미리 바꾸면 뒤에서 화면이 바뀌어 팝업이 닫힐 때 튄다.
  */
  const [running, setRunning] = useState(false);
  const [arrived, setArrived] = useState(false);
  const [pending, setPending] = useState<{
    sets: RecommendSet[];
    hotWindow: number | null;
    strategy: RecommendStrategy;
  } | null>(null);

  /** 결과 블록. 뽑기가 끝나면 이 자리로 화면을 옮긴다(전체 복사 버튼이 맨 위에 있다). */
  const resultRef = useRef<HTMLDivElement>(null);

  const generate = async () => {
    const next = strategy;
    setLoading(true);
    setRunning(true);
    setArrived(false);
    setPending(null);
    setError(null);
    try {
      const result = await browserRecommend(next, count);
      setPending({
        sets: result.sets,
        hotWindow: result.hot_window,
        strategy: next,
      });
      /*
        ⚠ 분석 화면에 갔다 돌아왔을 때 되살리려고 담아 둔다. '분석' 을 누를 때가 아니라
          **결과를 받을 때** 담는다 — 뒤로가기·스와이프처럼 버튼을 거치지 않는 이동도
          있기 때문이다(→ lib/reco-store.ts).
      */
      saveReco("six", {
        sets: result.sets,
        hotWindow: result.hot_window,
        strategy: next,
      });
    } catch (err) {
      // 회차가 50개 미만이면 백엔드가 422 와 함께 사유를 준다. 그대로 보여준다.
      setError(
        err instanceof Error ? err.message : "번호를 생성하지 못했습니다.",
      );
      setSets([]);
    } finally {
      setLoading(false);
      setArrived(true);
    }
  };

  /** 팝업의 걸음이 끝났다. 그때 결과를 화면에 올리고 그 자리로 옮긴다. */
  const finishDraw = () => {
    setRunning(false);
    if (!pending) return;
    setSets(pending.sets);
    setHotWindow(pending.hotWindow);
    setResultStrategy(pending.strategy);
    setPending(null);
    scrollToResultSoon(() => resultRef.current);
  };

  /** 그만두기. 받아 둔 결과는 버린다 — 보여 주지 않기로 한 것을 몰래 반영하지 않는다. */
  const cancelDraw = () => {
    setRunning(false);
    setPending(null);
  };

  /*
   * 돌아왔을 때 뽑아 둔 번호를 되살린다(2026-09-01 사용자가 "중요" 로 표시).
   *
   * ⚠ **서버가 넘겨준 첫 결과(`initialSets`)가 있으면 건드리지 않는다.** 그것은 이 페이지가
   *   서버에서 렌더링될 때 이미 받아 둔 값이고, 담아 둔 것보다 새롭다.
   * ⚠ 첫 마운트에 한 번만 본다 — 새로 뽑은 뒤 옛 결과로 되돌아가면 안 된다.
   */
  useEffect(() => {
    if (initialSets.length > 0) return;
    const saved = loadReco<SavedSix>("six", isSavedSix);
    if (!saved) return;
    setSets(saved.sets);
    setHotWindow(saved.hotWindow);
    setStrategy(saved.strategy);
    setResultStrategy(saved.strategy);
    setCount(saved.sets.length || 5);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 첫 마운트 한 번만 되살린다.
  }, []);

  const meta = strategyMeta(strategy);
  const resultMeta = strategyMeta(resultStrategy);
  const SelectedIcon = STRATEGY_ICON[strategy];

  return (
    <div className="pick">
      {/*
        ⚠ **누른 뒤 무엇이 도는지 보여준다**(2026-09-02 사용자 요청). 6가지 추천은 응답이
          빨라서 결과만 슬쩍 바뀌었고, 그러면 눌린 것인지조차 알기 어려웠다.
      */}
      {running && (
        <DrawRunner
          strategyLabel={strategyMeta(pending?.strategy ?? strategy).label}
          strategyShort={strategyMeta(pending?.strategy ?? strategy).short}
          picked={pending?.sets[0]?.numbers ?? null}
          done={arrived}
          onFinished={finishDraw}
          onCancel={cancelDraw}
        />
      )}

      {/*
        ── ① 방식 고르기 ─────────────────────────────────────
        ⚠ 2026-09-17 재설계. 종전에는 가로로 미는 알약 칩 여섯 + 아래 설명 한 줄 + 숫자 칩 열
          + 버튼이었고, 칩을 누르는 순간 곧바로 뽑혔다. 사용자 지적: "어떤 추천방법을 선택해서
          몇 개를 선택하는지 직관적이지 않고 난잡하다".

          지금은 **카드 여섯 장**(아이콘 · 이름 · 무엇에서 뽑는지)을 한눈에 깔고, 고른 뒤
          아래 주문 줄에서 "○○ 방식으로 N개" 를 확인하고 뽑는다. 누르자마자 뽑히지 않으므로
          카드를 훑어보며 비교할 수 있다.

        ⚠ 카드 전체가 버튼처럼 눌리지만 **실제 버튼은 이름 줄뿐**이다(늘린 링크 기법,
          `::after` 가 카드를 덮는다). 긴 설명까지 버튼 안에 넣으면 낭독기가 버튼 이름으로
          세 문장을 읽는다 — 설명은 `aria-describedby` 로 따로 들린다.
        ⚠ 설명 문단은 여섯 개 모두 **DOM 에 있다.** 좁은 화면에서는 고른 카드의 것만 보이고
          넓은 화면에서는 전부 보인다. 이 설명이 페이지의 고유 본문이라 검색엔진이 읽어야 한다.
      */}
      <p className="pick-step" id="six-strategy-label">
        <span className="pick-step-num" aria-hidden="true">1</span>
        어떤 방식으로 뽑을까요?
      </p>
      <ul className="strategy-cards" role="group" aria-labelledby="six-strategy-label">
        {STRATEGIES.map((item) => {
          const Icon = STRATEGY_ICON[item.key];
          const active = item.key === strategy;
          return (
            <li
              key={item.key}
              className="strategy-card"
              data-key={item.key}
              data-active={active ? "" : undefined}
            >
              <span className="strategy-card-icon" aria-hidden="true">
                <Icon />
              </span>
              <button
                type="button"
                className="strategy-card-btn"
                aria-pressed={active}
                aria-describedby={`strategy-desc-${item.key}`}
                disabled={loading}
                onClick={() => setStrategy(item.key)}
              >
                <span className="strategy-card-name">
                  {item.label}
                  {/*
                    통제군 표시. 맨 앞에 두는 이유가 "나머지를 견주는 기준" 인데 다른 다섯과
                    똑같이 생기면 그냥 첫 항목으로 읽힌다(→ lib/strategies.ts).
                  */}
                  {item.key === "pure_random" && (
                    <em className="strategy-card-tag">비교 기준</em>
                  )}
                </span>
                <span className="strategy-card-short">{item.short}</span>
              </button>
              <span className="strategy-card-check" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="14" height="14">
                  <path
                    d="M5 12.5l4.5 4.5L19 7.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <p className="strategy-card-desc" id={`strategy-desc-${item.key}`}>
                {item.description}
              </p>
            </li>
          );
        })}
      </ul>

      {/*
        ── ② 개수 + 뽑기 ─────────────────────────────────────
        주문서처럼 한 줄에 모은다. **고른 방식의 아이콘과 이름이 여기 다시 나온다** —
        위에서 무엇을 골랐는지 스크롤을 올리지 않고 확인하고 누른다.
      */}
      <div className="pick-order">
        <div className="pick-order-count">
          <p className="pick-step" id="six-count-label">
            <span className="pick-step-num" aria-hidden="true">2</span>
            몇 개 뽑을까요?
          </p>
          <CountStepper
            value={count}
            onChange={setCount}
            labelId="six-count-label"
            disabled={loading}
          />
        </div>

        <div className="pick-order-go">
          <p className="pick-order-line" id="six-order-line">
            <span className="pick-order-icon" data-key={strategy} aria-hidden="true">
              <SelectedIcon />
            </span>
            <span>
              <strong>{meta.label}</strong> 방식으로 <strong>{count}개</strong>
            </span>
          </p>
          <button
            type="button"
            className="btn btn-primary pick-go"
            onClick={() => void generate()}
            disabled={loading}
            aria-describedby="six-order-line"
          >
            {loading ? "뽑는 중…" : "번호 뽑기"}
          </button>
        </div>
      </div>

      {/* 비동기 상태를 스크린리더에 알린다. */}
      <div aria-live="polite" aria-busy={loading} className="pick-result" ref={resultRef}>
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
            {/*
              결과가 **어느 방식으로** 뽑혔는지. 카드만 바꾸고 아직 안 뽑았으면 위 선택과
              다를 수 있어 여기서 분명히 적는다(`resultStrategy` 주석).
            */}
            <p className="pick-result-head">
              <strong>{resultMeta.label}</strong> 방식으로 뽑은 번호{" "}
              <strong>{sets.length}개</strong>
              {resultStrategy !== strategy && (
                <span className="pick-result-stale">
                  · 고른 방식으로 보려면 &lsquo;번호 뽑기&rsquo;를 누르세요
                </span>
              )}
            </p>

            {/* 조합이 여럿일 때 하나씩 열 번 복사하지 않아도 되게. 개별 버튼은 그대로 둔다. */}
            <BulkActions
              sets={sets.map((set) => set.numbers)}
              strategyLabel={resultMeta.label}
            />

            <ol
              className="stat-grid"
              style={{
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              }}
            >
              {sets.map((set, index) => (
                <li key={set.numbers.join("-")}>
                  <Card as="article" title={`추천 ${index + 1}`}>
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
                      {traitSentence(set.traits, "이 번호", hotWindow)}
                    </p>

                    <div style={{ marginTop: "var(--space-4)" }}>
                      <KeyValueList rows={traitRows(set.traits)} />
                    </div>

                    {/* 번호를 가져가려고 들어온 자리다. 세 가지를 모두 낸다. */}
                    <NumberActions
                      numbers={set.numbers}
                      strategyLabel={resultMeta.label}
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

/**
 * 방식 → 아이콘.
 *
 * ⚠ 키를 `RecommendStrategy` 로 묶는다. 계약에 방식이 하나 늘면 여기서 타입 에러가 난다 —
 *   아이콘 없는 카드가 조용히 생기지 않게.
 */
const STRATEGY_ICON: Record<
  RecommendStrategy,
  (props: SVGProps<SVGSVGElement>) => React.ReactElement
> = {
  pure_random: DiceIcon,
  ensemble: LayersIcon,
  balanced_range: SegmentsIcon,
  golden_combo: ScaleIcon,
  cold_return: ReturnIcon,
  pair_affinity: PairIcon,
};

/** 담아 두는 모양. 화면이 되살리는 데 필요한 것만 담는다. */
interface SavedSix {
  sets: RecommendSet[];
  hotWindow: number | null;
  strategy: RecommendStrategy;
}

/**
 * 담아 둔 JSON 이 쓸 수 있는 모양인지 확인한다.
 *
 * ⚠ `strategy` 가 아는 값인지까지 본다. 모르는 기준이 들어오면 `strategyMeta` 가 빈 값을
 *   돌려주고 화면이 이름 없는 카드가 된다 — 배포로 기준이 바뀐 뒤에 실제로 생길 수 있다.
 */
function isSavedSix(value: unknown): value is SavedSix {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Partial<SavedSix>;
  if (!Array.isArray(v.sets)) return false;
  if (v.hotWindow !== null && typeof v.hotWindow !== "number") return false;
  return STRATEGIES.some((s) => s.key === v.strategy);
}
