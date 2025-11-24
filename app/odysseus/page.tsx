"use client";

import { useState, useTransition } from "react";
import { runOdysseusTask } from "@/lib/odysseus";
import type { OdysseusMode } from "@/lib/odysseus";

type RunState = {
  result?: string;
  error?: string;
};

const PRESETS: Array<{
  id: string;
  title: string;
  description: string;
  mode: OdysseusMode;
  task: string;
}> = [
  {
    id: "expo",
    title: "New Expo app",
    description:
      "Scaffold an Expo + React Native app with bottom tabs and basic screens.",
    mode: "mobile",
    task:
      "Create an Expo app with a bottom tab navigator: Home, Activity, Profile. Home should show a feed card list; Activity shows recent events; Profile shows editable user info.",
  },
  {
    id: "monorepo",
    title: "New web+mobile monorepo",
    description:
      "Set up Next.js (web) + Expo (mobile) in a single monorepo with shared packages.",
    mode: "build",
    task:
      "Set up a monorepo with apps/web (Next.js) and apps/mobile (Expo). Share a UI component library in packages/ui and a shared types package in packages/types. Scaffold a simple home screen/page in both apps that uses the shared UI.",
  },
];

export default function OdysseusPage() {
  const [isPending, startTransition] = useTransition();
  const [state, setState] = useState<RunState>({});
  const [task, setTask] = useState<string>("");
  const [mode, setMode] = useState<OdysseusMode>("build");

  async function run(taskText: string, modeVal: OdysseusMode) {
    setState({});
    startTransition(async () => {
      try {
        const out = await runOdysseusTask(taskText, { mode: modeVal });
        setState({ result: out });
      } catch (err: any) {
        // Why: surface server action errors cleanly for debugging UX.
        setState({ error: err?.message ?? "Unknown error" });
      }
    });
  }

  return (
    <div className="mx-auto max-w-5xl p-6 space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Odysseus Presets
        </h1>
        <p className="text-sm text-gray-500">
          One-click tasks for Lindy-style repo edits with Next.js + Expo.
        </p>
      </header>

      {/* Presets */}
      <section className="grid gap-4 md:grid-cols-2">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => run(p.task, p.mode)}
            disabled={isPending}
            className="rounded-2xl border p-4 text-left shadow-sm transition hover:shadow md:p-5 disabled:opacity-60"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium">{p.title}</h2>
              <span className="rounded-full border px-2 py-0.5 text-xs">
                {p.mode.toUpperCase()}
              </span>
            </div>
            <p className="mt-2 text-sm text-gray-600">{p.description}</p>
            <pre className="mt-3 line-clamp-3 whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-xs text-gray-700">
              {p.task}
            </pre>
          </button>
        ))}
      </section>

      {/* Freeform runner */}
      <section className="rounded-2xl border p-4 shadow-sm md:p-5">
        <h3 className="text-base font-medium">Custom task</h3>
        <div className="mt-3 grid gap-3">
          <textarea
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder='e.g. "Create a Next.js dashboard with sidebar navigation, filters, and a metrics grid."'
            className="min-h-[120px] w-full rounded-lg border p-3 text-sm"
          />
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-600">Mode</label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as OdysseusMode)}
              className="rounded-md border px-2 py-1 text-sm"
            >
              <option value="build">build</option>
              <option value="design">design</option>
              <option value="refactor">refactor</option>
              <option value="analyze">analyze</option>
              <option value="deploy">deploy</option>
              <option value="api">api</option>
              <option value="mobile">mobile</option>
            </select>
            <button
              onClick={() => run(task, mode)}
              disabled={isPending || !task.trim()}
              className="ml-auto rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {isPending ? "Running…" : "Run task"}
            </button>
          </div>
        </div>
      </section>

      {/* Output */}
      <section className="rounded-2xl border p-4 shadow-sm md:p-5">
        <h3 className="text-base font-medium">Output</h3>
        {state.error ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {state.error}
          </p>
        ) : (
          <pre className="mt-3 max-h-[520px] overflow-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-sm">
            {state.result ?? "No output yet. Run a preset or custom task."}
          </pre>
        )}
      </section>
    </div>
  );
}
