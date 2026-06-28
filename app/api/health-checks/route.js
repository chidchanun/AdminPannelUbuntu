import { NextResponse } from "next/server";
import { getSessionFromRequest, isAdminUser } from "@/lib/access-control";
import { addHealthTarget, removeHealthTarget } from "@/lib/admin-settings";
import { writeAuditLog } from "@/lib/audit-log";
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

export async function POST(request) {
  const session = getSessionFromRequest(request);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAdminUser(session.username)) {
    return NextResponse.json({ error: "Health settings permission denied." }, { status: 403 });
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  try {
    if (body?.action === "add-http") {
      const health = await addHealthTarget({
        label: body.label,
        logType: body.logType,
        pm2Name: body.pm2Name,
        type: "http",
        url: body.url,
      });

      await writeAuditLog({
        action: "health.target.add",
        label: body.label,
        logType: body.logType,
        pm2Name: body.pm2Name,
        type: "http",
        url: body.url,
        user: session.username,
      });

      return NextResponse.json({ health, ok: true });
    }

    if (body?.action === "remove") {
      const health = await removeHealthTarget(body.id);

      await writeAuditLog({
        action: "health.target.remove",
        id: body.id,
        user: session.username,
      });

      return NextResponse.json({ health, ok: true });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
