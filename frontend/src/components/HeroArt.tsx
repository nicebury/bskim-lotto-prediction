/**
 * 히어로 일러스트 — 로또 추첨기(유리구 + 볼 + 받침대).
 *
 * **순수 장식이다.** 옆의 헤드라인과 CTA 가 모든 정보를 전달하므로 접근성 트리에서 숨긴다.
 *
 * 사용자가 제공한 3D 렌더를 쓴다(`docs/raw/hero-lotto-machine.png` → `public/`).
 * 원본은 흰 배경 위 RGB 였으므로 배경을 투명화하고, 표시 크기의 2배(840×742)로 줄였다.
 * 다크 모드에서 히어로 배경이 어두워지기 때문에 투명 배경이 반드시 필요하다.
 *
 * 이 그림의 볼 색은 동행복권 공식 5구간과 일치한다 — 7(노랑) 14(파랑) 24(빨강)
 * 33(회색) 42(초록). 교체할 일이 생겨도 이 규칙을 지켜야 한다([[0009]]).
 *
 * ⚠ `next/image` 를 쓰지 않는다. `next.config.ts` 에서 이미지 최적화를 껐고(뉴스 썸네일
 *   도메인을 미리 알 수 없어서), 그 상태의 next/image 는 <img> 에 비해 얻는 것이 없다.
 *   대신 <picture> 로 WebP 를 우선 제공하고 PNG 로 폴백한다. WebP 는 75KB, PNG 는 545KB 다.
 *
 * ⚠ `width`/`height` 를 명시해 브라우저가 로드 전에 자리를 잡게 한다(CLS).
 *   `fetchPriority="high"` 는 이것이 첫 화면의 큰 그림임을 알린다(LCP).
 */
export function HeroArt() {
  return (
    <picture>
      <source srcSet="/hero-lotto-machine.webp" type="image/webp" />
      <img
        className="hero-img"
        src="/hero-lotto-machine.png"
        // 실제 파일 크기. CSS 가 표시 크기를 정하고, 이 값은 종횡비 예약에만 쓰인다.
        width={840}
        height={742}
        alt=""
        aria-hidden="true"
        fetchPriority="high"
        decoding="async"
      />
    </picture>
  )
}
