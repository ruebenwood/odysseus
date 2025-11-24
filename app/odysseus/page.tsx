"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { buildPrompt, runOdysseusTask } from "@/lib/odysseus";
import type { OdysseusMode } from "@/lib/odysseus";
import {
  ENV_POSTHOG_KEY,
  capture,
  getRecentEvents,
  initTelemetry,
  shutdownTelemetry,
  subscribeToEvents,
} from "@/lib/telemetry";

/** -------------------------------------------------
 * Types
 * --------------------------------------------------*/
type RunState = { result?: string; error?: string; info?: string };
type UIEvent = { ts: number; event: string; props?: Record<string, any> };
type UIPreset = {
  id: string;
  title: string;
  description: string;
  mode: OdysseusMode;
  task: string;
  builtin?: boolean;
};
type ScaffoldMap = Record<string, string>;

/** -------------------------------------------------
 * LocalStorage keys
 * --------------------------------------------------*/
const LS_PRESETS_KEY = "odysseus.presets";
const LS_TELEMETRY_KEY = "odysseus.telemetry.enabled";
const LS_DRYRUN_KEY = "odysseus.dryrun.enabled";
const LS_REPO_URL_KEY = "odysseus.repo.url";
const LS_REPO_INCLUDE_KEY = "odysseus.repo.include";
const LS_LAST_PLAN_KEY = "odysseus.last.plan";

/** -------------------------------------------------
 * Built-in presets (previous plus extras)
 * --------------------------------------------------*/
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
    description: "Expo Router app with Supabase magic-link auth and configured deep links (iOS/Android/Dev).",
    mode: "mobile",
    task:
      "Create an Expo Router app integrated with Supabase auth using magic link and OAuth. Configure deep links and linking so the magic-link flow returns to the app. Include (a) app.config.ts with scheme and link prefixes, (b) auth screens (/login, /callback), (c) session persistence, (d) protected routes (/(tabs)/home, /(tabs)/activity, /(tabs)/profile), and (e) a Supabase client in src/lib/supabase.ts using EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.",
    builtin: true,
  },
  {
    id: "next_supabase_guard",
    title: "Next.js + Supabase (client + route guard)",
    description: "Supabase client for web, auth pages, middleware to protect /app routes, and session utilities.",
    mode: "build",
    task:
      "In a Next.js app, add Supabase auth with a client helper, server-side session utilities, and middleware to protect /app routes. Include pages: /login (email magic link & OAuth), /app (protected), and an API route to get current user. Use NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    builtin: true,
  },
];

/** -------------------------------------------------
 * Supabase scaffold helpers
 * --------------------------------------------------*/
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
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
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
    ios: { supportsTablet: true, bundleIdentifier: 'com.example.odysseus' },
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
    extra: { router: 'expo-router' },
    experiments: { typedRoutes: true },
  };
};`;
  const authCallbackRouter = `// apps/mobile/app/(auth)/callback.tsx
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../src/lib/supabase';

export default function Callback() {
  const router = useRouter();
  const params = useLocalSearchParams();
  useEffect(() => {
    const handle = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) router.replace('/(tabs)/home');
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
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setAuthed(!!session));
    return () => sub.subscription?.unsubscribe();
  }, []);

  if (!ready) return null;
  if (!authed) return <Slot initialRouteName="(auth)/login" />;

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
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>${name} screen</Text>
    </View>
  );
}`;
  return {
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
}

function makeWebSupabaseScaffolds(): Record<string, string> {
  return {
    "apps/web/.env.local.example": `NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-KEY`,
    "apps/web/lib/supabaseClient.ts": `import { createBrowserClient } from '@supabase/ssr';
export const supabaseBrowser = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );`,
    "apps/web/middleware.ts": `import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
export function middleware(req: NextRequest) {
  const session = req.cookies.get('sb-session')?.value;
  const isProtected = req.nextUrl.pathname.startsWith('/app');
  if (isProtected && !session) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}
export const config = { matcher: ['/app/:path*'] };`,
  };
}

function scaffoldExtraInstructions(files: ScaffoldMap): string {
  const parts = Object.entries(files).map(
    ([path, content]) => `Create or overwrite file: \`${path}\`\n\n\`\`\`\n${content}\n\`\`\``
  );
  return [
    "Additionally, create the following files with *exact* contents:",
    parts.join("\n\n"),
    "Ensure builds succeed.",
  ].join("\n\n");
}

function scaffoldWebExtraInstructions(map: Record<string, string>): string {
  return [
    "Additionally, create these Next.js web files with exact contents:",
    ...Object.entries(map).map(
      ([p, c]) => `Create or overwrite: \`${p}\`\n\n\`\`\`\n${c}\n\`\`\``
    ),
  ].join("\n\n");
}

/** -------------------------------------------------
 * Utility helpers
 * --------------------------------------------------*/
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

function parsePlannedFiles(planText: string): string[] {
  const paths = new Set<string>();
  const codeFenceRegex = /`{1,3}([^`\n]+)`{1,3}/g;
  const bulletRegex = /(?:^|\n)\s*(?:-|\*)\s+(?:Create|Modify|Update|Touch|Add)\s+(?:file|files|):?\s*`([^`]+)`/gi;
  const inlinePath = /(?:^|\s)([A-Za-z0-9_\-./]+\/[A-Za-z0-9_\-./]+\.[A-Za-z0-9]+)/g;

  let m: RegExpExecArray | null;
  while ((m = codeFenceRegex.exec(planText))) {
    const t = m[1].trim();
    if (t.includes("/") && t.split("/").pop()?.includes(".")) paths.add(t);
  }
  while ((m = bulletRegex.exec(planText))) paths.add(m[1].trim());
  while ((m = inlinePath.exec(planText))) paths.add(m[1].trim());

  return Array.from(paths).slice(0, 200);
}

/** -------------------------------------------------
 * Vercel helper panel
 * --------------------------------------------------*/
function VercelPanel() {
  const [token, setToken] = useState<string>("");
  const [name, setName] = useState<string>("odysseus-web");
  const [teamId, setTeamId] = useState<string>("");
  const [projectIdOrName, setProjectIdOrName] = useState<string>("");
  const [envsText, setEnvsText] = useState<string>(`NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
`);

  useEffect(() => {
    try {
      const t = localStorage.getItem("odysseus.vercel.token") || "";
      if (t) setToken(t);
    } catch {
      /* ignore */
    }
  }, []);

  function saveToken(next: string) {
    setToken(next);
    try {
      localStorage.setItem("odysseus.vercel.token", next);
    } catch {
      /* ignore */
    }
  }

  async function call(path: string, payload: any) {
    const res = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "x-vercel-token": token } : {}),
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Request failed");
    return data;
  }

  async function createProject() {
    const data = await call("/api/vercel/projects", {
      name,
      framework: "nextjs",
      teamId: teamId || undefined,
    });
    alert(`Project created: ${data?.id || data?.name}`);
    setProjectIdOrName(data?.id || data?.name || name);
  }

  async function setEnvs() {
    const lines = envsText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const envs = lines.map((l) => {
      const [key, ...rest] = l.split("=");
      return { key, value: rest.join("=") };
    });
    const target = ["production", "preview", "development"] as const;
    const data = await call("/api/vercel/env", {
      projectIdOrName: projectIdOrName || name,
      envs: envs.map((e: any) => ({ ...e, target })),
      teamId: teamId || undefined,
    });
    alert("Env results:\n" + JSON.stringify(data.results, null, 2));
  }

  async function triggerDeploy() {
    const data = await call("/api/vercel/deploy", {
      name,
      projectId: projectIdOrName || undefined,
      teamId: teamId || undefined,
    });
    alert("Deployment started:\n" + JSON.stringify(data, null, 2));
  }

  return (
    <section className="rounded-2xl border p-4 shadow-sm md:p-5">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-base font-medium">Vercel</h3>
      </div>
      <div className="grid gap-3">
        <label className="text-sm">Vercel Token</label>
        <input
          type="password"
          className="rounded-md border p-2 text-sm"
          value={token}
          onChange={(e) => saveToken(e.target.value)}
          placeholder="Import from env or paste here"
        />
        <label className="text-sm">Team ID (optional)</label>
        <input
          className="rounded-md border p-2 text-sm"
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
          placeholder="team_XXXXXXXX (optional)"
        />
        <label className="text-sm">Project Name</label>
        <input
          className="rounded-md border p-2 text-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="odysseus-web"
        />
        <label className="text-sm">Project ID/Name (for envs/deploy)</label>
        <input
          className="rounded-md border p-2 text-sm"
          value={projectIdOrName}
          onChange={(e) => setProjectIdOrName(e.target.value)}
          placeholder="auto-filled after create"
        />
        <div className="flex gap-2">
          <button onClick={createProject} className="rounded-md border px-3 py-1.5 text-sm">
            Create project
          </button>
          <button onClick={triggerDeploy} className="rounded-md border px-3 py-1.5 text-sm">
            Trigger deploy
          </button>
        </div>

        <label className="mt-2 text-sm">Env vars (KEY=VALUE per line)</label>
        <textarea
          className="min-h-[120px] rounded-md border p-2 text-sm"
          value={envsText}
          onChange={(e) => setEnvsText(e.target.value)}
        />
        <button onClick={setEnvs} className="mt-1 rounded-md border px-3 py-1.5 text-sm">
          Set env vars
        </button>

        <p className="text-xs text-gray-500">
          Token sent via header to API routes; server falls back to VERCEL_TOKEN env if header is absent.
        </p>
      </div>
    </section>
  );
}

/** -------------------------------------------------
 * Component
 * --------------------------------------------------*/
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

  const [repoUrl, setRepoUrl] = useState<string>("");
  const [includeRepoInPrompt, setIncludeRepoInPrompt] = useState<boolean>(true);

  const [lastPlanText, setLastPlanText] = useState<string>("");
  const [plannedFiles, setPlannedFiles] = useState<string[]>([]);

  useEffect(() => {
    try {
      setTelemetryEnabled(localStorage.getItem(LS_TELEMETRY_KEY) === "1");
      setDryRun(localStorage.getItem(LS_DRYRUN_KEY) === "1");
      setRepoUrl(localStorage.getItem(LS_REPO_URL_KEY) || "");
      setIncludeRepoInPrompt((localStorage.getItem(LS_REPO_INCLUDE_KEY) ?? "1") === "1");
      const plan = localStorage.getItem(LS_LAST_PLAN_KEY) || "";
      setLastPlanText(plan);
      if (plan) setPlannedFiles(parsePlannedFiles(plan));
    } catch {
      /* ignore */
    }
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
    id === "expo_supabase_auth" || id === "expo_router_supabase_magiclink" || id === "next_supabase_guard";

  function composeRepoExtra(): string {
    if (!includeRepoInPrompt || !repoUrl.trim()) return "";
    return [
      "Repository metadata:",
      `- GitHub repo URL: ${repoUrl.trim()}`,
      "- If deploying to Vercel, set up Git integration for this repository.",
      "- Ensure environment variables are created on Vercel for both Production and Preview targets.",
    ].join("\n");
  }

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
      supaScaffolds =
        presetId === "next_supabase_guard" ? makeWebSupabaseScaffolds() : makeSupabaseScaffolds("router");
      setScaffolds(supaScaffolds);
      setLastPresetId(presetId ?? null);
    } else {
      setScaffolds(null);
      setLastPresetId(presetId ?? null);
    }

    let effectiveExtra = [extraInstructions?.trim(), composeRepoExtra()].filter(Boolean).join("\n\n");
    if (supaScaffolds && !dryRun) {
      effectiveExtra = [
        effectiveExtra,
        presetId === "next_supabase_guard"
          ? scaffoldWebExtraInstructions(supaScaffolds as Record<string, string>)
          : scaffoldExtraInstructions(supaScaffolds),
      ]
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
      ].join("\n");
      setState({ result: preview });
      capture("odysseus_dry_run", { mode: modeVal, presetId: presetId ?? null });
      return;
    }

    capture("odysseus_run_start", {
      mode: modeVal,
      taskLen: trimmed.length,
      presetId: presetId ?? null,
      hasRepo: !!repoUrl.trim(),
    });

    try {
      const out = await runOdysseusTask(trimmed, { mode: modeVal, extraInstructions: effectiveExtra });
      setState({ result: out });
      capture("odysseus_run_success", { mode: modeVal, via: "server_action", presetId: presetId ?? null });
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
      capture("odysseus_run_success", { mode: modeVal, via: "api_route", presetId: presetId ?? null });
    } catch (err: any) {
      const msg = err?.message ?? "Unknown error";
      setState({ error: msg });
      capture("odysseus_run_error", { mode: modeVal, presetId: presetId ?? null, error: msg.slice(0, 300) });
    }
  }

  function run(taskText: string, modeVal: OdysseusMode, extraInstructions?: string, presetId?: string) {
    startTransition(() => {
      void runWithFallback(taskText, modeVal, extraInstructions, presetId);
    });
  }

  function saveRepoUrl(next: string) {
    setRepoUrl(next);
    try {
      localStorage.setItem(LS_REPO_URL_KEY, next);
    } catch {
      /* ignore */
    }
    capture("odysseus_repo_url_set", { hasUrl: !!next.trim() });
  }

  function toggleIncludeRepo(next: boolean) {
    setIncludeRepoInPrompt(next);
    try {
      localStorage.setItem(LS_REPO_INCLUDE_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
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
    const draft = { ...editing };
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

  async function planEdits() {
    const trimmed = task.trim();
    if (!trimmed) return;

    setState({ info: "Planning (no edits)…" });
    const planExtra = [
      "IMPORTANT: Do NOT edit the repo.",
      "Output ONLY a build plan with:",
      "- bullet list of files to create/modify (use backticks around full paths)",
      "- brief rationale per file (1–2 lines)",
      "- any commands to run (code block)",
    ].join("\n");

    try {
      const out = await runOdysseusTask(trimmed, {
        mode: "analyze",
        extraInstructions: [composeRepoExtra(), planExtra].filter(Boolean).join("\n\n"),
      });
      setState({ result: out });
      setLastPlanText(out);
      localStorage.setItem(LS_LAST_PLAN_KEY, out);
      const files = parsePlannedFiles(out);
      setPlannedFiles(files);
      capture("odysseus_plan_success", { files: files.length });
    } catch (err: any) {
      setState({ error: err?.message ?? "Plan failed" });
      capture("odysseus_plan_error", {});
    }
  }

  function applyPlan() {
    if (plannedFiles.length === 0) {
      setState({ error: "No planned files found. Run Plan first." });
      return;
    }
    const filesList = plannedFiles.map((p) => `- ${p}`).join("\n");
    const guardedTask = [
      "Apply the previously planned changes.",
      "Create/modify ONLY these files (no other files):",
      filesList,
    ].join("\n");
    const guardExtra = [
      "IMPORTANT: Do not introduce edits outside the listed files.",
      "If a file is missing from the list but required, STOP and report.",
    ].join("\n");
    run(guardedTask, "build", [extra, guardExtra, composeRepoExtra()].filter(Boolean).join("\n\n"), "apply_plan");
  }

  function writeScaffoldsToRepo(sc: Record<string, string>) {
    const taskLines = Object.keys(sc)
      .map((p) => `- ${p}`)
      .join("\n");
    const taskText = ["Create ONLY the following files in the repo:", taskLines].join("\n");
    const extraText = scaffoldExtraInstructions(sc);
    run(taskText, "build", [extra, composeRepoExtra(), extraText].filter(Boolean).join("\n\n"), "scaffolds_write_now");
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

  function downloadAllScaffolds(sc: Record<string, string>) {
    Object.entries(sc).forEach(([path, content]) => downloadFile(path, content));
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
            <input
              type="checkbox"
              checked={dryRun}
              onChange={(e) => {
                setDryRun(e.target.checked);
                try {
                  localStorage.setItem(LS_DRYRUN_KEY, e.target.checked ? "1" : "0");
                } catch {
                  /* ignore */
                }
              }}
            />
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
              onChange={(e) => {
                setTelemetryEnabled(e.target.checked);
                try {
                  localStorage.setItem(LS_TELEMETRY_KEY, e.target.checked ? "1" : "0");
                } catch {
                  /* ignore */
                }
              }}
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

      <section className="rounded-2xl border p-4 shadow-sm md:p-5">
        <h3 className="text-base font-medium">GitHub Repo Connect</h3>
        <div className="mt-3 grid gap-3">
          <input
            className="rounded-md border p-2 text-sm"
            placeholder="https://github.com/owner/repo"
            value={repoUrl}
            onChange={(e) => saveRepoUrl(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={includeRepoInPrompt}
              onChange={(e) => toggleIncludeRepo(e.target.checked)}
            />
            <span>Include repo metadata in prompt (helps Vercel Git integration)</span>
          </label>
        </div>
      </section>

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
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => run(p.task, p.mode, undefined, p.id)}
                disabled={isPending}
                className="rounded-lg bg-black px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
              >
                {isPending ? (dryRun ? "Previewing…" : "Running…") : dryRun ? "Preview prompt" : "Run preset"}
              </button>
              <button
                onClick={() => {
                  setTask(p.task);
                  setMode(p.mode);
                }}
                className="rounded-lg border px-3 py-2 text-xs"
              >
                Load into editor
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
          <div className="flex flex-wrap items-center gap-3">
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
            <button onClick={planEdits} disabled={!canRun || isPending} className="rounded-lg border px-3 py-2 text-sm">
              Plan (no edits)
            </button>
            <button
              onClick={applyPlan}
              disabled={plannedFiles.length === 0 || isPending}
              className="rounded-lg border px-3 py-2 text-sm"
            >
              Apply Plan
            </button>
          </div>
          {lastPlanText && (
            <details className="rounded-lg border p-3">
              <summary className="cursor-pointer text-sm font-medium">
                Last plan (parsed {plannedFiles.length} files)
              </summary>
              <div className="mt-3 grid gap-2">
                <pre className="max-h-[220px] overflow-auto whitespace-pre-wrap rounded bg-gray-50 p-2 text-xs">
                  {lastPlanText}
                </pre>
                {plannedFiles.length > 0 && (
                  <div className="rounded border p-2">
                    <div className="mb-1 text-xs font-medium">Planned files</div>
                    <ul className="text-xs">
                      {plannedFiles.map((p) => (
                        <li key={p}>• {p}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </details>
          )}
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
                  lastPrompt || lastExtra
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
              Scaffolds for
              {" "}
              {lastPresetId === "expo_router_supabase_magiclink"
                ? "Expo Router + Supabase"
                : lastPresetId === "next_supabase_guard"
                ? "Next.js + Supabase (web)"
                : "Expo + Supabase"}
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => downloadAllScaffolds(scaffolds)}
                className="rounded-md border px-2 py-1 text-xs"
              >
                Download all
              </button>
              <button
                onClick={() => writeScaffoldsToRepo(scaffolds)}
                className="rounded-md bg-black px-2 py-1 text-xs text-white"
              >
                Write scaffolds to repo now
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-600">
            Use these files directly or let Odysseus create them. The button above sends a focused build task.
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
                    <button
                      className="rounded border px-2 py-1 text-xs"
                      onClick={() => downloadFile(path, content)}
                    >
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

      <VercelPanel />

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
