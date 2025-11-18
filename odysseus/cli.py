from __future__ import annotations

import argparse
import json
from pathlib import Path

from .agent import Agent, Interaction


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Interact with the Odysseus agent.")
    parser.add_argument(
        "message",
        nargs="*",
        help="Optional message to send immediately. If omitted, runs interactive mode.",
    )
    parser.add_argument(
        "--export",
        type=Path,
        help="Export the transcript to a JSON file after running commands.",
    )
    return parser


def interactive_session(agent: Agent) -> None:
    print("Odysseus agent ready. Type 'exit' to end the session.")
    while True:
        try:
            message = input("You: ").strip()
        except EOFError:
            break
        if message.lower() in {"exit", "quit"}:
            break
        if not message:
            continue
        interaction = agent.handle(message)
        _print_interaction(interaction)


def _print_interaction(interaction: Interaction) -> None:
    print("\n---")
    print(f"Analysis:\n{interaction.analysis}")
    print(f"Action: {interaction.action}")
    print(f"Result:\n{interaction.result}")
    if interaction.tool_result and interaction.tool_result.details:
        print(f"Details: {interaction.tool_result.details}")
    print("---\n")


def export_transcript(agent: Agent, path: Path) -> None:
    data = agent.export_history()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2))
    print(f"Transcript exported to {path}")


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    agent = Agent()
    if args.message:
        interaction = agent.handle(" ".join(args.message))
        _print_interaction(interaction)
    else:
        _print_interaction_summary(agent)
        interactive_session(agent)

    if args.export:
        export_transcript(agent, args.export)


def _print_interaction_summary(agent: Agent) -> None:
    print("Loaded Odysseus agent with the following tools:")
    for tool in agent.describe_tools():
        print(f"- {tool}")
    print()


if __name__ == "__main__":
    main()
