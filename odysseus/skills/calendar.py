from __future__ import annotations
from typing import Dict, Any, List
from datetime import datetime, timedelta

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
    _events: List[Dict[str, Any]] = []

    async def run(self, **kwargs) -> Dict[str, Any]:
        op = kwargs.get("op")
        now = datetime.now().replace(minute=0, second=0, microsecond=0)
        if op == "find_slots":
            # naive: every weekday 10:00–16:00, step 60m, skip existing
            dur = int(kwargs.get("duration_min", 30))
            days = int(kwargs.get("day_range", 7))
            slots = []
            for d in range(days):
                day = now + timedelta(days=d)
                if day.weekday() >= 5: continue
                for h in range(10, 16):
                    slot = day.replace(hour=h)
                    clash = any(abs((slot - datetime.fromisoformat(e["start"])).total_seconds()) < 3600
                                for e in self._events)
                    if not clash:
                        slots.append(slot.isoformat())
            return {"ok": True, "slots": slots[:10], "duration_min": dur}
        if op == "create_event":
            title = kwargs.get("title") or "Meeting"
            start = kwargs.get("start")
            if not start: return {"ok": False, "error":"start_required"}
            self._events.append({"title": title, "start": start})
            return {"ok": True, "event": {"title": title, "start": start}}
        return {"ok": False, "error": "bad_op"}
