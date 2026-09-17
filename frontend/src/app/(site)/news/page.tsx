import Link from "next/link";
import { Suspense } from "react";

import type { Metadata } from "next";

import { AdSlot } from "@/components/AdSlot";
import { Breadcrumb } from "@/components/Breadcrumb";
import { Faq } from "@/components/Faq";
import {
  GuideNote,
  GuideSection,
  SpecimenCard,
  SpecimenGrid,
} from "@/components/GuideSection";
import { ArticleIcon, ClockIcon, FilterIcon, NewsIcon } from "@/components/icons";
import { Card, EmptyState } from "@/components/Card";
import { NewsFilter } from "@/components/NewsFilter";
import { NewsFeed } from "@/components/NewsFeed";
import { Pagination } from "@/components/Pagination";
import { getNews } from "@/lib/api";
import type { NewsPeriod } from "@/lib/api-types";
import { formatNumber } from "@/lib/format";

export const revalidate = 3600;

const PAGE_SIZE = 20;

/** 허용 기간값. 잘못된 값이 URL 로 들어오면 화면 기본값(1w)으로 되돌린다. */
const PERIODS: NewsPeriod[] = ["1w", "2w", "1m", "3m", "6m", "all"];
const PERIOD_LABEL: Record<NewsPeriod, string> = {
  "1w": "최근 1주",
  "2w": "최근 2주",
  "1m": "최근 1개월",
  "3m": "최근 3개월",
  "6m": "최근 6개월",
  all: "전체 기간",
};

export const metadata: Metadata = {
  title: "복권 뉴스 — 로또 관련 최신 소식",
  description:
    "네이버 검색으로 수집한 로또·복권 관련 최신 뉴스를 키워드와 기간으로 검색하고, 출처·발행일·요약과 함께 확인하세요.",
  alternates: { canonical: "/news" },
  openGraph: {
    type: "website",
    url: "/news",
    title: "복권 뉴스 — 로또 관련 최신 소식",
    description:
      "네이버 검색으로 수집한 로또·복권 관련 최신 뉴스를 키워드·기간으로 확인하세요.",
  },
};

/**
 * 복권 뉴스 큐레이션 (002 R29~R33).
 *
 * 조회 조건(키워드·기간)과 페이지는 **URL 쿼리스트링**으로 관리한다 — 각 조회 결과가
 * 서버 렌더링되어 검색엔진이 읽고, 공유·새로고침·뒤로가기가 자연스럽다. 화면 기본값은
 * `period=1w`(최근 1주)이고, API 기본값(all)과 구분한다([[api-contract]] 뉴스 절).
 *
 * 제목만 복사해 나열하지 않는다. 출처·발행일·요약·키워드를 함께 보여주고, 원문은 외부
 * 링크로 보낸다. 뉴스 상세 페이지는 만들지 않는다(우리가 쓰지 않은 글에 우리 URL 을
 * 붙이지 않는다).
 *
 * ⚠ searchParams 를 읽으므로 이 라우트는 dynamic 이다. 뉴스는 조회 조건이 본질이라
 *   ISR 로 굳히기보다 매 요청 렌더가 맞다(revalidate 는 fetch 데이터 캐시에만 적용).
 *
 * ★ **페이지 컴포넌트는 아무것도 await 하지 않는다.** 데이터 대기는 아래 NewsResults 가
 *   Suspense 안에서 맡는다. 이유는 SEO 다 — dynamic 라우트에서 페이지 컴포넌트가 응답을
 *   기다리면 Next 는 셸(`<head>`)을 먼저 흘려보낸 뒤 **메타데이터를 스트림 뒷부분에**
 *   끼워 넣는다. 그러면 `<meta name="description">` 이 `<body>` 안에 앉고, Lighthouse SEO
 *   가 "설명이 없다" 로 판정한다(실측: /news 만 91점, 나머지 정적 라우트는 100점.
 *   2026-08-21). 브라우저는 body 의 meta 도 읽지만 우리 완료 기준은 SEO 100 이다.
 *   ⚠ 여기서 다시 `await` 를 쓰면 조용히 91점으로 돌아간다.
 */
export default function NewsPage({
  searchParams,
}: {
  searchParams: Promise<{ keyword?: string; period?: string; page?: string }>;
}) {
  return (
    <div className="container">
      <Breadcrumb
        items={[
          { name: "홈", href: "/" },
          { name: "복권 뉴스", href: "/news" },
        ]}
      />

      {/* 머리. 영상 목록과 같은 문법(`media-hero`)이라 두 모음 화면이 한 사이트로 읽힌다. */}
      <section className="media-hero" aria-labelledby="news-title">
        <p className="media-eyebrow">
          <NewsIcon width={14} height={14} /> 복권 소식 모음
        </p>
        <h1 id="news-title">복권 뉴스</h1>
        <p className="media-lede">
          로또와 복권 관련 최신 소식을 모았습니다. 제목을 누르면 언론사 원문으로
          이동합니다.
        </p>
      </section>

      {/* fallback 은 목록 자리의 높이를 잡아 둔다 — 스트리밍으로 내용이 채워질 때
          레이아웃이 밀리지 않게(CLS 방지). */}
      <Suspense fallback={<NewsResultsSkeleton />}>
        <NewsResults searchParams={searchParams} />
      </Suspense>

      <AdSlot slot="news-bottom" />

      {/* ── 수집 방식: 표본 해부 ─────────────────────────── */}
      <GuideSection
        headingId="news-about"
        title="뉴스는 어떻게 수집하나요?"
        lede="기사 한 건이 목록에 오르기까지 거치는 관문을 짚었습니다."
      >
        <SpecimenGrid>
          <SpecimenCard
            accent="news"
            icon={<ArticleIcon />}
            title="한 건에 담기는 것"
            specimen={
              <>
                <strong>제목</strong>
                <span className="muted">언론사 · 발행일 · 짧은 요약</span>
              </>
            }
            notes={[
              {
                label: "출처",
                text: "네이버 검색 API 로 로또·복권 관련 키워드를 검색해 모읍니다.",
              },
              {
                label: "본문",
                text: "전체를 옮겨 오지 않습니다. 기사를 읽으려면 원문 링크로 이동해야 합니다.",
              },
            ]}
            example="제목 · 언론사 · 발행일 · 짧은 요약"
          />

          <SpecimenCard
            accent="lotto"
            icon={<FilterIcon />}
            title="제목으로 걸러 냅니다"
            specimen={
              <>
                <span className="muted">‘로또 청약’ · ‘반도체 복권’</span>
                <span className="spec-rank">✕</span>
              </>
            }
            notes={[
              {
                label: "이유",
                text: "검색은 본문까지 뒤지므로, 각주에 스친 단어 하나로 무관한 기사가 딸려 옵니다.",
              },
              {
                label: "기준",
                text: "제목에 검색어가 있어야 담고, 부동산·증시 비유어가 있으면 버립니다.",
              },
            ]}
            example="“로또 청약”, “반도체 복권” 은 걸러 냅니다"
          />

          <SpecimenCard
            accent="reco"
            icon={<ClockIcon />}
            title="최근 것만"
            specimen={
              <>
                <span className="muted">발행일</span>
                <strong>어제·오늘</strong>
                <span className="spec-rank">✓</span>
              </>
            }
            notes={[
              {
                label: "신선도",
                text: "발행한 지 하루가 넘은 기사는 담지 않습니다.",
              },
              {
                label: "빈 구간",
                text: "수집이 멈춘 기간의 기사는 나중에 채워지지 않습니다. 목록에 구멍이 보이면 그 때문입니다.",
              },
            ]}
            example="어제·오늘 발행분만 담습니다"
          />
        </SpecimenGrid>

        <GuideNote title="기사 내용에 대한 책임">
          <p>
            기사에 담긴 견해와 사실 관계는 각 언론사의 책임입니다. 행운상자는
            기사 내용을 검증하거나 보증하지 않으며, 특정 기사에 담긴 당첨 관련
            서술을 지지하지 않습니다.
          </p>
          <p>
            제목과 요약, 출처, 발행일만 정리해 보여 주고 본문은 원문으로
            보냅니다.
          </p>
        </GuideNote>
      </GuideSection>

      <Faq
        headingId="news-faq"
        intro="뉴스 목록이 지금처럼 보이는 이유를 설명합니다."
        items={[
          {
            question: "왜 어제오늘 기사만 보이나요?",
            answer:
              "발행한 지 하루가 넘은 기사는 새로 담지 않기 때문입니다. 오래된 기사가 목록을 채우면 정작 새 소식이 뒤로 밀리거든요. 이전에 모아 둔 기사까지 보고 싶으면 기간 필터를 넓혀 주세요.",
          },
          {
            question: "중간에 날짜가 비어 있습니다.",
            answer:
              "그 기간에 수집이 이루어지지 않아 생긴 구멍입니다. 검색이 최신순으로만 결과를 주기 때문에, 지나간 날짜의 기사를 나중에 되돌아가 채워 넣을 수가 없습니다. 수집 코드의 문제는 아닙니다.",
          },
          {
            question: "복권과 관계없는 기사가 보입니다.",
            answer:
              "제목에 검색어가 없거나 부동산·증시 비유어(‘로또 청약’ 같은)가 들어간 기사는 걸러 내고 있습니다. 검색이 본문까지 뒤지다 보니 각주에 스친 단어 하나로 엉뚱한 기사가 딸려 오는데, 그래서 제목만 봅니다. 그래도 남는 것이 있으면 문의로 알려 주세요.",
          },
          {
            question: "기사 전문을 여기서 볼 수 없나요?",
            answer:
              "볼 수 없습니다. 저작권이 각 언론사에 있어서 제목과 짧은 요약만 정리하고 본문은 원문 링크로 보내 드립니다. 제목을 누르면 해당 언론사 페이지로 이동합니다.",
          },
        ]}
      />
    </div>
  );
}

/**
 * 요청 시각의 KST 날짜(`YYYY-MM-DD`).
 * ⚠ `en-CA` 로케일은 날짜를 ISO 순서로 찍는다. 서버 시간대와 무관하게 서울 기준 날짜를 얻는다.
 */
function todayKst(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

/** 스트리밍 중 자리를 잡아 두는 껍데기. 높이만 예약하고 내용은 비운다. */
function NewsResultsSkeleton() {
  return (
    <section className="section" aria-hidden="true">
      <div className="news-skeleton" />
    </section>
  );
}

/** 조회 조건을 읽고 뉴스를 가져와 그리는 부분. 여기서만 await 한다. */
async function NewsResults({
  searchParams,
}: {
  searchParams: Promise<{ keyword?: string; period?: string; page?: string }>;
}) {
  const params = await searchParams;

  const keyword = (params.keyword ?? "").trim();
  const period: NewsPeriod = PERIODS.includes(params.period as NewsPeriod)
    ? (params.period as NewsPeriod)
    : "1w";
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const newsPage = await getNews(page, PAGE_SIZE, { keyword, period });
  const { items, total } = newsPage;

  // 현재 필터를 유지한 채 page 만 바꾸는 링크 빌더(페이지네이션이 쓴다).
  const buildHref = (nextPage: number) => {
    const query = new URLSearchParams();
    if (keyword) query.set("keyword", keyword);
    if (period !== "1w") query.set("period", period);
    if (nextPage > 1) query.set("page", String(nextPage));
    const qs = query.toString();
    return qs ? `/news?${qs}` : "/news";
  };

  const hasFilter = keyword !== "" || period !== "1w";

  return (
    <section className="section" aria-labelledby="news-list-title">
      <h2 id="news-list-title" className="sr-only">
        뉴스 검색과 목록
      </h2>

      <NewsFilter keyword={keyword} period={period} />

      {/* 현재 조회 조건과 건수를 알려 준다 — 필터가 적용됐음을 명확히. */}
      <p className="media-meta">
        {keyword && (
          <>
            <strong>&lsquo;{keyword}&rsquo;</strong> 검색 ·{" "}
          </>
        )}
        <span>{PERIOD_LABEL[period]}</span>
        <span className="media-meta-count">{formatNumber(total)}건</span>
        {keyword && (
          <Link className="media-meta-clear" href={period !== "1w" ? `/news?period=${period}` : "/news"}>
            검색 지우기
          </Link>
        )}
      </p>

      {items.length > 0 ? (
        /*
          ⚠ 주요 기사(크게)는 **첫 쪽에서만** 세운다. 2쪽의 첫 기사는 '가장 최근' 이 아니다.
          ⚠ `today` 는 요청 시각의 KST 날짜다. 이 라우트는 searchParams 때문에 요청마다 그려지므로
            "오늘 · 어제" 라벨이 캐시에 굳어 날짜가 지나도 남는 일이 없다.
        */
        <NewsFeed items={items} featured={page === 1} today={todayKst()} />
      ) : (
        <Card>
          <EmptyState>
            {hasFilter
              ? "조건에 맞는 뉴스가 없습니다. 키워드나 기간을 바꿔 보세요."
              : "표시할 뉴스가 없습니다. 잠시 후 다시 확인해 주세요."}
          </EmptyState>
        </Card>
      )}
      <Pagination
        page={page}
        total={total}
        size={PAGE_SIZE}
        buildHref={buildHref}
      />
    </section>
  );
}
