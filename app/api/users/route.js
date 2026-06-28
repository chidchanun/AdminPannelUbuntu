import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { getSessionFromRequest, isAdminUser } from "@/lib/access-control";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);

function requireAdmin(request) {
  const session = getSessionFromRequest(request);

  if (!session) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  if (!isAdminUser(session.username)) {
    return { error: NextResponse.json({ error: "Users permission denied." }, { status: 403 }) };
  }

  return { session };
}

function parsePasswd(content) {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [username, , uid, gid, comment, home, shell] = line.split(":");
      const numericUid = Number(uid);
      const loginDisabled = /(?:nologin|false)$/i.test(shell || "");

      return {
        comment: comment || "",
        gid: Number(gid),
        home: home || "",
        isLoginUser: numericUid >= 1000 && numericUid < 65534 && !loginDisabled,
        shell: shell || "",
        uid: numericUid,
        username,
      };
    })
    .filter((user) => user.username)
    .sort((a, b) => a.uid - b.uid || a.username.localeCompare(b.username));
}

function parseWho(content) {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\S+)\s+(\S+)\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})(?:\s+\(([^)]+)\))?/);

      if (!match) {
        return { raw: line };
      }

      return {
        host: match[5] || "local",
        raw: line,
        since: `${match[3]} ${match[4]}`,
        tty: match[2],
        username: match[1],
      };
    });
}

function parseFailedLogins(content) {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /Failed password|Invalid user|authentication failure/i.test(line))
    .slice(-40)
    .reverse()
    .map((line) => {
      const fromMatch = line.match(/\bfrom\s+([0-9a-f:.]+)/i);
      const userMatch = line.match(/(?:Failed password for(?: invalid user)?|Invalid user)\s+(\S+)/i);

      return {
        ip: fromMatch?.[1] || "",
        raw: line,
        username: userMatch?.[1] || "",
      };
    });
}

async function getUsers() {
  if (process.platform !== "linux") {
    return [];
  }

  return parsePasswd(await fs.readFile("/etc/passwd", "utf8"));
}

async function getSessions() {
  if (process.platform !== "linux") {
    return [];
  }

  try {
    const { stdout } = await execFileAsync("who", []);

    return parseWho(stdout);
  } catch {
    return [];
  }
}

async function getFailedLogins() {
  if (process.platform !== "linux") {
    return [];
  }

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
      "120",
      "-o",
      "short-iso",
    ]);

    return parseFailedLogins(stdout);
  } catch {
    try {
      return parseFailedLogins(await fs.readFile("/var/log/auth.log", "utf8"));
    } catch {
      return [];
    }
  }
}

export async function GET(request) {
  const { error, session } = requireAdmin(request);

  if (error) {
    return error;
  }

  const [users, sessions, failedLogins] = await Promise.all([
    getUsers(),
    getSessions(),
    getFailedLogins(),
  ]);

  return NextResponse.json({
    currentUser: session.username,
    failedLogins,
    sessions,
    summary: {
      failedLoginCount: failedLogins.length,
      loginUserCount: users.filter((user) => user.isLoginUser).length,
      sessionCount: sessions.length,
      userCount: users.length,
    },
    updatedAt: new Date().toISOString(),
    users,
  });
}
