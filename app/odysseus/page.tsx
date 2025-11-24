"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { runOdysseusTask } from "@/lib/odysseus";
import type { OdysseusMode } from "@/lib/odysseus";
import {
  ENV_POSTHOG_KEY,
  capture,
  getRecentEvents,
  initTelemetry,
  shutdownTelemetry,
  subscribeToEvents,
} from "@/lib/telemetry";

type RunState = {
  result?: string;
  error?: string;
  info?: string;
};

type UIPreset = {
  id: string;
  title: string;
  description: string;
  mode: OdysseusMode;
  task: string;
  builtin?: boolean;
};

const BUILTIN_PRESETS: UIPreset[] = [
  {
    id: "expo",
    title: "New Expo app",
    description:
      "Scaffold an Expo + React Native app with bottom tabs and basic screens.",
    mode: "mobile",
    task:
      "Create an Expo app with a bottom tab navigator: Home, Activity, Profile. Home should show a feed card list; Activity shows recent events; Profile shows editable user info.",
    builtin: true,
  },
  {
    id: "monorepo",
    title: "New web+mobile monorepo",
    description:
      "Set up Next.js (web) + Expo (mobile) in a single monorepo with shared packages.",
    mode: "build",
    task:
      "Set up a monorepo with apps/web (Next.js) and apps/mobile (Expo). Share a UI component library in packages/ui and a shared types package in packages/types. Scaffold a simple home screen/page in both apps that uses the shared UI.",
    builtin: true,
  },
];

const LS_PRESETS_KEY = "odysseus.presets";
const LS_TELEMETRY_KEY = "odysseus.telemetry.enabled";

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function readCustomPresets(): UIPreset[] {
  try {
    const raw = localStorage.getItem(LS_PRESETS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as UIPreset[];
    return Array.isArray(arr) ? arr.filter((p) => !!p.id && !p.builtin) : [];
  } catch {
    return [];
  }
}

function writeCustomPresets(presets: UIPreset[]) {
  try {
    localStorage.setItem(LS_PRESETS_KEY, JSON.stringify(presets));
  } catch {
    /* ignore */
  }
}

type UIEvent = {
  ts: number;
  event: string;
  props?: Record<string, any>;
};

export default function OdysseusPage() {
  const [isPending, startTransition] = useTransition();
  const [state, setState] = useState<RunState>({});
  const [task, setTask] = useState<string>("");
  const [extra, setExtra] = useState<string>("");
  const [mode, setMode] = useState<OdysseusMode>("build");
  const [lastPrompt, setLastPrompt] = useState<string>("");
  const [lastExtra, setLastExtra] = useState<string>("");
  const [lastMode, setLastMode] = useState<OdysseusMode>("build");

  const [telemetryEnabled, setTelemetryEnabled] = useState<boolean>(false);
  const [events, setEvents] = useState<UIEvent[]>([]);

  const [customPresets, setCustomPresets] = useState<UIPreset[]>([]);
  const [showPresetModal, setShowPresetModal] = useState<boolean>(false);
  const [editing, setEditing] = useState<UIPreset | null>(null);

  // Load toggles, events, presets
  useEffect(() => {
    try {
      setTelemetryEnabled(localStorage.getItem(LS_TELEMETRY_KEY) === "1");
    } catch {
      /* ignore */
    }
    setEvents(getRecentEvents());
    setCustomPresets(readCustomPresets());
  }, []);

  // Init/teardown telemetry
  useEffect(() => {
    if (telemetryEnabled) {
      initTelemetry({ enabled: true });
      capture("odysseus_ui_open", {});
    } else {
      shutdownTelemetry();
    }
  }, [telemetryEnabled]);

  // Live telemetry feed
  useEffect(() => {
    const unsub = subscribeToEvents((e) => {
      setEvents((prev) => {
        const next = [...prev, e];
        return next.length > 10 ? next.slice(next.length - 10) : next;
      });
    });
    return () => unsub();
  }, []);

  const canRun = useMemo(() => !!task.trim(), [task]);
  const missingKeyBanner =
    telemetryEnabled && !ENV_POSTHOG_KEY
      ? "Analytics is ON but NEXT_PUBLIC_POSTHOG_KEY is missing. Add it to .env.local and reload."
      : null;

  const allPresets: UIPreset[] = useMemo(
    () => [...BUILTIN_PRESETS, ...customPresets],
    [customPresets]
  );

  async function runWithFallback(
    taskText: string,
    modeVal: OdysseusMode,
    extraInstructions?: string,
    presetId?: string
  ) {
    const trimmed = taskText.trim();
    if (!trimmed) return;

    setState({ info: "Running…" });
    setLastPrompt(trimmed);
    setLastExtra(extraInstructions ?? "");
    setLastMode(modeVal);

    capture("odysseus_run_start", {
      mode: modeVal,
      taskLen: trimmed.length,
      extraLen: (extraInstructions ?? "").length,
      presetId: presetId ?? null,
    });

    // 1) Try server action
    try {
      const out = await runOdysseusTask(trimmed, { mode: modeVal, extraInstructions });
      setState({ result: out });
      capture("odysseus_run_success", {
        mode: modeVal,
        via: "server_action",
        presetId: presetId ?? null,
      });
      return;
    } catch {
      /* fallthrough */
    }

    // 2) API fallback
    try {
      const res = await fetch("/api/odysseus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: trimmed, mode: modeVal, extraInstructions }),
      });
      const data = (await res.json()) as { result?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "API error");
      setState({ result: data.result });
      capture("odysseus_run_success", {
        mode: modeVal,
        via: "api_route",
        presetId: presetId ?? null,
      });
    } catch (err: any) {
      const msg = err?.message ?? "Unknown error";
      setState({ error: msg });
      capture("odysseus_run_error", {
        mode: modeVal,
        presetId: presetId ?? null,
        error: msg.slice(0, 300),
      });
    }
  }

  function run(
    taskText: string,
    modeVal: OdysseusMode,
    extraInstructions?: string,
    presetId?: string
  ) {
    startTransition(() => {
      void runWithFallback(taskText, modeVal, extraInstructions, presetId);
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
      localStorage.setItem(LS_TELEMETRY_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  function clearEvents() {
    setEvents([]);
  }

  // Preset CRUD
  function openCreatePreset() {
    setEditing({
      id: "",
      title: "",
      description: "",
      mode: "build",
      task: "",
      builtin: false,
    });
    setShowPresetModal(true);
  }

  function openEditPreset(p: UIPreset) {
    if (p.builtin) return;
    setEditing({ ...p });
    setShowPresetModal(true);
  }

  function removePreset(id: string) {
    const next = customPresets.filter((p) => p.id !== id);
    setCustomPresets(next);
    writeCustomPresets(next);
    capture("odysseus_preset_delete", { id });
  }

  function savePreset() {
    if (!editing) return;
    const isNew = !editing.id;
    const draft = { ...editing } as UIPreset;
    if (isNew) draft.id = `custom_${uid()}`;

    const next = [...customPresets.filter((p) => p.id !== draft.id), draft];
    setCustomPresets(next);
    writeCustomPresets(next);
    setShowPresetModal(false);
    setEditing(null);
    capture(isNew ? "odysseus_preset_create" : "odysseus_preset_update", {
      id: draft.id,
      mode: draft.mode,
      title: draft.title,
    });
  }

  return (
    <div className="mx-auto max-w-5xl p-6 space-y-8">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Odysseus Presets</h1>
          <p className="text-sm text-gray-500">
            Lindy-style autonomous edits for Next.js + Expo. Build, refactor, deploy.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={openCreatePreset}
            className="rounded-md border px-3 py-1.5 text-sm"
            title="Create custom presets"
          >
            Manage Presets
          </button>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={telemetryEnabled}
              onChange={(e) => toggleTelemetry(e.target.checked)}
            />
            <span className="text-gray-600">Analytics (PostHog)</span>
          </label>
        </div>
      </header>

      {missingKeyBanner && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {missingKeyBanner} Example:
          <pre className="mt-2 rounded bg-white p-2 text-xs">{`# .env.local
NEXT_PUBLIC_POSTHOG_KEY=phc_***
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com`}</pre>
        </div>
      )}

      {/* Presets */}
      <section className="grid gap-4 md:grid-cols-2">
        {allPresets.map((p) => (
          <div key={p.id} className="rounded-2xl border p-4 text-left shadow-sm md:p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium">{p.title}</h2>
              <div className="flex items-center gap-2">
                <span className="rounded-full border px-2 py-0.5 text-xs">
                  {p.mode.toUpperCase()}
                </span>
                {!p.builtin && (
                  <>
                    <button
                      onClick={() => openEditPreset(p)}
                      className="rounded border px-2 py-0.5 text-xs"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => removePreset(p.id)}
                      className="rounded border px-2 py-0.5 text-xs"
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>
            <p className="mt-2 text-sm text-gray-600">{p.description}</p>
            <pre className="mt-3 line-clamp-3 whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-xs text-gray-700">
              {p.task}
            </pre>
            <div className="mt-3">
              <button
                onClick={() => run(p.task, p.mode, undefined, p.id)}
                disabled={isPending}
                className="rounded-lg bg-black px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
              >
                {isPending ? "Running…" : "Run preset"}
              </button>
            </div>
          </div>
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
          <label className="text-sm text-gray-600">Extra instructions (optional)</label>
          <textarea
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            placeholder="Repo-specific notes, constraints, or temporary overrides."
            className="min-h-[80px] w-full rounded-lg border p-3 text-sm"
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
              onClick={() => run(task, mode, extra)}
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
                copy(
                  lastPrompt || lastExtra
                    ? `Mode: ${lastMode}\n\nTask:\n${lastPrompt}\n\nExtra Instructions:\n${lastExtra}`
                    : ""
                )
              }
              disabled={!lastPrompt && !lastExtra}
              className="rounded-md border px-2 py-1 text-xs disabled:opacity-50"
              title="Copy the last sent prompt"
            >
              Copy Sent Prompt
            </button>
          </div>
        </div>

        {state.info && !state.error && isPending && (
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

      {/* Events table */}
      <section className="rounded-2xl border p-4 shadow-sm md:p-5">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-base font-medium">Recent analytics events</h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Showing last {events.length} / 10</span>
            <button onClick={clearEvents} className="rounded-md border px-2 py-1 text-xs">
              Clear
            </button>
          </div>
        </div>
        {events.length === 0 ? (
          <p className="text-sm text-gray-500">No events yet. Toggle Analytics and run a task.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="px-2 py-2">Time</th>
                  <th className="px-2 py-2">Event</th>
                  <th className="px-2 py-2">Props</th>
                </tr>
              </thead>
              <tbody>
                {events
                  .slice()
                  .reverse()
                  .map((e, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="px-2 py-2 align-top">
                        {new Date(e.ts).toLocaleTimeString()}
                      </td>
                      <td className="px-2 py-2 align-top">{e.event}</td>
                      <td className="px-2 py-2 align-top">
                        <pre className="whitespace-pre-wrap text-xs">
                          {JSON.stringify(e.props ?? {}, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Preset Editor Modal */}
      {showPresetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowPresetModal(false)} />
          <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold">
              {editing?.id ? "Edit preset" : "New preset"}
            </h3>

            <div className="mt-4 grid gap-3">
              <label className="text-sm">Title</label>
              <input
                className="rounded-md border p-2 text-sm"
                value={editing?.title ?? ""}
                onChange={(e) => setEditing((p) => (p ? { ...p, title: e.target.value } : p))}
              />
              <label className="text-sm">Description</label>
              <textarea
                className="min-h-[60px] rounded-md border p-2 text-sm"
                value={editing?.description ?? ""}
                onChange={(e) => setEditing((p) => (p ? { ...p, description: e.target.value } : p))}
              />
              <label className="text-sm">Mode</label>
              <select
                className="rounded-md border p-2 text-sm"
                value={editing?.mode ?? "build"}
                onChange={(e) =>
                  setEditing((p) => (p ? { ...p, mode: e.target.value as OdysseusMode } : p))
                }
              >
                <option value="build">build</option>
                <option value="design">design</option>
                <option value="refactor">refactor</option>
                <option value="analyze">analyze</option>
                <option value="deploy">deploy</option>
                <option value="api">api</option>
                <option value="mobile">mobile</option>
              </select>
              <label className="text-sm">Task</label>
              <textarea
                className="min-h-[100px] rounded-md border p-2 text-sm"
                value={editing?.task ?? ""}
                onChange={(e) => setEditing((p) => (p ? { ...p, task: e.target.value } : p))}
                placeholder="Describe exactly what you want Odysseus to build."
              />
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                className="rounded-md border px-3 py-1.5 text-sm"
                onClick={() => setShowPresetModal(false)}
              >
                Cancel
              </button>
              <button
                className="rounded-md bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50"
                onClick={savePreset}
                disabled={!editing?.title?.trim() || !editing?.task?.trim()}
              >
                Save preset
              </button>
            </div>

            {customPresets.length > 0 && (
              <div className="mt-6">
                <h4 className="text-sm font-medium">Your presets</h4>
                <ul className="mt-2 space-y-2">
                  {customPresets.map((p) => (
                    <li key={p.id} className="flex items-center justify-between rounded-md border p-2">
                      <div>
                        <div className="text-sm font-medium">{p.title}</div>
                        <div className="text-xs text-gray-500">{p.mode.toUpperCase()}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          className="rounded border px-2 py-1 text-xs"
                          onClick={() => openEditPreset(p)}
                        >
                          Edit
                        </button>
                        <button
                          className="rounded border px-2 py-1 text-xs"
                          onClick={() => removePreset(p.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
