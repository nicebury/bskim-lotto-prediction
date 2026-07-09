---
type: seo
title: "애드센스 승인 전 체크리스트"
description: "필수 정책 페이지 4종, 콘텐츠 최소 기준, 복권/도박 리스크 관리, 광고 배치·미렌더링·CLS 예약 규칙."
tags: [seo, adsense]
owner: frontend
status: stable
sources: ["raw:작업지시초안.md#11", "raw:작업지시서초안_보완.md#6.5", "raw:작업지시초안.md#19"]
created: 2026-07-09
updated: 2026-07-09
---

# 애드센스 승인 전 체크리스트

애드센스 통과를 보장할 수는 없다. 다만 아래 기준을 충족하면 심사에서 불리할 가능성을 줄인다(초안 11장). **승인 전에는 광고를 넣지 않는다.** 광고 코드는 콘텐츠 최소 기준을 충족하고 정책 페이지가 준비된 뒤에 삽입한다.

핵심 정책은 서비스 포지셔닝과 직결된다: 이 사이트는 "당첨 예측 사이트"가 아니라 "정보형 대시보드"다(초안 20장). 금지 표현은 [[forbidden-expressions]], 메타·본문 렌더링은 [[metadata-strategy]] 를 본다.

---

## 1. 필수 정책 페이지 4종 (초안 11.1)

MVP 에 다음 4개를 포함한다. 신청 전 실제 콘텐츠가 채워져 있어야 한다.

- [ ] `/privacy` — 개인정보처리방침
- [ ] `/terms` — 이용약관
- [ ] `/disclaimer` — 면책 고지
- [ ] `/contact` — 문의

개인정보처리방침에 포함할 내용:

- [ ] 수집하는 정보 / 수집 목적 / 보유 기간
- [ ] 쿠키 사용 여부
- [ ] **Google AdSense 및 제3자 광고 사업자의 쿠키 사용 가능성**
- [ ] 광고 개인화 관련 안내
- [ ] 사용자의 선택권
- [ ] 문의처

로그인이 없어도 서버 로그·쿠키·광고 식별자·GA·애드센스로 인해 개인정보/쿠키 안내가 필요하다(초안 11.1). 애널리틱스 도입 사실도 방침에 반영한다([[analytics]]).

---

## 2. 콘텐츠 최소 기준 (초안 11.2)

신청 전 다음 규모를 확보한다.

- [ ] 회차 상세 페이지 **20개 이상**
- [ ] 통계 상세 페이지 **3~5개 이상**
- [ ] 가이드 페이지 **5~10개 이상**
- [ ] 꿈해몽 키워드 페이지 **10개 이상**
- [ ] 뉴스/큐레이션 페이지 1개 이상
- [ ] 메인홈·로또 대시보드에 충분한 본문 설명

피해야 할 상태(초안 11.2·17장):

- API 데이터만 표로 출력하는 페이지
- 뉴스 제목만 복사해 나열
- 아이콘만 있는 메인홈
- 빈 페이지·"준비 중" 페이지 다수
- 광고 영역이 콘텐츠보다 많은 페이지
- 중복 템플릿만 반복되는 회차 페이지

이 기준이 [[metadata-strategy]] 의 "본문은 서버 렌더링" 원칙과 만난다. 회차·통계·추천·꿈해몽 페이지 모두 **API 표 위에 해석 본문**이 있어야 한다(초안 8장). 회차 페이지는 회차별 차별화 문장을 자동 생성하거나 보강한다.

---

## 3. 복권/도박 리스크 관리 (초안 11.3)

복권 콘텐츠는 광고 제한 주제로 분류될 수 있다. 다음을 지킨다.

**금지**

- [ ] 온라인 복권 구매 유도
- [ ] 복권 구매 대행
- [ ] 유료 번호 판매
- [ ] 당첨 보장 / 고확률 / 1등 예측 표현 ([[forbidden-expressions]])
- [ ] 카지노·도박 사이트 제휴 링크
- [ ] 구매 버튼 / 결제 유도

**권장**

- [ ] 공식 당첨결과 확인
- [ ] 회차별 데이터 정리
- [ ] 번호 통계 분석
- [ ] 재미용 번호 추천(면책 명시)
- [ ] 건전한 복권 이용 안내
- [ ] 19세 미만 구매 불가 안내 / 책임 있는 이용 안내

---

## 4. 광고 배치 기준 (초안 11.4)

승인 후에도 지킨다.

- [ ] 광고가 콘텐츠를 가리지 않는다.
- [ ] 버튼·메뉴·번호 생성 영역 바로 옆에 오해되게 배치하지 않는다.
- [ ] 광고가 내비게이션·액션 버튼처럼 보이지 않는다.
- [ ] 콘텐츠보다 광고가 많아 보이지 않는다.
- [ ] 추천번호 생성 버튼 주변에 광고를 과도하게 배치하지 않는다.

---

## 5. 구현 규칙

### 5.1 승인 전 광고 미렌더링

`NEXT_PUBLIC_ADSENSE_CLIENT` 가 **비어 있으면 광고 컴포넌트가 아무것도 렌더링하지 않는다**(보완판 6.5). 승인 전까지 이 변수를 공란으로 두면 코드가 이미 있어도 광고가 나가지 않는다.

```tsx
// app/components/AdSlot.tsx
"use client";
import { useEffect } from "react";

const CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;

export function AdSlot({ slot }: { slot: string }) {
  if (!CLIENT) return null; // 승인 전: 아무것도 렌더링하지 않음

  useEffect(() => {
    try {
      // @ts-expect-error adsbygoogle 전역
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {}
  }, []);

  return (
    // CLS 방지: 슬롯 높이를 미리 예약
    <div style={{ minHeight: 280 }}>
      <ins
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={CLIENT}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}
```

애드센스 로더 스크립트도 `next/script` 의 `strategy="afterInteractive"` 로 로드한다([[analytics]] 와 같은 원칙 — `beforeInteractive` 는 LCP 를 해친다). 로더 역시 `NEXT_PUBLIC_ADSENSE_CLIENT` 가 있을 때만 렌더링한다.

### 5.2 CLS 방지 슬롯 예약

광고 슬롯은 `min-height`(또는 `aspect-ratio`)를 예약해 광고가 늦게 로드돼도 레이아웃이 밀리지 않게 한다(보완판 5.3·6.5). CLS 는 Core Web Vitals 이자 SEO 요소다.

### 5.3 "준비 중" 페이지 광고 금지

연금복권·스피또 등 "준비 중" 페이지에는 **광고를 렌더링하지 않는다**(초안 3장·17장). 빈 페이지·공사 중 페이지에 광고를 노출하면 심사에 부정적이다. `AdSlot` 을 이런 페이지에 배치하지 않는다.

### 5.4 ads.txt 는 승인 후

`public/ads.txt` 는 **승인 후** 발급된 퍼블리셔 ID 로 추가한다(보완판 6.5). 승인 전에 미리 만들지 않는다.

---

## 6. 신청 직전 공식 문서 재확인 (초안 19장)

정책은 바뀐다. 신청 직전 다시 읽는다.

- [ ] [Google AdSense Program policies](https://support.google.com/adsense/answer/48182)
- [ ] [Google Publisher Policies](https://support.google.com/adsense/answer/10502938)
- [ ] [Google Publisher Restrictions](https://support.google.com/adsense/answer/10437795)
- [ ] [Make sure your site's pages are ready for AdSense](https://support.google.com/adsense/answer/7299563)
- [ ] [AdSense required content / privacy policy guidance](https://support.google.com/adsense/answer/1348695)

---

## 관련 페이지

- [[metadata-strategy]] — 본문 서버 렌더링(콘텐츠 품질 신호)
- [[structured-data]] — 과장 마크업·리뷰 마크업 금지
- [[analytics]] — `next/script` 로드 전략, 개인정보방침 쿠키 안내
- [[search-console-registration]] — 색인 확보(심사 전 인덱싱)
- [[forbidden-expressions]] — 금지 표현 정본
- [[env-vars]] — `NEXT_PUBLIC_ADSENSE_CLIENT`
