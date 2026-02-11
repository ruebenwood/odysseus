from __future__ import annotations
from typing import Optional, List
import asyncio
from datetime import datetime
from sqlmodel import SQLModel, Field, Session, select, create_engine
from .config import settings
from .planner import run_plan
from .types import RunRequest
from .providers import get_email

_engine = create_engine(f"sqlite:///{settings.db_url}", echo=False)

class Automation(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    trigger: str  # "hourly", "daily@09:00", "inbox_query:subject:Demo"
    goal: str
    active: bool = True

SQLModel.metadata.create_all(_engine)

def _cron_match(trigger: str, now: datetime) -> bool:
    if trigger == "hourly":
        return now.minute == 0
    if trigger.startswith("daily@"):
        hhmm = trigger.split("@", 1)[1]
        return now.strftime("%H:%M") == hhmm
    return False


async def tick_once():
    now = datetime.now()
    with Session(_engine) as s:
        autos = list(s.exec(select(Automation).where(Automation.active == True)))
    for a in autos:
        ran = False
        if _cron_match(a.trigger, now):
            ran = True
        if a.trigger.startswith("inbox_query:"):
            _, _, q = a.trigger.partition(":")
            email = get_email()
            hits = await email.search(q)
            ran = bool(hits)
        if ran:
            await run_plan(RunRequest(goal=a.goal, dry_run=False))

async def scheduler_loop(stop_event: asyncio.Event):
    # why: trivial scheduler; delegate real cron externally in prod
    while not stop_event.is_set():
        try:
            await tick_once()
        except Exception:
            pass
        await asyncio.sleep(60)
