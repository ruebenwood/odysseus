from __future__ import annotations
from typing import Dict, Any, List
import re
from sqlmodel import SQLModel, Field, create_engine, Session, select
from ..config import settings

_engine = create_engine(f"sqlite:///{settings.db_url}", echo=False)


class KBChunk(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    doc_id: str
    text: str


SQLModel.metadata.create_all(_engine)


def _tok(s: str) -> list[str]:
    return [t for t in re.findall(r"[a-zA-Z0-9]+", s.lower()) if len(t) > 1]


def _tf(words: list[str]):
    d = {}
    for w in words:
        d[w] = d.get(w, 0) + 1
    n = len(words) or 1
    return {k: v / n for k, v in d.items()}


def _vec(s: str):
    return _tf(_tok(s))


def _cos(a: dict, b: dict) -> float:
    keys = set(a) | set(b)
    dot = sum(a.get(k, 0) * b.get(k, 0) for k in keys)
    na = (sum(v * v for v in a.values()) ** 0.5) or 1.0
    nb = (sum(v * v for v in b.values()) ** 0.5) or 1.0
    return dot / (na * nb)


async def ingest(doc_id: str, text: str, chunk_size: int = 800):
    with Session(_engine) as s:
        for i in range(0, len(text), chunk_size):
            ch = KBChunk(doc_id=doc_id, text=text[i : i + chunk_size])
            s.add(ch)
        s.commit()
    return {"ok": True}


async def search(query: str, k: int = 5) -> List[Dict[str, Any]]:
    qv = _vec(query)
    with Session(_engine) as s:
        rows = list(s.exec(select(KBChunk)))
    scored = [(r, _cos(qv, _vec(r.text))) for r in rows]
    scored.sort(key=lambda x: x[1], reverse=True)
    return [
        {"doc_id": r.doc_id, "text": r.text, "score": float(sc)}
        for r, sc in scored[:k]
    ]


class KBTool:
    name = "kb"
    description = "Knowledge base: ingest/search text for RAG."
    schema = {
        "type": "object",
        "properties": {
            "op": {"type": "string", "enum": ["ingest", "search"]},
            "doc_id": {"type": "string"},
            "text": {"type": "string"},
            "query": {"type": "string"},
        },
        "required": ["op"],
    }

    async def run(self, **kwargs) -> Dict[str, Any]:
        if kwargs["op"] == "ingest":
            return await ingest(kwargs.get("doc_id", "doc"), kwargs.get("text", ""))
        if kwargs["op"] == "search":
            return {"ok": True, "results": await search(kwargs.get("query", ""))}
        return {"ok": False, "error": "bad_op"}
