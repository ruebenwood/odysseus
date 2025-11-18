"use client";

import { useState } from "react";

const MODES = [
  { value: "build", label: "Build – create features/apps" },
  { value: "design", label: "Design – UI/UX focus" },
  { value: "refactor", label: "Refactor – clean up code" },
  { value: "analyze", label: "Analyze – understand & report" },
  { value: "deploy", label: "Deploy – configs & pipelines" },
  { value: "api", label: "API – backend endpoints" },
  { value: "mobile", label: "Mobile – React Native/Expo" },
] as const;

type ModeValue = (typeof MODES)[number]["value"];

export default function OdysseusConsolePage() {
  const [mode, setMode] = useState<ModeValue>("build");
  const [task, setTask] = useState("");
  const [output, setOutput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleRun() {
    if (!task.trim()) {
      setErrorMsg("Describe what you want Odysseus.ai to do.");
      return;
    }
    setErrorMsg(null);
    setIsLoading(true);
    setOutput("");

    try {
      const res = await fetch("/api/odysseus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task, mode }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Request failed.");
      }

      const data = await res.json();
      setOutput(data.output || "");
    } catch (err: any) {
      setErrorMsg(err?.message || "Something went wrong.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.href = "/login";
    } catch {
      // ignore
    }
  }

  return (
    <div className="min-h-screen bg-black text-neutral-100 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-5xl rounded-2xl border border-neutral-800 bg-gradient-to-br from-neutral-950 via-black to-neutral-900 shadow-2xl p-6 md:p-8">
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
              Odysseus<span className="text-blue-500">.ai</span>
            </h1>
            <p className="text-sm text-neutral-400 mt-1">
              Autonomous software architect. Pick a mode, describe the mission,
              and let it work against your Codex-attached repo.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={handleLogout}
              className="text-xs text-neutral-400 hover:text-neutral-200 underline underline-offset-4"
            >
              Logout
            </button>
            <div className="flex flex-wrap gap-1 text-xs text-neutral-500">
              {MODES.map((m) => (
                <span
                  key={m.value}
                  className={`px-2 py-0.5 rounded-full border ${
                    mode === m.value
                      ? "border-blue-500 text-blue-300 bg-blue-500/10"
                      : "border-neutral-700"
                  }`}
                >
                  {m.value}
                </span>
              ))}
            </div>
          </div>
        </header>

        <div className="grid gap-6 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          {/* Left: controls */}
          <section className="space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="mode"
                className="text-xs font-medium text-neutral-300"
              >
                Mode
              </label>
              <select
                id="mode"
                value={mode}
                onChange={(e) => setMode(e.target.value as ModeValue)}
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950/70 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600"
              >
                {MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="task"
                className="text-xs font-medium text-neutral-300"
              >
                Task
              </label>
              <textarea
                id="task"
                value={task}
                onChange={(e) => setTask(e.target.value)}
                rows={8}
                placeholder='Example: "Create a responsive dashboard with filters and charts."'
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950/70 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 resize-none"
              />
            </div>

            {errorMsg && (
              <p className="text-xs text-red-500 bg-red-500/10 border border-red-600/50 rounded-lg px-3 py-2">
                {errorMsg}
              </p>
            )}

            <button
              type="button"
              onClick={handleRun}
              disabled={isLoading}
              className="inline-flex items-center justify-center rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 px-4 py-2.5 text-sm font-medium transition-colors w-full md:w-auto"
            >
              {isLoading ? "Sending to Odysseus.ai..." : "Send to Odysseus.ai"}
            </button>

            <p className="text-[11px] text-neutral-500">
              Odysseus.ai runs against the repo that Codex is attached to. Make
              sure your Codex configuration points at the correct project.
            </p>
          </section>

          {/* Right: output */}
          <section className="flex flex-col h-full">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-medium text-neutral-200">
                Output / Log
              </h2>
              <button
                type="button"
                onClick={() => setOutput("")}
                className="text-[11px] text-neutral-500 hover:text-neutral-300"
              >
                Clear
              </button>
            </div>
            <div className="flex-1 min-h-[220px] rounded-xl border border-neutral-700 bg-neutral-950/70 p-3 text-xs font-mono text-neutral-300 overflow-auto whitespace-pre-wrap">
              {isLoading && !output && (
                <span className="text-neutral-500">
                  Odysseus.ai is working...
                </span>
              )}
              {!isLoading && !output && (
                <span className="text-neutral-600">
                  No output yet. Run a task to see what Odysseus.ai does.
                </span>
              )}
              {output && <span>{output}</span>}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
