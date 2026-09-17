import type { ClaimResult, NumberPool, Reservation, Rng, SlotIndex } from './types'

/**
 * 번호 풀 — **중복 방지의 유일한 통로**.
 *
 * → docs/wiki/10-contracts/playground-game-contract.md "NumberPool" 절
 *
 * ── 왜 인터페이스로 강제하는가 ─────────────────────────────────────
 * 게임마다 중복 제거를 따로 구현하면 **여섯 개 중 하나는 반드시 어긋난다.** 그래서 게임에서
 * 번호를 고를 권한을 완전히 빼앗았다. 게임이 다룰 수 있는 값은 호스트가 준 `Reservation`
 * 토큰과, 호스트가 배치해 준 보드 칸 번호뿐이다.
 *
 * ── ⚠ 호스트가 지키는 불변식 ───────────────────────────────────────
 * **게임이 어겨도 깨지지 않도록 이 안에서 방어한다.**
 *
 * | 불변식 | 구현 |
 * |--------|------|
 * | `reserve()` 는 이미 획득했거나 이미 예약된 값을 절대 내지 않는다 | `awarded` Set + `live` Map |
 * | 같은 토큰을 두 번 `commit` 할 수 없다 | commit 시 `live.delete`, 없으면 `stale` |
 * | `complete` 이후 모든 claim 은 `full` | 슬롯 6개 소진 즉시 차단 |
 * | 게임이 죽어도 예약이 새지 않는다 | `releaseAll()` 을 호스트가 `destroy()` 에서 부른다 |
 */

const TOTAL = 45
const SLOTS = 6

export interface HostNumberPool extends NumberPool {
  /**
   * 살아 있는 예약을 전부 되돌린다. **게임 인스턴스를 버릴 때 호스트가 부른다.**
   * ⚠ 이것이 없으면 게임이 죽을 때 예약된 번호가 영영 잠긴다.
   */
  releaseAll(): void
}

/**
 * @param rng   번호 선택에 쓸 난수. 같은 시드면 같은 순서로 나온다(재현성).
 * @param onAward 슬롯이 찼을 때 호스트에 알린다. HUD·저장·결과 패널이 여기서 움직인다.
 * @param initial 복원용. 이미 획득한 번호를 미리 채운다(`sessionStorage` 복원).
 */
export function createNumberPool(
  rng: Rng,
  onAward?: (value: number, slot: SlotIndex, complete: boolean) => void,
  initial: readonly number[] = [],
): HostNumberPool {
  /** 확정된 번호. 순서가 곧 슬롯 번호다. */
  const awarded: number[] = []
  const awardedSet = new Set<number>()
  /** 아직 확정되지 않았지만 잠긴 번호. token → value. */
  const live = new Map<number, number>()
  /** 예약 토큰 일련번호. 0 은 쓰지 않는다 — 떨어진 값과 헷갈리지 않게. */
  let nextToken = 1

  for (const n of initial) {
    if (awarded.length >= SLOTS) break
    if (n >= 1 && n <= TOTAL && !awardedSet.has(n)) {
      awarded.push(n)
      awardedSet.add(n)
    }
  }

  /** 확정도 예약도 되지 않은 번호. */
  const isFree = (n: number): boolean => !awardedSet.has(n) && !liveHas(n)

  function liveHas(n: number): boolean {
    for (const v of live.values()) if (v === n) return true
    return false
  }

  /**
   * 남은 번호 하나를 고른다. 없으면 `null`.
   *
   * ⚠ 후보 배열을 만들어 고른다. 45개짜리라 비용이 무의미하고, **거절 샘플링(무작위로
   *   뽑아 보고 겹치면 다시)** 은 남은 개수가 적을 때 시도 횟수가 튀어 프레임을 먹는다.
   */
  function takeFree(): number | null {
    const free: number[] = []
    for (let n = 1; n <= TOTAL; n += 1) if (isFree(n)) free.push(n)
    if (free.length === 0) return null
    return free[rng.int(0, free.length - 1)]
  }

  /** 확정 처리. 슬롯이 남아 있다는 것은 호출부가 이미 확인했다. */
  function award(value: number): ClaimResult {
    const slot = awarded.length as SlotIndex
    awarded.push(value)
    awardedSet.add(value)
    const complete = awarded.length >= SLOTS
    onAward?.(value, slot, complete)
    return { ok: true, slot, value, complete }
  }

  const pool: HostNumberPool = {
    get awarded() {
      return awarded
    },
    get slotsLeft() {
      return SLOTS - awarded.length
    },
    get complete() {
      return awarded.length >= SLOTS
    },
    isAwarded: (n) => awardedSet.has(n),
    isFree,

    // ── 예약형 ────────────────────────────────────────
    reserve() {
      /*
        ⚠ 남은 슬롯보다 많이 예약해도 된다. 링·캡슐은 화면에 여럿 떠 있고 그중 일부만
          획득되기 때문이다. 슬롯 검사는 `commit` 에서 한다.
      */
      const value = takeFree()
      if (value === null) return null
      const token = nextToken
      nextToken += 1
      live.set(token, value)
      return { token, value }
    },

    reserveMany(count) {
      /** ⚠ 부족하면 **가능한 만큼만** 돌려준다. 게임은 길이를 확인하고 배치를 줄인다. */
      const out: Reservation[] = []
      for (let i = 0; i < count; i += 1) {
        const r = pool.reserve()
        if (r === null) break
        out.push(r)
      }
      return out
    },

    release(token) {
      live.delete(token)
    },

    commit(token) {
      if (pool.complete) return { ok: false, reason: 'full' }
      const value = live.get(token)
      /** ⚠ 이미 release 됐거나 두 번째 commit 이다. 같은 번호를 두 번 주지 않는다. */
      if (value === undefined) return { ok: false, reason: 'stale' }
      live.delete(token)
      return award(value)
    },

    // ── 보드형 ────────────────────────────────────────
    claimExact(n) {
      if (pool.complete) return { ok: false, reason: 'full' }
      /*
        ⚠ **자동 대체를 하지 않는다.** 스톤이 17번 칸에 멈춰 있는데 33번을 주면 화면이
          거짓말이 된다. 게임은 `'taken'` 을 받아 재투로 처리한다(슬롯·투구 수 소모 없음).
      */
      if (awardedSet.has(n)) return { ok: false, reason: 'taken' }
      if (n < 1 || n > TOTAL) return { ok: false, reason: 'taken' }
      return award(n)
    },

    board() {
      /*
        45칸 전부. 예약으로 표현할 수 없어(45개를 예약하면 풀이 빈다) 칸=고정 번호로 그리고
        획득 여부만 표시한다.
        ⚠ 매 프레임 부르지 않는다 — 배열을 새로 만든다. 게임은 시작할 때 한 번 받아 두고
          `isAwarded()` 로 갱신을 확인한다.
      */
      const out: { value: number; awarded: boolean }[] = []
      for (let n = 1; n <= TOTAL; n += 1) out.push({ value: n, awarded: awardedSet.has(n) })
      return out
    },

    // ── 은닉형 ────────────────────────────────────────
    awardHidden() {
      if (pool.complete) return { ok: false, reason: 'full' }
      /*
        ⚠ 사용자에게 사전 정보가 없으므로 남은 풀에서 뽑아도 모순이 없다.
          **중복이 구조적으로 불가능하다.**
      */
      const value = takeFree()
      if (value === null) return { ok: false, reason: 'full' }
      return award(value)
    },

    releaseAll() {
      live.clear()
    },
  }

  return pool
}
