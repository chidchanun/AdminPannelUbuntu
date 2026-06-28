import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getSessionFromRequest, isAdminUser } from "@/lib/access-control";
import { writeAuditLog } from "@/lib/audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);
const SYSTEMCTL_PATH = process.env.SYSTEMCTL_PATH || "systemctl";

function parseList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getRoleSettings() {
  return {
    adminUsers: parseList(process.env.ADMIN_USERS),
    fileWriteUsers: parseList(process.env.FILE_WRITE_USERS),
    firewallUsers: parseList(process.env.FIREWALL_USERS),
    loginAllowedUsers: parseList(process.env.LOGIN_ALLOWED_USERS),
    serviceControlUsers: parseList(process.env.SERVICE_CONTROL_USERS),
    serviceRestartUsers: parseList(process.env.SERVICE_RESTART_USERS),
  };
}

function requireAdmin(request) {
  const session = getSessionFromRequest(request);

  if (!session) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  if (!isAdminUser(session.username)) {
    return {
      error: NextResponse.json({ error: "Settings permission denied." }, { status: 403 }),
    };
  }

  return { session };
}

function getAdminSettingsStore() {
  return import("@/lib/admin-settings");
}

async function listAvailableServices() {
  if (process.platform !== "linux") {
    return [];
  }

  try {
    const { stdout } = await execFileAsync(SYSTEMCTL_PATH, [
      "list-units",
      "--type=service",
      "--all",
      "--no-pager",
      "--plain",
      "--legend=false",
    ]);

    return stdout
      .split("\n")
      .map((line) => line.trim().split(/\s+/)[0])
      .filter((name) => name?.endsWith(".service"))
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

export async function GET(request) {
  const { error } = requireAdmin(request);

  if (error) {
    return error;
  }

  const [{ getServiceSettings }, { getSecuritySettings }] = await Promise.all([
    getAdminSettingsStore(),
    import("@/lib/security-block-store"),
  ]);
  const [availableServices, service, security] = await Promise.all([
    listAvailableServices(),
    getServiceSettings(),
    getSecuritySettings(),
  ]);

  return NextResponse.json({
    availableServices,
    roles: getRoleSettings(),
    security,
    service,
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

  const updates = {};

  if (body?.service) {
    const { updateServiceSettings } = await getAdminSettingsStore();

    updates.service = await updateServiceSettings(body.service);
  }

  if (body?.security) {
    const { updateSecuritySettings } = await import("@/lib/security-block-store");

    updates.security = await updateSecuritySettings(body.security);
  }

  await writeAuditLog({
    action: "settings.update",
    sections: Object.keys(updates),
    user: session.username,
  });

  return NextResponse.json({
    ok: true,
    ...updates,
    updatedAt: new Date().toISOString(),
  });
}
