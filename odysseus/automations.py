from __future__ import annotations
from typing import Optional, List
import asyncio
from datetime import datetime, timedelta
from sqlmodel import SQLModel, Field, Session, select, create_engine
from .config import settings
from .planner import run_plan
from .types import RunRequest

_engine = create_engine(f"sqlite:///{settings.db_url}", echo=False)

class Automation(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    cron: str  # "hourly", "daily"
    goal: str
    active: bool = True

SQLModel.metadata.create_all(_engine)

async def tick_once():
    now = datetime.now()
    with Session(_engine) as s:
        autos = list(s.exec(select(Automation).where(Automation.active == True)))
    to_run: List[Automation] = []
    for a in autos:
        if a.cron == "hourly" and now.minute == 0:
            to_run.append(a)
        if a.cron == "daily" and now.hour == 9 and now.minute == 0:
            to_run.append(a)
    for a in to_run:
        await run_plan(RunRequest(goal=a.goal, dry_run=False))

async def scheduler_loop(stop_event: asyncio.Event):
    # why: trivial scheduler; delegate real cron externally in prod
    while not stop_event.is_set():
        try:
            await tick_once()
        except Exception:
            pass
        await asyncio.sleep(60)
