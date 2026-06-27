import { promises as fs } from "node:fs";
import path from "node:path";
import { blockIp, getThreatSnapshot, unblockIp } from "@/lib/threat-guard";

const DEFAULT_BLOCK_STORE_PATH = path.join(process.cwd(), "logs", "security-blocks.json");
const SETTING_KEYS = ["autoAppBlock", "autoBlockPrivateIps", "autoFirewallBlock"];

function getStorePath() {
  return process.env.SECURITY_BLOCK_STORE_PATH || DEFAULT_BLOCK_STORE_PATH;
}

async function readBlockFile() {
  try {
    const content = await fs.readFile(getStorePath(), "utf8");
    const parsed = JSON.parse(content);

    return {
      blocks: Array.isArray(parsed.blocks) ? parsed.blocks : [],
      settings: parsed.settings && typeof parsed.settings === "object" ? parsed.settings : {},
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return { blocks: [], settings: {} };
    }

    throw error;
  }
}

async function writeBlockFile({ blocks, settings }) {
  const filePath = getStorePath();

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(
    filePath,
    JSON.stringify(
      {
        blocks,
        settings,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
}

function normalizeBlock(block) {
  const expiresAt = Number(block.expiresAt || Date.parse(block.expiresAtIso));

  if (!block.ip || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return null;
  }

  return {
    blockedAt: block.blockedAt || new Date().toISOString(),
    details: block.details || {},
    expiresAt,
    expiresAtIso: new Date(expiresAt).toISOString(),
    ip: block.ip,
    reason: block.reason || "persistent block",
  };
}

function isEnabled(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}

function getDefaultSettings() {
  return {
    autoAppBlock: isEnabled(process.env.AUTO_APP_BLOCK),
    autoBlockPrivateIps: isEnabled(process.env.AUTO_BLOCK_PRIVATE_IPS),
    autoFirewallBlock: isEnabled(process.env.AUTO_FIREWALL_BLOCK),
  };
}

function normalizeSettings(settings = {}) {
  const defaults = getDefaultSettings();

  return SETTING_KEYS.reduce((result, key) => {
    result[key] = typeof settings[key] === "boolean" ? settings[key] : defaults[key];

    return result;
  }, {});
}

export async function loadPersistentBlocks() {
  const stored = await readBlockFile();
  const blocks = stored.blocks.map(normalizeBlock).filter(Boolean);

  for (const block of blocks) {
    blockIp(block.ip, block.reason, block.details, {
      blockedAt: block.blockedAt,
      expiresAt: block.expiresAt,
    });
  }

  if (blocks.length !== stored.blocks.length) {
    await writeBlockFile({ blocks, settings: normalizeSettings(stored.settings) });
  }

  return blocks;
}

export async function persistCurrentBlocks() {
  const stored = await readBlockFile();
  const snapshot = getThreatSnapshot();

  await writeBlockFile({
    blocks: snapshot.blocked,
    settings: normalizeSettings(stored.settings),
  });

  return snapshot.blocked;
}

export async function persistBlock(ip, reason, details = {}, options = {}) {
  await loadPersistentBlocks();
  const block = blockIp(ip, reason, details, options);
  await persistCurrentBlocks();

  return block;
}

export async function removePersistentBlock(ip) {
  await loadPersistentBlocks();
  const removed = unblockIp(ip);
  await persistCurrentBlocks();

  return removed;
}

export async function getSecuritySettings() {
  const stored = await readBlockFile();

  return normalizeSettings(stored.settings);
}

export async function updateSecuritySettings(updates) {
  const stored = await readBlockFile();
  const current = normalizeSettings(stored.settings);
  const next = { ...current };

  for (const key of SETTING_KEYS) {
    if (typeof updates?.[key] === "boolean") {
      next[key] = updates[key];
    }
  }

  await writeBlockFile({
    blocks: stored.blocks.map(normalizeBlock).filter(Boolean),
    settings: next,
  });

  return next;
}
