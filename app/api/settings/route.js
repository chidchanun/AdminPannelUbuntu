import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getSessionFromRequest, isAdminUser } from "@/lib/access-control";
import { getServiceSettings, updateServiceSettings } from "@/lib/admin-settings";
import { writeAuditLog } from "@/lib/audit-log";
import { getSecuritySettings, updateSecuritySettings } from "@/lib/security-block-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);
const SYSTEMCTL_PATH = process.env.SYSTEMCTL_PATH || "systemctl";

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

  const [availableServices, service, security] = await Promise.all([
    listAvailableServices(),
    getServiceSettings(),
    getSecuritySettings(),
  ]);

  return NextResponse.json({
    availableServices,
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
    updates.service = await updateServiceSettings(body.service);
  }

  if (body?.security) {
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
