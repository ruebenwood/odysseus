import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeNext(raw: string | null | undefined): string {
  if (raw && raw.startsWith("/")) return raw;
  return "/";
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const password = String(form.get("password") ?? "");
  const next = normalizeNext(form.get("next") as string | null | undefined);
  const expected = process.env.ODYSSEUS_CONSOLE_PASSWORD ?? "letmein";

  const redirectUrl = new URL(req.url);

  const ok = password && password === expected;

  redirectUrl.pathname = ok ? next : "/login";
  redirectUrl.searchParams.delete("message");
  redirectUrl.searchParams.delete("next");

  if (!ok) {
    redirectUrl.searchParams.set("message", "Invalid password");
    redirectUrl.searchParams.set("next", next);
    return NextResponse.redirect(redirectUrl, { status: 303 });
  }

  const res = NextResponse.redirect(redirectUrl, { status: 303 });
  res.cookies.set("odysseus_auth", "1", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return res;
}
