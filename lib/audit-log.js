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
  } catch (error) {
    console.error("Unable to write audit log:", error);
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
