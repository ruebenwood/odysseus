import Link from "next/link";

export const dynamic = "force-dynamic"; // safe if later adding dynamic bits

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default function LoginPage({ searchParams }: PageProps) {
  const next = (searchParams?.next as string | undefined) ?? "/";
  const message = (searchParams?.message as string | undefined) ?? "";

  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-br from-[#080d1c] via-[#0d162d] to-[#0c1c3a] px-6 py-12 text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(124,58,237,0.15),transparent_32%),radial-gradient(circle_at_82%_8%,rgba(56,189,248,0.14),transparent_30%)]" />
      <div className="relative mx-auto max-w-md rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-indigo-900/30 backdrop-blur">
        <h1 className="text-2xl font-semibold mb-2 tracking-tight">Odysseus Console Login</h1>
        <p className="text-sm text-slate-300 mb-4">
          Styled in the spirit of Lindy.ai. Use the default password <code className="text-indigo-200">letmein</code> unless you set <code className="text-indigo-200">ODYSSEUS_CONSOLE_PASSWORD</code>.
        </p>

        {message ? (
          <p className="mb-3 rounded-lg border border-amber-300/40 bg-amber-300/10 px-3 py-2 text-sm text-amber-100">
            {message}
          </p>
        ) : null}

        <form action="/api/login" method="post" className="space-y-3">
          <input type="hidden" name="next" value={next} />
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-200">Password</label>
            <input
              type="password"
              name="password"
              className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none backdrop-blur placeholder:text-slate-400 focus:border-indigo-300/60 focus:ring-2 focus:ring-indigo-400/40"
              placeholder="default: letmein"
              required
            />
            <p className="text-xs text-slate-400">
              You will be redirected to <code>{next}</code> after login.
            </p>
          </div>
          <button
            type="submit"
            className="w-full rounded-xl bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-400 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-900/30 transition hover:brightness-110"
          >
            Sign in
          </button>
        </form>

        <p className="text-xs mt-4 text-slate-400">
          <Link href="/" className="text-indigo-200 hover:text-indigo-100">Back home</Link>
        </p>
      </div>
    </main>
  );
}
