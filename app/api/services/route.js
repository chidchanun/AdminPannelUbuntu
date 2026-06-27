import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { canRestartServices, getSessionFromRequest } from "@/lib/access-control";
import { writeAuditLog } from "@/lib/audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);

function parseList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getServiceNames() {
  const restartableServices = parseList(process.env.RESTARTABLE_SERVICES);

  if (restartableServices.length > 0) {
    return restartableServices;
  }

  return parseList(process.env.MONITORED_SERVICES || "ssh,nginx,mysql");
}

async function readServiceStatus(name) {
  try {
    const { stdout } = await execFileAsync("systemctl", ["is-active", name]);

    return {
      name,
      state: stdout.trim() || "unknown",
      ok: stdout.trim() === "active",
    };
  } catch (error) {
    return {
      name,
      state: String(error.stdout || "").trim() || "failed",
      ok: false,
    };
  }
}

export async function GET(request) {
  const session = getSessionFromRequest(request);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const services = await Promise.all(getServiceNames().map(readServiceStatus));

  return NextResponse.json({
    updatedAt: new Date().toISOString(),
    services,
  });
}

export async function POST(request) {
  const session = getSessionFromRequest(request);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canRestartServices(session.username)) {
    await writeAuditLog({
      action: "service.restart.denied",
      reason: "permission denied",
      user: session.username,
    });

    return NextResponse.json({ error: "Service restart permission denied." }, { status: 403 });
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const serviceName = String(body?.service || "").trim();
  const allowedServices = getServiceNames();

  if (!allowedServices.includes(serviceName)) {
    await writeAuditLog({
      action: "service.restart.denied",
      reason: "service is not in allowlist",
      service: serviceName,
      user: session.username,
    });

    return NextResponse.json(
      { error: "Service is not in the restart allowlist." },
      { status: 403 },
    );
  }

  try {
    await execFileAsync("systemctl", ["restart", serviceName]);

    await writeAuditLog({
      action: "service.restart",
      service: serviceName,
      user: session.username,
    });

    return NextResponse.json({
      ok: true,
      service: serviceName,
      restartedAt: new Date().toISOString(),
    });
  } catch (error) {
    await writeAuditLog({
      action: "service.restart.failed",
      error: error.message,
      service: serviceName,
      user: session.username,
    });

    return NextResponse.json(
      { error: error.message, service: serviceName },
      { status: 500 },
    );
  }
}
