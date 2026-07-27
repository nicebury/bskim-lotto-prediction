'use client'

import { useState } from 'react'

/**
 * '재미있는 사실' 본문 옆 스팟 일러스트 (002 R27, 400×400).
 *
 * `public/guide/{slug}.png`. 파일이 없으면 숨는다 — 깨진 이미지 아이콘을 남기지 않는다.
 * GuideHeroImage 와 같은 폴백 전략이고, 좁은 화면에서는 CSS(.fact-spot)가 감춘다.
 */
export function FactSpotImage({ slug, alt }: { slug: string; alt: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) return null

  return (
    <div className="fact-spot">
      <picture>
        <source srcSet={`/guide/${slug}.webp`} type="image/webp" />
        <img
          src={`/guide/${slug}.png`}
          alt={alt}
          width={400}
          height={400}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      </picture>
    </div>
  )
}
