from __future__ import annotations

import ast
import operator
import re
from dataclasses import dataclass
from typing import Protocol


@dataclass
class ToolResult:
    """Structured output produced by a tool."""

    name: str
    output: str
    details: str | None = None


class Tool(Protocol):
    """Interface implemented by agent tools."""

    name: str
    description: str

    def can_handle(self, message: str) -> bool:
        """Return True if this tool can handle the message."""

    def run(self, message: str, memory: "AgentMemory") -> ToolResult:
        """Execute the tool against the message."""


@dataclass
class AgentMemory:
    """Lightweight memory store passed to tools."""

    todo_items: list[str]


class MathTool:
    """Evaluate simple math expressions embedded in a message."""

    name = "calculator"
    description = "Safely evaluate math expressions such as 'What is 4*(2+3)?'"

    allowed_operators = {
        ast.Add: operator.add,
        ast.Sub: operator.sub,
        ast.Mult: operator.mul,
        ast.Div: operator.truediv,
        ast.Pow: operator.pow,
        ast.USub: operator.neg,
    }

    _expression_re = re.compile(r"[0-9\s\(\)\+\-\*/\.]+")

    def can_handle(self, message: str) -> bool:
        return bool(self._expression_re.search(message))

    def run(self, message: str, memory: AgentMemory) -> ToolResult:  # noqa: ARG002
        expression = self._extract_expression(message)
        value = self._evaluate(expression)
        return ToolResult(
            name=self.name,
            output=str(value),
            details=f"Evaluated expression '{expression}'",
        )

    def _extract_expression(self, message: str) -> str:
        matches = [m.group(0).strip() for m in self._expression_re.finditer(message)]
        numeric_matches = [m for m in matches if any(char.isdigit() for char in m)]
        if not numeric_matches:
            raise ValueError("No expression found to evaluate.")
        return max(numeric_matches, key=len)

    def _evaluate(self, expression: str) -> float:
        node = ast.parse(expression, mode="eval")
        return float(self._safe_eval(node.body))

    def _safe_eval(self, node: ast.AST) -> float:
        if isinstance(node, ast.BinOp) and type(node.op) in self.allowed_operators:
            left = self._safe_eval(node.left)
            right = self._safe_eval(node.right)
            return self.allowed_operators[type(node.op)](left, right)
        if isinstance(node, ast.UnaryOp) and type(node.op) in self.allowed_operators:
            operand = self._safe_eval(node.operand)
            return self.allowed_operators[type(node.op)](operand)
        if isinstance(node, ast.Num):  # type: ignore[attr-defined]
            return float(node.n)
        raise ValueError("Unsupported expression; calculator only handles basic arithmetic.")


class TodoTool:
    """Manage lightweight todo items inside the agent memory."""

    name = "todo"
    description = "Add or list todo items using messages like 'todo buy milk' or 'list todo'."

    def can_handle(self, message: str) -> bool:
        lowered = message.lower()
        return lowered.startswith("todo") or "list todo" in lowered or "todos" in lowered

    def run(self, message: str, memory: AgentMemory) -> ToolResult:
        lowered = message.lower().strip()
        if lowered.startswith("todo"):
            item = message[len("todo") :].strip()
            if not item:
                return ToolResult(
                    name=self.name,
                    output="Provide a todo description after 'todo'.",
                    details="No todo description supplied.",
                )
            memory.todo_items.append(item)
            return ToolResult(
                name=self.name,
                output=f"Added todo: {item}",
                details=f"Todo list now has {len(memory.todo_items)} item(s).",
            )

        if "clear" in lowered:
            count = len(memory.todo_items)
            memory.todo_items.clear()
            return ToolResult(
                name=self.name,
                output="Cleared todo list.",
                details=f"Removed {count} item(s).",
            )

        if memory.todo_items:
            lines = "\n".join(f"- {item}" for item in memory.todo_items)
            return ToolResult(name=self.name, output=f"Current todo items:\n{lines}")

        return ToolResult(name=self.name, output="Todo list is empty.")
