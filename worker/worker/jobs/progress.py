"""잡 진행 상태를 담는 가변 객체.

잡 함수가 수집 건수를 반환값으로만 알리면, 예외가 던져지는 순간 그 값이 사라진다.
로또 잡이 5회차를 커밋하고 6번째에서 죽었다면 collect_job_log 에는 5가 남아야 한다.
0 이 남으면 이력이 거짓말을 하고, 다음 실행이 어디서부터 이어받는지 사람이 알 수 없다.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class JobProgress:
    collected: int = 0

    # 단계별 통과 건수. collect_job_log.stat_json 에 그대로 들어간다.
    # collected 만으로는 **왜 0건인지** 알 수 없다 — 검색이 200건을 물어왔는데
    # 필터가 전부 걸렀는지, API 가 0건을 줬는지, 이미 다 저장된 것이었는지가
    # 구분되지 않는다. 잡마다 키가 다르고 스키마를 강제하지 않는다.
    stat: dict[str, int] = field(default_factory=dict)
