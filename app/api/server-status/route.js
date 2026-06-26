import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { readSessionValue, SESSION_COOKIE } from "@/lib/auth-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);
const DEFAULT_MONITORED_SERVICES = ["ssh", "nginx", "mysql"];

function readCpuSnapshot() {
  return os.cpus().reduce(
    (total, cpu) => {
      total.idle += cpu.times.idle;
      total.total += Object.values(cpu.times).reduce((sum, time) => sum + time, 0);
      return total;
    },
    { idle: 0, total: 0 },
  );
}

function calculateCpuUsage(start, end) {
  const idleDelta = end.idle - start.idle;
  const totalDelta = end.total - start.total;

  if (totalDelta <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, (1 - idleDelta / totalDelta) * 100));
}

async function getCpuUsage() {
  const start = readCpuSnapshot();
  await new Promise((resolve) => setTimeout(resolve, 120));
  const end = readCpuSnapshot();

  return calculateCpuUsage(start, end);
}

async function getDiskUsage() {
  try {
    const { stdout } = await execFileAsync("df", ["-k", "/"]);
    const lines = stdout.trim().split("\n");
    const columns = lines.at(-1)?.split(/\s+/);

    if (!columns || columns.length < 5) {
      return null;
    }

    const totalKb = Number(columns[1]);
    const usedKb = Number(columns[2]);
    const availableKb = Number(columns[3]);

    return {
      totalGb: totalKb / 1024 / 1024,
      usedGb: usedKb / 1024 / 1024,
      availableGb: availableKb / 1024 / 1024,
      usedPercent: totalKb > 0 ? (usedKb / totalKb) * 100 : 0,
    };
  } catch {
    return null;
  }
}

async function getTemperature() {
  try {
    const thermalRoot = "/sys/class/thermal";
    const entries = await fs.readdir(thermalRoot);

    for (const entry of entries) {
      if (!entry.startsWith("thermal_zone")) {
        continue;
      }

      const tempPath = `${thermalRoot}/${entry}/temp`;
      const rawValue = await fs.readFile(tempPath, "utf8");
      const value = Number(rawValue.trim());

      if (Number.isFinite(value)) {
        return value > 1000 ? value / 1000 : value;
      }
    }

    return null;
  } catch {
    return null;
  }
}

function parseServiceNames() {
  return (process.env.MONITORED_SERVICES || DEFAULT_MONITORED_SERVICES.join(","))
    .split(",")
    .map((service) => service.trim())
    .filter(Boolean);
}

async function getServiceStatus() {
  const services = parseServiceNames();

  if (process.platform !== "linux") {
    return {
      checked: false,
      services: [],
      error: "Service checks require Linux/systemd.",
    };
  }

  const results = await Promise.all(
    services.map(async (name) => {
      try {
        const { stdout } = await execFileAsync("systemctl", [
          "is-active",
          name,
        ]);

        return {
          name,
          state: stdout.trim() || "unknown",
          ok: stdout.trim() === "active",
        };
      } catch (error) {
        const state = String(error.stdout || "").trim() || "failed";

        return {
          name,
          state,
          ok: false,
        };
      }
    }),
  );

  return {
    checked: true,
    services: results,
    error: null,
  };
}

async function getFailedSystemdUnits() {
  if (process.platform !== "linux") {
    return {
      checked: false,
      units: [],
      error: "Systemd failed-unit checks require Linux.",
    };
  }

  try {
    const { stdout } = await execFileAsync("systemctl", [
      "--failed",
      "--no-legend",
      "--plain",
    ]);

    const units = stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [name, load, active, sub, ...description] = line.split(/\s+/);

        return {
          name,
          load,
          active,
          sub,
          description: description.join(" "),
        };
      });

    return {
      checked: true,
      units,
      error: null,
    };
  } catch (error) {
    return {
      checked: false,
      units: [],
      error: error.message,
    };
  }
}

async function getConnectionStatus() {
  if (process.platform !== "linux") {
    return {
      checked: false,
      established: 0,
      synReceived: 0,
      error: "Connection checks require Linux ss command.",
    };
  }

  try {
    const { stdout } = await execFileAsync("ss", ["-H", "-tan"]);
    const lines = stdout.trim().split("\n").filter(Boolean);

    return {
      checked: true,
      established: lines.filter((line) => line.startsWith("ESTAB")).length,
      synReceived: lines.filter((line) => line.startsWith("SYN-RECV")).length,
      error: null,
    };
  } catch (error) {
    return {
      checked: false,
      established: 0,
      synReceived: 0,
      error: error.message,
    };
  }
}

async function getAuthFailureStatus() {
  if (process.platform !== "linux") {
    return {
      checked: false,
      failedLogins: 0,
      error: "Auth log checks require Linux.",
    };
  }

  try {
    const { stdout } = await execFileAsync("journalctl", [
      "-u",
      "ssh",
      "-u",
      "sshd",
      "--since",
      "15 minutes ago",
      "--no-pager",
      "-n",
      "250",
    ]);
    const failedLogins = stdout
      .split("\n")
      .filter((line) => /Failed password|Invalid user|authentication failure/i.test(line))
      .length;

    return {
      checked: true,
      failedLogins,
      error: null,
    };
  } catch (journalError) {
    try {
      const authLog = await fs.readFile("/var/log/auth.log", "utf8");
      const cutoff = Date.now() - 15 * 60 * 1000;
      const currentYear = new Date().getFullYear();
      const failedLogins = authLog
        .split("\n")
        .filter((line) => {
          const rawDate = line.slice(0, 15);
          const timestamp = Date.parse(`${rawDate} ${currentYear}`);

          return (
            Number.isFinite(timestamp) &&
            timestamp >= cutoff &&
            /Failed password|Invalid user|authentication failure/i.test(line)
          );
        }).length;

      return {
        checked: true,
        failedLogins,
        error: null,
      };
    } catch (logError) {
      return {
        checked: false,
        failedLogins: 0,
        error: `${journalError.message}; ${logError.message}`,
      };
    }
  }
}

function buildNotices({
  cpuPercent,
  memoryPercent,
  disk,
  temperature,
  serviceStatus,
  failedUnits,
  connectionStatus,
  authFailureStatus,
}) {
  const notices = [];

  if (cpuPercent >= 85) {
    notices.push({
      level: "critical",
      title: "High CPU usage",
      message: "CPU usage is above the recommended operating range.",
    });
  }

  if (memoryPercent >= 85) {
    notices.push({
      level: "critical",
      title: "High memory usage",
      message: "RAM usage is high. Check active services or background jobs.",
    });
  }

  if (disk?.usedPercent >= 85) {
    notices.push({
      level: "critical",
      title: "Low disk space",
      message: "Root disk usage is high. Clear logs or expand storage.",
    });
  }

  if (temperature === null) {
    notices.push({
      level: "warning",
      title: "Temperature unavailable",
      message: "This server does not expose thermal sensor data to the app.",
    });
  } else if (temperature >= 75) {
    notices.push({
      level: "critical",
      title: "High temperature",
      message: "Server temperature is above the recommended range.",
    });
  }

  if (serviceStatus?.checked) {
    const failedServices = serviceStatus.services.filter((service) => !service.ok);

    if (failedServices.length > 0) {
      notices.push({
        level: "critical",
        title: "Service failure",
        message: `${failedServices
          .map((service) => `${service.name} (${service.state})`)
          .join(", ")} need attention.`,
      });
    }
  } else if (serviceStatus?.error) {
    notices.push({
      level: "warning",
      title: "Service check unavailable",
      message: serviceStatus.error,
    });
  }

  if (failedUnits?.checked && failedUnits.units.length > 0) {
    notices.push({
      level: "critical",
      title: "Failed systemd units",
      message: failedUnits.units
        .slice(0, 4)
        .map((unit) => unit.name)
        .join(", "),
    });
  } else if (failedUnits?.error) {
    notices.push({
      level: "warning",
      title: "Systemd check unavailable",
      message: failedUnits.error,
    });
  }

  if (connectionStatus?.checked) {
    if (connectionStatus.synReceived >= 50) {
      notices.push({
        level: "critical",
        title: "Possible connection flood",
        message: `${connectionStatus.synReceived} half-open TCP connections detected.`,
      });
    } else if (connectionStatus.established >= 500) {
      notices.push({
        level: "warning",
        title: "High connection count",
        message: `${connectionStatus.established} established TCP connections detected.`,
      });
    }
  } else if (connectionStatus?.error) {
    notices.push({
      level: "warning",
      title: "Connection check unavailable",
      message: connectionStatus.error,
    });
  }

  if (authFailureStatus?.checked) {
    if (authFailureStatus.failedLogins >= 20) {
      notices.push({
        level: "critical",
        title: "Possible brute-force activity",
        message: `${authFailureStatus.failedLogins} failed login attempts in the last 15 minutes.`,
      });
    } else if (authFailureStatus.failedLogins >= 5) {
      notices.push({
        level: "warning",
        title: "Repeated failed logins",
        message: `${authFailureStatus.failedLogins} failed login attempts in the last 15 minutes.`,
      });
    }
  } else if (authFailureStatus?.error) {
    notices.push({
      level: "warning",
      title: "Auth log check unavailable",
      message: authFailureStatus.error,
    });
  }

  if (notices.length === 0) {
    notices.push({
      level: "ok",
      title: "No error notices",
      message: "Server metrics are currently within the configured thresholds.",
    });
  }

  return notices;
}

export async function GET(request) {
  const session = readSessionValue(request.cookies.get(SESSION_COOKIE)?.value);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [
    cpuPercent,
    disk,
    temperature,
    serviceStatus,
    failedUnits,
    connectionStatus,
    authFailureStatus,
  ] = await Promise.all([
    getCpuUsage(),
    getDiskUsage(),
    getTemperature(),
    getServiceStatus(),
    getFailedSystemdUnits(),
    getConnectionStatus(),
    getAuthFailureStatus(),
  ]);

  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const memoryPercent = totalMemory > 0 ? (usedMemory / totalMemory) * 100 : 0;
  const loadAverage = os.loadavg();

  const payload = {
    updatedAt: new Date().toISOString(),
    hostname: os.hostname(),
    platform: os.platform(),
    uptimeSeconds: os.uptime(),
    cpu: {
      model: os.cpus()[0]?.model || "Unknown CPU",
      cores: os.cpus().length,
      usagePercent: cpuPercent,
      loadAverage,
    },
    memory: {
      totalGb: totalMemory / 1024 / 1024 / 1024,
      usedGb: usedMemory / 1024 / 1024 / 1024,
      freeGb: freeMemory / 1024 / 1024 / 1024,
      usedPercent: memoryPercent,
    },
    disk,
    temperature,
    checks: {
      services: serviceStatus,
      failedUnits,
      connections: connectionStatus,
      authFailures: authFailureStatus,
    },
  };

  return NextResponse.json({
    ...payload,
    notices: buildNotices({
      cpuPercent,
      memoryPercent,
      disk,
      temperature,
      serviceStatus,
      failedUnits,
      connectionStatus,
      authFailureStatus,
    }),
  });
}
