"use client";

import { FormEvent, useRef, useState } from "react";

const quickPrompts = [
  "Compare our US vs EU data retention rules.",
  "Draft an email announcing the updated security policy.",
  "List open risks related to vendor data sharing.",
  "Summarize every change to our PTO policy in 2025.",
];

type MessageRole = "user" | "agent";

interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: string;
}

const starterMessages: Message[] = [
  {
    id: "1",
    role: "agent",
    content:
      "Hi, I’m your Odysseus agent. Ask me anything about your policies, specs, or project docs. I’ll answer with citations and drafts you can edit.",
    timestamp: "09:01",
  },
  {
    id: "2",
    role: "user",
    content:
      "Give me a summary of the latest changes to our information security policy, and flag anything that impacts EU customer data.",
    timestamp: "09:02",
  },
  {
    id: "3",
    role: "agent",
    content:
      "Here’s a high-level summary:\n\n• Data retention for inactive EU customers reduced from 24 → 18 months.\n• Incident response SLA shortened from 24h → 12h.\n• Vendors must now provide SOC 2 Type II or equivalent.\n\nI’ve highlighted the relevant sections in the documents on the right.",
    timestamp: "09:03",
  },
];

export default function OdysseusAgentPage() {
  const [messages, setMessages] = useState<Message[]>(starterMessages);
  const [input, setInput] = useState("");
  const [activeSpace, setActiveSpace] = useState("Compliance workspace");
  const [activeAgent, setActiveAgent] = useState("Policy analyst");
  const [isThinking, setIsThinking] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const handleSend = (e?: FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isThinking) return;

    const now = new Date();
    const time = now.toTimeString().slice(0, 5);

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
      timestamp: time,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsThinking(true);

    // Stubbed agent response; wire to backend later.
    setTimeout(() => {
      const agentMessage: Message = {
        id: crypto.randomUUID(),
        role: "agent",
        content:
          "Here’s a placeholder response from your Odysseus agent. This is where you’ll plug in your backend / API. I’ll also attach the most relevant documents in the right-hand panel.",
        timestamp: new Date().toTimeString().slice(0, 5),
      };
      setMessages((prev) => [...prev, agentMessage]);
      setIsThinking(false);
    }, 900);
  };

  const handleQuickPrompt = (q: string) => {
    setInput(q);
    inputRef.current?.focus();
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#050509] text-slate-100">
      {/* Top bar */}
      <header className="flex h-14 items-center justify-between border-b border-white/10 bg-black/60 px-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-sky-400/40 bg-sky-500/15 text-[11px] font-semibold tracking-[0.25em]">
            O
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold">Odysseus.ai</span>
            <span className="text-[11px] uppercase tracking-[0.25em] text-slate-400">
              Agent Workspace
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <button className="hidden items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-slate-200 hover:border-sky-400 md:inline-flex">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Connected to knowledge graph
          </button>

          <div className="hidden items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] md:flex">
            <span className="text-slate-400">Workspace</span>
            <span className="h-3 w-px bg-white/20" />
            <span className="font-medium">{activeSpace}</span>
            <span className="text-slate-400">▾</span>
          </div>

          <button className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-emerald-400 text-[11px] font-semibold">
            RW
          </button>
        </div>
      </header>

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left rail: spaces / agents */}
        <aside className="hidden w-64 flex-col border-r border-white/10 bg-black/80 px-3 py-3 text-xs md:flex">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              Spaces
            </span>
            <button className="rounded-full bg-white/5 px-2 py-1 text-[10px] text-slate-300 hover:bg-white/10">
              New
            </button>
          </div>

          <div className="space-y-1">
            {["Compliance workspace", "Product & engineering", "Operations & HR", "Customer knowledge"].map((space) => (
              <button
                key={space}
                onClick={() => setActiveSpace(space)}
                className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left ${
                  activeSpace === space
                    ? "bg-sky-500/15 text-sky-100"
                    : "text-slate-300 hover:bg-white/5"
                }`}
              >
                <span className="truncate text-[11px]">{space}</span>
                {activeSpace === space && <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />}
              </button>
            ))}
          </div>

          <div className="mt-6 border-t border-white/10 pt-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                Agents
              </span>
              <button className="rounded-full bg-white/5 px-2 py-1 text-[10px] text-slate-300 hover:bg-white/10">
                Manage
              </button>
            </div>

            <div className="space-y-1">
              {["Policy analyst", "Contract reviewer", "Research assistant", "Ops playbook helper"].map((agent) => (
                <button
                  key={agent}
                  onClick={() => setActiveAgent(agent)}
                  className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left ${
                    activeAgent === agent
                      ? "bg-sky-500/15 text-sky-100"
                      : "text-slate-300 hover:bg-white/5"
                  }`}
                >
                  <span className="truncate text-[11px]">{agent}</span>
                  {activeAgent === agent && <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-auto border-t border-white/10 pt-3">
            <button className="flex w-full items-center justify-center rounded-lg bg-white/5 px-2 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-200 hover:bg-white/10">
              + New conversation
            </button>
          </div>
        </aside>

        {/* Middle: chat */}
        <section className="flex min-w-0 flex-1 flex-col bg-gradient-to-b from-black via-[#050509] to-black">
          {/* Breadcrumb */}
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-xs">
            <div className="flex flex-wrap items-center gap-2 text-slate-400">
              <span className="hidden text-[11px] md:inline">{activeSpace}</span>
              <span className="hidden h-3 w-px bg-white/20 md:inline" />
              <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-slate-300">{activeAgent}</span>
              <span className="h-3 w-px bg-white/20" />
              <span className="text-[11px] text-slate-500">
                Odysseus is using your connected docs as context only.
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <span className="hidden sm:inline">History</span>
              <span className="h-3 w-px bg-white/20" />
              <span className="hidden sm:inline">Autosaving</span>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </div>
          </div>

          {/* Messages */}
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 text-xs">
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-xl rounded-2xl px-3 py-2 leading-relaxed ${
                    m.role === "user"
                      ? "bg-sky-500/90 text-black"
                      : "bg-white/5 border border-white/10 text-slate-100"
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between text-[10px]">
                    <span className="font-semibold">{m.role === "user" ? "You" : "Odysseus agent"}</span>
                    <span className={m.role === "user" ? "text-sky-900/80" : "text-slate-400"}>{m.timestamp}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-[11px]">{m.content}</p>
                </div>
              </div>
            ))}

            {isThinking && (
              <div className="flex justify-start">
                <div className="flex max-w-xs items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-slate-300">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-sky-400" />
                  Thinking with your documents…
                </div>
              </div>
            )}
          </div>

          {/* Composer */}
          <div className="border-t border-white/10 bg-black/70 px-4 py-3">
            {/* Quick actions */}
            <div className="mb-2 flex flex-wrap gap-2 text-[11px]">
              {quickPrompts.map((q) => (
                <button
                  key={q}
                  onClick={() => handleQuickPrompt(q)}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-300 hover:border-sky-400 hover:text-white"
                >
                  {q}
                </button>
              ))}
            </div>

            <form
              onSubmit={handleSend}
              className="flex items-end gap-2 rounded-2xl border border-white/15 bg-black/80 px-3 py-2"
            >
              <textarea
                ref={inputRef}
                className="max-h-32 min-h-[44px] flex-1 resize-none bg-transparent text-[13px] text-slate-100 outline-none placeholder:text-slate-500"
                placeholder="Ask your Odysseus agent anything about your docs…"
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
                  <span>Send</span>
                  <span>↵</span>
                </button>
                <span className="hidden sm:inline">⌘↵ to send · Context: workspace docs</span>
              </div>
            </form>
          </div>
        </section>

        {/* Right inspector: context / docs / tools */}
        <aside className="hidden w-80 flex-col border-l border-white/10 bg-black/90 px-3 py-3 text-xs lg:flex">
          <div className="mb-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              Context
            </span>
            <div className="mt-2 space-y-2">
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[11px] text-slate-300">Active workspace</span>
                  <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] text-sky-200">Live</span>
                </div>
                <p className="text-[11px] font-medium text-slate-100">{activeSpace}</p>
                <p className="mt-1 text-[11px] text-slate-400">
                  Using connected drives, wikis, and scanned PDFs as context.
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="mb-2 text-[11px] text-slate-300">Filters in this conversation</p>
                <div className="flex flex-wrap gap-1.5">
                  {["Policies", "Contracts", "EU", "Last 12 months"].map((tag) => (
                    <span key={tag} className="rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-slate-200">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="mb-3 border-t border-white/10 pt-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                Documents in context
              </span>
              <button className="text-[10px] text-sky-300 hover:text-sky-200">View all</button>
            </div>
            <div className="space-y-1.5">
              {[
                { title: "Information Security Policy v4.2", meta: "PDF · Updated 12d ago · Legal", status: "Primary" },
                { title: "InfoSec Policy – Q1 2025 redline", meta: "DOCX · Updated 9d ago · Legal", status: "Redline" },
                { title: "Vendor Data Processing Addendum", meta: "PDF · Signed · 2025", status: "Reference" },
              ].map((doc) => (
                <button
                  key={doc.title}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-left hover:border-sky-400"
                >
                  <div className="flex items-center justify-between">
                    <p className="line-clamp-1 text-[11px] font-medium text-slate-100">{doc.title}</p>
                    <span className="ml-2 rounded-full bg-black/70 px-2 py-0.5 text-[9px] text-slate-300">{doc.status}</span>
                  </div>
                  <p className="mt-0.5 text-[10px] text-slate-400">{doc.meta}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-auto border-t border-white/10 pt-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              Tools this agent can use
            </span>
            <div className="mt-2 space-y-1.5">
              {["Semantic search across docs", "Summarize & explain", "Compare versions / redline", "Draft email / policy / summary", "Extract structured data"].map((tool) => (
                <label
                  key={tool}
                  className="flex items-center justify-between rounded-lg bg-white/5 px-2.5 py-1.5"
                >
                  <span className="text-[11px] text-slate-200">{tool}</span>
                  <input type="checkbox" defaultChecked className="h-3 w-3 rounded border-white/40 bg-black" />
                </label>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-slate-500">
              Odysseus never changes your source documents without explicit approval.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
