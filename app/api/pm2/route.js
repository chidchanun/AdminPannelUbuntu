import { NextResponse } from "next/server";
import { canControlServices, canRestartServices, getSessionFromRequest } from "@/lib/access-control";
import { writeAuditLog } from "@/lib/audit-log";
import { listPm2Processes, runPm2Action } from "@/lib/pm2-control";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const session = getSessionFromRequest(request);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await listPm2Processes();
  const online = result.processes.filter((item) => item.status === "online").length;
  const stopped = result.processes.filter((item) => item.status === "stopped").length;
  const errored = result.processes.filter((item) => item.status === "errored").length;

  return NextResponse.json({
    error: result.error,
    processes: result.processes,
    summary: {
      errored,
      online,
      stopped,
      total: result.processes.length,
    },
    updatedAt: new Date().toISOString(),
  });
}

export async function POST(request) {
  const session = getSessionFromRequest(request);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const action = String(body?.action || "").trim().toLowerCase();
  const name = String(body?.name || "").trim();
  const canRunAction =
    action === "restart" || action === "reload"
      ? canRestartServices(session.username)
      : canControlServices(session.username);

  if (!canRunAction) {
    await writeAuditLog({
      action: "pm2.action.denied",
      pm2Action: action,
      process: name,
      reason: "permission denied",
      user: session.username,
    });

    return NextResponse.json({ error: "PM2 action permission denied." }, { status: 403 });
  }

  try {
    const output = await runPm2Action(action, name);

    await writeAuditLog({
      action: `pm2.${action}`,
      process: name,
      user: session.username,
    });

    return NextResponse.json({
      action,
      completedAt: new Date().toISOString(),
      ok: true,
      output,
      process: name,
    });
  } catch (error) {
    await writeAuditLog({
      action: `pm2.${action}.failed`,
      error: error.message,
      process: name,
      user: session.username,
    });

    return NextResponse.json({ error: error.message, process: name }, { status: 500 });
  }
}
