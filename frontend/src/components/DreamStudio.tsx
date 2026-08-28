'use client'

import { useMemo, useState } from 'react'

import { browserDreamRecommend } from '@/lib/api'
import type { DreamMatch, DreamResult, DreamTier, DreamTierKey } from '@/lib/api-types'
import { traitSummaryLine } from '@/lib/traits'
import { BulkActions } from './BulkActions'
import { Card, EmptyState } from './Card'
import { LottoBall } from './LottoBall'
import { NumberActions } from './NumberActions'

/** 입력 상한. 넘겨도 백엔드가 받아 주지만, 길수록 엉뚱한 단어가 딸려 온다. */
const MAX_LENGTH = 150

/** 추천 개수 선택지. 계약상 `sets_per_tier` 는 1~30 이고, 화면에서는 10까지만 쓴다. */
const SET_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

/**
 * 제외할 수 있는 번호의 최대 개수(계약).
 *
 * 6개를 만들려면 6개가 남아야 한다(45 − 39 = 6). 넘겨 보내면 백엔드가 422 를 낸다.
 */
const MAX_EXCLUDE = 39

/**
 * 꿈 텍스트 → 참고용 번호.
 *
 * ⚠ **첫 요청은 느리다.** 분석 모델이 lazy 싱글톤으로 로드되며 약 20초가 걸린다
 *   (→ docs/wiki/40-domain/dream-pipeline.md). 로딩 상태를 반드시 표시하고, 얼마나 걸릴 수
 *   있는지 미리 알린다. 알리지 않으면 사용자는 고장으로 여기고 떠난다.
 *
 * ⚠ 결과에는 **어떤 단어에서 어떤 번호가 나왔는지** 낱낱이 보여준다. 근거가 보이지 않으면
 *   사용자는 결과를 납득할 수 없고, 보여주는 것 자체가 이 기능의 콘텐츠 가치다.
 *
 * ⚠ 유사도 점수는 응답에 없고, 있어도 보여주지 않는다. 사용자는 그것을 확률로 읽는다
 *   (→ docs/wiki/40-domain/forbidden-expressions.md).
 */
export function DreamStudio({ initialText = '' }: { initialText?: string }) {
  const [text, setText] = useState(initialText.slice(0, MAX_LENGTH))
  const [count, setCount] = useState(5)
  const [result, setResult] = useState<DreamResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /**
   * 사용자가 쓰기 싫다고 뺀 번호.
   *
   * ⚠ 새 꿈을 분석할 때만 비운다. 개수를 바꾸거나 추천 범위를 옮기는 것은 **같은 꿈을 계속
   *   보는 중**이라, 그때 제외가 풀리면 뺐던 번호가 슬그머니 되돌아온다.
   */
  const [excluded, setExcluded] = useState<ReadonlySet<number>>(new Set())

  /** 제외 없이 받은 결과의 tier 별 풀. 제외 스위치를 그리는 근거다(위 `run` 주석). */
  const [basePools, setBasePools] = useState<DreamResult['tiers'] | null>(null)

  const toggleExcluded = (n: number) => {
    const next = new Set(excluded)
    if (next.has(n)) next.delete(n)
    else if (next.size >= MAX_EXCLUDE) return // 계약 상한. 넘겨 보내면 422 다.
    else next.add(n)
    setExcluded(next)
    // ⚠ 서버가 다시 만들어 준다. 클라이언트에서 거르지 않는다 — 채움 번호는 그렇게 못 뺀다.
    void run(count, false, next)
  }

  const clearExcluded = () => {
    if (excluded.size === 0) return
    const empty = new Set<number>()
    setExcluded(empty)
    void run(count, false, empty)
  }

  /**
   * 분석을 실행한다.
   *
   * ⚠ `nextExcluded` 를 **인자로 받는다.** `excluded` state 를 그대로 읽으면 토글 직후
   *   호출에서 갱신 전 값이 잡힌다(setState 는 즉시 반영되지 않는다) — 방금 뺀 번호가
   *   한 박자 늦게 반영되는 버그가 된다.
   * ⚠ 새 꿈이면 제외를 비우고, 개수·제외 변경이면 유지한다.
   */
  const run = async (
    nextCount: number = count,
    resetExcluded = false,
    nextExcluded: ReadonlySet<number> = excluded,
  ) => {
    const trimmed = text.trim()
    if (!trimmed) return

    const sending = resetExcluded ? new Set<number>() : nextExcluded
    setCount(nextCount)
    if (resetExcluded) setExcluded(sending)
    setLoading(true)
    setError(null)
    try {
      const next = await browserDreamRecommend(trimmed, nextCount, [...sending])
      setResult(next)
      /*
        제외 없이 받은 결과의 풀을 따로 기억한다.
        ⚠ 서버가 제외한 번호를 `pool` 에서도 빼기 때문에, 그것만 보고 스위치를 그리면
          **뺀 번호가 목록에서 사라져 되돌릴 수 없다.** 스위치는 언제나 '제외 없는 풀' 로
          그리고, 조합만 제외가 반영된 결과로 그린다.
      */
      if (sending.size === 0) setBasePools(next.tiers)
    } catch (err) {
      setError(err instanceof Error ? err.message : '번호를 만들지 못했습니다.')
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  const remaining = MAX_LENGTH - text.length

  return (
    <div>
      <Card>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            // 새 꿈이므로 지난 제외는 무의미하다.
            void run(count, true)
          }}
        >
          <div className="dream-label-row">
            <label htmlFor="dream-text">어떤 꿈을 꾸셨나요?</label>
            {/*
              남은 글자 수. `aria-live` 를 걸지 않는다 — 한 글자마다 읽어 주면 방해만 된다.
              대신 textarea 의 maxLength 가 실제로 막아 준다.
            */}
            <span className="dream-counter" data-low={remaining <= 20 ? '' : undefined}>
              {text.length} / {MAX_LENGTH}자
            </span>
          </div>

          <textarea
            id="dream-text"
            className="input"
            rows={3}
            maxLength={MAX_LENGTH}
            style={{ marginTop: 'var(--space-2)', minHeight: 88, resize: 'vertical' }}
            placeholder="예) 큰 돼지가 집으로 들어오는 꿈을 꿨어요"
            value={text}
            onChange={(event) => setText(event.target.value)}
            aria-describedby="dream-help"
          />

          <p id="dream-help" className="dream-help">
            꿈에서 본 동물, 사물, 행동 등을 중심으로 <strong>{MAX_LENGTH}자</strong> 이내로
            작성해 주세요.
          </p>

          {/* 추천 개수. 번호추천 화면과 같은 문법이라 한 번 익히면 두 곳에서 통한다. */}
          <div className="set-count">
            <span className="set-count-label" id="dream-count-label">
              추천 개수
            </span>
            <div className="set-count-chips" role="group" aria-labelledby="dream-count-label">
              {SET_COUNTS.map((n) => (
                <button
                  key={n}
                  type="button"
                  className="set-count-chip"
                  data-active={n === count ? '' : undefined}
                  aria-pressed={n === count}
                  disabled={loading}
                  onClick={() => {
                    if (result) void run(n)
                    else setCount(n)
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div className="hero-cta">
            <button type="submit" className="btn btn-primary" disabled={loading || !text.trim()}>
              {loading ? '꿈을 분석하는 중…' : '꿈해몽 번호추천'}
            </button>
          </div>

          {loading && (
            <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: 'var(--space-3)' }}>
              처음 실행할 때는 분석 모델을 불러오느라 20초가량 걸릴 수 있습니다. 잠시만 기다려
              주세요.
            </p>
          )}
        </form>
      </Card>

      <div aria-live="polite" aria-busy={loading} style={{ marginTop: 'var(--space-5)' }}>
        {error && (
          <Card>
            <EmptyState>{error}</EmptyState>
          </Card>
        )}

        {result && (
          <DreamResultView
            result={result}
            requested={count}
            excluded={excluded}
            onToggleExcluded={toggleExcluded}
            onClearExcluded={clearExcluded}
            basePools={basePools}
            busy={loading}
          />
        )}
      </div>
    </div>
  )
}

/**
 * 세 가지 추천 범위.
 *
 * tier 는 `gubun` 을 **누적**한다(tier1=1, tier2=1+2, tier3=1+2+3). 사용자에게는 그 사실을
 * 그대로 이름으로 말한다 — "얼마나 넓게 찾았는가" 는 추상적이고, 무엇이 들어갔는지가
 * 화면 위쪽 분석 결과와 바로 이어져야 한다.
 *
 * ⚠ 설명에 **어려운 말을 쓰지 않는다.** 한때 "표제어" 라고 썼는데 그건 사전 만드는 사람의
 *   말이지 꿈 얘기 하러 온 사람의 말이 아니다(사용자 지적). "자료에 있는 단어" 로 쓴다.
 */
const TIER_LABEL: Record<DreamTierKey, { title: string; note: string }> = {
  tier1: {
    title: '정확히 일치하는 단어만',
    note: '적어 주신 단어가 자료에 있는 단어와 그대로 맞은 것만 씁니다. 가장 좁고 분명한 범위입니다.',
  },
  tier2: {
    title: '일치 + 포함된 단어',
    note: '적어 주신 단어를 품고 있는 단어까지 넓혔습니다. 예를 들어 “돼지” 는 “돼지코” 와 “새끼돼지” 까지 데려옵니다.',
  },
  tier3: {
    title: '일치 + 포함 + 유사한 단어',
    note: '뜻이 가까운 단어까지 모두 포함했습니다. 재료가 가장 많은 대신 꿈에서 멀어질 수 있습니다.',
  },
}

const TIER_KEYS: DreamTierKey[] = ['tier1', 'tier2', 'tier3']

/** `gubun` 별 표시 이름. 분석 결과와 추천 범위가 같은 말을 써야 이어서 읽힌다. */
const GUBUN_LABEL: Record<number, string> = {
  1: '정확히 일치하는 단어',
  2: '포함된 단어',
  3: '뜻이 비슷한 단어',
}

/**
 * 번호 하나가 **어디서 왔는지**.
 *
 * ⚠ 이 표식이 이 화면의 핵심이다. 사용자가 좋아한 것도 "왜 이 번호인지 보이는 것" 이었다.
 *   그래서 조합 안의 번호마다 출처를 **글자로** 붙인다 — 테두리 색만으로 나누면 색을
 *   구별하지 못하는 사용자에게는 아무 정보도 남지 않고, 나머지 사용자도 범례를 외워야 한다
 *   (→ docs/wiki/20-design/accessibility.md 색 단독 사용 금지).
 * ⚠ 라벨은 **두 글자**로 맞춘다. 375px 에서 볼 여섯 개 아래에 나란히 들어가야 한다.
 */
type Origin = 'exact' | 'contain' | 'similar' | 'related' | 'filled'

const ORIGIN: Record<Origin, { label: string; desc: string }> = {
  exact: { label: '일치', desc: '적으신 단어와 그대로 맞은 번호' },
  contain: { label: '포함', desc: '적으신 단어를 품은 단어에서 온 번호' },
  similar: { label: '비슷', desc: '뜻이 가까운 단어에서 온 번호' },
  related: { label: '관련', desc: '꿈 내용에서 넓혀 본 단어에서 온 번호' },
  filled: { label: '채움', desc: '번호가 모자라 채운 자리' },
}

/** 한 번호가 여러 갈래에 걸리면 **가장 가까운 쪽**을 쓴다. 앞에 있을수록 가깝다. */
const ORIGIN_RANK: Origin[] = ['exact', 'contain', 'similar', 'related', 'filled']

function DreamResultView({
  result,
  requested,
  excluded,
  onToggleExcluded,
  onClearExcluded,
  basePools,
  busy,
}: {
  result: DreamResult
  /** 사용자가 고른 추천 개수. 실제로 받은 조합 수와 비교해 부족분을 알린다. */
  requested: number
  excluded: ReadonlySet<number>
  onToggleExcluded: (n: number) => void
  onClearExcluded: () => void
  /** 제외 없이 받은 결과의 풀. 제외 스위치는 이것으로 그린다(→ `run` 주석). */
  basePools: DreamResult['tiers'] | null
  /** 다시 만드는 중. 제외 스위치를 잠가 연타로 요청이 겹치지 않게 한다. */
  busy: boolean
}) {
  // 풀이 빈 tier 는 null 로 온다. 그 범위 자체를 렌더링하지 않는다.
  const available = TIER_KEYS.filter((key) => result.tiers[key] !== null)
  const [selected, setSelected] = useState<DreamTierKey>(available[0] ?? 'tier1')

  /*
    ⚠ `matched_words[].dream_word` 는 **적어 주신 단어가 아닐 수 있다.**
      백엔드 형태소 분석이 원문 어절을 사전에 매핑하면서 **유의어로 확장**하기 때문이다
      (→ docs/wiki/40-domain/dream-pipeline.md 1단계). "집으로 들어오는" 이라고 적으면
      `집` 말고도 `집안` · `건물` 이 후보로 올라오고, 그것이 자료의 단어와 정확히 일치하면
      `gubun=1` 로 내려온다. 어간을 명사로 되돌리는 과정에서 `크함` · `꾸음` 같은 **말도
      아닌 것**이 섞여 나오기도 한다.

      그것을 "꿈에서 찾은 단어" 라고 나란히 보여주면 사용자는 "내가 건물을 적었나?" 하고
      막힌다(실제 지적). 그래서 **원문에 실제로 있는 단어**와 **넓혀 본 단어**를 갈라
      놓는다. 판정은 단순 문자열 포함이다 — 프론트에서 형태소를 다시 분석하지 않는다.

    ⚠ 넓혀 본 단어도 **번호에는 반영된다.** 숨기지 않고 접어 둔 채 그 사실을 밝힌다.
  */
  const analysis = useMemo(() => {
    /*
      ⚠ **서버가 판정한다**(2026-08-28 계약 신설 `from_text`). 프론트가 하던 문자열 포함
        판정을 그대로 서버로 옮긴 것이라 분류가 달라지지 않는다.
      ⚠ 구버전 백엔드는 이 필드를 주지 않는다. 그때만 예전 규칙으로 되돌아간다 —
        `undefined` 를 `false` 로 읽으면 **모든 단어가 '넓혀 본 단어'** 가 되어 상단
        상징이 통째로 비어 버린다.
    */
    const isFromText = (m: (typeof result.matched_words)[number]) =>
      m.from_text ?? result.text.includes(m.dream_word)
    const direct = result.matched_words.filter(isFromText)
    const expanded = result.matched_words.filter((m) => !isFromText(m))

    // gubun 별로 (단어 → 번호) 를 모은다. 같은 단어가 여러 gubun 에 걸릴 수 있어 따로 담는다.
    const byGubun = new Map<number, { word: string; numbers: number[] }[]>()
    for (const matched of direct) {
      for (const m of matched.matches as DreamMatch[]) {
        const list = byGubun.get(m.gubun) ?? []
        list.push({ word: m.word, numbers: m.numbers })
        byGubun.set(m.gubun, list)
      }
    }

    // 넓혀 본 단어는 gubun 을 나누지 않는다. 한 묶음으로 접어 두므로 갈라도 읽히지 않는다.
    const expandedRows = expanded.flatMap((matched) =>
      (matched.matches as DreamMatch[]).map((m) => ({ word: m.word, numbers: m.numbers })),
    )

    /*
      번호 → 출처. 같은 번호가 여러 단어에서 나올 수 있으므로 **가장 가까운 갈래**만 남긴다.
      예: 12 가 `돼지`(일치)와 `돈육`(비슷) 양쪽에서 나오면 "일치" 로 본다 — 사용자가 알고
      싶은 것은 "이 번호가 내 꿈과 얼마나 가까운가" 이지 몇 군데서 나왔는가가 아니다.
    */
    const origin = new Map<number, Origin>()
    const mark = (n: number, o: Origin) => {
      const now = origin.get(n)
      if (!now || ORIGIN_RANK.indexOf(o) < ORIGIN_RANK.indexOf(now)) origin.set(n, o)
    }
    const GUBUN_ORIGIN: Record<number, Origin> = { 1: 'exact', 2: 'contain', 3: 'similar' }
    for (const matched of direct) {
      for (const m of matched.matches as DreamMatch[]) {
        for (const n of m.numbers) mark(n, GUBUN_ORIGIN[m.gubun] ?? 'similar')
      }
    }
    for (const row of expandedRows) for (const n of row.numbers) mark(n, 'related')

    return { direct, byGubun, expandedRows, origin }
  }, [result])

  if (available.length === 0) {
    return (
      <Card>
        <EmptyState>
          꿈에서 자료와 연결되는 단어를 찾지 못했습니다. 동물이나 사물, 행동을 넣어 조금 더
          구체적으로 적어 보세요.
        </EmptyState>
      </Card>
    )
  }

  // 선택된 범위가 사라질 수 있다(새 결과). 사용 가능한 첫 범위로 되돌린다.
  const activeKey = available.includes(selected) ? selected : available[0]
  const tier = result.tiers[activeKey] as DreamTier
  const { direct, byGubun, expandedRows, origin } = analysis

  const originOf = (n: number): Origin => (tier.pool.includes(n) ? origin.get(n) ?? 'related' : 'filled')

  /*
    ⚠ 번호 목록 전용 판정. 조합용(`originOf`)을 그대로 쓰면 **뺀 번호가 '채움' 으로 읽힌다** —
      제외된 번호는 `tier.pool` 에 없기 때문이다. 화면에서는 취소선에 가려 안 보이지만
      스크린리더에는 "번호가 모자라 채운 자리" 라는 틀린 말이 그대로 들린다.
      목록에 있는 번호는 전부 꿈에서 온 것이므로 출처 표에서 곧장 찾는다.
  */
  const poolOriginOf = (n: number): Origin => origin.get(n) ?? 'related'

  /*
    ⚠ 여기서 거르지 않는다. 제외는 **서버가 처리**하므로 받은 조합은 이미 제외가 반영돼
      있다(계약: 번호는 풀에서도 채움에서도 빠진다). 프론트가 한 번 더 거르면 채움 번호를
      못 빼던 옛 우회가 되살아나고, 개수도 두 번 깎인다.
  */
  const shown = tier.sets

  /*
    이 범위에서 실제로 쓰인 출처만 범례에 낸다. 안 나온 갈래까지 설명하면 소음이다.
    ⚠ 번호 목록과 조합 **양쪽**을 본다. 범례는 둘 사이에 놓여 두 곳의 표식을 함께 설명한다.
  */
  const usedOrigins = ORIGIN_RANK.filter(
    (o) =>
      tier.pool.some((n) => originOf(n) === o) ||
      shown.some((set) => set.numbers.some((n) => originOf(n) === o)),
  )

  /*
    스위치에 그릴 풀. 제외가 반영된 `tier.pool` 을 쓰면 **뺀 번호가 사라져 되돌릴 수 없다.**
    제외 없이 받아 둔 풀을 쓰고, 아직 없으면(첫 응답 전) 현재 풀로 대신한다.
  */
  const pickerPool = basePools?.[activeKey]?.pool ?? tier.pool
  const excludedInPool = pickerPool.filter((n) => excluded.has(n))

  return (
    <div className="dream-result">
      {/* ── 분석 결과 ─────────────────────────────────── */}
      <Card as="article" title="꿈 분석 결과">
        <p className="dream-analysis-lede">
          적어 주신 꿈에서 <strong>{direct.length}개</strong>의 상징을 찾았습니다.
        </p>

        <ul className="keyword-chips" style={{ marginTop: 'var(--space-2)' }}>
          {direct.map((matched) => (
            <li className="chip" key={matched.dream_word}>
              {matched.dream_word}
            </li>
          ))}
        </ul>

        {/* 정확히 일치한 것은 접지 않는다 — 가장 확실한 근거라 먼저 보여야 한다. */}
        {byGubun.has(1) && <WordNumberList items={byGubun.get(1) ?? []} title={GUBUN_LABEL[1]} />}

        {/* 나머지는 접어 둔다. 다만 접혀 있다는 것이 한눈에 보여야 한다. */}
        {byGubun.has(2) && (
          <Disclosure title={GUBUN_LABEL[2]} count={(byGubun.get(2) ?? []).length}>
            <WordNumberList items={byGubun.get(2) ?? []} />
          </Disclosure>
        )}
        {byGubun.has(3) && (
          <Disclosure title={GUBUN_LABEL[3]} count={(byGubun.get(3) ?? []).length}>
            <WordNumberList items={byGubun.get(3) ?? []} />
          </Disclosure>
        )}

        {/* 원문에 없던 단어. 왜 여기 있는지 반드시 설명한다 — 설명 없이 보이면 오류로 읽힌다. */}
        {expandedRows.length > 0 && (
          <Disclosure title="꿈 내용에서 넓혀 본 단어" count={expandedRows.length}>
            <p className="dream-expanded-note">
              적어 주신 문장을 풀어 보다가 함께 떠오른 단어입니다. 직접 적지 않으셨더라도
              번호에는 함께 반영됩니다.
            </p>
            <WordNumberList items={expandedRows} />
          </Disclosure>
        )}
      </Card>

      {/* ── 추천 범위 ─────────────────────────────────── */}
      {available.length > 1 && (
        <div className="dream-tier" role="group" aria-label="추천 범위 선택">
          {available.map((key) => (
            <button
              key={key}
              type="button"
              className="dream-tier-btn"
              data-active={key === activeKey ? '' : undefined}
              aria-pressed={key === activeKey}
              onClick={() => setSelected(key)}
            >
              {TIER_LABEL[key].title}
            </button>
          ))}
        </div>
      )}

      <p className="dream-tier-note">{TIER_LABEL[activeKey].note}</p>

      {/* ── 쓸 번호 고르기 ────────────────────────────── */}
      <PoolPicker
        pool={pickerPool}
        excluded={excluded}
        originOf={poolOriginOf}
        busy={busy}
        onToggle={onToggleExcluded}
        onClear={onClearExcluded}
        excludedCount={excludedInPool.length}
      />

      {/* 번호 목록과 조합 사이. 위에서 본 표식을 아래에서 다시 만나기 직전에 설명한다. */}
      <OriginLegend origins={usedOrigins} />

      {/*
        ⚠ 풀이 여섯 개보다 적으면 백엔드가 **1~45 무작위**로 나머지를 채운다
          (→ docs/wiki/40-domain/dream-pipeline.md). 그 사실을 감추지 않는다 — 꿈에서 나온
          번호와 채워진 번호가 섞여 있는데 전부 꿈에서 왔다고 두면 거짓말이다.
      */}
      {tier.pool.length < 6 && (
        <p className="dream-fill-note">
          꿈에서 찾은 번호가 <strong>{tier.pool.length}개</strong>라 한 조합의 나머지{' '}
          {6 - tier.pool.length}자리는 무작위로 채웠습니다. 아래 조합에서{' '}
          <strong>채움</strong> 이라고 적힌 번호가 그것입니다.
        </p>
      )}

      {/*
        ⚠ 요청한 만큼 못 낼 수 있고, **이유가 둘**이다. 어느 쪽인지 말해 주지 않으면
          사용자는 고칠 방법을 모른다 — 번호가 모자란 것과 자기가 뺀 것은 대응이 다르다.
      */}
      {shown.length < requested && (
        <p className="dream-short-note">
          {excludedInPool.length > 0 ? (
            <>
              번호 <strong>{excludedInPool.length}개</strong>를 빼셔서 남은 조합이{' '}
              <strong>{shown.length}개</strong>입니다. 더 보시려면 뺀 번호를 다시 넣거나 추천
              범위를 넓혀 보세요.
            </>
          ) : (
            <>
              이 범위의 번호가 <strong>{tier.pool.length}개</strong>뿐이라 서로 다른 조합을{' '}
              <strong>{shown.length}개</strong>까지만 만들 수 있었습니다. 추천 범위를 넓히거나
              꿈 내용을 조금 더 구체적으로 적어 보세요.
            </>
          )}
        </p>
      )}

      <BulkActions
        sets={shown.map((set) => set.numbers)}
        strategyLabel="꿈해몽"
        sourcePath="/dream"
      />

      <ol className="dream-sets">
        {shown.map((set, index) => (
          <li key={set.numbers.join('-')}>
            <Card as="article" title={`${index + 1}번째 조합`}>
              <div className="dream-set-balls">
                {set.numbers.map((n) => {
                  const o = originOf(n)
                  return (
                    <span key={n} className="dream-ball" data-origin={o}>
                      <LottoBall number={n} />
                      {/*
                        보이는 라벨과 스크린리더가 읽는 말이 어긋나면 안 된다. 라벨은 두
                        글자라 짧으므로, 뜻은 sr-only 로 덧붙여 소리로만 온전히 들리게 한다.
                      */}
                      <span className="dream-ball-tag">
                        {ORIGIN[o].label}
                        <span className="sr-only"> — {ORIGIN[o].desc}</span>
                      </span>
                    </span>
                  )
                })}
              </div>

              <p className="reco-traits" style={{ marginTop: 'var(--space-3)' }}>
                {traitSummaryLine(set.traits)}
              </p>

              <NumberActions
                numbers={set.numbers}
                strategyLabel="꿈해몽"
                subtitle={traitSummaryLine(set.traits)}
                sourcePath="/dream"
              />
            </Card>
          </li>
        ))}
      </ol>
    </div>
  )
}

/**
 * 이 범위의 번호 목록 겸 **제외 스위치**.
 *
 * ⚠ 번호를 누르면 빠지고 다시 누르면 돌아온다. 별도 화면이나 대화상자를 두지 않는다 —
 *   빼고 싶은 번호는 목록을 보는 그 순간 눈에 띄므로, 그 자리에서 바로 눌러야 한다.
 * ⚠ 각 번호는 **44px 터치 타겟**이다. 볼만 놓으면 모바일에서 오탭이 잦다.
 * ⚠ 뺀 상태를 흐림(색)만으로 알리지 않는다. 취소선과 `aria-pressed` 를 함께 쓴다.
 */
function PoolPicker({
  pool,
  excluded,
  originOf,
  onToggle,
  onClear,
  excludedCount,
  busy,
}: {
  pool: number[]
  excluded: ReadonlySet<number>
  originOf: (n: number) => Origin
  onToggle: (n: number) => void
  onClear: () => void
  excludedCount: number
  /** 다시 만드는 중. 연타로 요청이 겹치지 않게 잠근다. */
  busy: boolean
}) {
  return (
    <div className="dream-pool">
      <div className="dream-pool-head">
        <span className="dream-pool-label">이 범위의 번호 {pool.length}개</span>
        {excludedCount > 0 && (
          <button
            type="button"
            className="dream-pool-reset"
            onClick={onClear}
            disabled={busy}
          >
            뺀 번호 {excludedCount}개 되돌리기
          </button>
        )}
      </div>

      <p className="dream-pool-hint" aria-live="polite">
        {busy
          ? '뺀 번호를 빼고 다시 만드는 중입니다…'
          : '쓰고 싶지 않은 번호를 누르면 그 번호를 빼고 다시 만들어 드립니다.'}
      </p>

      <ul className="dream-pool-list">
        {pool.map((n) => {
          const off = excluded.has(n)
          return (
            <li key={n}>
              <button
                type="button"
                className="dream-pool-item"
                data-origin={originOf(n)}
                data-off={off ? '' : undefined}
                aria-pressed={off}
                disabled={busy}
                onClick={() => onToggle(n)}
              >
                <LottoBall number={n} size="sm" />
                <span className="sr-only">
                  {ORIGIN[originOf(n)].desc}. {off ? '뺀 번호입니다. 누르면 다시 넣습니다.' : '누르면 뺍니다.'}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** 조합 안 라벨이 무슨 뜻인지. 이 범위에서 실제로 쓰인 것만 낸다. */
function OriginLegend({ origins }: { origins: Origin[] }) {
  if (origins.length === 0) return null
  return (
    <ul className="dream-legend">
      {origins.map((o) => (
        <li key={o} className="dream-legend-item" data-origin={o}>
          <span className="dream-legend-swatch" aria-hidden="true">
            {ORIGIN[o].label}
          </span>
          <span>{ORIGIN[o].desc}</span>
        </li>
      ))}
    </ul>
  )
}

/** 단어 하나와 거기서 나온 번호들. 분석 결과의 최소 단위다. */
function WordNumberList({ items, title }: { items: { word: string; numbers: number[] }[]; title?: string }) {
  if (items.length === 0) return null
  return (
    <div className="dream-words">
      {title && <h4 className="dream-words-title">{title}</h4>}
      <ul>
        {items.map((item) => (
          <li key={`${item.word}-${item.numbers.join('-')}`}>
            <span className="dream-word">{item.word}</span>
            <span className="ball-row">
              {item.numbers.map((n) => (
                <LottoBall key={n} number={n} size="sm" />
              ))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * 접었다 펴는 묶음.
 *
 * ⚠ `<details>/<summary>` 다. JS 없이 펼쳐지고 키보드·스크린리더 동작을 브라우저가 준다.
 * ⚠ **접혀 있다는 것이 한눈에 보여야 한다**(사용자 요구). 그래서 갈매기만 두지 않고
 *   개수와 "펼쳐 보기" 라는 말을 함께 낸다 — 아이콘만으로는 알아보지 못하는 사람이 있다.
 */
function Disclosure({
  title,
  count,
  children,
}: {
  title: string
  count: number
  children: React.ReactNode
}) {
  return (
    <details className="dream-disclosure">
      <summary>
        <span className="dream-disclosure-title">
          {title} <span className="dream-disclosure-count">{count}</span>
        </span>
        <span className="dream-disclosure-cue">
          <span className="dream-disclosure-open">펼쳐 보기</span>
          <span className="dream-disclosure-close">접기</span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </summary>
      {children}
    </details>
  )
}
