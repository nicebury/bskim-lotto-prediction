---
name: frontend-design
description: "프론트엔드 디자인 구현 시 사용. Tailwind CSS를 활용한 실제 코드 레벨의 디자인 구현, 컴포넌트 패턴, 애니메이션, 반응형 레이아웃 등 디자인 시스템을 코드로 변환하는 전문 스킬."
---

# Frontend Design Implementation Skill

당신은 디자인을 코드로 완벽하게 구현하는 프론트엔드 디자인 엔지니어입니다. Tailwind CSS + Next.js + TypeScript 환경에서 픽셀 퍼펙트한 구현을 합니다.

## 기본 설정

### Tailwind 커스텀 설정 (tailwind.config.ts)

```typescript
// 프로젝트에 반드시 포함할 커스텀 설정
const config = {
  theme: {
    extend: {
      // 브랜드 컬러 (에쓰오씨소프트 기준)
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#1c75bc',  // CI 메인 블루
          600: '#1a68a8',
          700: '#155a8a',
          800: '#10456b',
          900: '#0b304c',
          950: '#071e30',
        },
        accent: {
          DEFAULT: '#9f2214',  // CI 레드
        },
        dark: {
          DEFAULT: '#231f20',  // CI 다크
        },
      },
      // 폰트
      fontFamily: {
        sans: ['var(--font-noto-sans-kr)', 'system-ui', 'sans-serif'],
      },
      // 애니메이션
      animation: {
        'fade-in-up': 'fadeInUp 0.6s ease-out forwards',
        'fade-in': 'fadeIn 0.5s ease-out forwards',
        'slide-in-left': 'slideInLeft 0.5s ease-out forwards',
        'slide-in-right': 'slideInRight 0.5s ease-out forwards',
        'count-up': 'countUp 2s ease-out forwards',
      },
      keyframes: {
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(30px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideInLeft: {
          '0%': { opacity: '0', transform: 'translateX(-30px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(30px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
      },
    },
  },
};
```

## 컴포넌트 패턴 라이브러리

### 1. 히어로 섹션

```tsx
// 다크 배경 + 오버레이 + 중앙 텍스트 + CTA 패턴
<section className="relative h-screen min-h-[600px] flex items-center justify-center overflow-hidden">
  {/* 배경 이미지 */}
  <Image src="..." alt="" fill className="object-cover" priority />
  {/* 그라디언트 오버레이 */}
  <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/70" />
  {/* 콘텐츠 */}
  <div className="relative z-10 text-center text-white max-w-4xl mx-auto px-6">
    <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight tracking-tight">
      제목
    </h1>
    <p className="mt-6 text-lg md:text-xl text-white/80 max-w-2xl mx-auto">
      부제목
    </p>
    <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
      <a className="px-8 py-4 bg-primary-500 hover:bg-primary-600 text-white rounded-lg font-medium transition-all duration-300 hover:-translate-y-0.5">
        Primary CTA
      </a>
      <a className="px-8 py-4 border-2 border-white/30 hover:border-white/60 text-white rounded-lg font-medium transition-all duration-300">
        Secondary CTA
      </a>
    </div>
  </div>
</section>
```

### 2. 섹션 컨테이너

```tsx
// 표준 섹션 래퍼
<section className="py-20 md:py-28 lg:py-32">
  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    {/* 섹션 헤더 */}
    <div className="text-center max-w-3xl mx-auto mb-16">
      <span className="text-primary-500 font-semibold text-sm uppercase tracking-wider">
        섹션 라벨
      </span>
      <h2 className="mt-3 text-3xl md:text-4xl font-bold text-gray-900">
        섹션 제목
      </h2>
      <p className="mt-4 text-lg text-gray-600">
        섹션 설명
      </p>
    </div>
    {/* 콘텐츠 */}
  </div>
</section>
```

### 3. 카드 그리드

```tsx
// 사업영역 카드 패턴
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
  {items.map((item, i) => (
    <div
      key={i}
      className="group relative overflow-hidden rounded-2xl bg-white shadow-sm hover:shadow-xl transition-all duration-500 hover:-translate-y-1"
    >
      {/* 이미지 */}
      <div className="aspect-[4/3] overflow-hidden">
        <Image
          src={item.image}
          alt={item.title}
          fill
          className="object-cover transition-transform duration-700 group-hover:scale-110"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
      </div>
      {/* 텍스트 */}
      <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
        <h3 className="text-xl font-bold">{item.title}</h3>
        <p className="mt-2 text-sm text-white/80 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          {item.description}
        </p>
      </div>
    </div>
  ))}
</div>
```

### 4. 숫자/통계 섹션

```tsx
// 다크 배경 + 카운트업 숫자
<section className="relative py-20 bg-primary-900 text-white overflow-hidden">
  <Image src="/images/pexels/numbers-bg.jpg" alt="" fill className="object-cover opacity-20" />
  <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
      {stats.map((stat, i) => (
        <div key={i}>
          <p className="text-4xl md:text-5xl font-bold text-white">
            {stat.value}<span className="text-primary-300">{stat.suffix}</span>
          </p>
          <p className="mt-2 text-sm md:text-base text-white/70">{stat.label}</p>
        </div>
      ))}
    </div>
  </div>
</section>
```

### 5. 네비게이션 헤더

```tsx
// 스크롤 시 배경 변화하는 고정 헤더
<header className={cn(
  "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
  isScrolled
    ? "bg-white/95 backdrop-blur-md shadow-sm"
    : "bg-transparent"
)}>
  <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div className="flex items-center justify-between h-16 md:h-20">
      {/* 로고 */}
      {/* 데스크톱 메뉴 */}
      {/* 모바일 햄버거 */}
    </div>
  </nav>
</header>
```

### 6. 푸터

```tsx
// 다크 풀 푸터
<footer className="bg-gray-900 text-gray-300">
  {/* 메인 푸터 */}
  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
      {/* 회사 정보 */}
      {/* 메뉴 그룹들 */}
    </div>
  </div>
  {/* 하단 바 */}
  <div className="border-t border-gray-800">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col md:flex-row justify-between items-center gap-4">
      <p className="text-sm text-gray-500">COPYRIGHT &copy; SOC SOFT Inc. ALL RIGHTS RESERVED</p>
      <div className="flex gap-6 text-sm">
        <a href="#" className="hover:text-white transition-colors">개인정보처리방침</a>
      </div>
    </div>
  </div>
</footer>
```

## 서브 페이지 배너 패턴

```tsx
// 서브 페이지 상단 배너 + 브레드크럼 탭
<div className="relative h-[300px] md:h-[400px] flex items-end overflow-hidden">
  <Image src={bannerImage} alt="" fill className="object-cover" />
  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/20" />
  <div className="relative z-10 w-full">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
      <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">{sectionTitle}</h2>
      <div className="flex gap-1 overflow-x-auto scrollbar-hide">
        {tabs.map(tab => (
          <a
            key={tab.href}
            href={tab.href}
            className={cn(
              "px-5 py-2.5 rounded-t-lg text-sm font-medium whitespace-nowrap transition-colors",
              tab.active
                ? "bg-white text-gray-900"
                : "text-white/70 hover:text-white hover:bg-white/10"
            )}
          >
            {tab.label}
          </a>
        ))}
      </div>
    </div>
  </div>
</div>
```

## 스크롤 애니메이션 구현

### Intersection Observer 훅

```tsx
'use client';
import { useEffect, useRef, useState } from 'react';

export function useInView(options?: IntersectionObserverInit) {
  const ref = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.unobserve(el);  // 한 번만 트리거
        }
      },
      { threshold: 0.1, ...options }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, isInView };
}

// 사용
function Section() {
  const { ref, isInView } = useInView();
  return (
    <div
      ref={ref}
      className={cn(
        "transition-all duration-700",
        isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
      )}
    >
      콘텐츠
    </div>
  );
}
```

### Stagger 애니메이션

```tsx
// 카드 리스트 순차 등장
{items.map((item, i) => (
  <div
    key={i}
    className={cn(
      "transition-all duration-700",
      isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
    )}
    style={{ transitionDelay: isInView ? `${i * 100}ms` : '0ms' }}
  >
    {/* 카드 내용 */}
  </div>
))}
```

## 반응형 디자인 필수 규칙

1. **모바일 퍼스트**: 기본 = 모바일, `md:` `lg:` 로 확장
2. **텍스트 사이즈**: `text-2xl md:text-3xl lg:text-4xl` — 단계적 확대
3. **그리드**: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` — 단계적 확장
4. **여백**: `py-12 md:py-20 lg:py-28` — 화면 커질수록 여백 증가
5. **숨김 요소**: `hidden md:block` — 모바일에서 보조 요소 숨김
6. **테이블**: 모바일에서 카드/리스트로 변환, 가로 스크롤은 최후의 수단

## 구현 시 금지 사항

- ❌ `px-[37px]` — arbitrary value 남발 금지. 8px 그리드에 맞추기
- ❌ `!important` — specificity 문제는 구조로 해결
- ❌ 인라인 스타일 — Tailwind로 해결 불가능한 경우에만 사용
- ❌ 고정 높이 (`h-[500px]`) — `min-h-`, `aspect-ratio` 등 유연한 방식 사용
- ❌ 텍스트 이미지 — 반드시 HTML 텍스트로 구현
- ❌ 스크롤 가로 이동 — 네비게이션 탭 등 불가피한 경우 외 금지
