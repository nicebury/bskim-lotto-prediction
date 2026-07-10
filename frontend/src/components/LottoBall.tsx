import { ballAriaLabel, ballRange } from '@/lib/lotto'

/**
 * 번호 볼. 순수 표시 컴포넌트로 상태를 갖지 않는다.
 * 색은 동행복권 공식 5구간을 따른다(시안 색이 아니다).
 * → docs/wiki/20-design/components.md
 */
interface LottoBallProps {
  /** 1~45. 이 값이 색 구간과 표시 숫자를 동시에 결정한다. */
  number: number
  /** 보너스 변형. 우상단에 '+' 배지를 얹는다. */
  bonus?: boolean
  size?: 'sm' | 'md' | 'lg'
  /**
   * 누를 수 없는 순수 표시용 볼이면 44px 히트 영역을 두르지 않는다.
   * 표나 좁은 목록에서 볼이 과도한 여백을 차지하는 것을 막는다.
   */
  static?: boolean
}

const SIZE_CLASS = { sm: 'ball-sm', md: '', lg: 'ball-lg' } as const

export function LottoBall({
  number,
  bonus = false,
  size = 'md',
  static: isStatic = true,
}: LottoBallProps) {
  const range = ballRange(number)
  const sizeClass = SIZE_CLASS[size]

  return (
    <span className={`ball-hit${isStatic ? ' is-static' : ''}`}>
      <span className="ball-wrap">
        <span
          className={`ball ball-range-${range}${sizeClass ? ` ${sizeClass}` : ''}`}
          // 색은 보조 채널이다. 스크린리더에는 구간을 '말로' 준다(WCAG 1.4.1).
          role="img"
          aria-label={ballAriaLabel(number, bonus)}
        >
          {number}
        </span>
        {/* 배지는 장식이 아니라 이미 aria-label 에 '보너스' 로 들어가 있으므로 숨긴다. */}
        {bonus && (
          <span className="ball-bonus-badge" aria-hidden="true">
            +
          </span>
        )}
      </span>
    </span>
  )
}

/**
 * 당첨번호 6개 + 보너스를 한 줄로. 회차 카드·회차 상세·목록이 공유한다.
 * `+` 기호는 장식이므로 접근성 트리에서 숨긴다 — 보너스 볼 자체가 이미 자신을 설명한다.
 *
 * `captions` 를 켜면 각 그룹 **바로 아래**에 "당첨번호" / "보너스" 라벨이 붙는다.
 * 라벨을 한 줄에 두고 `justify-content: space-between` 으로 밀어 놓으면 볼의 개수·크기가
 * 바뀔 때마다 라벨이 볼과 어긋난다. 그래서 그룹과 라벨을 같은 컬럼에 묶는다.
 */
export function BallRow({
  numbers,
  bonus,
  size = 'md',
  captions = false,
}: {
  numbers: number[]
  bonus?: number | null
  size?: 'sm' | 'md' | 'lg'
  captions?: boolean
}) {
  const hasBonus = typeof bonus === 'number'

  if (!captions) {
    return (
      <div className="ball-row">
        {numbers.map((n) => (
          <LottoBall key={n} number={n} size={size} />
        ))}
        {hasBonus && (
          <>
            <span className="ball-plus" aria-hidden="true">
              +
            </span>
            <LottoBall number={bonus} bonus size={size} />
          </>
        )}
      </div>
    )
  }

  return (
    <div className="ball-groups">
      <div className="ball-group">
        <div className="ball-row">
          {numbers.map((n) => (
            <LottoBall key={n} number={n} size={size} />
          ))}
        </div>
        <span className="ball-caption">당첨번호</span>
      </div>

      {hasBonus && (
        <>
          <span className="ball-plus" aria-hidden="true">
            +
          </span>
          <div className="ball-group">
            <div className="ball-row">
              <LottoBall number={bonus} bonus size={size} />
            </div>
            <span className="ball-caption">보너스</span>
          </div>
        </>
      )}
    </div>
  )
}
