from __future__ import annotations
from typing import Dict, Any
from ..types import Tool
from ..providers import get_email

class EmailTool(Tool):
    name = "email"
    description = "Email operations: draft, send, search (provider-backed)."
    schema = {
        "type":"object",
        "properties":{
            "op":{"type":"string","enum":["draft","send","search","thread"]},
            "to":{"type":"string"},
            "subject":{"type":"string"},
            "body":{"type":"string"},
            "query":{"type":"string"},
            "thread_id":{"type":"string"}
        },
        "required":["op"]
    }
    async def run(self, **kwargs) -> Dict[str, Any]:
        op = kwargs.get("op")
        provider = get_email()
        if op == "search":
            q = (kwargs.get("query") or "").strip()
            hits = await provider.search(q)
            return {"ok": True, "results": hits}
        if op == "thread":
            thread_id = kwargs.get("thread_id") or ""
            if not thread_id:
                return {"ok": False, "error": "thread_id_required"}
            return await provider.thread(thread_id)
        if op == "draft":
            return {"ok": True, "draft": {
                "to": kwargs.get("to",""),
                "subject": kwargs.get("subject",""),
                "body": kwargs.get("body","")}}
        if op == "send":
            return await provider.send(
                kwargs.get("to", ""),
                kwargs.get("subject", ""),
                kwargs.get("body", ""),
            )
        return {"ok": False, "error": "bad_op"}
