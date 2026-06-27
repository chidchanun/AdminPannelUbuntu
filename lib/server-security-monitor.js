import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { promisify } from "node:util";
import { isSuspiciousPath } from "@/lib/threat-guard";

const execFileAsync = promisify(execFile);

const PORT_CONNECTION_LIMIT = Number(process.env.PORT_CONNECTION_LIMIT || 80);
const PORT_SPREAD_LIMIT = Number(process.env.PORT_SPREAD_LIMIT || 6);
const SYN_RECV_LIMIT = Number(process.env.SYN_RECV_LIMIT || 20);
const WEB_SCAN_LIMIT = Number(process.env.WEB_SCAN_LIMIT || 8);
const AUTH_FAILURE_LIMIT = Number(process.env.AUTH_FAILURE_LIMIT || 8);
const DEFAULT_WEB_LOG_PATHS = [
  "/var/log/nginx/access.log",
  "/var/log/apache2/access.log",
];

function parseList(value, fallback = []) {
  const items = String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return items.length > 0 ? items : fallback;
}

function parseAddress(value) {
  if (!value || value === "*:*") {
    return { host: "unknown", port: "unknown" };
  }

  const cleanValue = value.replace(/^\[|\]$/g, "");
  const match = cleanValue.match(/^(.*):([^:]+)$/);

  if (!match) {
    return { host: cleanValue, port: "unknown" };
  }

  return {
    host: match[1].replace(/^\[|\]$/g, "") || "unknown",
    port: match[2],
  };
}

function parseSsLine(line) {
  const columns = line.trim().split(/\s+/);
  const [state, recvQueue, sendQueue, localAddress, peerAddress, ...processInfo] = columns;

  return {
    local: parseAddress(localAddress),
    peer: parseAddress(peerAddress),
    process: processInfo.join(" ") || null,
    recvQueue: Number(recvQueue) || 0,
    sendQueue: Number(sendQueue) || 0,
    state,
  };
}

async function getConnections() {
  if (process.platform !== "linux") {
    return {
      checked: false,
      connections: [],
      error: "Port monitoring requires Linux ss command.",
    };
  }

  try {
    const { stdout } = await execFileAsync("ss", ["-H", "-tanp"], { timeout: 5000 });
    const connections = stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map(parseSsLine)
      .filter((connection) => connection.peer.host !== "unknown");

    return { checked: true, connections, error: null };
  } catch (error) {
    return { checked: false, connections: [], error: error.message };
  }
}

function analyzeConnections(connections) {
  const groups = new Map();

  for (const connection of connections) {
    const ip = connection.peer.host;
    const existing = groups.get(ip) || {
      established: 0,
      ip,
      ports: new Set(),
      processes: new Set(),
      synReceived: 0,
      total: 0,
    };

    existing.total += 1;
    existing.established += connection.state === "ESTAB" ? 1 : 0;
    existing.synReceived += connection.state === "SYN-RECV" ? 1 : 0;
    existing.ports.add(connection.local.port);

    if (connection.process) {
      existing.processes.add(connection.process);
    }

    groups.set(ip, existing);
  }

  const byIp = [...groups.values()]
    .map((group) => ({
      ...group,
      ports: [...group.ports].sort(),
      processes: [...group.processes].slice(0, 4),
      reasons: [
        group.total >= PORT_CONNECTION_LIMIT ? "high connection count" : null,
        group.ports.size >= PORT_SPREAD_LIMIT ? "many target ports" : null,
        group.synReceived >= SYN_RECV_LIMIT ? "many half-open connections" : null,
      ].filter(Boolean),
    }))
    .sort((a, b) => b.total - a.total);

  return {
    alerts: byIp.filter((group) => group.reasons.length > 0).slice(0, 50),
    byIp: byIp.slice(0, 80),
    total: connections.length,
  };
}

async function readTail(path) {
  try {
    await fs.access(path);
    const { stdout } = await execFileAsync("tail", ["-n", "1200", path], { timeout: 5000 });

    return { checked: true, error: null, lines: stdout.split("\n"), path };
  } catch (error) {
    return { checked: false, error: error.message, lines: [], path };
  }
}

function parseWebLogLine(line, source) {
  const match = line.match(/^(\S+)\s+\S+\s+\S+\s+\[[^\]]+\]\s+"(\S+)\s+([^"]+?)\s+HTTP\/[^"]+"\s+(\d{3})\s+\S+(?:\s+"[^"]*"\s+"([^"]*)")?/);

  if (!match) {
    return null;
  }

  const [, ip, method, path, status, userAgent] = match;

  return {
    ip,
    method,
    path,
    source,
    status: Number(status),
    userAgent: userAgent || "",
  };
}

async function getWebLogSignals() {
  if (process.platform !== "linux") {
    return {
      checked: false,
      error: "Web log monitoring requires Linux log files.",
      sources: [],
      suspicious: [],
      total: 0,
    };
  }

  const paths = parseList(process.env.WEB_ACCESS_LOG_PATHS, DEFAULT_WEB_LOG_PATHS);
  const sources = await Promise.all(paths.map(readTail));
  const parsed = sources.flatMap((source) =>
    source.lines.map((line) => parseWebLogLine(line, source.path)).filter(Boolean),
  );
  const groups = new Map();

  for (const entry of parsed) {
    const existing = groups.get(entry.ip) || {
      examples: [],
      ip: entry.ip,
      notFound: 0,
      scanHits: 0,
      sources: new Set(),
      total: 0,
    };

    existing.total += 1;
    existing.notFound += entry.status === 404 ? 1 : 0;
    existing.sources.add(entry.source);

    if (isSuspiciousPath(entry.path) || entry.status === 404) {
      existing.scanHits += 1;
      existing.examples = [...existing.examples, entry.path].slice(-8);
    }

    groups.set(entry.ip, existing);
  }

  return {
    checked: sources.some((source) => source.checked),
    error: sources.every((source) => !source.checked)
      ? sources.map((source) => `${source.path}: ${source.error}`).join("; ")
      : null,
    sources: sources.map(({ checked, error, path }) => ({ checked, error, path })),
    suspicious: [...groups.values()]
      .filter((group) => group.scanHits >= WEB_SCAN_LIMIT)
      .map((group) => ({
        ...group,
        sources: [...group.sources],
      }))
      .sort((a, b) => b.scanHits - a.scanHits)
      .slice(0, 50),
    total: parsed.length,
  };
}

function extractAuthAttempt(line) {
  const ipMatch = line.match(/\bfrom\s+([0-9a-fA-F:.]+)\b/);
  const userMatch =
    line.match(/Invalid user\s+([^\s]+)/i) || line.match(/for(?: invalid user)?\s+([^\s]+)/i);

  if (!ipMatch) {
    return null;
  }

  return {
    ip: ipMatch[1],
    message: line.trim(),
    user: userMatch?.[1] || "unknown",
  };
}

async function readAuthLines() {
  try {
    const { stdout } = await execFileAsync(
      "journalctl",
      ["-u", "ssh", "-u", "sshd", "--since", "24 hours ago", "--no-pager", "-n", "1200"],
      { timeout: 7000 },
    );

    return { checked: true, error: null, lines: stdout.split("\n"), source: "journalctl" };
  } catch (journalError) {
    try {
      const { stdout } = await execFileAsync("tail", ["-n", "1200", "/var/log/auth.log"], {
        timeout: 5000,
      });

      return { checked: true, error: null, lines: stdout.split("\n"), source: "/var/log/auth.log" };
    } catch (logError) {
      return {
        checked: false,
        error: `${journalError.message}; ${logError.message}`,
        lines: [],
        source: null,
      };
    }
  }
}

async function getAuthSignals() {
  if (process.platform !== "linux") {
    return {
      checked: false,
      error: "Auth monitoring requires Linux auth logs.",
      failedByIp: [],
      source: null,
      total: 0,
    };
  }

  const auth = await readAuthLines();

  if (!auth.checked) {
    return {
      checked: false,
      error: auth.error,
      failedByIp: [],
      source: auth.source,
      total: 0,
    };
  }

  const attempts = auth.lines
    .filter((line) => /Failed password|Invalid user|authentication failure/i.test(line))
    .map(extractAuthAttempt)
    .filter(Boolean);
  const groups = new Map();

  for (const attempt of attempts) {
    const existing = groups.get(attempt.ip) || {
      ip: attempt.ip,
      lastMessage: attempt.message,
      total: 0,
      users: new Set(),
    };

    existing.total += 1;
    existing.lastMessage = attempt.message;
    existing.users.add(attempt.user);
    groups.set(attempt.ip, existing);
  }

  return {
    checked: true,
    error: null,
    failedByIp: [...groups.values()]
      .filter((group) => group.total >= AUTH_FAILURE_LIMIT)
      .map((group) => ({ ...group, users: [...group.users].sort() }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 50),
    source: auth.source,
    total: attempts.length,
  };
}

export async function getServerSecuritySnapshot() {
  const [connections, webLogs, auth] = await Promise.all([
    getConnections(),
    getWebLogSignals(),
    getAuthSignals(),
  ]);
  const connectionAnalysis = analyzeConnections(connections.connections);

  return {
    auth,
    connections: {
      checked: connections.checked,
      error: connections.error,
      ...connectionAnalysis,
    },
    thresholds: {
      authFailureLimit: AUTH_FAILURE_LIMIT,
      portConnectionLimit: PORT_CONNECTION_LIMIT,
      portSpreadLimit: PORT_SPREAD_LIMIT,
      synRecvLimit: SYN_RECV_LIMIT,
      webScanLimit: WEB_SCAN_LIMIT,
    },
    webLogs,
  };
}
