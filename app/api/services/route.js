import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { canRestartServices, getSessionFromRequest } from "@/lib/access-control";
import { writeAuditLog } from "@/lib/audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);

const SYSTEMCTL_PATH = process.env.SYSTEMCTL_PATH || "systemctl";
const SUDO_PATH = process.env.SUDO_PATH || "sudo";

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

function normalizeServiceName(name) {
  return String(name || "").trim().replace(/\.service$/i, "");
}

function resolveAllowedService(serviceName) {
  const normalized = normalizeServiceName(serviceName);

  return (
    getServiceNames().find((allowedService) => {
      const allowedNormalized = normalizeServiceName(allowedService);

      return allowedService === serviceName || allowedNormalized === normalized;
    }) || null
  );
}

async function readServiceStatus(name) {
  try {
    const { stdout } = await execFileAsync(SYSTEMCTL_PATH, ["is-active", name]);

    return {
      description: "",
      load: "loaded",
      name,
      restartAllowed: Boolean(resolveAllowedService(name)),
      restartTarget: resolveAllowedService(name),
      subState: stdout.trim() || "unknown",
      state: stdout.trim() || "unknown",
      ok: stdout.trim() === "active",
    };
  } catch (error) {
    return {
      description: "",
      load: "unknown",
      name,
      restartAllowed: Boolean(resolveAllowedService(name)),
      restartTarget: resolveAllowedService(name),
      subState: String(error.stdout || "").trim() || "failed",
      state: String(error.stdout || "").trim() || "failed",
      ok: false,
    };
  }
}

function parseServiceLine(line) {
  const columns = line.trim().split(/\s+/);
  const [name, load, active, subState, ...descriptionParts] = columns;

  if (!name || !name.endsWith(".service")) {
    return null;
  }

  const restartTarget = resolveAllowedService(name);

  return {
    description: descriptionParts.join(" "),
    load,
    name,
    ok: active === "active",
    restartAllowed: Boolean(restartTarget),
    restartTarget,
    state: active,
    subState,
  };
}

async function listAllServices() {
  if (process.platform !== "linux") {
    const services = await Promise.all(getServiceNames().map(readServiceStatus));

    return {
      error: "Listing all services requires Linux systemctl.",
      services,
    };
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
    const services = stdout
      .split("\n")
      .map(parseServiceLine)
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name));
    const existingNames = new Set(services.map((service) => normalizeServiceName(service.name)));
    const missingAllowlist = getServiceNames().filter(
      (serviceName) => !existingNames.has(normalizeServiceName(serviceName)),
    );
    const missingServices = await Promise.all(missingAllowlist.map(readServiceStatus));

    return {
      error: null,
      services: [...services, ...missingServices].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    };
  } catch (error) {
    const services = await Promise.all(getServiceNames().map(readServiceStatus));

    return {
      error: error.message,
      services,
    };
  }
}

export async function GET(request) {
  const session = getSessionFromRequest(request);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await listAllServices();
  const active = result.services.filter((service) => service.state === "active").length;
  const failed = result.services.filter((service) => service.state === "failed").length;
  const inactive = result.services.filter((service) => service.state === "inactive").length;

  return NextResponse.json({
    allowlist: getServiceNames(),
    error: result.error,
    summary: {
      active,
      failed,
      inactive,
      restartAllowed: result.services.filter((service) => service.restartAllowed).length,
      total: result.services.length,
    },
    updatedAt: new Date().toISOString(),
    services: result.services,
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
  const allowedService = resolveAllowedService(serviceName);

  if (!allowedService) {
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
    await execFileAsync(SUDO_PATH, ["-n", SYSTEMCTL_PATH, "restart", allowedService]);

    await writeAuditLog({
      action: "service.restart",
      service: allowedService,
      user: session.username,
    });

    return NextResponse.json({
      ok: true,
      service: allowedService,
      restartedAt: new Date().toISOString(),
    });
  } catch (error) {
    await writeAuditLog({
      action: "service.restart.failed",
      error: error.message,
      service: allowedService,
      user: session.username,
    });

    return NextResponse.json(
      { error: error.message, service: allowedService },
      { status: 500 },
    );
  }
}
