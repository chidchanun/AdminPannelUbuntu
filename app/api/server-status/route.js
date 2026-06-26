import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { readSessionValue, SESSION_COOKIE } from "@/lib/auth-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);

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

function buildNotices({ cpuPercent, memoryPercent, disk, temperature }) {
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

  const [cpuPercent, disk, temperature] = await Promise.all([
    getCpuUsage(),
    getDiskUsage(),
    getTemperature(),
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
  };

  return NextResponse.json({
    ...payload,
    notices: buildNotices({
      cpuPercent,
      memoryPercent,
      disk,
      temperature,
    }),
  });
}
