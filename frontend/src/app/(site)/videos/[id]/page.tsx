import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { AdSlot } from "@/components/AdSlot";
import { Breadcrumb } from "@/components/Breadcrumb";
import { Card } from "@/components/Card";
import { Disclaimer } from "@/components/Disclaimer";
import { BallRow } from "@/components/LottoBall";
import { KeyValueList } from "@/components/stats";
import { VideoCard } from "@/components/video/VideoCard";
import { VideoEmbed } from "@/components/video/VideoEmbed";
import { YouTubeAttribution } from "@/components/video/YouTubeAttribution";
import { getRoundOptional, getVideo, getVideos } from "@/lib/api";
import type { RoundDetail, VideoDetail } from "@/lib/api-types";
import {
  formatDrawDate,
  formatDuration,
  formatNumber,
  formatPubDate,
  formatViews,
  formatWon,
} from "@/lib/format";
import { rangeSentence, traitRows, traitSentence } from "@/lib/traits";

/**
 * 영상 전용 페이지 — 임베드 재생 + 그 회차의 우리 데이터.
 *
 * ── ⚠ 왜 회차 데이터를 함께 두는가 ─────────────────────────────────
 * YouTube 개발자 정책 III.G.1.d 는 API 데이터가 있는 화면에 광고를 붙이려면 **"유튜브
 * 데이터를 걷어냈을 때도 광고를 붙일 만한 독립적 가치"** 가 남아야 한다고 요구한다.
 * 당첨번호·당첨금·번호 구성은 우리가 수집한 우리 자산이므로 영상을 지워도 남는다
 * (→ docs/wiki/90-external/youtube-data-api.md, docs/raw/004-유튜브영상수집계획.md).
 *
 * ⚠ 그래서 **회차를 붙일 수 없는 영상에는 광고도 붙이지 않는다.** `game` 이 `unknown`
 *   이거나 `round` 가 없으면 독립적 가치가 없는 화면이 되므로 광고 슬롯 자체를 그리지 않는다.
 *
 * ⚠ **`game` 을 반드시 함께 본다.** 회차 번호만 보고 이으면 연금복권 330회 영상에 로또
 *   330회 당첨번호가 붙는다 — 에러 없이 조용히 틀린 번호가 화면에 뜬다.
 *
 * ⚠ 광고는 플레이어와 **떨어진 자리**에 둔다(III.G.1.c: 플레이어 위·안 광고 금지).
 *   순서를 바꿔 광고를 위로 올리지 않는다.
 */
export const revalidate = 21600; // 6시간. 영상 데이터의 정책 상한(24시간) 안쪽이다.

type Params = { params: Promise<{ id: string }> };

/** 회차를 붙일 수 있는 영상인가. 이 판정 하나가 화면의 절반과 광고 노출을 가른다. */
function linkedRound(video: VideoDetail): number | null {
  return video.game === "lotto" && video.round !== null ? video.round : null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const parsed = Number.parseInt(id, 10);
  if (!Number.isFinite(parsed)) return {};

  const video = await getVideo(parsed);
  if (!video) return {};

  const round = linkedRound(video);

  /*
    ⚠ **제목·설명을 우리가 짓는다.** 영상 제목을 그대로 `title` 에 쓰지 않는다.
      수집 단계에서 금지 표현을 거르지만(→ forbidden-expressions.md), 걸러지지 않은 표현이
      검색 결과와 브라우저 탭에 우리 사이트 이름과 나란히 뜨는 것은 다른 문제다.
      제목은 본문에 원문 그대로 둔다 — 보여주되 우리 이름으로 내세우지 않는다.
  */
  const title = round
    ? `제${round}회 로또 당첨번호 영상`
    : "로또 당첨번호 영상";
  const description = round
    ? `제${round}회 로또 추첨 영상과 함께 그 회차의 당첨번호, 1등 당첨금, 번호 구성을 확인하세요.`
    : "로또 관련 영상입니다. 당첨번호와 통계는 회차별 당첨번호 화면에서 확인하세요.";

  return {
    title,
    description,
    alternates: { canonical: `/videos/${parsed}` },
    openGraph: { type: "video.other", url: `/videos/${parsed}`, title, description },
    /*
      ⚠ 회차를 붙일 수 없는 영상은 **색인하지 않는다.** 그런 페이지에 남는 것은 임베드
        하나뿐이라 우리 고유 본문이 없다 — 얇은 페이지가 대량으로 색인되면 사이트 전체
        평가가 내려간다(→ docs/wiki/30-seo/metadata-strategy.md). 페이지는 그대로 열린다.
    */
    ...(round ? {} : { robots: { index: false, follow: true } }),
  };
}

export default async function VideoDetailPage({ params }: Params) {
  const { id } = await params;
  const parsed = Number.parseInt(id, 10);
  if (!Number.isFinite(parsed)) notFound();

  const video = await getVideo(parsed);
  // 백엔드가 이 리소스를 아직 만들지 않았거나 영상이 지워졌다. 둘 다 "없는 페이지" 다.
  if (!video) notFound();

  const round = linkedRound(video);

  /*
    계약상 백엔드가 `draw` 를 함께 담을 수도, 담지 않을 수도 있다(백엔드 판단). 담겨 있으면
    그것을 쓰고, 없으면 회차 API 를 따로 부른다.
    ⚠ `getRoundOptional`(삼키는 쪽)을 쓴다. 영상이 주인공이고 회차는 곁들이는 자료라,
      회차를 못 가져왔다고 영상까지 안 보이면 안 된다(→ lib/api.ts 주석).
  */
  const draw: RoundDetail | null =
    video.draw ?? (round !== null ? await getRoundOptional(round) : null);

  // 같은 회차의 다른 영상. 회차를 못 붙이면 이 블록도 없다.
  const siblings =
    round !== null
      ? (await getVideos("all", 1, 7, { round, game: "lotto" })).items.filter(
          (item) => item.id !== video.id,
        )
      : [];

  const traits = draw?.traits ?? null;

  return (
    <div className="container">
      <Breadcrumb
        items={[
          { name: "홈", href: "/" },
          { name: "영상", href: "/videos" },
          {
            name: round ? `제${round}회 영상` : "영상",
            href: `/videos/${video.id}`,
          },
        ]}
      />

      <article>
        {/* ── 1. 임베드 플레이어 ────────────────────────────── */}
        <section className="section">
          <VideoEmbed videoKey={video.video_key} title={video.title} />

          {/*
            ⚠ 제목은 **원문 그대로** 싣는다. 낱말을 바꾸거나 지우지 않는다
              (→ docs/wiki/40-domain/forbidden-expressions.md 외부 텍스트 절).
            ⚠ `h1` 에 남의 문장이 들어가는 유일한 화면이다. 그래서 바로 아래에 출처를 밝힌다.
          */}
          <h1 className="video-title">{video.title}</h1>

          <p className="video-meta">
            {video.channel && <span>{video.channel}</span>}
            {formatViews(video.views) && <span>{formatViews(video.views)}</span>}
            <span>{formatPubDate(video.published_at)}</span>
            {formatDuration(video.duration_sec) && (
              <span>{formatDuration(video.duration_sec)}</span>
            )}
          </p>

          {/* III.F.2 — 출처 표시 의무. 플레이어가 있는 화면에서는 특히 분명해야 한다. */}
          <YouTubeAttribution videoKey={video.video_key} channel={video.channel} />

          <Disclaimer spaced>
            영상의 제목과 내용은 해당 채널이 만든 것이며 본 사이트의 의견이 아닙니다. 로또
            추첨은 매 회차 앞선 결과와 무관하게 진행되며 당첨을 보장하지 않습니다.
          </Disclaimer>
        </section>

        {/*
          ⚠ 아래 블록들은 **회차를 붙일 수 있을 때만** 그린다. 회차 번호만 보고 이으면
            연금복권 영상에 로또 당첨번호가 붙는다 — 조용히 틀린 번호가 뜬다.
        */}
        {draw && (
          <>
            {/* ── 2. 그 회차 당첨번호 ──────────────────────── */}
            <section className="section" aria-labelledby="draw-title">
              <div className="section-head">
                <h2 id="draw-title">제{draw.round_no}회 당첨번호</h2>
                <span className="section-note">{formatDrawDate(draw.draw_date)} 추첨</span>
              </div>
              <Card>
                <BallRow numbers={draw.numbers} bonus={draw.bonus} />
                <p className="muted" style={{ marginTop: "var(--space-4)", fontSize: "var(--fs-sm)" }}>
                  이 번호는 동행복권이 발표한 실제 추첨 결과입니다.{" "}
                  <Link href={`/lotto/round/${draw.round_no}`}>
                    제{draw.round_no}회 상세 보기
                  </Link>
                </p>
              </Card>
            </section>

            {/* ── 3. 그 회차 당첨 정보 ─────────────────────── */}
            {(draw.first_winner_count !== null || draw.first_win_amount !== null) && (
              <section className="section" aria-labelledby="prize-title">
                <div className="section-head">
                  <h2 id="prize-title">제{draw.round_no}회 1등 당첨 정보</h2>
                </div>
                <Card>
                  <KeyValueList
                    rows={[
                      draw.first_winner_count !== null && {
                        label: "1등 당첨자 수",
                        value: `${formatNumber(draw.first_winner_count)}명`,
                      },
                      draw.first_win_amount !== null && {
                        label: "1등 1게임당 당첨금",
                        value: formatWon(draw.first_win_amount),
                      },
                      draw.total_sell_amount !== null && {
                        label: "총 판매금액",
                        value: formatWon(draw.total_sell_amount),
                      },
                    ].filter(Boolean) as { label: string; value: string }[]}
                  />
                </Card>
              </section>
            )}

            {/* ── 4. 그 회차 번호 구성 ─────────────────────── */}
            {traits && (
              <section className="section" aria-labelledby="traits-title">
                <div className="section-head">
                  <h2 id="traits-title">제{draw.round_no}회 번호 구성</h2>
                </div>
                <Card>
                  <div className="prose">
                    <p>{traitSentence(traits, "이 회차의 당첨번호")}</p>
                    <p>{rangeSentence(traits)}</p>
                  </div>
                  <div style={{ marginTop: "var(--space-4)" }}>
                    <KeyValueList rows={traitRows(traits)} />
                  </div>
                </Card>
                <Disclaimer spaced>
                  위 수치는 이 회차 당첨번호가 가진 성향을 사실 그대로 정리한 것입니다. 다음
                  회차의 추첨 결과와는 관계가 없습니다.
                </Disclaimer>
              </section>
            )}

            {/*
              ── 5. 광고 ──────────────────────────────────
              ⚠ 여기가 광고의 자리다. 위로 올리지 않는다.
                ① III.G.1.c — 플레이어 **위·안**에 광고를 두지 않는다. 플레이어와 이 사이에
                   당첨번호·당첨금·번호 구성 세 블록이 들어가 충분히 떨어진다.
                ② III.G.1.d — 위 세 블록이 "유튜브 데이터를 걷어내도 남는 독립적 가치" 다.
                   그것이 없는 화면에는 이 슬롯 자체가 그려지지 않는다(바깥 조건문).
                ③ 오클릭 — 위아래를 실제 콘텐츠가 감싸므로 잘못 누를 자리가 줄어든다.
            */}
            <AdSlot slot="video-detail" />
          </>
        )}

        {/* ── 7. 같은 회차의 다른 영상 ──────────────────── */}
        {siblings.length > 0 && (
          <section className="section" aria-labelledby="sibling-title">
            <div className="section-head">
              <h2 id="sibling-title">제{round}회 다른 영상</h2>
            </div>
            <ul className="video-grid">
              {siblings.map((item) => (
                <li key={item.id}>
                  <VideoCard video={item} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── 8. 안내 ───────────────────────────────────── */}
        <section className="section prose" aria-labelledby="about-title">
          <h2 id="about-title">이 영상에 대하여</h2>
          <p>
            이 영상은 유튜브에서 공식 방법으로 가져온 정보로 만든 목록의 한 편이며, 재생은
            유튜브 공식 플레이어가 합니다. 영상 파일은 본 사이트에 저장되어 있지 않고,
            조회수도 유튜브에 그대로 쌓입니다.
          </p>
          {!draw && (
            <p>
              이 영상은 어느 회차인지 확인되지 않아 당첨번호를 함께 보여드리지 못했습니다.
              회차 번호만 보고 짐작해 붙이면 연금복권 영상에 로또 번호가 붙는 것 같은 일이
              생기므로, <strong>확실하지 않을 때는 붙이지 않습니다.</strong>
            </p>
          )}
          <p>
            회차별 당첨번호는 <Link href="/lotto/latest">회차별 당첨번호</Link>에서, 번호별
            출현 기록은 <Link href="/lotto/stat">번호별 출현빈도</Link>에서 직접 확인하실 수
            있습니다. 영상 목록은 <Link href="/videos">로또 영상</Link>으로 돌아가 보실 수
            있습니다.
          </p>
        </section>
      </article>
    </div>
  );
}
