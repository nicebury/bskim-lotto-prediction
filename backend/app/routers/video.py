"""복권 관련 유튜브 영상 목록.

`lotto_video` 는 워커의 `video_*` 잡이 `YOUTUBE_API_KEY` 를 기다리는 동안 비어 있다.
그동안 이 엔드포인트는 빈 배열을 반환한다 — 404 가 아니다. 데이터가 없는 것과 자원이
없는 것은 다르다 (`news` 와 같은 규약).

## 이 리소스에만 있는 제약 셋

다른 어떤 리소스에도 없는 제약이 계약에 박혀 있다
(docs/wiki/10-contracts/api-contract.md 의 '영상' 절).

1. **응답 캐시 TTL 24시간 상한** — 아래 `_MAX_CACHE_SECONDS` 참조
2. **표시 조건 WHERE 절 필수** — `repository._VIDEO_VISIBLE` 이 건다
3. **쇼츠 여부를 boolean 으로 노출 금지** — `shorts_hint` 문자열 그대로

셋 다 "지키면 좋은 것" 이 아니라 지키지 않으면 **정책 위반의 주체가 백엔드가 되는**
종류다. 그래서 규율이 아니라 코드로 강제한다.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Response

from .. import repository as repo
from ..db import get_pool
from ..schemas import VideoDetail, VideoPage

router = APIRouter(prefix="/api", tags=["video"])

# ★ 계약이 정한 캐시 상한. 이 값을 넘기지 않는다.
#
# `lotto_video` 의 행은 YouTube 개발자 정책 III.E.4 에 따라 30일 안에 갱신되거나
# 삭제된다. 백엔드가 응답을 오래 캐시하면 워커가 이미 지운 데이터를 계속 내보내게 되고,
# **그 시점부터 정책 위반의 주체는 백엔드다.**
_MAX_CACHE_SECONDS = 24 * 60 * 60

# 실제로 내보내는 값. 상한보다 훨씬 짧게 잡는다 — 영상 목록이 한 시간 늦게 갱신되는
# 것은 아무도 아쉬워하지 않지만, 상한에 바싹 붙여 두면 나중에 누군가 "조금만 더" 를
# 더하는 순간 위반이 된다. 여유를 두는 것 자체가 안전장치다.
_CACHE_SECONDS = 60 * 60

# 상한을 주석으로만 적어 두면 나중에 값을 올리는 사람이 주석을 읽지 않는다.
# 기동 시점에 죽여서 배포 전에 알게 한다.
assert _CACHE_SECONDS <= _MAX_CACHE_SECONDS, (
    f"영상 응답 캐시는 {_MAX_CACHE_SECONDS}초(24시간)를 넘길 수 없습니다. "
    "YouTube 개발자 정책 III.E.4 — docs/wiki/10-contracts/api-contract.md"
)


def _set_cache_header(response: Response) -> None:
    """캐시 상한을 헤더로 알린다.

    프론트(Next.js)가 `revalidate` 를 따로 정하더라도, 그 사이에 있는 리버스 프록시·CDN
    까지 규약을 알아야 한다. 백엔드가 직접 말하지 않으면 중간 계층은 자기 기본값으로
    캐시하고, 그 기본값이 24시간을 넘는지 아무도 확인하지 않는다.
    """
    response.headers["Cache-Control"] = f"public, max-age={_CACHE_SECONDS}"


@router.get("/videos", response_model=VideoPage)
async def list_videos(
    response: Response,
    kind: str = Query(
        "all",
        description="all | normal | shorts. unknown 은 all 에서만 보인다",
    ),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    round: Optional[int] = Query(
        None, ge=1, description="회차. game 과 함께 써야 의미가 있다"
    ),
    game: Optional[str] = Query(None, description="lotto | pension"),
    q: Optional[str] = Query(
        None, description="제목·채널명·키워드에 대소문자 무시 포함 검색. 50자 이하"
    ),
    sort: str = Query("latest", description="latest | views"),
    period: str = Query("all", description="published_at 기준 최근 기간. 1w|1m|3m|all"),
) -> dict:
    # 계약이 허용값을 못 박았으므로 그 밖은 422 다. Query 의 pattern 으로 막지 않고
    # 여기서 거르는 이유는, 무엇이 가능한 값인지를 오류 메시지에 담기 위해서다 —
    # `recommend` 의 `strategy` 와 같은 방식이다.
    if kind not in repo.VIDEO_KINDS:
        raise HTTPException(
            status_code=422,
            detail=f"알 수 없는 kind 입니다: {kind}. "
            f"가능한 값: {', '.join(repo.VIDEO_KINDS)}",
        )
    if game is not None and game not in repo.VIDEO_GAMES:
        raise HTTPException(
            status_code=422,
            detail=f"알 수 없는 game 입니다: {game}. "
            f"가능한 값: {', '.join(repo.VIDEO_GAMES)}",
        )
    if sort not in repo.VIDEO_SORTS:
        raise HTTPException(
            status_code=422,
            detail=f"알 수 없는 sort 입니다: {sort}. "
            f"가능한 값: {', '.join(repo.VIDEO_SORTS)}",
        )
    if period not in repo.VIDEO_PERIOD_DAYS:
        raise HTTPException(
            status_code=422,
            detail=f"알 수 없는 period 입니다: {period}. "
            f"가능한 값: {', '.join(repo.VIDEO_PERIOD_DAYS)}",
        )

    # 공백만 있는 q 는 필터로 치지 않는다 — 빈 검색과 같게 다룬다(`news` 의 keyword 와
    # 같은 규약). 검색창을 비웠는데 공백 한 칸이 남아 아무것도 안 나오는 일을 막는다.
    keyword = q.strip() if q else None
    keyword = keyword or None

    # 길이는 **공백을 턴 뒤**에 잰다. 계약이 "공백 제거 후 … 50자를 넘으면 422" 순서로
    # 서술한 그대로다. 앞뒤 공백 때문에 거절당하는 것은 사용자가 이해할 수 없는 거절이다.
    if keyword is not None and len(keyword) > repo.VIDEO_Q_MAX_LENGTH:
        raise HTTPException(
            status_code=422,
            detail=f"q 는 {repo.VIDEO_Q_MAX_LENGTH}자를 넘을 수 없습니다. "
            f"(받은 길이: {len(keyword)})",
        )

    since_days = repo.VIDEO_PERIOD_DAYS[period]

    pool = get_pool()
    # count 와 list 는 같은 필터를 받아야 total 이 '필터 후 건수' 가 된다.
    total = await repo.count_videos(
        pool, kind=kind, round_no=round, game=game, q=keyword, since_days=since_days
    )
    items = await repo.list_videos(
        pool,
        page=page,
        size=size,
        kind=kind,
        round_no=round,
        game=game,
        q=keyword,
        since_days=since_days,
        sort=sort,
    )

    _set_cache_header(response)
    return {"total": total, "page": page, "size": size, "items": items}


@router.get("/videos/{video_id}", response_model=VideoDetail)
async def get_video(response: Response, video_id: int) -> dict:
    """영상 하나. `game='lotto'` 인 경우에만 그 회차의 당첨 정보를 함께 담는다."""
    pool = get_pool()
    video = await repo.get_video(pool, video_id)
    if video is None:
        # 표시 조건에 걸린 영상도 여기로 온다. 목록에서 숨긴 영상을 URL 만 알면 상세로
        # 볼 수 있게 두면 거른 의미가 없다.
        raise HTTPException(status_code=404, detail="영상을 찾을 수 없습니다.")

    # ★ `game` 을 반드시 함께 본다.
    #
    # 회차 번호만 보고 조인하면 **연금복권 330회 영상에 로또 330회 당첨번호가 붙는다.**
    # 에러가 나지 않고 화면에 조용히 틀린 번호가 뜨는 종류의 사고라, 조건을 뺐을 때
    # 아무도 알아채지 못한다 (docs/wiki/10-contracts/db-schema.md).
    #
    # 회차 연결을 프론트에 맡기지 않고 여기서 붙이는 이유도 같다 — 맡기면 이 `game`
    # 검사를 잊을 위험이 프론트로 옮겨갈 뿐 사라지지 않는다.
    draw = None
    if video["game"] == "lotto" and video["round"] is not None:
        # 아직 추첨 전 회차를 예고하는 영상이 있다. 조인 결과가 없는 것은 **정상 경로**이지
        # 404 가 아니다 — 영상 자체는 멀쩡히 존재한다.
        draw = await repo.get_round(pool, video["round"])

    _set_cache_header(response)
    return {**video, "draw": draw}
