import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { getSessionFromRequest, isAdminUser } from "@/lib/access-control";
import { writeAuditLog } from "@/lib/audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);
const DEFAULT_ALLOWED_COMMANDS = [
  "df",
  "free",
  "journalctl",
  "ls",
  "pm2",
  "pwd",
  "systemctl",
  "uptime",
  "who",
];

function parseList(value, fallback = []) {
  const items = String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return items.length > 0 ? items : fallback;
}

function getAllowedCommands() {
  return parseList(process.env.TERMINAL_ALLOWED_COMMANDS, DEFAULT_ALLOWED_COMMANDS);
}

function splitCommand(input) {
  const tokens = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match;

  while ((match = pattern.exec(input))) {
    tokens.push(match[1] ?? match[2] ?? match[3]);
  }

  return tokens;
}

function hasShellOperators(input) {
  return /[;&|`$<>]/.test(input);
}

export async function GET(request) {
  const session = getSessionFromRequest(request);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAdminUser(session.username)) {
    return NextResponse.json({ error: "Terminal permission denied." }, { status: 403 });
  }

  return NextResponse.json({
    allowedCommands: getAllowedCommands(),
    cwd: process.cwd(),
  });
}

export async function POST(request) {
  const session = getSessionFromRequest(request);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAdminUser(session.username)) {
    return NextResponse.json({ error: "Terminal permission denied." }, { status: 403 });
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const input = String(body?.command || "").trim();

  if (!input) {
    return NextResponse.json({ error: "Command is required." }, { status: 400 });
  }

  if (hasShellOperators(input)) {
    return NextResponse.json(
      { error: "Shell operators are not allowed in web terminal commands." },
      { status: 400 },
    );
  }

  const [command, ...args] = splitCommand(input);
  const allowedCommands = getAllowedCommands();

  if (!allowedCommands.includes(command)) {
    return NextResponse.json(
      {
        allowedCommands,
        error: `Command "${command}" is not allowed.`,
      },
      { status: 403 },
    );
  }

  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd: process.cwd(),
      timeout: Number(process.env.TERMINAL_TIMEOUT_MS || 30000),
    });
    const output = [stdout, stderr].filter(Boolean).join("\n").trim();

    await writeAuditLog({
      action: "terminal.command",
      command,
      user: session.username,
    });

    return NextResponse.json({
      command: input,
      completedAt: new Date().toISOString(),
      ok: true,
      output,
    });
  } catch (error) {
    await writeAuditLog({
      action: "terminal.command.failed",
      command,
      error: error.message,
      user: session.username,
    });

    return NextResponse.json(
      {
        command: input,
        error: error.message,
        output: [error.stdout, error.stderr].filter(Boolean).join("\n").trim(),
      },
      { status: 500 },
    );
  }
}
