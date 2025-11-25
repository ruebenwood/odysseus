"use client";

import { FormEvent, useRef, useState } from "react";

type Role = "user" | "agent";

interface Message {
  id: string;
  role: Role;
  content: string;
  timestamp: string;
}

const presetCommands = [
  "Create a landing page for a cinematic music AI startup.",
  "Generate an iOS + Android app for tracking basketball workouts.",
  "Build a Smart TV app that plays curated game highlights.",
  "Create a simple browser game: endless runner with keyboard controls.",
];

const platformsList = [
  { id: "web", label: "Web app" },
  { id: "ios", label: "iOS" },
  { id: "android", label: "Android" },
  { id: "smart-tv", label: "Smart TV" },
  { id: "game", label: "Game" },
];

function formattedTime() {
  const d = new Date();
  return d.toTimeString().slice(0, 5);
}

export default function OdysseusBuilder() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "m1",
      role: "agent",
      content:
        "I’m Odysseus — your multi-platform builder. Describe what you want, pick the targets on the left (web, iOS, Android, Smart TV, game), and I’ll generate the app plan, screens, and starter code.",
      timestamp: formattedTime(),
    },
  ]);
  const [input, setInput] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([
    "web",
    "ios",
    "android",
  ]);
  const [projectName, setProjectName] = useState("New multi-platform app");
  const [isThinking, setIsThinking] = useState(false);
  const [previewPlatform, setPreviewPlatform] = useState<string>("web");
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const togglePlatform = (id: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const handleSend = (e?: FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isThinking) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
      timestamp: formattedTime(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsThinking(true);

    // Fake agent response for now — replace with real backend call later.
    const chosen =
      selectedPlatforms.length > 0
        ? selectedPlatforms
            .map(
              (p) =>
                platformsList.find((x) => x.id === p)?.label ?? p.toUpperCase()
            )
            .join(", ")
        : "no platforms selected";

    const previewText = `Great. I’ll generate a starter project for: ${chosen}.
    
• Step 1: Define core entities, navigation, and UI components.
• Step 2: Create platform-specific shells (routing, navigation stacks, input).
• Step 3: Wire shared logic into each target (state, networking, assets).
• Step 4: Produce starter code and a build checklist for you to review.`;

    setTimeout(() => {
      const agentMessage: Message = {
        id: crypto.randomUUID(),
        role: "agent",
        content: previewText,
        timestamp: formattedTime(),
      };
      setMessages((prev) => [...prev, agentMessage]);
      setIsThinking(false);
    }, 900);
  };

  const injectCommand = (cmd: string) => {
    setInput(cmd);
    if (inputRef.current) inputRef.current.focus();
  };

  const lastUserMessage =
    [...messages].reverse().find((m) => m.role === "user")?.content ?? "";

  const availablePreviewPlatforms =
    selectedPlatforms.length > 0 ? selectedPlatforms : platformsList.map((p) => p.id);

  const effectivePreviewPlatform = availablePreviewPlatforms.includes(previewPlatform)
    ? previewPlatform
    : availablePreviewPlatforms[0];

  const previewLabel =
    platformsList.find((p) => p.id === effectivePreviewPlatform)?.label ??
    effectivePreviewPlatform;

  return (
    <div className="flex min-h-screen flex-col bg-[#050509] text-slate-100">
      {/* Top bar */}
      <header className="flex h-14 items-center justify-between border-b border-white/10 bg-black/70 px-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-sky-400/40 bg-sky-500/20 text-[11px] font-semibold tracking-[0.25em]">
            O
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold">Odysseus.ai</span>
            <span className="text-[11px] uppercase tracking-[0.25em] text-slate-400">
              Multi-Platform Builder Agent
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <div className="hidden items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] text-slate-200 md:flex">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Live agent · Code generation enabled
          </div>
          <button className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-indigo-500 text-[11px] font-semibold">
            RW
          </button>
        </div>
      </header>

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Project & platforms */}
        <aside className="hidden w-64 flex-col border-r border-white/10 bg-black/85 px-3 py-3 text-xs md:flex">
          <div className="mb-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              Project
            </p>
            <div className="mt-2 rounded-xl border border-white/15 bg-white/5 p-2">
              <input
                className="w-full rounded-md bg-transparent text-[12px] font-medium text-slate-100 outline-none placeholder:text-slate-500"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="Project name"
              />
              <p className="mt-1 text-[10px] text-slate-500">
                Odysseus will share logic and design across all targets.
              </p>
            </div>
          </div>

          <div className="mb-4 border-t border-white/10 pt-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                Target platforms
              </span>
              <button
                className="text-[10px] text-sky-300 hover:text-sky-200"
                onClick={() =>
                  setSelectedPlatforms(platformsList.map((p) => p.id))
                }
              >
                All
              </button>
            </div>
            <div className="space-y-1">
              {platformsList.map((p) => {
                const active = selectedPlatforms.includes(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => togglePlatform(p.id)}
                  className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left ${
                      active
                        ? "bg-sky-500/20 text-sky-100 border border-sky-400/50"
                        : "bg-white/5 text-slate-300 border border-white/10 hover:border-sky-400/60 hover:text-white"
                    }`}
                  >
                    <span className="text-[11px]">{p.label}</span>
                    <span
                      className={`h-3 w-3 rounded-full border ${
                        active
                          ? "border-sky-300 bg-sky-400/80"
                          : "border-slate-500 bg-black"
                      }`}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-t border-white/10 pt-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              Generation mode
            </p>
            <div className="space-y-1">
              {[
                "Plan + wireframes only",
                "Starter code (UI + navigation)",
                "Full app skeleton with stubs",
              ].map((mode, idx) => (
                <label
                  key={mode}
                  className="flex items-center justify-between rounded-lg bg-white/5 px-2 py-1.5 hover:bg-white/10"
                >
                  <span className="text-[11px] text-slate-200">{mode}</span>
                  <input
                    type="radio"
                    name="mode"
                    defaultChecked={idx === 2}
                    className="h-3 w-3 rounded-full border-white/50 bg-black"
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="mt-auto border-t border-white/10 pt-3">
            <button className="w-full rounded-lg bg-white/5 px-2 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-200 hover:bg-white/10">
              + New build session
            </button>
          </div>
        </aside>

        {/* Center: Agent conversation / command area */}
        <section className="flex min-w-0 flex-1 flex-col bg-gradient-to-b from-black via-[#050509] to-black">
          {/* Sub-header */}
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-xs">
            <div className="flex flex-wrap items-center gap-2 text-slate-400">
              <span className="text-[11px]">Builder agent</span>
              <span className="h-3 w-px bg-white/20" />
              <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-slate-200">
                {projectName || "Untitled project"}
              </span>
              <span className="h-3 w-px bg-white/20" />
              <span className="text-[11px] text-slate-500">
                Type what you want; Odysseus designs and scaffolds the code.
              </span>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-slate-400">
              <span className="hidden sm:inline">Autosaving spec & plan</span>
              <span className="h-3 w-px bg-white/20" />
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </div>
          </div>

          {/* Messages */}
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 text-xs">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${
                  m.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-xl rounded-2xl px-3 py-2 leading-relaxed ${
                    m.role === "user"
                      ? "bg-sky-500/90 text-black"
                      : "bg-white/5 border border-white/10 text-slate-100"
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between text-[10px]">
                    <span className="font-semibold">
                      {m.role === "user" ? "You" : "Odysseus Builder"}
                    </span>
                    <span
                      className={
                        m.role === "user"
                          ? "text-sky-900/80"
                          : "text-slate-400"
                      }
                    >
                      {m.timestamp}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-[11px]">
                    {m.content}
                  </p>
                </div>
              </div>
            ))}

            {isThinking && (
              <div className="flex justify-start">
                <div className="flex max-w-xs items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-slate-300">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-sky-400" />
                  Generating cross-platform app plan and starter code…
                </div>
              </div>
            )}
          </div>

          {/* Composer */}
          <div className="border-t border-white/10 bg-black/75 px-4 py-3">
            {/* Quick commands */}
            <div className="mb-2 flex flex-wrap gap-2 text-[11px]">
              {presetCommands.map((cmd) => (
                <button
                  key={cmd}
                  onClick={() => injectCommand(cmd)}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-300 hover:border-sky-400 hover:text-white"
                >
                  {cmd}
                </button>
              ))}
            </div>

            <form
              onSubmit={handleSend}
              className="flex items-end gap-2 rounded-2xl border border-white/15 bg-black/85 px-3 py-2"
            >
              <textarea
                ref={inputRef}
                className="max-h-32 min-h-[44px] flex-1 resize-none bg-transparent text-[13px] text-slate-100 outline-none placeholder:text-slate-500"
                placeholder="Describe the website, game, or app you want Odysseus to build…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
              />
              <div className="flex flex-col items-end gap-1 text-[10px] text-slate-400">
                <button
                  type="submit"
                  disabled={!input.trim() || isThinking}
                  className="inline-flex items-center gap-1 rounded-full bg-sky-500 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-black hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-600"
                >
                  <span>Build</span>
                  <span>↵</span>
                </button>
                <span className="hidden sm:inline">
                  ⌘↵ to build · Targets: {selectedPlatforms.length > 0 ? selectedPlatforms.length : "none"}
                </span>
              </div>
            </form>
          </div>
        </section>

        {/* Right: Preview canvas, build preview & status */}
        <aside className="hidden w-80 flex-col border-l border-white/10 bg-black/90 px-3 py-3 text-xs lg:flex">
          {/* PREVIEW CANVAS */}
          <div className="mb-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              Live layout preview
            </p>
            <div className="mt-2 rounded-2xl border border-white/10 bg-white/5 p-3">
              {/* Platform tabs */}
              <div className="mb-2 flex flex-wrap gap-1">
                {availablePreviewPlatforms.map((id) => {
                  const label =
                    platformsList.find((p) => p.id === id)?.label ?? id;
                  const active = effectivePreviewPlatform === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setPreviewPlatform(id)}
                      className={`rounded-full px-2.5 py-0.5 text-[10px] ${
                        active
                          ? "bg-sky-500 text-black"
                          : "bg-black/60 text-slate-200 hover:bg-black/80"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* Device frame */}
              <div className="relative mx-auto aspect-[9/16] w-full max-w-[220px] rounded-[1.5rem] border border-white/15 bg-gradient-to-b from-slate-900 via-black to-black p-2 shadow-[0_0_40px_rgba(56,189,248,0.3)]">
                {/* status bar notch */}
                <div className="mx-auto mb-1 h-1 w-10 rounded-full bg-white/20" />
                {/* top bar */}
                <div className="mb-2 flex items-center justify-between rounded-xl bg-white/5 px-2 py-1">
                  <span className="truncate text-[9px] text-slate-100">
                    {previewLabel}
                  </span>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                </div>

                {/* screen content */}
                <div className="flex flex-1 flex-col gap-1.5">
                  <div className="rounded-lg bg-sky-500/20 px-2 py-1">
                    <p className="line-clamp-2 text-[9px] text-sky-100">
                      {lastUserMessage
                        ? lastUserMessage
                        : "Your last command will appear here as the app intent."}
                    </p>
                  </div>
                  <div className="grid flex-1 grid-rows-3 gap-1.5">
                    <div className="rounded-md bg-white/5" />
                    <div className="rounded-md bg-white/5" />
                    <div className="flex gap-1.5">
                      <div className="flex-1 rounded-md bg-white/5" />
                      <div className="flex-1 rounded-md bg-white/5" />
                    </div>
                  </div>
                  {/* bottom nav / controls */}
                  <div className="mt-1 flex items-center justify-around rounded-xl bg-white/5 px-2 py-1">
                    <span className="h-2 w-6 rounded-full bg-slate-400/70" />
                    <span className="h-2 w-2 rounded-full bg-slate-500/80" />
                    <span className="h-2 w-2 rounded-full bg-slate-500/40" />
                    <span className="h-2 w-2 rounded-full bg-slate-500/40" />
                  </div>
                </div>
              </div>

              <p className="mt-2 text-[10px] text-slate-500">
                This is a conceptual preview of layout and navigation. When
                connected to your backend, Odysseus can populate it with real
                screens and components.
              </p>
            </div>
          </div>

          {/* Build preview */}
          <div className="mb-3 border-t border-white/10 pt-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              Build summary
            </p>
            <div className="mt-2 rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-[11px] text-slate-300">
                Selected platforms ({selectedPlatforms.length}):
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {selectedPlatforms.length === 0 ? (
                  <span className="rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-slate-400">
                    None selected
                  </span>
                ) : (
                  selectedPlatforms.map((id) => {
                    const label =
                      platformsList.find((p) => p.id === id)?.label ?? id;
                    return (
                      <span
                        key={id}
                        className="rounded-full bg-black/70 px-2 py-0.5 text-[10px] text-slate-100"
                      >
                        {label}
                      </span>
                    );
                  })
                )}
              </div>
              <p className="mt-2 text-[10px] text-slate-500">
                When you connect your backend, this panel will show actual build
                status, logs, and links to preview deployments.
              </p>
            </div>
          </div>

          {/* Status by platform */}
          <div className="mb-3 border-t border-white/10 pt-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                Status by platform
              </span>
              <button className="text-[10px] text-sky-300 hover:text-sky-200">
                Refresh
              </button>
            </div>
            <div className="space-y-1.5">
              {platformsList.map((p) => {
                const active = selectedPlatforms.includes(p.id);
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-lg bg-white/5 px-2.5 py-1.5"
                  >
                    <div>
                      <p className="text-[11px] text-slate-100">{p.label}</p>
                      <p className="text-[10px] text-slate-500">
                        {active ? "Ready to generate" : "Not selected"}
                      </p>
                    </div>
                    <span
                      className={`h-2 w-2 rounded-full ${
                        active ? "bg-emerald-400" : "bg-slate-600"
                      }`}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Project structure */}
          <div className="border-t border-white/10 pt-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              Project structure (concept)
            </p>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3 font-mono text-[10px] text-slate-200">
              <p>/{projectName || "app"}</p>
              <p className="ml-2">/design-system</p>
              <p className="ml-2">/shared-logic</p>
              <p className="ml-2">/platforms</p>
              {selectedPlatforms.includes("web") && (
                <p className="ml-4">/web · Next.js / React</p>
              )}
              {selectedPlatforms.includes("ios") && (
                <p className="ml-4">/ios · SwiftUI</p>
              )}
              {selectedPlatforms.includes("android") && (
                <p className="ml-4">/android · Kotlin / Jetpack</p>
              )}
              {selectedPlatforms.includes("smart-tv") && (
                <p className="ml-4">/smart-tv · tvOS / Tizen / WebOS shell</p>
              )}
              {selectedPlatforms.includes("game") && (
                <p className="ml-4">/game · WebGL / engine integration</p>
              )}
              <p className="ml-2 mt-1 text-[9px] text-slate-500">
                Odysseus will map your command to shared entities, screens, and
                platform shells when wired to the backend.
              </p>
            </div>
          </div>

          <div className="mt-3 border-t border-white/10 pt-3">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              Safety
            </p>
            <p className="text-[10px] text-slate-500">
              The builder agent only writes into generated projects and never
              touches your existing repos unless you explicitly approve it.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
