"""꿈 사전(ChromaDB)에 `data/custom_words.json` 의 단어를 넣는다.

## 왜 스크립트인가 — 직접 넣으면 안 되는 이유

`backend/data/chroma_words/` 는 `.gitignore` 되어 **git 에 없고**, 이 임베딩을 만든 원본
데이터도 남아 있지 않다. 즉 사전은 **복제할 수 없는 자산**이다. 여기에 파이썬 한 줄로
단어를 밀어 넣으면 그 변경은 이 PC 에만 존재하고, 다른 곳에 배포하거나 파일이 상하는
순간 무엇을 더했었는지조차 알 수 없게 된다.

그래서 "무엇을 더할 것인가" 는 git 에 들어가는 JSON 에 두고, "그것을 사전에 반영한다" 는
이 스크립트가 맡는다. 사전이 사라져도 원본 사전 파일만 다시 구하면 이 스크립트로 복구된다.

## 전체 재임베딩은 하지 않는다

기존 4,802 단어의 벡터는 그대로 두고 **새 단어만** 인코딩한다. 같은 모델
(`searcher.MODEL_NAME`)로 만든 768차원 벡터라 기존 벡터들과 같은 공간에 놓인다.
모델을 바꾸면 그때는 전부 다시 만들어야 하지만, 그것은 이 스크립트의 일이 아니다.

## ⚠ 실행 전에 백엔드 서버를 멈춘다

ChromaDB 는 HNSW 인덱스를 `data_level0.bin` 등 별도 파일로 들고 있고, 단어를 더하면 그
파일들을 다시 쓴다. 백엔드가 떠 있으면 그 프로세스가 같은 파일을 열어 둔 채라
**복구할 수 없는 자산이 상할 수 있다.** 서버를 멈추고 실행한 뒤 다시 띄운다.

스크립트는 열려 있는 프로세스를 감지하면 실행을 거부한다 — 사람이 기억해야 하는 규칙은
잊히고, 잊힌 결과가 파일 손상이면 되돌릴 방법이 없다.

## 사용법

    cd backend
    uv run python scripts/add_custom_words.py            # 무엇이 바뀔지만 보여준다
    uv run python scripts/add_custom_words.py --apply    # 실제로 반영한다

`--apply` 없이 부르면 아무것도 쓰지 않는다. 되돌릴 수 없는 작업의 기본값은 "하지 않음"
이어야 한다.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

CUSTOM_WORDS_PATH = BACKEND_DIR / "data" / "custom_words.json"


def _chroma_path() -> Path:
    """설정과 같은 경로를 쓴다. 스크립트가 다른 사전을 고치는 사고를 막는다."""
    from app.config import settings

    return settings.chroma_path


def _holders(chroma_path: Path) -> list[str]:
    """이 디렉토리의 파일을 열어 둔 프로세스 목록. `lsof` 가 없으면 빈 목록.

    빈 목록이 "아무도 안 열었다" 를 보장하지는 않는다. 그래서 확인 실패를 통과로
    처리하되, 그 사실을 호출부가 사용자에게 알리게 한다.
    """
    try:
        out = subprocess.run(
            ["lsof", "-t", "+D", str(chroma_path)],
            capture_output=True,
            text=True,
            timeout=15,
        )
    except (FileNotFoundError, subprocess.SubprocessError):
        return []
    # ⚠ 자기 자신을 빼지 않으면 스스로를 감지해 항상 실행을 거부한다. 이 스크립트도
    # 같은 디렉토리를 열기 때문이다 — 실제로 한 번 걸렸다.
    me = str(os.getpid())
    return [pid for pid in out.stdout.split() if pid.strip() and pid.strip() != me]


def _load_words() -> list[dict]:
    if not CUSTOM_WORDS_PATH.exists():
        raise SystemExit(f"단어 파일이 없습니다: {CUSTOM_WORDS_PATH}")
    data = json.loads(CUSTOM_WORDS_PATH.read_text(encoding="utf-8"))
    words = data.get("words", [])
    if not words:
        raise SystemExit("추가할 단어가 없습니다.")
    return words


def _validate(entry: dict) -> tuple[str, list[int], int]:
    """번호가 6/45 규칙 안에 있는지 여기서 막는다.

    잘못된 번호가 사전에 들어가면 조합 생성 단계에서 조용히 걸러져(1~45 범위 검사)
    "왜 이 단어만 번호가 안 나오지" 라는 증상으로만 드러난다. 넣는 순간에 죽는 편이 낫다.
    """
    word = str(entry.get("word", "")).strip()
    if not word:
        raise SystemExit(f"단어가 비었습니다: {entry}")

    numbers = [int(n) for n in entry.get("lotto_number", [])]
    if not numbers:
        raise SystemExit(f"'{word}' 에 번호가 없습니다.")
    if any(not (1 <= n <= 45) for n in numbers):
        raise SystemExit(f"'{word}' 의 번호가 1~45 를 벗어납니다: {numbers}")
    if len(set(numbers)) != len(numbers):
        raise SystemExit(f"'{word}' 의 번호에 중복이 있습니다: {numbers}")

    return word, sorted(numbers), int(entry.get("importance", 0))


def main() -> None:
    parser = argparse.ArgumentParser(description="꿈 사전에 사용자 지정 단어를 넣는다")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="실제로 사전에 쓴다. 없으면 무엇이 바뀔지만 보여준다",
    )
    parser.add_argument(
        "--chroma-path",
        type=Path,
        default=None,
        help="사전 경로. 기본값은 CHROMA_DB_PATH 설정 (사본으로 시험할 때만 쓴다)",
    )
    args = parser.parse_args()

    chroma_path = args.chroma_path or _chroma_path()
    entries = [_validate(e) for e in _load_words()]

    # 쓰기 전에, 그리고 **사전을 열기 전에** 확인한다. 열고 나서 확인하면 자기 자신이
    # 잡혀 항상 거부된다.
    if args.apply:
        holders = _holders(chroma_path)
        if holders:
            raise SystemExit(
                f"⚠ 다른 프로세스가 사전을 열어 두고 있습니다 (PID {', '.join(holders)}).\n"
                "   백엔드 서버를 멈추고 다시 실행하세요. HNSW 인덱스 파일을 동시에 만지면\n"
                "   복구할 수 없는 사전이 상할 수 있습니다."
            )

    import chromadb

    from app.dream.searcher import COLLECTION_NAME, MODEL_NAME

    client = chromadb.PersistentClient(path=str(chroma_path))
    collection = client.get_or_create_collection(name=COLLECTION_NAME)
    before = collection.count()

    print(f"사전 경로 : {chroma_path}")
    print(f"현재 단어 : {before:,}개\n")

    for word, numbers, importance in entries:
        existing = collection.get(ids=[word])
        state = "덮어씀" if existing["ids"] else "새로 추가"
        print(f"  [{state}] {word} → {numbers} (importance={importance})")
        if existing["ids"]:
            print(f"            기존 값: {existing['metadatas'][0]}")

    if not args.apply:
        print("\n--apply 를 붙이지 않아 아무것도 쓰지 않았습니다.")
        return

    # 모델 로딩은 여기서 처음 한다. 확인만 하려는 사람이 20초를 기다릴 이유가 없다.
    print("\n임베딩 모델을 불러옵니다 (첫 실행은 20초쯤 걸립니다)...")
    from sentence_transformers import SentenceTransformer

    model = SentenceTransformer(MODEL_NAME)

    for word, numbers, importance in entries:
        embedding = model.encode(word).tolist()
        # upsert 라 두 번 돌려도 결과가 같다. 배포 절차에 넣을 수 있어야 한다.
        collection.upsert(
            ids=[word],
            documents=[word],
            embeddings=[embedding],
            # 메타데이터는 **문자열**로 넣는다 — 원본 4,802건이 전부 문자열이고
            # (`{'lotto_number': '[5, 33, 39]', 'importance': '4'}`), searcher 의
            # `_parse_lotto_number` 가 그 형식을 전제로 판다. 타입이 섞이면 이 단어만
            # 조용히 번호 없이 매칭된다.
            metadatas=[
                {"lotto_number": json.dumps(numbers), "importance": str(importance)}
            ],
        )
        print(f"  반영: {word} → {numbers}")

    print(f"\n완료. 단어 {before:,}개 → {collection.count():,}개")
    print("백엔드 서버를 다시 띄우면 검색에 반영됩니다 (사전은 기동 후 첫 요청에 로드됩니다).")


if __name__ == "__main__":
    main()
