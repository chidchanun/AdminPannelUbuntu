import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { canInstallPackages, getSessionFromRequest } from "@/lib/access-control";
import { writeAuditLog } from "@/lib/audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);
const APT_CACHE_PATH = process.env.APT_CACHE_PATH || "apt-cache";
const APT_GET_PATH = process.env.APT_GET_PATH || "apt-get";
const DPKG_QUERY_PATH = process.env.DPKG_QUERY_PATH || "dpkg-query";
const SUDO_PATH = process.env.SUDO_PATH || "sudo";

function parseList(value) {
  return String(value || "")
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizePackageName(value) {
  const packageName = String(value || "").trim().toLowerCase();

  if (!/^[a-z0-9][a-z0-9+.-]{0,120}$/.test(packageName)) {
    return "";
  }

  return packageName;
}

function getInstallAllowlist() {
  return parseList(process.env.PACKAGE_INSTALL_ALLOWLIST).map((item) => item.toLowerCase());
}

function canInstallPackageName(packageName) {
  const allowAny = ["1", "true", "yes", "on"].includes(
    String(process.env.PACKAGE_INSTALL_ALLOW_ANY || "").toLowerCase(),
  );
  const allowlist = getInstallAllowlist();

  return allowAny || allowlist.includes(packageName);
}

function parseSearchOutput(output) {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 80)
    .map((line) => {
      const [name, ...descriptionParts] = line.split(" - ");

      return {
        description: descriptionParts.join(" - "),
        name,
      };
    });
}

async function getPackageStatus(packageName) {
  try {
    const { stdout } = await execFileAsync(
      DPKG_QUERY_PATH,
      ["-W", "-f=${Status}\n${Version}\n", packageName],
      { timeout: 5000 },
    );
    const [status, version] = stdout.trim().split("\n");

    return {
      installed: /install ok installed/i.test(status || ""),
      status: status || "",
      version: version || "",
    };
  } catch {
    return {
      installed: false,
      status: "not installed",
      version: "",
    };
  }
}

export async function GET(request) {
  const session = getSessionFromRequest(request);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = String(searchParams.get("q") || "").trim();
  const packageName = normalizePackageName(searchParams.get("package"));

  if (process.platform !== "linux") {
    return NextResponse.json({
      allowAny: false,
      allowlist: getInstallAllowlist(),
      error: "Package tools require Ubuntu/Linux apt.",
      packages: [],
      status: null,
    });
  }

  try {
    const [searchResult, status] = await Promise.all([
      query
        ? execFileAsync(APT_CACHE_PATH, ["search", query], { timeout: 8000 })
        : Promise.resolve({ stdout: "" }),
      packageName ? getPackageStatus(packageName) : Promise.resolve(null),
    ]);

    return NextResponse.json({
      allowAny: ["1", "true", "yes", "on"].includes(
        String(process.env.PACKAGE_INSTALL_ALLOW_ANY || "").toLowerCase(),
      ),
      allowlist: getInstallAllowlist(),
      packages: parseSearchOutput(searchResult.stdout),
      status,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({ error: error.message, packages: [] }, { status: 500 });
  }
}

export async function POST(request) {
  const session = getSessionFromRequest(request);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canInstallPackages(session.username)) {
    return NextResponse.json({ error: "Package install permission denied." }, { status: 403 });
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const packageName = normalizePackageName(body?.package);

  if (!packageName) {
    return NextResponse.json({ error: "Valid package name is required." }, { status: 400 });
  }

  if (!canInstallPackageName(packageName)) {
    return NextResponse.json(
      {
        allowlist: getInstallAllowlist(),
        error:
          "Package is not in PACKAGE_INSTALL_ALLOWLIST. Set PACKAGE_INSTALL_ALLOW_ANY=true to allow any valid package name.",
      },
      { status: 403 },
    );
  }

  if (process.platform !== "linux") {
    return NextResponse.json({ error: "Package install requires Ubuntu/Linux apt." }, { status: 400 });
  }

  try {
    const { stdout, stderr } = await execFileAsync(
      SUDO_PATH,
      ["-n", APT_GET_PATH, "install", "-y", "--no-install-recommends", packageName],
      { timeout: 120000 },
    );

    await writeAuditLog({
      action: "package.install",
      package: packageName,
      user: session.username,
    });

    return NextResponse.json({
      ok: true,
      output: [stdout, stderr].filter(Boolean).join("\n").trim(),
      package: packageName,
    });
  } catch (error) {
    await writeAuditLog({
      action: "package.install.failed",
      error: error.message,
      package: packageName,
      user: session.username,
    });

    return NextResponse.json(
      {
        error: error.message,
        output: [error.stdout, error.stderr].filter(Boolean).join("\n").trim(),
        package: packageName,
      },
      { status: 500 },
    );
  }
}
