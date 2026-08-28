import { JsonLd, faqLd } from "@/components/JsonLd";

/**
 * 자주 묻는 질문 — 접었다 펴는 목록.
 *
 * ⚠ `<details>/<summary>` 를 쓴다. 직접 만든 아코디언이 아니다.
 *   - **JS 를 꺼도 펼칠 수 있다.** 이 사이트의 완료 기준이기도 하고, 검색엔진이 답변 본문을
 *     읽어야 이 절이 콘텐츠 가치를 가진다(→ docs/wiki/30-seo/adsense-readiness.md).
 *   - 키보드·스크린리더 동작(Enter/Space, 펼침 상태 안내)을 브라우저가 이미 준다. 직접
 *     만들면 `aria-expanded`·포커스 관리를 손으로 맞춰야 하고 대개 틀린다.
 *
 * ⚠ 답변은 **평문 문자열**만 받는다. 리치 텍스트를 허용하지 않는 이유는 구조화 데이터다 —
 *   FAQPage 는 **화면에 보이는 텍스트와 정확히 일치할 때만** 내보낼 수 있는데
 *   (→ docs/wiki/30-seo/structured-data.md), JSX 를 받으면 그 일치를 보장할 수 없다.
 *   링크가 꼭 필요하면 그 문답은 FAQ 가 아니라 본문에 두는 편이 맞다.
 *
 * ⚠ 금지 표현은 여기에도 적용된다. 질문이 "어떤 번호가 잘 나오나요?" 처럼 예측을 전제하면
 *   답변에서 그 전제를 바로잡되, 질문 문구 자체가 예측을 약속하게 두지 않는다
 *   (→ docs/wiki/40-domain/forbidden-expressions.md).
 */
export interface FaqItem {
  question: string;
  /** 평문만. 위 주석 참조. */
  answer: string;
}

export function Faq({
  /**
   * 제목 요소의 id. 한 페이지에 FAQ 가 둘이면 서로 달라야 한다 —
   * 같으면 `aria-labelledby` 가 엉뚱한 제목을 가리킨다.
   * 기본값을 둔 이유는 가이드 페이지들이 이 인자 없이 이미 쓰고 있기 때문이다.
   */
  headingId = "faq-title",
  title = "자주 묻는 질문",
  items,
  /** 이 목록이 무엇인지 한 줄. 없으면 제목 바로 아래에서 목록이 시작한다. */
  intro,
  /**
   * FAQPage 구조화 데이터를 함께 내보낼지.
   *
   * ⚠ 한 페이지에 FAQPage 를 두 번 내보내지 않는다. 같은 화면에 이 컴포넌트가 두 개
   *   있다면 하나만 켠다. 기본값이 true 인 이유는 대부분 한 페이지에 하나이기 때문이다.
   */
  structuredData = true,
}: {
  headingId?: string;
  title?: string;
  items: FaqItem[];
  intro?: string;
  structuredData?: boolean;
}) {
  if (items.length === 0) return null;

  return (
    <section className="section faq" aria-labelledby={headingId}>
      <div className="section-head">
        <h2 id={headingId}>{title}</h2>
      </div>

      {intro && <p className="faq-intro">{intro}</p>}

      <div className="faq-list">
        {items.map((item) => (
          <details className="faq-item" key={item.question}>
            <summary>
              <span className="faq-question">{item.question}</span>
              {/*
                펼침 방향은 CSS 가 회전시킨다. 상태는 <details> 가 이미 말해 준다.

                ⚠ 크기를 CSS 에만 맡기지 않고 **속성으로 못박는다.** 어떤 이유로든
                  `.faq-chevron svg` 규칙이 안 먹으면 SVG 는 부모 칸을 그대로 채워 버린다 —
                  실제로 "아이콘이 영역을 다 차지한다" 는 지적을 받았다. 속성이 있으면
                  원인과 무관하게 재발하지 않는다.
              */}
              <span className="faq-chevron" aria-hidden="true">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </span>
            </summary>
            <p className="faq-answer">{item.answer}</p>
          </details>
        ))}
      </div>

      {structuredData && (
        <JsonLd
          data={faqLd(
            items.map((i) => ({ question: i.question, answer: i.answer })),
          )}
        />
      )}
    </section>
  );
}
