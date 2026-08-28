"""video_* 세 잡이 공유하는 필터·판정·DB 연산.

잡을 셋으로 나누되 판정 로직은 하나로 둔다. 특히 `estimate_shorts` 는 수집 잡과
갱신 잡이 **같은 함수**를 써야 한다 — 추정 규칙을 고치면 25일 안에 기존 행이
전부 새 규칙으로 재판정되고, 두 곳에 복사돼 있으면 그 일관성이 깨진다.

필터 순서는 **싼 것 → 비싼 것 → 쿼터 쓰는 것**이다. 문자열 검사가 날짜 변환보다
싸고, 날짜 변환이 DB 조회보다 싸고, DB 조회가 API 호출보다 싸다.

계약: docs/wiki/10-contracts/worker-jobs.md
"""
from __future__ import annotations

import logging
import re
from datetime import date, datetime
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)

KST = ZoneInfo("Asia/Seoul")

# 쇼츠 판정의 기준일. 2024-10-15 이후 업로드부터 3분 이하가 쇼츠로 분류된다
# (그 전에는 60초였다). 이 날짜 이전 영상은 규칙이 달라 'unknown' 으로 둔다.
SHORTS_ERA_START = date(2024, 10, 15)

# 제목에서 회차를 뽑는다. `제1238회` · `1238회` · `제 330 회` 를 모두 잡는다.
# 3자리 이상만 받는 이유: 로또는 1000번대, 연금복권은 300번대이고, 2자리를
# 허용하면 '6/45' 나 '10회 연속' 같은 무관한 숫자가 걸린다.
_ROUND_RE = re.compile(r"제?\s*(\d{3,4})\s*회")


def is_allowed_channel(channel_key: str, block_keys: list[str]) -> bool:
    """차단 채널이 아닌가.

    검색 경로에만 의미가 있다. 화이트리스트 채널이 차단 목록에 동시에 있을 리
    없지만, 사람이 실수로 양쪽에 넣었다면 차단이 이긴다 — 안전한 쪽이다.
    """
    return channel_key not in block_keys


def is_on_topic(title: str, queries: list[str], exclude: list[str], must_match: bool) -> bool:
    """제목이 이 사이트의 주제에 맞는가.

    `news._is_on_topic` 과 같은 규칙이다. 제목만 본다 — 설명(description)은
    채널 안내·해시태그·링크로 채워져 있어 주제를 말해 주지 않는다.

    검색 질의가 '로또 추첨' 처럼 띄어쓰기를 포함하므로, 질의 전체가 아니라
    **질의를 공백으로 쪼갠 낱말 중 하나라도** 제목에 있으면 통과시킨다.
    '로또 추첨' 질의로 찾은 "로또 1238회 당첨번호" 를 버리지 않기 위해서다.
    """
    if must_match:
        tokens = {t for q in queries for t in q.split() if t}
        if not any(t in title for t in tokens):
            return False
    return not any(k in title for k in exclude)


def has_forbidden_expression(text: str, forbidden: list[str]) -> bool:
    """금지 표현이 들어 있는가. 제목과 채널명을 합쳐 넘긴다.

    주제 필터(`is_on_topic`)의 제외어와 **분리해 두는 이유**는 로그에서
    '정책 때문에 몇 건이 걸렸는지' 를 따로 세야 하기 때문이다. 그 수는
    애드센스 대비 근거이고, 화이트리스트 채널이 변질됐는지 알아채는 신호다.

    공백을 지우고 비교한다 — "예상 번호" 와 "예상번호" 를 같게 보기 위해서다.
    유튜브 제목은 띄어쓰기가 제멋대로다.
    """
    if not forbidden:
        return False
    squashed = text.replace(" ", "")
    return any(k.replace(" ", "") in squashed for k in forbidden)


def is_fresh(published_dttm: datetime | None, today: date, max_age_days: int) -> bool:
    """게시일(KST)이 실행일로부터 max_age_days 일 이내인가.

    `news._is_fresh` 와 같은 규칙이다. 항상 KST 로 변환한 뒤 날짜를 뗀다 —
    유튜브는 UTC 로 주므로 변환하지 않으면 한국 시각 오전 9시 이전 게시분이
    전날로 밀린다. 미래 날짜(음수 나이)도 버린다.
    """
    if published_dttm is None:
        return False
    age = (today - published_dttm.astimezone(KST).date()).days
    return 0 <= age <= max_age_days


def estimate_shorts(
    duration_sec: int | None, published_dttm: datetime | None, max_sec: int
) -> tuple[str, str]:
    """쇼츠 여부를 **추정**한다. (코드, 근거) 를 돌려준다.

    ★ 확정이 아니다. 공식 정의는 "세로/정사각 화면비 + 3분 이하 + 2024-10-15
      이후 업로드" 인데 **Data API 는 원본 화면비를 주지 않는다.** 그래서
      3분 이하 가로 영상이 'likely' 로 오분류된다 — 로또 도메인에서 "90초짜리
      당첨번호 요약 가로 영상" 은 드물지 않다.

    근거 문자열을 함께 남기는 이유: 판정 규칙을 나중에 고쳤을 때 기존 행이
    어떤 규칙으로 매겨졌는지 알 수 있어야 한다. 규칙만 바꾸고 데이터는 그대로
    두면 같은 컬럼에 서로 다른 기준의 값이 섞인다.
    """
    if duration_sec is None:
        return "unknown", "duration 파싱 실패"
    if duration_sec > max_sec:
        return "unlikely", f"duration>{max_sec}s"
    if published_dttm is None:
        return "unknown", f"duration<={max_sec}s,published 불명"
    if published_dttm.astimezone(KST).date() >= SHORTS_ERA_START:
        return "likely", f"duration<={max_sec}s,published>={SHORTS_ERA_START}"
    # 2024-10-15 이전에는 쇼츠 기준이 60초였다. 3분 이하라는 사실만으로는
    # 쇼츠라고 말할 수 없어 모른다고 둔다.
    return "unknown", f"duration<={max_sec}s,published<{SHORTS_ERA_START}"


def parse_round(title: str) -> tuple[int | None, str]:
    """제목에서 회차와 게임 종류를 뽑는다. (round_no, game_cd).

    실측 제목(2026-08-27):
        로또6/45 제1238회 당첨번호 2026년 08월 22일   → (1238, 'lotto')
        MBC 생방송 행복드림 로또 6/45 _ 1238회        → (1238, 'lotto')
        연금복권 제330회 당첨번호 2026년 08월 27일     → (330,  'pension')

    ★ 게임 판정은 **낱말로만** 한다. 회차 번호 범위(로또 1000번대, 연금 300번대)로
      가르고 싶어지지만 그러면 규칙이 시간에 종속된다 — 연금복권이 1000회를
      넘는 날 조용히 틀리기 시작하고, 아무도 그날을 예상하지 못한다.

    둘 다 없거나 둘 다 있으면 'unknown' 이다. 그때는 회차를 담지 않는다 —
    **틀린 회차를 붙이는 것보다 안 붙이는 편이 낫다.** 연금복권 330회 영상에
    로또 330회 당첨번호가 붙으면 에러 없이 조용히 틀린 번호가 화면에 뜬다.
    """
    has_pension = "연금" in title
    has_lotto = "로또" in title

    if has_pension and not has_lotto:
        game_cd = "pension"
    elif has_lotto and not has_pension:
        game_cd = "lotto"
    else:
        return None, "unknown"

    m = _ROUND_RE.search(title)
    if not m:
        return None, game_cd
    return int(m.group(1)), game_cd


def is_displayable(item: dict) -> bool:
    """화면에 띄울 수 있는 영상인가.

    셋 다 만족해야 한다.
      * privacyStatus == 'public'   — 비공개/일부공개는 남에게 안 보인다
      * embeddable == 'yes'         — 아니면 화면에 깨진 플레이어가 뜬다
      * madeForKids == 'no'         — 정책 III.E.4.10 의 조회 의무

    'unknown' 은 통과시키지 않는다. madeForKids 를 모르는 채로 임베드하면
    조회 의무를 형식적으로만 지킨 것이 된다.

    담아 두고 표시만 막는 방법도 있지만 **버린다.** 담으면 30일 갱신 쿼터를
    영원히 치르고, 로또 콘텐츠에 아동 대상 영상이 있을 리 없어 손실이 0에 가깝다.
    """
    return (
        item.get("privacy_status_cd") == "public"
        and item.get("embeddable_cd") == "yes"
        and item.get("made_for_kids_cd") == "no"
    )


def extract_keywords(title: str, queries: list[str]) -> list[str]:
    """제목에 실제로 등장한 질의 낱말. 형태소 분석을 하지 않는다.

    워커에 ML 의존을 들이지 않는다는 것이 이 컴포넌트를 분리한 이유다.
    """
    tokens = {t for q in queries for t in q.split() if t}
    return sorted(t for t in tokens if t in title)


# ── DB 연산 ──────────────────────────────────────────────────────────────

async def filter_known_keys(conn, provider_nm: str, keys: list[str]) -> set[str]:
    """이미 DB 에 있는 영상 키를 돌려준다.

    ★ 이 단계가 없으면 쿼터가 샌다. playlistItems.list 는 매 실행 최신 50건을
      통째로 주므로, 걸러내지 않으면 6시간마다 같은 50건을 videos.list 로 다시
      부른다. 게다가 그것은 video_refresh 잡의 일과 겹쳐 갱신 주기를 제어할 수
      없게 만든다 — refreshed_dttm 이 수집 잡에 의해 계속 덮이기 때문이다.
    """
    if not keys:
        return set()
    cur = await conn.execute(
        """
        SELECT provider_video_key FROM lotto_video
         WHERE provider_nm = %s AND provider_video_key = ANY(%s)
        """,
        (provider_nm, keys),
    )
    rows = await cur.fetchall()
    return {r["provider_video_key"] for r in rows}


async def find_same_title_keys(
    conn, provider_nm: str, items: list[dict], window_days: int = 7
) -> set[str]:
    """같은 채널이 최근에 올린 **같은 제목**의 영상이 이미 있는 키를 찾는다.

    동행복권은 같은 콘텐츠를 쇼츠판과 롱폼판으로 나눠 올린다(실측: 같은 제목이
    08-18 watch / 08-19 shorts 로 각각 존재). 영상 ID 가 다르므로 UNIQUE 로는
    잡히지 않고, 목록에 같은 것이 두 번 뜬다.

    먼저 들어온 쪽을 남긴다 — 롱폼이 먼저 올라오는 것이 관찰된 패턴이라
    결과적으로 롱폼이 우선된다. '롱폼을 골라 남긴다' 는 규칙을 명시적으로 두지
    않는 이유는, 그러려면 이미 저장된 행을 지우고 새 행을 넣어야 하는데 그
    복잡도가 얻는 것보다 크기 때문이다.
    """
    if not items:
        return set()
    titles = [it["title_nm"] for it in items]
    channels = [it["provider_channel_key"] for it in items]
    cur = await conn.execute(
        """
        SELECT provider_channel_key, title_nm FROM lotto_video
         WHERE provider_nm = %s
           AND provider_channel_key = ANY(%s)
           AND title_nm = ANY(%s)
           AND published_dttm >= now() - make_interval(days => %s)
        """,
        (provider_nm, channels, titles, window_days),
    )
    rows = await cur.fetchall()
    existing = {(r["provider_channel_key"], r["title_nm"]) for r in rows}
    return {
        it["provider_video_key"]
        for it in items
        if (it["provider_channel_key"], it["title_nm"]) in existing
    }


async def upsert_video(conn, item: dict, discovery_cd: str, promote: bool) -> bool:
    """영상 한 건. 새로 들어갔으면 True.

    ★ `RETURNING (xmax = 0)` 으로 삽입인지 갱신인지 가린다. DO UPDATE 를 쓰면
      cur.rowcount 가 승격까지 1 로 세어 collected_cnt 가 부풀고 이력이
      거짓말을 한다 — 뉴스 잡이 rowcount 로 정직하게 세려고 애쓴 그 지점이다.

    promote=True (채널 잡): 검색으로 먼저 발견된 행을 'channel' 로 승격한다.
    화이트리스트 유래가 검색 유래보다 신뢰도가 높아 표시 우선순위가 다르다.

    promote=False (검색 잡): 기존 행을 건드리지 않는다. 검색은 약한 신호라
    이미 있는 판정을 덮을 이유가 없다.
    """
    row = dict(item)
    row["discovery_cd"] = discovery_cd

    conflict = (
        """
        ON CONFLICT (provider_nm, provider_video_key) DO UPDATE
           SET discovery_cd = 'channel',
               channel_nm   = EXCLUDED.channel_nm
         WHERE lotto_video.discovery_cd = 'search'
        """
        if promote
        else "ON CONFLICT (provider_nm, provider_video_key) DO NOTHING"
    )

    cur = await conn.execute(
        f"""
        INSERT INTO lotto_video (
            provider_nm, provider_video_key, provider_channel_key, channel_nm,
            title_nm, summary_desc, thumbnail_url, published_dttm,
            duration_sec, view_cnt, shorts_estimate_cd, shorts_basis_desc,
            made_for_kids_cd, embeddable_cd, privacy_status_cd,
            discovery_cd, round_no, game_cd, keyword_list
        ) VALUES (
            %(provider_nm)s, %(provider_video_key)s, %(provider_channel_key)s, %(channel_nm)s,
            %(title_nm)s, %(summary_desc)s, %(thumbnail_url)s, %(published_dttm)s,
            %(duration_sec)s, %(view_cnt)s, %(shorts_estimate_cd)s, %(shorts_basis_desc)s,
            %(made_for_kids_cd)s, %(embeddable_cd)s, %(privacy_status_cd)s,
            %(discovery_cd)s, %(round_no)s, %(game_cd)s, %(keyword_list)s
        )
        {conflict}
        RETURNING (xmax = 0) AS inserted
        """,
        row,
    )
    result = await cur.fetchone()
    # 충돌했고 WHERE 절도 안 맞으면 아무 행도 반환되지 않는다 = 신규가 아니다.
    return bool(result and result["inserted"])


def enrich(item: dict, *, queries: list[str], shorts_max_sec: int) -> dict:
    """videos.list 결과에 분류 컬럼을 채운다. **필터가 아니라 분류다.**

    쇼츠 추정과 회차 파싱은 실패해도 영상을 버리지 않는다 — 못 붙이면
    'unknown'/NULL 로 두고 화면에서 관련 콘텐츠만 생략한다.
    """
    shorts_cd, shorts_basis = estimate_shorts(
        item.get("duration_sec"), item.get("published_dttm"), shorts_max_sec
    )
    round_no, game_cd = parse_round(item["title_nm"])
    item["shorts_estimate_cd"] = shorts_cd
    item["shorts_basis_desc"] = shorts_basis
    item["round_no"] = round_no
    item["game_cd"] = game_cd
    item["keyword_list"] = extract_keywords(item["title_nm"], queries)
    return item


# ── 공통 파이프라인 ──────────────────────────────────────────────────────

async def process_stubs(
    conn,
    client,
    stubs: list[dict],
    *,
    discovery_cd: str,
    promote: bool,
    today: date,
    settings,
    use_llm: bool,
) -> dict[str, int]:
    """stub 목록을 필터링해 저장한다. video_channel 과 video_search 가 공유한다.

    stub 은 search/playlistItems 가 준 얕은 dict 다 — 영상 키·채널·제목·게시일만
    있고 재생시간·조회수는 없다. 제목이 있다는 것이 중요하다. **제목 기반 필터를
    videos.list 앞에서 돌릴 수 있어** 2단계 호출량이 줄고, 무엇보다 금지 표현
    영상에 쿼터를 쓰지 않는다.

    필터 순서는 싼 것부터다. 문자열 → 날짜 → DB → API.

    돌려주는 dict 는 각 단계의 통과 건수다. 로그와 드라이런에 쓴다.
    """
    from ..sources import llm_judge, youtube_data

    stat = {"fetched": len(stubs)}

    # 실행 내 중복 제거. 질의 4개가 같은 영상을 물어오면 한 번만 처리하고
    # keyword_list 는 뒤에서 제목 기준으로 다시 계산하므로 손실이 없다.
    merged: dict[str, dict] = {}
    for s in stubs:
        merged.setdefault(s["provider_video_key"], s)
    stat["deduped"] = len(merged)

    # 1) 차단 채널
    block_keys = settings.youtube_block_channel_keys
    merged = {
        k: v
        for k, v in merged.items()
        if is_allowed_channel(v.get("provider_channel_key", ""), block_keys)
    }
    stat["channel_ok"] = len(merged)

    # 2) 주제 적합성
    queries = settings.youtube_search_queries
    exclude = settings.youtube_exclude_keywords
    merged = {
        k: v
        for k, v in merged.items()
        if is_on_topic(v["title_nm"], queries, exclude, settings.YOUTUBE_TITLE_MUST_MATCH)
    }
    stat["on_topic"] = len(merged)

    # 3) 금지 표현 — 규칙. 제목과 채널명을 함께 본다.
    #    "로또 예상번호 연구소" 같은 채널이 제목만 무해하게 짓는 경우를 막는다.
    forbidden = settings.youtube_forbidden_keywords
    merged = {
        k: v
        for k, v in merged.items()
        if not has_forbidden_expression(
            f"{v['title_nm']} {v.get('channel_nm') or ''}", forbidden
        )
    }
    stat["rule_clean"] = len(merged)

    # 4) 금지 표현 — LLM 보조. 규칙을 통과한 것만 묻는다.
    #    화이트리스트 채널(promote=True)은 건너뛴다 — 공식 채널의 제목은
    #    '제1238회 당첨번호' 형식이라 판정할 것이 없고, 쿼터만 쓴다.
    if use_llm and merged:
        blocked = await llm_judge.judge_blocked(
            client,
            items=list(merged.values()),
            api_key=settings.API_KEY,
            model=settings.MODEL,
            batch_size=settings.LLM_JUDGE_BATCH_SIZE,
            timeout=settings.LLM_JUDGE_TIMEOUT_SEC,
            max_retry=settings.LLM_JUDGE_MAX_RETRY,
        )
        if blocked:
            merged = {k: v for k, v in merged.items() if k not in blocked}
        logger.info("LLM 보조 판정 — %d건 차단", len(blocked))
    stat["llm_clean"] = len(merged)

    # 5) 신선도
    merged = {
        k: v
        for k, v in merged.items()
        if is_fresh(v.get("published_dttm"), today, settings.YOUTUBE_MAX_AGE_DAYS)
    }
    stat["fresh"] = len(merged)

    # 6) 이미 있는 것 제거 — videos.list 쿼터를 아끼는 단계다
    known = await filter_known_keys(conn, "youtube", list(merged))
    merged = {k: v for k, v in merged.items() if k not in known}
    stat["new_candidate"] = len(merged)

    if not merged:
        stat["stored"] = 0
        return stat

    # 7) videos.list — 여기서 처음 쿼터를 쓴다 (50개당 1 unit)
    details = await youtube_data.list_video_details(
        client,
        video_keys=list(merged),
        api_key=settings.YOUTUBE_API_KEY,
        timeout=settings.CRAWL_HTTP_TIMEOUT_SEC,
        max_retry=settings.YOUTUBE_MAX_RETRY,
        backoff_base_sec=settings.YOUTUBE_BACKOFF_BASE_SEC,
        summary_max_len=settings.YOUTUBE_SUMMARY_MAX_LEN,
    )
    stat["detailed"] = len(details)

    # 8) 표시 가능성
    details = [d for d in details if is_displayable(d)]
    stat["displayable"] = len(details)

    # 9) 분류 — 쇼츠 추정과 회차 파싱. 버리지 않는다.
    details = [
        enrich(d, queries=queries, shorts_max_sec=settings.YOUTUBE_SHORTS_MAX_SEC)
        for d in details
    ]

    # 10) 같은 콘텐츠의 쇼츠판/롱폼판 중복
    if settings.YOUTUBE_DEDUPE_SAME_TITLE and details:
        dup = await find_same_title_keys(conn, "youtube", details)
        if dup:
            details = [d for d in details if d["provider_video_key"] not in dup]
            logger.info("같은 제목의 기존 영상이 있어 %d건 건너뜀", len(dup))
    stat["to_store"] = len(details)

    # 11) 저장
    if settings.YOUTUBE_DRY_RUN:
        logger.warning("YOUTUBE_DRY_RUN=true — DB 에 쓰지 않는다. %d건이 저장될 예정이었다", len(details))
        stat["stored"] = 0
        return stat

    stored = 0
    for item in details:
        if await upsert_video(conn, item, discovery_cd, promote):
            stored += 1
    stat["stored"] = stored
    return stat


def log_stat(job_nm: str, stat: dict[str, int]) -> None:
    """단계별 통과 건수를 한 줄로 남긴다. news 잡의 요약 로그와 같은 형식이다.

    각 단계의 숫자를 남기는 이유는 필터가 과잉 차단하는지 눈으로 보기 위해서다.
    특히 rule_clean 과 llm_clean 의 차이가 LLM 이 실제로 값을 하는지 말해 준다.
    """
    logger.info(
        "%s 완료 — 조회 %d → 중복제거 %d → 채널 %d → 주제 %d → 규칙 %d → LLM %d "
        "→ 신선 %d → 신규후보 %d → 상세 %d → 표시가능 %d → 저장대상 %d → 저장 %d건",
        job_nm,
        stat.get("fetched", 0), stat.get("deduped", 0), stat.get("channel_ok", 0),
        stat.get("on_topic", 0), stat.get("rule_clean", 0), stat.get("llm_clean", 0),
        stat.get("fresh", 0), stat.get("new_candidate", 0), stat.get("detailed", 0),
        stat.get("displayable", 0), stat.get("to_store", 0), stat.get("stored", 0),
    )
