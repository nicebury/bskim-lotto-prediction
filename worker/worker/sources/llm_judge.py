"""LLM 금지 표현 보조 판정.

규칙 기반 제외어(`YOUTUBE_FORBIDDEN_KEYWORDS`)는 **목록에 없는 신조어를 통과시킨다.**

    목록에 있음:  "예상번호" "고확률" "필승"        → 걸림
    목록에 없음:  "필출 2수" "고정수 5" "가지치기"  → 통과

로또 유튜브는 이런 표현이 계속 새로 생기는 영역이라 목록 유지보수가 따라가지
못한다. 규칙을 통과한 것만 여기서 한 번 더 묻는다.

**생성이 아니라 분류다.** 제목·채널명을 주고 판정만 시킨다 — 텍스트를 만들지
않으므로 환각이 결과물에 섞이지 않고, 오답이 나와도 영상 하나가 안 들어오는
것으로 끝난다. 영상 설명 글을 LLM 으로 생성하지 않는 이유는
docs/raw/004-유튜브영상수집계획.md 에 있다.

★ **이 모듈이 실패해도 수집은 멈추지 않는다.** API 오류·타임아웃·JSON 파싱 실패
  어느 쪽이든 **전건 통과**(규칙 필터 결과 그대로)로 처리하고 경고만 남긴다.
  보조 판정이 주 파이프라인을 멈추면 안 되고, 판정 실패가 대량 차단으로
  이어지는 것은 더 나쁘다.

계약: docs/wiki/10-contracts/worker-jobs.md 의 LLM 보조 판정 절
"""
from __future__ import annotations

import asyncio
import json
import logging

import httpx

logger = logging.getLogger(__name__)

OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions"

# 금지 표현 목록을 프롬프트에 넣지 않는다. 넣으면 규칙 필터와 하는 일이 같아지고,
# 여기에 기대하는 것은 목록 매칭이 아니라 **목록에 없는 것의 판정**이다.
# 그래서 낱말이 아니라 '성격'을 서술한다.
_SYSTEM_PROMPT = """너는 한국 로또·복권 유튜브 영상의 제목을 분류한다.

각 영상이 **다음 회차의 당첨번호를 예측·추천·제공하는 성격인지** 판정하라.

blocked = true 로 판정할 것:
- 다음 회차 번호를 찍어 주거나 추천하는 영상 (예상번호, 추천수, 고정수, 조합표)
- 당첨 확률을 높이는 방법·비법·필승법을 내세우는 영상
- 번호 분석을 근거로 특정 번호를 지목하는 영상

blocked = false 로 판정할 것:
- 이미 나온 회차의 당첨번호를 알려주는 영상 (결과 발표, 추첨 실황)
- 통계·패턴을 설명하되 특정 번호를 지목하지 않는 영상
- 당첨자 후기, 판매점 소개, 복권 제도 안내
- 복권과 무관한 영상

애매하면 false 로 둔다. 판단이 서지 않는 것을 차단하면 정상 영상이 사라진다.

입력은 JSON 배열이고 각 원소는 {"i": 번호, "t": 제목, "c": 채널명} 이다.
출력은 {"results": [{"i": 번호, "blocked": true|false}, ...]} 형식의 JSON 하나만
낸다. 설명을 덧붙이지 않는다."""


async def judge_blocked(
    client: httpx.AsyncClient,
    *,
    items: list[dict],
    api_key: str,
    model: str,
    batch_size: int,
    timeout: float,
    max_retry: int,
) -> set[str]:
    """차단해야 할 영상의 `provider_video_key` 집합을 돌려준다.

    `items` 는 `provider_video_key`·`title_nm`·`channel_nm` 을 가진 dict 목록이다.

    **실패 시 빈 집합을 돌려준다** — 아무것도 차단하지 않는다는 뜻이고, 그것이
    규칙 필터 결과를 그대로 채택하는 것이다. 예외를 올리지 않는다.

    배치로 묶는 이유는 시스템 프롬프트를 한 번만 내기 위해서다. 건당 호출하면
    500 토큰짜리 프롬프트를 매번 반복해 낸다 — 비용이 5배가 되고 얻는 것이 없다.
    """
    if not items:
        return set()

    blocked: set[str] = set()
    for i in range(0, len(items), batch_size):
        chunk = items[i : i + batch_size]
        try:
            blocked |= await _judge_batch(
                client,
                chunk=chunk,
                api_key=api_key,
                model=model,
                timeout=timeout,
                max_retry=max_retry,
            )
        except Exception as exc:  # noqa: BLE001 — 보조 판정은 잡을 실패시키지 않는다
            logger.warning(
                "LLM 판정 실패, 이 배치 %d건은 규칙 필터 결과를 그대로 쓴다 (%s)",
                len(chunk), type(exc).__name__,
            )
    return blocked


async def _judge_batch(
    client: httpx.AsyncClient,
    *,
    chunk: list[dict],
    api_key: str,
    model: str,
    timeout: float,
    max_retry: int,
) -> set[str]:
    """한 배치를 판정한다. 인덱스로 주고받아 제목 문자열을 되돌려받지 않는다.

    인덱스 방식인 이유: 모델이 제목을 그대로 되돌려주게 하면 한 글자라도 달라질
    때 매칭이 깨진다(공백 정규화, 이모지 처리 등). 번호는 변형되지 않는다.
    """
    payload_items = [
        {"i": idx, "t": it["title_nm"], "c": it.get("channel_nm") or ""}
        for idx, it in enumerate(chunk)
    ]
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": json.dumps(payload_items, ensure_ascii=False)},
        ],
        # JSON 이외의 것을 내지 못하게 한다. 이것이 없으면 모델이 설명을 덧붙이고
        # 파싱이 깨진다 — 그러면 전건 통과가 되어 필터가 조용히 무력해진다.
        "response_format": {"type": "json_object"},
    }
    # 온도·최대토큰을 보내지 않는다. 모델 세대마다 지원 파라미터가 달라
    # (max_tokens vs max_completion_tokens 등) 하나가 거부되면 400 이 된다.
    # 분류 작업이라 기본값으로 충분하다.

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    last_kind = "unknown"
    for attempt in range(1, max_retry + 1):
        try:
            resp = await client.post(
                OPENAI_CHAT_URL, json=body, headers=headers, timeout=timeout
            )
            if resp.status_code in (401, 403):
                # 키 문제는 재시도해도 같다. 상태코드만 올린다 — 본문에 키가
                # 실릴 일은 없지만 습관을 그렇게 들인다.
                raise RuntimeError(f"LLM 인증 실패 ({resp.status_code}). API_KEY 를 확인한다.")
            resp.raise_for_status()
            return _parse_verdicts(resp.json(), chunk)

        except RuntimeError:
            raise
        except Exception as exc:  # noqa: BLE001
            last_kind = type(exc).__name__
            if attempt < max_retry:
                await asyncio.sleep(2.0 * attempt)

    raise RuntimeError(f"LLM 판정이 {max_retry}회 재시도 후에도 실패했다 ({last_kind}).")


def _parse_verdicts(payload: dict, chunk: list[dict]) -> set[str]:
    """응답에서 blocked=true 인 영상의 키를 뽑는다.

    파싱이 조금이라도 어긋나면 **빈 집합**을 돌려준다(= 전건 통과). 차단은
    되돌릴 수 없는 판정이므로, 확신이 없을 때는 통과시키는 쪽이 안전하다.
    반대로 하면 모델이 이상한 응답을 한 날 그날 수집이 통째로 사라진다.
    """
    try:
        content = payload["choices"][0]["message"]["content"]
        parsed = json.loads(content)
        results = parsed["results"]
    except (KeyError, IndexError, TypeError, json.JSONDecodeError) as exc:
        logger.warning("LLM 응답 파싱 실패, 전건 통과로 처리한다 (%s)", type(exc).__name__)
        return set()

    blocked: set[str] = set()
    for row in results:
        try:
            idx = int(row["i"])
            if row.get("blocked") is True and 0 <= idx < len(chunk):
                blocked.add(chunk[idx]["provider_video_key"])
        except (KeyError, TypeError, ValueError):
            # 원소 하나가 이상해도 나머지 판정은 살린다.
            continue
    return blocked
