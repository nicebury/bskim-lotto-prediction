"""YouTube Data API v3 클라이언트.

`naver_news` 와 같은 패턴이다 — httpx.AsyncClient 를 소유하지 않고 호출자가
주입하며, 설정을 직접 읽지 않고(`settings` import 가 없다) 잡이 값을 넘긴다.
`_to_items()` 가 lotto_video 컬럼 이름 그대로의 dict 를 돌려준다.

네이버와 다른 점 셋. 전부 잡 설계를 바꾼 것들이다.

  1. **쿼터 버킷이 둘이다.** search.list 는 2026-06-01 부터 자체 버킷이고 하루
     100회가 상한이다. videos/channels/playlistItems 는 각 1 unit 으로 공통
     10,000 유닛을 쓴다. 네이버(25,000회 단일)와 자릿수가 다르다.

  2. **2단계 조회가 필수다.** search.list 응답에는 재생시간·조회수가 없다.
     videos.list 를 다시 불러야 하고, 다행히 id 50개를 묶어 1 unit 이다.

  3. **인증을 헤더로 보낸다.** Google 은 ?key= 쿼리스트링을 표준으로 안내하지만
     httpx 예외 메시지에는 request URL 이 실린다. 그것을 그대로 감싸 올리면
     collect_job_log.error_desc 에 API 키가 평문으로 저장된다 — alembic.ini 가
     app_writer 비밀번호를 뱉었던 사고(2026-07-09)와 같은 형태다.
     그래서 X-goog-api-key 헤더를 쓰고, 예외에도 원본 문자열을 싣지 않는다.

계약: docs/wiki/90-external/youtube-data-api.md
"""
from __future__ import annotations

import asyncio
import logging
import re
from datetime import datetime

import httpx

logger = logging.getLogger(__name__)

API_BASE = "https://www.googleapis.com/youtube/v3"

# videos.list 의 id 파라미터 상한. channels.list 도 같다.
MAX_IDS_PER_CALL = 50

# ISO 8601 duration. 유튜브는 PT1M30S · PT2H · P1DT2H3M4S · PT0S 형태를 준다.
_DURATION_RE = re.compile(
    r"^P(?:(?P<days>\d+)D)?"
    r"(?:T(?:(?P<hours>\d+)H)?(?:(?P<minutes>\d+)M)?(?:(?P<seconds>\d+)S)?)?$"
)


def parse_iso8601_duration(raw: str | None) -> int | None:
    """ISO 8601 duration 을 초로 바꾼다. 파싱 실패는 None 이다.

    실패해도 영상을 버리지 않는다 — duration_sec 는 NULL 허용이고, 대신
    쇼츠 추정이 'unknown' 이 된다. 재생시간 하나 때문에 수집을 실패시키지 않는다.

    주(W)와 월(M-in-date)은 다루지 않는다. 유튜브 영상 길이에 나올 수 없고,
    P1M 을 지원하려 들면 '1개월이 며칠인가' 라는 답 없는 문제가 따라온다.
    """
    if not raw:
        return None
    m = _DURATION_RE.match(raw.strip())
    if not m:
        logger.warning("duration 파싱 실패, NULL 로 둔다: %r", raw)
        return None
    parts = {k: int(v) for k, v in m.groupdict(default="0").items()}
    return (
        parts["days"] * 86400
        + parts["hours"] * 3600
        + parts["minutes"] * 60
        + parts["seconds"]
    )


def _parse_published(raw: str | None) -> datetime | None:
    """publishedAt 은 RFC 3339 (`2026-08-22T11:30:00Z`) 다.

    Python 3.11 부터 fromisoformat 이 'Z' 를 받는다. 워커는 3.13 이라 안전하다.
    """
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        logger.warning("publishedAt 파싱 실패: %r", raw)
        return None


def _pick_thumbnail(thumbnails: dict) -> str | None:
    """가장 큰 썸네일 URL 을 고른다.

    URL 만 저장한다 — 이미지 파일을 내려받아 자체 서버에 두지 않는다.
    화질 키는 응답마다 있고 없고가 달라 순서대로 훑는다.
    """
    for key in ("maxres", "standard", "high", "medium", "default"):
        item = thumbnails.get(key)
        if item and item.get("url"):
            return item["url"]
    return None


def _classify_403(payload: dict) -> str:
    """403 의 이유를 가른다.

    같은 403 이지만 대응이 정반대다.
      * quotaExceeded          — 그날 쿼터 소진. 백오프가 무의미하고 내일까지 회복 불가
      * keyInvalid / accessNotConfigured — 키 문제. 영구적이고 사람이 고쳐야 한다

    둘 다 즉시 포기하지만 **메시지가 달라야 사람이 무엇을 할지 안다.**
    """
    try:
        reasons = [e.get("reason", "") for e in payload["error"]["errors"]]
    except (KeyError, TypeError):
        return "unknown"
    for r in reasons:
        if r in ("quotaExceeded", "dailyLimitExceeded", "rateLimitExceeded"):
            return "quota"
        if r in ("keyInvalid", "accessNotConfigured", "forbidden", "ipRefererBlocked"):
            return "key"
    return "unknown"


async def _get(
    client: httpx.AsyncClient,
    path: str,
    params: dict,
    *,
    api_key: str,
    timeout: float,
    max_retry: int,
    backoff_base_sec: float,
) -> dict:
    """GET 한 번. 재시도 정책은 naver_news 와 같은 골격이다.

      * 429 / 5xx  → 지수 백오프 후 재시도
      * 401 / 403  → 즉시 포기 (이유를 가려 메시지를 다르게 낸다)
      * 그 외 4xx  → 즉시 포기. 요청이 잘못된 것이라 재시도해도 같다

    ★ 예외 메시지에 원본 예외 문자열을 넣지 않는다. httpx 의 예외는 request URL 을
      담고 있고, 그것이 collect_job_log 에 저장된다. 키를 헤더로 보내므로 URL 에
      키는 없지만, 습관을 그렇게 들이면 다음 사람이 ?key= 로 바꿨을 때 조용히
      샌다. 타입 이름과 상태코드만 올린다.
    """
    headers = {"X-goog-api-key": api_key, "Accept": "application/json"}
    url = f"{API_BASE}/{path}"

    last_kind = "unknown"
    for attempt in range(1, max_retry + 1):
        try:
            resp = await client.get(url, params=params, headers=headers, timeout=timeout)

            if resp.status_code in (401, 403):
                kind = _classify_403(_safe_json(resp))
                if kind == "quota":
                    raise RuntimeError(
                        f"YouTube API 쿼터 소진 ({resp.status_code}/{path}). "
                        "그날 안에는 회복되지 않는다. Cloud Console 의 Quotas 를 확인한다."
                    )
                raise RuntimeError(
                    f"YouTube API 인증 실패 ({resp.status_code}/{path}). "
                    "YOUTUBE_API_KEY 와 키의 API 제한 설정을 확인한다."
                )

            resp.raise_for_status()
            return resp.json()

        except RuntimeError:
            # 인증·쿼터 실패는 재시도 대상이 아니다. 그대로 올린다.
            raise
        except httpx.HTTPStatusError as exc:
            code = exc.response.status_code
            last_kind = f"HTTP {code}"
            # 4xx 는 요청이 잘못된 것이라 재시도해도 같다. 쿼터만 태운다.
            if code < 500 and code != 429:
                raise RuntimeError(
                    f"YouTube API 요청 오류 (HTTP {code}/{path}). 파라미터를 확인한다."
                ) from None
            if attempt < max_retry:
                await _sleep_backoff(attempt, backoff_base_sec, path, last_kind, max_retry)
        except Exception as exc:  # noqa: BLE001 — 네트워크/파싱 오류를 한데 묶는다
            last_kind = type(exc).__name__
            if attempt < max_retry:
                await _sleep_backoff(attempt, backoff_base_sec, path, last_kind, max_retry)

    raise RuntimeError(
        f"YouTube API 호출이 {max_retry}회 재시도 후에도 실패했다 ({path}, {last_kind})."
    )


def _safe_json(resp: httpx.Response) -> dict:
    """오류 응답의 JSON. 파싱 실패해도 예외를 내지 않는다 — 이미 오류 경로다."""
    try:
        return resp.json()
    except Exception:  # noqa: BLE001
        return {}


async def _sleep_backoff(
    attempt: int, base: float, path: str, kind: str, max_retry: int
) -> None:
    delay = base * (2 ** (attempt - 1))
    logger.warning(
        "YouTube %s 호출 실패 (%d/%d, %s), %.1f초 후 재시도", path, attempt, max_retry, kind, delay
    )
    await asyncio.sleep(delay)


async def list_upload_playlists(
    client: httpx.AsyncClient,
    *,
    channel_keys: list[str],
    api_key: str,
    timeout: float,
    max_retry: int,
    backoff_base_sec: float,
) -> dict[str, dict]:
    """채널의 업로드 플레이리스트 ID 와 현재 채널명을 가져온다. **1 unit.**

    `UC…` → `UU…` 치환으로도 업로드 플레이리스트 ID 를 얻을 수 있지만 쓰지 않는다.
    그 치환은 관례일 뿐 문서화된 규칙이 아니다 — RSS 를 '미문서화' 라고 거부하면서
    이 치환을 쓰면 일관성이 없다. channels.list 는 채널 50개를 묶어 1 unit 이라
    아끼는 것도 없다.

    채널명을 함께 받는 이유는 **매각·개명 감시** 때문이다. 2026-08-27 조사에서
    후보 20곳 중 6곳이 이미 무관한 콘텐츠(육아 브이로그, 심리 쇼츠)로 바뀌어
    있었다. 채널 ID 로 고정해도 그 ID 가 가리키는 것이 변한다.

    반환: {channel_key: {"uploads_playlist_id": str, "channel_nm": str}}
    """
    result: dict[str, dict] = {}
    for i in range(0, len(channel_keys), MAX_IDS_PER_CALL):
        chunk = channel_keys[i : i + MAX_IDS_PER_CALL]
        payload = await _get(
            client,
            "channels",
            {"part": "contentDetails,snippet", "id": ",".join(chunk), "maxResults": 50},
            api_key=api_key,
            timeout=timeout,
            max_retry=max_retry,
            backoff_base_sec=backoff_base_sec,
        )
        for item in payload.get("items", []):
            uploads = (
                item.get("contentDetails", {})
                .get("relatedPlaylists", {})
                .get("uploads")
            )
            if not uploads:
                continue
            result[item["id"]] = {
                "uploads_playlist_id": uploads,
                "channel_nm": item.get("snippet", {}).get("title", ""),
            }

    missing = set(channel_keys) - set(result)
    if missing:
        # 채널이 삭제됐거나 ID 가 틀렸다. 잡을 실패시키지 않는다 — 나머지 채널은
        # 정상 수집되어야 하고, 이 사실은 사람이 화이트리스트를 고쳐야 할 신호다.
        logger.warning("업로드 플레이리스트를 못 찾은 채널: %s", ", ".join(sorted(missing)))
    return result


async def list_playlist_videos(
    client: httpx.AsyncClient,
    *,
    playlist_id: str,
    max_results: int,
    api_key: str,
    timeout: float,
    max_retry: int,
    backoff_base_sec: float,
) -> list[dict]:
    """업로드 플레이리스트의 최신 영상 stub 목록. **1 unit.**

    페이징하지 않는다. 최신 50건이면 6시간 주기에 충분하고(화이트리스트 채널의
    업로드는 하루 0~3건이다), 페이징은 초기 백필처럼 사람이 의도할 때만 필요하다.
    """
    payload = await _get(
        client,
        "playlistItems",
        {
            # snippet 을 받는 이유: 비용이 contentDetails 와 같은 1 unit 인데
            # **제목이 딸려 온다.** 제목이 있으면 주제·금지 표현 필터를
            # videos.list 앞에서 돌릴 수 있어 2단계 호출량이 줄어든다.
            "part": "snippet",
            "playlistId": playlist_id,
            "maxResults": min(max_results, MAX_IDS_PER_CALL),
        },
        api_key=api_key,
        timeout=timeout,
        max_retry=max_retry,
        backoff_base_sec=backoff_base_sec,
    )
    return _to_stubs(payload.get("items", []), id_path=("snippet", "resourceId", "videoId"))


async def search_videos(
    client: httpx.AsyncClient,
    *,
    query: str,
    max_results: int,
    published_after: datetime,
    api_key: str,
    timeout: float,
    max_retry: int,
    backoff_base_sec: float,
) -> list[dict]:
    """검색으로 영상 stub 을 찾는다. **search 버킷 1 call (하루 100회 상한).**

    API 단에서 최대한 좁힌다. 어차피 상위 50건만 받으므로, 넓게 받아 우리가
    거르는 것보다 좁게 받는 편이 같은 쿼터로 더 많은 유효 결과를 준다.
      * type=video           — videoEmbeddable 등 video 필터를 쓰려면 필수다
      * regionCode/relevanceLanguage — 한국어 로또 콘텐츠로 좁힌다
      * order=date           — 신선도 필터와 방향을 맞춘다
      * publishedAfter       — 오래된 영상을 애초에 받지 않는다
      * videoEmbeddable=true — 임베드 못 하는 영상은 우리에게 쓸모가 없다
      * safeSearch=moderate

    응답에 재생시간·조회수가 없어 videos.list 2단계가 반드시 뒤따른다.
    """
    payload = await _get(
        client,
        "search",
        {
            # id 가 아니라 snippet 을 받는다. search 버킷 비용은 같고(1 call)
            # 제목·채널명이 딸려 와 videos.list 앞에서 걸러낼 수 있다.
            "part": "snippet",
            "type": "video",
            "q": query,
            "order": "date",
            "maxResults": min(max_results, MAX_IDS_PER_CALL),
            "regionCode": "KR",
            "relevanceLanguage": "ko",
            "publishedAfter": published_after.astimezone().isoformat(),
            "videoEmbeddable": "true",
            "safeSearch": "moderate",
        },
        api_key=api_key,
        timeout=timeout,
        max_retry=max_retry,
        backoff_base_sec=backoff_base_sec,
    )
    return _to_stubs(payload.get("items", []), id_path=("id", "videoId"))


def _to_stubs(raw_items: list[dict], *, id_path: tuple[str, ...]) -> list[dict]:
    """search/playlistItems 응답을 **stub** 으로 옮긴다.

    stub 은 videos.list 를 부르기 전에 필터를 돌릴 수 있을 만큼만 담은 dict 다 —
    영상 키·채널 키·채널명·제목·게시일. 재생시간과 조회수는 없다(이 응답들이
    주지 않는다). 컬럼 이름을 lotto_video 와 맞춰 두어 뒤에서 그대로 합쳐진다.

    id_path 가 다른 이유: search 는 `id.videoId`, playlistItems 는
    `snippet.resourceId.videoId` 에 영상 키를 담는다.
    """
    out: list[dict] = []
    for raw in raw_items:
        cur: object = raw
        for step in id_path:
            if not isinstance(cur, dict):
                cur = None
                break
            cur = cur.get(step)
        if not isinstance(cur, str) or not cur.strip():
            continue

        snippet = raw.get("snippet", {})
        title_nm = (snippet.get("title") or "").strip()
        if not title_nm:
            continue
        # 삭제된 영상이 플레이리스트에 남아 있으면 제목이 이렇게 온다.
        # videos.list 를 부르면 어차피 응답에 없지만 쿼터를 아끼려 여기서 버린다.
        if title_nm in ("Deleted video", "Private video"):
            continue

        out.append(
            {
                "provider_video_key": cur.strip(),
                "provider_channel_key": (snippet.get("channelId") or "").strip(),
                "channel_nm": (snippet.get("channelTitle") or "").strip() or None,
                "title_nm": title_nm,
                "published_dttm": _parse_published(snippet.get("publishedAt")),
            }
        )
    return out


async def list_video_details(
    client: httpx.AsyncClient,
    *,
    video_keys: list[str],
    api_key: str,
    timeout: float,
    max_retry: int,
    backoff_base_sec: float,
    summary_max_len: int,
) -> list[dict]:
    """영상 상세를 가져온다. **50개당 1 unit.**

    status 파트를 반드시 포함한다 — madeForKids 조회는 정책 III.E.4.10 의
    **의무**이고, embeddable/privacyStatus 는 표시 가능 여부를 가른다.

    반환은 lotto_video 컬럼 이름 그대로의 dict 다. 요청에 있었지만 응답에 없는
    키는 삭제·비공개된 영상이며, 그 판단은 호출자가 한다(여기서는 있는 것만 준다).
    """
    items: list[dict] = []
    for i in range(0, len(video_keys), MAX_IDS_PER_CALL):
        chunk = video_keys[i : i + MAX_IDS_PER_CALL]
        payload = await _get(
            client,
            "videos",
            {
                "part": "snippet,contentDetails,statistics,status",
                "id": ",".join(chunk),
                "maxResults": MAX_IDS_PER_CALL,
            },
            api_key=api_key,
            timeout=timeout,
            max_retry=max_retry,
            backoff_base_sec=backoff_base_sec,
        )
        items.extend(_to_items(payload, summary_max_len))
    return items


def _to_items(payload: dict, summary_max_len: int) -> list[dict]:
    """videos.list 응답을 lotto_video 컬럼 이름으로 옮긴다.

    published_dttm 이 없으면 버린다 — NOT NULL 이고 신선도 판정의 근거다.
    title_nm 이 비어도 버린다(NOT NULL).

    설명은 앞부분만 자른다. 전문을 담지 않는 것은 lotto_news 가 기사 원문을
    담지 않는 것과 같은 원칙이다.
    """
    out: list[dict] = []
    for raw in payload.get("items", []):
        key = (raw.get("id") or "").strip()
        if not key:
            continue

        snippet = raw.get("snippet", {})
        status = raw.get("status", {})
        stats = raw.get("statistics", {})
        content = raw.get("contentDetails", {})

        title_nm = (snippet.get("title") or "").strip()
        published_dttm = _parse_published(snippet.get("publishedAt"))
        if not title_nm or published_dttm is None:
            continue

        summary = (snippet.get("description") or "").strip()
        if len(summary) > summary_max_len:
            summary = summary[:summary_max_len]

        # 3-값 코드로 옮긴다. boolean 이 아니라 코드인 이유는 '조회 실패'와
        # 'false' 를 구분해야 하기 때문이다 — DB CHECK 가 그 셋을 강제한다.
        made_for_kids = status.get("madeForKids")
        embeddable = status.get("embeddable")

        view_raw = stats.get("viewCount")
        try:
            view_cnt = int(view_raw) if view_raw is not None else None
        except (TypeError, ValueError):
            view_cnt = None

        out.append(
            {
                "provider_nm": "youtube",
                "provider_video_key": key,
                "provider_channel_key": (snippet.get("channelId") or "").strip(),
                "channel_nm": (snippet.get("channelTitle") or "").strip() or None,
                "title_nm": title_nm,
                "summary_desc": summary or None,
                "thumbnail_url": _pick_thumbnail(snippet.get("thumbnails", {})),
                "published_dttm": published_dttm,
                "duration_sec": parse_iso8601_duration(content.get("duration")),
                "view_cnt": view_cnt,
                "made_for_kids_cd": _tri(made_for_kids),
                "embeddable_cd": _tri(embeddable),
                "privacy_status_cd": (status.get("privacyStatus") or "unknown").strip()
                or "unknown",
            }
        )
    return out


def _tri(value: bool | None) -> str:
    """boolean|None → yes/no/unknown.

    None 을 'no' 로 뭉개지 않는다. madeForKids 를 모르는 채로 임베드하면
    정책 III.E.4.10 의 조회 의무를 형식적으로만 지킨 것이 된다.
    """
    if value is True:
        return "yes"
    if value is False:
        return "no"
    return "unknown"
