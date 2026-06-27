import { promises as fs } from "node:fs";
import path from "node:path";

function getAuditLogPath() {
  if (process.env.AUDIT_LOG_PATH) {
    return path.resolve(process.env.AUDIT_LOG_PATH);
  }

  return path.join(/* turbopackIgnore: true */ process.cwd(), "logs", "admin-audit.log");
}

export async function writeAuditLog(event) {
  const logPath = getAuditLogPath();
  const entry = {
    at: new Date().toISOString(),
    ...event,
  };

  try {
    await fs.mkdir(path.dirname(logPath), { recursive: true });
    await fs.appendFile(logPath, `${JSON.stringify(entry)}\n`, "utf8");
  } catch (error) {
    console.error("Unable to write audit log:", error);
  }
}
