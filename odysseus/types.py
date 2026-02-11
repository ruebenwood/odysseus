from __future__ import annotations
from typing import Literal, Optional, Dict, Any, List, Protocol
from pydantic import BaseModel, Field

Role = Literal["user", "assistant", "system"]

class Message(BaseModel):
    role: Role
    content: str

class AgentConfig(BaseModel):
    model: str = "bridge"  # routed through ODYSSEUS_CODEX_URL
    max_steps: int = 8
    temperature: float = 0.2

class ToolInput(BaseModel):
    name: str
    args: Dict[str, Any] = Field(default_factory=dict)

class Step(BaseModel):
    kind: Literal["THOUGHT", "ACTION", "OBSERVATION", "DONE"]
    content: str
    tool: Optional[ToolInput] = None

class RunRequest(BaseModel):
    goal: str
    dry_run: bool = False
    context: List[Message] = Field(default_factory=list)

class RunResult(BaseModel):
    goal: str
    steps: List[Step]
    output: str
    used_tools: List[str] = Field(default_factory=list)

class Tool(Protocol):
    name: str
    description: str
    schema: Dict[str, Any]
    async def run(self, **kwargs) -> Dict[str, Any]: ...
