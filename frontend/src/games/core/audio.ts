import type { SfxName } from './types'

/**
 * 효과음 — **파일 없이 코드로 합성한다.**
 *
 * → docs/wiki/10-contracts/playground-game-contract.md "효과음" 절
 *
 * ── 왜 음원 파일을 쓰지 않는가 ─────────────────────────────────────
 * 이 프로젝트의 의존성은 `next` · `react` · `react-dom` **셋뿐**이고, 이미지 저장조차
 * 라이브러리 없이 Canvas 2D 로 직접 그린다. 여섯 게임에 효과음을 넣자고 mp3 를 몇십 개
 * 받아 오면 그 선이 무너진다 — 첫 로딩이 무거워지고, 라이선스를 관리할 자산이 늘고,
 * 다크모드처럼 "코드가 아니라 파일이 정본" 인 것이 또 하나 생긴다.
 *
 * 우리가 필요한 소리는 **짧은 톤 한둘**이다. 오실레이터로 만들면 파일 0개, 요청 0회다.
 *
 * ── ⚠ 기본이 음소거다 ──────────────────────────────────────────────
 * 소리를 켜는 것은 **사용자가 버튼을 누른 그 순간**이고, 그 클릭이 곧 브라우저가 요구하는
 * 사용자 제스처다. 그래서 `AudioContext` 를 **음소거를 풀 때 처음 만든다** — 자동재생
 * 정책에 걸릴 여지가 원천적으로 없고, 소리를 안 켠 사용자는 오디오 코드를 한 줄도 돌리지
 * 않는다.
 *
 * ⚠ iOS 무음 스위치는 웹 오디오에 일관되게 적용되지 않는다. 그래서 **음소거 버튼이 필수**다
 *   — 기기 스위치를 믿고 버튼을 생략하면 끌 방법이 없는 사용자가 생긴다.
 */

/** 전체 음량. 게임 효과음이 배경음악처럼 크면 안 된다. */
const MASTER_GAIN = 0.22

/**
 * 같은 소리가 이 간격 안에 겹쳐 나지 않게 막는다.
 *
 * ⚠ 없으면 연사할 때 발사음이 겹쳐 **찢어지는 소리**가 난다. 게인이 더해져 클리핑하기
 *   때문이다. 사람 귀에는 40ms 안의 두 번째 소리가 어차피 하나로 들린다.
 */
const THROTTLE_MS = 40

interface ToneSpec {
  type: OscillatorType
  /** 시작 주파수(Hz). */
  from: number
  /** 끝 주파수(Hz). `from` 과 같으면 미끄러지지 않는다. */
  to: number
  /** 길이(초). */
  dur: number
  /** 0~1. `MASTER_GAIN` 에 곱해진다. */
  vol: number
  /** 앞선 톤 뒤 몇 초 뒤에 울릴지. 화음·아르페지오를 만든다. */
  delay: number
}

const t = (
  type: OscillatorType,
  from: number,
  to: number,
  dur: number,
  vol: number,
  delay = 0,
): ToneSpec => ({ type, from, to, dur, vol, delay })

/**
 * 소리 사전.
 *
 * ⚠ 이름은 **여섯 게임이 공유하는 어휘**다. 게임마다 이름을 새로 만들면 소리가 제각각이
 *   되어 한 제품으로 들리지 않는다. 새 이름이 필요하면 계약을 먼저 고친다.
 */
const RECIPES: Record<SfxName, { tones: ToneSpec[]; noise?: { dur: number; vol: number } }> = {
  /** 발사·투척·드롭. 짧고 낮게 — 가장 자주 나는 소리라 조금만 커도 금방 피곤해진다. */
  shoot: { tones: [t('square', 320, 130, 0.07, 0.5)] },
  /** 획득. 두 음이 올라가며 "얻었다" 를 말한다. */
  hit: { tones: [t('triangle', 660, 660, 0.09, 0.9), t('triangle', 990, 990, 0.13, 0.8, 0.07)] },
  /** 빗나감. 둔탁하게 떨어진다. */
  miss: { tones: [t('sawtooth', 180, 80, 0.12, 0.45)] },
  /** 꽝. 낮게 무너지는 음 + 노이즈로 폭발감을 만든다. */
  blank: {
    tones: [t('sawtooth', 300, 60, 0.34, 0.8), t('square', 150, 50, 0.26, 0.5, 0.02)],
    noise: { dur: 0.3, vol: 0.5 },
  },
  /** 완주. 도-미-솔 세 음. 이 게임에서 가장 밝은 소리다. */
  clear: {
    tones: [
      t('triangle', 523, 523, 0.14, 0.9),
      t('triangle', 659, 659, 0.14, 0.9, 0.12),
      t('triangle', 784, 784, 0.3, 0.9, 0.24),
    ],
  },
  /** 실패. 두 음이 내려간다. 벌하는 소리가 아니라 "끝났다" 는 신호다. */
  fail: { tones: [t('triangle', 330, 330, 0.16, 0.7), t('triangle', 220, 200, 0.34, 0.7, 0.14)] },
}

export interface SfxPlayer {
  play(name: SfxName): void
  /** 켜는 순간(=사용자 제스처)에 오디오가 처음 만들어진다. */
  setMuted(muted: boolean): void
  destroy(): void
}

type Ctor = typeof AudioContext

function audioCtor(): Ctor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor }
  return w.AudioContext ?? w.webkitAudioContext ?? null
}

export function createSfxPlayer(initialMuted: boolean): SfxPlayer {
  let muted = initialMuted
  let ac: AudioContext | null = null
  let master: GainNode | null = null
  /** 이름별 마지막 재생 시각. 겹침 방지용. */
  const lastAt = new Map<SfxName, number>()
  /** 노이즈 버퍼는 한 번만 만든다. 매번 만들면 그것만으로 프레임을 먹는다. */
  let noiseBuf: AudioBuffer | null = null

  function ensure(): boolean {
    if (ac !== null) return true
    const Ctor = audioCtor()
    if (Ctor === null) return false
    try {
      ac = new Ctor()
      master = ac.createGain()
      master.gain.value = MASTER_GAIN
      master.connect(ac.destination)
      return true
    } catch {
      /* 오디오를 만들 수 없는 환경. 소리만 없고 게임은 그대로 돈다. */
      ac = null
      master = null
      return false
    }
  }

  function noise(): AudioBuffer | null {
    if (ac === null) return null
    if (noiseBuf !== null) return noiseBuf
    const len = Math.floor(ac.sampleRate * 0.4)
    const buf = ac.createBuffer(1, len, ac.sampleRate)
    const data = buf.getChannelData(0)
    /*
      ⚠ 브라우저 표준 난수를 쓰지 않는다. `src/games/` 전체를 훑는 검증 게이트에 걸리고,
        무엇보다 노이즈는 재현성이 필요 없지만 규칙은 규칙이다. 카운터 해시로 만든다.
    */
    let seed = 0x9e3779b9
    for (let i = 0; i < len; i += 1) {
      seed = (seed + 0x6d2b79f5) >>> 0
      let x = Math.imul(seed ^ (seed >>> 15), 1 | seed)
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
      data[i] = (((x ^ (x >>> 14)) >>> 0) / 2147483648 - 1) * 0.5
    }
    noiseBuf = buf
    return buf
  }

  return {
    play(name) {
      if (muted || ac === null || master === null) return

      const now = Date.now()
      const prev = lastAt.get(name) ?? 0
      if (now - prev < THROTTLE_MS) return
      lastAt.set(name, now)

      /*
        ⚠ 탭을 떠났다 오면 컨텍스트가 `suspended` 로 남는다. 깨우지 않으면 소리가 조용히
          사라지고 원인을 찾기 어렵다.
      */
      if (ac.state === 'suspended') void ac.resume()

      const recipe = RECIPES[name]
      const at = ac.currentTime

      for (const spec of recipe.tones) {
        const osc = ac.createOscillator()
        const gain = ac.createGain()
        const start = at + spec.delay
        osc.type = spec.type
        osc.frequency.setValueAtTime(spec.from, start)
        if (spec.to !== spec.from) {
          // ⚠ 지수 램프의 목표는 0 보다 커야 한다. 0 을 주면 예외가 난다.
          osc.frequency.exponentialRampToValueAtTime(Math.max(1, spec.to), start + spec.dur)
        }
        // 딸깍 소리를 막으려 0 이 아니라 아주 작은 값에서 올린다.
        gain.gain.setValueAtTime(0.0001, start)
        gain.gain.exponentialRampToValueAtTime(spec.vol, start + 0.008)
        gain.gain.exponentialRampToValueAtTime(0.0001, start + spec.dur)
        osc.connect(gain)
        gain.connect(master)
        osc.start(start)
        osc.stop(start + spec.dur + 0.03)
      }

      if (recipe.noise !== undefined) {
        const buf = noise()
        if (buf !== null) {
          const src = ac.createBufferSource()
          const gain = ac.createGain()
          src.buffer = buf
          gain.gain.setValueAtTime(recipe.noise.vol, at)
          gain.gain.exponentialRampToValueAtTime(0.0001, at + recipe.noise.dur)
          src.connect(gain)
          gain.connect(master)
          src.start(at)
          src.stop(at + recipe.noise.dur + 0.03)
        }
      }
    },

    setMuted(next) {
      muted = next
      // 켜는 클릭이 곧 사용자 제스처다. 이 시점에 만들어야 자동재생 정책을 통과한다.
      if (!next) {
        if (ensure() && ac !== null && ac.state === 'suspended') void ac.resume()
      }
    },

    destroy() {
      try {
        void ac?.close()
      } catch {
        /* 이미 닫혔거나 지원하지 않는 브라우저. 무시한다. */
      }
      ac = null
      master = null
      noiseBuf = null
      lastAt.clear()
    },
  }
}
