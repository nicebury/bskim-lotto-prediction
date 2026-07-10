import Link from 'next/link'
import type { ReactNode } from 'react'

/**
 * 콘텐츠 컨테이너의 기본 골격. 상태를 갖지 않는다.
 *
 * 시맨틱: 독립적으로 이해되는 카드는 <article>, 페이지 구획은 <section>.
 * 호출부가 `as` 로 고른다 — 스타일이 시맨틱을 결정하게 두지 않는다.
 */
interface CardProps {
  title?: ReactNode
  /** 제목의 헤딩 레벨. 페이지의 h1→h2→h3 계층을 건너뛰지 않기 위해 호출부가 정한다. */
  titleAs?: 'h2' | 'h3'
  /** "더보기" 링크 등 카드 우상단 액션. */
  action?: ReactNode
  as?: 'article' | 'section' | 'div'
  className?: string
  children: ReactNode
}

export function Card({
  title,
  titleAs: TitleTag = 'h3',
  action,
  as: Tag = 'div',
  className,
  children,
}: CardProps) {
  return (
    <Tag className={`card${className ? ` ${className}` : ''}`}>
      {(title || action) && (
        <div className="card-head">
          {title && <TitleTag>{title}</TitleTag>}
          {action}
        </div>
      )}
      {children}
    </Tag>
  )
}

/** 카드 우상단의 "더보기 >" 링크. */
export function MoreLink({ href, label = '더보기' }: { href: string; label?: string }) {
  return (
    <Link className="more-link" href={href}>
      {label}
      <span aria-hidden="true">›</span>
    </Link>
  )
}

/**
 * 데이터가 없을 때의 폴백.
 *
 * 백엔드가 아직 기동되지 않았거나 응답하지 않을 때 화면이 텅 비면 사용자는 고장인지
 * 데이터가 없는 것인지 알 수 없다. 문구로 구분해 알리고, 높이를 예약해 CLS 를 막는다.
 */
export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="empty-state">{children}</p>
}
