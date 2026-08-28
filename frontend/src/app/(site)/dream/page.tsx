import Link from "next/link";
import type { Metadata } from "next";

import { Breadcrumb } from "@/components/Breadcrumb";
import { Card } from "@/components/Card";
import { Disclaimer } from "@/components/Disclaimer";
import { DreamGuide } from "@/components/DreamGuide";
import { DreamStudio } from "@/components/DreamStudio";
import { getDreamKeywords } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { DISCLAIMER, DREAM_INDEXED_KEYWORDS } from "@/lib/site";

export const revalidate = 604800;

/**
 * 목록에 미리 보여줄 소재 수. 나머지는 입력창으로 찾는다.
 *
 * ⚠ `DREAM_INDEXED_KEYWORDS` 의 개수와 **같아야 한다.** 미리보기는 손으로 쓴 해몽이 있는
 *   소재만 보여주려는 것이다(사용자 요구: "30개만 보여주고 그 30개는 해몽을 만들어놔").
 *   이 수가 더 크면 가나다순 뒤쪽의 희귀 표제어가 딸려 들어와, 눌러도 풀이가 없는 페이지가
 *   나온다 — 종전에 60이라 실제로 그랬다.
 */
const KEYWORD_PREVIEW = DREAM_INDEXED_KEYWORDS.length;

export const metadata: Metadata = {
  title: "꿈해몽 로또 번호 추천",
  description:
    "꿈꾼 내용을 적으면 AI가 꿈 속 핵심 상징을 찾아 연관된 참고용 로또 번호를 추천합니다. 당첨을 보장하지 않습니다.",
  alternates: { canonical: "/dream" },
  openGraph: {
    type: "website",
    url: "/dream",
    title: "꿈해몽 로또 번호 추천",
    description:
      "꿈에서 찾은 상징을 바탕으로 참고용 로또 번호를 추천해 드립니다.",
  },
};

export default async function DreamPage() {
  const keywords = await getDreamKeywords();

  /*
    선별한 키워드(검색에 노출하는 것)를 목록 맨 앞에 세운다. 사전 순서를 그대로 쓰면 미리보기
    60개가 희귀 표제어로 채워져, 정작 사람들이 찾는 '돼지꿈'·'똥꿈' 이 화면에 없었다.
    크롤러가 먼저 만나는 링크가 색인 대상이 된다는 이점도 있다.
  */
  const preferred = new Set<string>(DREAM_INDEXED_KEYWORDS);
  const sorted = [
    ...keywords.filter((keyword) => preferred.has(keyword.slug)),
    ...keywords.filter((keyword) => !preferred.has(keyword.slug)),
  ];

  return (
    <div className="container">
      <Breadcrumb
        items={[
          { name: "홈", href: "/" },
          { name: "꿈해몽 번호 추천", href: "/dream" },
        ]}
      />

      <section className="section">
        <h1>꿈해몽 로또 번호 추천</h1>
        <p className="muted" style={{ marginTop: "var(--space-2)" }}>
          꿈꾼 내용을 적어주시면 꿈을 해석하여 번호를 추천해 드립니다.
        </p>
      </section>

      <section className="section" aria-labelledby="dream-studio-title">
        <h2 id="dream-studio-title" className="sr-only">
          꿈 입력
        </h2>
        <DreamStudio />
        <Disclaimer spaced>{DISCLAIMER.dream}</Disclaimer>
      </section>

      {keywords.length > 0 && (
        <section className="section" aria-labelledby="keyword-title">
          <div className="section-head">
            <h2 id="keyword-title">자주 꾸는 꿈으로 보기</h2>
            <span className="section-note">
              해몽 {KEYWORD_PREVIEW}개
            </span>
          </div>
          <Card>
            {/*
              ⚠ **손으로 쓴 해몽이 있는 소재만** 내보인다(→ lib/dream-meanings.ts).
                사전 표제어는 4,800개가 넘지만 전부 뿌리면 페이지가 링크 목록이 되고,
                무엇보다 대부분은 눌러도 풀이가 없는 페이지다 — 종전에 60개를 뿌렸더니
                가나다순 뒤쪽의 희귀 표제어가 딸려 들어와 실제로 그랬다(사용자 지적).
                나머지는 위 입력창으로 찾게 한다. 어차피 꿈을 문장으로 적는 편이 빠르다.
            */}
            <ul className="keyword-chips">
              {sorted.slice(0, KEYWORD_PREVIEW).map((keyword) => (
                <li key={keyword.slug}>
                  <Link
                    className="chip"
                    href={`/dream/${encodeURIComponent(keyword.slug)}`}
                  >
                    {keyword.word}
                  </Link>
                </li>
              ))}
            </ul>
            {keywords.length > KEYWORD_PREVIEW && (
              <p
                className="muted"
                style={{
                  fontSize: "var(--fs-xs)",
                  marginTop: "var(--space-4)",
                }}
              >
                여기 없는 소재도 번호는 만들 수 있습니다. 자료에 등록된 단어가{" "}
                {formatNumber(keywords.length)}개 있으니, 찾는 꿈이 없다면 위 입력창에
                꿈 내용을 그대로 적어 보세요.
              </p>
            )}
          </Card>
        </section>
      )}

      <DreamGuide />
    </div>
  );
}
