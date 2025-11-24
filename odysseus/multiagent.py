from __future__ import annotations
from .types import RunRequest, RunResult
from .planner import run_plan


async def run_team(req: RunRequest) -> RunResult:
    goal = req.goal.lower()
    if "schedule" in goal or "meeting" in goal:
        sub = await run_plan(
            RunRequest(
                goal="Propose meeting times and draft an email reply", dry_run=req.dry_run
            )
        )
        final = await run_plan(
            RunRequest(goal="Confirm final time and send invites", dry_run=req.dry_run)
        )
        sub.steps.extend(final.steps)
        sub.output = final.output
        sub.used_tools.extend(t for t in final.used_tools if t not in sub.used_tools)
        return sub
    return await run_plan(req)
