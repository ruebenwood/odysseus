"use server";

import { runCodexPrompt } from "./codexBridge";
import { buildPrompt, type OdysseusMode, type RunOpts } from "./odysseus";

/** Server-only entry that may be used by API routes or Server Components. */
export async function runOdysseusTaskServer(
  task: string,
  opts?: RunOpts
): Promise<string> {
  const mode: OdysseusMode = opts?.mode ?? "build";
  if (!task.trim()) throw new Error("Task cannot be empty.");
  const prompt = buildPrompt({
    task,
    mode,
    extraInstructions: opts?.extraInstructions,
  });
  const result = await runCodexPrompt(prompt);
  return result;
}
