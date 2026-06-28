import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { createRequire } from "node:module";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { getSessionFromRequest, isAdminUser } from "@/lib/access-control";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);
const requireNativePackage = createRequire(import.meta.url);

function requireAdmin(request) {
  const session = getSessionFromRequest(request);

  if (!session) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  if (!isAdminUser(session.username)) {
    return {
      error: NextResponse.json({ error: "Diagnostics permission denied." }, { status: 403 }),
    };
  }

  return { session };
}

function getDirectoryName(filePath) {
  const normalizedPath = filePath.replaceAll("\\", "/");
  const index = normalizedPath.lastIndexOf("/");

  if (index <= 0) {
    return index === 0 ? "/" : ".";
  }

  return filePath.slice(0, index);
}

function check(name, status, detail, hint = "") {
  return { detail, hint, name, status };
}

async function commandExists(command) {
  const lookupCommand = process.platform === "win32" ? "where.exe" : "which";

  try {
    const { stdout } = await execFileAsync(lookupCommand, [command], { timeout: 3000 });

    return check(command, "ok", stdout.trim().split(/\r?\n/)[0] || "Available");
  } catch (error) {
    return check(command, "warn", error.message, `${command} was not found in PATH.`);
  }
}

async function checkWritablePath(label, filePath) {
  const directory = getDirectoryName(filePath);
  const safeLabel = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const probePath = `${directory}/.ubuntu-admin-write-test-${safeLabel}-${process.pid}`;

  try {
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(probePath, new Date().toISOString(), "utf8");

    try {
      await fs.unlink(probePath);
    } catch (unlinkError) {
      if (unlinkError.code !== "ENOENT") {
        throw unlinkError;
      }
    }

    return check(label, "ok", filePath);
  } catch (error) {
    return check(label, "fail", filePath, error.message);
  }
}

function checkEnv(name, value, hint) {
  if (value) {
    return check(name, "ok", "Configured");
  }

  return check(name, "warn", "Not configured", hint);
}

async function checkPam() {
  if (process.platform !== "linux") {
    return check("PAM native module", "warn", "Skipped on non-Linux development machine.");
  }

  try {
    const packageName = "authenticate" + "-pam";
    const pamModule = requireNativePackage.call(null, packageName);
    const authenticate = pamModule?.default?.authenticate ?? pamModule?.authenticate;

    if (!authenticate) {
      return check("PAM native module", "fail", "Package loaded but authenticate() is missing.");
    }

    return check("PAM native module", "ok", "authenticate-pam is loadable.");
  } catch (error) {
    return check("PAM native module", "fail", error.message, "Install authenticate-pam on Ubuntu.");
  }
}

async function checkPamService() {
  const service = process.env.PAM_SERVICE || "nextjs";

  if (process.platform !== "linux") {
    return check("PAM service file", "warn", `/etc/pam.d/${service}`, "Checked on Ubuntu only.");
  }

  try {
    await fs.access(`/etc/pam.d/${service}`);

    return check("PAM service file", "ok", `/etc/pam.d/${service}`);
  } catch (error) {
    return check("PAM service file", "fail", `/etc/pam.d/${service}`, error.message);
  }
}

async function checkSudo() {
  if (process.platform !== "linux") {
    return check("sudo non-interactive", "warn", "Skipped on non-Linux development machine.");
  }

  try {
    await execFileAsync(process.env.SUDO_PATH || "sudo", ["-n", "-v"], { timeout: 3000 });

    return check("sudo non-interactive", "ok", "sudo -n is allowed for this process user.");
  } catch (error) {
    return check(
      "sudo non-interactive",
      "warn",
      error.message,
      "Service/UFW actions may need NOPASSWD sudoers rules.",
    );
  }
}

async function getSecurityAdvice() {
  try {
    const { getSecuritySettings } = await import("@/lib/security-block-store");
    const settings = await getSecuritySettings();
    const whitelist = settings.whitelistIps || [];
    const hasLocalhost = whitelist.includes("::1") && whitelist.includes("127.0.0.1");

    if (settings.autoBlockPrivateIps && !hasLocalhost) {
      return check(
        "Localhost whitelist",
        "warn",
        "Auto block private/local IPs is enabled.",
        "Add ::1 and 127.0.0.1 to whitelist if local health checks or proxies trigger alerts.",
      );
    }

    return check("Localhost whitelist", "ok", "Local/private IP auto-block risk is low.");
  } catch (error) {
    return check("Localhost whitelist", "warn", error.message);
  }
}

export async function GET(request) {
  const { error } = requireAdmin(request);

  if (error) {
    return error;
  }

  const commands = await Promise.all(
    ["systemctl", "journalctl", "ss", "ufw", "pm2", "sudo"].map(commandExists),
  );
  const paths = await Promise.all([
    checkWritablePath(
      "Admin settings path",
      process.env.ADMIN_SETTINGS_PATH || "logs/admin-settings.json",
    ),
    checkWritablePath(
      "Security block path",
      process.env.SECURITY_BLOCK_STORE_PATH || "logs/security-blocks.json",
    ),
    checkWritablePath(
      "Health history path",
      process.env.HEALTH_HISTORY_PATH || "logs/health-history.json",
    ),
    checkWritablePath("Audit log path", process.env.AUDIT_LOG_PATH || "logs/admin-audit.log"),
  ]);
  const checks = [
    check("Runtime platform", process.platform === "linux" ? "ok" : "warn", process.platform),
    check("Node.js", "ok", process.version),
    checkEnv("AUTH_SECRET", process.env.AUTH_SECRET, "Set a long random secret."),
    checkEnv("LOGIN_ALLOWED_USERS", process.env.LOGIN_ALLOWED_USERS, "Limit who can sign in."),
    checkEnv("ADMIN_USERS", process.env.ADMIN_USERS, "Set explicit admin users for production."),
    await checkPam(),
    await checkPamService(),
    await checkSudo(),
    await getSecurityAdvice(),
    ...commands,
    ...paths,
  ];
  const summary = checks.reduce(
    (result, item) => {
      result[item.status] += 1;
      return result;
    },
    { fail: 0, ok: 0, warn: 0 },
  );

  return NextResponse.json({
    checks,
    generatedAt: new Date().toISOString(),
    summary,
  });
}
