LOTTO_RESULTS_DDL = """
CREATE TABLE IF NOT EXISTS lotto_results (
    round_no            INTEGER PRIMARY KEY,
    draw_date           TEXT    NOT NULL,
    num1                INTEGER NOT NULL,
    num2                INTEGER NOT NULL,
    num3                INTEGER NOT NULL,
    num4                INTEGER NOT NULL,
    num5                INTEGER NOT NULL,
    num6                INTEGER NOT NULL,
    bonus               INTEGER NOT NULL,
    total_sell_amount   INTEGER,
    first_win_amount    INTEGER,
    first_winner_count  INTEGER,
    first_accum_amount  INTEGER,
    created_at          TEXT    NOT NULL
);
"""

CRAWL_LOGS_DDL = """
CREATE TABLE IF NOT EXISTS crawl_logs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at      TEXT    NOT NULL,
    finished_at     TEXT,
    status          TEXT    NOT NULL,
    start_round     INTEGER,
    end_round       INTEGER,
    collected_count INTEGER NOT NULL DEFAULT 0,
    error_message   TEXT
);
"""

INDEXES_DDL = [
    "CREATE INDEX IF NOT EXISTS idx_lotto_results_draw_date ON lotto_results(draw_date);",
    "CREATE INDEX IF NOT EXISTS idx_crawl_logs_started_at ON crawl_logs(started_at DESC);",
]
