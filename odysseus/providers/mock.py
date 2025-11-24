from __future__ import annotations
from typing import Dict, Any, List


class MockEmail:
    _inbox = [
        {
            "id": "t1",
            "from": "jane@example.com",
            "subject": "Meeting next week",
            "body": "Tue/Wed 10-2?",
        },
        {
            "id": "t2",
            "from": "sales@acme.com",
            "subject": "Demo",
            "body": "Can we book 30m?",
        },
    ]

    async def search(self, query: str) -> List[Dict[str, Any]]:
        q = query.lower()
        return [
            m
            for m in self._inbox
            if q in m["subject"].lower() or q in m["body"].lower()
        ]

    async def send(self, to: str, subject: str, body: str) -> Dict[str, Any]:
        return {"ok": True, "to": to, "subject": subject, "id": "eml-1"}

    async def thread(self, thread_id: str) -> Dict[str, Any]:
        return {
            "id": thread_id,
            "messages": [m for m in self._inbox if m["id"] == thread_id],
        }


class MockCalendar:
    async def find_slots(self, duration_min: int, day_range: int) -> List[str]:
        from datetime import datetime, timedelta

        now = datetime.now().replace(minute=0, second=0, microsecond=0)
        slots = []
        for d in range(day_range):
            day = now + timedelta(days=d)
            if day.weekday() >= 5:
                continue
            for h in (10, 11, 14):
                slots.append(day.replace(hour=h).isoformat())
        return slots[:10]

    async def create_event(
        self, title: str, start_iso: str, attendees: list[str]
    ) -> Dict[str, Any]:
        return {
            "ok": True,
            "event": {"title": title, "start": start_iso, "attendees": attendees},
        }


class MockSlack:
    async def post_message(self, channel: str, text: str) -> Dict[str, Any]:
        return {"ok": True, "channel": channel, "text": text}

    async def dm(self, user: str, text: str) -> Dict[str, Any]:
        return {"ok": True, "user": user, "text": text}


class MockNotion:
    async def create_page(
        self, title: str, content: str, db: str | None = None
    ) -> Dict[str, Any]:
        return {"ok": True, "id": "page_1", "title": title}

    async def update_page(self, page_id: str, content: str) -> Dict[str, Any]:
        return {"ok": True, "id": page_id}
