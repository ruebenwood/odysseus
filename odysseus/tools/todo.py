from __future__ import annotations
from typing import Dict, Any
from pydantic import BaseModel, Field
from sqlmodel import SQLModel, Field as SField, Session, select
from ..config import settings
from sqlmodel import create_engine

_engine = create_engine(f"sqlite:///{settings.db_url}", echo=False)

class Todo(SQLModel, table=True):
    id: int | None = SField(default=None, primary_key=True)
    title: str
    done: bool = False

SQLModel.metadata.create_all(_engine)

class TodoTool:
    name = "todo"
    description = "Manage todos: add/list/complete"
    schema = {
        "type":"object",
        "properties":{
            "op":{"type":"string","enum":["add","list","complete"]},
            "title":{"type":"string"},
            "id":{"type":"integer"}
        },
        "required":["op"]
    }
    async def run(self, **kwargs) -> Dict[str, Any]:
        op = kwargs.get("op")
        with Session(_engine) as s:
            if op == "add":
                title = kwargs.get("title") or ""
                t = Todo(title=title); s.add(t); s.commit(); s.refresh(t)
                return {"ok": True, "id": t.id}
            if op == "list":
                rows = list(s.exec(select(Todo)))
                return {"ok": True, "items": [{"id": r.id, "title": r.title, "done": r.done} for r in rows]}
            if op == "complete":
                tid = int(kwargs.get("id", 0))
                t = s.get(Todo, tid)
                if not t: return {"ok": False, "error":"not_found"}
                t.done = True; s.add(t); s.commit()
                return {"ok": True}
        return {"ok": False, "error": "bad_op"}
