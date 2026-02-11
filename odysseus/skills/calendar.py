from __future__ import annotations
from typing import Dict, Any
from ..providers import get_calendar

class CalendarTool:
    name = "calendar"
    description = "Find/create calendar events (mock)."
    schema = {
        "type":"object",
        "properties":{
            "op":{"type":"string","enum":["find_slots","create_event"]},
            "who":{"type":"string"},
            "duration_min":{"type":"integer"},
            "day_range":{"type":"integer"},
            "title":{"type":"string"},
            "start":{"type":"string"}
        },
        "required":["op"]
    }
    async def run(self, **kwargs) -> Dict[str, Any]:
        op = kwargs.get("op")
        cal = get_calendar()
        if op == "find_slots":
            dur = int(kwargs.get("duration_min", 30))
            days = int(kwargs.get("day_range", 7))
            slots = await cal.find_slots(dur, days)
            return {"ok": True, "slots": slots[:10], "duration_min": dur}
        if op == "create_event":
            title = kwargs.get("title") or "Meeting"
            start = kwargs.get("start")
            if not start: return {"ok": False, "error":"start_required"}
            evt = await cal.create_event(title, start, kwargs.get("attendees") or [])
            return evt
        return {"ok": False, "error": "bad_op"}
