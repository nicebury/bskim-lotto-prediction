---
type: seo
title: "구조화 데이터(JSON-LD) 타입별 적용"
description: "Organization·WebSite·BreadcrumbList·Article·Dataset 적용 대상과 최소 필드. FAQPage는 화면에 실제 FAQ가 보일 때만."
tags: [seo]
owner: frontend
status: stable
sources: ["raw:작업지시초안.md#12.4", "raw:작업지시서초안_보완.md#6.2"]
created: 2026-07-09
updated: 2026-07-09
---

# 구조화 데이터 (JSON-LD)

검색결과 리치 스니펫과 사이트 구조 이해를 돕기 위해 페이지에 JSON-LD 를 심는다. Next.js 에서는 서버 컴포넌트가 `<script type="application/ld+json">` 을 렌더링하고, `dangerouslySetInnerHTML` 로 `JSON.stringify(data)` 를 주입한다. 메타데이터(title/OG) 규칙은 [[metadata-strategy]] 를 본다.

## 절대 원칙 (초안 12.4)

- **페이지에 실제로 보이지 않는 내용을 구조화 데이터에 넣지 않는다.** 마크업은 화면 콘텐츠의 기계 판독용 표현이지, 별도의 과장 채널이 아니다.
- **검색결과를 조작하기 위한 과장 마크업 금지.**
- **리뷰/평점(`Review`/`AggregateRating`) 마크업 금지** — 실제 사용자 리뷰가 없다. 이 프로젝트는 로그인·리뷰 기능이 없으므로 해당 마크업을 절대 만들지 않는다.
- 금지 표현(당첨 확률·고확률·1등 예측 등)을 `description`·`name` 등 어떤 필드에도 쓰지 않는다([[forbidden-expressions]]).

---

## 타입별 적용 대상

| 타입 | 적용 위치 |
|------|----------|
| `Organization` | 루트 레이아웃 (전 페이지 공통, 사이트 1회) |
| `WebSite` | 루트 레이아웃 (사이트 검색 sitelinks searchbox) |
| `BreadcrumbList` | 계층이 있는 전 페이지 |
| `Article` | 가이드·뉴스·꿈해몽 상세 |
| `Dataset` | 통계 페이지(`/lotto/stat/*`) |
| `FAQPage` | **실제 FAQ 가 화면에 보이는 페이지에서만** |

---

## Organization

사이트를 발행하는 주체. 루트 레이아웃에서 한 번 렌더링한다.

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "행운상자",
  "url": "https://<도메인>",
  "logo": "https://<도메인>/logo.png"
}
```

`url`·`logo` 오리진은 `NEXT_PUBLIC_SITE_URL` 로 조립한다([[env-vars]]).

## WebSite

사이트 단위 정보. 사이트 내 검색이 있으면 `potentialAction` 으로 검색 URL 패턴을 알린다.

```json
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "행운상자",
  "url": "https://<도메인>",
  "potentialAction": {
    "@type": "SearchAction",
    "target": "https://<도메인>/search?q={query}",
    "query-input": "required name=query"
  }
}
```

> 사이트 내 검색 UI 가 실제로 존재할 때만 `potentialAction` 을 넣는다. 검색 페이지가 없으면 `name`·`url` 만 남긴다.

## BreadcrumbList

계층 구조를 검색결과 경로로 노출한다. 화면의 breadcrumb UI 와 항목이 일치해야 한다.

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "홈", "item": "https://<도메인>/" },
    { "@type": "ListItem", "position": 2, "name": "로또", "item": "https://<도메인>/lotto" },
    { "@type": "ListItem", "position": 3, "name": "제1184회", "item": "https://<도메인>/lotto/round/1184" }
  ]
}
```

## Article (가이드·뉴스·꿈해몽)

본문 콘텐츠가 있는 문서형 페이지. 초안 12.4 의 "Article 또는 BlogPosting: 가이드/뉴스/꿈해몽" 에 해당.

```json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "로또 당첨금 수령 방법",
  "description": "1등부터 5등까지 당첨금 수령 절차와 필요 서류를 안내합니다.",
  "author": { "@type": "Organization", "name": "행운상자" },
  "publisher": {
    "@type": "Organization",
    "name": "행운상자",
    "logo": { "@type": "ImageObject", "url": "https://<도메인>/logo.png" }
  },
  "datePublished": "2026-07-09",
  "dateModified": "2026-07-09"
}
```

뉴스 페이지에 적용할 때 `headline`·`description` 은 큐레이션한 요약을 쓰고, **원문을 복제하지 않는다**(초안 14.3).

## Dataset (통계 페이지)

번호 통계 페이지는 데이터셋을 서술하는 성격이므로 `Dataset` 을 검토한다(초안 12.4). 통계 수치 자체가 아니라 "무엇에 대한 데이터인가"를 설명한다.

```json
{
  "@context": "https://schema.org",
  "@type": "Dataset",
  "name": "로또 6/45 번호별 출현 빈도 통계",
  "description": "역대 로또 6/45 당첨번호를 집계한 번호별 출현 횟수 데이터입니다.",
  "creator": { "@type": "Organization", "name": "행운상자" },
  "license": "https://<도메인>/terms"
}
```

`description` 은 "과거 회차의 분포를 이해하기 위한 참고 정보"라는 초안 8.2 의 톤을 유지하고, 예측·적중 어휘를 배제한다.

## FAQPage — 조건부

**실제 FAQ 가 그 페이지 화면에 렌더링될 때만** 넣는다(초안 12.4). 가이드 페이지 하단에 실제 질문/답변 아코디언이 있고, 그 텍스트와 마크업의 `Question`/`Answer` 가 **정확히 일치**할 때에 한한다. 화면에 없는 질문을 마크업에만 채우면 정책 위반이며 수동 조치 대상이 된다.

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "로또 당첨번호는 어디서 확인하나요?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "매주 추첨 후 회차 상세 페이지에서 당첨번호와 보너스 번호를 확인할 수 있습니다."
      }
    }
  ]
}
```

FAQ 섹션이 없는 페이지에는 `FAQPage` 를 넣지 않는다. 이것이 [[adsense-readiness]] 의 "저가치·과장 신호 회피" 와 같은 원칙이다.

---

## 검증

배포 전 각 타입을 Google Rich Results Test 와 Schema Markup Validator 로 확인한다. 신청 직전 공식 문서를 재확인한다(초안 19장): [Google Structured Data 소개](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data).

## 관련 페이지

- [[metadata-strategy]] — title/description/OG, 렌더링 전략
- [[analytics]] — 측정 스크립트
- [[adsense-readiness]] — 콘텐츠 품질·과장 회피
- [[forbidden-expressions]] — 금지 표현 정본
- [[env-vars]] — 사이트 URL/이름 변수
