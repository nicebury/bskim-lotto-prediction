import { LottoBall } from './LottoBall'

/**
 * 등수 판정 시각화 (002 R19).
 *
 * "6개 일치 = 1등" 같은 판정을 **정지 이미지가 아니라 LottoBall 컴포넌트로 그린다.**
 * 맞은 볼은 실제 색으로, 안 맞은 볼은 흐리게 표시하면 공식 색-구간 규칙과 자동 일치하고
 * 다크모드·접근성(aria-label)도 따라온다(→ docs/raw/002-이미지제작요청서.md 판단 근거).
 *
 * 각 등수 행: 등수 라벨 + 6개 볼(맞음/못맞음) + 보너스 볼(2등만) + 설명.
 * "맞음/못맞음" 을 색만으로 전달하지 않는다 — 못 맞은 볼에 `.is-miss` 로 회색 처리하고,
 * 행마다 조건을 글로도 적는다.
 */

interface RankRow {
  rank: string
  /** 맞은 당첨번호 개수(0~6). */
  matched: number
  /** 보너스 번호 일치 여부(2등 표시용). */
  bonus?: boolean
  desc: string
}

// 시각화용 예시 번호. 실제 회차가 아니라 "판정 방식" 을 보여주는 도식이다.
const SAMPLE = [7, 14, 24, 33, 42, 3]
const SAMPLE_BONUS = 16

const ROWS: RankRow[] = [
  { rank: '1등', matched: 6, desc: '당첨번호 6개가 모두 일치' },
  { rank: '2등', matched: 5, bonus: true, desc: '당첨번호 5개 + 보너스 번호 일치' },
  { rank: '3등', matched: 5, desc: '당첨번호 5개 일치 (보너스 불일치)' },
  { rank: '4등', matched: 4, desc: '당첨번호 4개 일치' },
  { rank: '5등', matched: 3, desc: '당첨번호 3개 일치' },
]

export function RankExplainer() {
  return (
    <div className="rank-explainer">
      {ROWS.map((row) => (
        <div className="rank-explain-row" key={row.rank}>
          <span className="rank-explain-label">{row.rank}</span>

          <span className="rank-explain-balls">
            {SAMPLE.map((n, index) => (
              <span
                key={n}
                className={index < row.matched ? '' : 'is-miss'}
                aria-hidden={index < row.matched ? undefined : true}
              >
                <LottoBall number={n} size="sm" />
              </span>
            ))}
            {row.bonus && (
              <>
                <span className="rank-explain-plus" aria-hidden="true">
                  +
                </span>
                <LottoBall number={SAMPLE_BONUS} bonus size="sm" />
              </>
            )}
          </span>

          <span className="rank-explain-desc">{row.desc}</span>
        </div>
      ))}
    </div>
  )
}
