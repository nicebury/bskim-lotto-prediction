import Link from "next/link";
import type { Metadata } from "next";

import { Breadcrumb } from "@/components/Breadcrumb";
import { Card, EmptyState } from "@/components/Card";
import { Faq } from "@/components/Faq";
import {
  GuideNote,
  GuideSection,
  SpecimenCard,
  SpecimenGrid,
} from "@/components/GuideSection";
import { ArticleIcon, ClockIcon, InfoIcon } from "@/components/icons";
import { VideoCard } from "@/components/video/VideoCard";
import { getVideos } from "@/lib/api";
import type { VideoKind } from "@/lib/api-types";
import { formatNumber } from "@/lib/format";

/**
 * 로또 영상 목록.
 *
 * ⚠ **재생하지 않는다.** 카드는 전용 상세 페이지로 보내고, 임베드 플레이어는 거기에만 둔다.
 *   목록에 플레이어를 깔면 정책 III.G.1.d 의 "독립적 가치" 판단이 어려워지고, 무엇보다
 *   iframe 스무 개가 한 화면에 뜨면 페이지가 느려진다.
 *
 * ⚠ **캐시를 오래 두지 않는다.** `lotto_video` 의 행은 30일 안에 갱신되거나 삭제된다
 *   (YouTube 정책 III.E.4). `getVideos` 의 `REVALIDATE.video`(6시간)와 이 값이 함께 상한을
 *   지킨다 — 여기만 길게 두면 데이터는 새것인데 화면이 옛것이 된다.
 */
export const revalidate = 21600; // 6시간

/** 한 쪽에 보여줄 영상 수. 계약 상한은 100 이지만 화면에는 그렇게 많이 필요 없다. */
const PAGE_SIZE = 24;

/**
 * 목록 필터.
 *
 * ⚠ `unknown` 은 `일반` 에도 `쇼츠` 에도 들어가지 않고 **`전체` 에서만 보인다**(계약).
 *   모르는 것을 어느 한쪽으로 밀면 그 순간 추정이 확정이 된다. 화면 문구도 그렇게 쓴다.
 */
const KINDS: { value: VideoKind; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "normal", label: "일반 영상" },
  { value: "shorts", label: "쇼츠" },
];

export const metadata: Metadata = {
  title: "로또 당첨번호 영상",
  description:
    "로또 추첨 방송과 당첨번호 확인 영상을 모았습니다. 영상마다 그 회차의 당첨번호와 당첨금을 함께 볼 수 있습니다.",
  alternates: { canonical: "/videos" },
  openGraph: {
    type: "website",
    url: "/videos",
    title: "로또 당첨번호 영상",
    description: "로또 추첨 방송과 당첨번호 확인 영상 모음.",
  },
};

type SearchParams = { searchParams: Promise<{ kind?: string; page?: string }> };

export default async function VideosPage({ searchParams }: SearchParams) {
  const query = await searchParams;

  // 계약에 없는 값은 조용히 기본값으로 되돌린다. 사용자가 주소창을 고쳐도 422 를 보여주지 않는다.
  const kind: VideoKind =
    KINDS.find((k) => k.value === query.kind)?.value ?? "all";
  const parsedPage = Number.parseInt(query.page ?? "1", 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  const result = await getVideos(kind, page, PAGE_SIZE);
  const lastPage = Math.max(1, Math.ceil(result.total / PAGE_SIZE));

  /** 필터·쪽 이동 링크. 기본값은 주소에서 뺀다 — `/videos?kind=all&page=1` 은 군더더기다. */
  const href = (next: { kind?: VideoKind; page?: number }) => {
    const params = new URLSearchParams();
    const k = next.kind ?? kind;
    const p = next.page ?? 1;
    if (k !== "all") params.set("kind", k);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/videos?${qs}` : "/videos";
  };

  return (
    <div className="container">
      <Breadcrumb
        items={[
          { name: "홈", href: "/" },
          { name: "영상", href: "/videos" },
        ]}
      />

      <section className="section">
        <h1>로또 당첨번호 영상</h1>
        <p className="muted" style={{ marginTop: "var(--space-2)" }}>
          추첨 방송과 당첨번호 확인 영상을 모았습니다. 영상을 열면 그 회차의 당첨번호와
          당첨금을 함께 볼 수 있습니다.
        </p>
      </section>

      <section className="section" aria-labelledby="video-list-title">
        <div className="section-head">
          <h2 id="video-list-title">영상 목록</h2>
          {result.total > 0 && (
            <span className="section-note">전체 {formatNumber(result.total)}개</span>
          )}
        </div>

        {/*
          ⚠ 링크로 만든다. 버튼 + JS 로 만들면 JS 를 끈 사용자가 필터를 쓸 수 없고,
            검색엔진이 각 갈래를 따라가지 못한다(완료 기준: JS 를 꺼도 본문이 보인다).
        */}
        <nav className="video-kinds" aria-label="영상 갈래 선택">
          {KINDS.map((item) => (
            <Link
              key={item.value}
              href={href({ kind: item.value, page: 1 })}
              className="video-kind"
              data-active={item.value === kind ? "" : undefined}
              aria-current={item.value === kind ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {kind !== "all" && (
          <p className="video-kind-note">
            쇼츠 여부는 재생시간과 게시일로 <strong>추정</strong>한 값입니다. 판별하는 공식
            방법이 없어, 어느 쪽인지 알 수 없는 영상은 <strong>전체</strong>에서만 보입니다.
          </p>
        )}

        {result.items.length === 0 ? (
          <Card>
            <EmptyState>
              아직 모인 영상이 없습니다. 영상 수집이 시작되면 이곳에 채워집니다.
            </EmptyState>
          </Card>
        ) : (
          <>
            <ul className="video-grid">
              {result.items.map((video) => (
                <li key={video.id}>
                  <VideoCard video={video} />
                </li>
              ))}
            </ul>

            {lastPage > 1 && (
              <nav className="video-pager" aria-label="쪽 이동">
                {page > 1 ? (
                  <Link className="btn btn-secondary" href={href({ page: page - 1 })}>
                    ‹ 이전
                  </Link>
                ) : (
                  <span />
                )}
                <span className="video-pager-now">
                  {formatNumber(page)} / {formatNumber(lastPage)} 쪽
                </span>
                {page < lastPage ? (
                  <Link className="btn btn-secondary" href={href({ page: page + 1 })}>
                    다음 ›
                  </Link>
                ) : (
                  <span />
                )}
              </nav>
            )}
          </>
        )}
      </section>

      <GuideSection
        headingId="how-videos"
        title="이 영상들은 어떻게 모으나요?"
        lede="영상은 우리가 만들지 않습니다. 어디서 무엇을 가져오는지 밝혀 둡니다."
      >
        <SpecimenGrid>
          <SpecimenCard
            accent="news"
            icon={<ArticleIcon />}
            title="1. 공식 API 로만 가져옵니다"
            specimen={
              <>
                <span className="muted">제목 · 채널 · 게시일 · 재생시간</span>
              </>
            }
            notes={[
              {
                label: "가져오는 것",
                text: "영상의 제목과 채널명, 게시일 같은 정보만 가져옵니다.",
              },
              {
                label: "가져오지 않는 것",
                text: "영상 파일과 자막, 썸네일 이미지 파일은 내려받지 않습니다. 재생은 유튜브 공식 플레이어가 합니다.",
              },
            ]}
            example="영상은 유튜브에서 재생되고, 조회수도 유튜브에 쌓입니다"
          />

          <SpecimenCard
            accent="lotto"
            icon={<ClockIcon />}
            title="2. 오래된 정보를 남겨 두지 않습니다"
            specimen={
              <>
                <strong>30일</strong>
                <span className="spec-rank">→</span>
                <span className="muted">갱신 또는 삭제</span>
              </>
            }
            notes={[
              {
                label: "규칙",
                text: "가져온 정보는 30일 안에 다시 확인하거나 지웁니다. 유튜브가 정한 규칙입니다.",
              },
              {
                label: "이유",
                text: "영상이 비공개로 바뀌거나 삭제됐는데 우리 화면에 남아 있으면 안 되기 때문입니다.",
              },
            ]}
            example="비공개로 바뀐 영상은 목록에서 사라집니다"
          />

          <SpecimenCard
            accent="reco"
            icon={<InfoIcon />}
            title="3. 쇼츠 여부는 추정입니다"
            specimen={
              <>
                <span className="muted">재생시간 · 게시일</span>
                <span className="spec-rank">→</span>
                <strong>추정</strong>
              </>
            }
            notes={[
              {
                label: "왜 추정인가",
                text: "쇼츠인지 알려 주는 공식 방법이 없습니다. 재생시간과 게시일로 미루어 짐작합니다.",
              },
              {
                label: "모를 때는",
                text: "어느 쪽인지 알 수 없으면 일반에도 쇼츠에도 넣지 않고 전체에만 둡니다.",
              },
            ]}
            example="3분 이하 가로 영상은 쇼츠로 잘못 볼 수 있습니다"
          />
        </SpecimenGrid>

        <GuideNote title="영상의 내용은 우리 의견이 아닙니다">
          <p>
            영상 제목과 내용은 각 채널이 만든 것이며, 우리가 고르거나 다듬지 않습니다.
            <strong> 제목을 우리 마음대로 바꾸지 않는 것</strong>도 그래서입니다 — 남이 쓴
            글을 우리가 고쳐 보여주는 것은 옳지 않습니다.
          </p>
          <p>
            영상에서 어떤 번호를 이야기하더라도 그것은 그 채널의 이야기입니다. 로또 추첨은
            매 회차 앞선 결과와 무관하게 새로 진행되며, 어떤 방법으로도 다음 결과를 알 수
            없습니다.
          </p>
          <p>
            당첨번호는 <Link href="/lotto/latest">회차별 당첨번호</Link>에서, 번호 통계는{" "}
            <Link href="/lotto/stat">번호별 출현빈도</Link>에서 직접 확인하실 수 있습니다.
          </p>
        </GuideNote>
      </GuideSection>

      <Faq
        headingId="video-faq"
        intro="영상 목록을 보실 때 자주 받는 질문입니다."
        items={[
          {
            question: "영상은 어디서 재생되나요?",
            answer:
              "유튜브 공식 플레이어에서 재생됩니다. 영상을 누르면 우리 사이트의 영상 페이지로 이동하고, 거기서 유튜브 플레이어가 열립니다. 영상 파일은 우리가 가지고 있지 않으며 조회수도 유튜브에 그대로 쌓입니다.",
          },
          {
            question: "쇼츠와 일반 영상은 어떻게 구분하나요?",
            answer:
              "재생시간과 게시일로 미루어 짐작합니다. 쇼츠인지 알려 주는 공식 방법이 없기 때문입니다. 그래서 어느 쪽인지 알 수 없는 영상은 일반에도 쇼츠에도 넣지 않고 전체 목록에만 둡니다. 3분 이하의 가로 영상이 쇼츠로 잘못 분류될 수 있습니다.",
          },
          {
            question: "영상이 갑자기 사라지기도 하나요?",
            answer:
              "네. 채널이 영상을 비공개로 바꾸거나 지우면 우리 목록에서도 사라집니다. 가져온 정보를 30일 안에 다시 확인하거나 지우도록 되어 있어서, 없어진 영상이 화면에 계속 남아 있지 않습니다.",
          },
          {
            question: "영상에서 말하는 번호를 믿어도 되나요?",
            answer:
              "영상의 내용은 그 채널이 만든 것이고 우리 의견이 아닙니다. 로또 추첨은 매 회차 앞선 결과와 무관하게 새로 진행되므로 어떤 방법으로도 다음 결과를 미리 알 수 없습니다. 당첨번호와 통계는 회차별 당첨번호와 번호별 출현빈도 화면에서 직접 확인해 보시기 바랍니다.",
          },
        ]}
      />
    </div>
  );
}
