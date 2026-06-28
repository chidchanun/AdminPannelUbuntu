import { promises as fs } from "node:fs";

const DEFAULT_ADMIN_SETTINGS_PATH = "logs/admin-settings.json";
const DEFAULT_HEALTH_HISTORY_PATH = "logs/health-history.json";
const DEFAULT_SECURITY_BLOCK_STORE_PATH = "logs/security-blocks.json";

function getDirectoryName(filePath) {
  const normalizedPath = filePath.replaceAll("\\", "/");
  const index = normalizedPath.lastIndexOf("/");

  if (index <= 0) {
    return index === 0 ? "/" : ".";
  }

  return filePath.slice(0, index);
}

function getAdminSettingsPath() {
  return process.env.ADMIN_SETTINGS_PATH || DEFAULT_ADMIN_SETTINGS_PATH;
}

function getHealthHistoryPath() {
  return process.env.HEALTH_HISTORY_PATH || DEFAULT_HEALTH_HISTORY_PATH;
}

function getSecurityBlocksPath() {
  return process.env.SECURITY_BLOCK_STORE_PATH || DEFAULT_SECURITY_BLOCK_STORE_PATH;
}

async function readJsonFile(filePath, fallback) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(content);

    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch (error) {
    if (error.code === "ENOENT") {
      return fallback;
    }

    throw error;
  }
}

async function writeJsonFile(filePath, payload) {
  await fs.mkdir(getDirectoryName(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
}

function normalizeAdminSettings(settings) {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    throw new Error("Backup admin settings must be an object.");
  }

  return {
    ...settings,
    updatedAt: new Date().toISOString(),
  };
}

function normalizeSecurityBlocks(settings) {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    throw new Error("Backup security blocks must be an object.");
  }

  return {
    blocks: Array.isArray(settings.blocks) ? settings.blocks : [],
    settings:
      settings.settings && typeof settings.settings === "object" && !Array.isArray(settings.settings)
        ? settings.settings
        : {},
    updatedAt: new Date().toISOString(),
  };
}

function normalizeHealthHistory(history) {
  if (!history || typeof history !== "object" || Array.isArray(history)) {
    throw new Error("Backup health history must be an object.");
  }

  return {
    entries: Array.isArray(history.entries) ? history.entries : [],
    updatedAt: new Date().toISOString(),
  };
}

export async function createSystemBackup({ includeAudit = false, includeHistory = false } = {}) {
  const sections = {
    adminSettings: await readJsonFile(getAdminSettingsPath(), {}),
    securityBlocks: await readJsonFile(getSecurityBlocksPath(), { blocks: [], settings: {} }),
  };

  if (includeHistory) {
    sections.healthHistory = await readJsonFile(getHealthHistoryPath(), { entries: [] });
  }

  if (includeAudit) {
    const { readAuditLog } = await import("@/lib/audit-log");

    sections.auditLog = await readAuditLog({ limit: 1000 });
  }

  return {
    exportedAt: new Date().toISOString(),
    sections,
    version: 1,
  };
}

export async function restoreSystemBackup(backup, { restoreHistory = false } = {}) {
  const sections = backup?.sections || backup;

  if (!sections || typeof sections !== "object" || Array.isArray(sections)) {
    throw new Error("Valid system backup is required.");
  }

  const restored = [];

  if (sections.adminSettings) {
    await writeJsonFile(getAdminSettingsPath(), normalizeAdminSettings(sections.adminSettings));
    restored.push("adminSettings");
  }

  if (sections.securityBlocks) {
    await writeJsonFile(getSecurityBlocksPath(), normalizeSecurityBlocks(sections.securityBlocks));
    restored.push("securityBlocks");
  }

  if (restoreHistory && sections.healthHistory) {
    await writeJsonFile(getHealthHistoryPath(), normalizeHealthHistory(sections.healthHistory));
    restored.push("healthHistory");
  }

  if (restored.length === 0) {
    throw new Error("Backup does not contain restorable sections.");
  }

  return {
    restored,
    restoredAt: new Date().toISOString(),
    skipped: {
      auditLog: Boolean(sections.auditLog),
      healthHistory: Boolean(sections.healthHistory && !restoreHistory),
    },
  };
}

export function previewSystemBackup(backup) {
  const sections = backup?.sections || backup;

  if (!sections || typeof sections !== "object" || Array.isArray(sections)) {
    throw new Error("Valid system backup is required.");
  }

  return {
    exportedAt: backup?.exportedAt || null,
    restorable: {
      adminSettings: Boolean(sections.adminSettings),
      healthHistory: Boolean(sections.healthHistory),
      securityBlocks: Boolean(sections.securityBlocks),
    },
    sections: {
      adminSettings: sections.adminSettings
        ? {
            hasAlerts: Boolean(sections.adminSettings.alerts),
            hasHealth: Boolean(sections.adminSettings.health),
            hasSecurityTuning: Boolean(sections.adminSettings.securityTuning),
            hasService: Boolean(sections.adminSettings.service),
          }
        : null,
      auditLog: Array.isArray(sections.auditLog) ? { entries: sections.auditLog.length } : null,
      healthHistory: sections.healthHistory
        ? { entries: Array.isArray(sections.healthHistory.entries) ? sections.healthHistory.entries.length : 0 }
        : null,
      securityBlocks: sections.securityBlocks
        ? {
            blocks: Array.isArray(sections.securityBlocks.blocks) ? sections.securityBlocks.blocks.length : 0,
            hasSettings: Boolean(sections.securityBlocks.settings),
          }
        : null,
    },
    version: backup?.version || null,
  };
}
