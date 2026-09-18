'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { LottoBall } from '@/components/LottoBall'
import { DiceIcon, RewindGlyph } from '@/components/icons'

/**
 * '내 번호 분석' 카드 — 번호 6개를 고르면 **'샀다면?' 화면**(`/lotto/analyze`)으로 보낸다.
 *
 * ── 왜 이 카드인가 ─────────────────────────────────────────────────
 * 2026-09-18 사용자 요청. 통계 화면에는 "남의 번호" 이야기만 있었다. 여기서 **내 번호**를
 * 골라 바로 역대 기록을 볼 수 있으면, 통계를 보다가 떠오른 번호를 그 자리에서 확인할 수 있다.
 *
 * ⚠ **화면 이동 없이 카드 안에서 고른다**(사용자 선택). 고르는 화면을 따로 두면 한 단계가
 *   더 생기고, 그 화면은 통계와 아무 관계 없는 빈 화면이 된다.
 * ⚠ **평소에는 접혀 있다**(2026-09-18 사용자 요청). 번호판이 늘 펼쳐져 있으면 순위 목록을
 *   보러 온 사람에게 45칸이 먼저 막아선다. 카드를 눌러야 열리고, 카드 자체가 여는 버튼이다.
 * ⚠ 열림 상태를 주소(`#mynum`)에도 남긴다 — 다른 통계 화면의 '내 번호 분석' 카드가 이 주소로
 *   보내면 도착하자마자 열려 있어야 한다(→ StatNav).
 * ⚠ 분석 자체는 하지 않는다. 고른 번호를 주소에 실어 보낼 뿐이고, 계산은 전부
 *   `/api/lotto/analyze` 가 한다(frontend/CLAUDE.md "비즈니스 계산 금지").
 * ⚠ 주소 규칙은 `/lotto/analyze?numbers=3,11,24,29,38,41` — 오름차순 6개(계약과 같은 규칙).
 *   `NumberActions` 의 `analyzeHref` 와 같은 모양이라 두 입구가 같은 화면으로 간다.
 *
 * ── ⚠ 접근성 ───────────────────────────────────────────────────────
 * - 번호 칸은 `button` 이고 `aria-pressed` 로 선택 상태를 말한다. 색만으로 전하지 않는다.
 * - 여섯 개를 다 고르기 전에는 이동 버튼이 `disabled` 다. 남은 개수를 글자로 알린다.
 * - 고른 개수 안내에 `aria-live` 를 건다 — 누를 때마다 몇 개인지 들려야 한다.
 */
export function MyNumbersCard({ cards }: { cards: React.ReactNode }) {
  const router = useRouter()
  const [picked, setPicked] = useState<number[]>([])
  const [open, setOpen] = useState(false)

  /*
    다른 화면에서 `/lotto/stat#mynum` 으로 들어오면 **도착하자마자 열어 둔다.**
    ⚠ 서버 렌더에서는 주소의 해시를 알 수 없어(브라우저만 안다) 첫 렌더는 닫힌 채로 두고
      마운트 뒤에 연다 — 반대로 하면 서버와 클라이언트가 어긋나 hydration 경고가 난다.
  */
  useEffect(() => {
    if (window.location.hash === '#mynum') setOpen(true)
  }, [])

  const toggle = (n: number) => {
    setPicked((prev) => {
      if (prev.includes(n)) return prev.filter((x) => x !== n)
      if (prev.length >= 6) return prev // 여섯을 넘기지 않는다. 계약이 정확히 6개다.
      return [...prev, n].sort((a, b) => a - b)
    })
  }

  /*
    무작위로 채우기.
    ⚠ 이것은 **추천이 아니라 입력 도우미**다. 고르기 귀찮은 사람이 곧바로 결과를 보게 하려는
      것이고, 화면 문구도 '추천' 이라고 부르지 않는다 — 추천은 `/lotto/recommend` 의 일이다.
    ⚠ **누를 때마다 전부 다시 뽑는다**(2026-09-18 사용자 요청). 종전에는 고른 것을 남기고
      모자란 만큼만 채웠는데, 마음에 안 들어 다시 누르면 같은 번호가 그대로 남아 "안 눌렸나?"
      가 됐다. 지우고 새로 뽑는 편이 버튼 이름("채우기")대로 동작한다.
  */
  const fillRandom = () => {
    const next = new Set<number>()
    while (next.size < 6) next.add(1 + Math.floor(Math.random() * 45))
    setPicked([...next].sort((a, b) => a - b))
  }

  const go = () => {
    if (picked.length !== 6) return
    router.push(`/lotto/analyze?numbers=${picked.join(',')}`)
  }

  const remaining = 6 - picked.length

  /*
    ⚠ 앞 세 장(이동 카드)을 **children 으로 받아** 여기서 함께 그린다. 그래야 카드 넉 장이 한
      격자에 서면서도, 번호판은 격자 **밖**(`nav` 다음 형제)에 놓인다 — 번호판은 이동 수단이
      아니라 도구라 `nav` 안에 들어가면 안 된다. 서버에서 만든 링크 카드를 클라이언트 컴포넌트에
      children 으로 넘기는 것은 Next 가 권하는 방식이고, 링크는 서버 렌더 그대로 남는다.
  */
  return (
    <>
      <nav className="sb-cards" aria-label="번호분석 종류">
        {cards}
      {/*
        넷째 카드이자 **번호판을 여는 버튼**. 앞 세 장과 같은 모양이지만 다른 화면으로 가지
        않으므로 `<a>` 가 아니라 `<button>` 이다 — 링크처럼 보이는 버튼은 새 탭으로 열리지
        않아 사용자를 헷갈리게 한다.
      */}
      <button
        type="button"
        className="sb-navcard is-mine"
        data-accent="reco"
        data-open={open ? '' : undefined}
        aria-expanded={open}
        aria-controls="mynum"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="sb-card-icon" data-accent="reco">
          <RewindGlyph />
        </span>
        <span className="sb-card-title">내 번호 분석</span>
        <span className="sb-card-summary">
          번호 6개를 고르면 그 번호로 예전부터 샀다면 어땠을지 보여 드립니다.
        </span>
        <span className="sb-card-cue" aria-hidden="true">
          {open ? '접기 ↑' : '번호 고르기 ↓'}
        </span>
      </button>
      </nav>

      {open && (
        <section className="mynum" id="mynum" aria-labelledby="mynum-title">
          <div className="mynum-head">
            <span className="mynum-icon" aria-hidden="true">
              <RewindGlyph width={20} height={20} />
            </span>
            <div>
              <h3 id="mynum-title">내 번호 분석</h3>
              <p>
                번호 6개를 고르면 <strong>1회차부터 매주 이 번호로 샀다면</strong> 어땠을지,
                역대 당첨번호와 몇 개나 맞았을지 보여 드립니다.
              </p>
            </div>
            {/* 닫기. 번호판이 길어 아래에서 위로 돌아가기 번거롭지 않게 머리에 둔다. */}
            <button type="button" className="mynum-close" onClick={() => setOpen(false)}>
              닫기
            </button>
          </div>

      {/*
        ── 용지 ────────────────────────────────────────────
        ⚠ **실제 로또 용지의 수동 칸을 본뜬다**(2026-09-18 사용자 요청). 동행복권 용지는 번호가
          **한 줄에 일곱 개**(1~7, 8~14 …)씩 인쇄돼 있고, 고른 번호의 칸을 연필로 칠한다.
          그 배치를 그대로 쓰면 복권을 사 본 사람은 설명 없이도 무엇을 하는 화면인지 안다.
        ⚠ 용지를 흉내 내되 **동행복권의 로고·상표는 쓰지 않는다.** 우리 화면이 공식 용지인 척하면
          안 된다 — 머리글에 '행운상자' 와 '연습용' 을 적어 둔다.
        ⚠ 칸이 375px 에서 38px 이라 터치 타겟 44px 에 모자란다. `::after` 로 **보이지 않는 여백
          3px**을 둘러 44px 을 만든다(칸 사이 간격이 6px 이라 옆 칸과 겹치지 않는다).
      */}
      <div className="mynum-slip">
        <div className="mynum-slip-head" aria-hidden="true">
          <span className="mynum-slip-brand">행운상자 · LOTTO 6/45</span>
          <span className="mynum-slip-mode">수동 · 연습용</span>
        </div>

        <div className="mynum-slip-body">
          <span className="mynum-slip-letter" aria-hidden="true">
            A
          </span>

          <div className="mynum-grid" role="group" aria-labelledby="mynum-title">
            {Array.from({ length: 45 }, (_, i) => i + 1).map((n) => {
              const on = picked.includes(n)
              return (
                <button
                  key={n}
                  type="button"
                  className="mynum-cell"
                  data-on={on ? '' : undefined}
                  aria-pressed={on}
                  /* 여섯을 다 골랐으면 나머지는 잠근다 — 눌러도 안 되는 이유를 말로도 준다. */
                  disabled={!on && picked.length >= 6}
                  onClick={() => toggle(n)}
                >
                  <span className="mynum-cell-num">{n}</span>
                  {/* 연필로 칠한 자국. 장식이라 접근성 트리에서 뺀다 — 상태는 `aria-pressed` 가 말한다. */}
                  <span className="mynum-mark" aria-hidden="true" />
                  {!on && picked.length >= 6 && (
                    <span className="sr-only">여섯 개를 이미 골랐습니다</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="mynum-foot">
        <div className="mynum-picked" aria-live="polite">
          {picked.length === 0 ? (
            <span className="mynum-empty">고른 번호가 없습니다 · 6개를 골라 주세요</span>
          ) : (
            <>
              <span className="mynum-balls">
                {picked.map((n) => (
                  <LottoBall key={n} number={n} size="sm" />
                ))}
              </span>
              <span className="mynum-count">
                {picked.length} / 6
                {remaining > 0 && <span className="mynum-left"> · {remaining}개 더</span>}
              </span>
            </>
          )}
        </div>

        <div className="mynum-actions">
          {picked.length > 0 && (
            <button type="button" className="mynum-reset" onClick={() => setPicked([])}>
              지우기
            </button>
          )}
          <button type="button" className="btn btn-secondary mynum-random" onClick={fillRandom}>
            <DiceIcon width={16} height={16} />
            무작위로 채우기
          </button>
          <button
            type="button"
            className="btn btn-primary mynum-go"
            onClick={go}
            disabled={picked.length !== 6}
          >
            샀다면? 보기
          </button>
        </div>
      </div>
      </section>
      )}
    </>
  )
}
