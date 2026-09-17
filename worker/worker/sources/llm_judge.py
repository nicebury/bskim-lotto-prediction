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
# 그래서 낱말이 아니라 '심사자가 이 제목을 보고 무엇으로 읽을까' 를 묻는다.
#
# 2026-09-08 개정: 종전 프롬프트는 "예상번호를 제공하는가" 만 물었다. 실측에서
# 그 기준을 통과한 "황금 재물운 쏟아지는 명당", "지갑 속 20억 곧 소멸됩니다"
# 같은 운세·클릭베이트가 대량 유입됐다. 예상번호가 아니라는 이유로 통과했지만
# 애드센스 심사자에게는 똑같이 도박·미신 조장으로 읽힌다.
_ADSENSE_RULE = """너는 로또·복권 정보 사이트의 콘텐츠 심사자다.
이 사이트는 애드센스 승인을 받아야 하며, 심사자는 사람이 화면을 직접 본다.

각 항목의 제목을 보고 **이 사이트 목록에 실렸을 때 사이트의 성격을 해치는지**
판정하라. blocked=true 면 수집하지 않는다.

blocked = true (실으면 안 되는 것):
1. 다음 회차 번호를 예측·추천·제공  (예상번호, 추천수, 고정수, 조합표, 분석 결과 공개)
2. 당첨 확률을 높이는 방법·비법·필승법을 내세움
3. 운세·기운·부적·사주로 당첨을 말함  (재물운, 황금기운, 대박 기운, 행운의 부적)
4. 자극적 클릭베이트  (지갑 속 20억 곧 소멸, 이것만 보면 인생역전, 충격 실화)
5. 특정 판매점에서 사면 당첨된다는 취지  (장소 소개를 넘어 '여기서 사라'는 권유)
6. 도박을 부추기는 표현  (지금 안 사면 후회, 몰빵, 올인)
7. 복권과 무관하거나 광고·홍보가 주목적

blocked = false (실어도 되는 것):
- 이미 추첨이 끝난 회차의 결과·당첨번호 안내
- 추첨 실황, 방송 클립
- 통계·패턴을 사실로 설명 (특정 번호를 지목하지 않는 것)
- 당첨자 후기·인터뷰 (사실 전달에 그치는 것)
- 판매점·지역 소개 (권유 없이 정보만)
- 복권 제도·기금·정책 안내

판단 기준은 낱말이 아니라 **의도**다. '명당' 이라는 말이 있어도 판매점을 소개하는
정보성 콘텐츠면 통과시키고, 그 말이 없어도 "여기서 사면 됩니다" 면 차단한다.

애매하면 false 로 둔다. 애매한 것을 차단하면 정상 콘텐츠가 사라진다."""

_IO_RULE = """입력은 JSON 배열이고 각 원소는 {"i": 번호, "t": 제목, "c": 출처} 다.
출력은 {"results": [{"i": 번호, "blocked": true|false}, ...]} 형식의 JSON 하나만
낸다. 설명을 덧붙이지 않는다."""

_SYSTEM_PROMPT_VIDEO = f"""{_ADSENSE_RULE}

대상은 **유튜브 영상**이다. c 는 채널명이다.

{_IO_RULE}"""

# 뉴스는 영상과 성격이 다르다. 언론사 편집을 한 번 거친 콘텐츠라 애초에
# 자극적 제목이 적고, 무엇보다 **사실 보도**가 기본이다.
# 실측(2026-09-08, 486건): 위 기준을 그대로 적용했더니 차단 5건 중 3건이
# 과잉이었다 — 방송 출연 안내, 당첨금 지급 제도 안내, 당첨 후기 기사가
# 걸렸다. "이건 당장 사야 해" 같은 **인용문**을 도박 부추김으로 읽은 것이다.
# 그래서 뉴스에는 통과 기준을 명시적으로 넓힌다.
_SYSTEM_PROMPT_NEWS = f"""{_ADSENSE_RULE}

대상은 **뉴스 기사**이고 c 는 언론사명이다. 영상과 달리 언론사 편집을 거친
사실 보도이므로 **기본적으로 통과시킨다.** 아래만 차단한다.

- 복권과 무관한 이벤트·경품 마케팅  (지자체 축제 친구추가 이벤트, 앱 퀴즈 이벤트)
- 특정 상품·앱을 홍보하는 것이 주목적인 기사
- 연예·부동산·증시가 '로또' 를 비유로 쓴 기사  ("로또 청약", "로또 맞은 주가")
- 기사 각주에 복권기금이 스쳤을 뿐 주제가 무관한 보도자료

**차단하지 않는 것** — 위 일반 기준보다 이쪽이 우선한다:
- 추첨 방송 출연·편성 안내
- 당첨금 지급 방식, 세금, 판매 제도 등 제도 안내
- 당첨자 후기·인터뷰. **기사에 인용된 당첨자의 말은 사이트의 주장이 아니다** —
  "이건 당장 사야 해" 같은 인용문을 도박 부추김으로 읽지 않는다
- 복권기금 공익사업 보도

{_IO_RULE}"""

_PROMPTS = {"video": _SYSTEM_PROMPT_VIDEO, "news": _SYSTEM_PROMPT_NEWS}


async def judge_blocked(
    client: httpx.AsyncClient,
    *,
    items: list[dict],
    kind: str,
    api_key: str,
    model: str,
    batch_size: int,
    timeout: float,
    max_retry: int,
) -> set[str]:
    """차단해야 할 영상의 `provider_video_key` 집합을 돌려준다.

    `items` 는 `key`·`title_nm`·`source_nm` 을 가진 dict 목록이다.
    `kind` 는 `video` 또는 `news` — 프롬프트가 달라진다.

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
                kind=kind,
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
    kind: str,
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
        {"i": idx, "t": it["title_nm"], "c": it.get("source_nm") or ""}
        for idx, it in enumerate(chunk)
    ]
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": _PROMPTS[kind]},
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
                blocked.add(chunk[idx]["key"])
        except (KeyError, TypeError, ValueError):
            # 원소 하나가 이상해도 나머지 판정은 살린다.
            continue
    return blocked
