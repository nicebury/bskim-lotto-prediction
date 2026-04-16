from contextlib import asynccontextmanager
from typing import AsyncIterator

import aiosqlite

from .config import settings
from .models import CRAWL_LOGS_DDL, INDEXES_DDL, LOTTO_RESULTS_DDL


async def init_db() -> None:
    settings.DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    async with aiosqlite.connect(settings.DB_PATH) as db:
        # WSL + NTFS 마운트에서 WAL 사이드카 파일이 Windows 측 락에 걸리는 문제 회피.
        # 로컬 단일 프로세스 사용이므로 DELETE 저널 모드로 충분함.
        await db.execute("PRAGMA journal_mode=DELETE;")
        await db.execute("PRAGMA foreign_keys=ON;")
        await db.execute(LOTTO_RESULTS_DDL)
        await db.execute(CRAWL_LOGS_DDL)
        for stmt in INDEXES_DDL:
            await db.execute(stmt)
        await db.commit()


@asynccontextmanager
async def get_db() -> AsyncIterator[aiosqlite.Connection]:
    async with aiosqlite.connect(settings.DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        await db.execute("PRAGMA foreign_keys=ON;")
        yield db
