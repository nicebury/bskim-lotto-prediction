import { JsonLd, faqLd } from './JsonLd'

export interface FaqItem {
  question: string
  answer: string
}

/**
 * FAQ 아코디언 + FAQPage JSON-LD.
 *
 * ★ **화면에 보이는 질문/답변과 마크업이 정확히 일치해야 한다.** 그래서 한 컴포넌트가 둘을
 *   같은 배열로 렌더링한다. 화면에 없는 질문을 마크업에만 채우면 정책 위반이며 수동 조치
 *   대상이다(→ docs/wiki/30-seo/structured-data.md).
 *
 * <details>/<summary> 를 쓰면 JS 없이 펼쳐진다. 접근성도 브라우저가 처리한다.
 */
export function Faq({ items, title = '자주 묻는 질문' }: { items: FaqItem[]; title?: string }) {
  if (items.length === 0) return null

  return (
    <section className="section" aria-labelledby="faq-title">
      <div className="section-head">
        <h2 id="faq-title">{title}</h2>
      </div>

      <div className="card">
        {items.map((item, index) => (
          <details
            key={item.question}
            style={{
              paddingBlock: 'var(--space-3)',
              borderTop: index === 0 ? 'none' : '1px solid var(--color-border)',
            }}
          >
            <summary
              style={{
                cursor: 'pointer',
                fontWeight: 'var(--fw-semibold)',
                minHeight: 44,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {item.question}
            </summary>
            <p className="muted" style={{ marginTop: 'var(--space-2)', lineHeight: 1.7 }}>
              {item.answer}
            </p>
          </details>
        ))}
      </div>

      <JsonLd data={faqLd(items)} />
    </section>
  )
}
