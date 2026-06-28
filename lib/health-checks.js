import net from "node:net";
import { getHealthSettings } from "@/lib/admin-settings";

const DEFAULT_HTTP_TIMEOUT_MS = Number(process.env.HEALTH_HTTP_TIMEOUT_MS || 5000);
const DEFAULT_TCP_TIMEOUT_MS = Number(process.env.HEALTH_TCP_TIMEOUT_MS || 3000);

function parseList(value) {
  return String(value || "")
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseHttpTarget(entry) {
  const [labelPart, ...urlParts] = entry.split("|");
  const url = urlParts.length > 0 ? urlParts.join("|").trim() : labelPart.trim();
  const label = urlParts.length > 0 ? labelPart.trim() : url;

  try {
    return {
      label,
      type: "http",
      url: new URL(url).toString(),
    };
  } catch {
    return null;
  }
}

function parseTcpTarget(entry) {
  const [labelPart, ...targetParts] = entry.split("|");
  const target = targetParts.length > 0 ? targetParts.join("|").trim() : labelPart.trim();
  const label = targetParts.length > 0 ? labelPart.trim() : target;
  const lastColonIndex = target.lastIndexOf(":");

  if (lastColonIndex <= 0) {
    return null;
  }

  const host = target.slice(0, lastColonIndex).replace(/^\[|\]$/g, "");
  const port = Number(target.slice(lastColonIndex + 1));

  if (!host || !Number.isInteger(port) || port <= 0 || port > 65535) {
    return null;
  }

  return {
    host,
    label,
    port,
    type: "tcp",
  };
}

export async function getHealthTargets() {
  const httpTargets = parseList(process.env.HEALTH_CHECK_URLS)
    .map(parseHttpTarget)
    .filter(Boolean)
    .map((target, index) => ({
      ...target,
      id: `env-http-${index}`,
      source: "env",
    }));
  const tcpTargets = parseList(process.env.HEALTH_CHECK_PORTS)
    .map(parseTcpTarget)
    .filter(Boolean)
    .map((target, index) => ({
      ...target,
      id: `env-tcp-${index}`,
      source: "env",
    }));
  const settings = await getHealthSettings();
  const storedTargets = settings.targets.map((target) => ({
    ...target,
    source: "settings",
  }));

  return [...httpTargets, ...tcpTargets, ...storedTargets];
}

async function checkHttp(target) {
  const startedAt = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_HTTP_TIMEOUT_MS);

  try {
    const response = await fetch(target.url, {
      cache: "no-store",
      redirect: "manual",
      signal: controller.signal,
    });
    const latencyMs = Math.round(performance.now() - startedAt);

    return {
      ...target,
      latencyMs,
      ok: response.status >= 200 && response.status < 400,
      status: response.status,
      statusText: response.statusText,
    };
  } catch (error) {
    return {
      ...target,
      error: error.name === "AbortError" ? "Request timed out" : error.message,
      latencyMs: Math.round(performance.now() - startedAt),
      ok: false,
      status: null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function checkTcp(target) {
  const startedAt = performance.now();

  return new Promise((resolve) => {
    const socket = net.createConnection({
      host: target.host,
      port: target.port,
      timeout: DEFAULT_TCP_TIMEOUT_MS,
    });

    function finish(result) {
      socket.destroy();
      resolve({
        ...target,
        latencyMs: Math.round(performance.now() - startedAt),
        ...result,
      });
    }

    socket.once("connect", () => finish({ ok: true, status: "open" }));
    socket.once("timeout", () => finish({ error: "Connection timed out", ok: false, status: "timeout" }));
    socket.once("error", (error) =>
      finish({ error: error.message, ok: false, status: "closed" }),
    );
  });
}

export async function runHealthChecks() {
  const targets = await getHealthTargets();
  const results = await Promise.all(
    targets.map((target) => (target.type === "http" ? checkHttp(target) : checkTcp(target))),
  );

  return {
    checkedAt: new Date().toISOString(),
    configured: targets.length,
    ok: results.every((result) => result.ok),
    results,
    unhealthy: results.filter((result) => !result.ok),
  };
}
