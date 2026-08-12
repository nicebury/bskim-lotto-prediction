/**
 * 번호 볼 — /v2 전용.
 *
 * 기존 `components/LottoBall.tsx` 를 쓰지 않는 이유는 색이 아니라 **표면 토큰** 때문이다.
 * 기존 `.ball` 은 라이트/다크에서 값이 뒤집히는 토큰에 묶여 있어, 다크 고정인 이 화면에서
 * 라이트 모드 사용자에게만 테두리·그림자가 어긋난다.
 *
 * ⚠ 볼 색만은 기존과 **완전히 같아야 한다.** `--ball-*` 는 동행복권 공식 5구간이고
 *   사용자가 색만 보고 구간을 아는 학습된 매핑이다(→ 00-decisions/0009). 여기서
 *   재정의하지 않고 그대로 읽는다. 밝은 볼(노랑·초록) 위 흰 글자는 대비 AA 에 미달하므로
 *   `--ball-fg-dark` 를 쓴다 — 그 분기는 CSS 의 `[data-range='1']`, `[data-range='5']` 에 있다.
 */
import { ballAriaLabel, ballRange } from '@/lib/lotto'

interface BallProps {
  n: number
  bonus?: boolean
  size?: 'md' | 'lg'
}

export function HbBall({ n, bonus = false, size = 'md' }: BallProps) {
  return (
    <span
      className="hb-ball"
      data-range={ballRange(n)}
      data-size={size}
      role="img"
      aria-label={ballAriaLabel(n, bonus)}
    >
      {n}
    </span>
  )
}

interface RowProps {
  numbers: number[]
  bonus?: number | null
  size?: 'md' | 'lg'
}

/**
 * 당첨번호 한 줄. 보너스는 `+` 기호로 분리한다 — 여섯 개와 성격이 다른 번호라는 사실을
 * 위치만으로 전달하면 색각 이상이 있는 사용자에게 전달되지 않는다(각 볼의 aria-label 에도
 * '보너스'가 들어간다).
 */
export function HbBallRow({ numbers, bonus = null, size = 'md' }: RowProps) {
  return (
    <div className="hb-ballrow">
      {numbers.map((n) => (
        <HbBall key={n} n={n} size={size} />
      ))}
      {bonus !== null && (
        <>
          <span className="hb-ballrow-plus" aria-hidden="true">
            +
          </span>
          <HbBall n={bonus} bonus size={size} />
        </>
      )}
    </div>
  )
}
