import { NextRequest, NextResponse } from "next/server";
import { runOdysseusTask, OdysseusMode } from "@/lib/odysseus";

// Ensure this route runs in a Node.js runtime for external tool access and is never cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { task, mode } = await req.json();

    if (!task || typeof task !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid 'task'." },
        { status: 400 }
      );
    }

    const allowedModes: OdysseusMode[] = [
      "build",
      "design",
      "refactor",
      "analyze",
      "deploy",
      "api",
      "mobile",
    ];

    const selectedMode: OdysseusMode = allowedModes.includes(mode)
      ? mode
      : "build";

    const output = await runOdysseusTask(task, selectedMode);

    return NextResponse.json({ output });
  } catch (err: any) {
    console.error("Odysseus API error:", err);
    return NextResponse.json(
      { error: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
