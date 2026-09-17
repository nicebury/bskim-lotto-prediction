import Link from "next/link";

import { Faq } from "@/components/Faq";
import {
  GuideNote,
  GuideSection,
  SpecimenCard,
  SpecimenGrid,
} from "@/components/GuideSection";
import { LottoBall } from "@/components/LottoBall";
import { BallIcon, BookIcon, WordIcon } from "@/components/icons";

/**
 * 꿈해몽 화면의 **하단 공통 절** — 만드는 법 설명 + 자주 묻는 질문.
 *
 * ⚠ `/dream` 과 `/dream/{소재}` 가 **같은 것을 본다.** 소재별 페이지에 들어온 사용자도
 *   번호가 어떻게 만들어지는지, 꿈과 결과 사이에 관계가 없다는 것을 똑같이 읽어야 한다.
 *   종전에는 소재 페이지에 줄글 몇 문단만 있어 설명의 밀도가 확연히 낮았다(사용자 지적).
 *
 * ⚠ 두 페이지에 같은 내용을 복사해 두지 않는다. 복사하면 한쪽만 고쳐지고, 그 순간
 *   FAQPage 구조화 데이터와 화면 텍스트가 페이지마다 달라진다.
 *
 * ⚠ **FAQPage 는 한 페이지에 한 번만 내보낸다**(→ components/Faq.tsx). 이 컴포넌트가
 *   그것을 담당하므로, 이걸 쓰는 페이지에 `Faq` 를 또 두지 않는다.
 */
export function DreamGuide() {
  return (
    <>
      {/* ── 만드는 법: 표본 해부 ─────────────────────────── */}
      <GuideSection
        headingId="how-dream"
        title="번호는 어떻게 만들어지나요?"
        lede="적어 주신 꿈이 번호가 되기까지 세 단계를 거칩니다. 예시로 짚었습니다."
      >
        <SpecimenGrid>
          <SpecimenCard
            accent="news"
            icon={<WordIcon />}
            title="1. 꿈에서 핵심 상징 찾기"
            specimen={
              <>
                <span className="muted">“큰 돼지가 집에 들어왔다”</span>
                <span className="spec-rank">→</span>
                <strong>돼지</strong>
                <strong>집</strong>
              </>
            }
            notes={[
              {
                label: "하는 일",
                text: "AI 가 적어 주신 문장에서 꿈을 이루는 핵심 상징을 단어로 찾아냅니다.",
              },
              {
                label: "남기는 것",
                text: "동물·사물·행동처럼 뜻을 가진 단어만 남기고, 뜻을 담지 않는 부분은 버립니다.",
              },
            ]}
            example="“큰 돼지가 집에 들어왔다” → 돼지 · 집"
          />

          <SpecimenCard
            accent="lotto"
            icon={<BookIcon />}
            title="2. 상징에 연결된 번호 찾기"
            specimen={
              <>
                <strong>돼지</strong>
                <span className="spec-rank">→</span>
                <span className="muted">전통 해석 자료의 연관 번호</span>
              </>
            }
            notes={[
              {
                label: "자료",
                text: "전통적인 꿈 해석에서 쓰여 온 상징과 숫자의 연관 데이터를 체계화해 두었습니다.",
              },
              {
                label: "세 갈래",
                text: "정확히 일치하는 단어, 그 단어를 포함하는 단어, 뜻이 비슷한 단어 순으로 넓혀 갑니다.",
              },
            ]}
            example="돼지 → 돼지 · 멧돼지 · 새끼돼지"
          />

          <SpecimenCard
            accent="reco"
            icon={<BallIcon />}
            title="3. 조합을 분석해 추천하기"
            specimen={
              <>
                <LottoBall number={7} size="sm" />
                <LottoBall number={14} size="sm" />
                <LottoBall number={24} size="sm" />
                <LottoBall number={33} size="sm" />
                <span className="muted">…</span>
              </>
            }
            notes={[
              {
                label: "하는 일",
                text: "찾아낸 상징과 연관 숫자를 바탕으로 여러 조합을 분석해 나만의 꿈 번호를 추천합니다.",
              },
              {
                label: "범위",
                text: "어느 갈래까지 포함할지 직접 고를 수 있습니다. 넓힐수록 재료가 늘어 조합도 달라집니다.",
              },
            ]}
            example="찾은 단어들의 번호를 모아 여섯 자리를 채웁니다"
          />
        </SpecimenGrid>

        {/*
          ⚠ **2026-09-02 에 어투를 고쳤다**(사용자 지적: "너무 부정적이고 단호하다").
            종전에는 이 절 하나에 부정문이 일곱 개였다 — 관계가 없습니다 · 확인할 방법은
            없습니다 · 뜻은 아니며 · 관계도 아닙니다 · 달라지지 않고 · 나빠지지도 않습니다 ·
            뜻하지 않습니다. 읽고 나면 **해 보고 싶은 마음이 사라진다.**

          ⚠ **사실은 하나도 빼지 않았다.** 민간 해석이라는 것, 과학이 아니라는 것, 추첨이
            무작위라는 것 전부 그대로다. 바꾼 것은 **말하는 방식**이다 — 같은 사실을 부정문이
            아니라 서술문으로 쓰고, 무엇인지 먼저 말한 뒤 한계를 붙인다.

          ⚠ 법적 성격의 고지는 별도로 `DISCLAIMER.dream` 이 화면 아래에 붙는다. 여기서까지
            같은 말을 반복할 이유가 없다.
        */}
        <GuideNote title="꿈해몽은 오래 전해 내려온 이야기입니다">
          <p>
            꿈해몽은 수백 년 동안 입에서 입으로 전해진{" "}
            <strong>민간 해석</strong>입니다. 같은 돼지꿈을 두고도 지역마다,
            시대마다 풀이가 다릅니다. 정답이 하나로 정해진 분야라기보다 여러
            이야기가 나란히 전해지는 쪽에 가깝습니다.
          </p>
          <p>
            상징과 숫자를 잇는 자료도 그렇게 전해 내려온 해석을 모아 정리한
            것입니다. 과학이 밝혀낸 관계라기보다{" "}
            <strong>사람들이 오래 나눠 온 이야기</strong>에 가깝다고 보시면
            됩니다.
          </p>
          <p>
            추첨은 꿈과 상관없이 무작위로 진행됩니다. 그러니 이 기능은 오늘 꾼
            꿈을 소재로 번호를 골라 보는 <strong>재미</strong>로 즐겨 주세요.
          </p>
          <p>
            과거 회차 통계를 참고한 번호는{" "}
            <Link href="/lotto/recommend">번호 추천 시뮬레이터</Link>에서 만들어
            볼 수 있습니다.
          </p>
        </GuideNote>
      </GuideSection>

      <Faq
        headingId="dream-faq"
        intro="꿈해몽 번호를 만들 때 자주 받는 질문입니다."
        items={[
          {
            question: "자료에 없는 꿈을 적으면 어떻게 되나요?",
            answer:
              "뜻이 비슷한 단어까지 넓혀서 찾아봅니다. 그래도 걸리는 단어가 하나도 없으면 조합을 만들지 않고 다른 표현을 권해 드립니다. 단어 하나만 적기보다 “큰 돼지가 집에 들어왔다” 처럼 문장으로 적으면 찾을 가능성이 훨씬 높습니다.",
          },
          {
            question: "추천 범위를 바꾸면 왜 번호가 달라지나요?",
            answer:
              "번호를 만드는 재료가 달라지기 때문입니다. 정확히 일치하는 단어만 쓰면 번호 묶음이 좁고, 포함된 단어나 비슷한 단어까지 넓히면 묶음이 커져서 다른 조합이 나옵니다. 어느 쪽이 더 맞는 것은 아니고, 재료가 다를 뿐입니다.",
          },
          {
            question: "같은 꿈을 다시 입력하면 같은 번호가 나오나요?",
            answer:
              "번호 묶음은 같지만 그 안에서 조합을 다시 뽑기 때문에 결과는 달라질 수 있습니다. 마음에 드는 조합이 나왔다면 저장해 두시는 편이 좋습니다.",
          },
          {
            question: "돼지꿈을 꾸면 정말 좋은 건가요?",
            answer:
              "전해 내려오는 이야기 속에서는 손꼽히는 길몽입니다. 재물이 들어온다는 풀이가 가장 널리 알려져 있고, 그래서 예부터 돼지꿈을 꾸면 복권을 산다는 말이 있었습니다. 다만 그건 오래 전해진 해석이고, 추첨은 꿈과 상관없이 무작위로 진행됩니다. 좋은 꿈을 꾼 날 그 꿈으로 번호를 골라 보는 재미로 즐겨 주세요.",
          },
        ]}
      />
    </>
  );
}
