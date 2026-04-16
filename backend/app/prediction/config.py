"""로또 번호 예측 시스템 설정."""

NUMBER_RANGE = (1, 45)

HOT_RECENT_ROUNDS = 20

# 웹 응답성을 고려해 기본 5만으로 하향 (CLI/배치 시 확장 가능)
MONTE_CARLO_SIMULATIONS = 50_000

WEIGHTS = {
    "frequency": 0.25,
    "delay": 0.25,
    "hot_cold": 0.30,
    "pattern": 0.20,
}

RECOMMEND_SETS = 5

MIN_REQUIRED_ROUNDS = 50
