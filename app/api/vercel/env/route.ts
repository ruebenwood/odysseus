import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type EnvVar = { key: string; value: string; target?: ("production" | "preview" | "development")[] };
type SetEnvBody = {
  projectIdOrName: string;
  envs: EnvVar[];
  teamId?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as SetEnvBody;
    const token =
      req.headers.get("x-vercel-token") || process.env.VERCEL_TOKEN || "";
    if (!token) {
      return NextResponse.json(
        { error: "Missing Vercel token (x-vercel-token header or VERCEL_TOKEN env)" },
        { status: 400 }
      );
    }
    const { projectIdOrName, envs, teamId } = body;
    if (!projectIdOrName?.trim() || !Array.isArray(envs) || envs.length === 0) {
      return NextResponse.json({ error: "projectIdOrName and envs[] are required." }, { status: 400 });
    }

    const qs = new URLSearchParams();
    if (teamId) qs.set("teamId", teamId);

    const results: any[] = [];
    for (const ev of envs) {
      const res = await fetch(
        `https://api.vercel.com/v9/projects/${encodeURIComponent(projectIdOrName)}/env?${qs}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            key: ev.key,
            value: ev.value,
            target: ev.target ?? ["production", "preview", "development"],
            type: "encrypted",
          }),
        }
      );
      const data = await res.json();
      results.push({ key: ev.key, status: res.status, body: data });
    }

    return NextResponse.json({ results });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}
