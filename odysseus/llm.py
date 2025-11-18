from __future__ import annotations
import os, httpx, json
from typing import Any, Dict, List

LLM_KIND = os.getenv("ODYSSEUS_LLM", "bridge")  # bridge | openai
CODEX_URL = os.getenv("ODYSSEUS_CODEX_URL", "http://localhost:3000/api/codex")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")  # pick any chat model

# NOTE: The planner expects a plain string with these tags in the text:
# THOUGHT:..., ACTION:{"name":"tool","args":{...}}, OBSERVATION:..., DONE:...

SYSTEM_BRIDGE_HINT = (
    "Return tool calls as: ACTION:{\"name\":\"<tool>\",\"args\":{...}}. "
    "Reflect results, then finish with DONE:<concise answer>."
)

async def _bridge_ask(messages: List[Dict[str, str]], tools: List[Dict[str, Any]]) -> str:
    async with httpx.AsyncClient(timeout=30) as client:
        # The bridge is expected to accept this payload and respond with {"text": "..."}
        resp = await client.post(
            CODEX_URL,
            json={"messages": messages, "tools": tools, "hint": SYSTEM_BRIDGE_HINT},
        )
        resp.raise_for_status()
        data = resp.json()
        text = data.get("text")
        if not isinstance(text, str):
            # Defensive: normalize non-string into tagged fallback
            text = f"DONE: Unable to parse bridge response: {json.dumps(data)[:500]}"
        return text

async def _openai_ask(messages: List[Dict[str, str]], tools: List[Dict[str, Any]]) -> str:
    """
    Chat Completions adapter that **emits the same text contract** the planner/parser needs.
    We don't use function-calling to keep parser unchanged.
    """
    # Build a compact system nudge to force the tag format
    sys = {
        "role": "system",
        "content": (
            "You are a planner that outputs ONLY these tags: "
            "THOUGHT:, ACTION:{json}, OBSERVATION:, DONE:. "
            "When you must call a tool, output exactly one ACTION line with JSON {name,args}. "
            "Do not explain the JSON. After seeing OBSERVATION (from user), continue. "
            "Finish with DONE: once the goal is achieved. Be concise."
        ),
    }
    payload_msgs = [sys] + messages

    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }
    body = {
        "model": OPENAI_MODEL,
        "messages": payload_msgs,
        "temperature": float(os.getenv("ODYSSEUS_TEMPERATURE", "0.2")),
    }
    async with httpx.AsyncClient(timeout=60, base_url=OPENAI_BASE_URL) as client:
        r = await client.post("/v1/chat/completions", headers=headers, json=body)
        r.raise_for_status()
        j = r.json()
        text = (j.get("choices", [{}])[0].get("message", {}).get("content") or "").strip()
        if not text:
            text = "DONE: (empty model response)"
        return text

async def ask(messages: List[Dict[str, str]], tools: List[Dict[str, Any]]) -> str:
    if LLM_KIND == "openai":
        if not OPENAI_API_KEY:
            return "DONE: OPENAI_API_KEY missing for openai backend."
        return await _openai_ask(messages, tools)
    # default bridge
    return await _bridge_ask(messages, tools)
