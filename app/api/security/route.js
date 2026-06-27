import { NextResponse } from "next/server";
import { canManageFirewall, getSessionFromRequest, isAdminUser } from "@/lib/access-control";
import { writeAuditLog } from "@/lib/audit-log";
import { blockFirewallIp } from "@/lib/firewall-control";
import { getServerSecuritySnapshot } from "@/lib/server-security-monitor";
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

  const server = await getServerSecuritySnapshot();

  return NextResponse.json({
    ...getThreatSnapshot(),
    server,
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

  if (action === "firewall-block") {
    if (!canManageFirewall(session.username)) {
      return NextResponse.json({ error: "Firewall permission denied." }, { status: 403 });
    }

    try {
      const result = await blockFirewallIp(ip);

      blockIp(ip, "firewall block requested", {
        source: "security page",
        user: session.username,
      });

      await writeAuditLog({
        action: "security.firewall.block",
        ip,
        output: result.output,
        user: session.username,
      });

      return NextResponse.json({ ok: true, output: result.output });
    } catch (firewallError) {
      await writeAuditLog({
        action: "security.firewall.block.failed",
        error: firewallError.message,
        ip,
        user: session.username,
      });

      return NextResponse.json({ error: firewallError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
