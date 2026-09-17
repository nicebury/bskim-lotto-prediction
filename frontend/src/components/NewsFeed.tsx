import type { NewsItem } from '@/lib/api-types'
import { ExternalIcon } from './icons'

/**
 * 뉴스 페이지(`/news`)의 기사 피드 — 2026-09-17 재설계.
 *
 * ── 왜 새로 만들었나 ───────────────────────────────────────────────
 * 사용자 지적: "너무 투박하고 옛날스럽다". 종전 `NewsList` 는 흰 상자 하나에 아이콘 · 제목 ·
 * `naver 2026.09.17` · 요약 · 키워드 칩을 **같은 무게로** 스무 줄 쌓았다. 무엇이 먼저 읽혀야
 * 하는지 화면이 말하지 않았고, 출처가 전부 `naver` 로 찍혀 언론사가 보이지 않았다.
 *
 * 지금은
 *   ① 첫 쪽 맨 앞 기사를 **크게**(주요 기사) 세우고,
 *   ② 나머지를 **날짜별로 묶어**("오늘 · 9월 17일") 카드 격자로 놓고,
 *   ③ 출처 자리에 **원문 주소의 도메인**(언론사 사이트)을 적는다.
 *
 * ⚠ `NewsList` 는 그대로 둔다. 홈·로또 대시보드의 좁은 카드가 쓴다(축약 모드).
 *
 * ── ⚠ 지키는 것 ────────────────────────────────────────────────────
 * - 외부 링크는 `rel="nofollow noopener noreferrer"` + `target="_blank"`(계약).
 * - `description` 은 요약이다. 원문을 복제하지 않는다. 줄 수만 CSS 로 자른다.
 * - 이미지를 만들어 넣지 않는다. 계약의 기사 객체에 이미지가 없다 — 언론사 머리글자 배지로 대신한다.
 * - 날짜 묶음 · 시각 · 도메인은 **표시 형식**일 뿐 집계가 아니다(비즈니스 계산 금지와 무관).
 */
export function NewsFeed({
  items,
  featured,
  today,
}: {
  items: NewsItem[]
  /** 맨 앞 기사를 크게 세울지. 첫 쪽에서만 켠다 — 2쪽의 첫 기사는 '주요' 가 아니다. */
  featured: boolean
  /** 오늘 날짜(KST, `YYYY-MM-DD`). "오늘 · 어제" 라벨의 기준이다. 서버가 요청 시각으로 넘긴다. */
  today: string
}) {
  const lead = featured ? items[0] : null
  const rest = featured ? items.slice(1) : items
  const groups = groupByDate(rest)

  return (
    <div className="nf">
      {lead && <LeadStory item={lead} today={today} />}

      {groups.map((group) => (
        <section key={group.date} className="nf-day" aria-label={dayLabel(group.date, today)}>
          <h3 className="nf-day-head">
            <span>{dayLabel(group.date, today)}</span>
            <small>{group.items.length}건</small>
          </h3>
          <ul className="nf-grid">
            {group.items.map((item) => (
              <li key={item.link}>
                <StoryCard item={item} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

/** 주요 기사 — 한 건을 크게. */
function LeadStory({ item, today }: { item: NewsItem; today: string }) {
  const outlet = outletOf(item)
  return (
    <article className="nf-lead">
      <p className="nf-lead-eyebrow">
        <span className="nf-dot" aria-hidden="true" />
        가장 최근 소식 · {dayLabel(item.pub_date.slice(0, 10), today)} {timeOf(item.pub_date)}
      </p>
      <h3 className="nf-lead-title">
        <a href={item.link} target="_blank" rel="nofollow noopener noreferrer">
          {item.title}
        </a>
      </h3>
      {item.description && <p className="nf-lead-summary">{item.description}</p>}
      <div className="nf-lead-foot">
        <Outlet name={outlet} />
        {item.keywords?.length > 0 && (
          <span className="nf-tags">
            {item.keywords.slice(0, 4).map((keyword) => (
              <span key={keyword}>#{keyword}</span>
            ))}
          </span>
        )}
        <span className="nf-open" aria-hidden="true">
          원문 보기 <ExternalIcon width={14} height={14} />
        </span>
      </div>
    </article>
  )
}

/**
 * 기사 카드.
 * ⚠ 카드 전체가 눌리지만 **링크는 제목 하나**다(늘린 링크, `::after`). 요약·키워드까지 링크
 *   안에 넣으면 낭독기가 링크 이름으로 문단을 통째로 읽는다.
 */
function StoryCard({ item }: { item: NewsItem }) {
  const outlet = outletOf(item)
  return (
    <article className="nf-card">
      <div className="nf-card-top">
        <Outlet name={outlet} />
        <time className="nf-time" dateTime={item.pub_date}>
          {timeOf(item.pub_date)}
        </time>
      </div>
      <h4 className="nf-card-title">
        <a href={item.link} target="_blank" rel="nofollow noopener noreferrer">
          {item.title}
        </a>
      </h4>
      {item.description && <p className="nf-card-summary">{item.description}</p>}
      <div className="nf-card-foot">
        {item.keywords?.length > 0 ? (
          <span className="nf-tags">
            {item.keywords.slice(0, 3).map((keyword) => (
              <span key={keyword}>#{keyword}</span>
            ))}
          </span>
        ) : (
          <span />
        )}
        <ExternalIcon className="nf-card-ext" width={14} height={14} aria-hidden="true" />
      </div>
    </article>
  )
}

/**
 * 언론사 표시 — 머리글자 배지 + 도메인.
 * ⚠ 배지 색은 도메인 해시로 고른다. 같은 언론사는 어느 쪽에서나 같은 색이다. 색은 구분일 뿐
 *   뜻이 없고, 이름이 옆에 글자로 있으므로 색에 기대지 않는다.
 */
function Outlet({ name }: { name: string }) {
  return (
    <span className="nf-outlet">
      <span className="nf-outlet-badge" data-tone={hash(name) % 6} aria-hidden="true">
        {name.replace(/^(m\.|news\.|www\.)/, '').charAt(0).toUpperCase()}
      </span>
      <span className="nf-outlet-name">{name}</span>
    </span>
  )
}

/**
 * 원문 주소의 도메인. 계약의 `source` 는 수집 경로(`naver`)라 언론사를 알려 주지 않는다.
 * ⚠ `orig_link` 가 비었거나 이상하면 `source` 로 되돌린다 — 빈칸보다 낫다.
 */
function outletOf(item: NewsItem): string {
  try {
    const host = new URL(item.orig_link || item.link).hostname
    return host.replace(/^www\./, '')
  } catch {
    return item.source
  }
}

/**
 * ISO(KST) → `15:20`.
 * ⚠ 문자열에서 잘라 쓴다. `Date` 로 바꿔 로케일 함수를 쓰면 서버 시간대에 따라 시각이 바뀐다
 *   (응답이 이미 +09:00 으로 온다 — 계약).
 */
function timeOf(iso: string): string {
  const t = iso.slice(11, 16)
  return /^\d{2}:\d{2}$/.test(t) ? t : ''
}

/** 날짜 묶음. 목록이 이미 최신순(계약)이라 순서를 다시 매기지 않는다. */
function groupByDate(items: NewsItem[]): { date: string; items: NewsItem[] }[] {
  const groups: { date: string; items: NewsItem[] }[] = []
  for (const item of items) {
    const date = item.pub_date.slice(0, 10)
    const last = groups[groups.length - 1]
    if (last && last.date === date) last.items.push(item)
    else groups.push({ date, items: [item] })
  }
  return groups
}

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토']

/** `2026-09-17` → `오늘 · 9월 17일 (목)`. 요일은 날짜 자체로 계산한다(시간대와 무관). */
function dayLabel(date: string, today: string): string {
  const [y, m, d] = date.split('-').map(Number)
  if (!y || !m || !d) return date
  const weekday = WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
  const base = `${m}월 ${d}일 (${weekday})`
  const diff = Math.round(
    (Date.UTC(y, m - 1, d) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
  )
  if (diff === 0) return `오늘 · ${base}`
  if (diff === -1) return `어제 · ${base}`
  return base
}

function hash(key: string): number {
  let h = 0
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return h
}
