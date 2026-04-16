"""꿈 분석/검색기의 싱글톤 lazy 로더."""
from __future__ import annotations

import logging
import threading
from pathlib import Path
from typing import Optional

from .analyzer import DreamAnalyzer
from .searcher import DreamSearcher

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_analyzer: Optional[DreamAnalyzer] = None
_searcher: Optional[DreamSearcher] = None


def get_analyzer() -> DreamAnalyzer:
    global _analyzer
    if _analyzer is None:
        with _lock:
            if _analyzer is None:
                logger.info("Loading DreamAnalyzer (kiwipiepy)...")
                _analyzer = DreamAnalyzer()
    return _analyzer


def get_searcher(chroma_path: Path) -> DreamSearcher:
    global _searcher
    if _searcher is None:
        with _lock:
            if _searcher is None:
                if not Path(chroma_path).exists():
                    raise FileNotFoundError(
                        f"ChromaDB 경로가 없습니다: {chroma_path}"
                    )
                logger.info("Loading DreamSearcher (Chroma + SentenceTransformer)...")
                _searcher = DreamSearcher(str(chroma_path))
    return _searcher
