"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AppSidebar, { AppMobileNav } from "@/app/components/app-sidebar";

const ACTIONS = [
  { label: "Restart", value: "restart", danger: true },
  { label: "Reload", value: "reload" },
  { label: "Start", value: "start" },
  { label: "Stop", value: "stop", danger: true, confirm: true },
];

function formatBytes(value) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let index = 0;

  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }

  return `${size.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatUptime(seconds) {
  if (!Number.isFinite(seconds)) {
    return "-";
  }

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  return days > 0 ? `${days}d ${hours}h` : `${hours}h ${minutes}m`;
}

function StatusBadge({ status }) {
  const ok = status === "online";

  return (
    <span
      className={`rounded-full px-3 py-1 text-sm font-bold ${
        ok ? "bg-emerald-400/12 text-emerald-200" : "bg-[#e95420]/18 text-[#ffb088]"
      }`}
    >
      {status}
    </span>
  );
}

export default function Pm2Client({ username }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [query, setQuery] = useState("");
  const [runningAction, setRunningAction] = useState(null);

  const loadPm2 = useCallback(async () => {
    setIsLoading(true);

    try {
      const response = await fetch("/api/pm2", { cache: "no-store" });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || `PM2 API returned ${response.status}`);
      }

      setData(payload);
      setError(null);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = setTimeout(loadPm2, 0);
    const interval = setInterval(loadPm2, 10000);

    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [loadPm2]);

  const filteredProcesses = useMemo(() => {
    const needle = query.trim().toLowerCase();

    if (!needle) {
      return data?.processes || [];
    }

    return (data?.processes || []).filter((processInfo) =>
      [processInfo.name, processInfo.status, processInfo.namespace, processInfo.execMode]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [data, query]);

  async function runAction(processName, action) {
    if (
      action === "stop" &&
      !window.confirm(`Stop ${processName}? This may interrupt users using this app.`)
    ) {
      return;
    }

    setRunningAction(`${action}:${processName}`);

    try {
      const response = await fetch("/api/pm2", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action, name: processName }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || `PM2 API returned ${response.status}`);
      }

      setMessage(`${processName} ${action} completed.`);
      setError(null);
      await loadPm2();
    } catch (actionError) {
      setError(actionError.message);
      setMessage(null);
    } finally {
      setRunningAction(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#1c1b22] text-white">
      <AppMobileNav activeItem="PM2" />
      <div className="grid min-h-screen lg:grid-cols-[280px_minmax(0,1fr)]">
        <AppSidebar
          activeItem="PM2"
          helperText="PM2 process metrics and actions use the server PM2 CLI."
          username={username}
        />

        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_0%,rgba(233,84,32,0.20),transparent_30%),linear-gradient(135deg,rgba(44,0,30,0.58),rgba(17,17,17,0.98)_56%)]" />

          <div className="relative z-10 px-5 py-5 sm:px-8 lg:px-10">
            <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#ffb088]">
                  PM2
                </p>
                <h1 className="mt-2 text-3xl font-bold tracking-normal">Process Manager</h1>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  className="h-10 rounded-md border border-white/14 px-4 text-sm font-semibold text-white transition hover:bg-white/10"
                  onClick={loadPm2}
                  type="button"
                >
                  Refresh
                </button>
                <form action="/api/logout" method="post">
                  <button
                    className="h-10 rounded-md border border-white/14 px-4 text-sm font-semibold text-white transition hover:bg-white/10"
                    type="submit"
                  >
                    Logout
                  </button>
                </form>
              </div>
            </header>

            <div className="grid gap-5 py-7">
              {error ? (
                <section className="rounded-lg border border-[#e95420]/50 bg-[#e95420]/14 p-5">
                  <h2 className="text-xl font-bold tracking-normal">PM2 error</h2>
                  <p className="mt-2 text-sm leading-6 text-white/70">{error}</p>
                </section>
              ) : null}

              {data?.error ? (
                <section className="rounded-lg border border-[#e95420]/40 bg-[#e95420]/12 p-4">
                  <p className="text-sm leading-6 text-white/72">{data.error}</p>
                </section>
              ) : null}

              {message ? (
                <section className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-4">
                  <p className="text-sm font-semibold text-emerald-100">{message}</p>
                </section>
              ) : null}

              <section className="grid gap-4 md:grid-cols-4">
                <article className="rounded-lg border border-white/10 bg-white/[0.05] p-5">
                  <p className="text-sm font-semibold text-white/56">Total</p>
                  <p className="mt-2 text-3xl font-bold">{data?.summary?.total ?? 0}</p>
                </article>
                <article className="rounded-lg border border-white/10 bg-white/[0.05] p-5">
                  <p className="text-sm font-semibold text-white/56">Online</p>
                  <p className="mt-2 text-3xl font-bold">{data?.summary?.online ?? 0}</p>
                </article>
                <article className="rounded-lg border border-white/10 bg-white/[0.05] p-5">
                  <p className="text-sm font-semibold text-white/56">Stopped</p>
                  <p className="mt-2 text-3xl font-bold">{data?.summary?.stopped ?? 0}</p>
                </article>
                <article className="rounded-lg border border-white/10 bg-white/[0.05] p-5">
                  <p className="text-sm font-semibold text-white/56">Errored</p>
                  <p className="mt-2 text-3xl font-bold">{data?.summary?.errored ?? 0}</p>
                </article>
              </section>

              <section className="rounded-lg border border-white/10 bg-[#111111]/70 p-5">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-xl font-bold tracking-normal">Processes</h2>
                  <input
                    className="h-10 w-full rounded-md border border-white/10 bg-black/24 px-4 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-[#e95420] sm:w-80"
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Filter PM2 process..."
                    value={query}
                  />
                </div>

                <div className="grid gap-3">
                  {isLoading && !data ? (
                    <p className="rounded-md bg-black/20 px-4 py-5 text-sm text-white/58">
                      Loading PM2 processes...
                    </p>
                  ) : null}

                  {filteredProcesses.map((processInfo) => (
                    <div
                      className="grid gap-4 rounded-md border border-white/10 bg-white/[0.04] p-4 xl:grid-cols-[1fr_auto_auto] xl:items-center"
                      key={`${processInfo.namespace}-${processInfo.id}-${processInfo.name}`}
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-3">
                          <p className="break-all font-bold">{processInfo.name}</p>
                          <StatusBadge status={processInfo.status} />
                        </div>
                        <p className="mt-2 text-sm text-white/58">
                          PID {processInfo.pid || "-"} | {processInfo.execMode || "fork"} | uptime{" "}
                          {formatUptime(processInfo.uptimeSeconds)}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm text-white/62 sm:grid-cols-4">
                        <span>CPU {processInfo.cpu}%</span>
                        <span>RAM {formatBytes(processInfo.memory)}</span>
                        <span>Restarts {processInfo.restartCount}</span>
                        <span>Unstable {processInfo.unstableRestarts}</span>
                      </div>
                      <div className="flex flex-wrap gap-2 xl:justify-end">
                        {ACTIONS.map((item) => {
                          const actionId = `${item.value}:${processInfo.name}`;

                          return (
                            <button
                              className={`h-9 rounded-md px-3 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                                item.danger
                                  ? "bg-[#e95420] text-white hover:bg-[#c34113]"
                                  : "border border-white/10 text-white/70 hover:bg-white/10"
                              }`}
                              disabled={Boolean(runningAction)}
                              key={item.value}
                              onClick={() => runAction(processInfo.name, item.value)}
                              type="button"
                            >
                              {runningAction === actionId ? "Running" : item.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  {!isLoading && filteredProcesses.length === 0 ? (
                    <p className="rounded-md bg-black/20 px-4 py-5 text-sm text-white/58">
                      No PM2 processes found.
                    </p>
                  ) : null}
                </div>
              </section>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
