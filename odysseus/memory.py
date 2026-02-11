from __future__ import annotations
from typing import List, Optional
import math, re
from sqlmodel import SQLModel, Field, create_engine, Session, select
from .config import settings

class MemoryItem(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    kind: str
    text: str
    meta: str = ""

_engine = create_engine(f"sqlite:///{settings.db_url}", echo=False)
SQLModel.metadata.create_all(_engine)

def _tokenize(s: str) -> List[str]:
    return [t for t in re.findall(r"[a-zA-Z0-9]+", s.lower()) if len(t) > 1]

def _tf(words: List[str]):
    tf = {}
    for w in words: tf[w] = tf.get(w, 0) + 1
    n = len(words) or 1
    return {k: v/n for k, v in tf.items()}

def _vec(s: str):
    words = _tokenize(s)
    return _tf(words)

def _cos(a: dict, b: dict) -> float:
    keys = set(a) | set(b)
    dot = sum(a.get(k, 0) * b.get(k, 0) for k in keys)
    na = math.sqrt(sum(v*v for v in a.values())) or 1.0
    nb = math.sqrt(sum(v*v for v in b.values())) or 1.0
    return dot / (na*nb)

def memorize(kind: str, text: str, meta: str = "") -> int:
    with Session(_engine) as s:
        item = MemoryItem(kind=kind, text=text, meta=meta)
        s.add(item); s.commit(); s.refresh(item)
        return item.id or 0

def recall(query: str, kind: Optional[str] = None, k: int = 5) -> List[MemoryItem]:
    qv = _vec(query)
    with Session(_engine) as s:
        stmt = select(MemoryItem)
        if kind: stmt = stmt.where(MemoryItem.kind == kind)
        rows = list(s.exec(stmt))
    scored = [(r, _cos(qv, _vec(r.text))) for r in rows]
    scored.sort(key=lambda x: x[1], reverse=True)
    return [r for r,_ in scored[:k]]
