'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'

import { createSfxPlayer, type SfxPlayer } from '@/games/core/audio'
import type { GameMeta, GamePhase } from '@/games/core/types'
import type { GameControls } from './GameCanvas'
import { loadMuted, saveMuted } from './run-store'
import { DISCLAIMER } from '@/lib/site'
import { GameHud } from './GameHud'
import { GameResult } from './GameResult'
import { loadRun, saveRun } from './run-store'

/**
 * 게임 한 판의 껍데기 — 캔버스·HUD·결과 패널을 붙들고 상태를 소유한다.
 *
 * → docs/wiki/20-design/playground.md
 *
 * ── ⚠ dynamic import 경계가 여기다 ─────────────────────────────────
 * **서버 컴포넌트에서는 `ssr: false` 를 쓸 수 없다.** 그래서 경계를 이 클라이언트
 * 컴포넌트에 둔다. 이 프로젝트의 첫 `next/dynamic` 사례다.
 *
 * 두 단계로 나뉜다.
 *   ① 캔버스 어댑터(`GameCanvas`)를 지연 로드 — 캔버스 코드가 첫 페이로드에서 빠진다
 *   ② 게임 모듈은 `GameCanvas` 안에서 `GAME_LOADERS[slug]()` 로 → **slug 당 별도 청크**
 *
 * ── ⚠ CLS 0 — 스켈레톤과 캔버스가 같은 박스를 쓴다 ─────────────────
 * `--pg-ar` 은 서버가 아는 값(`meta.stage`)이라 **첫 HTML 부터 정확한 자리가 잡힌다.**
 * 캔버스가 늦게 로드돼도 레이아웃이 밀리지 않는다.
 */

const GameCanvas = dynamic(() => import('./GameCanvas'), {
  ssr: false,
  /** ⚠ 캔버스와 **같은 박스**여야 한다. 다르면 로드 순간 레이아웃이 튄다. */
  loading: () => <div className="pg-canvas-skeleton" aria-hidden="true" />,
})

/**
 * 단계별 **기본 문구** — 여섯 게임이 같은 말을 하게 하는 장치.
 *
 * ⚠ 게임이 `title`·`text` 를 보내면 그쪽이 이긴다. 게임마다 달라야 하는 것(예: 실패 시
 *   "3개를 모았습니다")만 게임이 채우고 나머지는 여기서 한 번에 정한다. 그래야 `phase` 만
 *   보내는 게임도 제대로 된 팝업을 얻는다 — 게임마다 문구를 따로 쓰면 여섯 개가 제각각이 된다.
 */
function defaultCopy(phase: GamePhase, meta: GameMeta): { title: string; text: string } {
  if (phase === 'ready') return { title: meta.title, text: meta.tagline }
  if (phase === 'cleared') {
    return { title: '6개 공을 모두 모았습니다', text: '아래에서 모은 번호를 확인할 수 있어요.' }
  }
  if (phase === 'failed') return { title: '6개 번호 모으기 실패', text: '다시 도전해 보세요.' }
  return { title: '', text: '' }
}

export function GameStage({ meta }: { meta: GameMeta }) {
  /** 획득한 번호. 이 컴포넌트가 소유하고 캔버스는 알려 주기만 한다. */
  const [awarded, setAwarded] = useState<number[]>([])
  const [complete, setComplete] = useState(false)
  /**
   * 화면에 캔버스를 띄울지.
   *
   * ⚠ **기본이 `true` 다.** 게임 페이지에 들어온 사람은 게임을 하러 온 것이라, "시작"을
   *   한 번 더 누르게 하는 것은 마찰일 뿐이다. 링크를 눌러 여기까지 온 것 자체가 명시적인
   *   상호작용이다(`reducedMotion` 을 게임에 적용하지 않는 근거와 같은 논리).
   *   ⚠ 예외는 하나 — **이미 6개를 다 모은 기록이 복원**되면 결과부터 보여준다.
   */
  const [playing, setPlaying] = useState(true)
  /** 다시하기. 올리면 캔버스와 게임 인스턴스가 통째로 교체된다. */
  const [runKey, setRunKey] = useState(0)
  /** 복원 판단이 끝났는가. 끝나기 전에는 아무것도 그리지 않는다(깜빡임 방지). */
  const [ready, setReady] = useState(false)
  /** 캔버스가 보낸 마지막 안내. `aria-live` 로 읽힌다. */
  const [status, setStatus] = useState('')
  const [hint, setHint] = useState('')
  /**
   * 게임이 알려 온 진행 단계 (2026-09-08).
   *
   * ⚠ **기본이 `'playing'` 이다.** 단계를 쓰지 않는 게임은 `phase` 를 한 번도 보내지 않고,
   *   그때 오버레이가 뜨면 그 게임은 시작조차 할 수 없다.
   */
  const [phase, setPhase] = useState<GamePhase>('playing')
  const [overlay, setOverlay] = useState<{ title?: string; text?: string }>({})

  /**
   * 효과음 음소거. **기본이 `true` 다** — 사용자가 켜기 전에는 아무 소리도 나지 않는다.
   *
   * ⚠ 첫 렌더는 무조건 `true` 로 시작하고 저장값은 마운트 뒤에 읽는다. 서버 HTML 과
   *   클라이언트 첫 렌더가 달라지면 하이드레이션이 깨진다(헤더의 테마 토글과 같은 이유).
   */
  const [muted, setMuted] = useState(true)

  /** 캔버스로 입력을 흘려보내는 통로. 오버레이의 "시작" 이 이걸 쓴다. */
  const controls = useRef<GameControls | null>(null)
  /**
   * 효과음 재생기.
   *
   * ⚠ **호스트가 소유한다.** 캔버스 안에서 만들면 다시하기 때마다 `AudioContext` 가 새로
   *   생겨 기기 한도(브라우저당 6개 안팎)를 금방 먹는다.
   */
  const sfx = useRef<SfxPlayer | null>(null)
  /** 스크롤 목적지. "번호보기" 와 "다시하기" 가 서로의 자리로 데려간다. */
  const stageRef = useRef<HTMLDivElement>(null)
  const resultRef = useRef<HTMLDivElement>(null)
  /**
   * 다시하기 직후인가.
   *
   * ⚠ 다시하기를 눌렀는데 "시작" 을 **또** 누르게 하면 마찰이다. 새 인스턴스가 `'ready'` 를
   *   알려 오는 순간 대신 눌러 준다. 같은 틱에 `'playing'` 으로 바뀌므로 깜빡이지 않는다.
   */
  const autoStart = useRef(false)

  /** 복원된 번호를 캔버스에 한 번만 주입한다. 이후에는 캔버스가 스스로 쌓는다. */
  const restored = useRef<number[]>([])

  /*
    ⚠ **첫 마운트에 한 번만** 복원한다. 이후 상태 변화로 다시 읽으면 방금 새로 시작한
      판이 옛 기록으로 되돌아간다.
  */
  useEffect(() => {
    const saved = loadRun(meta.slug)
    if (saved !== null) {
      restored.current = saved.numbers
      setAwarded(saved.numbers)
      setComplete(saved.complete)
      /*
        ⚠ **완료된 기록이 있어도 캔버스를 내리지 않는다**(2026-09-10 수정).

          예전에는 `setPlaying(!saved.complete)` 로 완료 기록이 있으면 결과 패널만 띄웠다.
          "한 일을 무르는 것처럼 보인다" 는 이유였는데, 실제로는 정반대로 읽혔다 —
          **게임 페이지에 들어왔는데 게임이 없고 "다시하기" 버튼만 있다.** 한 번 완주하면
          30분 동안(`run-store` 의 `STALE_MS`) 그 게임은 계속 그렇게 열린다. 사용자에게는
          고장으로 보인다.

          이제 캔버스를 항상 띄우고, 이미 6개를 모은 상태는 **게임이 `cleared` 오버레이로**
          알린다(계약: `phase` 이벤트). 결과 패널은 그 아래에 그대로 있으므로 "한 일" 도
          사라지지 않는다.

          ⚠ 게임 쪽 대응이 필요하다 — `create` 시점에 `pool.complete` 면 곧바로 `cleared` 를
            보내야 한다. 안 보내는 게임은 이미 다 모은 판을 계속 굴리게 된다.
            → docs/wiki/10-contracts/playground-game-contract.md "이미 끝난 판으로 시작될 때"

        ⚠ 미완이면 획득 번호만 pool 에 주입하고 게임은 처음부터 시작한다. **물리 상태는
          복원하지 않는다** — 여섯 게임에 직렬화 계약까지 요구하면 계약이 두 배로
          복잡해지고 버그는 여섯 배가 된다.
      */
    }
    setReady(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 첫 마운트 한 번만 복원한다.
  }, [])

  /*
    효과음 재생기의 수명은 **이 화면 전체**다(판 하나가 아니다).
    ⚠ 저장된 음소거 설정도 여기서 한 번만 읽는다. 기본은 켜짐(= 소리 없음)이다.
  */
  useEffect(() => {
    const saved = loadMuted()
    setMuted(saved)
    sfx.current = createSfxPlayer(saved)
    return () => {
      sfx.current?.destroy()
      sfx.current = null
    }
  }, [])

  /*
    게임을 **첫 화면에 올린다.**
    ⚠ 내비게이션을 없애는 것이 아니라 위로 밀어내는 것이다 — 게임이 화면 밖에 있으면
      스크롤부터 해야 플레이할 수 있고, 모바일에서 그것이 가장 큰 마찰이었다.
    ⚠ 이미 스크롤된 상태(뒤로가기 복원·앵커 진입)면 건드리지 않는다. 사용자가 보고 있던
      자리를 빼앗는 편이 더 나쁘다.
  */
  useEffect(() => {
    if (!ready) return
    if (window.scrollY > 8) return
    const el = stageRef.current
    if (el === null) return
    const id = window.requestAnimationFrame(() => el.scrollIntoView({ block: 'nearest' }))
    return () => window.cancelAnimationFrame(id)
  }, [ready])

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev
      /*
        ⚠ **켜는 이 클릭이 곧 브라우저가 요구하는 사용자 제스처다.** `AudioContext` 는 이
          시점에 처음 만들어지므로 자동재생 정책에 걸릴 여지가 없다.
      */
      sfx.current?.setMuted(next)
      saveMuted(next)
      return next
    })
  }, [])

  /**
   * 목적지로 데려간다 — **화면을 가리는 것들을 빼고 계산한다.**
   *
   * ── ⚠ 왜 `scrollIntoView` 로는 부족한가 ────────────────────────────
   * `block:'start'` 는 요소의 **문서상 위끝**을 뷰포트 위끝에 맞춘다. 그런데 이 사이트에는
   * **sticky 헤더(60px)가 위를 덮고 하단 탭바(56px)가 아래를 덮는다.** 그래서 결과 카드가
   * 제목부터 잘려 "번호확인을 눌렀는데 분석 버튼만 보인다" 가 됐다(2026-09-16 실측).
   *
   * 여기서는 실제로 떠 있는 두 막대의 높이를 **DOM 에서 재서** 쓸 수 있는 세로 공간을
   * 구하고, 그 안에 요소가 들어가면 **가운데에**, 들어가지 않으면 **위를 맞춰** 세운다.
   * 탭바는 768px 이상에서 `display:none` 이라 높이가 0 이 된다 — 미디어쿼리를 따로 두지
   * 않아도 데스크톱에서 저절로 맞는다.
   *
   * ⚠ 부드러운 스크롤 여부는 CSS(`scroll-behavior`)가 정한다. `behavior` 를 넘기지 않으면
   *   그 설정을 따르고, 움직임 최소화에서는 base.css 가 이미 `auto` 로 눌러 두었다.
   */
  const scrollTo = useCallback((el: HTMLElement | null) => {
    if (el === null) return

    const barHeight = (selector: string): number => {
      const node = document.querySelector(selector)
      return node === null ? 0 : node.getBoundingClientRect().height
    }
    const top = barHeight('.site-header')
    const bottom = barHeight('.tabbar')

    const rect = el.getBoundingClientRect()
    const available = window.innerHeight - top - bottom
    const docTop = rect.top + window.scrollY

    /*
      들어가면 남는 공간을 위아래로 나눠 가운데에 세운다 — 카드 하나가 화면 한가운데
      떠 있는 편이 "다 보인다" 는 사실을 가장 분명하게 전한다.
      들어가지 않으면 위를 맞춘다. 제목부터 읽어야 무엇을 보는 화면인지 알 수 있다.
    */
    const offset = rect.height <= available ? (available - rect.height) / 2 : 8
    window.scrollTo({ top: Math.max(0, docTop - top - offset) })
  }, [])

  const handlePhase = useCallback(
    (next: GamePhase, title?: string, text?: string) => {
      if (next === 'ready' && autoStart.current) {
        autoStart.current = false
        controls.current?.press('primary')
        return
      }
      setPhase(next)
      setOverlay({ title, text })
    },
    [],
  )

  /** 캔버스가 번호를 하나 얻을 때마다 부른다. */
  const handleAward = useCallback(
    (value: number, _slot: number, done: boolean) => {
      setAwarded((prev) => {
        const next = [...prev, value]
        /*
          ⚠ **획득할 때마다 저장한다.** 버튼을 누를 때가 아니다 — 뒤로가기·스와이프는
            버튼을 거치지 않는다. 90초를 플레이해 얻은 번호라면 추천보다 훨씬 아프다.
        */
        saveRun(meta.slug, next, done)
        return next
      })
      if (done) setComplete(true)
    },
    [meta.slug],
  )


  const restart = useCallback(
    (auto: boolean) => {
      restored.current = []
      autoStart.current = auto
      setAwarded([])
      setComplete(false)
      setStatus('')
      setHint('')
      setPhase('playing')
      setOverlay({})
      saveRun(meta.slug, [], false)
      setRunKey((k) => k + 1)
      setPlaying(true)
      /*
        ⚠ 결과 패널에서 눌렀다면 화면은 저 아래에 있다. 게임으로 **데려다 준다** —
          다시하기를 눌렀는데 아무 일도 안 일어나 보이면 고장으로 읽힌다.
      */
      requestAnimationFrame(() => scrollTo(stageRef.current))
    },
    [meta.slug, scrollTo],
  )

  if (!ready) {
    return <div className="pg-canvas-skeleton" aria-hidden="true" />
  }

  return (
    <div className="pg-stage-wrap">
      {playing && (
        <>
          {/*
            ⚠ `--pg-ar` 로 자리를 먼저 잡는다. 서버가 아는 값이라 첫 HTML 부터 정확하다.
            ⚠ `key` 를 올리면 인스턴스가 통째로 교체된다 — 재시작은 상태를 되돌리는 것이
              아니라 `destroy` 후 `create` 를 다시 부르는 것이다(계약).
          */}
          <div
            ref={stageRef}
            className="pg-stage"
            style={{ ['--pg-ar' as string]: `${meta.stage.width} / ${meta.stage.height}` }}
          >
            <GameCanvas
              key={runKey}
              meta={meta}
              initialNumbers={restored.current}
              onAward={handleAward}
              onStatus={setStatus}
              onHint={setHint}
              onPhase={handlePhase}
              onControls={(c) => {
                controls.current = c
              }}
              onSfx={(name) => sfx.current?.play(name)}
            />

            {/*
              ⚠ 오버레이는 **캔버스가 아니라 DOM** 이다. 캔버스에 그린 버튼은 스크린리더에
                전혀 보이지 않고 탭으로 닿지도 않는다. 게임은 단계만 알리고 버튼은 여기서
                그린다(→ 계약의 `phase` 이벤트).
            */}
            {phase !== 'playing' && (
              <div className="pg-overlay">
                <div
                  className="pg-overlay-panel"
                  role="group"
                  aria-label={overlay.title ?? defaultCopy(phase, meta).title}
                >
                  <p className="pg-overlay-title">
                    {overlay.title ?? defaultCopy(phase, meta).title}
                  </p>
                  <p className="pg-overlay-text">{overlay.text ?? defaultCopy(phase, meta).text}</p>

                  <div className="pg-overlay-actions">
                    {phase === 'ready' && (
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => controls.current?.press('primary')}
                      >
                        게임시작
                      </button>
                    )}

                    {/*
                      ⚠ 실패에는 **다른 게임하기**를 함께 둔다(2026-09-10 계약).
                        다시하기만 주면 막 실패한 사람을 같은 벽 앞에 가둬 두게 된다.
                      ⚠ 실패에 "번호분석" 은 두지 않는다 — 6개가 안 모였으면 분석할 조합이 없다.
                    */}
                    {phase === 'failed' && (
                      <>
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => restart(true)}
                        >
                          다시하기
                        </button>
                        <Link className="btn btn-secondary" href="/playground">
                          다른 게임하기
                        </Link>
                      </>
                    )}

                    {/*
                      ⚠ 완료에는 **다른 게임하기**를 두지 않는다. 방금 모은 번호를 보러 가는
                        것이 먼저다 — 목록으로 가는 길은 결과 카드 아래에 이미 있다.
                    */}
                    {phase === 'cleared' && (
                      <>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => restart(true)}
                        >
                          다시하기
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => scrollTo(resultRef.current)}
                        >
                          번호확인
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <GameHud
            meta={meta}
            awarded={awarded}
            status={status}
            hint={hint}
            muted={muted}
            onToggleMute={toggleMute}
          />
        </>
      )}

      {complete && (
        <div ref={resultRef}>
          <GameResult meta={meta} numbers={awarded} onRestart={() => restart(true)} />
        </div>
      )}

      {/*
        ⚠ JS 를 끈 사용자에게 **막다른 길을 주지 않는다.** 게임은 자바스크립트가 있어야
          하지만, 번호가 필요한 것이라면 사이트 안에 다른 길이 있다.
        ⚠ "게임 건너뛰고 번호 받기" 버튼은 만들지 않는다 — 게임 자체를 무의미하게 만든다.
          다른 길을 안내하는 것이 정직한 답이다(→ playground.md 접근성 절).
      */}
      <noscript>
        <p className="pg-noscript">
          이 게임은 자바스크립트가 필요합니다. 번호가 필요하시면{' '}
          <Link href="/lotto/recommend">번호추천</Link>을 이용하세요.
        </p>
      </noscript>

      <p className="disclaimer pg-disclaimer">
        <span className="disclaimer-icon" aria-hidden="true">
          ⓘ
        </span>
        <span>{DISCLAIMER.playground}</span>
      </p>
    </div>
  )
}
