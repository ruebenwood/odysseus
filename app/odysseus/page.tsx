// app/odysseus/page.tsx
"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  initTelemetry,
  capture,
  shutdownTelemetry,
  subscribeToEvents,
  getRecentEvents,
  ENV_POSTHOG_KEY,
} from "@/lib/telemetry";

/* =========================
   Types & LS Keys
   ========================= */
type RunState = { result?: string; error?: string; info?: string };
type UIEvent = { ts: number; event: string; props?: Record<string, any> };
type OdysseusMode =
  | "build"
  | "design"
  | "refactor"
  | "analyze"
  | "deploy"
  | "api"
  | "mobile";

type UIPreset = {
  id: string;
  title: string;
  description: string;
  mode: OdysseusMode;
  task: string;
  builtin?: boolean;
};

type MacroPreset = {
  id: string;
  title: string;
  task: string;
  mode: OdysseusMode;
  extra: string;
  plannedFiles: string[];
  createdAt: number;
};

const LS_PRESETS_KEY = "odysseus.presets";
const LS_TELEMETRY_KEY = "odysseus.telemetry.enabled";
const LS_DRYRUN_KEY = "odysseus.dryrun.enabled";
const LS_REPO_URL_KEY = "odysseus.repo.url";
const LS_REPO_INCLUDE_KEY = "odysseus.repo.include";
const LS_LAST_PLAN_KEY = "odysseus.last.plan";
const LS_MACROS_KEY = "odysseus.macros";

/* =========================
   Built-in Presets
   ========================= */
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

/* =========================
   Scaffolds (mobile + web)
   ========================= */
type ScaffoldMap = Record<string, string>;

function makeSupabaseScaffolds(kind: "router" | "tabs" = "router"): ScaffoldMap {
  const env = `# .env.local.example
EXPO_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-KEY
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
  const links = (process.env.EXPO_PUBLIC_DEEP_LINKS || scheme + '://').split(',');
  return {
    ...config,
    name: 'Odysseus Mobile',
    slug: 'odysseus-mobile',
    scheme,
    ios: { supportsTablet: true, bundleIdentifier: 'com.example.odysseus' },
    android: {
      package: 'com.example.odysseus',
      intentFilters: [{
        action: 'VIEW',
        autoVerify: true,
        data: links.map((p) => { const u = new URL(p); return { scheme: u.protocol.replace(':',''), host: u.host, pathPattern: '.*' }; }),
        category: ['BROWSABLE', 'DEFAULT'],
      }],
    },
    extra: { router: 'expo-router' },
    experiments: { typedRoutes: true },
  };
};`;

  const authCallbackRouter = `// apps/mobile/app/(auth)/callback.tsx
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
export default function Callback() {
  const router = useRouter();
  useEffect(() => {
    const handle = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) router.replace('/(tabs)/home');
    };
    handle();
  }, []);
  return <View style={{ flex:1, alignItems:'center', justifyContent:'center' }}><Text>Completing sign-in…</Text></View>;
}`;

  const loginRouter = `// apps/mobile/app/(auth)/login.tsx
import { useState } from 'react';
import { View, TextInput, Text, Pressable } from 'react-native';
import * as Linking from 'expo-linking';
import { supabase } from '../../src/lib/supabase';
import { useRouter } from 'expo-router';
export default function Login() {
  const [email, setEmail] = useState(''); const [sending, setSending] = useState(false);
  const router = useRouter();
  async function sendMagicLink() {
    setSending(true);
    try {
      const redirectTo = Linking.createURL('/(auth)/callback');
      const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo }});
      if (error) throw error; alert('Check your email for the magic link.');
    } catch (e:any) { alert(e.message ?? 'Failed to send magic link.'); }
    finally { setSending(false); }
  }
  return (
    <View style={{ padding: 16, gap: 8 }}>
      <Text style={{ fontSize: 18, fontWeight: '600' }}>Sign in</Text>
      <TextInput placeholder="you@example.com" autoCapitalize="none" inputMode="email"
        style={{ borderWidth:1, borderColor:'#ddd', padding:10, borderRadius:8 }}
        value={email} onChangeText={setEmail} />
      <Pressable onPress={sendMagicLink}
        style={{ backgroundColor:'black', padding:12, borderRadius:8, opacity: sending?0.6:1 }} disabled={sending}>
        <Text style={{ color:'white', textAlign:'center' }}>{sending? 'Sending…':'Send magic link'}</Text>
      </Pressable>
      <Pressable onPress={() => router.replace('/(tabs)/home')}>
        <Text style={{ color:'#555', textAlign:'center', marginTop:12 }}>Skip for now</Text>
      </Pressable>
    </View>
  );
}`;

  const tabsLayout = `// apps/mobile/app/(tabs)/_layout.tsx
import { Tabs, Slot } from 'expo-router';
import { useEffect, useState } from 'react';
import { supabase } from '../../src/lib/supabase';
export default function Layout() {
  const [ready, setReady] = useState(false); const [authed, setAuthed] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => { setAuthed(!!session); setReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setAuthed(!!session));
    return () => sub.subscription?.unsubscribe();
  }, []);
  if (!ready) return null;
  if (!authed) return <Slot initialRouteName="(auth)/login" />;
  return (
    <Tabs>
      <Tabs.Screen name="home" options={{ title:'Home' }} />
      <Tabs.Screen name="activity" options={{ title:'Activity' }} />
      <Tabs.Screen name="profile" options={{ title:'Profile' }} />
    </Tabs>
  );
}`;

  const simpleScreen = (name: string) => `// apps/mobile/app/(tabs)/${name}.tsx
import { View, Text } from 'react-native';
export default function ${name[0].toUpperCase() + name.slice(1)}() {
  return <View style={{ flex:1, alignItems:'center', justifyContent:'center' }}><Text>${name} screen</Text></View>;
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
  return ["Additionally, create the following files with *exact* contents:", parts.join("\n\n"), "Ensure builds succeed."].join("\n\n");
}
function scaffoldWebExtraInstructions(map: Record<string, string>): string {
  return [
    "Additionally, create these Next.js web files with exact contents:",
    ...Object.entries(map).map(([p, c]) => `Create or overwrite: \`${p}\`\n\n\`\`\`\n${c}\n\`\`\``),
  ].join("\n\n");
}

/* =========================
   Utils: presets/macros/plan
   ========================= */
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
  } catch {}
}
function readMacros(): MacroPreset[] {
  try {
    const raw = localStorage.getItem(LS_MACROS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as MacroPreset[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
function writeMacros(macros: MacroPreset[]) {
  try {
    localStorage.setItem(LS_MACROS_KEY, JSON.stringify(macros));
  } catch {}
}

/** Extract file-like paths from plan text */
function parsePlannedFiles(planText: string): string[] {
  const paths = new Set<string>();
  const codeFencePath = /```(?:[a-zA-Z]+\n)?([\w./-]+\.[\w]+)```/g;
  const tickPath = /`([\w./-]+\.[\w]+)`/g;
  const bullet = /(?:^|\n)\s*[-*]\s+(?:Create|Modify|Update|Add)\s+(?:file|files)?:?\s*`([^`]+)`/gi;
  let m: RegExpExecArray | null;
  while ((m = codeFencePath.exec(planText))) paths.add(m[1]);
  while ((m = tickPath.exec(planText))) paths.add(m[1]);
  while ((m = bullet.exec(planText))) paths.add(m[1]);
  return Array.from(paths).slice(0, 300);
}

/* =========================
   GitHub URL → {owner, repo}
   ========================= */
function parseRepoUrl(url: string): { owner?: string; repo?: string } {
  try {
    const u = new URL(url);
    if (!/github\.com$/.test(u.hostname)) return {};
    const parts = u.pathname.replace(/^\/+/ , "").split("/");
    if (parts.length < 2) return {};
    return { owner: parts[0], repo: parts[1].replace(/\.git$/, "") };
  } catch {
    return {};
  }
}

const BASE_ODYSSEUS_INSTRUCTIONS = `
You are Odysseus.ai, an autonomous software architect, similar in spirit to an AI engineer like Lindy.

Your mission:
- Take high-level product requests and turn them into working code.
- Plan briefly in your head, then ACT by editing the repo.
- Work comfortably across web and mobile:
  - For web apps, prefer Next.js + React (TypeScript) unless the repo clearly uses another stack.
  - For mobile apps, prefer Expo + React Native (TypeScript).
- When the user is asking for both web and mobile, prefer a monorepo layout:
  - For example:
    - apps/web (Next.js)
    - apps/mobile (Expo)
    - packages/* for shared logic, UI, or config.
- Follow existing conventions in the project when they exist.
- Write clean, modular, production-quality code with good naming and structure.
- Be decisive and implementation-focused: the user wants you to BUILD, not just explain.
`.trim();

function buildPromptLocal(input: {
  task: string;
  mode: OdysseusMode;
  extraInstructions?: string;
}): string {
  const instructions = [
    BASE_ODYSSEUS_INSTRUCTIONS,
    `Mode: ${input.mode.toUpperCase()}`,
    `General behavior:
- Use your tools (and connected services like Codex) to read and modify files directly.
- Only ask the user follow-up questions if absolutely necessary.
- At the end, output a concise summary:
  - What you did
  - Key files changed/added
  - Any important TODOs or follow-ups.`,
    input.extraInstructions?.trim(),
  ]
    .filter(Boolean)
    .join("\n\n");

  return `
${instructions}

Current mode: ${input.mode.toUpperCase()}

User request:
${input.task}

Act now in ${input.mode.toUpperCase()} mode.
`.trim();
}

/* =========================
   Vercel Git steps generator
   ========================= */
function renderVercelGitSteps(opts: {
  repoUrl: string;
  projectName: string;
  envPairs: Record<string, string>;
  tokenVar?: string;
  teamId?: string;
}) {
  const { owner, repo } = parseRepoUrl(opts.repoUrl);
  const tokenVar = opts.tokenVar || "VERCEL_TOKEN";
  const teamQs = opts.teamId ? `?teamId=${opts.teamId}` : "";
  const project = opts.projectName || (repo ? `${repo}` : "odysseus-web");
  const envs = Object.entries(opts.envPairs)
    .filter(([k, v]) => k && v !== undefined)
    .map(
      ([k, v]) =>
        `curl -s -X POST "https://api.vercel.com/v9/projects/${project}/env${teamQs}" \\
  -H "Authorization: Bearer $${tokenVar}" -H "Content-Type: application/json" \\
  -d '${JSON.stringify({
    key: k,
    value: v,
    target: ["production", "preview", "development"],
    type: "encrypted",
  })}'`
    )
    .join("\n\n");

  const bodyCreate = {
    name: project,
    framework: "nextjs",
    ...(opts.teamId ? { teamId: opts.teamId } : {}),
  };

  const linkPayload = {
    gitRepository: owner && repo ? { type: "github", repo: `${owner}/${repo}` } : undefined,
  };

  return `# 1) Create project
curl -s -X POST "https://api.vercel.com/v10/projects${teamQs}" \\
  -H "Authorization: Bearer $${tokenVar}" -H "Content-Type: application/json" \\
  -d '${JSON.stringify(bodyCreate)}'

# 2) Link GitHub repo to project
curl -s -X PATCH "https://api.vercel.com/v10/projects/${project}${teamQs}" \\
  -H "Authorization: Bearer $${tokenVar}" -H "Content-Type: application/json" \\
  -d '${JSON.stringify(linkPayload)}'

# 3) Set environment variables
${envs || "# (add envs above, one POST per key)"}

# 4) Trigger deploy
curl -s -X POST "https://api.vercel.com/v13/deployments${teamQs}" \\
  -H "Authorization: Bearer $${tokenVar}" -H "Content-Type: application/json" \\
  -d '${JSON.stringify({
    name: project,
    projectSettings: { framework: "nextjs" },
  })}'

# Notes:
# - Export your token: export ${tokenVar}=vercel_personal_token
# - If your project name differs from repo, keep 'project' consistent across steps.
# - Prefer Git-connected builds after step 2 (push to main to deploy).`;
}

/* =========================
   Component
   ========================= */
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

  const [macros, setMacros] = useState<MacroPreset[]>([]);

  useEffect(() => {
    try {
      setTelemetryEnabled(localStorage.getItem(LS_TELEMETRY_KEY) === "1");
      setDryRun(localStorage.getItem(LS_DRYRUN_KEY) === "1");
      setRepoUrl(localStorage.getItem(LS_REPO_URL_KEY) || "");
      setIncludeRepoInPrompt((localStorage.getItem(LS_REPO_INCLUDE_KEY) ?? "1") === "1");
      const lp = localStorage.getItem(LS_LAST_PLAN_KEY) || "";
      setLastPlanText(lp);
      if (lp) setPlannedFiles(parsePlannedFiles(lp));
      setMacros(readMacros());
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
      const prompt = buildPromptLocal({ task: trimmed, mode: modeVal, extraInstructions: effectiveExtra });
      const preview = ["DRY RUN (no repo edits performed)", "", "––– Prompt that would be sent –––", prompt].join("\n");
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

  function saveRepoUrl(next: string) {
    setRepoUrl(next);
    try {
      localStorage.setItem(LS_REPO_URL_KEY, next);
    } catch {}
    capture("odysseus_repo_url_set", { hasUrl: !!next.trim() });
  }
  function toggleIncludeRepo(next: boolean) {
    setIncludeRepoInPrompt(next);
    try {
      localStorage.setItem(LS_REPO_INCLUDE_KEY, next ? "1" : "0");
    } catch {}
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
      const res = await fetch("/api/odysseus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: trimmed,
          mode: "analyze",
          extraInstructions: [composeRepoExtra(), planExtra].filter(Boolean).join("\n\n"),
        }),
      });
      const data = (await res.json()) as { result?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Plan failed");
      const out = data.result ?? "";
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
    const taskLines = Object.keys(sc).map((p) => `- ${p}`).join("\n");
    const taskText = ["Create ONLY the following files in the repo:", taskLines].join("\n");
    const extraText = scaffoldExtraInstructions(sc);
    run(taskText, "build", [extra, composeRepoExtra(), extraText].filter(Boolean).join("\n\n"), "scaffolds_write_now");
  }

  function saveMacro() {
    if (!task.trim() || plannedFiles.length === 0) {
      setState({ error: "Need a task and a parsed plan with files." });
      return;
    }
    const title = prompt("Macro title?", `Macro: ${task.slice(0, 40)}`) || "";
    if (!title.trim()) return;
    const macro: MacroPreset = {
      id: `macro_${uid()}`,
      title: title.trim(),
      task,
      mode,
      extra,
      plannedFiles: [...plannedFiles],
      createdAt: Date.now(),
    };
    const next = [...macros, macro];
    setMacros(next);
    writeMacros(next);
    capture("odysseus_macro_saved", { files: plannedFiles.length });
  }

  function runMacro(m: MacroPreset) {
    const filesList = m.plannedFiles.map((p) => `- ${p}`).join("\n");
    const guardedTask = [
      "(Macro) Apply planned changes.",
      "Create/modify ONLY these files (no other files):",
      filesList,
    ].join("\n");
    const guardExtra = [
      "IMPORTANT: Do not introduce edits outside the listed files.",
      "If a file is missing from the list but required, STOP and report.",
    ].join("\n");
    run(guardedTask, "build", [m.extra, guardExtra, composeRepoExtra()].filter(Boolean).join("\n\n"), "macro_apply");
  }

  function deleteMacro(id: string) {
    const next = macros.filter((x) => x.id !== id);
    setMacros(next);
    writeMacros(next);
  }

  function generateVercelGitIntegrationSteps() {
    if (!repoUrl.trim()) {
      setState({ error: "Set a valid GitHub repo URL first." });
      return;
    }
    const projectNameGuess = parseRepoUrl(repoUrl).repo || "odysseus-web";
    const steps = renderVercelGitSteps({
      repoUrl,
      projectName: projectNameGuess,
      envPairs: {
        NEXT_PUBLIC_SUPABASE_URL: "",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
        EXPO_PUBLIC_SUPABASE_URL: "",
        EXPO_PUBLIC_SUPABASE_ANON_KEY: "",
      },
      tokenVar: "VERCEL_TOKEN",
    });
    setState({ result: steps, info: "Generated Vercel Git integration steps." });
  }

  function clearEvents() {
    setEvents([]);
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-[#070b16] via-[#0b1224] to-[#0d1b38] text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(124,58,237,0.18),transparent_34%),radial-gradient(circle_at_80%_0%,rgba(59,130,246,0.14),transparent_30%),radial-gradient(circle_at_50%_85%,rgba(45,212,191,0.15),transparent_26%)]" />
      <div className="relative mx-auto max-w-6xl p-6 md:p-10 space-y-8">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-[11px] font-medium text-indigo-200 ring-1 ring-white/10">
              Lindy-inspired AI engineer
            </p>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Odysseus Presets</h1>
            <p className="text-sm text-slate-300">
              Build, refactor, and deploy like <span className="text-indigo-200">Lindy.ai</span>—Next.js + Expo, one console.
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
                  } catch {}
                }}
              />
              <span className="text-slate-200">Dry-run (no repo edits)</span>
            </label>
            <button
              onClick={() => {
                setEditing({ id: "", title: "", description: "", mode: "build", task: "", builtin: false });
                setShowPresetModal(true);
              }}
              className="rounded-md border border-white/15 px-3 py-1.5 text-sm text-slate-100 backdrop-blur hover:border-white/30"
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
                  } catch {}
                }}
              />
              <span className="text-slate-200">Analytics (PostHog)</span>
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

      {/* GitHub Repo Connect */}
      <section className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-xl shadow-indigo-900/25 backdrop-blur md:p-5">
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
          <div className="flex flex-wrap gap-2">
            <button
              onClick={generateVercelGitIntegrationSteps}
              className="rounded-md border px-3 py-1.5 text-sm"
            >
              Generate Vercel Git integration steps
            </button>
          </div>
        </div>
      </section>

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
                      onClick={() => setEditing(p)}
                      className="rounded border px-2 py-0.5 text-xs"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => {
                        const next = customPresets.filter((x) => x.id !== p.id);
                        setCustomPresets(next);
                        writeCustomPresets(next);
                      }}
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

      {/* Custom task + Plan/Apply */}
      <section className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-xl shadow-indigo-900/25 backdrop-blur md:p-5">
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
            <button
              onClick={planEdits}
              disabled={!canRun || isPending}
              className="rounded-lg border px-3 py-2 text-sm"
            >
              Plan (no edits)
            </button>
            <button
              onClick={applyPlan}
              disabled={plannedFiles.length === 0 || isPending}
              className="rounded-lg border px-3 py-2 text-sm"
            >
              Apply Plan
            </button>
            <button
              onClick={saveMacro}
              disabled={plannedFiles.length === 0}
              className="rounded-lg border px-3 py-2 text-sm"
              title="Save current task + plan as a macro you can re-run later"
            >
              Save as Macro
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

      {/* Output */}
      <section className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-xl shadow-indigo-900/25 backdrop-blur md:p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-medium">Output</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => copy(state.result)}
              disabled={!state.result}
              className="rounded-md border px-2 py-1 text-xs disabled:opacity-50"
            >
              Copy Output
            </button>
            <button
              onClick={() => setTask(state.result ?? "")}
              disabled={!state.result}
              className="rounded-md border px-2 py-1 text-xs disabled:opacity-50"
            >
              Use Output as Task
            </button>
            <button
              onClick={() =>
                copy(
                  (lastPrompt || lastExtra)
                    ? `Mode: ${lastMode}\n\nTask:\n${lastPrompt}\n\nExtra Instructions:\n${lastExtra}\n`
                    : ""
                )
              }
              disabled={!lastPrompt && !lastExtra}
              className="rounded-md border px-2 py-1 text-xs disabled:opacity-50"
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

      {/* Scaffolds panel */}
      {scaffolds && (
        <section className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-xl shadow-indigo-900/25 backdrop-blur md:p-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-base font-medium">
              Scaffolds for{" "}
              {lastPresetId === "expo_router_supabase_magiclink"
                ? "Expo Router + Supabase"
                : lastPresetId === "next_supabase_guard"
                ? "Next.js + Supabase (web)"
                : "Expo + Supabase"}
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  Object.entries(scaffolds).forEach(([path, content]) => {
                    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = path.replace(/.*\//, "");
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    URL.revokeObjectURL(url);
                  })
                }
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
            Use these files directly or let Odysseus create them.
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
                      onClick={() => {
                        const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = path.replace(/.*\//, "");
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        URL.revokeObjectURL(url);
                      }}
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

      {/* Macros */}
      <section className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-xl shadow-indigo-900/25 backdrop-blur md:p-5">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-base font-medium">Macro presets (Plan → Apply)</h3>
          <span className="text-xs text-gray-500">Saved: {macros.length}</span>
        </div>
        {macros.length === 0 ? (
          <p className="text-sm text-gray-500">No macros yet. Run Plan and click “Save as Macro”.</p>
        ) : (
          <div className="grid gap-2">
            {macros
              .slice()
              .sort((a, b) => b.createdAt - a.createdAt)
              .map((m) => (
                <div key={m.id} className="rounded-md border p-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">{m.title}</div>
                      <div className="text-xs text-gray-500">
                        {m.mode.toUpperCase()} • {m.plannedFiles.length} files
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        className="rounded border px-2 py-1 text-xs"
                        onClick={() => runMacro(m)}
                      >
                        Run macro
                      </button>
                      <button
                        className="rounded border px-2 py-1 text-xs"
                        onClick={() => deleteMacro(m.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        )}
      </section>

      {/* Events table */}
      <section className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-xl shadow-indigo-900/25 backdrop-blur md:p-5">
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
                onClick={() => {
                  if (!editing) return;
                  const isNew = !editing.id;
                  const draft = { ...editing, id: isNew ? `custom_${uid()}` : editing.id };
                  const next = [...customPresets.filter((p) => p.id !== draft.id), draft];
                  setCustomPresets(next);
                  writeCustomPresets(next);
                  setShowPresetModal(false);
                  setEditing(null);
                }}
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
                        <button className="rounded border px-2 py-1 text-xs" onClick={() => setEditing({ ...p })}>
                          Edit
                        </button>
                        <button
                          className="rounded border px-2 py-1 text-xs"
                          onClick={() => {
                            const next = customPresets.filter((x) => x.id !== p.id);
                            setCustomPresets(next);
                            writeCustomPresets(next);
                          }}
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
    </div>
  );
}
