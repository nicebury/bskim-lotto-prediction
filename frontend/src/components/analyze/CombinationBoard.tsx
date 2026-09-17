import { HelpTip } from '@/components/stat/HelpTip'
import type { AnalyzeCombination } from '@/lib/api-types'
import { formatNumber } from '@/lib/format'

/**
 * 블록 2 — 조합 패턴.
 *
 * ⚠ **내 값과 역대 분포를 나란히 낸다.** 내 값만 보이면 흔한지 드문지 알 수 없다. 이 대조가
 *   이 블록의 전부다.
 * ⚠ AC값·이월수·끝수합은 **도움말이 필요하다.** 커뮤니티마다 정의가 조금씩 달라, 우리가
 *   무엇을 세었는지 밝혀야 한다([[api-contract-analysis]] 계산 정의 표와 같은 문장을 쓴다).
 */
export function CombinationBoard({ combination }: { combination: AnalyzeCombination }) {
  const { reference } = combination
  const pct = (r: number) => `${Math.round(r * 100)}%`

  /*
   * `share` 는 역대에서 **같은 값이 나온 회차의 비율**(응답 값). 있으면 타일 아래 게이지로 그린다.
   * ⚠ 이것은 지나간 회차의 관찰 비율이지 앞으로의 가능성이 아니다 — 문구도 "역대 N%" 로만 쓴다.
   */
  const rows: { label: string; mine: string; ref: string | null; share?: number; help?: string }[] = [
    {
      label: '번호 합계',
      mine: formatNumber(combination.sum),
      ref: `같은 10단위 구간이 역대 ${pct(reference.sum_band_share)}`,
      share: reference.sum_band_share,
    },
    {
      label: '홀짝 비율',
      mine: combination.odd_even,
      ref: `같은 비율이 역대 ${pct(reference.odd_even_share)}`,
      share: reference.odd_even_share,
    },
    {
      label: '고저 비율',
      mine: combination.high_low,
      ref: `같은 비율이 역대 ${pct(reference.high_low_share)}`,
      share: reference.high_low_share,
      help: '23 이상을 고, 22 이하를 저로 봅니다.',
    },
    {
      label: '연속번호',
      mine: combination.consecutive_pairs === 0 ? '없음' : `${combination.consecutive_pairs}쌍`,
      // ⚠ 게이지는 **내 조합과 같은 쪽**의 비율이다. 연속이 없는 조합에 '연속 포함' 비율을 그리면 반대를 가리킨다.
      ref:
        combination.consecutive_pairs > 0
          ? `연속을 포함한 회차가 역대 ${pct(reference.consecutive_share)}`
          : `연속이 없는 회차가 역대 ${pct(1 - reference.consecutive_share)}`,
      share: combination.consecutive_pairs > 0 ? reference.consecutive_share : 1 - reference.consecutive_share,
      help: '값이 1 차이 나는 이웃 쌍을 셉니다. 24·25·26이면 두 쌍입니다.',
    },
    {
      label: 'AC값',
      mine: `${combination.ac_value}`,
      /*
        ⚠ 응답에는 `ac_share` 가 없고 **AC값별 비율 히스토그램**이 온다. 내 값의 칸을 꺼내
          쓰되, 없으면 0 이 아니라 '-' 로 둔다 — 0% 는 "한 번도 없었다" 는 주장이고,
          없는 키는 "그 값이 관찰되지 않았다" 는 뜻이라 같지 않다.
      */
      ref:
        reference.ac_histogram[String(combination.ac_value)] === undefined
          ? null
          : `같은 값이 역대 ${pct(reference.ac_histogram[String(combination.ac_value)])}`,
      share: reference.ac_histogram[String(combination.ac_value)],
      help: '여섯 번호에서 둘씩 뽑아 만든 차이 15개 가운데 서로 다른 값의 개수에서 5를 뺀 값입니다. 0부터 10까지 나오며, 클수록 번호 사이 간격이 고르지 않게 흩어져 있다는 뜻입니다.',
    },
    {
      label: '끝수 합',
      mine: `${combination.tail_sum}`,
      ref: null,
      help: '각 번호의 1의 자리를 더한 값입니다. 41은 1, 30은 0으로 셉니다.',
    },
    {
      label: '같은 끝수',
      mine: combination.same_tail_pairs === 0 ? '없음' : `${combination.same_tail_pairs}쌍`,
      ref: null,
      help: '끝자리가 같은 번호의 쌍을 셉니다. 끝수가 3인 번호가 세 개면 세 쌍입니다.',
    },
    {
      label: '이월수',
      mine: combination.carryover === null ? '-' : `${combination.carryover}개`,
      ref: `회차당 평균 ${reference.carryover_avg.toFixed(2)}개`,
      help: '직전 회차 당첨번호와 겹치는 개수입니다. 보너스 번호는 세지 않습니다.',
    },
    { label: '3의 배수', mine: `${combination.multiples_of_3}개`, ref: null },
    {
      label: '소수',
      mine: `${combination.prime_count}개`,
      ref: null,
      help: '2·3·5·7·11·13·17·19·23·29·31·37·41·43을 셉니다. 1은 소수가 아닙니다.',
    },
  ]

  /*
    ── 표시 ─────────────────────────────────────────────────────────
    ⚠ 2026-09-17 표 → **타일**. 지표 이름 · 내 값(크게) · 역대에서 얼마나 흔했나(게이지) 를 한
      칸에 모았다. 표는 "내 값" 과 "역대" 가 다른 열에 떨어져 눈이 좌우로 오갔다.
    ⚠ 견줄 값이 없는 지표도 타일을 지우지 않는다 — 조합마다 타일 수가 달라지면 무엇이 빠졌는지 모른다.
  */
  return (
    <ul className="cbt">
      {rows.map((r) => (
        <li key={r.label} className="cbt-tile">
          <span className="cbt-label">
            {r.label}
            {r.help && <HelpTip title={r.label}>{r.help}</HelpTip>}
          </span>
          <strong className="cbt-value">{r.mine}</strong>
          {r.share !== undefined ? (
            <>
              <span className="cbt-meter" aria-hidden="true">
                <span style={{ width: `${Math.max(2, Math.round(r.share * 100))}%` }} />
              </span>
              <span className="cbt-ref">{r.ref}</span>
            </>
          ) : (
            // ⚠ 견줄 역대 값이 없는 지표는 설명 줄을 비운다. 같은 안내를 네 번 되풀이하면 소음이다.
            r.ref && <span className="cbt-ref">{r.ref}</span>
          )}
        </li>
      ))}
    </ul>
  )
}
