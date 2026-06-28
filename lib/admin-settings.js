import { promises as fs } from "node:fs";
import path from "node:path";

const DEFAULT_SETTINGS_PATH = path.join(process.cwd(), "logs", "admin-settings.json");

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

  await fs.mkdir(path.dirname(filePath), { recursive: true });
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
