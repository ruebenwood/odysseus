from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Iterable, Sequence

from .tools import AgentMemory, MathTool, TodoTool, Tool, ToolResult


@dataclass
class Interaction:
    """A single exchange captured by the agent."""

    timestamp: datetime
    prompt: str
    analysis: str
    action: str
    result: str
    tool_result: ToolResult | None = None


@dataclass
class Agent:
    """Simple, extensible agent with pluggable tools."""

    tools: Sequence[Tool] = field(default_factory=lambda: (MathTool(), TodoTool()))
    memory: AgentMemory = field(default_factory=lambda: AgentMemory(todo_items=[]))
    history: list[Interaction] = field(default_factory=list)

    def handle(self, message: str) -> Interaction:
        """Process a user message and return the interaction record."""

        analysis = self._analyze(message)
        tool = self._select_tool(message)
        tool_result: ToolResult | None = None
        action_summary = "No specific action taken; provided guidance."
        result_text = self._fallback_response(analysis)

        if tool:
            tool_result = tool.run(message, self.memory)
            action_summary = f"Used tool '{tool.name}'."
            result_text = tool_result.output

        interaction = Interaction(
            timestamp=datetime.utcnow(),
            prompt=message,
            analysis=analysis,
            action=action_summary,
            result=result_text,
            tool_result=tool_result,
        )
        self.history.append(interaction)
        return interaction

    def _analyze(self, message: str) -> str:
        keywords = self._extract_keywords(message)
        if not keywords:
            return "No keywords detected; responding with general guidance."

        bullet_points = "\n".join(f"- {word.title()} noted." for word in keywords)
        return f"Considerations based on your input:\n{bullet_points}"

    def _extract_keywords(self, message: str) -> Iterable[str]:
        return {word.strip(".,!?\n\t ").lower() for word in message.split() if len(word) > 3}

    def _select_tool(self, message: str) -> Tool | None:
        for tool in self.tools:
            if tool.can_handle(message):
                return tool
        return None

    def _fallback_response(self, analysis: str) -> str:
        return "\n".join(
            [
                "I have captured your request.",
                analysis,
                "Let me know if you want me to run a calculation or manage todos.",
            ]
        )

    def describe_tools(self) -> list[str]:
        return [f"{tool.name}: {tool.description}" for tool in self.tools]

    def export_history(self) -> list[dict[str, str]]:
        return [
            {
                "timestamp": record.timestamp.isoformat(),
                "prompt": record.prompt,
                "analysis": record.analysis,
                "action": record.action,
                "result": record.result,
                "tool_result": record.tool_result.output if record.tool_result else "",
            }
            for record in self.history
        ]
