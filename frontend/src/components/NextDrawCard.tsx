import { formatDrawDate } from '@/lib/format'
import { dDay, nextDrawTime, nextRoundNo, toKstDateString, toKstDateTimeString } from '@/lib/lotto'
import { Card } from './Card'
import { Countdown } from './Countdown'

/**
 * 다음 추첨 D-day 카드.
 *
 * D-day 숫자와 추첨 일시는 **서버가 렌더링**한다 — JS 없이도 보여야 하고, 스크린리더가
 * 읽어야 한다. 초 단위 카운트다운만 클라이언트에서 채운다(ISR 캐시가 시각을 굳히므로).
 *
 * 추첨은 매주 토요일 20:35 KST. 사용자의 브라우저 타임존과 무관하다(→ lib/lotto.ts).
 */
export function NextDrawCard({ latestRoundNo }: { latestRoundNo: number | null }) {
  const now = Date.now()
  const drawMs = nextDrawTime(now)
  const remainDays = dDay(now, drawMs)
  const roundNo = nextRoundNo(latestRoundNo)

  return (
    <Card as="article" title="다음 추첨" titleAs="h3">
      {roundNo !== null && (
        <p className="next-round">
          {/* 회차 번호만 강조한다 — 이 카드에서 사용자가 찾는 값이다. */}
          제<strong>{roundNo}</strong>회 로또
        </p>
      )}

      {/* D-0 은 "오늘 추첨"이다. 숫자로만 표기하면 사람이 한 번 더 생각해야 한다. */}
      <p className="dday-value">{remainDays === 0 ? 'D-DAY' : `D-${remainDays}`}</p>

      <p className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
        <time dateTime={toKstDateTimeString(drawMs)}>
          {formatDrawDate(toKstDateString(drawMs))} 20:35
        </time>{' '}
        추첨 예정
      </p>

      <p className="countdown">
        추첨까지 남은 시간
        <Countdown drawTimeMs={drawMs} />
      </p>
    </Card>
  )
}
