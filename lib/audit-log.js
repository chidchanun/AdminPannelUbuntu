import { promises as fs } from "node:fs";

function getAuditLogPath() {
  if (process.env.AUDIT_LOG_PATH) {
    return process.env.AUDIT_LOG_PATH;
  }

  return "logs/admin-audit.log";
}

function getDirectoryName(filePath) {
  const normalizedPath = filePath.replaceAll("\\", "/");
  const index = normalizedPath.lastIndexOf("/");

  if (index <= 0) {
    return index === 0 ? "/" : ".";
  }

  return filePath.slice(0, index);
}

export function getAuditLogFilePath() {
  return getAuditLogPath();
}

export async function writeAuditLog(event) {
  const logPath = getAuditLogPath();
  const entry = {
    at: new Date().toISOString(),
    ...event,
  };

  try {
    await fs.mkdir(getDirectoryName(logPath), { recursive: true });
    await fs.appendFile(logPath, `${JSON.stringify(entry)}\n`, "utf8");
    pruneAuditLog(logPath);
  } catch (error) {
    console.error("Unable to write audit log:", error);
  }
}

async function pruneAuditLog(logPath) {
  try {
    const { getAuditRetentionSettings } = await import("@/lib/admin-settings");
    const retention = await getAuditRetentionSettings();
    const content = await fs.readFile(logPath, "utf8");
    const cutoff = Date.now() - retention.maxAgeDays * 24 * 60 * 60 * 1000;
    const lines = content
      .split("\n")
      .filter(Boolean)
      .filter((line) => {
        try {
          const entry = JSON.parse(line);
          const timestamp = Date.parse(entry.at);

          return Number.isFinite(timestamp) && timestamp >= cutoff;
        } catch {
          return true;
        }
      })
      .slice(-retention.maxEntries);

    await fs.writeFile(logPath, `${lines.join("\n")}${lines.length > 0 ? "\n" : ""}`, "utf8");
  } catch (error) {
    console.error("Unable to prune audit log:", error);
  }
}

export async function readAuditLog({ limit = 200 } = {}) {
  const logPath = getAuditLogPath();

  try {
    const content = await fs.readFile(logPath, "utf8");
    const lines = content.trim().split("\n").filter(Boolean);

    return lines
      .slice(-limit)
      .reverse()
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return {
            action: "audit.parse_error",
            at: null,
            raw: line,
          };
        }
      });
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}
