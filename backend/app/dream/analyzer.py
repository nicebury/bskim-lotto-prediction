"""꿈 텍스트 형태소 분석기 (kiwipiepy + 원본 reg_lotto 매핑 881개).

kiwipiepy는 "빨간"→"빨갛"(어간) 형태로 분절하지만, 원본 reg_lotto 매핑은
"빨간", "빨갛다" 같은 활용형 키를 사용한다. 따라서:
1. 원문에서 어절 단위로 먼저 매핑 조회 (ex: "빨간"→"빨강")
2. kiwipiepy 어간 + 다→형 (ex: "빨갛"→"빨갛다") 으로 매핑 재조회
3. 그래도 없으면 간이 stem→명사 규칙 적용
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Set

from kiwipiepy import Kiwi

_MAPPINGS_PATH = Path(__file__).parent / "word_mappings.json"

_KEEP_TAGS = {
    "NNG", "NNP", "NNB", "NR",
    "SL",
    "VV", "VA", "VA-I", "VV-I",
    "XR",
}

_ONE_LETTER_WHITELIST: Set[str] = {
    "간", "감", "갑", "갓", "강", "개", "검", "게", "곰", "공", "관", "국",
    "굴", "굿", "귀", "귤", "금", "껌", "꽃", "꿀", "꿩", "끈", "난", "낫",
    "논", "달", "닭", "담", "댐", "덫", "독", "돈", "돌", "딸", "때", "떡",
    "똥", "망", "매", "못", "문", "물", "밀", "밑", "발", "밤", "밥", "방",
    "밭", "뱀", "벌", "벼", "벽", "변", "별", "병", "복", "봄", "북", "불",
    "붓", "비", "빗", "빚", "빛", "빵", "뺨", "뿔", "산", "삽", "상", "새",
    "섬", "소", "손", "솜", "솥", "쇠", "쇼", "술", "숯", "신", "실", "쌀",
    "썸", "쑥", "암", "약", "양", "역", "연", "옷", "옻", "왕", "용", "은",
    "일", "입", "잔", "잠", "재", "젖", "종", "죽", "줄", "쥐", "짐", "집",
    "징", "짚", "찌", "책", "철", "초", "총", "춤", "칡", "칸", "칼", "컵",
    "코", "콩", "탑", "턱", "털", "톱", "통", "파", "팔", "팥", "팩", "펜",
    "풀", "피", "학", "해", "핵", "향", "혀", "형", "활", "회", "흙",
}

_STOPWORDS: Set[str] = {
    "내", "너", "나", "니", "우리", "꿈", "리", "거", "것", "수", "때",
    "경우", "동안", "중", "쪽", "중간",
    "꾸다", "꾸었다", "꿨다", "꿨었다", "꿨습니다", "꾸었습니다",
    "있다", "있었다", "하다", "했다", "했었다", "그랬다",
}

# 중의어/유의어 확장: 짧은 단어가 여러 의미를 가질 때 후보를 모두 검색
_SYNONYM_EXPAND: dict[str, list[str]] = {
    "눈": ["눈물", "눈보라", "눈사람"],
    "배": ["선박", "배꼽", "배나무"],
    "말": ["말씀", "경마"],
    "절": ["사찰", "절벽"],
    "사람": ["남자", "여자", "사람들"],
    "아이": ["아들", "아기", "어린이"],
    "이사": ["이사짐", "이삿짐"],
    "결혼": ["결혼식", "신부", "신랑"],
    "차": ["자동차", "찻잔"],
    "집": ["집안", "건물"],
    "길": ["도로", "길거리"],
    "문": ["문짝", "대문"],
    "꽃": ["꽃잎", "꽃다발"],
    "피": ["피바다", "핏물"],
    "빛": ["빛나다", "빛줄기"],
}

_WS_RE = re.compile(r"\s+")


def _load_mappings() -> dict[str, str]:
    if not _MAPPINGS_PATH.exists():
        return {}
    with open(_MAPPINGS_PATH, encoding="utf-8") as f:
        data = json.load(f)
    merged: dict[str, str] = {}
    for _, mapping in data.items():
        if isinstance(mapping, dict):
            merged.update(mapping)
    return merged


class DreamAnalyzer:
    def __init__(self) -> None:
        self._kiwi = Kiwi()
        self._mappings = _load_mappings()

    def _lookup(self, *candidates: str) -> str | None:
        """매핑 테이블에서 여러 후보 키를 순서대로 조회."""
        for c in candidates:
            if c and c in self._mappings:
                return self._mappings[c]
        return None

    def _stem_to_noun(self, stem: str, tag: str) -> str:
        """어간 → 명사형 변환. 원본 reg_lotto의 규칙 그대로 이식."""
        if not stem:
            return stem
        if stem.endswith("하"):
            return stem[:-1] or stem + "함"
        if stem.endswith("되"):
            return stem[:-1] + "됨"
        if stem.endswith("적"):
            return stem
        if stem.endswith("스럽"):
            return stem[:-2] + "스러움"
        if stem.endswith("있"):
            return stem[:-1] + "있음"
        if stem.endswith("없"):
            return stem[:-1] + "없음"
        if stem.endswith("롭"):
            return stem[:-1] + "로움"
        if stem.endswith("답"):
            return stem[:-1] + "다움"
        # 받침별 처리
        last = stem[-1]
        if last in "ᆻ":  # ㅆ 받침
            return stem[:-1] + "음"
        if last in "ᆫᆯᆷᆸ":  # ㄴ, ㄹ, ㅁ, ㅂ 받침
            return stem + "음"
        return stem + ("함" if "VA" in tag else "음")

    def analyze(self, sentence: str) -> list[str]:
        """꿈 텍스트 → 검색 후보 단어 리스트.

        3단계 추출:
        1. 원문 어절에서 매핑/유의어 확장
        2. kiwipiepy 형태소 분석 + 매핑 + stem 규칙
        3. 원문 어절 자체도 후보에 추가 (임베딩 유사도로 직접 매칭 가능)
        """
        if not sentence or not sentence.strip():
            return []

        raw_words = _WS_RE.split(sentence.strip())
        tokens = self._kiwi.analyze(sentence, top_n=1)[0][0]
        result: list[str] = []
        seen: Set[str] = set()

        def _add(word: str) -> None:
            if not word or word in seen:
                return
            if len(word) == 1 and word not in _ONE_LETTER_WHITELIST:
                return
            if word in _STOPWORDS:
                return
            seen.add(word)
            result.append(word)

        # 1차: 원문 어절 — 매핑 + 유의어 확장
        for rw in raw_words:
            clean = rw.strip(".,!?~…·;:\"'""''()[]{}").strip()
            if not clean:
                continue
            mapped = self._lookup(clean)
            if mapped:
                _add(mapped)
            # 중의어 확장 (짧은 단어가 여러 의미를 가질 때)
            if clean in _SYNONYM_EXPAND:
                for syn in _SYNONYM_EXPAND[clean]:
                    _add(syn)

        # 2차: kiwipiepy 토큰
        for tok in tokens:
            form: str = tok.form
            tag: str = tok.tag

            if tag not in _KEEP_TAGS:
                continue

            if "VA" in tag or "VV" in tag:
                mapped = self._lookup(
                    form, form + "다", form + "ㄴ", form + "은",
                    form + "운", form + "인",
                )
                word = mapped if mapped else self._stem_to_noun(form, tag)
            elif form in self._mappings:
                word = self._mappings[form]
            else:
                word = form

            _add(word)
            # 유의어 확장 (형태소 결과에도 적용)
            if word in _SYNONYM_EXPAND:
                for syn in _SYNONYM_EXPAND[word]:
                    _add(syn)

        return result
