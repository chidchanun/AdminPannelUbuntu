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
    mutedTargets: (Array.isArray(settings.mutedTargets) ? settings.mutedTargets : [])
      .map((item) => ({
        mutedAt: item.mutedAt || new Date().toISOString(),
        mutedUntil: item.mutedUntil,
        reason: String(item.reason || "maintenance"),
        targetId: String(item.targetId || "").trim(),
      }))
      .filter((item) => item.targetId && Number.isFinite(Date.parse(item.mutedUntil)))
      .filter((item) => Date.parse(item.mutedUntil) > Date.now()),
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

function parseNumber(value, fallback, { max = 100000, min = 1 } = {}) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(number)));
}

function normalizeAlertSettings(settings = {}) {
  const urls = Array.isArray(settings.webhookUrls) ? settings.webhookUrls : parseList(settings.webhookUrls);

  return {
    enabled: typeof settings.enabled === "boolean" ? settings.enabled : false,
    minSeverity: ["info", "warning", "critical"].includes(settings.minSeverity)
      ? settings.minSeverity
      : "critical",
    webhookUrls: [...new Set(urls.map((url) => String(url).trim()).filter(Boolean))],
  };
}

function normalizeSecurityTuning(settings = {}) {
  return {
    authFailureLimit: parseNumber(settings.authFailureLimit, Number(process.env.AUTH_FAILURE_LIMIT || 8)),
    blockMinutes: parseNumber(settings.blockMinutes, Number(process.env.BOT_BLOCK_MINUTES || 30), {
      max: 1440,
    }),
    botRateLimitPerMinute: parseNumber(
      settings.botRateLimitPerMinute,
      Number(process.env.BOT_RATE_LIMIT_PER_MINUTE || 240),
      { max: 100000 },
    ),
    botScanLimit: parseNumber(settings.botScanLimit, Number(process.env.BOT_SCAN_LIMIT || 3), {
      max: 1000,
    }),
    portConnectionLimit: parseNumber(
      settings.portConnectionLimit,
      Number(process.env.PORT_CONNECTION_LIMIT || 80),
      { max: 100000 },
    ),
    portSpreadLimit: parseNumber(settings.portSpreadLimit, Number(process.env.PORT_SPREAD_LIMIT || 6), {
      max: 65535,
    }),
    synRecvLimit: parseNumber(settings.synRecvLimit, Number(process.env.SYN_RECV_LIMIT || 20), {
      max: 100000,
    }),
    webScanLimit: parseNumber(settings.webScanLimit, Number(process.env.WEB_SCAN_LIMIT || 8), {
      max: 10000,
    }),
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

export async function getAlertSettings() {
  const stored = await readSettingsFile();

  return normalizeAlertSettings(stored.alerts);
}

export async function updateAlertSettings(updates) {
  const stored = await readSettingsFile();
  const alerts = normalizeAlertSettings({
    ...normalizeAlertSettings(stored.alerts),
    ...(updates || {}),
  });

  await writeSettingsFile({
    ...stored,
    alerts,
  });

  return alerts;
}

export async function getSecurityTuningSettings() {
  const stored = await readSettingsFile();

  return normalizeSecurityTuning(stored.securityTuning);
}

export async function updateSecurityTuningSettings(updates) {
  const stored = await readSettingsFile();
  const securityTuning = normalizeSecurityTuning({
    ...normalizeSecurityTuning(stored.securityTuning),
    ...(updates || {}),
  });

  await writeSettingsFile({
    ...stored,
    securityTuning,
  });

  return securityTuning;
}

export async function addHealthTarget(target) {
  const stored = await readSettingsFile();
  const current = normalizeHealthSettings(stored.health);
  const normalizedTarget = normalizeHealthTarget(target);

  if (!normalizedTarget) {
    throw new Error("Valid health target is required.");
  }

  const health = {
    mutedTargets: current.mutedTargets,
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
    mutedTargets: current.mutedTargets.filter((item) => item.targetId !== targetId),
    targets: current.targets.filter((target) => target.id !== targetId),
  };

  await writeSettingsFile({
    ...stored,
    health,
  });

  return health;
}

export async function muteHealthTarget({ minutes = 30, reason = "maintenance", targetId }) {
  const stored = await readSettingsFile();
  const current = normalizeHealthSettings(stored.health);
  const normalizedTargetId = String(targetId || "").trim();
  const durationMinutes = Number(minutes);

  if (!normalizedTargetId) {
    throw new Error("Health target id is required.");
  }

  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0 || durationMinutes > 1440) {
    throw new Error("Mute duration must be between 1 and 1440 minutes.");
  }

  const mutedTarget = {
    mutedAt: new Date().toISOString(),
    mutedUntil: new Date(Date.now() + durationMinutes * 60 * 1000).toISOString(),
    reason: String(reason || "maintenance"),
    targetId: normalizedTargetId,
  };
  const health = {
    mutedTargets: [
      ...current.mutedTargets.filter((item) => item.targetId !== normalizedTargetId),
      mutedTarget,
    ],
    targets: current.targets,
  };

  await writeSettingsFile({
    ...stored,
    health,
  });

  return health;
}

export async function unmuteHealthTarget(targetId) {
  const stored = await readSettingsFile();
  const current = normalizeHealthSettings(stored.health);
  const normalizedTargetId = String(targetId || "").trim();
  const health = {
    mutedTargets: current.mutedTargets.filter((item) => item.targetId !== normalizedTargetId),
    targets: current.targets,
  };

  await writeSettingsFile({
    ...stored,
    health,
  });

  return health;
}
