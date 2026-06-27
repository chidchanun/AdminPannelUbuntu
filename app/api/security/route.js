import { NextResponse } from "next/server";
import { getSessionFromRequest, isAdminUser } from "@/lib/access-control";
import { writeAuditLog } from "@/lib/audit-log";
import { blockIp, getThreatSnapshot, unblockIp } from "@/lib/threat-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requireAdmin(request) {
  const session = getSessionFromRequest(request);

  if (!session) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  if (!isAdminUser(session.username)) {
    return {
      error: NextResponse.json({ error: "Security permission denied." }, { status: 403 }),
    };
  }

  return { session };
}

export async function GET(request) {
  const { error } = requireAdmin(request);

  if (error) {
    return error;
  }

  return NextResponse.json({
    ...getThreatSnapshot(),
    updatedAt: new Date().toISOString(),
  });
}

export async function POST(request) {
  const { error, session } = requireAdmin(request);

  if (error) {
    return error;
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const action = body?.action;
  const ip = String(body?.ip || "").trim();

  if (!ip) {
    return NextResponse.json({ error: "IP is required." }, { status: 400 });
  }

  if (action === "block") {
    blockIp(ip, "manual block", {
      source: "security page",
      user: session.username,
    });

    await writeAuditLog({
      action: "security.ip.block",
      ip,
      user: session.username,
    });

    return NextResponse.json({ ok: true });
  }

  if (action === "unblock") {
    const removed = unblockIp(ip);

    await writeAuditLog({
      action: "security.ip.unblock",
      ip,
      removed,
      user: session.username,
    });

    return NextResponse.json({ ok: true, removed });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
