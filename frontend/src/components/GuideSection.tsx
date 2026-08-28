import { Fragment } from "react";

import { InfoIcon } from "@/components/icons";

/**
 * 통계 화면 하단의 '읽는 법' 설명 — **표본 해부** 구조.
 *
 * 종전에는 기능 화면들이 `.prose` 안에 h3 몇 개와 문단 여러 개를 줄글로 이어 붙였다.
 * 내용은 정확했지만 두 가지가 문제였다.
 *   1. 모바일에서 벽처럼 읽혀 아무도 끝까지 내려가지 않는다.
 *   2. "쉽게 말씀드리자면 —", "동전으로 설명드리자면 —" 같은 상투구가 반복돼
 *      기계가 쓴 글처럼 읽힌다(사용자 지적).
 *
 * 그래서 설명을 **화면에 실제로 보이는 조각에 붙인다.** 표 한 줄, 추세 배지, 볼 다섯 색을
 * 그대로 두고 그 옆에 한 줄씩 라벨을 단다. 사용자는 지금 보고 있는 것을 그대로 짚어 가며
 * 읽고, 글은 짧아지는데 정보는 줄지 않는다(→ docs/wiki/20-design/components.md).
 *
 * ⚠ 표본의 숫자는 **실데이터가 아니라 예시다.** 위쪽 표가 보여 주는 값과 다를 수밖에 없고
 *   (조회 구간을 바꾸면 표는 바뀌지만 설명은 그대로다), 같아 보이면 오히려 오해를 만든다.
 *   그래서 `GuideCard` 가 '예시' 배지를 강제로 붙인다 — 호출부가 끌 수 없다.
 *
 * ⚠ 서버 컴포넌트다. 상호작용이 없으므로 클라이언트 경계를 넘지 않는다 — JS 를 꺼도
 *   본문이 그대로 보여야 하고(완료 기준), 이 절이 이 페이지 콘텐츠 가치의 큰 몫이다
 *   (→ docs/wiki/30-seo/adsense-readiness.md).
 */

/** 카드 파스텔. `--svc-*` 토큰 이름과 1:1 이다(→ styles/tokens.css). */
export type SpecimenAccent =
  "lotto" | "stats" | "reco" | "dream" | "news" | "pension";

interface SpecimenCardProps {
  /** 카드 제목. 무엇을 설명하는지 한 마디로. */
  title: string;
  /**
   * 카드 파스텔.
   *
   * ⚠ **색은 아무 뜻도 가리키지 않는다.** 카드 자리에 따라 순서대로 도는 팔레트일 뿐이다
   *   (1번째 news · 2번째 lotto · 3번째 reco · 4번째 stats). 화면마다 같은 순서로 도므로
   *   "이 화면의 두 번째 카드는 초록" 이 어디서나 참이다. 뜻을 담으려 하지 말 것 —
   *   담는 순간 카드를 옮길 때마다 색을 다시 정해야 한다.
   */
  accent: SpecimenAccent;
  /** 흰 타일 안에 놓일 선(stroke) 아이콘. `components/icons.tsx` 에서 고른다. */
  icon: React.ReactNode;
  /** 화면에서 그대로 떼어 온 조각. 실제 클래스를 써서 진짜와 같아 보이게 한다. */
  specimen: React.ReactNode;
  /** 조각의 각 부분에 붙는 라벨과 설명. 라벨은 칩으로 그려진다. */
  notes: { label: string; text: React.ReactNode }[];
  /**
   * 맨 아래 한 줄로 붙는 구체적인 예. "예:" 는 컴포넌트가 붙이므로 값만 넘긴다.
   * 없으면 그 줄을 그리지 않는다.
   */
  example?: string;
}

/**
 * 표본 하나 = 카드 하나.
 *
 * 조각을 위에, 라벨을 아래에 둔다. 좁은 화면에서 좌우로 나누면 라벨이 두 글자씩 접힌다.
 */
export function SpecimenCard({
  title,
  accent,
  icon,
  specimen,
  notes,
  example,
}: SpecimenCardProps) {
  return (
    <div className="spec-card" data-accent={accent}>
      <div className="spec-card-head">
        {/* 아이콘은 장식이 아니라 그 카드가 무엇에 관한 것인지 가리킨다. 흰 타일에 얹는
            이유는 대비다 — 파스텔 위에 원색 글리프를 바로 올리면 비텍스트 3:1 을 못 넘긴다. */}
        <span className="spec-card-icon">{icon}</span>
        <h3>{title}</h3>
        {/* 위 표와 값이 다른 이유를 여기서 미리 밝힌다. 색만으로 알리지 않으려고 글자를 쓴다. */}
        <span className="spec-tag">예시</span>
      </div>

      <div className="spec-body">{specimen}</div>

      {/*
        ⚠ dt/dd 를 감싸는 <div> 를 두지 않는다. 감싸면 행마다 grid 가 따로 생겨 **라벨 칸
          폭이 줄마다 달라지고**, 설명 글이 시작하는 x 좌표가 들쑥날쑥해진다(사용자 지적).
          dl 자체를 2열 grid 로 두면 라벨 칸이 카드 전체에서 하나로 공유된다.
      */}
      <dl className="spec-notes">
        {notes.map((note) => (
          <Fragment key={note.label}>
            <dt>{note.label}</dt>
            <dd>{note.text}</dd>
          </Fragment>
        ))}
      </dl>

      {example && (
        <p className="spec-example">
          <span>예</span>
          {example}
        </p>
      )}
    </div>
  );
}

/**
 * 표본으로 설명할 수 없는 것 — 왜 그런 모양이 나오는가, 무엇을 뜻하지 않는가 — 을 담는 블록.
 *
 * 카드 격자 아래 전폭으로 놓는다. 표본 카드와 같은 무게로 두면 "이것도 읽는 법" 처럼
 * 보이는데, 이 블록은 결론에 가깝다.
 */
export function GuideNote({
  title,
  icon,
  children,
}: {
  title: string;
  /** 없으면 기본 안내 아이콘을 쓴다. 결론 블록은 항상 아이콘을 갖는다. */
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="spec-note">
      <span className="spec-note-icon">{icon ?? <InfoIcon />}</span>
      <div>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}

/**
 * 설명 절 전체의 껍데기.
 *
 * `headingId` 는 호출부가 `aria-labelledby` 로 쓰던 id 를 그대로 넘긴다 — 랜드마크 이름이
 * 바뀌면 스크린리더 사용자의 목차가 달라진다.
 */
export function GuideSection({
  headingId,
  title,
  lede,
  children,
}: {
  headingId: string;
  title: string;
  /** 이 절이 무엇인지 한 줄. 없으면 제목만 나온다. */
  lede?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="section page-guide" aria-labelledby={headingId}>
      <div className="section-head">
        <h2 id={headingId}>{title}</h2>
      </div>
      {lede && <p className="page-guide-lede">{lede}</p>}
      {children}
    </section>
  );
}

/**
 * 표본 카드를 담는 격자. 데스크톱에서 오른쪽이 비지 않게 여러 열로 편다.
 *
 * ⚠ 클래스가 `spec-grid` 인 이유: `.guide-grid` 는 가이드 문서 링크 카드가 이미 쓴다.
 */
export function SpecimenGrid({ children }: { children: React.ReactNode }) {
  return <div className="spec-grid">{children}</div>;
}
