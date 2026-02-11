from __future__ import annotations
import os
from .mock import MockEmail, MockCalendar, MockSlack, MockNotion


def get_email():
    if os.getenv("GMAIL_PROVIDER", "mock") == "mock":
        return MockEmail()
    try:
        from .gmail import GmailProvider

        return GmailProvider()
    except Exception:
        return MockEmail()


def get_calendar():
    if os.getenv("CALENDAR_PROVIDER", "mock") == "mock":
        return MockCalendar()
    try:
        from .gcal import GCalProvider

        return GCalProvider()
    except Exception:
        return MockCalendar()


def get_slack():
    if os.getenv("SLACK_PROVIDER", "mock") == "mock":
        return MockSlack()
    try:
        from .slack import SlackReal

        return SlackReal()
    except Exception:
        return MockSlack()


def get_notion():
    if os.getenv("NOTION_PROVIDER", "mock") == "mock":
        return MockNotion()
    try:
        from .notion import NotionReal

        return NotionReal()
    except Exception:
        return MockNotion()
