from __future__ import annotations
from typing import Dict, Any
class WebTool:
    name = "web"
    description = "Search/browse the web (mock, offline)."
    schema = {
        "type":"object",
        "properties":{
            "op":{"type":"string","enum":["search","browse"]},
            "query":{"type":"string"},
            "url":{"type":"string"}
        },
        "required":["op"]
    }
    async def run(self, **kwargs) -> Dict[str, Any]:
        op = kwargs.get("op")
        if op == "search":
            q = kwargs.get("query","")
            # why: offline deterministic stubs
            return {"ok": True, "results": [{"title":"Example result","url":"https://example.com","snippet":f"Info about {q}."}]}
        if op == "browse":
            url = kwargs.get("url","")
            return {"ok": True, "content": f"Mock page content for {url}"}
        return {"ok": False, "error": "bad_op"}
