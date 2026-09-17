import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { Breadcrumb } from "@/components/Breadcrumb";
import { Disclaimer } from "@/components/Disclaimer";
import { DreamGuide } from "@/components/DreamGuide";
import { DreamStudio } from "@/components/DreamStudio";
import { JsonLd, articleLd } from "@/components/JsonLd";
import { getDreamKeywords } from "@/lib/api";
import { getDreamMeaning } from "@/lib/dream-meanings";
import { SITE_NAME, SITE_URL } from "@/lib/env";
import { eulReul, eunNeun } from "@/lib/korean";
import { DISCLAIMER, DREAM_INDEXED_KEYWORDS } from "@/lib/site";

/**
 * 꿈 키워드별 상세. 롱테일 SEO 확장의 핵심이다("돼지꿈 로또번호" 같은 검색어).
 *
 * ⚠ 해몽 풀이는 **손으로 쓴 것만** 보여준다(→ lib/dream-meanings.ts). 백엔드 계약
 *   (`/api/dream/keywords`)은 슬러그와 표제어만 주므로, 4,800여 표제어 전부에 풀이를
 *   기계로 만들어 붙이지 않는다 — 그렇게 부풀린 페이지가 곧 저품질 콘텐츠다.
 *   풀이가 있는 소재만 그 절을 그리고, 없으면 공통 설명만 남는다.
 * ⚠ 풀이는 **전해 오는 민간 해석**으로만 적는다. 화면에도 그렇게 밝힌다.
 *
 * ⚠ "돼지꿈이면 당첨"처럼 인과를 확정 표현하지 않는다.
 * ⚠ 슬러그는 한글 그대로다(`/dream/돼지`). 로마자로 바꾸지 않는다 — 계약.
 */
export const revalidate = 604800;
export const dynamicParams = true;

/**
 * 빌드 시 미리 구울 키워드.
 *
 * 사전 표제어는 4,800개가 넘지만 **색인 대상은 선별한 소수뿐이다**(→ lib/site.ts
 * `DREAM_INDEXED_KEYWORDS`). 색인하지도 않을 페이지를 수백 개 굽는 것은 빌드 시간과 백엔드
 * 부하만 쓰는 일이라, 사전 생성 대상도 그 목록에 맞춘다.
 * 나머지 키워드는 첫 요청 때 생성된다(ISR) — 열리기는 똑같이 열린다.
 */
export async function generateStaticParams() {
  // 백엔드가 없으면 빈 배열 → 빌드를 실패시키지 않고 전부 요청 시 생성한다.
  const keywords = await getDreamKeywords();
  if (keywords.length === 0) return [];

  const dictionary = new Set(keywords.map((keyword) => keyword.slug));
  const prerender = DREAM_INDEXED_KEYWORDS.filter((slug) =>
    dictionary.has(slug),
  );

  // 조용히 자르지 않는다. 무엇이 빌드에서 빠졌는지 로그에 남긴다.
  console.info(
    `[dream] 키워드 ${keywords.length}개 중 색인 대상 ${prerender.length}개만 사전 생성합니다. ` +
      "나머지는 첫 요청 시 생성되며 검색에는 노출하지 않습니다.",
  );

  return prerender.map((slug) => ({ keyword: slug }));
}

type Params = { params: Promise<{ keyword: string }> };

/** 슬러그로 키워드를 찾는다. 목록에 없으면 404 다 — 임의의 슬러그로 페이지를 열지 않는다. */
async function findKeyword(slug: string) {
  const keywords = await getDreamKeywords();
  return keywords.find((keyword) => keyword.slug === slug) ?? null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  // 라우트 파라미터는 퍼센트 인코딩된 채로 올 수 있다. 계약의 슬러그는 한글 원문이다.
  const { keyword: raw } = await params;
  const keyword = await findKeyword(decodeURIComponent(raw));
  if (!keyword) return {};

  const word = keyword.word;
  const title = `${word} 꿈 로또 번호 추천 | 꿈해몽 번호 생성`;
  /*
    설명문에 그 소재의 민간 해석 한 줄을 앞세운다. 검색 결과에 뜨는 문장이 페이지마다
    달라야 열 장이 서로 다른 문서로 읽힌다 — 뒤 문장만 쓰면 표제어만 바뀐 같은 설명이 된다.
  */
  const meaning = getDreamMeaning(keyword.slug);
  const description = meaning
    ? `${word} 꿈은 ${meaning.summary} 전해 오는 해석을 바탕으로 참고용 로또 번호를 만들어 드립니다. 오래 전해 내려온 이야기를 소재로 한 재미용 콘텐츠입니다.`
    : `${word} 꿈을 소재로 참고용 로또 번호를 만들어 보세요. 오래 전해 내려온 이야기를 소재로 한 재미용 콘텐츠입니다.`;
  const url = `/dream/${encodeURIComponent(keyword.slug)}`;

  /*
    선별한 키워드만 색인한다(2026-08-19).

    백엔드는 표제어와 번호만 주고 해몽 풀이 본문은 주지 않는다. 없는 내용을 지어내지 않기로
    한 이상 4,800여 개 페이지는 서로 거의 같은 얇은 문서이고, 그런 페이지가 대량으로 색인되면
    사이트 전체가 저품질로 평가될 위험이 있다(→ docs/wiki/30-seo/metadata-strategy.md).
    페이지는 그대로 열리고 번호 생성도 정상 동작한다 — 검색에만 내보내지 않는다.
  */
  const indexed = (DREAM_INDEXED_KEYWORDS as readonly string[]).includes(
    keyword.slug,
  );

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "article", url, title, description },
    ...(indexed ? {} : { robots: { index: false, follow: true } }),
  };
}

export default async function DreamKeywordPage({ params }: Params) {
  const { keyword: raw } = await params;
  const keyword = await findKeyword(decodeURIComponent(raw));

  // 백엔드가 죽어 있으면 키워드 목록이 비어 모든 슬러그가 404 가 된다. 데이터 없이 페이지를
  // 만들어 내는 것보다 정직한 실패다.
  if (!keyword) notFound();

  const word = keyword.word;
  // 색인 대상 소재에만 손으로 쓴 풀이가 있다. 나머지는 null 이고 그 절을 그리지 않는다.
  const meaning = getDreamMeaning(keyword.slug);

  return (
    <div className="container">
      <Breadcrumb
        items={[
          { name: "홈", href: "/" },
          { name: "꿈해몽 번호 추천", href: "/dream" },
          {
            name: `${word} 꿈`,
            href: `/dream/${encodeURIComponent(keyword.slug)}`,
          },
        ]}
      />

      <article>
        <section className="section">
          <h1>{word} 꿈 로또 번호</h1>
          <p className="muted" style={{ marginTop: "var(--space-2)" }}>
            {eulReul(word)} 소재로 참고용 번호를 만들어 봅니다.
          </p>
        </section>

        <section className="section" aria-labelledby="dream-input">
          <h2 id="dream-input" className="sr-only">
            꿈 내용 입력
          </h2>
          {/* 키워드를 미리 채워 두면 사용자가 바로 생성할 수 있다. 문장은 자유롭게 고칠 수 있다. */}
          <DreamStudio initialText={`${eulReul(word)} 보는 꿈을 꿨습니다`} />
          <Disclaimer spaced>{DISCLAIMER.dream}</Disclaimer>
        </section>

        <section className="section prose" aria-labelledby="about-keyword">
          <h2 id="about-keyword">{word} 꿈에 대하여</h2>

          {/*
            ⚠ 소재마다 다른 내용은 여기 하나뿐이다. 이 절이 없으면 소재 페이지들이 표제어만
              바뀐 같은 문서가 된다(→ lib/dream-meanings.ts 주석). 풀이가 없는 소재는 이
              절 자체를 그리지 않는다 — 빈 껍데기를 남기지 않는다.
            ⚠ 상자로 가두지 않고 **글꼴 색으로만** 구별한다(사용자 요구). 본문 흐름 안에
              두되 전해 오는 이야기라는 것이 색으로 보이면 된다. 상자에 넣으면 광고나 알림처럼
              읽혀 본문에서 떨어져 나간다.
          */}
          {meaning && (
            <div className="dream-lore">
              <p className="dream-lore-tag">
                전해 오는 민간 해석 · 재미로만 참고하세요
              </p>
              <p className="dream-lore-summary">{meaning.summary}</p>
              <p>{meaning.origin}</p>
              {meaning.caveat && <p>{meaning.caveat}</p>}
            </div>
          )}

          <p>
            꿈해몽은 꿈에 나타난 소재를 두고 오랫동안 전해 내려온{" "}
            <strong>민간 해석</strong>입니다. {word} 꿈 역시 지역과 시대에 따라
            여러 갈래의 풀이가 전해집니다. 이 페이지는 그 가운데 널리 알려진
            풀이를 모아 정리한 것입니다.
          </p>
          <p>
            위 입력창에 꿈의 내용을 자유롭게 적으면, 꿈에서 핵심이 되는 단어를
            찾아 그 단어와 연관된 번호를 모아 조합을 만듭니다. {eunNeun(word)}{" "}
            자료에 등록된 단어이므로 그대로 찾아지고, 함께 등장한 다른 소재가
            있다면 그것도 반영됩니다.
          </p>
          <p>
            다른 꿈 소재는 <Link href="/dream">꿈해몽 번호 추천</Link>{" "}
            페이지에서 볼 수 있고, 통계를 참고한 번호 생성은{" "}
            <Link href="/lotto/recommend">번호 추천 시뮬레이터</Link>에
            있습니다.
          </p>
        </section>

        {/*
          ⚠ 하단은 `/dream` 과 **똑같은 것**을 쓴다(사용자 요구). 소재 페이지로 바로 들어온
            사용자도 번호가 어떻게 만들어지는지, 꿈과 결과 사이에 관계가 없다는 것을 같은
            밀도로 읽어야 한다. "꿈을 꾸었다고 당첨 가능성이 달라지지 않는다" 는 문단도
            여기 `GuideNote` 가 담당하므로 위에서 뺐다 — 같은 말을 두 번 하지 않는다.
        */}
        <DreamGuide />
      </article>

      <JsonLd
        data={articleLd({
          headline: `${word} 꿈 로또 번호 추천`,
          description: `${word} 꿈을 키워드로 참고용 로또 번호를 만드는 방법과 꿈해몽 해석에 대한 안내입니다.`,
          siteName: SITE_NAME,
          siteUrl: SITE_URL,
          // 정적 콘텐츠라 발행일이 따로 없다. 페이지 생성 시점을 쓰지 않는다 — 재검증 때마다
          // 날짜가 바뀌면 검색엔진에 잘못된 신선도 신호를 준다.
          datePublished: "2026-07-09",
        })}
      />
    </div>
  );
}
