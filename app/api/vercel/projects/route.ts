import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CreateProjectBody = {
  name: string;
  framework?: string; // e.g., "nextjs"
  teamId?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CreateProjectBody;
    const token =
      req.headers.get("x-vercel-token") || process.env.VERCEL_TOKEN || "";
    if (!token) {
      return NextResponse.json(
        { error: "Missing Vercel token (x-vercel-token header or VERCEL_TOKEN env)" },
        { status: 400 }
      );
    }
    if (!body?.name?.trim()) {
      return NextResponse.json({ error: "Project name is required." }, { status: 400 });
    }

    const res = await fetch("https://api.vercel.com/v10/projects", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: body.name.trim(),
        framework: body.framework || "nextjs",
        ...(body.teamId ? { teamId: body.teamId } : {}),
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json({ error: data?.error?.message || JSON.stringify(data) }, { status: res.status });
    }
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}
