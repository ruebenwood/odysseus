from __future__ import annotations
from typing import Dict, Any, List
from ..types import Tool

class EmailTool(Tool):
    name = "email"
    description = "Email operations: draft, send, search (mock provider)."
    schema = {
        "type":"object",
        "properties":{
            "op":{"type":"string","enum":["draft","send","search"]},
            "to":{"type":"string"},
            "subject":{"type":"string"},
            "body":{"type":"string"},
            "query":{"type":"string"}
        },
        "required":["op"]
    }
    _inbox: List[Dict[str, Any]] = [
        {"from":"jane@example.com","subject":"Coffee next week?","body":"Are you free Tue/Wed 10-2?"},
        {"from":"team@acme.com","subject":"SOW v2","body":"Attached the new scope."},
    ]
    async def run(self, **kwargs) -> Dict[str, Any]:
        op = kwargs.get("op")
        if op == "search":
            q = (kwargs.get("query") or "").lower()
            hits = [m for m in self._inbox if q in m["subject"].lower() or q in m["body"].lower()]
            return {"ok": True, "results": hits}
        if op == "draft":
            return {"ok": True, "draft": {
                "to": kwargs.get("to",""),
                "subject": kwargs.get("subject",""),
                "body": kwargs.get("body","")}}
        if op == "send":
            # why: mock only; real provider would call API/SMTP
            return {"ok": True, "message_id": "mock-123"}
        return {"ok": False, "error": "bad_op"}
