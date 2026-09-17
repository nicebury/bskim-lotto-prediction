import type { Rng } from './types'

/**
 * 결정론적 난수 — mulberry32.
 *
 * → docs/wiki/10-contracts/playground-game-contract.md "난수" 절
 *
 * ── 왜 이것인가 ────────────────────────────────────────────────────
 * 12줄이면 끝나 **라이브러리 금지 제약**과 맞는다([[0014-number-playground]]). 주기 2³²
 * (약 43억)인데 한 판에 쓰는 난수는 많아야 수만 개다. `Math.imul` 만 쓰므로 저사양 폰에서도
 * 빠르다. xoshiro128** 은 상태 4개 초기화가 필요하고 PCG32 는 64비트라 `BigInt` 가 드는데,
 * 2분짜리 미니게임에 과하다.
 *
 * ── 결정론이 필요한 실제 이유 ──────────────────────────────────────
 * "플린코가 특정 시드에서 못에 끼인다" 같은 버그를 **시드만 받아 재현**할 수 있다. 번호
 * 배정(`reserve` 순서)도 같은 rng 를 타므로 한 판 전체가 재현된다.
 *
 * ⚠ **게임 코드에 브라우저 표준 난수가 있으면 반려한다.** 계약의 검증 게이트가 `src/games/`
 *   전체를 훑어 그 호출을 찾는다. 주석에도 그 이름을 적지 않는 것은 게이트가 문자열만
 *   보기 때문이다 — 경고 한 줄 때문에 여섯 세션의 검사가 붉게 뜨면 아무도 그것을 믿지 않게 된다.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 새 시드를 뽑는다. 재시작마다 새로 부른다.
 *
 * ⚠ **브라우저 표준 난수를 쓰지 않는다**(계약의 검증 게이트). `crypto` 가 없는 환경을 위한
 *   폴백은 시각과 성능 카운터를 섞는다 — 재현 가능성만 잃을 뿐 게임은 정상 동작한다.
 * ⚠ 개발 중에는 `?seed=12345` 로 고정할 수 있다(호스트가 읽어 넘긴다).
 */
export function createSeed(): number {
  const now = Date.now()
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    return (now ^ crypto.getRandomValues(new Uint32Array(1))[0]) >>> 0
  }
  const perf = typeof performance !== 'undefined' ? Math.floor(performance.now() * 1000) : 0
  return (now ^ perf) >>> 0
}

/**
 * `Rng` 표면을 만든다.
 *
 * ⚠ `int` 는 **`maxInclusive` 를 포함한다.** 배열 인덱스로 쓸 때 `length - 1` 을 넘긴다.
 *   여섯 세션이 경계를 다르게 이해하면 그중 하나는 마지막 원소를 영영 못 뽑는다.
 */
export function createRng(seed: number): Rng {
  const next = mulberry32(seed)

  /*
    fork 용 시드를 부모 스트림에서 뽑는다.
    ⚠ 부모의 난수를 **한 번** 소비하지만, 그것은 fork 시점에 한 번뿐이라 재현성을 해치지
      않는다(같은 시드면 같은 시점에 같은 값을 소비한다). 반대로 fork 없이 배경이 물리와
      같은 스트림을 쓰면 **매 프레임** 소비량이 달라져 재현이 불가능해진다.
  */
  const rng: Rng = {
    next,
    int(min, maxInclusive) {
      return min + Math.floor(next() * (maxInclusive - min + 1))
    },
    range(min, max) {
      return min + next() * (max - min)
    },
    pick(arr) {
      return arr[Math.floor(next() * arr.length)]
    },
    sign() {
      return next() < 0.5 ? -1 : 1
    },
    /*
      Box-Muller 대신 12개 합 근사를 쓴다.
      ⚠ `Math.log`·`Math.sqrt`·`Math.cos` 세 개를 부르는 Box-Muller 보다 싸고, 미니게임의
        흔들림·산포에 필요한 정확도는 이것으로 충분하다. 범위가 대략 ±6 으로 잘리는 것도
        오히려 이롭다 — 극단값이 스톤을 화면 밖으로 날리지 않는다.
    */
    gauss() {
      let sum = 0
      for (let i = 0; i < 12; i += 1) sum += next()
      return sum - 6
    },
    fork() {
      return createRng((next() * 4294967296) >>> 0)
    },
  }

  return rng
}
