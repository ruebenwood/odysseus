from __future__ import annotations
from typing import Dict, Any, List
from pydantic import BaseModel
from ..types import Tool

_registry: Dict[str, Tool] = {}

def register(tool: Tool):
    _registry[tool.name] = tool

def list_tools() -> List[Dict[str, Any]]:
    return [{"name": t.name, "description": t.description, "schema": t.schema} for t in _registry.values()]

def get_tool(name: str) -> Tool:
    if name not in _registry:
        raise KeyError(f"tool_not_found: {name}")
    return _registry[name]
