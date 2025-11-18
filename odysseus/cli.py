from __future__ import annotations
import argparse, asyncio, json
from .types import RunRequest
from .planner import run_plan
from .agent import bootstrap_tools

def main():
    parser = argparse.ArgumentParser("odysseus")
    sub = parser.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run"); r.add_argument("goal"); r.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    bootstrap_tools()
    if args.cmd == "run":
        req = RunRequest(goal=args.goal, dry_run=args.dry_run)
        res = asyncio.run(run_plan(req))
        print(json.dumps(res.model_dump(), indent=2))

if __name__ == "__main__":
    main()
