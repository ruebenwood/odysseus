"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/odysseus";

  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Login failed.");
      }

      router.push(next);
      router.refresh();
    } catch (err: any) {
      setErrorMsg(err?.message || "Login failed.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-black text-neutral-100 flex items-center justify-center px-4">
      <div className="w-full max-w-md border border-neutral-800 rounded-2xl bg-neutral-950 p-6 shadow-2xl">
        <h1 className="text-xl font-semibold mb-1 tracking-tight">
          Odysseus<span className="text-blue-500">.ai</span> Console
        </h1>
        <p className="text-xs text-neutral-400 mb-4">
          Enter the access password to continue.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
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
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          {errorMsg && (
            <p className="text-xs text-red-500 bg-red-500/10 border border-red-600/50 rounded-lg px-3 py-2">
              {errorMsg}
            </p>
          )}

          <button
            type="submit"
            disabled={isLoading || !password}
            className="w-full inline-flex items-center justify-center rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 px-4 py-2.5 text-sm font-medium transition-colors"
          >
            {isLoading ? "Checking..." : "Unlock Console"}
          </button>
        </form>
      </div>
    </div>
  );
}
