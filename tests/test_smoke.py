import asyncio
from odysseus.types import RunRequest
from odysseus.planner import run_plan
from odysseus.agent import bootstrap_tools

def test_smoke():
    bootstrap_tools()
    res = asyncio.run(run_plan(RunRequest(goal="List my todos", dry_run=True)))
    assert res.goal
    assert res.steps
