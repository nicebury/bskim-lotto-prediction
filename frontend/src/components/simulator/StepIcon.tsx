import type { SVGProps } from 'react'

import type { SimulatorStep } from '@/lib/simulator-steps'
import { DiceIcon, FilterIcon, HourglassIcon, LayersIcon, TallyIcon, TicketIcon, WaveIcon } from '../icons'

/**
 * 정밀 분석 단계 → 아이콘.
 *
 * ⚠ 설명 절(`HowSimWorks`)과 진행 대화상자(`SimulatorRunner`)가 **같은 그림**을 쓴다.
 *   페이지에서 본 모래시계가 돌아가는 동안에도 모래시계로 나와야 "아까 읽은 그 단계" 로
 *   이어진다. 매핑을 한 곳에만 둔다.
 * ⚠ 키는 `SimulatorStep['key']` 로 묶어 둔다. 단계가 추가되면 여기서 타입 에러가 난다.
 */
const ICONS: Record<SimulatorStep['key'], (props: SVGProps<SVGSVGElement>) => React.ReactElement> = {
  frequency: TallyIcon,
  cycle: HourglassIcon,
  trend: WaveIcon,
  pattern: FilterIcon,
  ensemble: LayersIcon,
  montecarlo: DiceIcon,
  final: TicketIcon,
}

export function StepIcon({ stepKey, ...props }: { stepKey: SimulatorStep['key'] } & SVGProps<SVGSVGElement>) {
  const Icon = ICONS[stepKey]
  return <Icon {...props} />
}
