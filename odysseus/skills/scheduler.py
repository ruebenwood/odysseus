from __future__ import annotations
from typing import Dict, Any
from ..types import Tool
from ..providers import get_calendar


class SchedulerTool(Tool):
    name = "scheduler"
    description = (
        "Email-driven scheduling: propose availability from calendar, confirm time, create invite."
    )
    schema = {
        "type": "object",
        "properties": {
            "op": {"type": "string", "enum": ["propose", "book"]},
            "duration_min": {"type": "integer"},
            "day_range": {"type": "integer"},
            "attendees": {"type": "array", "items": {"type": "string"}},
            "title": {"type": "string"},
            "start": {"type": "string"},
        },
        "required": ["op"],
    }

    async def run(self, **kwargs) -> Dict[str, Any]:
        cal = get_calendar()
        if kwargs.get("op") == "propose":
            dur = int(kwargs.get("duration_min", 30))
            days = int(kwargs.get("day_range", 7))
            slots = await cal.find_slots(dur, days)
            text = "Here are some times that work for me:\n" + "\n".join(
                f"- {s}" for s in slots[:5]
            )
            return {"ok": True, "slots": slots, "reply_text": text}
        if kwargs.get("op") == "book":
            title = kwargs.get("title") or "Meeting"
            start = kwargs.get("start")
            attendees = kwargs.get("attendees") or []
            if not start:
                return {"ok": False, "error": "start_required"}
            evt = await cal.create_event(title, start, attendees)
            return {"ok": True, **evt}
        return {"ok": False, "error": "bad_op"}
