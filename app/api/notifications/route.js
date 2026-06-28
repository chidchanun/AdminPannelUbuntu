import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/access-control";
import { readAuditLog } from "@/lib/audit-log";
import { runHealthChecks } from "@/lib/health-checks";
import { buildHealthAlerts, readHealthHistory } from "@/lib/health-history";
import { getThreatSnapshot } from "@/lib/threat-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function severityForAudit(entry) {
  if (/failed|denied|error/i.test(entry.action || "")) {
    return "critical";
  }

  if (/block|unblock|settings|save|service/i.test(entry.action || "")) {
    return "warning";
  }

  return "info";
}

function buildAuditNotifications(entries) {
  return entries
    .filter((entry) => /failed|denied|error|block|settings|service|save/i.test(entry.action || ""))
    .slice(0, 40)
    .map((entry) => ({
      at: entry.at,
      detail: entry.error || entry.reason || entry.path || entry.ip || entry.user || "",
      severity: severityForAudit(entry),
      source: "audit",
      title: entry.action,
    }));
}

function buildSecurityNotifications(snapshot) {
  const blockItems = snapshot.blocked.slice(0, 30).map((block) => ({
    at: block.blockedAt,
    detail: `${block.ip} - ${block.reason}`,
    severity: "critical",
    source: "security",
    title: "IP blocked",
  }));
  const scanItems = snapshot.scans.slice(0, 30).map((scan) => ({
    at: null,
    detail: `${scan.ip} - ${scan.count} suspicious paths`,
    severity: scan.count >= 3 ? "critical" : "warning",
    source: "security",
    title: "Path scan bucket",
  }));

  return [...blockItems, ...scanItems];
}

function buildHealthNotifications(health) {
  const unhealthy = health.unhealthy.map((item) => ({
    at: health.checkedAt,
    detail: item.error || item.statusText || item.status || "",
    severity: "critical",
    source: "health",
    title: `${item.label} is unhealthy`,
  }));

  return unhealthy;
}

export async function GET(request) {
  const session = getSessionFromRequest(request);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [audit, health, healthHistory] = await Promise.all([
    readAuditLog({ limit: 300 }),
    runHealthChecks(),
    readHealthHistory(),
  ]);
  const security = getThreatSnapshot();
  const notifications = [
    ...buildHealthAlerts({ history: healthHistory, snapshot: health }).map((alert) => ({
      ...alert,
      source: "health",
    })),
    ...buildHealthNotifications(health),
    ...buildSecurityNotifications(security),
    ...buildAuditNotifications(audit),
  ]
    .sort((a, b) => Date.parse(b.at || 0) - Date.parse(a.at || 0))
    .slice(0, 120);

  return NextResponse.json({
    counts: {
      critical: notifications.filter((item) => item.severity === "critical").length,
      info: notifications.filter((item) => item.severity === "info").length,
      warning: notifications.filter((item) => item.severity === "warning").length,
    },
    notifications,
    updatedAt: new Date().toISOString(),
  });
}
