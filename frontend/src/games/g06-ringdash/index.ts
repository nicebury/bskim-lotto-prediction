import { GAMES } from '@/games/core/catalog'
import { readPalette } from '@/games/core/palette'
import type { GameContext, GameInstance, GameModule, Palette } from '@/games/core/types'
import { ballRange } from '@/lib/lotto'

import {
  BIRD_HIT_R,
  BIRD_R,
  BIRD_X,
  CRASH_FLASH_SEC,
  CRASH_HOLD_SEC,
  DONE_CELEBRATE_SEC,
  FIRST_GAP,
  FIRST_PIPE_X,
  FLAP_VY,
  GAP_BASE,
  GAP_CENTER_MAX_DELTA,
  GAP_MIN,
  GAP_STEP,
  GRAVITY,
  GROUND_H,
  MAX_ATTEMPTS,
  MAX_FALL,
  MIN_PIPE_LEN,
  NUMBER_RING_ORDER,
  PARTICLE_MAX,
  PARTICLE_MAX_LOW,
  PIPE_SPACING,
  PIPE_W,
  PX_PER_METER,
  SPEED,
  STREAK_BONUS,
  STREAK_BONUS_MAX,
} from './constants'
import { createRenderer } from './render'
import { createScenery } from './scenery'

/**
 * G06 · 링 통과 비행.
 *
 * → 사양서: docs/wiki/20-design/game-g06-ringdash.md
 * → 계약:   docs/wiki/10-contracts/playground-game-contract.md
 *
 * 탭으로 날갯짓해 링을 계속 통과하며, 그중 **여섯 개의 번호 링**에서 번호를 얻는다.
 *
 * ── ★ 2026-09-17 전면 개편 (사용자 지시 여섯 건) ───────────────────
 * 사용자가 직접 플레이하고 준 지적 — *"게임이 어렵네"* · *"떨어지고 나면 바로 시작하는데
 * 새가 바로 떨어지네"* · *"안 눌렀을때 떨어지는 속도가 너무 빨라"* — 에 세 가지 규칙 변경이
 * 더해졌다. **개편 전 규칙(6개 통과 = 6개 수집 · 목숨 무제한)은 폐기됐다.**
 *
 *   ① 기회 **9번**. 충돌 1회 = 1 소모. 다 쓰면 `cleared`(6개 모음) 또는 `failed`
 *   ② 캔버스 HUD 에 **비행 거리(m)**. 13px = 1m → 10m/s, 파이프 간격 20m
 *   ③ 충돌 후 **자동 재개 폐지** — `crashed`(대기) → 탭 → `hover`(무중력) → 탭 → `flying`
 *   ④ 중력 1500→900 · 최대 낙하 800→480 · 임펄스 −430→−360
 *   ⑤ 링 20개 중 **2·6·9·13·16·20번째만 번호 링**, 나머지는 꽝 링
 *   ⑥ 6개를 모아도 바로 끝나지 않는다 — **계속 날기 / 번호 확인**을 묻는다
 *
 * ── ★ 그래도 이 게임의 진짜 요구사항은 "쉬울 것" 이다 ───────────────
 * 기획 원문이 직접 위험을 지적한 유일한 게임이다 — *"난도 조절 필수. 너무 어려우면 번호를
 * 못 뽑고 이탈"*. **숙련되지 않은 사용자가 기회 9번 안에 번호 6개를 모을 수 있는가**가
 * 유일한 진짜 완료 기준이다. 아래 장치들이 전부 그 하나를 위해 있다.
 *
 *   ① 첫 파이프는 3초 뒤에 오고 간극이 195px 다(`FIRST_PIPE_X`·`FIRST_GAP`)
 *   ② **충돌해도 번호를 잃지 않는다.** 줄어드는 것은 기회뿐이다
 *   ③ 자동 재개가 없다 — 준비됐을 때 스스로 이어 난다
 *   ④ 첫 충돌에만 한 번 힌트를 준다
 *   ⑤ 2회 연속 충돌하면 다음 간극을 은근히 넓힌다(`STREAK_BONUS`)
 *   ⑥ 남은 기회를 HUD 에 항상 보여 준다
 *
 * ── 좌표 규칙 ──────────────────────────────────────────────────────
 * **새는 x 가 고정이고 세계가 왼쪽으로 흐른다.** 그래서 파이프는 월드 좌표(`worldX`)로
 * 두고 화면 좌표를 `worldX − scroll` 로 구한다. 이렇게 하면 렌더 보간이 `scroll` 하나만
 * 섞으면 되고, 파이프 좌표를 매 프레임 갱신하는 루프가 통째로 사라진다.
 */

const meta = GAMES.find((g) => g.slug === 'ringdash')
if (meta === undefined) {
  // catalog 와 폴더가 어긋난 상태다. 조용히 넘어가면 원인을 찾기 어렵다.
  throw new Error("catalog.ts 에 'ringdash' 항목이 없습니다")
}

/**
 * 파이프 한 쌍 + 간극에 걸린 링 하나.
 *
 * ⚠ 번호(`value`)는 **호스트가 예약해 준 것**이다. 게임에는 1~45 를 고를 권한이 없다.
 *   `token` 은 확정(`commit`)·반납(`release`) 때 그대로 돌려줘야 하는 표다.
 */
interface Pipe {
  worldX: number
  gapCenter: number
  gap: number
  /**
   * 예약 토큰. **꽝 링이면 `null`** 이다.
   * ⚠ 꽝 링은 `reserve()` 자체를 하지 않는다. 예약만 해 두고 안 주면 그 번호가 판이 끝날
   *   때까지 풀에서 잠겨, 남은 번호 링이 고를 수 있는 폭이 좁아진다.
   */
  token: number | null
  /** 구간 색을 정하는 값. 꽝 링이면 `null` 이고 링이 무채색으로 그려진다. */
  value: number | null
  /** 몇 번째 링인가(1-기반). `NUMBER_RING_ORDER` 와 대조해 번호 링 여부를 정한다. */
  order: number
  /** 새가 우측 끝을 지났는가. 지난 프레임에 `commit` 한다. */
  passed: boolean
  /** 통과 연출 진행(0~1). 1 이 되면 링을 그리지 않는다. */
  burst: number
}

/**
 * 내부 진행 상태.
 *
 * ⚠ 계약의 `GamePhase`(ready/playing/failed/cleared)와 **일부러 다르다.** `hover`·`crashed`·
 *   `choice` 동안 호스트에는 `playing` 을 유지해야 한다 — 호스트는 `phase !== 'playing'` 인
 *   동안 내내 캔버스를 오버레이로 덮으므로, 그 셋을 계약 단계로 올리면 **캔버스가 직접
 *   그리는 안내와 버튼이 오버레이에 가려 보이지 않는다.**
 */
type Phase =
  /** 시작 전. 중력 없이 부유한다. 호스트가 "게임시작" 을 띄운다 */
  | 'ready'
  /** 충돌 후 이어 날기로 한 직후. **중력이 걸리지 않는다** — `ready` 와 같은 취급 */
  | 'hover'
  | 'flying'
  /** 충돌해서 멈춰 있다. 탭하면 `hover` 로 간다 */
  | 'crashed'
  /** 6개를 다 모았고 기회가 남았다. "계속 날기 / 번호 확인" 을 묻는 중 */
  | 'choice'
  | 'done'

const game: GameModule = {
  meta,

  create(ctx: GameContext): GameInstance {
    const { stage, pool, rng, draw, emit, reducedMotion, quality } = ctx

    /*
      ⚠ **`ctx.palette` 는 스냅샷이다.** 호스트가 `create()` 에 값으로 넘기고, 테마가 바뀌면
        자기 지역 변수만 갈아 끼운다 — 게임이 쥔 객체는 처음 것 그대로다. 그래서 `DrawKit`
        으로 그린 볼은 다크로 바뀌는데 게임이 직접 칠한 하늘·파이프·패널은 흰 채로 남아
        **화면이 반씩 갈린다.** 다른 게임 세션들도 같은 것을 발견해 위키에 남겼다.
      ⚠ 호스트가 전달 경로를 만들 때까지 **1초에 한 번 직접 읽는다.** `getComputedStyle`
        한 번은 초당 1회면 비용이 없고, 색이 실제로 달라졌을 때만 구워 둔 스프라이트를 버린다.
        매 프레임 읽지 않는 이유가 그것이다 — 읽는 값이 아니라 **다시 굽는 비용**이 문제다.
    */
    let palette: Palette = ctx.palette
    const getPalette = () => palette
    /** 색이 실제로 바뀌었는지 판정하는 값. 전 화면을 대표하는 것들만 이어 붙인다. */
    const paletteKey = (p: Palette) =>
      `${p.bg}|${p.surface}|${p.text}|${p.border}|${p.svc.lotto}|${p.svc.news}|${p.ball[1]}`
    let lastPaletteKey = paletteKey(palette)
    /** 폴링 카운터. 60스텝 = 1초. */
    let paletteTick = 0

    const groundY = stage.height - GROUND_H
    /** 새의 기본 높이. 첫 파이프의 간극도 이 근처에 놓아 첫 통과를 쉽게 만든다. */
    const baseY = stage.height * 0.45

    /*
      ⚠ 배경은 **독립 스트림**(`fork`)을 쓴다. 배경 배치가 물리와 같은 난수를 소비하면
        같은 시드로도 파이프 배치가 달라져 재현성이 깨진다.
    */
    const scenery = createScenery(stage, getPalette, rng.fork(), draw)
    const renderer = createRenderer(getPalette, draw)
    const particles = draw.particles(PARTICLE_MAX)

    /* ── 상태 ─────────────────────────────────────────────── */

    let phase: Phase = 'ready'
    let y = baseY
    let prevY = baseY
    let vy = 0
    /** 누적 전진 거리. 파이프의 화면 좌표는 이 값을 빼서 구한다. */
    let scroll = 0
    let prevScroll = 0

    const pipes: Pipe[] = []
    /** 다음 파이프를 세울 월드 x. 첫 값이 곧 "3초 뒤" 다. */
    let nextSpawnX = FIRST_PIPE_X
    let spawnCount = 0
    /** 이전 간극 중심. 연속 극단 배치를 막는 기준점이다. */
    let lastCenter = baseY

    /**
     * 지금까지 지나온 링 수. 간극이 좁아지는 속도가 여기에 달려 있다.
     * ⚠ 계약의 `phase: 'cleared'` 와 헷갈리지 않게 이름을 `passedCount` 로 둔다. 개편 전에는
     *   `cleared` 였는데, 이제 "통과 수" 와 "완료 단계" 가 더는 같은 뜻이 아니다 —
     *   20개를 지나야 6개를 모으기 때문이다.
     */
    let passedCount = 0
    /** 연속 충돌 수. 통과에 성공하면 0 으로 돌아간다. */
    let crashStreak = 0
    /** 첫 충돌에만 힌트를 준다. 매번 주면 잔소리가 된다. */
    let hintShown = false

    /** 쓴 기회. `MAX_ATTEMPTS` 에 닿으면 판이 끝난다. */
    let attemptsUsed = 0
    const attemptsLeft = () => MAX_ATTEMPTS - attemptsUsed

    /**
     * 현재 비행 거리(m).
     * ⚠ `scroll` 하나에서 유도한다. 별도 누적 변수를 두면 충돌·재개 때 한쪽만 손대는 버그가
     *   반드시 생긴다 — 거리는 **세계가 흐른 양**과 정의상 같다.
     */
    const metres = () => Math.floor(scroll / PX_PER_METER)

    /**
     * 완주 선택(`choice`)에서 가리키고 있는 항목.
     * `0` = 계속 날기 · `1` = 번호 확인.
     * ⚠ 기본값을 **계속 날기**로 둔다. 기회가 남았을 때만 묻는 화면이라, 묻는 의미가 있는
     *   쪽이 기본이어야 한다.
     */
    let choiceIndex: 0 | 1 = 0

    let readyT = 0
    /** `hover` 부유의 기준 높이. 이어 날기로 한 순간의 `y` 를 붙들어 둔다. */
    let hoverBaseY = baseY
    let crashT = 0
    let flashT = 0
    let shakeT = 0
    let doneT = 0
    /** 마지막 날갯짓 이후 경과. 날개 각도에 쓴다. */
    let flapT = 1

    /** 새 몸통에 새길 번호. 직전에 모은 것이다. */
    let bodyNumber: number | null =
      pool.awarded.length > 0 ? pool.awarded[pool.awarded.length - 1] : null

    /*
      ⚠ **첫 `fixedUpdate` 에서 보낸다.** `create()` 안에서 곧바로 emit 하면 호스트가 아직
        인스턴스를 상태에 붙이기 전이라 이벤트가 버려질 수 있다. 계약의 "이미 끝난 판" 절도
        같은 자리를 쓴다.
    */
    let started = false

    /* ── 파이프 배치 ──────────────────────────────────────── */

    /**
     * 이번에 세울 파이프의 간극.
     *
     * ⚠ 첫 파이프만 특별히 넓다(튜토리얼). 이후에는 통과 수만큼 좁아지되 **160 아래로는
     *   내려가지 않는다** — 새 지름(28) 대비 5.7배로, 원본 플래피류(약 3.2배)보다 명백히 쉽다.
     * ⚠ 연속 충돌 보정은 상한을 둔다. 무한정 넓히면 파이프가 없는 것과 같아진다.
     * ⚠ 기울기(`GAP_STEP`)를 2026-09-17 에 5 → 1.2 로 눕혔다. 20개 이상을 지나는 판이 되어,
     *   옛 계수라면 5번째 링에서 이미 하한에 닿아 남은 15개를 내내 최소 간극으로 지난다.
     */
    function gapFor(): number {
      const base =
        spawnCount === 0 ? FIRST_GAP : Math.max(GAP_MIN, GAP_BASE - GAP_STEP * passedCount)
      const bonus = Math.min(STREAK_BONUS_MAX, Math.floor(crashStreak / 2) * STREAK_BONUS)
      return base + bonus
    }

    /**
     * 이 간극이 놓일 수 있는 중심 높이의 상·하한.
     *
     * ⚠ **간극 크기에서 유도한다.** 사양서의 고정 범위(`[130, stage.h − 170]`)는 무대 560 을
     *   전제로 쓴 값인데, 계약이 무대 세로를 420~450 으로 못 박아 그대로 쓰면 하단 파이프가
     *   지면 아래로 내려간다. 무대 560·간극 195 에서 `[127.5, 392.5]` 가 나와 사양서 값과
     *   사실상 같다 — 수치를 바꾼 것이 아니라 다시 유도한 것이다.
     */
    function centerBounds(gap: number): { min: number; max: number } {
      const half = gap / 2
      return { min: half + MIN_PIPE_LEN, max: groundY - half - MIN_PIPE_LEN }
    }

    /**
     * 이번 간극의 중심 높이.
     *
     * ⚠ 이전 중심 대비 ±90 으로 자른다. 자르지 않으면 "위 끝 다음에 아래 끝" 같은 배치가
     *   나와, 2초 안에 화면을 세로로 가로질러야 하는 구간이 생긴다. 그것이 이탈이다.
     */
    function nextCenter(gap: number): number {
      const { min, max } = centerBounds(gap)
      const target = rng.range(min, max)
      const limited = draw.clamp(
        target,
        lastCenter - GAP_CENTER_MAX_DELTA,
        lastCenter + GAP_CENTER_MAX_DELTA,
      )
      return draw.clamp(limited, min, max)
    }

    /**
     * 이 순번의 링이 **번호 링인가.**
     *
     * ⚠ 난수가 아니라 `NUMBER_RING_ORDER`(2·6·9·13·16·20) 고정 배치다. 확률로 뽑으면
     *   기댓값은 맞아도 **분산이 커서** 운 나쁜 판은 40개를 넘기고, 그러면 기회 9번으로
     *   절대 못 채운다. 사용자가 *"잘 배치해야 할거 같아"* 라고 한 것이 이 분산이다.
     * ⚠ 이미 6개를 다 모은 뒤(계속 비행)에는 **전부 꽝**이다. 풀에 남은 번호를 예약할
     *   이유가 없고, 예약하면 그 번호가 끝까지 잠긴다.
     *
     * ── ★ 왜 `NUMBER_RING_ORDER.includes(order)` 가 아닌가 ─────────────
     * 그렇게 쓰면 **번호 링을 놓치는 순간 그 순번이 영영 사라진다.** 2번째 링에 부딪혀
     *   지나치면 그 링은 `release` 되는데 순번은 이미 지나가, 20개를 다 지나도 다섯 개밖에
     *   못 모은다. 충돌이 잦은 사용자일수록 더 못 모으는 — 이 게임이 가장 피해야 할 구조다.
     *
     * 그래서 기준을 **순번이 아니라 "지금까지 몇 개를 모았는가"** 로 둔다. `awarded.length`
     * 번째 목표 순번에 **도달했으면** 번호 링을 세운다. 놓치면 `awarded` 가 늘지 않으므로
     * 바로 다음 링이 번호 링이 되어 **저절로 복구된다.**
     *
     * ⚠ 예약은 한 번에 하나만. 아직 지나지 않은 번호 링이 화면에 떠 있는데 또 세우면,
     *   둘 다 통과했을 때 목표 순번을 건너뛰어 20개보다 훨씬 일찍 끝난다.
     */
    function isNumberRing(order: number): boolean {
      if (pool.complete) return false
      if (pipes.some((p) => p.token !== null && !p.passed)) return false
      const target = NUMBER_RING_ORDER[pool.awarded.length]
      return target !== undefined && order >= target
    }

    /**
     * 파이프를 하나 세운다.
     *
     * ⚠ **번호 링이면 여기서 예약한다.** 링에 구간 색이 미리 보이므로, 보이는 시점에 이미
     *   풀에서 빠져 있어야 그 색이 거짓말이 되지 않는다(색 힌트형 계약).
     * ⚠ **꽝 링은 예약 자체를 하지 않는다.** 예약해 두고 주지 않으면 그 번호가 판이 끝날
     *   때까지 잠겨, 뒤에 올 번호 링이 고를 수 있는 폭이 좁아진다.
     * ⚠ 번호 링인데 예약이 `null` 이면(남은 번호 없음) **꽝 링으로 강등해 세운다.** 개편
     *   전에는 파이프를 아예 세우지 않았는데, 이제는 번호를 다 모은 뒤에도 계속 날 수
     *   있으므로 파이프가 사라지면 **날 곳이 없어진다.**
     */
    function spawnPipe(): void {
      const order = spawnCount + 1
      const res = isNumberRing(order) ? pool.reserve() : null

      const gap = gapFor()
      /*
        ⚠ 첫 파이프의 간극은 **새가 지금 있는 높이**에 맞춘다. 무작위로 놓으면 튜토리얼
          구간에서 곧장 위나 아래 끝으로 옮겨 가야 하는 판이 나온다.
      */
      const bounds = centerBounds(gap)
      const center =
        spawnCount === 0 ? draw.clamp(baseY, bounds.min, bounds.max) : nextCenter(gap)
      lastCenter = center
      spawnCount += 1

      pipes.push({
        worldX: nextSpawnX,
        gapCenter: center,
        gap,
        order,
        token: res === null ? null : res.token,
        value: res === null ? null : res.value,
        passed: false,
        burst: 0,
      })
    }

    /**
     * 화면 오른쪽 밖에 여유분이 늘 하나 서 있도록 채운다.
     *
     * ⚠ 개편 전에는 `pool.complete` 면 곧바로 돌아갔다. 이제는 **번호를 다 모은 뒤에도
     *   계속 날 수 있으므로**(사용자 지시 ⑥) 파이프를 계속 세워야 한다. 멈추면 6개를
     *   채운 순간 세상이 텅 비어, "계속 날기" 를 골라도 날 곳이 없다.
     */
    function fillPipes(): void {
      while (nextSpawnX - scroll < stage.width + PIPE_W) {
        spawnPipe()
        nextSpawnX += PIPE_SPACING
      }
    }

    /**
     * 파이프를 버린다. 통과하지 못한 **번호 링**이면 번호를 풀에 돌려준다.
     * ⚠ 꽝 링은 `token` 이 `null` 이라 돌려줄 것이 없다. 이 분기를 빼먹으면 `release(null)`
     *   이 되어 타입은 통과하더라도 풀이 엉뚱한 토큰을 지운다.
     */
    function dropPipe(index: number): void {
      const p = pipes[index]
      if (!p.passed && p.token !== null) pool.release(p.token)
      pipes.splice(index, 1)
    }

    /* ── 판정 ─────────────────────────────────────────────── */

    /** 원 대 사각. 파이프는 위·아래 두 개의 사각이다. */
    function circleRect(
      cx: number,
      cy: number,
      r: number,
      rx: number,
      ry: number,
      rw: number,
      rh: number,
    ): boolean {
      if (rh <= 0) return false
      const nx = draw.clamp(cx, rx, rx + rw)
      const ny = draw.clamp(cy, ry, ry + rh)
      const dx = cx - nx
      const dy = cy - ny
      return dx * dx + dy * dy <= r * r
    }

    function hitsPipe(p: Pipe, by: number): boolean {
      const px = p.worldX - scroll
      // 굵은 판정을 돌리기 전에 x 범위로 먼저 거른다. 파이프가 셋씩 있어도 대부분 여기서 끝난다.
      if (BIRD_X + BIRD_HIT_R < px || BIRD_X - BIRD_HIT_R > px + PIPE_W) return false
      const top = p.gapCenter - p.gap / 2
      const bottom = p.gapCenter + p.gap / 2
      return (
        circleRect(BIRD_X, by, BIRD_HIT_R, px, -40, PIPE_W, top + 40) ||
        circleRect(BIRD_X, by, BIRD_HIT_R, px, bottom, PIPE_W, groundY - bottom)
      )
    }

    /* ── 사건 ─────────────────────────────────────────────── */

    function flap(): void {
      /*
        ⚠ 속도를 **더하지 않고 덮어쓴다.** 더하면 연타할수록 위로 쏘아 올라가 천장에
          붙어 버리고, 그러면 조작이 "누르기" 가 아니라 "얼마나 빨리 누르기" 가 된다.
      */
      vy = FLAP_VY
      flapT = 0
      /** 사용자의 능동적 행동. ⚠ 결과를 기다리지 않고 **누른 그 순간** 울린다. */
      emit({ type: 'sfx', name: 'shoot' })
    }

    /**
     * 새가 파이프 우측 끝을 지났다.
     *
     * ⚠ **꽝 링과 번호 링이 여기서 갈린다.** 꽝 링은 통과 수와 거리만 올린다 — 사용자 지시
     *   *"6개를 통과하면 무조건 6개를 모으게 하지말고"* 가 바로 이 분기다.
     */
    function passPipe(p: Pipe): void {
      p.passed = true
      passedCount += 1
      crashStreak = 0

      if (p.token === null) {
        /*
          꽝 링.
          ⚠ `blank` 는 계약이 *"맞았지만 소득이 없다"* 에 배정한 소리다. 아무 소리도 내지
            않으면 통과했는지 아닌지 화면을 봐야만 알 수 있다.
          ⚠ 진동은 보내지 않는다. 20개를 지나는 동안 매번 울리면 그것만으로 성가시다.
        */
        p.burst = 0.001
        emit({ type: 'sfx', name: 'blank' })
        return
      }

      const res = pool.commit(p.token)

      if (!res.ok) {
        /*
          ⚠ `full`(이미 6개를 다 모았다) 이면 토큰이 아직 살아 있다. 돌려주지 않으면 그
            번호가 판이 끝날 때까지 잠긴다. `stale` 이면 이미 빠져 있어 아무 일도 없다.
        */
        pool.release(p.token)
        p.token = null
        p.value = null
        return
      }

      bodyNumber = res.value
      p.burst = 0.001

      emit({ type: 'haptic', ms: 20 })
      /*
        ⚠ **완주한 순간에는 `hit` 를 보내지 않는다.** 팡파르(`clear`)와 겹치면 뭉개지고,
          마지막 한 개는 어차피 팡파르가 말해 준다(계약 효과음 절).
      */
      if (!res.complete) emit({ type: 'sfx', name: 'hit' })
      /*
        ⚠ 획득을 말로 알리는 것은 **호스트가 이미 한다**(`GameCanvas` 의 `onAward`).
          여기서 또 보내면 `aria-live` 가 같은 내용을 두 번 읽는다.
      */
      if (!reducedMotion) {
        const count = quality.level === 'low' ? 10 : 18
        particles.burst(
          p.worldX + PIPE_W / 2 - scroll,
          p.gapCenter,
          count,
          getPalette().ball[ballRange(res.value)],
          120,
        )
      }

      /*
        ⚠ 6개를 채워도 **바로 끝내지 않는다**(사용자 지시 ⑥). 기회가 남아 있으면 계속 날지
          물어본다. `enterDone` 을 여기서 부르면 그 순간 호스트 오버레이가 덮여 계속 날
          방법 자체가 사라진다.
      */
      if (res.complete) finishCollecting()
    }

    /**
     * 부딪혔다. **기회를 하나 쓴다.**
     *
     * ⚠ 개편 전에는 목숨이 무제한이었고 1.2초 뒤 자동으로 재개했다. 이제 기회는 9번이고
     *   재개는 사용자가 누를 때만 일어난다(사용자 지시 ①·③).
     * ⚠ **모은 번호는 그대로 둔다.** 줄어드는 것은 다시 날 수 있는 횟수이지 전리품이 아니다.
     */
    function crash(): void {
      phase = 'crashed'
      crashT = 0
      flashT = CRASH_FLASH_SEC
      shakeT = reducedMotion ? 0 : 0.28
      crashStreak += 1
      attemptsUsed += 1
      emit({ type: 'haptic', ms: 40 })
      emit({ type: 'sfx', name: 'miss' })
      emit({ type: 'attempt', used: attemptsUsed, total: MAX_ATTEMPTS })

      /*
        ⚠ **캔버스 HUD 만으로는 부족하다.** 캔버스 안 표시는 보조기술에 완전히 투명하므로
          계약("남은 기회는 캔버스 안에도 그린다" 절)이 `status` 를 함께 보내라고 못 박았다.
      */
      if (attemptsLeft() > 0) {
        emit({ type: 'status', text: `부딪혔습니다. 남은 기회 ${attemptsLeft()}번` })
      }

      if (!hintShown) {
        hintShown = true
        emit({ type: 'hint', text: '가볍게 여러 번 탭하세요. 번호는 그대로 남습니다.' })
      }

      // 기회를 다 썼다. 더 물어볼 것이 없으므로 그대로 끝낸다.
      if (attemptsLeft() <= 0) enterDone()
    }

    /**
     * "이어날기" 를 눌렀다. **`flying` 이 아니라 `hover` 로 간다.**
     *
     * ── ★ 왜 곧바로 날지 않는가 ──────────────────────────────────────
     * 사용자 지적 그대로다 — *"떨어지고 나면 바로 시작하는데 새가 바로 떨어지네."*
     * 재개하는 순간 중력이 걸려 있으면 화면을 다시 읽기도 전에 또 부딪힌다. 버튼만 하나
     * 늘고 문제는 그대로인 셈이다. 그래서 **무중력 부유 상태**를 한 단계 두어, 파이프
     * 위치를 보고 준비된 다음 첫 날갯짓으로 비행이 시작되게 한다. 시작 지점의 `ready` 와
     * 완전히 같은 취급이다.
     *
     * ⚠ **부딪힌 파이프를 치우고 재개한다.** 치우지 않으면 재개하자마자 같은 파이프에
     *   다시 부딪혀 사용자가 빠져나올 수 없다.
     * ⚠ 재개 높이를 **다음 파이프의 간극 중심**으로 맞춘다. 화면 한가운데로 되돌리면
     *   그 다음 파이프가 위나 아래 끝에 있을 때 재개 직후 또 부딪힌다.
     */
    function resumeFlight(): void {
      for (let i = pipes.length - 1; i >= 0; i -= 1) {
        const px = pipes[i].worldX - scroll
        if (px < BIRD_X + PIPE_W + 110 && px + PIPE_W > BIRD_X - 90) dropPipe(i)
      }

      let ahead: Pipe | null = null
      for (const p of pipes) {
        const px = p.worldX - scroll
        if (px + PIPE_W < BIRD_X) continue
        if (ahead === null || p.worldX < ahead.worldX) ahead = p
      }

      y = ahead === null ? baseY : ahead.gapCenter
      vy = 0
      prevY = y
      flapT = 1
      /*
        ⚠ `readyT` 를 0 으로 되돌린다. 부유 애니메이션이 `sin(readyT)` 이라, 되돌리지 않으면
          이어 난 순간 새가 사인파 중간 위치에서 튀어 오른 것처럼 보인다.
      */
      readyT = 0
      hoverBaseY = y
      phase = 'hover'
    }

    /**
     * 번호 6개를 다 모았다. **여기서 끝내지 않는다.**
     *
     * ── ★ 사용자 지시 ⑥ ────────────────────────────────────────────
     * *"다 모아도 바로 끝나는게 아니라. 계속 날건지 물어보게. 9번의 기회가 다 지나지
     * 않았으면."* 그래서 기회가 남아 있으면 `choice` 로 가서 **캔버스가 직접 묻는다.**
     *
     * ⚠ 이때 `cleared` 를 보내면 안 된다. 호스트는 `phase !== 'playing'` 인 동안 내내
     *   캔버스를 오버레이로 덮으므로, 보내는 순간 계속 날 방법 자체가 사라진다.
     * ⚠ 기회가 0이면 **묻지 않는다.** 선택지가 하나뿐인 질문은 질문이 아니다.
     */
    function finishCollecting(): void {
      // 기쁨의 도약. 마지막 번호 링을 지난 새가 그대로 떨어지면 순간이 시무룩하다.
      vy = FLAP_VY
      flapT = 0
      emit({ type: 'sfx', name: 'clear' })
      if (!reducedMotion) {
        const count = quality.level === 'low' ? PARTICLE_MAX_LOW : 60
        particles.burst(BIRD_X + 40, y, count, getPalette().svc.news, 200)
      }

      if (attemptsLeft() <= 0) {
        enterDone()
        return
      }

      phase = 'choice'
      choiceIndex = 0
      emit({ type: 'hint', text: '' })
      /*
        ⚠ 캔버스에 그린 두 버튼은 보조기술에 투명하다. 무엇을 묻고 있는지, 무엇을 누르면
          되는지를 `status` 로 반드시 말한다.
      */
      emit({
        type: 'status',
        text: `번호 6개를 모두 모았습니다. ${metres()}미터 비행 중. 계속 날지 번호를 확인할지 고르세요. 좌우 화살표로 옮기고 스페이스로 선택합니다.`,
      })
    }

    /**
     * 판이 끝났다. 기회 소진이거나, 완주 후 "번호 확인" 을 골랐을 때다.
     *
     * ⚠ **`cleared` 와 `failed` 를 여기서 가른다.** 기준은 `pool.complete` 하나다 —
     *   기회를 다 썼어도 6개를 모았으면 실패가 아니다.
     */
    function enterDone(): void {
      phase = 'done'
      doneT = 0
      // 아직 통과하지 못한 파이프의 번호는 **풀에 돌려준다.**
      for (let i = pipes.length - 1; i >= 0; i -= 1) {
        if (!pipes[i].passed) dropPipe(i)
      }
      emit({ type: 'hint', text: '' })
      emit({ type: 'status', text: `비행 거리 ${metres()}미터로 끝났습니다.` })

      if (pool.complete) {
        /*
          ⚠ **문구를 보내지 않는다.** 호스트가 여섯 게임 공통 기본값을 갖고 있다
            ("6개 공을 모두 모았습니다"). 게임마다 다른 말로 끝나면 여섯 개의 다른 제품이 된다.
        */
        emit({ type: 'phase', phase: 'cleared' })
        return
      }

      /*
        실패.
        ⚠ `title` 은 호스트 기본값("6개 번호 모으기 실패")을 그대로 쓰고 `text` 만 덮는다 —
          계약이 *"게임이 채우는 것은 게임마다 달라야 하는 것 뿐"* 이라고 정했고, G01 이
          같은 방식으로 획득 개수만 덮은 선례가 있다.
        ⚠ 비행 거리를 함께 말한다. 번호를 못 채운 판에서 **남는 것이 그것뿐**이기 때문이다.
      */
      emit({ type: 'sfx', name: 'fail' })
      emit({
        type: 'phase',
        phase: 'failed',
        text: `${pool.awarded.length}개를 모았고 ${metres()}미터를 날았습니다. 다시 도전해 보세요.`,
      })
    }

    /* ── 그리기 보조 ──────────────────────────────────────── */

    /**
     * 날개 각도.
     * 날갯짓 직후 0.28초 동안 위에서 아래로 휘두르고, 그 뒤에는 활공 자세로 미세하게 떤다.
     */
    function wingAngle(): number {
      if (flapT < 0.28) return draw.lerp(-1.1, 0.35, draw.easeOutCubic(flapT / 0.28))
      return 0.35 + Math.sin(flapT * 9) * 0.07
    }

    /**
     * 화면 가운데 안내.
     * ⚠ 캔버스 글자는 보조기술에 전혀 전달되지 않는다. 같은 내용이 `emit` 으로도 나가야
     *   하며, 여기 있는 것은 **보는 사용자를 위한 중복**이다.
     */
    function panel(c: CanvasRenderingContext2D, title: string, sub: string): void {
      const cx = stage.width / 2
      /*
        ⚠ 화면 **위쪽**에 붙인다. 실측에서 0.26 지점에 두었더니 충돌 안내가 링을 정확히
          가렸다 — 간극 중심이 130~390 어디에나 오기 때문이다. 링 위쪽 끝(중심 130 −
          반지름 30 = 100)보다 위에 두면 어떤 배치에서도 번호를 가리지 않는다.
        ⚠ 반대로 아래쪽에 두는 선택지는 버렸다. 캔버스 세로가 길어(`aspect-ratio` 9:14)
          작은 화면에서는 **하단이 접힌 화면 밖에 있다.** 위는 언제나 보인다.
        ⚠ 50 → **58**(2026-09-17). HUD 가 생기면서 그 아래로 내려야 했다 — HUD 는 8~30 을
          쓰고 이 패널은 높이 52 라 `cy = 50` 이면 24 부터 시작해 **기회 점 위에 겹친다.**
          58 이면 32 부터라 2px 이 남고, 아래 끝(84)은 여전히 링 위쪽 끝(100)보다 위다.
      */
      const cy = 58
      const p = getPalette()

      c.save()
      c.globalAlpha = 0.86
      draw.roundRect(c, cx - 132, cy - 26, 264, 52, 13)
      c.fillStyle = p.surface
      c.fill()
      c.globalAlpha = 1
      draw.roundRect(c, cx - 132, cy - 26, 264, 52, 13)
      c.lineWidth = 1
      c.strokeStyle = p.border
      c.stroke()
      c.restore()

      draw.text(c, title, cx, cy - 8, { size: 15, weight: 700, color: p.text })
      draw.text(c, sub, cx, cy + 12, { size: 11.5, color: p.textMuted })
    }

    /** 완주 선택 버튼 두 개의 위치. **`draw` 와 `handle` 이 같은 값을 봐야 한다.** */
    const CHOICE_BTN = { w: 124, h: 42, gap: 12 }
    function choiceRect(i: 0 | 1): { x: number; y: number; w: number; h: number } {
      const cx = stage.width / 2
      const { w, h, gap } = CHOICE_BTN
      return {
        x: i === 0 ? cx - gap / 2 - w : cx + gap / 2,
        y: stage.height / 2 - h / 2 + 14,
        w,
        h,
      }
    }

    /** 포인터가 어느 버튼 위인가. 어느 쪽도 아니면 `null`. */
    function hitChoice(px: number, py: number): 0 | 1 | null {
      for (const i of [0, 1] as const) {
        const r = choiceRect(i)
        if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return i
      }
      return null
    }

    /**
     * 완주 후 "계속 날기 / 번호 확인" 을 묻는 화면.
     *
     * ⚠ 캔버스 안 버튼은 보조기술에 투명하다. 같은 내용이 `finishCollecting` 에서 `status`
     *   로 이미 나갔고, 여기 있는 것은 **보는 사용자를 위한 중복**이다.
     */
    function choicePanel(c: CanvasRenderingContext2D): void {
      const p = getPalette()
      const cx = stage.width / 2
      const top = stage.height / 2 - 66

      // 화면을 살짝 눌러 둔다. 뒤에서 세계가 멈춰 있어도 버튼이 앞에 있다는 것이 읽혀야 한다.
      c.save()
      c.globalAlpha = 0.45
      c.fillStyle = p.bg
      c.fillRect(0, 0, stage.width, stage.height)
      c.restore()

      c.save()
      c.globalAlpha = 0.92
      draw.roundRect(c, cx - 146, top, 292, 132, 16)
      c.fillStyle = p.surface
      c.fill()
      c.globalAlpha = 1
      draw.roundRect(c, cx - 146, top, 292, 132, 16)
      c.lineWidth = 1
      c.strokeStyle = p.border
      c.stroke()
      c.restore()

      draw.text(c, '번호 6개를 모두 모았습니다', cx, top + 26, {
        size: 14.5,
        weight: 700,
        color: p.text,
      })
      draw.text(c, `${metres()}m 비행 · 남은 기회 ${attemptsLeft()}번`, cx, top + 46, {
        size: 11.5,
        color: p.textMuted,
      })

      const labels = ['계속 날기', '번호 확인'] as const
      for (const i of [0, 1] as const) {
        const r = choiceRect(i)
        const on = choiceIndex === i
        c.save()
        draw.roundRect(c, r.x, r.y, r.w, r.h, 11)
        /*
          ⚠ 선택된 쪽을 **채워서** 표시한다. 테두리만 두껍게 하는 방식은 작은 화면에서
            어느 쪽이 선택됐는지 읽히지 않는다.
        */
        c.fillStyle = on ? p.svc.news : p.surface2
        c.fill()
        draw.roundRect(c, r.x, r.y, r.w, r.h, 11)
        c.lineWidth = 1
        c.strokeStyle = on ? p.svc.news : p.border
        c.stroke()
        c.restore()

        draw.text(c, labels[i], r.x + r.w / 2, r.y + r.h / 2 + 5, {
          size: 13,
          weight: 700,
          color: on ? p.onAccent : p.text,
        })
      }
    }

    /* ── 루프 ─────────────────────────────────────────────── */

    function stepFlying(dt: number): void {
      vy += GRAVITY * dt
      if (vy > MAX_FALL) vy = MAX_FALL
      y += vy * dt

      /*
        ⚠ **천장은 충돌이 아니다.** 부딪혀 죽는 대신 멈춘다 — 위쪽은 공간이 남아 있는데도
          죽는 것이 원본 플래피류에서 가장 억울한 죽음이라서다.
        ⚠ 사양서는 `y = 0` 이라고 적었지만 그리기 반지름으로 자른다. 0 으로 자르면 새의
          위쪽 절반이 화면 밖으로 잘려 보인다. 의도(천장에서 죽지 않는다)는 그대로다.
      */
      if (y < BIRD_R) {
        y = BIRD_R
        vy = 0
      }

      scroll += SPEED * dt
      fillPipes()

      for (const p of pipes) {
        if (!p.passed && p.worldX + PIPE_W - scroll <= BIRD_X) passPipe(p)
        // ⚠ `passPipe` 안에서 완료되면 `pipes` 가 정리된다. 그 뒤로는 돌지 않는다.
        if (phase !== 'flying') return
      }

      // 바닥. 유일한 충돌면이다.
      if (y + BIRD_HIT_R >= groundY) {
        y = groundY - BIRD_HIT_R
        vy = 0
        crash()
        return
      }

      for (const p of pipes) {
        if (hitsPipe(p, y)) {
          crash()
          return
        }
      }

      // 화면 왼쪽으로 완전히 빠진 것을 정리한다. 지나쳐 보낸 링의 번호는 여기서 돌아간다.
      for (let i = pipes.length - 1; i >= 0; i -= 1) {
        if (pipes[i].worldX + PIPE_W - scroll < -60) dropPipe(i)
      }
    }

    function stepDone(dt: number): void {
      doneT += dt
      // 축하 연출 동안만 세계가 흐른다. 그 뒤에는 멈춰 결과 패널에 자리를 내준다.
      if (doneT < DONE_CELEBRATE_SEC) {
        scroll += SPEED * dt
        vy += GRAVITY * dt
        if (vy > MAX_FALL) vy = MAX_FALL
        y += vy * dt
        if (y + BIRD_HIT_R >= groundY) {
          y = groundY - BIRD_HIT_R
          vy = 0
        }
        if (y < BIRD_R) {
          y = BIRD_R
          vy = 0
        }
      }
    }

    return {
      fixedUpdate(dt) {
        if (!started) {
          started = true
          /*
            ★ **이미 끝난 판으로 시작될 수 있다.** 호스트는 완주 기록(`sessionStorage`)을
              복원해 획득 번호를 `pool` 에 채운 채 `create` 한다. 이때 `ready` 를 보내면 더
              모을 것이 없는 사람에게 "게임시작" 을 내밀게 되고, 눌러도 아무것도 얻지 못하는
              판이 돌아간다(계약 "이미 끝난 판으로 시작될 때" 절).
            ⚠ **내부 상태까지 멈춘다.** `phase` 만 보내고 게임을 굴리면 호스트 오버레이 뒤에서
              새가 혼자 날아간다.
          */
          if (pool.complete) {
            phase = 'done'
            doneT = DONE_CELEBRATE_SEC
            emit({ type: 'phase', phase: 'cleared' })
            return
          }
          /*
            ⚠ 문구를 보내지 않는다 — 호스트 기본값이 `{ title: meta.title, text: meta.tagline }`
              이라 이 게임에 그대로 맞는다.
          */
          emit({ type: 'phase', phase: 'ready' })
          emit({
            type: 'hint',
            text: '가볍게 눌러 날갯짓하세요. 색이 있는 링에만 번호가 들어 있습니다.',
          })
          /*
            ⚠ 시작할 때 한 번 보낸다. 호스트 HUD 가 `attempt` 를 쓰기 시작하면 **첫 충돌
              전까지 아무 값도 못 받아** 기회 표시가 비어 있게 된다. 지금은 조용히 버려지지만
              보내는 쪽이 계약이다.
          */
          emit({ type: 'attempt', used: 0, total: MAX_ATTEMPTS })
        }

        prevY = y
        prevScroll = scroll
        flapT += dt
        if (flashT > 0) flashT -= dt
        if (shakeT > 0) shakeT -= dt

        // 테마 폴링. 위 주석 참조 — 호스트가 새 객체를 주지 않아 게임이 직접 확인한다.
        paletteTick += 1
        if (paletteTick >= 60) {
          paletteTick = 0
          const next = readPalette()
          const key = paletteKey(next)
          if (key !== lastPaletteKey) {
            lastPaletteKey = key
            palette = next
            scenery.invalidate()
            renderer.invalidate()
          }
        }

        // 통과 연출은 어느 상태에서나 흘러야 한다. 멈추면 링이 화면에 박힌 채 남는다.
        for (const p of pipes) {
          if (p.passed && p.burst > 0 && p.burst < 1) {
            p.burst = Math.min(1, p.burst + dt / 0.45)
          }
        }
        particles.update(dt)

        switch (phase) {
          case 'ready':
            /*
              ⚠ 첫 입력 전에는 중력을 걸지 않는다. 화면을 인식하기도 전에 새가 바닥으로
                떨어지면 "뭘 해야 하는지 모른 채 실패" 하게 된다. 사양서의 이탈 방지
                취지를 시작 지점까지 연장한 것이다.
            */
            readyT += dt
            y = baseY + Math.sin(readyT * 2.6) * 9
            break
          case 'hover':
            /*
              ★ **이어 난 직후에도 중력을 걸지 않는다**(2026-09-17, 사용자 지시 ③).
                `ready` 와 완전히 같은 처리다. 다른 점은 기준 높이뿐 — `resumeFlight` 이
                다음 파이프의 간극 중심에 맞춰 둔 값을 `hoverBaseY` 로 쥐고 있다.
              ⚠ **기준 높이에 사인파를 더한다.** `y` 에 직접 더하면(`y += sin(...)`) 진폭이
                0.13px 로 뭉개져 멈춰 있는 것처럼 보이고, 반올림 오차가 쌓이면 새가 조금씩
                흘러내린다. `ready` 와 같은 식을 쓰는 이유가 그것이다.
              ⚠ 세계는 흐르지 않는다. 부유하는 동안 파이프가 다가오면 준비할 시간이라는
                취지가 사라진다.
            */
            readyT += dt
            y = hoverBaseY + Math.sin(readyT * 2.6) * 9
            break
          case 'flying':
            stepFlying(dt)
            break
          case 'crashed':
            /*
              ⚠ **자동 재개가 없다.** `crashT` 는 이제 "언제 재개하는가" 가 아니라
                "언제부터 입력을 받는가" 를 재는 값이다(→ `CRASH_HOLD_SEC` 주석).
            */
            crashT += dt
            break
          case 'choice':
            // 물어보는 동안 세계가 멈춘다. 뒤에서 판이 굴러가면 고를 수가 없다.
            break
          case 'done':
            stepDone(dt)
            break
        }
      },

      draw(c, alpha, timeMs) {
        const sc = draw.lerp(prevScroll, scroll, alpha)
        const by = draw.lerp(prevY, y, alpha)

        scenery.drawSky(c, sc, reducedMotion)

        /*
          충돌 흔들림.
          ⚠ 난수를 쓰지 않는다. 물리 스트림을 소비하면 같은 시드로도 파이프 배치가 달라져
            재현성이 깨진다 — sin 두 개면 충분히 흔들려 보인다.
          ⚠ 텍스트와 플래시는 흔들지 않는다(읽기 어려워진다).
        */
        const shake = shakeT > 0 ? shakeT / 0.28 : 0
        c.save()
        if (shake > 0) {
          c.translate(Math.sin(crashT * 92) * 5 * shake, Math.sin(crashT * 71) * 4 * shake)
        }

        for (const p of pipes) {
          const px = p.worldX - sc
          if (px > stage.width || px + PIPE_W < 0) continue
          renderer.pipe(c, px, p.gapCenter, p.gap, groundY)
        }

        for (const p of pipes) {
          if (p.burst >= 1) continue
          const px = p.worldX - sc + PIPE_W / 2
          if (px > stage.width + 40 || px < -40) continue
          /*
            ⚠ `reducedMotion` 이면 **확대 없이 페이드만** 한다(계약의 4항목 중 "번호 공개
              연출을 페이드로 대체").
          */
          const t = p.burst
          const scale = reducedMotion ? 1 : 1 + draw.easeOutCubic(t) * 0.6
          /*
            ⚠ **통과한 뒤에야 번호를 그린다**(`p.passed`). 그 전에는 구간 색만 보인다 —
              계약의 색 힌트형 규칙이다. 통과 연출이 곧 "볼이 깨지며 번호가 드러나는" 장면이다.
          */
          /*
            ⚠ `p.value` 가 `null` 이면 렌더러가 **꽝 링**으로 그린다(무채색·맥동 없음·가운데
              빈 원). 통과 연출(`burst`)은 꽝 링에도 흐른다 — 지나갔다는 사실 자체는 보여야
              한다.
          */
          renderer.ring(c, px, p.gapCenter, p.value, timeMs, scale, 1 - t, p.passed)
        }

        scenery.drawGround(c, sc, reducedMotion)

        renderer.birdShadow(c, BIRD_X, by, groundY)
        renderer.bird(c, BIRD_X, by, vy, wingAngle(), bodyNumber)

        particles.draw(c)
        c.restore()

        scenery.drawVignette(c)

        // 충돌 플래시. 무슨 일이 일어났는지 0.15초로 알린다.
        if (flashT > 0) {
          const peak = reducedMotion ? 0.22 : 0.45
          c.save()
          c.globalAlpha = (flashT / CRASH_FLASH_SEC) * peak
          c.fillStyle = getPalette().ballFg
          c.fillRect(0, 0, stage.width, stage.height)
          c.restore()
        }

        /*
          HUD — 비행 거리와 남은 기회.
          ⚠ **`ready` 와 `done` 에도 그린다.** 그 두 단계는 호스트 오버레이가 덮지만, 오버레이는
            캔버스 전체를 가리지 않아 위쪽 띠가 비쳐 보인다. 단계마다 껐다 켜면 오히려 깜빡인다.
        */
        renderer.hud(c, stage.width, metres(), attemptsLeft(), MAX_ATTEMPTS)

        /*
          ⚠ **`ready` 와 `done` 에는 캔버스 안 안내를 그리지 않는다.** 그 두 단계는 호스트가
            DOM 오버레이로 덮고 버튼까지 그린다 — 캔버스에도 그리면 같은 말이 두 겹으로
            겹친다. 캔버스가 말해야 하는 것은 **오버레이가 없는 단계**뿐이다.
        */
        if (phase === 'crashed') {
          /*
            ⚠ 입력 잠금이 풀리기 전에는 "이어날기" 라고 쓰지 않는다. 눌러도 안 먹는 동안
              누르라고 하면 게임이 고장 난 것처럼 보인다. 0.6초는 짧아서 대부분 이 문구를
              보지 못하고 지나간다 — 그것이 의도다.
          */
          const ready = crashT >= CRASH_HOLD_SEC
          panel(
            c,
            ready ? '눌러서 이어날기' : '괜찮아요, 번호는 그대로입니다',
            ready
              ? `남은 기회 ${attemptsLeft()}번 · 화면 아무 곳이나 누르세요`
              : `남은 기회 ${attemptsLeft()}번`,
          )
        } else if (phase === 'hover') {
          /*
            ⚠ `ready` 와 달리 여기서는 **캔버스가 말해야 한다.** 호스트 오버레이는
              `phase !== 'playing'` 일 때만 뜨는데, 이어 나는 중에는 계약상 계속 `playing`
              이라 오버레이가 없다. 안내가 없으면 새가 멈춰 있는 이유를 알 수 없다.
          */
          panel(c, '눌러서 날기 시작', '준비되면 누르세요. 그때부터 떨어집니다')
        }

        // 완주 선택은 화면 한가운데를 덮는다. 다른 안내와 겹칠 일이 없다.
        if (phase === 'choice') choicePanel(c)
      },

      handle(input) {
        /*
          ── 포인터: 완주 선택에서만 쓴다 ────────────────────────────
          ⚠ 호스트 `input.ts` 는 탭 한 번에 `pointer down` **과** `action primary down` 을
            순서대로 보낸다. 그래서 여기서는 **어느 버튼 위인지만 기억**하고, 실제 확정은
            뒤따라 오는 `action primary` 에서 한다. 양쪽에서 확정하면 한 번의 탭이 두 번 먹는다.
          ⚠ 버튼 밖을 눌렀으면 선택을 옮기지 않는다 — 그대로 두면 이어지는 `primary` 가
            **지금 가리키고 있는 쪽**을 고른다.
        */
        if (input.kind === 'pointer') {
          if (phase === 'choice' && input.phase === 'down') {
            const hit = hitChoice(input.x, input.y)
            if (hit !== null) choiceIndex = hit
          }
          return
        }

        if (input.phase !== 'down') return

        /*
          ── 좌우: 완주 선택의 커서 ─────────────────────────────────
          ⚠ 키보드만으로도 고를 수 있어야 한다(계약의 a11y 규약). 비행 중에는 좌우가 아무
            의미도 없으므로 `choice` 에서만 받는다.
        */
        if (input.action === 'left' || input.action === 'right') {
          if (phase === 'choice') choiceIndex = input.action === 'left' ? 0 : 1
          return
        }

        if (input.action !== 'primary') return

        switch (phase) {
          case 'ready':
            phase = 'flying'
            /*
              ⚠ **반드시 `playing` 을 다시 보낸다.** 호스트는 `phase !== 'playing'` 인 동안
                내내 캔버스를 오버레이로 덮는다. `ready` 만 보내고 시작하면 "게임시작" 을 눌러도
                팝업이 사라지지 않고 그 뒤에서 판이 혼자 굴러간다(계약 ★ 경고).
              ⚠ 보내는 자리가 **판이 실제로 시작되는 지점**이어야 한다. 위 `started` 블록에서
                보내면 이미 끝난 판에서도 나가 완료 오버레이를 지워 버린다.
            */
            emit({ type: 'phase', phase: 'playing' })
            flap()
            break

          case 'hover':
            /*
              이어 날기로 하고 부유하던 중 첫 날갯짓. **이 탭부터 중력이 걸린다.**
              ⚠ `playing` 을 다시 보내지 않는다. 충돌해도 계약상 계속 `playing` 이었으므로
                보내면 같은 값이 반복돼 호스트 상태 갱신만 늘어난다(계약: 직전 값과 같으면
                보내지 않는다).
            */
            phase = 'flying'
            flap()
            break

          case 'flying':
            flap()
            break

          case 'crashed':
            /*
              "이어날기".
              ⚠ **화면 아무 곳이나 눌러도 된다.** 버튼 그림은 눌러야 한다는 신호이지
                히트박스가 아니다 — 작은 화면에서 좁은 버튼을 맞히게 하는 것이 또 하나의
                마찰이고, 이 게임의 조작은 원래 "아무 데나 탭" 이다.
              ⚠ 잠금 시간 전에는 무시한다. 충돌하는 순간 누르고 있던 손가락이나 연타가
                곧바로 이어날기를 눌러 버리면 무슨 일이 났는지 볼 새가 없다.
            */
            if (crashT >= CRASH_HOLD_SEC) resumeFlight()
            break

          case 'choice':
            if (choiceIndex === 0) {
              /*
                계속 날기. 이후 링은 전부 꽝이고 **거리만 쌓인다**(`isNumberRing` 이
                `pool.complete` 면 false 를 낸다).
              */
              phase = 'flying'
              emit({ type: 'status', text: '계속 비행합니다.' })
              flap()
            } else {
              enterDone()
            }
            break

          case 'done':
            break
        }
      },

      destroy() {
        /*
          호스트도 `releaseAll()` 로 방어하지만, 게임이 자기가 예약한 것을 돌려주고 나가는
          것이 계약의 규칙이다("링이 지나갔다 → release").
        */
        for (const p of pipes) {
          // ⚠ 꽝 링은 예약한 적이 없다(`token === null`). 돌려줄 것이 없다.
          if (!p.passed && p.token !== null) pool.release(p.token)
        }
        pipes.length = 0
        particles.clear()
      },
    }

  },
}

export default game
