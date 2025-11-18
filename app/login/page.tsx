import Link from "next/link";

export const dynamic = "force-dynamic"; // safe if later adding dynamic bits

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default function LoginPage({ searchParams }: PageProps) {
  const next = (searchParams?.next as string | undefined) ?? "/";
  const message = (searchParams?.message as string | undefined) ?? "";

  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="text-2xl font-semibold mb-4">Login</h1>

      {message ? <p className="mb-3 text-sm">{message}</p> : null}

      <form action="/api/login" method="post" className="space-y-3">
        <input type="hidden" name="next" value={next} />
        <div className="flex flex-col gap-1">
          <label className="text-sm">Password</label>
          <input
            type="password"
            name="password"
            className="border rounded p-2"
            placeholder="••••••••"
            required
          />
        </div>
        <button type="submit" className="w-full rounded px-4 py-2 border">
          Sign in
        </button>
      </form>

      <p className="text-xs mt-4">
        You will be redirected to <code>{next}</code>. <Link href="/">Back home</Link>
      </p>
    </main>
  );
}
