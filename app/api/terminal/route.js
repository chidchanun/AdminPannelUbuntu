import { exec, execFile } from "node:child_process";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { getSessionFromRequest, isAdminUser } from "@/lib/access-control";
import { writeAuditLog } from "@/lib/audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);
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

function isShellTerminalEnabled() {
  return !["0", "false", "no", "off"].includes(
    String(process.env.TERMINAL_ALLOW_SHELL ?? "true").toLowerCase(),
  );
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
    shellEnabled: isShellTerminalEnabled(),
    shellPath: process.env.TERMINAL_SHELL || (process.platform === "win32" ? "cmd.exe" : "/bin/bash"),
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

  try {
    const timeout = Number(process.env.TERMINAL_TIMEOUT_MS || 30000);
    const maxBuffer = Number(process.env.TERMINAL_MAX_BUFFER || 1024 * 1024);
    const shellEnabled = isShellTerminalEnabled();
    let stdout;
    let stderr;
    let auditCommand = input;

    if (shellEnabled) {
      const result = await execAsync(input, {
        cwd: process.cwd(),
        maxBuffer,
        shell: process.env.TERMINAL_SHELL || (process.platform === "win32" ? "cmd.exe" : "/bin/bash"),
        timeout,
      });

      stdout = result.stdout;
      stderr = result.stderr;
    } else {
      if (hasShellOperators(input)) {
        return NextResponse.json(
          { error: "Shell operators are not allowed in controlled terminal mode." },
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

      auditCommand = command;
      const result = await execFileAsync(command, args, {
        cwd: process.cwd(),
        maxBuffer,
        timeout,
      });

      stdout = result.stdout;
      stderr = result.stderr;
    }

    const output = [stdout, stderr].filter(Boolean).join("\n").trim();

    await writeAuditLog({
      action: "terminal.command",
      command: auditCommand,
      mode: shellEnabled ? "shell" : "controlled",
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
      command: input,
      error: error.message,
      mode: isShellTerminalEnabled() ? "shell" : "controlled",
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
