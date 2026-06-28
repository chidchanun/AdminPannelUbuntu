import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const IPV4_PATTERN = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const IPV6_PATTERN = /^[0-9a-fA-F:]+$/;
const UNSAFE_FIREWALL_TARGETS = new Set([
  "0.0.0.0",
  "0.0.0.0/0",
  "::",
  "::/0",
]);

function isValidIpv4(value) {
  const parts = String(value).split(".");

  return parts.length === 4 && parts.every((part) => {
    const number = Number(part);

    return Number.isInteger(number) && number >= 0 && number <= 255;
  });
}

export function normalizeFirewallTarget(value) {
  let target = String(value || "").trim();

  if (!target || target === "unknown") {
    return null;
  }

  if (target.includes(",")) {
    target = target.split(",")[0].trim();
  }

  target = target.replace(/^\[|\]$/g, "");
  target = target.replace(/^::ffff:/i, "");

  const [address, cidrValue] = target.split("/");
  const cidr = cidrValue === undefined ? null : Number(cidrValue);

  if (cidrValue !== undefined && (!Number.isInteger(cidr) || cidr < 0 || cidr > 128)) {
    return null;
  }

  if (IPV4_PATTERN.test(address)) {
    if (!isValidIpv4(address) || (cidr !== null && cidr > 32)) {
      return null;
    }

    const normalizedTarget = cidr === null ? address : `${address}/${cidr}`;

    return UNSAFE_FIREWALL_TARGETS.has(normalizedTarget) ? null : normalizedTarget;
  }

  if (IPV6_PATTERN.test(address) && address.includes(":")) {
    const normalizedTarget = cidr === null ? address : `${address}/${cidr}`;

    return UNSAFE_FIREWALL_TARGETS.has(normalizedTarget) ? null : normalizedTarget;
  }

  return null;
}

export function isValidFirewallTarget(value) {
  return normalizeFirewallTarget(value) !== null;
}

export async function blockFirewallIp(ip) {
  const target = normalizeFirewallTarget(ip);

  if (!target) {
    throw new Error("Invalid IP or CIDR target.");
  }

  if (process.platform !== "linux") {
    throw new Error("Firewall blocking requires Ubuntu/Linux.");
  }

  const sudoPath = process.env.SUDO_PATH || "sudo";
  const ufwPath = process.env.UFW_PATH || "ufw";
  const args = ["-n", ufwPath, "deny", "from", target];
  const { stderr, stdout } = await runFirewallCommand(sudoPath, args);

  return {
    output: [stdout, stderr].filter(Boolean).join("\n").trim(),
    target,
  };
}

export async function unblockFirewallIp(ip) {
  const target = normalizeFirewallTarget(ip);

  if (!target) {
    throw new Error("Invalid IP or CIDR target.");
  }

  if (process.platform !== "linux") {
    throw new Error("Firewall unblocking requires Ubuntu/Linux.");
  }

  const sudoPath = process.env.SUDO_PATH || "sudo";
  const ufwPath = process.env.UFW_PATH || "ufw";
  const args = ["-n", ufwPath, "delete", "deny", "from", target];
  const { stderr, stdout } = await runFirewallCommand(sudoPath, args);

  return {
    output: [stdout, stderr].filter(Boolean).join("\n").trim(),
    target,
  };
}

async function runFirewallCommand(sudoPath, args) {
  try {
    return await execFileAsync(sudoPath, args, { timeout: 10000 });
  } catch (error) {
    const output = [error.stdout, error.stderr, error.message].filter(Boolean).join("\n");

    if (/password is required|a password is required|sudo: a terminal is required/i.test(output)) {
      throw new Error(
        "UFW sudo permission is not configured. Add a NOPASSWD sudoers rule for ufw or turn off UFW Auto Block.",
      );
    }

    throw error;
  }
}
