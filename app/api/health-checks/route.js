import { NextResponse } from "next/server";
import { getSessionFromRequest, isAdminUser } from "@/lib/access-control";
import {
  addHealthTarget,
  getHealthSettings,
  muteHealthTarget,
  removeHealthTarget,
  unmuteHealthTarget,
} from "@/lib/admin-settings";
import { writeAuditLog } from "@/lib/audit-log";
import { runHealthChecks } from "@/lib/health-checks";
import {
  buildHealthAlerts,
  getHealthAlertRules,
  groupHealthHistory,
  recordHealthSnapshot,
} from "@/lib/health-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const session = getSessionFromRequest(request);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const snapshot = await runHealthChecks();
  const history = await recordHealthSnapshot(snapshot);
  const healthSettings = await getHealthSettings();

  return NextResponse.json({
    ...snapshot,
    alerts: buildHealthAlerts({
      history,
      mutedTargets: healthSettings.mutedTargets,
      snapshot,
    }),
    history: groupHealthHistory(history),
    mutedTargets: healthSettings.mutedTargets,
    rules: getHealthAlertRules(),
  });
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

    if (body?.action === "mute") {
      const health = await muteHealthTarget({
        minutes: body.minutes,
        reason: body.reason,
        targetId: body.id,
      });

      await writeAuditLog({
        action: "health.target.mute",
        minutes: body.minutes,
        targetId: body.id,
        user: session.username,
      });

      return NextResponse.json({ health, ok: true });
    }

    if (body?.action === "unmute") {
      const health = await unmuteHealthTarget(body.id);

      await writeAuditLog({
        action: "health.target.unmute",
        targetId: body.id,
        user: session.username,
      });

      return NextResponse.json({ health, ok: true });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
