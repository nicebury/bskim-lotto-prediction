'use client'

import { useState } from 'react'

/**
 * 가이드 상세 헤더 이미지 (002 R14·R34).
 *
 * 각 상세페이지 제목 아래 대표 일러스트 1장. 파일은 사용자가 AI 로 만들어
 * `public/guide/{slug}-hero.png`(+ 선택 `.webp`)에 넣는다(명세: docs/raw/002-이미지제작요청서.md).
 *
 * ⚠ **이미지가 아직 없어도 화면이 깨지지 않아야 한다.** 파일이 없으면 `onError` 로 요소
 *   전체를 숨긴다 — 깨진 이미지 아이콘을 남기지 않는다. 그래서 클라이언트 컴포넌트다(로드
 *   실패는 브라우저에서만 알 수 있다). 이미지 하나 때문에 페이지 전체가 클라이언트로
 *   떨어지지 않게 작게 격리했다.
 *
 * `aspect-ratio` 로 자리를 예약해 CLS 를 막고, 다크모드를 위해 배경 투명 PNG 를 쓴다.
 * next/image 미사용(현행 unoptimized 정합) — <picture> 로 webp 우선, png 폴백.
 */
export function GuideHeroImage({ slug, alt }: { slug: string; alt: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) return null

  return (
    <div className="guide-hero-img">
      <picture>
        <source srcSet={`/guide/${slug}-hero.webp`} type="image/webp" />
        <img
          src={`/guide/${slug}-hero.png`}
          alt={alt}
          width={1200}
          height={675}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      </picture>
    </div>
  )
}
