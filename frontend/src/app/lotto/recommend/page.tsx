import Link from 'next/link'
import type { Metadata } from 'next'

import { AdSlot } from '@/components/AdSlot'
import { Breadcrumb } from '@/components/Breadcrumb'
import { RecommendStudio } from '@/components/RecommendStudio'
import { serverRecommend } from '@/lib/api'
import { DISCLAIMER } from '@/lib/site'
import { STRATEGIES } from '@/lib/strategies'

/**
 * 추천 시뮬레이터. **SSG 셸 + 클라이언트 인터랙션**이다.
 *
 * 생성 결과 자체는 매번 달라 색인 대상이 아니다. 색인되는 것은 설명·기준·면책 본문이고,
 * 그것은 서버가 렌더링한다(→ docs/wiki/30-seo/metadata-strategy.md).
 * 첫 조합만 서버에서 받아 JS 없이도 화면이 비어 보이지 않게 한다.
 */
export const revalidate = 3600

export const metadata: Metadata = {
  title: '로또 번호 추천 시뮬레이터',
  description:
    '랜덤, 번호대 균형, 최근 통계 참고 방식으로 재미용 로또 번호를 생성하고 조합 성향을 분석해보세요.',
  alternates: { canonical: '/lotto/recommend' },
  openGraph: {
    type: 'website',
    url: '/lotto/recommend',
    title: '로또 번호 추천 시뮬레이터',
    description: '여섯 가지 방식으로 재미용 로또 번호를 생성하고 조합의 성향을 확인하세요.',
  },
}

export default async function RecommendPage() {
  const initial = await serverRecommend('ensemble', 5)

  return (
    <div className="container">
      <Breadcrumb
        items={[
          { name: '홈', href: '/' },
          { name: '로또 6/45', href: '/lotto' },
          { name: '번호 추천', href: '/lotto/recommend' },
        ]}
      />

      <section className="section">
        <h1>로또 번호 추천 시뮬레이터</h1>
        <p className="muted" style={{ marginTop: 'var(--space-2)' }}>
          여섯 가지 기준으로 재미용 번호 조합을 만들고, 만들어진 조합이 어떤 성향을 가졌는지
          살펴봅니다.
        </p>
      </section>

      <section className="section" aria-labelledby="studio-title">
        <h2 id="studio-title" className="sr-only">
          번호 생성
        </h2>
        <RecommendStudio
          initialStrategy="ensemble"
          initialSets={initial?.sets ?? []}
          initialHotWindow={initial?.hot_window ?? null}
          // 백엔드가 면책 문구를 내려주지만, 응답이 없을 때도 고지는 사라지면 안 된다.
          disclaimer={initial?.disclaimer ?? DISCLAIMER.recommend}
        />
      </section>

      {/* 생성 버튼 주변에 광고를 두지 않는다. 오클릭을 유도하는 배치로 읽힌다. */}
      <AdSlot slot="recommend-bottom" />

      <section className="section" aria-labelledby="criteria-title">
        <div className="section-head">
          <h2 id="criteria-title">추천 기준 여섯 가지</h2>
        </div>
        <div className="prose">
          {STRATEGIES.map((strategy) => (
            <div key={strategy.key}>
              <h3>{strategy.label}</h3>
              <p>{strategy.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section prose" aria-labelledby="why-title">
        <h2 id="why-title">추천번호는 왜 참고용이어야 할까요?</h2>
        <p>
          로또는 45개 번호에서 6개를 무작위로 뽑습니다. 가능한 조합은 8,145,060가지이고, 그 하나
          하나가 뽑힐 가능성은 모두 같습니다. 과거에 어떤 번호가 자주 나왔든, 어떤 조합이 한 번도
          나오지 않았든, 다음 회차에서 각 조합의 처지는 똑같습니다.
        </p>
        <p>
          그래서 이 페이지의 어떤 기준도 결과를 개선하지 않습니다.{' '}
          <strong>완전 랜덤을 목록 맨 앞에 둔 이유</strong>가 그것입니다. 통계를 참고한 조합과
          아무 근거 없이 뽑은 조합은 결과적으로 구분되지 않습니다. 그 사실을 감추지 않는 것이 이
          도구가 할 수 있는 유일한 정직함입니다.
        </p>
        <p>
          그렇다면 이 도구는 무엇을 하나요. 번호를 고르는 일을 조금 더 재미있게 만들고, 만들어진
          조합이 어떤 모양인지 — 홀수와 짝수가 어떻게 섞였는지, 번호가 한쪽에 몰렸는지 — 를
          보여줍니다. 그것이 전부이며, 그 이상을 약속하지 않습니다.
        </p>
        <p>
          번호 통계를 직접 보고 싶다면 <Link href="/lotto/stat">번호 통계</Link> 페이지를,
          꿈 키워드로 번호를 만들어 보고 싶다면 <Link href="/dream">꿈해몽 번호 추천</Link>을
          이용해 보세요. 복권을 즐겁게 이용하는 방법은{' '}
          <Link href="/guide/responsible-lottery">건전한 복권 이용 안내</Link>에 정리했습니다.
        </p>
      </section>
    </div>
  )
}
