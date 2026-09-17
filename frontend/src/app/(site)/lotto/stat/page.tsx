import Link from "next/link";
import type { Metadata } from "next";

import { Breadcrumb } from "@/components/Breadcrumb";
import { Disclaimer } from "@/components/Disclaimer";
import { Faq } from "@/components/Faq";
import { JsonLd, datasetLd } from "@/components/JsonLd";
import { LottoBall } from "@/components/LottoBall";
import { HotColdBoard } from "@/components/stat/HotColdBoard";
import { NumberInspector } from "@/components/stat/NumberInspector";
import {
  GuideNote,
  GuideSection,
  SpecimenCard,
  SpecimenGrid,
} from "@/components/GuideSection";
import { ClockIcon, TableRowIcon, TrendIcon } from "@/components/icons";
import { StatNav } from "@/components/stat/StatNav";
import {
  getHotCold,
  getLatestRound,
  getNumberStat,
  getRoundIndex,
  supportsRangeQuery,
} from "@/lib/api";
import { SITE_NAME, SITE_URL } from "@/lib/env";
import { DISCLAIMER, STAT_TOP_DEFAULT, STAT_WINDOWS } from "@/lib/site";

import type { HotColdResult } from "@/lib/api-types";

export const revalidate = 604800;

/**
 * ★ 003 개편: 이 URL 이 곧 '많이 나온 번호와 안 나온 번호' 화면이다.
 *
 * 종전에는 통계 3종을 소개만 하는 허브였고 hot-cold 가 하위 URL 이었다. 사용자가 통계에
 * 들어오면 곧바로 이 화면을 보길 원했고, 허브를 한 번 거치는 것은 클릭만 늘렸다.
 * `/lotto/stat/hot-cold` 는 이리로 영구 리다이렉트한다.
 */
export const metadata: Metadata = {
  title: "많이 나온 로또 번호와 안 나온 번호",
  description:
    "로또 6/45 번호별 출현 횟수와 비율, 최근 출현, 추세를 순위로 봅니다. 회차 구간을 직접 골라 조회하고, 번호 하나만 따로 확인할 수도 있습니다.",
  alternates: { canonical: "/lotto/stat" },
  openGraph: {
    type: "website",
    url: "/lotto/stat",
    title: "많이 나온 로또 번호와 안 나온 번호",
    description: "출현 횟수·비율·최근 출현·추세를 순위로 정리했습니다.",
  },
};

export default async function StatHotColdPage() {
  /*
    구간 4종을 미리 굽는다. 사용자가 프리셋을 누르면 네트워크 없이 즉시 바뀌고, JS 가 꺼져
    있어도 기본 구간(최근 20회)의 표가 HTML 에 들어 있다.
    `top` 은 화면 기본값(15)으로 요청한다 — 계약 기본값은 하위호환 때문에 10 이다.
  */
  const [results, latest, roundIndex, numberProbe] = await Promise.all([
    Promise.all(
      STAT_WINDOWS.map((option) =>
        getHotCold(option.value, { top: STAT_TOP_DEFAULT }),
      ),
    ),
    getLatestRound(),
    getRoundIndex(),
    // 003 신규 엔드포인트의 구현 여부를 한 번만 확인한다. 없으면 404 → null 이다.
    getNumberStat(1, 50),
  ]);

  const initial: Partial<Record<string, HotColdResult>> = {};
  STAT_WINDOWS.forEach((option, index) => {
    const value = results[index];
    if (value) initial[String(option.value)] = value;
  });

  const base = initial["20"] ?? null;

  return (
    <div className="container">
      <Breadcrumb
        items={[
          { name: "홈", href: "/" },
          { name: "로또 6/45", href: "/lotto" },
          { name: "번호 통계", href: "/lotto/stat" },
        ]}
      />

      <section className="section">
        <h1>많이 나온 번호와 안 나온 번호</h1>
        <p className="muted" style={{ marginTop: "var(--space-2)" }}>
          고른 구간 안에서 각 번호가 몇 번 나왔는지를 순위로 정리했습니다. 회차
          구간을 직접 지정하거나, 아래에서 번호 하나만 골라 볼 수도 있습니다.
        </p>
        <StatNav current="hot-cold" />
      </section>

      <section className="section" aria-labelledby="board-title">
        <h2 id="board-title" className="sr-only">
          번호 순위
        </h2>
        {base ? (
          <HotColdBoard
            initial={initial}
            roundIndex={roundIndex?.rounds ?? null}
            latestRound={latest?.round_no ?? null}
            rangeSupported={supportsRangeQuery(base)}
          />
        ) : (
          <p className="empty-state">
            통계를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.
          </p>
        )}
        <Disclaimer spaced>{DISCLAIMER.stats}</Disclaimer>
      </section>

      <section className="section" aria-labelledby="number-title">
        <div className="section-head">
          <h2 id="number-title">번호 하나만 골라 보기</h2>
        </div>
        <NumberInspector
          roundIndex={roundIndex?.rounds ?? null}
          rangeSupported={supportsRangeQuery(base)}
          supported={numberProbe !== null}
        />
      </section>

      {/* ── 읽는 법: 표본 해부 ───────────────────────────── */}
      <GuideSection
        headingId="read-title"
        title="이 표, 어떻게 읽나요?"
        lede="화면에 실제로 보이는 조각을 하나씩 짚었습니다. 숫자는 설명용 예시입니다."
      >
        <SpecimenGrid>
          <SpecimenCard
            accent="news"
            icon={<TableRowIcon />}
            title="표 한 줄"
            specimen={
              <>
                <span className="spec-rank">1</span>
                <LottoBall number={28} size="sm" />
                <strong>6회</strong>
                <span className="muted">30%</span>
                <span className="muted">1230회 · 7회 전</span>
              </>
            }
            notes={[
              {
                label: "출현 6회",
                text: "고른 20회 중 이 번호가 뽑힌 횟수입니다.",
              },
              {
                label: "비율 30%",
                text: "6 ÷ 20 입니다. 고른 20회 안에서 몇 번 얼굴을 비쳤는지를 말해 줍니다.",
              },
              {
                label: "7회 전",
                text: "1230회 이후 일곱 번 추첨했습니다. 대략 7주입니다.",
              },
              {
                label: "볼 색",
                text: "번호대입니다. 21~30번은 빨강, 동행복권 추첨 볼과 같습니다.",
              },
            ]}
            example="6 ÷ 20 = 30% — 지난 20회의 기록입니다"
          />

          <SpecimenCard
            accent="lotto"
            icon={<TrendIcon />}
            title="추세 배지"
            specimen={
              <>
                <span className="trend trend-up">
                  <span aria-hidden="true">↑</span>
                  <span className="sr-only">후반에 더</span>
                </span>
                <span className="muted">후반에 더</span>
                <span className="trend trend-down">
                  <span aria-hidden="true">↓</span>
                  <span className="sr-only">후반에 덜</span>
                </span>
                <span className="muted">후반에 덜</span>
                <span className="trend trend-flat">
                  <span aria-hidden="true">—</span>
                  <span className="sr-only">비슷</span>
                </span>
                <span className="muted">비슷</span>
              </>
            }
            notes={[
              {
                label: "무엇과 비교",
                text: "고른 구간을 반으로 잘라 뒤쪽 절반과 앞쪽 절반을 비교합니다. 최근 50회라면 뒤 25회와 앞 25회입니다.",
              },
              {
                label: "예",
                text: "앞 25회에 2번, 뒤 25회에 5번 나왔다면 ‘후반에 더’ 입니다.",
              },
              {
                label: "주의",
                text: "고른 구간을 둘로 잘라 어느 쪽에서 더 자주 나왔는지 견준 값입니다.",
              },
            ]}
            example="앞 25회 2번 · 뒤 25회 5번 → “후반에 더”"
          />

          <SpecimenCard
            accent="reco"
            icon={<ClockIcon />}
            title="‘오래 안 나온 번호’ 는 규칙이 다릅니다"
            specimen={
              <>
                <span className="spec-rank">1</span>
                <LottoBall number={5} size="sm" />
                <strong>24회째</strong>
                <span className="muted">마지막 출현 1213회</span>
              </>
            }
            notes={[
              {
                label: "기준",
                text: "이 표만은 고른 구간과 상관없이 역대 전체에서 셉니다.",
              },
              {
                label: "이유",
                text: "최근 20회만 보면 22회째 안 나온 번호와 200회째 안 나온 번호가 똑같이 “20회”로 뭉개집니다.",
              },
            ]}
            example="5번은 1213회 이후 24회째 안 나왔습니다"
          />
        </SpecimenGrid>

        <GuideNote title="‘나올 때가 됐다’ 는 느낌에 대하여">
          <p className="spec-figure">
            <strong>8,145,060</strong>
            <span>45개 중 6개를 고르는 방법의 수. 매 회차 모두 같습니다.</span>
          </p>
          <p>
            오래 안 나온 번호를 보면 슬슬 나올 차례처럼 느껴집니다. 아주 흔한
            생각이고, 여기엔 <strong>도박사의 오류</strong>라는 이름까지 붙어
            있습니다. 앞면이 열 번 연속 나온 동전도 다음은 여전히 반반입니다.
            동전은 자기가 방금 무엇이었는지 모르니까요.
          </p>
          <p>
            그래서 이 표는 지나온 기록을 들여다보는 곳입니다. 내가 늘 쓰는 번호가
            지난 구간 동안 어떻게 지냈는지, 어떤 번호와 자주 짝을 이뤘는지
            확인하는 곳입니다.
          </p>
          <p>
            번호별 전체 분포는{" "}
            <Link href="/lotto/stat/frequency">번호별 출현 빈도</Link>, 당첨
            조합의 모양은{" "}
            <Link href="/lotto/stat/pattern">홀짝·고저·합계 패턴</Link>에서 볼
            수 있습니다.
          </p>
        </GuideNote>
      </GuideSection>

      <Faq
        headingId="stat-faq"
        intro="표를 보다 막히는 지점을 순서대로 풀어 두었습니다."
        items={[
          {
            question: "비율 30%는 다음 회차에 30% 확률로 나온다는 뜻인가요?",
            answer:
              "아닙니다. 고른 20회 중 여섯 번 나왔다는, 이미 지나간 기록입니다. 20번 중 6번이니 30%인 것이지요. 다음 회차에 어떤 번호가 나올지는 이 숫자와 아무 상관이 없습니다. 추첨기는 지난주에 무엇을 뽑았는지 기억하지 못하니까요.",
          },
          {
            question: "‘추세’는 무엇과 무엇을 비교한 건가요?",
            answer:
              "고른 구간을 딱 반으로 잘라, 뒤쪽 절반과 앞쪽 절반에서 몇 번씩 나왔는지 견준 것입니다. 최근 50회를 골랐다면 뒤 25회와 앞 25회를 비교합니다. 앞에서 두 번, 뒤에서 다섯 번 나왔다면 ‘후반에 더’ 로 표시됩니다. 지나간 50회를 둘로 나눠 세어 본 결과일 뿐, 앞으로도 그럴 거라는 뜻은 아닙니다.",
          },
          {
            question: "‘오래 안 나온 번호’ 만 왜 규칙이 다른가요?",
            answer:
              "이 표만은 고른 구간을 무시하고 역대 전체에서 셉니다. 그러지 않으면 숫자가 뭉개지기 때문입니다. 예를 들어 최근 20회만 본다면, 22회째 안 나온 번호와 200회째 안 나온 번호가 똑같이 “20회 안 나옴” 으로 나옵니다. 둘은 전혀 다른 이야기인데 말이지요. 그래서 이 표는 마지막으로 나온 회차부터 지금까지를 통째로 셉니다.",
          },
          {
            question: "회차 구간을 바꾸면 결과도 달라지나요?",
            answer:
              "달라집니다. 세는 범위가 달라지니 순위도 바뀝니다. 재미있는 건 구간을 넓힐수록 번호들 사이의 차이가 줄어든다는 점입니다. 20회에서는 6회와 0회처럼 차이가 크게 벌어지지만, 역대 전체로 보면 45개 번호가 고만고만해집니다. 구간 버튼을 눌러 직접 확인해 보세요.",
          },
          {
            question: "오래 안 나온 번호는 이제 나올 때가 된 건가요?",
            answer:
              "그렇지 않습니다. 아주 흔한 생각이라 ‘도박사의 오류’ 라는 이름까지 붙어 있습니다. 동전을 던져 앞면이 열 번 연속 나왔다고 다음에 뒷면이 나올 가능성이 높아지지는 않지요. 여전히 반반입니다. 동전은 자기가 방금 무엇이었는지 모르니까요. 로또 공도 마찬가지입니다.",
          },
          {
            question: "볼 색깔은 무슨 뜻인가요?",
            answer:
              "번호대를 나타냅니다. 1~10은 노랑, 11~20은 파랑, 21~30은 빨강, 31~40은 회색, 41~45는 초록입니다. 동행복권 추첨 방송에서 나오는 공과 같은 규칙이라, 색만 봐도 몇 번대인지 바로 알 수 있습니다.",
          },
        ]}
      />

      <JsonLd
        data={datasetLd({
          name: "로또 6/45 번호별 출현 순위",
          description:
            "회차 구간별 로또 번호 출현 횟수·비율·최근 출현·추세와 장기 미출현 번호 통계.",
          siteName: SITE_NAME,
          siteUrl: SITE_URL,
        })}
      />
    </div>
  );
}
