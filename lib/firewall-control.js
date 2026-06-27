import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const IPV4_PATTERN = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const IPV6_PATTERN = /^[0-9a-fA-F:]+$/;

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

    return cidr === null ? address : `${address}/${cidr}`;
  }

  if (IPV6_PATTERN.test(address) && address.includes(":")) {
    return cidr === null ? address : `${address}/${cidr}`;
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
  const { stderr, stdout } = await execFileAsync(sudoPath, args, { timeout: 10000 });

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
  const { stderr, stdout } = await execFileAsync(sudoPath, args, { timeout: 10000 });

  return {
    output: [stdout, stderr].filter(Boolean).join("\n").trim(),
    target,
  };
}
