"""궁합번호 — 역대 데이터에서 함께 등장한 빈도가 높은 번호 쌍을 축으로 조합 구성."""
from __future__ import annotations

from typing import List, Optional, Sequence

import numpy as np

NUMS = np.arange(1, 46)


def _build_matrix(num_rows: Sequence[tuple]) -> np.ndarray:
    mat = np.zeros((46, 46), dtype=np.int32)
    for row in num_rows:
        r = list(row)
        for i, a in enumerate(r):
            for b in r[i + 1:]:
                mat[a, b] += 1
                mat[b, a] += 1
    return mat


def top_pair(mat: np.ndarray) -> tuple:
    # (a, b, count) with a < b
    upper = np.triu(mat, k=1)
    idx = int(np.argmax(upper))
    a, b = divmod(idx, 46)
    return int(a), int(b), int(upper[a, b])


def generate(
    num_rows: Sequence[tuple], *, sets: int, seed: Optional[int] = None
) -> List[dict]:
    rng = np.random.default_rng(seed)
    mat = _build_matrix(num_rows)

    # 시작 번호 선택 가중치 = 해당 번호의 전체 궁합 합
    row_sums = mat[1:46, 1:46].sum(axis=1).astype(float) + 1e-6
    start_probs = row_sums / row_sums.sum()

    results: List[dict] = []
    for _ in range(sets):
        start = int(rng.choice(NUMS, p=start_probs))
        selected = [start]
        while len(selected) < 6:
            scores = mat[selected].sum(axis=0).astype(float)
            # 이미 선택된 번호 제외
            for s in selected:
                scores[s] = -1
            scores[0] = -1  # index 0 무시
            # 상위 5개 후보 중에서 가중 샘플링 → 매번 같은 답 방지
            top_idx = np.argsort(scores)[::-1][:5]
            top_vals = scores[top_idx]
            top_vals = np.clip(top_vals, 1e-6, None)
            probs = top_vals / top_vals.sum()
            pick = int(rng.choice(top_idx, p=probs))
            selected.append(pick)
        results.append({
            "numbers": sorted(selected),
            "source": "pair_affinity",
        })

    a, b, cnt = top_pair(mat)
    return {
        "sets": results,
        "meta": {
            "top_pair": {"a": a, "b": b, "count": cnt},
            "description": "역대 함께 등장한 횟수가 많은 '단짝 번호' 를 축으로 조합 구성",
        },
    }
