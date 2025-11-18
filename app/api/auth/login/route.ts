import { NextRequest, NextResponse } from "next/server";

type ParsedBody = {
  password: string | null;
  next: string;
};

function normalizeNext(raw: string | null | undefined): string {
  if (raw && raw.startsWith("/")) return raw;
  return "/odysseus";
}

function redirectToLogin(req: NextRequest, message: string, next: string) {
  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("message", message);
  loginUrl.searchParams.set("next", next);
  return NextResponse.redirect(loginUrl);
}

async function parseBody(req: NextRequest): Promise<ParsedBody> {
  const contentType = req.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const isForm =
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data");

  if (isJson) {
    const data = await req.json().catch(() => ({} as Record<string, unknown>));
    const password = typeof data.password === "string" ? data.password : null;
    const next = normalizeNext(typeof data.next === "string" ? data.next : null);
    return { password, next };
  }

  if (isForm) {
    const formData = await req.formData().catch(() => null);
    const password = formData ? formData.get("password") : null;
    const nextRaw = formData ? formData.get("next") : null;
    return {
      password: typeof password === "string" ? password : null,
      next: normalizeNext(typeof nextRaw === "string" ? nextRaw : null),
    };
  }

  // Fallback: try JSON first, then form
  const data = await req.json().catch(() => ({} as Record<string, unknown>));
  const password = typeof data.password === "string" ? data.password : null;
  const next = normalizeNext(typeof data.next === "string" ? data.next : null);
  return { password, next };
}

export async function POST(req: NextRequest) {
  const expected = process.env.ODYSSEUS_CONSOLE_PASSWORD;
  const acceptsHtml = req.headers.get("accept")?.includes("text/html") ?? false;
  const { password, next } = await parseBody(req);

  if (!expected) {
    const message = "Server misconfigured: ODYSSEUS_CONSOLE_PASSWORD is not set.";
    if (acceptsHtml) {
      return redirectToLogin(req, message, next);
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (!password || password !== expected) {
    const message = "Invalid password.";
    if (acceptsHtml) {
      return redirectToLogin(req, message, next);
    }
    return NextResponse.json({ error: message }, { status: 401 });
  }

  const redirectUrl = new URL(next || "/odysseus", req.url);
  const response = acceptsHtml
    ? NextResponse.redirect(redirectUrl)
    : NextResponse.json({ success: true, next: redirectUrl.pathname });

  response.cookies.set("odysseus_auth", "1", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8, // 8 hours
  });

  return response;
}
