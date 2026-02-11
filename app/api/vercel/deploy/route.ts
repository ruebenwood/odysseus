import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DeployBody = {
  name: string;
  files?: Record<string, string>;
  projectId?: string;
  teamId?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as DeployBody;
    const token =
      req.headers.get("x-vercel-token") || process.env.VERCEL_TOKEN || "";
    if (!token) {
      return NextResponse.json(
        { error: "Missing Vercel token (x-vercel-token header or VERCEL_TOKEN env)" },
        { status: 400 }
      );
    }
    if (!body?.name?.trim()) {
      return NextResponse.json({ error: "Deployment name is required." }, { status: 400 });
    }

    const payload: Record<string, unknown> = {
      name: body.name.trim(),
      projectSettings: { framework: "nextjs" },
    };

    const qs = new URLSearchParams();
    if (body.teamId) qs.set("teamId", body.teamId);

    const res = await fetch(`https://api.vercel.com/v13/deployments?${qs}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
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
