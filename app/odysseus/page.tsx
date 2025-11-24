"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { runOdysseusTask, buildPrompt } from "@/lib/odysseus";
import type { OdysseusMode } from "@/lib/odysseus";
import {
  ENV_POSTHOG_KEY,
  capture,
  getRecentEvents,
  initTelemetry,
  shutdownTelemetry,
  subscribeToEvents,
} from "@/lib/telemetry";

type RunState = { result?: string; error?: string; info?: string };

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
    description: "Scaffold an Expo + React Native app with bottom tabs and basic screens.",
    mode: "mobile",
    task:
      "Create an Expo app with a bottom tab navigator: Home, Activity, Profile. Home should show a feed card list; Activity shows recent events; Profile shows editable user info.",
    builtin: true,
  },
  {
    id: "monorepo",
    title: "New web+mobile monorepo",
    description: "Set up Next.js (web) + Expo (mobile) in a single monorepo with shared packages.",
    mode: "build",
    task:
      "Set up a monorepo with apps/web (Next.js) and apps/mobile (Expo). Share a UI component library in packages/ui and a shared types package in packages/types. Scaffold a simple home screen/page in both apps that uses the shared UI.",
    builtin: true,
  },
  {
    id: "next_dashboard",
    title: "Next.js dashboard (filters + metrics)",
    description: "Create a dashboard with sidebar navigation, filters, and a responsive metrics grid.",
    mode: "build",
    task:
      "Create a Next.js dashboard with a persistent sidebar (links: Overview, Reports, Settings), a top toolbar with search and filter controls (date range, status), and a responsive metrics grid (cards for KPI tiles + a table). Include a sample API route that serves mock data and fetch on the client with SWR or React Query.",
    builtin: true,
  },
  {
    id: "expo_supabase_auth",
    title: "Expo + Supabase auth",
    description: "Expo app with Supabase auth: email magic link & OAuth, protected tabs, session store.",
    mode: "mobile",
    task:
      "Create an Expo app integrated with Supabase auth. Include login/signup screens with email magic link and OAuth (e.g. Google), session persistence, and protected tabs (Home, Activity, Profile) behind auth. Add a minimal Supabase client wrapper, .env handling, and a sign-out action. Use Expo Router or React Navigation.",
    builtin: true,
  },
  {
    id: "expo_router_supabase_magiclink",
    title: "Expo Router + Supabase (magic link + deep links)",
    description:
      "Expo Router app with Supabase magic-link auth and configured deep links (iOS/Android/Dev).",
    mode: "mobile",
    task:
      "Create an Expo Router app integrated with Supabase auth using magic link and OAuth. Configure deep links and linking so the magic-link flow returns to the app. Include (a) app.config.ts with scheme and link prefixes, (b) auth screens (/login, /callback), (c) session persistence, (d) protected routes (/(tabs)/home, /(tabs)/activity, /(tabs)/profile), and (e) a Supabase client in src/lib/supabase.ts using EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.",
    builtin: true,
  },
];

const LS_PRESETS_KEY = "odysseus.presets";
const LS_TELEMETRY_KEY = "odysseus.telemetry.enabled";
const LS_DRYRUN_KEY = "odysseus.dryrun.enabled";

type UIEvent = { ts: number; event: string; props?: Record<string, any> };

type ScaffoldMap = Record<string, string>;

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

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function makeSupabaseScaffolds(kind: "router" | "tabs" = "router"): ScaffoldMap {
  const env = `# .env.local.example
# Supabase project settings
EXPO_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-KEY

# Deep link scheme (adjust as needed)
EXPO_PUBLIC_SCHEME=odysseus
EXPO_PUBLIC_DEEP_LINKS=odysseus://,https://odysseus.example.app`;

  const supabaseClient = `// apps/mobile/src/lib/supabase.ts
import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});`;

  const appConfigRouter = `// apps/mobile/app.config.ts
import { ConfigContext, ExpoConfig } from '@expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  const scheme = process.env.EXPO_PUBLIC_SCHEME || 'odysseus';
  const links = (process.env.EXPO_PUBLIC_DEEP_LINKS || \`${scheme}://\`).split(',');

  return {
    ...config,
    name: 'Odysseus Mobile',
    slug: 'odysseus-mobile',
    scheme,
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.example.odysseus',
    },
    android: {
      package: 'com.example.odysseus',
      intentFilters: [
        {
          action: 'VIEW',
          autoVerify: true,
          data: links.map((p) => {
            const u = new URL(p);
            return { scheme: u.protocol.replace(':', ''), host: u.host, pathPattern: '.*' };
          }),
          category: ['BROWSABLE', 'DEFAULT'],
        },
      ],
    },
    extra: {
      router: 'expo-router',
    },
    experiments: { typedRoutes: true },
  };
};`;

  const authCallbackRouter = `// apps/mobile/app/(auth)/callback.tsx
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../src/lib/supabase';

export default function Callback() {
  const router = useRouter();
  const params = useLocalSearchParams();

  useEffect(() => {
    const url = Linking.useURL();
    const handle = async () => {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();
      if (!error && session) {
        router.replace('/(tabs)/home');
      }
    };
    handle();
  }, [params]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>Completing sign-in…</Text>
    </View>
  );
}`;

  const loginRouter = `// apps/mobile/app/(auth)/login.tsx
import { useState } from 'react';
import { View, TextInput, Text, Pressable } from 'react-native';
import * as Linking from 'expo-linking';
import { supabase } from '../../src/lib/supabase';
import { useRouter } from 'expo-router';

export default function Login() {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const router = useRouter();

  async function sendMagicLink() {
    setSending(true);
    try {
      const redirectTo = Linking.createURL('/(auth)/callback');
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo },
      });
      if (error) throw error;
      alert('Check your email for the magic link.');
    } catch (e: any) {
      alert(e.message ?? 'Failed to send magic link.');
    } finally {
      setSending(false);
    }
  }

  return (
    <View style={{ padding: 16, gap: 8 }}>
      <Text style={{ fontSize: 18, fontWeight: '600' }}>Sign in</Text>
      <TextInput
        placeholder="you@example.com"
        autoCapitalize="none"
        inputMode="email"
        style={{ borderWidth: 1, borderColor: '#ddd', padding: 10, borderRadius: 8 }}
        value={email}
        onChangeText={setEmail}
      />
      <Pressable
        onPress={sendMagicLink}
        style={{ backgroundColor: 'black', padding: 12, borderRadius: 8, opacity: sending ? 0.6 : 1 }}
        disabled={sending}
      >
        <Text style={{ color: 'white', textAlign: 'center' }}>{sending ? 'Sending…' : 'Send magic link'}</Text>
      </Pressable>
      <Pressable onPress={() => router.replace('/(tabs)/home')}>
        <Text style={{ color: '#555', textAlign: 'center', marginTop: 12 }}>Skip for now</Text>
      </Pressable>
    </View>
  );
}`;

  const tabsLayout = `// apps/mobile/app/(tabs)/_layout.tsx
import { Tabs, Slot } from 'expo-router';
import { useEffect, useState } from 'react';
import { supabase } from '../../src/lib/supabase';

export default function Layout() {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthed(!!session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setAuthed(!!session);
    });
    return () => sub.subscription?.unsubscribe();
  }, []);

  if (!ready) return null;

  if (!authed) {
    return <Slot initialRouteName="(auth)/login" />;
  }

  return (
    <Tabs>
      <Tabs.Screen name="home" options={{ title: 'Home' }} />
      <Tabs.Screen name="activity" options={{ title: 'Activity' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}`;

  const simpleScreen = (name: string) => `// apps/mobile/app/(tabs)/${name}.tsx
import { View, Text } from 'react-native';
export default function ${name[0].toUpperCase() + name.slice(1)}() {
  return <View style={{ flex:1, alignItems:'center', justifyContent:'center' }}><Text>${name} screen</Text></View>;
}`;

  const routerFiles: ScaffoldMap = {
    "apps/mobile/src/lib/supabase.ts": supabaseClient,
    "apps/mobile/app.config.ts": appConfigRouter,
    "apps/mobile/app/(auth)/login.tsx": loginRouter,
    "apps/mobile/app/(auth)/callback.tsx": authCallbackRouter,
    "apps/mobile/app/(tabs)/_layout.tsx": tabsLayout,
    "apps/mobile/app/(tabs)/home.tsx": simpleScreen("home"),
    "apps/mobile/app/(tabs)/activity.tsx": simpleScreen("activity"),
    "apps/mobile/app/(tabs)/profile.tsx": simpleScreen("profile"),
    ".env.local.example": env,
  };

  if (kind === "router") return routerFiles;
  return routerFiles;
}

function scaffoldExtraInstructions(files: ScaffoldMap): string {
  const parts = Object.entries(files).map(
    ([path, content]) =>
      `Create or overwrite file: \`${path}\`\n\n\`\`\`\n${content}\n\`\`\``
  );
  return [
    "Additionally, create the following files with *exact* contents:",
    parts.join("\n\n"),
    "Ensure app builds and deep links are wired for magic link callback.",
  ].join("\n\n");
}

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
  const [dryRun, setDryRun] = useState<boolean>(false);

  const [events, setEvents] = useState<UIEvent[]>([]);
  const [customPresets, setCustomPresets] = useState<UIPreset[]>([]);
  const [showPresetModal, setShowPresetModal] = useState<boolean>(false);
  const [editing, setEditing] = useState<UIPreset | null>(null);

  const [scaffolds, setScaffolds] = useState<ScaffoldMap | null>(null);
  const [lastPresetId, setLastPresetId] = useState<string | null>(null);

  useEffect(() => {
    try {
      setTelemetryEnabled(localStorage.getItem(LS_TELEMETRY_KEY) === "1");
      setDryRun(localStorage.getItem(LS_DRYRUN_KEY) === "1");
    } catch {}
    setEvents(getRecentEvents());
    setCustomPresets(readCustomPresets());
  }, []);

  useEffect(() => {
    if (telemetryEnabled) {
      initTelemetry({ enabled: true });
      capture("odysseus_ui_open", {});
    } else {
      shutdownTelemetry();
    }
  }, [telemetryEnabled]);

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

  const isSupabasePreset = (id?: string | null) =>
    id === "expo_supabase_auth" || id === "expo_router_supabase_magiclink";

  async function runWithFallback(
    taskText: string,
    modeVal: OdysseusMode,
    extraInstructions?: string,
    presetId?: string
  ) {
    const trimmed = taskText.trim();
    if (!trimmed) return;

    let supaScaffolds: ScaffoldMap | null = null;
    if (isSupabasePreset(presetId)) {
      supaScaffolds = makeSupabaseScaffolds(
        presetId === "expo_router_supabase_magiclink" ? "router" : "tabs"
      );
      setScaffolds(supaScaffolds);
      setLastPresetId(presetId ?? null);
    } else {
      setScaffolds(null);
      setLastPresetId(presetId ?? null);
    }

    let effectiveExtra = (extraInstructions ?? "").trim();
    if (supaScaffolds && !dryRun) {
      effectiveExtra = [effectiveExtra, scaffoldExtraInstructions(supaScaffolds)]
        .filter(Boolean)
        .join("\n\n");
    }

    setState({ info: dryRun ? "Dry-run preview…" : "Running…" });
    setLastPrompt(trimmed);
    setLastExtra(effectiveExtra);
    setLastMode(modeVal);

    if (dryRun) {
      const prompt = buildPrompt({ task: trimmed, mode: modeVal, extraInstructions: effectiveExtra });
      const preview = [
        "DRY RUN (no repo edits performed)",
        "",
        "––– Prompt that would be sent –––",
        prompt,
        "",
        supaScaffolds ? "––– Scaffolds (download below or let Odysseus write them) –––" : "",
      ].join("\n");
      setState({ result: preview });
      capture("odysseus_dry_run", {
        mode: modeVal,
        taskLen: trimmed.length,
        extraLen: effectiveExtra.length,
        presetId: presetId ?? null,
      });
      return;
    }

    capture("odysseus_run_start", {
      mode: modeVal,
      taskLen: trimmed.length,
      extraLen: effectiveExtra.length,
      presetId: presetId ?? null,
      dryRun,
    });

    try {
      const out = await runOdysseusTask(trimmed, { mode: modeVal, extraInstructions: effectiveExtra });
      setState({ result: out });
      capture("odysseus_run_success", {
        mode: modeVal,
        via: "server_action",
        presetId: presetId ?? null,
        dryRun,
      });
      return;
    } catch {
      /* fallthrough */
    }

    try {
      const res = await fetch("/api/odysseus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: trimmed, mode: modeVal, extraInstructions: effectiveExtra }),
      });
      const data = (await res.json()) as { result?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "API error");
      setState({ result: data.result });
      capture("odysseus_run_success", {
        mode: modeVal,
        via: "api_route",
        presetId: presetId ?? null,
        dryRun,
      });
    } catch (err: any) {
      const msg = err?.message ?? "Unknown error";
      setState({ error: msg });
      capture("odysseus_run_error", {
        mode: modeVal,
        presetId: presetId ?? null,
        error: msg.slice(0, 300),
        dryRun,
      });
    }
  }

  function run(taskText: string, modeVal: OdysseusMode, extraInstructions?: string, presetId?: string) {
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
    } catch {}
  }

  function toggleDryRun(next: boolean) {
    setDryRun(next);
    try {
      localStorage.setItem(LS_DRYRUN_KEY, next ? "1" : "0");
    } catch {}
  }

  function clearEvents() {
    setEvents([]);
  }

  function openCreatePreset() {
    setEditing({ id: "", title: "", description: "", mode: "build", task: "", builtin: false });
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

  function downloadFile(path: string, content: string) {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = path.replace(/.*\//, "");
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function downloadAllScaffolds() {
    if (!scaffolds) return;
    Object.entries(scaffolds).forEach(([path, content]) => downloadFile(path, content));
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

        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={dryRun} onChange={(e) => toggleDryRun(e.target.checked)} />
            <span className="text-gray-700">Dry-run (no repo edits)</span>
          </label>

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

      <section className="grid gap-4 md:grid-cols-2">
        {allPresets.map((p) => (
          <div key={p.id} className="rounded-2xl border p-4 text-left shadow-sm md:p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium">{p.title}</h2>
              <div className="flex items-center gap-2">
                <span className="rounded-full border px-2 py-0.5 text-xs">{p.mode.toUpperCase()}</span>
                {!p.builtin && (
                  <>
                    <button onClick={() => openEditPreset(p)} className="rounded border px-2 py-0.5 text-xs">
                      Edit
                    </button>
                    <button onClick={() => removePreset(p.id)} className="rounded border px-2 py-0.5 text-xs">
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
                {isPending ? (dryRun ? "Previewing…" : "Running…") : dryRun ? "Preview prompt" : "Run preset"}
              </button>
            </div>
          </div>
        ))}
      </section>

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
              {isPending ? (dryRun ? "Previewing…" : "Running…") : dryRun ? "Preview prompt" : "Run task"}
            </button>
          </div>
        </div>
      </section>

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
                  (lastPrompt || lastExtra)
                    ? `Mode: ${lastMode}\n\nTask:\n${lastPrompt}\n\nExtra Instructions:\n${lastExtra}\n\nDryRun: ${dryRun}`
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

      {scaffolds && (
        <section className="rounded-2xl border p-4 shadow-sm md:p-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-base font-medium">
              Scaffolds for {lastPresetId === "expo_router_supabase_magiclink" ? "Expo Router + Supabase" : "Expo + Supabase"}
            </h3>
            <div className="flex items-center gap-2">
              <button onClick={downloadAllScaffolds} className="rounded-md border px-2 py-1 text-xs">
                Download all
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-600">
            Use these files directly or let Odysseus create them (we auto-inject in non–dry-run).
          </p>
          <ul className="mt-3 space-y-2">
            {Object.entries(scaffolds).map(([path, content]) => (
              <li key={path} className="rounded-md border p-2">
                <div className="flex items-center justify-between">
                  <code className="text-xs">{path}</code>
                  <div className="flex items-center gap-2">
                    <button className="rounded border px-2 py-1 text-xs" onClick={() => copy(content)}>
                      Copy
                    </button>
                    <button className="rounded border px-2 py-1 text-xs" onClick={() => downloadFile(path, content)}>
                      Download
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

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
                      <td className="px-2 py-2 align-top">{new Date(e.ts).toLocaleTimeString()}</td>
                      <td className="px-2 py-2 align-top">{e.event}</td>
                      <td className="px-2 py-2 align-top">
                        <pre className="whitespace-pre-wrap text-xs">{JSON.stringify(e.props ?? {}, null, 2)}</pre>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showPresetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowPresetModal(false)} />
          <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold">{editing?.id ? "Edit preset" : "New preset"}</h3>

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
              <button className="rounded-md border px-3 py-1.5 text-sm" onClick={() => setShowPresetModal(false)}>
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
                        <button className="rounded border px-2 py-1 text-xs" onClick={() => openEditPreset(p)}>
                          Edit
                        </button>
                        <button className="rounded border px-2 py-1 text-xs" onClick={() => removePreset(p.id)}>
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
