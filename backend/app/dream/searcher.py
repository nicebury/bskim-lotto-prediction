"""ChromaDB + SentenceTransformer 기반 꿈 단어 유사도 검색.

reg_lotto의 DreamSearcher를 포팅. 변경점:
- 예외 시 None 대신 빈 결과 반환
- 거리(L2) → 0~1 점수로 정규화하여 UI 친화
- exclude_words 로직은 유지 (원본의 노이즈 제거용)
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import List, Optional, Tuple

import chromadb
from sentence_transformers import SentenceTransformer

logger = logging.getLogger(__name__)

COLLECTION_NAME = "lotto_word"
MODEL_NAME = "upskyy/kf-deberta-multitask"
EXCLUDE_WORDS = {"곡괭이", "꽈리", "꽤배기"}
DISTANCE_THRESHOLD = 500  # 원본과 동일
TOP_CONTAINING = 3
TOP_SIMILAR = 3


@dataclass
class DreamMatch:
    gubun: int            # 1=정확일치, 2=포함, 3=유사
    word: str             # DB의 단어
    lotto_number: list[int]
    importance: int
    score: float          # 0~1 (높을수록 유사)
    distance: float       # 원본 L2 거리

    def to_dict(self) -> dict:
        return {
            "gubun": self.gubun,
            "word": self.word,
            "lotto_number": self.lotto_number,
            "importance": self.importance,
            "score": round(self.score, 4),
            "distance": round(self.distance, 2),
        }


class DreamSearcher:
    def __init__(self, chroma_path: str, model_name: str = MODEL_NAME):
        logger.info("DreamSearcher init: chroma=%s model=%s", chroma_path, model_name)
        self._model = SentenceTransformer(model_name)
        self._client = chromadb.PersistentClient(path=chroma_path)
        self._collection = self._client.get_or_create_collection(name=COLLECTION_NAME)

    def _embed(self, text: str):
        return self._model.encode(text.strip()).tolist()

    @staticmethod
    def _parse_lotto_number(raw) -> list[int]:
        if isinstance(raw, list):
            return [int(x) for x in raw]
        if isinstance(raw, str):
            s = raw.strip()
            # "[5, 33, 39]" 형태
            if s.startswith("["):
                try:
                    return [int(x) for x in json.loads(s)]
                except Exception:  # noqa: BLE001
                    pass
            # "5,33,39" 형태
            return [int(x.strip()) for x in s.replace("[", "").replace("]", "").split(",") if x.strip()]
        return []

    @staticmethod
    def _parse_importance(raw) -> int:
        if isinstance(raw, int):
            return raw
        try:
            return int(str(raw).strip())
        except Exception:  # noqa: BLE001
            return 0

    def _query(self, word: str, n_results: int = 100) -> Optional[dict]:
        try:
            emb = self._embed(word)
            return self._collection.query(query_embeddings=[emb], n_results=n_results)
        except Exception as exc:  # noqa: BLE001
            logger.warning("chroma query failed: %s", exc)
            return None

    @staticmethod
    def _distance_to_score(distance: float) -> float:
        # L2 distance → 0~1 (가까울수록 1)
        return 1.0 / (1.0 + max(0.0, distance))

    def search(self, word: str, n_results: int = 100) -> Tuple[
        List[DreamMatch], List[DreamMatch], List[DreamMatch]
    ]:
        """반환: (exact_matches, containing_words, similar_meanings)"""
        results = self._query(word, n_results)
        if not results or not results.get("documents"):
            return [], [], []

        docs = results["documents"][0]
        metas = results["metadatas"][0]
        dists = results["distances"][0]

        exact: list[DreamMatch] = []
        containing: list[DreamMatch] = []
        similar: list[DreamMatch] = []

        for doc, meta, dist in zip(docs, metas, dists):
            if dist > DISTANCE_THRESHOLD:
                continue
            if not doc:
                continue

            match = DreamMatch(
                gubun=0,  # 아래에서 결정
                word=doc,
                lotto_number=self._parse_lotto_number(meta.get("lotto_number")),
                importance=self._parse_importance(meta.get("importance")),
                score=self._distance_to_score(dist),
                distance=float(dist),
            )

            if doc == word:
                match.gubun = 1
                exact.append(match)
            elif word in doc:
                match.gubun = 2
                containing.append(match)
            else:
                match.gubun = 3
                similar.append(match)

        # 거리 오름차순(가까울수록 앞)
        containing.sort(key=lambda m: m.distance)
        similar.sort(key=lambda m: m.distance)

        containing = containing[:TOP_CONTAINING]

        # 원본 규칙: 유사 결과 상위에 exclude 단어 2개 이상이면 전체 드롭
        excluded_in_top = sum(1 for m in similar[:TOP_SIMILAR] if m.word in EXCLUDE_WORDS)
        if excluded_in_top >= 2:
            similar = []
        else:
            similar = similar[:TOP_SIMILAR]

        return exact, containing, similar
