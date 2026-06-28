import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const PM2_PATH = process.env.PM2_PATH || "pm2";
const PM2_NAME_PATTERN = /^[\w@./:-]+$/;

function stripAnsi(value) {
  return String(value || "").replace(/\u001b\[[0-9;]*m/g, "");
}

export function normalizePm2Name(value) {
  const name = String(value || "").trim();

  return name && PM2_NAME_PATTERN.test(name) ? name : null;
}

function formatUptime(pmUptime) {
  const startedAt = Number(pmUptime);

  if (!Number.isFinite(startedAt) || startedAt <= 0) {
    return null;
  }

  return Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
}

function normalizeProcess(processInfo) {
  const env = processInfo.pm2_env || {};
  const monitor = processInfo.monit || {};

  return {
    cpu: Number(monitor.cpu || 0),
    execMode: env.exec_mode || "",
    id: processInfo.pm_id,
    memory: Number(monitor.memory || 0),
    name: processInfo.name,
    namespace: env.namespace || "default",
    pid: processInfo.pid || null,
    restartCount: Number(env.restart_time || 0),
    status: env.status || "unknown",
    unstableRestarts: Number(env.unstable_restarts || 0),
    uptimeSeconds: formatUptime(env.pm_uptime),
    version: env.version || "",
    watch: Boolean(env.watch),
  };
}

export async function listPm2Processes() {
  try {
    const { stdout } = await execFileAsync(PM2_PATH, ["jlist"], { timeout: 10000 });
    const parsed = JSON.parse(stdout || "[]");
    const processes = Array.isArray(parsed) ? parsed.map(normalizeProcess) : [];

    return {
      error: null,
      processes: processes.sort((a, b) => String(a.name).localeCompare(String(b.name))),
    };
  } catch (error) {
    return {
      error: stripAnsi([error.stdout, error.stderr, error.message].filter(Boolean).join("\n")),
      processes: [],
    };
  }
}

export async function runPm2Action(action, name) {
  const processName = normalizePm2Name(name);
  const allowedActions = new Set(["reload", "restart", "start", "stop"]);

  if (!allowedActions.has(action)) {
    throw new Error("Unknown PM2 action.");
  }

  if (!processName) {
    throw new Error("Valid PM2 process name is required.");
  }

  const { stderr, stdout } = await execFileAsync(PM2_PATH, [action, processName], {
    timeout: 20000,
  });

  return stripAnsi([stdout, stderr].filter(Boolean).join("\n").trim());
}
