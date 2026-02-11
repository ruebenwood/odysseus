from __future__ import annotations
from typing import List, Dict, Any
import json, asyncio
from .types import Message, Step, RunRequest, RunResult
from .config import settings
from .memory import recall, memorize
from .tools import get_tool, list_tools
from . import llm

SYSTEM_HINT = (
"Role: helpful executive assistant.\n"
"Use tools when necessary. Think step-by-step. Prefer scheduling emails and proposing slots.\n"
"Finish with DONE + concise result."
)

def _format_context(goal: str, messages: List[Message]) -> List[Dict[str, str]]:
    sys = {"role":"system","content": SYSTEM_HINT}
    user = {"role":"user","content": f"Goal: {goal}"}
    rest = [m.model_dump() for m in messages]
    return [sys, user] + rest

async def _ask_llm(context: List[Dict[str, str]], tools: List[Dict[str, Any]]) -> str:
    # Delegates to either the bridge or OpenAI backend, returning a single text blob.
    return await llm.ask(context, tools)

def _parse_llm(text: str) -> Step:
    # Convention: lines starting with THOUGHT:, ACTION:{"name":..}, OBSERVATION:, DONE:
    if "DONE:" in text:
        return Step(kind="DONE", content=text.split("DONE:",1)[1].strip())
    if "ACTION:" in text:
        try:
            j = text.split("ACTION:",1)[1].strip()
            data = json.loads(j)
            return Step(kind="ACTION", content="invoke", tool={"name": data["name"], "args": data.get("args",{})})
        except Exception:
            return Step(kind="THOUGHT", content=text)
    if "OBSERVATION:" in text:
        return Step(kind="OBSERVATION", content=text.split("OBSERVATION:",1)[1].strip())
    return Step(kind="THOUGHT", content=text.strip())

async def run_plan(req: RunRequest) -> RunResult:
    steps: List[Step] = []
    used: List[str] = []
    context = _format_context(req.goal, req.context)

    # memory priming
    mem = recall(req.goal, k=3)
    if mem:
        context.append({"role":"system","content": "Relevant memory:\n" + "\n".join(f"- {m.text}" for m in mem)})

    for _ in range(settings.max_steps):
        llm_text = await _ask_llm(context, list_tools())
        step = _parse_llm(llm_text)
        steps.append(step)

        if step.kind == "THOUGHT":
            context.append({"role":"assistant","content": f"THOUGHT:{step.content}"})
            continue

        if step.kind == "ACTION":
            tool = get_tool(step.tool["name"])
            used.append(tool.name)
            if req.dry_run:
                obs = {"ok": True, "dry_run": True, "tool": tool.name, "args": step.tool["args"]}
            else:
                obs = await tool.run(**step.tool["args"])
            obs_text = json.dumps(obs)[:2000]
            context.append({"role":"assistant","content": f"ACTION:{json.dumps(step.tool)}"})
            context.append({"role":"user","content": f"OBSERVATION:{obs_text}"})
            steps.append(Step(kind="OBSERVATION", content=obs_text))
            memorize("observation", f"{tool.name}:{obs_text}")
            continue

        if step.kind == "DONE":
            out = step.content
            memorize("result", out)
            return RunResult(goal=req.goal, steps=steps, output=out, used_tools=list(dict.fromkeys(used)))

    # fallback
    out = "Reached step limit without DONE."
    return RunResult(goal=req.goal, steps=steps, output=out, used_tools=list(dict.fromkeys(used)))
