import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { password } = await req.json().catch(() => ({}));

  const expected = process.env.ODYSSEUS_CONSOLE_PASSWORD;
  if (!expected) {
    return NextResponse.json(
      { error: "Server misconfigured: ODYSSEUS_CONSOLE_PASSWORD is not set." },
      { status: 500 }
    );
  }

  if (!password || password !== expected) {
    return NextResponse.json({ error: "Invalid password." }, { status: 401 });
  }

  const res = NextResponse.json({ success: true });

  res.cookies.set("odysseus_auth", "1", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });

  return res;
}
