import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const IP_PATTERN =
  /^(?:(?:\d{1,3}\.){3}\d{1,3}|[0-9a-fA-F:]{2,})(?:\/(?:\d|[1-9]\d|1[01]\d|12[0-8]))?$/;

export function isValidFirewallTarget(value) {
  return IP_PATTERN.test(String(value || "").trim());
}

export async function blockFirewallIp(ip) {
  const target = String(ip || "").trim();

  if (!isValidFirewallTarget(target)) {
    throw new Error("Invalid IP or CIDR target.");
  }

  if (process.platform !== "linux") {
    throw new Error("Firewall blocking requires Ubuntu/Linux.");
  }

  const sudoPath = process.env.SUDO_PATH || "sudo";
  const ufwPath = process.env.UFW_PATH || "ufw";
  const args = ["-n", ufwPath, "deny", "from", target];
  const { stderr, stdout } = await execFileAsync(sudoPath, args, { timeout: 10000 });

  return {
    output: [stdout, stderr].filter(Boolean).join("\n").trim(),
    target,
  };
}

export async function unblockFirewallIp(ip) {
  const target = String(ip || "").trim();

  if (!isValidFirewallTarget(target)) {
    throw new Error("Invalid IP or CIDR target.");
  }

  if (process.platform !== "linux") {
    throw new Error("Firewall unblocking requires Ubuntu/Linux.");
  }

  const sudoPath = process.env.SUDO_PATH || "sudo";
  const ufwPath = process.env.UFW_PATH || "ufw";
  const args = ["-n", ufwPath, "delete", "deny", "from", target];
  const { stderr, stdout } = await execFileAsync(sudoPath, args, { timeout: 10000 });

  return {
    output: [stdout, stderr].filter(Boolean).join("\n").trim(),
    target,
  };
}
