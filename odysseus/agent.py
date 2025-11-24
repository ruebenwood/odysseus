from __future__ import annotations
from .tools import register
from .tools.todo import TodoTool
from .skills.email import EmailTool
from .skills.calendar import CalendarTool
from .skills.web import WebTool
from .skills.scheduler import SchedulerTool
from .skills.kb import KBTool
from .skills.meeting_notes import MeetingNotesTool

def bootstrap_tools():
    register(TodoTool())
    register(EmailTool())
    register(CalendarTool())
    register(WebTool())
    register(SchedulerTool())
    register(KBTool())
    register(MeetingNotesTool())
