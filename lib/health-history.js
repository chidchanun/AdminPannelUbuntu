import { promises as fs } from "node:fs";

const DEFAULT_HISTORY_PATH = "logs/health-history.json";
const DEFAULT_MAX_ENTRIES = Number(process.env.HEALTH_HISTORY_MAX_ENTRIES || 2500);
const DEFAULT_MAX_AGE_MS = Number(process.env.HEALTH_HISTORY_MAX_AGE_HOURS || 48) * 60 * 60 * 1000;
const FAILURE_STREAK_LIMIT = Number(process.env.HEALTH_ALERT_FAILURE_STREAK || 3);
const LATENCY_WARNING_MS = Number(process.env.HEALTH_ALERT_LATENCY_MS || 2000);

function getHistoryPath() {
  return process.env.HEALTH_HISTORY_PATH || DEFAULT_HISTORY_PATH;
}

function getDirectoryName(filePath) {
  const normalizedPath = filePath.replaceAll("\\", "/");
  const index = normalizedPath.lastIndexOf("/");

  if (index <= 0) {
    return index === 0 ? "/" : ".";
  }

  return filePath.slice(0, index);
}

async function readHistoryFile() {
  try {
    const content = await fs.readFile(getHistoryPath(), "utf8");
    const parsed = JSON.parse(content);

    return {
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return { entries: [] };
    }

    throw error;
  }
}

async function writeHistoryFile(entries) {
  const filePath = getHistoryPath();

  await fs.mkdir(getDirectoryName(filePath), { recursive: true });
  await fs.writeFile(
    filePath,
    JSON.stringify(
      {
        entries,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
}

function normalizeEntry(entry) {
  const checkedAt = entry.checkedAt || entry.at;
  const timestamp = Date.parse(checkedAt);

  if (!entry.targetId || !Number.isFinite(timestamp)) {
    return null;
  }

  return {
    checkedAt: new Date(timestamp).toISOString(),
    error: entry.error || "",
    label: String(entry.label || entry.targetId),
    latencyMs: Number.isFinite(Number(entry.latencyMs)) ? Number(entry.latencyMs) : null,
    ok: Boolean(entry.ok),
    source: entry.source || "",
    status: entry.status ?? null,
    targetId: String(entry.targetId),
    type: entry.type || "http",
  };
}

function pruneEntries(entries) {
  const cutoff = Date.now() - DEFAULT_MAX_AGE_MS;

  return entries
    .map(normalizeEntry)
    .filter(Boolean)
    .filter((entry) => Date.parse(entry.checkedAt) >= cutoff)
    .slice(-DEFAULT_MAX_ENTRIES);
}

export async function recordHealthSnapshot(snapshot) {
  const stored = await readHistoryFile();
  const checkedAt = snapshot.checkedAt || new Date().toISOString();
  const nextEntries = (snapshot.results || []).map((result) => ({
    checkedAt,
    error: result.error || "",
    label: result.label,
    latencyMs: result.latencyMs,
    ok: result.ok,
    source: result.source,
    status: result.status,
    targetId: result.id,
    type: result.type,
  }));
  const entries = pruneEntries([...stored.entries, ...nextEntries]);

  await writeHistoryFile(entries);

  return entries;
}

export async function readHealthHistory() {
  const stored = await readHistoryFile();

  return pruneEntries(stored.entries);
}

export function groupHealthHistory(entries) {
  const groups = new Map();

  for (const entry of entries) {
    const existing = groups.get(entry.targetId) || {
      entries: [],
      label: entry.label,
      targetId: entry.targetId,
    };

    existing.entries.push(entry);
    existing.label = entry.label || existing.label;
    groups.set(entry.targetId, existing);
  }

  return [...groups.values()]
    .map((group) => {
      const sortedEntries = group.entries.sort(
        (a, b) => Date.parse(a.checkedAt) - Date.parse(b.checkedAt),
      );
      const recent = sortedEntries.slice(-30);
      const latest = sortedEntries.at(-1) || null;
      const failures = sortedEntries.filter((entry) => !entry.ok).length;
      const latencies = sortedEntries
        .map((entry) => entry.latencyMs)
        .filter((value) => Number.isFinite(value));
      const averageLatencyMs =
        latencies.length > 0
          ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length)
          : null;

      return {
        averageLatencyMs,
        failures,
        latest,
        recent,
        targetId: group.targetId,
        total: sortedEntries.length,
        uptimePercent:
          sortedEntries.length > 0
            ? Math.round(((sortedEntries.length - failures) / sortedEntries.length) * 1000) / 10
            : null,
      };
    })
    .sort((a, b) => String(a.latest?.label || "").localeCompare(String(b.latest?.label || "")));
}

export function buildHealthAlerts({ history = [], mutedTargets = [], snapshot = null } = {}) {
  const groups = groupHealthHistory(history);
  const alerts = [];
  const mutedTargetIds = new Set(
    mutedTargets
      .filter((item) => Date.parse(item.mutedUntil) > Date.now())
      .map((item) => item.targetId),
  );

  for (const group of groups) {
    if (mutedTargetIds.has(group.targetId)) {
      continue;
    }

    const reversed = [...group.recent].reverse();
    const failureStreak = reversed.findIndex((entry) => entry.ok);
    const consecutiveFailures = failureStreak === -1 ? reversed.length : failureStreak;
    const latest = group.latest;

    if (consecutiveFailures >= FAILURE_STREAK_LIMIT) {
      alerts.push({
        at: latest?.checkedAt,
        detail: `${latest?.label || group.targetId} failed ${consecutiveFailures} checks in a row.`,
        severity: "critical",
        targetId: group.targetId,
        title: "Health check failure streak",
      });
    } else if (latest && !latest.ok) {
      alerts.push({
        at: latest.checkedAt,
        detail: latest.error || `${latest.label} is unhealthy.`,
        severity: "warning",
        targetId: group.targetId,
        title: "Health check failed",
      });
    }

    if (latest?.ok && latest.latencyMs >= LATENCY_WARNING_MS) {
      alerts.push({
        at: latest.checkedAt,
        detail: `${latest.label} latency is ${latest.latencyMs}ms.`,
        severity: "warning",
        targetId: group.targetId,
        title: "High health check latency",
      });
    }
  }

  for (const result of snapshot?.results || []) {
    const alreadyTracked = alerts.some((alert) => alert.targetId === result.id);

    if (!alreadyTracked && !result.ok && !mutedTargetIds.has(result.id)) {
      alerts.push({
        at: snapshot.checkedAt,
        detail: result.error || result.statusText || result.status || "",
        severity: "critical",
        targetId: result.id,
        title: `${result.label} is unhealthy`,
      });
    }
  }

  return alerts;
}

export function getHealthAlertRules() {
  return {
    failureStreakLimit: FAILURE_STREAK_LIMIT,
    historyMaxAgeHours: Math.round(DEFAULT_MAX_AGE_MS / 60 / 60 / 1000),
    latencyWarningMs: LATENCY_WARNING_MS,
    maxEntries: DEFAULT_MAX_ENTRIES,
  };
}
