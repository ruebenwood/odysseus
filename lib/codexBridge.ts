/**
 * Minimal interface that Odysseus.ai expects from "Codex".
 * You can implement this by:
 * - Calling a local HTTP service that wraps Codex
 * - Spawning a `codex` CLI process
 * - Calling any internal tool that has repo access + LLM
 */
const CODEX_URL =
  process.env.ODYSSEUS_CODEX_URL || process.env.NEXT_PUBLIC_ODYSSEUS_CODEX_URL;
const IS_PROD = process.env.NODE_ENV === "production";
let devStubWarned = false;

export async function runCodexPrompt(prompt: string): Promise<string> {
  if (!CODEX_URL && IS_PROD) {
    throw new Error(
      "ODYSSEUS_CODEX_URL is not set. Configure it to point at your Codex executor before deploying."
    );
  }

  if (!CODEX_URL && !IS_PROD) {
    if (!devStubWarned) {
      console.warn(
        "ODYSSEUS_CODEX_URL is not set – using mock responses in development."
      );
      devStubWarned = true;
    }
    return `DEV STUB: ODYSSEUS_CODEX_URL is not set. Configure it to point at your Codex executor before deploying.\n\nPrompt preview:\n${prompt}`;
  }

  const response = await fetch(CODEX_URL!, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt }),
  });

  if (!response.ok) {
    let details = "";
    try {
      const data = await response.json();
      details = data?.error || JSON.stringify(data);
    } catch {
      details = await response.text();
    }

    throw new Error(
      `Codex bridge call failed with status ${response.status}: ${details || "Unknown error"}`
    );
  }

  const data = await response.json().catch(() => undefined);
  if (!data) {
    throw new Error("Codex bridge returned an empty response.");
  }

  if (typeof data.output === "string" && data.output.length > 0) {
    return data.output;
  }

  return JSON.stringify(data);
}
