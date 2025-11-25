/**
 * Minimal interface that Odysseus.ai expects from "Codex".
 * You can implement this by:
 * - Calling a local HTTP service that wraps Codex
 * - Spawning a `codex` CLI process
 * - Calling any internal tool that has repo access + LLM
 */
export async function runCodexPrompt(prompt: string): Promise<string> {
  const endpoint =
    process.env.ODYSSEUS_CODEX_URL || process.env.NEXT_PUBLIC_ODYSSEUS_CODEX_URL;

  if (!endpoint) {
    const message =
      "ODYSSEUS_CODEX_URL is not set. Configure it to point at your Codex executor before deploying.";

    // In development, fail softly so the UI can still render while surfacing the issue.
    if (process.env.NODE_ENV !== "production") {
      return `DEV STUB: ${message}\n\nPrompt preview:\n${prompt}`;
    }

    throw new Error(message);
  }

  const response = await fetch(endpoint, {
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
