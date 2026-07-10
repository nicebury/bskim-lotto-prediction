"""꿈해몽 키워드 목록.

프론트의 `generateStaticParams` 가 `/dream/{keyword}` 정적 페이지를 만들 때 쓴다.

**임베딩 모델을 로드하지 않는다.** ChromaDB 의 문서 목록만 읽으면 되는데, `DreamSearcher`
를 거치면 SentenceTransformer 가 딸려 와 첫 요청이 20초 걸린다. 사이트맵 생성이 그
비용을 낼 이유가 없어 별도 경로를 둔다 (docs/wiki/40-domain/dream-pipeline.md).

슬러그는 한글 표기 그대로다. `/dream/돼지` 가 검색어 `돼지꿈 로또번호` 와 일치하는 편이
롱테일 유입에 유리하고, 로마자 변환은 `돼지`→`dwaeji`/`dweji` 중 무엇이 정본인지
정할 근거가 없다.
"""
from __future__ import annotations

import logging
import threading
from pathlib import Path
from typing import Optional

import chromadb

from .searcher import COLLECTION_NAME

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_cache: Optional[list[dict[str, str]]] = None


def _load(chroma_path: Path) -> list[dict[str, str]]:
    if not chroma_path.exists():
        # 조용히 빈 목록을 주면 사이트맵이 말없이 비고, 며칠 뒤 색인이 사라진 걸 발견한다.
        raise FileNotFoundError(f"ChromaDB 경로가 없습니다: {chroma_path}")

    client = chromadb.PersistentClient(path=str(chroma_path))
    # get_or_create 가 아니라 get 이다. 컬렉션이 없으면 빈 컬렉션을 만들어 주는 대신
    # 예외를 던져야 한다 — 경로는 맞는데 데이터가 없는 상황을 숨기지 않는다.
    collection = client.get_collection(COLLECTION_NAME)
    result = collection.get(include=["documents"])

    words = sorted({doc for doc in (result.get("documents") or []) if doc})
    logger.info("꿈해몽 키워드 %d개를 로드했습니다", len(words))
    return [{"slug": w, "word": w} for w in words]


def get_keywords(chroma_path: Path) -> list[dict[str, str]]:
    """단어 사전은 정적이다. 프로세스 수명 동안 한 번만 읽는다.

    double-checked locking 은 state.py 의 싱글톤들과 같은 이유다 — 기동 직후 동시에
    들어온 요청들이 4,802행을 각자 읽지 않게 한다.
    """
    global _cache
    if _cache is None:
        with _lock:
            if _cache is None:
                _cache = _load(chroma_path)
    return _cache
