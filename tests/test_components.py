import asyncio
from odysseus.agent import bootstrap_tools
from odysseus.types import RunRequest
from odysseus import planner


def test_kb_ingest_and_search():
    from odysseus.skills import kb as KB

    text = "Lindy-like agents handle email scheduling and knowledge search."
    asyncio.run(KB.ingest("doc1", text))
    res = asyncio.run(KB.search("scheduling"))
    assert res and res[0]["score"] > 0


def test_scheduler_mock_flow(monkeypatch):
    bootstrap_tools()

    async def fake_llm(context, tools):
        for message in context:
            if message["role"] == "user" and "OBSERVATION:" in message["content"]:
                return "DONE: Email sent with availabilities."
        return 'ACTION:{"name":"scheduler","args":{"op":"propose","duration_min":30,"day_range":3}}'

    monkeypatch.setattr(planner, "_ask_llm", fake_llm)
    res = asyncio.run(planner.run_plan(RunRequest(goal="Schedule a meeting with Jane", dry_run=True)))
    assert res.output or any(step.kind == "DONE" for step in res.steps)
