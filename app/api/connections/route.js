import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { readSessionValue, SESSION_COOKIE } from "@/lib/auth-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);

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
  const local = parseAddress(localAddress);
  const peer = parseAddress(peerAddress);

  return {
    state,
    recvQueue: Number(recvQueue) || 0,
    sendQueue: Number(sendQueue) || 0,
    local,
    peer,
    process: processInfo.join(" ") || null,
  };
}

async function getCurrentConnections() {
  if (process.platform !== "linux") {
    return {
      checked: false,
      connections: [],
      error: "Connection details require Linux ss command.",
    };
  }

  try {
    const { stdout } = await execFileAsync("ss", ["-H", "-tanp"]);
    const connections = stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map(parseSsLine)
      .filter((connection) => connection.peer.host !== "unknown");

    return {
      checked: true,
      connections,
      error: null,
    };
  } catch (error) {
    return {
      checked: false,
      connections: [],
      error: error.message,
    };
  }
}

function extractAttempt(line) {
  const ipMatch = line.match(/\bfrom\s+([0-9a-fA-F:.]+)\b/);
  const userMatch =
    line.match(/Invalid user\s+([^\s]+)/i) || line.match(/for(?: invalid user)?\s+([^\s]+)/i);

  if (!ipMatch) {
    return null;
  }

  return {
    ip: ipMatch[1],
    user: userMatch?.[1] || "unknown",
    message: line.trim(),
  };
}

async function readAuthLines() {
  try {
    const { stdout } = await execFileAsync("journalctl", [
      "-u",
      "ssh",
      "-u",
      "sshd",
      "--since",
      "24 hours ago",
      "--no-pager",
      "-n",
      "800",
    ]);

    return { checked: true, lines: stdout.split("\n"), error: null };
  } catch (journalError) {
    try {
      const authLog = await fs.readFile("/var/log/auth.log", "utf8");
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      const currentYear = new Date().getFullYear();
      const lines = authLog.split("\n").filter((line) => {
        const timestamp = Date.parse(`${line.slice(0, 15)} ${currentYear}`);

        return Number.isFinite(timestamp) && timestamp >= cutoff;
      });

      return { checked: true, lines, error: null };
    } catch (logError) {
      return {
        checked: false,
        lines: [],
        error: `${journalError.message}; ${logError.message}`,
      };
    }
  }
}

async function getConnectionAttempts() {
  if (process.platform !== "linux") {
    return {
      checked: false,
      attempts: [],
      error: "Auth attempt details require Linux auth logs.",
    };
  }

  const authLines = await readAuthLines();

  if (!authLines.checked) {
    return {
      checked: false,
      attempts: [],
      error: authLines.error,
    };
  }

  const attempts = authLines.lines
    .filter((line) => /Failed password|Invalid user|authentication failure/i.test(line))
    .map(extractAttempt)
    .filter(Boolean);

  return {
    checked: true,
    attempts,
    error: null,
  };
}

function groupConnections(connections) {
  const groups = new Map();

  for (const connection of connections) {
    const existing = groups.get(connection.peer.host) || {
      ip: connection.peer.host,
      total: 0,
      established: 0,
      synReceived: 0,
      ports: new Set(),
    };

    existing.total += 1;
    existing.established += connection.state === "ESTAB" ? 1 : 0;
    existing.synReceived += connection.state === "SYN-RECV" ? 1 : 0;
    existing.ports.add(connection.local.port);
    groups.set(connection.peer.host, existing);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      ports: [...group.ports].sort(),
    }))
    .sort((a, b) => b.total - a.total);
}

function groupAttempts(attempts) {
  const groups = new Map();

  for (const attempt of attempts) {
    const existing = groups.get(attempt.ip) || {
      ip: attempt.ip,
      total: 0,
      users: new Set(),
      lastMessage: attempt.message,
    };

    existing.total += 1;
    existing.users.add(attempt.user);
    existing.lastMessage = attempt.message;
    groups.set(attempt.ip, existing);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      users: [...group.users].sort(),
    }))
    .sort((a, b) => b.total - a.total);
}

export async function GET(request) {
  const session = readSessionValue(request.cookies.get(SESSION_COOKIE)?.value);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [current, failed] = await Promise.all([
    getCurrentConnections(),
    getConnectionAttempts(),
  ]);

  return NextResponse.json({
    updatedAt: new Date().toISOString(),
    current: {
      checked: current.checked,
      error: current.error,
      total: current.connections.length,
      established: current.connections.filter((connection) => connection.state === "ESTAB")
        .length,
      synReceived: current.connections.filter((connection) => connection.state === "SYN-RECV")
        .length,
      byIp: groupConnections(current.connections).slice(0, 50),
      connections: current.connections.slice(0, 120),
    },
    failed: {
      checked: failed.checked,
      error: failed.error,
      total: failed.attempts.length,
      byIp: groupAttempts(failed.attempts).slice(0, 50),
      attempts: failed.attempts.slice(-120).reverse(),
    },
  });
}
