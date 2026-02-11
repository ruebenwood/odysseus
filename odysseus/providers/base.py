from __future__ import annotations
from typing import Protocol, Dict, Any, List


class EmailProvider(Protocol):
    async def search(self, query: str) -> List[Dict[str, Any]]: ...

    async def send(self, to: str, subject: str, body: str) -> Dict[str, Any]: ...

    async def thread(self, thread_id: str) -> Dict[str, Any]: ...


class CalendarProvider(Protocol):
    async def find_slots(self, duration_min: int, day_range: int) -> List[str]: ...

    async def create_event(
        self, title: str, start_iso: str, attendees: list[str]
    ) -> Dict[str, Any]: ...


class SlackProvider(Protocol):
    async def post_message(self, channel: str, text: str) -> Dict[str, Any]: ...

    async def dm(self, user: str, text: str) -> Dict[str, Any]: ...


class NotionProvider(Protocol):
    async def create_page(
        self, title: str, content: str, db: str | None = None
    ) -> Dict[str, Any]: ...

    async def update_page(self, page_id: str, content: str) -> Dict[str, Any]: ...
