"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { runOdysseusTask } from "@/lib/odysseus";
import type { OdysseusMode } from "@/lib/odysseus";
import { capture, initTelemetry, shutdownTelemetry } from "@/lib/telemetry";

type RunState = {
  result?: string;
  error?: string;
  info?: string;
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

const TELEMETRY_STORAGE_KEY = "odysseus.telemetry.enabled";

export default function OdysseusPage() {
  const [isPending, startTransition] = useTransition();
  const [state, setState] = useState<RunState>({});
  const [task, setTask] = useState<string>("");
  const [mode, setMode] = useState<OdysseusMode>("build");
  const [lastPrompt, setLastPrompt] = useState<string>("");
  const [lastMode, setLastMode] = useState<OdysseusMode>("build");
  const [telemetryEnabled, setTelemetryEnabled] = useState<boolean>(false);

  // Telemetry: init from localStorage; lazy-init PostHog if allowed.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(TELEMETRY_STORAGE_KEY);
      const enabled = raw === "1";
      setTelemetryEnabled(enabled);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (telemetryEnabled) {
      initTelemetry({
        enabled: true,
        // env vars are read in wrapper; override if you want custom host/key
      });
      capture("odysseus_ui_open", {});
    } else {
      shutdownTelemetry();
    }
  }, [telemetryEnabled]);

  const canRun = useMemo(() => !!task.trim(), [task]);

  async function runWithFallback(
    taskText: string,
    modeVal: OdysseusMode,
    presetId?: string
  ) {
    const trimmed = taskText.trim();
    if (!trimmed) return;

    setState({ info: "Running…" });
    setLastPrompt(trimmed);
    setLastMode(modeVal);

    if (telemetryEnabled) {
      capture("odysseus_run_start", {
        mode: modeVal,
        taskLen: trimmed.length,
        presetId: presetId ?? null,
      });
    }

    // 1) Try server action
    try {
      const out = await runOdysseusTask(trimmed, { mode: modeVal });
      setState({ result: out });
      if (telemetryEnabled) {
        capture("odysseus_run_success", {
          mode: modeVal,
          taskLen: trimmed.length,
          presetId: presetId ?? null,
          via: "server_action",
        });
      }
      return;
    } catch {
      // fall through
    }

    // 2) Fallback to API route
    try {
      const res = await fetch("/api/odysseus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: trimmed, mode: modeVal }),
      });
      const data = (await res.json()) as { result?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "API error");
      setState({ result: data.result });
      if (telemetryEnabled) {
        capture("odysseus_run_success", {
          mode: modeVal,
          taskLen: trimmed.length,
          presetId: presetId ?? null,
          via: "api_route",
        });
      }
    } catch (err: any) {
      const msg = err?.message ?? "Unknown error";
      setState({ error: msg });
      if (telemetryEnabled) {
        capture("odysseus_run_error", {
          mode: modeVal,
          taskLen: trimmed.length,
          presetId: presetId ?? null,
          error: msg.slice(0, 300),
        });
      }
    }
  }

  function run(taskText: string, modeVal: OdysseusMode, presetId?: string) {
    startTransition(() => {
      void runWithFallback(taskText, modeVal, presetId);
    });
  }

  async function copy(text?: string) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setState((s) => ({ ...s, info: "Copied to clipboard." }));
      setTimeout(() => setState((s) => ({ ...s, info: undefined })), 1200);
    } catch {
      setState((s) => ({ ...s, error: "Copy failed." }));
    }
  }

  function toggleTelemetry(next: boolean) {
    setTelemetryEnabled(next);
    try {
      localStorage.setItem(TELEMETRY_STORAGE_KEY, next ? "1" : "0");
    } catch {
      // ignore
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-6 space-y-8">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Odysseus Presets
          </h1>
          <p className="text-sm text-gray-500">
            One-click tasks for Lindy-style repo edits with Next.js + Expo. Falls
            back to API when server actions aren’t available.
          </p>
        </div>

        {/* Telemetry toggle */}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={telemetryEnabled}
            onChange={(e) => toggleTelemetry(e.target.checked)}
          />
          <span className="text-gray-600">Analytics (PostHog)</span>
        </label>
      </header>

      {/* Presets */}
      <section className="grid gap-4 md:grid-cols-2">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => run(p.task, p.mode, p.id)}
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
              disabled={isPending || !canRun}
              className="ml-auto rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {isPending ? "Running…" : "Run task"}
            </button>
          </div>
        </div>
      </section>

      {/* Output */}
      <section className="rounded-2xl border p-4 shadow-sm md:p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-medium">Output</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => copy(state.result)}
              disabled={!state.result}
              className="rounded-md border px-2 py-1 text-xs disabled:opacity-50"
              title="Copy the model output"
            >
              Copy Output
            </button>
            <button
              onClick={() => setTask(state.result ?? "")}
              disabled={!state.result}
              className="rounded-md border px-2 py-1 text-xs disabled:opacity-50"
              title="Move output into the task editor"
            >
              Use Output as Task
            </button>
            <button
              onClick={() =>
                copy(lastPrompt ? `Mode: ${lastMode}\n\n${lastPrompt}` : "")
              }
              disabled={!lastPrompt}
              className="rounded-md border px-2 py-1 text-xs disabled:opacity-50"
              title="Copy the last sent prompt"
            >
              Copy Sent Prompt
            </button>
          </div>
        </div>

        {state.info && !state.error && isPending && (
          // Loading skeleton
          <div className="mt-3 space-y-2">
            <div className="h-4 w-1/3 animate-pulse rounded bg-gray-200" />
            <div className="h-3 w-full animate-pulse rounded bg-gray-200" />
            <div className="h-3 w-11/12 animate-pulse rounded bg-gray-200" />
            <div className="h-3 w-10/12 animate-pulse rounded bg-gray-200" />
            <div className="h-3 w-9/12 animate-pulse rounded bg-gray-200" />
          </div>
        )}

        {state.info && (
          <p className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-700">
            {state.info}
          </p>
        )}

        {state.error ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {state.error}
          </p>
        ) : (
          !isPending && (
            <pre className="mt-3 max-h-[520px] overflow-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-sm">
              {state.result ?? "No output yet. Run a preset or custom task."}
            </pre>
          )
        )}
      </section>
    </div>
  );
}
