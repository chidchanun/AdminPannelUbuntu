import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/access-control";
import { runHealthChecks } from "@/lib/health-checks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const session = getSessionFromRequest(request);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(await runHealthChecks());
}
