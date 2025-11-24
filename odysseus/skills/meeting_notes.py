from __future__ import annotations
from typing import Dict, Any
from ..types import Tool


class MeetingNotesTool(Tool):
    name = "meeting_notes"
    description = "Summarize a provided transcript into notes and action items."
    schema = {
        "type": "object",
        "properties": {"transcript": {"type": "string"}},
        "required": ["transcript"],
    }

    async def run(self, **kwargs) -> Dict[str, Any]:
        transcript = kwargs.get("transcript", "")
        actions = [
            line.strip("- ").strip()
            for line in transcript.splitlines()
            if line.strip().lower().startswith(("[ai", "todo", "- [ai", "- [todo"))
        ]
        summary = transcript[:500] + ("..." if len(transcript) > 500 else "")
        return {"ok": True, "summary": summary, "actions": actions}
