import { promises as fs } from "node:fs";
import path from "node:path";
import { blockIp, getThreatSnapshot, unblockIp } from "@/lib/threat-guard";

const DEFAULT_BLOCK_STORE_PATH = path.join(process.cwd(), "logs", "security-blocks.json");

function getStorePath() {
  return process.env.SECURITY_BLOCK_STORE_PATH || DEFAULT_BLOCK_STORE_PATH;
}

async function readBlockFile() {
  try {
    const content = await fs.readFile(getStorePath(), "utf8");
    const parsed = JSON.parse(content);

    return Array.isArray(parsed.blocks) ? parsed.blocks : [];
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function writeBlockFile(blocks) {
  const filePath = getStorePath();

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(
    filePath,
    JSON.stringify(
      {
        blocks,
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

export async function loadPersistentBlocks() {
  const storedBlocks = await readBlockFile();
  const blocks = storedBlocks.map(normalizeBlock).filter(Boolean);

  for (const block of blocks) {
    blockIp(block.ip, block.reason, block.details, {
      blockedAt: block.blockedAt,
      expiresAt: block.expiresAt,
    });
  }

  if (blocks.length !== storedBlocks.length) {
    await writeBlockFile(blocks);
  }

  return blocks;
}

export async function persistCurrentBlocks() {
  const snapshot = getThreatSnapshot();

  await writeBlockFile(snapshot.blocked);

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
