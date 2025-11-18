from __future__ import annotations
from .tools import register
from .tools.todo import TodoTool
from .skills.email import EmailTool
from .skills.calendar import CalendarTool
from .skills.web import WebTool

def bootstrap_tools():
    register(TodoTool())
    register(EmailTool())
    register(CalendarTool())
    register(WebTool())
