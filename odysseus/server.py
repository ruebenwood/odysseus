from __future__ import annotations
import asyncio
from fastapi import FastAPI, Depends, HTTPException, Header
from fastapi.responses import JSONResponse
from typing import Optional
from .config import settings
from .types import RunRequest
from .planner import run_plan
from .tools import list_tools
from .agent import bootstrap_tools
from .automations import scheduler_loop

app = FastAPI(title="Odysseus Agent API")
bootstrap_tools()
_stop = asyncio.Event()

def _auth(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "missing_bearer")
    tok = authorization.split(" ",1)[1]
    if tok != settings.console_password:
        raise HTTPException(403, "bad_token")

@app.on_event("startup")
async def _start():
    asyncio.create_task(scheduler_loop(_stop))

@app.on_event("shutdown")
async def _stop_loop():
    _stop.set()

@app.get("/v1/tools")
async def get_tools(auth: None = Depends(_auth)):
    return JSONResponse(list_tools())

@app.post("/v1/agents/run")
async def run_agent(req: RunRequest, auth: None = Depends(_auth)):
    res = await run_plan(req)
    return JSONResponse(res.model_dump())
