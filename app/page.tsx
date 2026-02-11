import Link from "next/link";

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-br from-[#080d1c] via-[#0c1125] to-[#0b1a32] px-6 py-16 text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(124,58,237,0.15),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(59,130,246,0.12),transparent_30%),radial-gradient(circle_at_50%_80%,rgba(45,212,191,0.12),transparent_30%)]" />
      <div className="relative mx-auto max-w-5xl grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/5 px-4 py-2 text-xs font-medium text-indigo-200 ring-1 ring-white/10">
            Lindy-inspired AI engineer
          </p>
          <h1 className="text-4xl font-semibold leading-tight md:text-5xl">
            Build like <span className="text-indigo-300">Lindy.ai</span>, across web & mobile.
          </h1>
          <p className="text-base text-slate-300 md:text-lg">
            Odysseus is your autonomous software architect—plan, design, and ship Next.js and Expo apps from one console. Point it at your repo and let it work.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/odysseus"
              className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-400 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-900/30 transition hover:brightness-110"
            >
              Open Odysseus Console
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-xl border border-white/15 px-4 py-2.5 text-sm font-medium text-slate-200 backdrop-blur transition hover:border-white/30"
            >
              Admin Login
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-3 text-sm text-slate-300 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-lg shadow-indigo-900/20">
              <p className="text-xs uppercase tracking-wide text-indigo-200">Modes</p>
              <p className="mt-1">Build, Design, Refactor, Analyze, Deploy, API, Mobile.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-lg shadow-indigo-900/20">
              <p className="text-xs uppercase tracking-wide text-indigo-200">Stacks</p>
              <p className="mt-1">Next.js + React, Expo + React Native, with monorepo-friendly prompts.</p>
            </div>
          </div>
        </div>
        <div className="relative">
          <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-indigo-500/20 via-purple-500/10 to-cyan-400/10 blur-3xl" />
          <div className="relative rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-indigo-900/30 backdrop-blur">
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span>Odysseus.ai console</span>
              <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-emerald-200">Secure</span>
            </div>
            <div className="mt-4 space-y-3 text-sm">
              <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                <p className="text-indigo-200">Mode</p>
                <p className="text-slate-200">Build (Next.js + Expo)</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                <p className="text-indigo-200">Task</p>
                <p className="text-slate-200">“Create a dashboard with filters, charts, and Supabase auth.”</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                <p className="text-indigo-200">Result</p>
                <p className="text-slate-200">Monorepo scaffolded, protected routes, and mock data API wired.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
