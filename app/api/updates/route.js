import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { getSessionFromRequest, isAdminUser } from "@/lib/access-control";
import { writeAuditLog } from "@/lib/audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);
const APT_GET_PATH = process.env.APT_GET_PATH || "apt-get";
const SUDO_PATH = process.env.SUDO_PATH || "sudo";

function requireAdmin(request) {
  const session = getSessionFromRequest(request);

  if (!session) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  if (!isAdminUser(session.username)) {
    return { error: NextResponse.json({ error: "Update permission denied." }, { status: 403 }) };
  }

  return { session };
}

function parseUpgradable(output) {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("Listing..."))
    .map((line) => {
      const match = line.match(/^([^/]+)\/\S+\s+([^\s]+)\s+[^\[]+\[upgradable from:\s*([^\]]+)\]/);

      return {
        current: match?.[3] || "",
        name: match?.[1] || line.split("/")[0],
        raw: line,
        target: match?.[2] || "",
      };
    });
}

async function readOptionalFile(filePath) {
  try {
    return (await fs.readFile(filePath, "utf8")).trim();
  } catch (error) {
    if (error.code === "ENOENT") {
      return "";
    }

    throw error;
  }
}

export async function GET(request) {
  const { error } = requireAdmin(request);

  if (error) {
    return error;
  }

  if (process.platform !== "linux") {
    return NextResponse.json({
      checkedAt: new Date().toISOString(),
      error: "Update Center requires Ubuntu/Linux apt tools.",
      packages: [],
      rebootRequired: false,
      securityUpdates: [],
      summary: { packages: 0, security: 0 },
    });
  }

  try {
    const [{ stdout }, rebootReason] = await Promise.all([
      execFileAsync("apt", ["list", "--upgradable"], { timeout: 12000 }),
      readOptionalFile("/var/run/reboot-required.pkgs"),
    ]);
    const packages = parseUpgradable(stdout);
    const securityUpdates = packages.filter((item) => /security/i.test(item.raw));

    return NextResponse.json({
      checkedAt: new Date().toISOString(),
      packages: packages.slice(0, 200),
      rebootPackages: rebootReason ? rebootReason.split("\n").filter(Boolean) : [],
      rebootRequired: Boolean(rebootReason),
      securityUpdates,
      summary: {
        packages: packages.length,
        security: securityUpdates.length,
      },
    });
  } catch (updateError) {
    return NextResponse.json(
      {
        checkedAt: new Date().toISOString(),
        error: updateError.message,
        packages: [],
        rebootRequired: false,
        securityUpdates: [],
        summary: { packages: 0, security: 0 },
      },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  const { error, session } = requireAdmin(request);

  if (error) {
    return error;
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  if (body?.action !== "update-upgrade") {
    return NextResponse.json({ error: "Unknown update action." }, { status: 400 });
  }

  if (process.platform !== "linux") {
    return NextResponse.json(
      { error: "Update and upgrade requires Ubuntu/Linux apt." },
      { status: 400 },
    );
  }

  try {
    const update = await execFileAsync(SUDO_PATH, ["-n", APT_GET_PATH, "update"], {
      timeout: 180000,
    });
    const upgrade = await execFileAsync(
      SUDO_PATH,
      ["-n", APT_GET_PATH, "upgrade", "-y"],
      { timeout: 900000 },
    );
    const output = [
      "$ apt-get update",
      update.stdout,
      update.stderr,
      "$ apt-get upgrade -y",
      upgrade.stdout,
      upgrade.stderr,
    ]
      .filter(Boolean)
      .join("\n")
      .trim();

    await writeAuditLog({
      action: "packages.update_upgrade",
      user: session.username,
    });

    return NextResponse.json({
      completedAt: new Date().toISOString(),
      ok: true,
      output,
    });
  } catch (updateError) {
    await writeAuditLog({
      action: "packages.update_upgrade.failed",
      error: updateError.message,
      user: session.username,
    });

    return NextResponse.json(
      {
        error: updateError.message,
        output: [updateError.stdout, updateError.stderr].filter(Boolean).join("\n").trim(),
      },
      { status: 500 },
    );
  }
}
