import Link from "next/link";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default function LoginPage({ searchParams }: PageProps) {
  const next = (searchParams?.next as string | undefined) ?? "/odysseus";
  const message = (searchParams?.message as string | undefined) ?? "";

  return (
    <div className="min-h-screen bg-black text-neutral-100 flex items-center justify-center px-4">
      <div className="w-full max-w-md border border-neutral-800 rounded-2xl bg-neutral-950 p-6 shadow-2xl">
        <h1 className="text-xl font-semibold mb-1 tracking-tight">
          Odysseus<span className="text-blue-500">.ai</span> Console
        </h1>
        <p className="text-xs text-neutral-400 mb-4">
          Enter the access password to continue.
        </p>

        {message ? (
          <p className="text-xs text-red-400 bg-red-500/10 border border-red-600/50 rounded-lg px-3 py-2 mb-3">
            {message}
          </p>
        ) : null}

        <form action="/api/auth/login" method="post" className="space-y-3">
          <input type="hidden" name="next" value={next} />
          <div className="space-y-1">
            <label
              htmlFor="password"
              className="text-xs font-medium text-neutral-300"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              name="password"
              autoComplete="current-password"
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600"
              required
            />
          </div>

          <button
            type="submit"
            className="w-full inline-flex items-center justify-center rounded-xl bg-blue-600 hover:bg-blue-500 px-4 py-2.5 text-sm font-medium transition-colors"
          >
            Unlock Console
          </button>
        </form>

        <p className="text-xs text-neutral-400 mt-4">
          You will be redirected to <code>{next}</code> after login. {" "}
          <Link href="/">Back home</Link>
        </p>
      </div>
    </div>
  );
}
