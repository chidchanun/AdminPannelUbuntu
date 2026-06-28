import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/access-control";
import { writeAuditLog } from "@/lib/audit-log";
import { getHealthTargets } from "@/lib/health-checks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);
const PM2_PATH = process.env.PM2_PATH || "pm2";
const PM2_LOG_LINES = String(Number(process.env.PM2_LOG_LINES || 200));
const PM2_NAME_PATTERN = /^[\w@./:-]+$/;

function stripAnsi(value) {
  return String(value || "").replace(/\u001b\[[0-9;]*m/g, "");
}

export async function GET(request) {
  const session = getSessionFromRequest(request);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const targets = await getHealthTargets();
  const target = targets.find((item) => item.id === id);

  if (!target) {
    return NextResponse.json({ error: "Health target not found." }, { status: 404 });
  }

  if (target.logType !== "pm2" || !target.pm2Name) {
    return NextResponse.json({ error: "This target has no PM2 log source." }, { status: 400 });
  }

  if (!PM2_NAME_PATTERN.test(target.pm2Name)) {
    return NextResponse.json({ error: "Invalid PM2 process name." }, { status: 400 });
  }

  try {
    const { stderr, stdout } = await execFileAsync(
      PM2_PATH,
      ["logs", target.pm2Name, "--lines", PM2_LOG_LINES, "--nostream"],
      { timeout: 15000 },
    );
    const output = stripAnsi([stdout, stderr].filter(Boolean).join("\n").trim());

    await writeAuditLog({
      action: "health.pm2_logs.read",
      pm2Name: target.pm2Name,
      targetId: target.id,
      user: session.username,
    });

    return NextResponse.json({
      label: target.label,
      lines: Number(PM2_LOG_LINES),
      output: output || "No PM2 log output.",
      pm2Name: target.pm2Name,
      readAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error.message,
        output: stripAnsi([error.stdout, error.stderr].filter(Boolean).join("\n").trim()),
      },
      { status: 500 },
    );
  }
}
