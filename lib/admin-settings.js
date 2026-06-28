import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";

const DEFAULT_SETTINGS_PATH = "logs/admin-settings.json";

function getSettingsPath() {
  return process.env.ADMIN_SETTINGS_PATH || DEFAULT_SETTINGS_PATH;
}

function parseList(value) {
  return String(value || "")
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeList(value) {
  const entries = Array.isArray(value) ? value : parseList(value);

  return [...new Set(entries.map((item) => String(item).trim()).filter(Boolean))].sort();
}

function normalizeHealthTarget(target) {
  const type = target?.type === "tcp" ? "tcp" : "http";
  const label = String(target?.label || "").trim();
  const logType = target?.logType === "pm2" ? "pm2" : "none";
  const pm2Name = String(target?.pm2Name || "").trim();

  if (!label) {
    return null;
  }

  if (type === "http") {
    try {
      return {
        id: String(target.id || randomUUID()),
        label,
        logType: logType === "pm2" && pm2Name ? "pm2" : "none",
        pm2Name: logType === "pm2" && pm2Name ? pm2Name : "",
        type,
        url: new URL(String(target.url || "").trim()).toString(),
      };
    } catch {
      return null;
    }
  }

  const host = String(target.host || "").trim();
  const port = Number(target.port);

  if (!host || !Number.isInteger(port) || port <= 0 || port > 65535) {
    return null;
  }

  return {
    host,
    id: String(target.id || randomUUID()),
    label,
    logType: logType === "pm2" && pm2Name ? "pm2" : "none",
    pm2Name: logType === "pm2" && pm2Name ? pm2Name : "",
    port,
    type,
  };
}

function normalizeHealthSettings(settings = {}) {
  return {
    targets: (Array.isArray(settings.targets) ? settings.targets : [])
      .map(normalizeHealthTarget)
      .filter(Boolean),
  };
}

async function readSettingsFile() {
  try {
    const content = await fs.readFile(getSettingsPath(), "utf8");
    const parsed = JSON.parse(content);

    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    if (error.code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

async function writeSettingsFile(settings) {
  const filePath = getSettingsPath();

  await fs.mkdir(getDirectoryName(filePath), { recursive: true });
  await fs.writeFile(
    filePath,
    JSON.stringify(
      {
        ...settings,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
}

function getDirectoryName(filePath) {
  const normalizedPath = filePath.replaceAll("\\", "/");
  const index = normalizedPath.lastIndexOf("/");

  if (index <= 0) {
    return index === 0 ? "/" : ".";
  }

  return filePath.slice(0, index);
}

function getDefaultServiceSettings() {
  const monitoredServices = normalizeList(process.env.MONITORED_SERVICES || "ssh,nginx,mysql");
  const restartableServices = normalizeList(process.env.RESTARTABLE_SERVICES || monitoredServices);
  const controllableServices = normalizeList(
    process.env.CONTROLLABLE_SERVICES || restartableServices,
  );

  return {
    controllableServices,
    monitoredServices,
    restartableServices,
  };
}

function normalizeServiceSettings(settings = {}) {
  const defaults = getDefaultServiceSettings();

  return {
    controllableServices: normalizeList(
      settings.controllableServices || defaults.controllableServices,
    ),
    monitoredServices: normalizeList(settings.monitoredServices || defaults.monitoredServices),
    restartableServices: normalizeList(
      settings.restartableServices || defaults.restartableServices,
    ),
  };
}

export async function getServiceSettings() {
  const stored = await readSettingsFile();

  return normalizeServiceSettings(stored.service);
}

export async function updateServiceSettings(updates) {
  const stored = await readSettingsFile();
  const current = normalizeServiceSettings(stored.service);
  const service = {
    ...current,
  };

  for (const key of ["controllableServices", "monitoredServices", "restartableServices"]) {
    if (Object.hasOwn(updates || {}, key)) {
      service[key] = normalizeList(updates[key]);
    }
  }

  await writeSettingsFile({
    ...stored,
    service,
  });

  return service;
}

export async function getHealthSettings() {
  const stored = await readSettingsFile();

  return normalizeHealthSettings(stored.health);
}

export async function addHealthTarget(target) {
  const stored = await readSettingsFile();
  const current = normalizeHealthSettings(stored.health);
  const normalizedTarget = normalizeHealthTarget(target);

  if (!normalizedTarget) {
    throw new Error("Valid health target is required.");
  }

  const health = {
    targets: [...current.targets, normalizedTarget],
  };

  await writeSettingsFile({
    ...stored,
    health,
  });

  return health;
}

export async function removeHealthTarget(id) {
  const stored = await readSettingsFile();
  const current = normalizeHealthSettings(stored.health);
  const targetId = String(id || "").trim();
  const health = {
    targets: current.targets.filter((target) => target.id !== targetId),
  };

  await writeSettingsFile({
    ...stored,
    health,
  });

  return health;
}
