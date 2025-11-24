import { NextResponse } from "next/server";
import { runOdysseusTask } from "@/lib/odysseus";
import type { OdysseusMode } from "@/lib/odysseus";

export const runtime = "nodejs";

type Body = {
  task?: string;
  mode?: OdysseusMode;
  extraInstructions?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const task = (body.task ?? "").trim();
    if (!task) {
      return NextResponse.json(
        { error: "Task cannot be empty." },
        { status: 400 }
      );
    }
    const mode: OdysseusMode = (body.mode as OdysseusMode) ?? "build";
    const extraInstructions = body.extraInstructions;

    const result = await runOdysseusTask(task, { mode, extraInstructions });
    return NextResponse.json({ result });
  } catch (err: any) {
    // Why: ensure callers get a helpful message even on unexpected failures.
    return NextResponse.json(
      { error: err?.message ?? "Internal error" },
      { status: 500 }
    );
  }
}
