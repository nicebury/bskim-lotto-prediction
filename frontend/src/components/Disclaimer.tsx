/**
 * 면책 고지.
 *
 * 붙여야 하는 곳: 번호 추천 결과가 표시되는 **모든** 화면, 꿈해몽 결과 화면, 모든 통계
 * 페이지, /disclaimer 전용 페이지. → docs/wiki/40-domain/forbidden-expressions.md
 *
 * 아이콘만으로 상태를 전달하지 않는다 — 문구가 곧 정보다. 아이콘은 장식이므로 숨긴다.
 */
export function Disclaimer({
  children,
  center = false,
  spaced = false,
}: {
  children: React.ReactNode
  center?: boolean
  /** 위 여백. 호출부가 <p> 로 감싸면 p 중첩이 되어 hydration 이 깨진다 — 여백을 여기서 받는다. */
  spaced?: boolean
}) {
  return (
    <p
      className={`disclaimer${center ? ' is-center' : ''}`}
      style={spaced ? { marginTop: 'var(--space-4)' } : undefined}
    >
      <span className="disclaimer-icon" aria-hidden="true">
        ⓘ
      </span>
      <span>{children}</span>
    </p>
  )
}
