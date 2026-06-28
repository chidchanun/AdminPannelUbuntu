import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import {
  canControlServices,
  canRestartServices,
  getSessionFromRequest,
} from "@/lib/access-control";
import { getServiceSettings } from "@/lib/admin-settings";
import { writeAuditLog } from "@/lib/audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);

const SYSTEMCTL_PATH = process.env.SYSTEMCTL_PATH || "systemctl";
const SUDO_PATH = process.env.SUDO_PATH || "sudo";
const JOURNALCTL_PATH = process.env.JOURNALCTL_PATH || "journalctl";
const SERVICE_ACTIONS = new Set(["disable", "enable", "restart", "start", "stop"]);

function getServiceNames(settings) {
  return settings.restartableServices;
}

function getMonitoredServiceNames(settings) {
  return settings.monitoredServices;
}

function getControllableServiceNames(settings) {
  return settings.controllableServices;
}

function normalizeServiceName(name) {
  return String(name || "").trim().replace(/\.service$/i, "");
}

function normalizeUnitName(name) {
  const normalized = normalizeServiceName(name);

  return normalized ? `${normalized}.service` : "";
}

function resolveAllowedService(serviceName, settings) {
  const normalized = normalizeServiceName(serviceName);

  return (
    getServiceNames(settings).find((allowedService) => {
      const allowedNormalized = normalizeServiceName(allowedService);

      return allowedService === serviceName || allowedNormalized === normalized;
    }) || null
  );
}

function resolveControllableService(serviceName, settings) {
  const normalized = normalizeServiceName(serviceName);

  return (
    getControllableServiceNames(settings).find((allowedService) => {
      const allowedNormalized = normalizeServiceName(allowedService);

      return allowedService === serviceName || allowedNormalized === normalized;
    }) || null
  );
}

function enrichService(service, settings) {
  const controlTarget = resolveControllableService(service.name, settings);
  const restartTarget = resolveAllowedService(service.name, settings);

  return {
    ...service,
    controlAllowed: Boolean(controlTarget),
    controlTarget,
    restartAllowed: Boolean(restartTarget),
    restartTarget,
  };
}

async function readServiceStatus(name, settings) {
  try {
    const { stdout } = await execFileAsync(SYSTEMCTL_PATH, ["is-active", name]);

    return {
      description: "",
      load: "loaded",
      name,
      ...enrichService({ name }, settings),
      subState: stdout.trim() || "unknown",
      state: stdout.trim() || "unknown",
      ok: stdout.trim() === "active",
    };
  } catch (error) {
    return {
      description: "",
      load: "unknown",
      name,
      ...enrichService({ name }, settings),
      subState: String(error.stdout || "").trim() || "failed",
      state: String(error.stdout || "").trim() || "failed",
      ok: false,
    };
  }
}

function parseServiceLine(line, settings) {
  const columns = line.trim().split(/\s+/);
  const [name, load, active, subState, ...descriptionParts] = columns;

  if (!name || !name.endsWith(".service")) {
    return null;
  }

  return enrichService(
    {
      description: descriptionParts.join(" "),
      load,
      name,
      ok: active === "active",
      state: active,
      subState,
    },
    settings,
  );
}

async function listAllServices(settings) {
  if (process.platform !== "linux") {
    const services = await Promise.all(
      getMonitoredServiceNames(settings).map((service) => readServiceStatus(service, settings)),
    );

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
      .map((line) => parseServiceLine(line, settings))
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name));
    const existingNames = new Set(services.map((service) => normalizeServiceName(service.name)));
    const configuredServices = [
      ...getMonitoredServiceNames(settings),
      ...getServiceNames(settings),
      ...getControllableServiceNames(settings),
    ];
    const missingAllowlist = configuredServices.filter(
      (serviceName) => !existingNames.has(normalizeServiceName(serviceName)),
    );
    const missingServices = await Promise.all(
      missingAllowlist.map((service) => readServiceStatus(service, settings)),
    );

    return {
      error: null,
      services: [...services, ...missingServices].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    };
  } catch (error) {
    const services = await Promise.all(
      getMonitoredServiceNames(settings).map((service) => readServiceStatus(service, settings)),
    );

    return {
      error: error.message,
      services,
    };
  }
}

async function readServiceDetails(serviceName) {
  const unit = normalizeUnitName(serviceName);

  if (!unit) {
    return { error: "Service name is required.", service: serviceName };
  }

  if (process.platform !== "linux") {
    return {
      error: "Service details require Linux systemctl and journalctl.",
      journal: "",
      service: unit,
      status: "",
    };
  }

  const detail = {
    error: null,
    journal: "",
    journalError: null,
    service: unit,
    status: "",
    statusError: null,
  };

  try {
    const { stdout, stderr } = await execFileAsync(SYSTEMCTL_PATH, [
      "status",
      unit,
      "--no-pager",
      "--lines=40",
    ]);

    detail.status = [stdout, stderr].filter(Boolean).join("\n").trim();
  } catch (error) {
    detail.status = [error.stdout, error.stderr].filter(Boolean).join("\n").trim();
    detail.statusError = error.message;
  }

  try {
    const { stdout, stderr } = await execFileAsync(JOURNALCTL_PATH, [
      "-u",
      unit,
      "--no-pager",
      "-n",
      "120",
      "-o",
      "short-iso",
    ]);

    detail.journal = [stdout, stderr].filter(Boolean).join("\n").trim();
  } catch (error) {
    detail.journal = [error.stdout, error.stderr].filter(Boolean).join("\n").trim();
    detail.journalError = error.message;
  }

  if (detail.statusError && detail.journalError) {
    detail.error = `${detail.statusError}; ${detail.journalError}`;
  }

  return detail;
}

export async function GET(request) {
  const session = getSessionFromRequest(request);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const serviceName = searchParams.get("service");

  if (serviceName) {
    const detail = await readServiceDetails(serviceName);

    return NextResponse.json({
      detail,
      updatedAt: new Date().toISOString(),
    });
  }

  const serviceSettings = await getServiceSettings();
  const result = await listAllServices(serviceSettings);
  const active = result.services.filter((service) => service.state === "active").length;
  const failed = result.services.filter((service) => service.state === "failed").length;
  const inactive = result.services.filter((service) => service.state === "inactive").length;

  return NextResponse.json({
    allowlist: getServiceNames(serviceSettings),
    controlAllowlist: getControllableServiceNames(serviceSettings),
    error: result.error,
    summary: {
      active,
      controlAllowed: result.services.filter((service) => service.controlAllowed).length,
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

  let body;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const action = String(body?.action || "restart").trim().toLowerCase();
  const serviceName = String(body?.service || "").trim();

  if (!SERVICE_ACTIONS.has(action)) {
    return NextResponse.json({ error: "Unknown service action." }, { status: 400 });
  }

  const canRunAction =
    action === "restart"
      ? canRestartServices(session.username)
      : canControlServices(session.username);

  if (!canRunAction) {
    await writeAuditLog({
      action: "service.action.denied",
      serviceAction: action,
      reason: "permission denied",
      user: session.username,
    });

    return NextResponse.json({ error: "Service action permission denied." }, { status: 403 });
  }

  const serviceSettings = await getServiceSettings();
  const allowedService =
    action === "restart"
      ? resolveAllowedService(serviceName, serviceSettings)
      : resolveControllableService(serviceName, serviceSettings);

  if (!allowedService) {
    await writeAuditLog({
      action: "service.action.denied",
      reason: "service is not in allowlist",
      serviceAction: action,
      service: serviceName,
      user: session.username,
    });

    return NextResponse.json(
      { error: "Service is not in the action allowlist." },
      { status: 403 },
    );
  }

  try {
    await execFileAsync(SUDO_PATH, ["-n", SYSTEMCTL_PATH, action, allowedService]);

    await writeAuditLog({
      action: `service.${action}`,
      service: allowedService,
      user: session.username,
    });

    return NextResponse.json({
      ok: true,
      action,
      service: allowedService,
      completedAt: new Date().toISOString(),
    });
  } catch (error) {
    await writeAuditLog({
      action: `service.${action}.failed`,
      error: error.message,
      service: allowedService,
      serviceAction: action,
      user: session.username,
    });

    return NextResponse.json(
      { error: error.message, service: allowedService },
      { status: 500 },
    );
  }
}
