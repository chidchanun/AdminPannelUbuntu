import { NextResponse } from "next/server";
import { canManageFirewall, getSessionFromRequest, isAdminUser } from "@/lib/access-control";
import { writeAuditLog } from "@/lib/audit-log";
import { blockFirewallIp, isValidFirewallTarget } from "@/lib/firewall-control";
import {
  addWhitelistEntry,
  loadPersistentBlocks,
  persistBlock,
  persistCurrentBlocks,
  removeWhitelistEntry,
  removePersistentBlock,
  getSecuritySettings,
  updateSecuritySettings,
} from "@/lib/security-block-store";
import { getServerSecuritySnapshot } from "@/lib/server-security-monitor";
import { getThreatSnapshot, isWhitelistedIp } from "@/lib/threat-guard";

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

function isPrivateOrLocalIp(ip) {
  return (
    ip === "unknown" ||
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    /^fe80:/i.test(ip) ||
    /^fc[0-9a-f]:/i.test(ip) ||
    /^fd[0-9a-f]:/i.test(ip)
  );
}

function collectAutoBlockCandidates(server, settings) {
  const candidates = new Map();

  for (const item of server.connections.alerts || []) {
    candidates.set(item.ip, {
      details: item,
      ip: item.ip,
      reason: `port alert: ${item.reasons.join(", ")}`,
    });
  }

  for (const item of server.webLogs.suspicious || []) {
    candidates.set(item.ip, {
      details: item,
      ip: item.ip,
      reason: "web log scan detected",
    });
  }

  for (const item of server.auth.failedByIp || []) {
    candidates.set(item.ip, {
      details: item,
      ip: item.ip,
      reason: "ssh failed login threshold exceeded",
    });
  }

  return [...candidates.values()].filter((item) => {
    if (!isValidFirewallTarget(item.ip)) {
      return false;
    }

    return (
      !isWhitelistedIp(item.ip) &&
      (settings.autoBlockPrivateIps || !isPrivateOrLocalIp(item.ip))
    );
  });
}

async function applyAutoBlocks(server, settings) {
  const existingBlocks = new Set(getThreatSnapshot().blocked.map((block) => block.ip));
  const candidates = collectAutoBlockCandidates(server, settings).filter(
    (candidate) => !existingBlocks.has(candidate.ip),
  );
  const results = [];

  if (!settings.autoAppBlock && !settings.autoFirewallBlock) {
    return results;
  }

  for (const candidate of candidates) {
    if (settings.autoAppBlock) {
      await persistBlock(candidate.ip, candidate.reason, {
        ...candidate.details,
        source: "auto security monitor",
      });
      results.push({ action: "app-block", ip: candidate.ip, ok: true });

      await writeAuditLog({
        action: "security.auto.app_block",
        ip: candidate.ip,
        reason: candidate.reason,
      });
    }

    if (settings.autoFirewallBlock) {
      try {
        const result = await blockFirewallIp(candidate.ip);

        results.push({
          action: "firewall-block",
          ip: candidate.ip,
          ok: true,
          output: result.output,
        });

        await writeAuditLog({
          action: "security.auto.firewall_block",
          ip: candidate.ip,
          output: result.output,
          reason: candidate.reason,
        });
      } catch (error) {
        results.push({
          action: "firewall-block",
          error: error.message,
          ip: candidate.ip,
          ok: false,
        });

        await writeAuditLog({
          action: "security.auto.firewall_block.failed",
          error: error.message,
          ip: candidate.ip,
          reason: candidate.reason,
        });
      }
    }
  }

  return results;
}

export async function GET(request) {
  const { error } = requireAdmin(request);

  if (error) {
    return error;
  }

  await loadPersistentBlocks();
  const settings = await getSecuritySettings();
  const server = await getServerSecuritySnapshot();
  const autoBlocks = await applyAutoBlocks(server, settings);
  await persistCurrentBlocks();

  return NextResponse.json({
    ...getThreatSnapshot(),
    autoBlocks,
    server,
    settings,
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

  if (action === "settings") {
    const settings = await updateSecuritySettings(body?.settings || {});

    await writeAuditLog({
      action: "security.settings.update",
      settings,
      user: session.username,
    });

    return NextResponse.json({ ok: true, settings });
  }

  if (action === "whitelist-add") {
    const entry = String(body?.entry || "").trim();

    if (!entry || !isValidFirewallTarget(entry)) {
      return NextResponse.json({ error: "Valid IP or CIDR is required." }, { status: 400 });
    }

    const settings = await addWhitelistEntry(entry);
    const removed = await removePersistentBlock(entry);

    await writeAuditLog({
      action: "security.whitelist.add",
      entry,
      removedExistingBlock: removed,
      user: session.username,
    });

    return NextResponse.json({ ok: true, settings });
  }

  if (action === "whitelist-remove") {
    const entry = String(body?.entry || "").trim();

    if (!entry) {
      return NextResponse.json({ error: "Whitelist entry is required." }, { status: 400 });
    }

    const settings = await removeWhitelistEntry(entry);

    await writeAuditLog({
      action: "security.whitelist.remove",
      entry,
      user: session.username,
    });

    return NextResponse.json({ ok: true, settings });
  }

  const ip = String(body?.ip || "").trim();

  if (!ip) {
    return NextResponse.json({ error: "IP is required." }, { status: 400 });
  }

  if (action === "block") {
    await getSecuritySettings();

    if (isWhitelistedIp(ip)) {
      return NextResponse.json({ error: "IP is whitelisted and cannot be blocked." }, { status: 409 });
    }

    await persistBlock(ip, "manual block", {
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
    const removed = await removePersistentBlock(ip);

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
      await getSecuritySettings();

      if (isWhitelistedIp(ip)) {
        return NextResponse.json(
          { error: "IP is whitelisted and cannot be firewall blocked." },
          { status: 409 },
        );
      }

      const result = await blockFirewallIp(ip);

      await persistBlock(ip, "firewall block requested", {
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
