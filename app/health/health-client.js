"use client";

import { useCallback, useEffect, useState } from "react";
import AppSidebar, { AppMobileNav } from "@/app/components/app-sidebar";

function formatTime(value) {
  return value ? new Date(value).toLocaleString() : "-";
}

function formatShortTime(value) {
  return value ? new Date(value).toLocaleTimeString() : "-";
}

function HistoryDots({ entries }) {
  return (
    <div className="flex min-w-0 flex-wrap gap-1.5">
      {(entries || []).map((entry, index) => (
        <span
          className={`h-3 w-3 rounded-sm ${
            entry.ok ? "bg-emerald-400/80" : "bg-[#e95420]"
          }`}
          key={`${entry.checkedAt}-${index}`}
          title={`${formatTime(entry.checkedAt)} | ${
            entry.ok ? "healthy" : entry.error || "unhealthy"
          } | ${entry.latencyMs ?? "-"}ms`}
        />
      ))}
    </div>
  );
}

export default function HealthClient({ username }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [labelInput, setLabelInput] = useState("");
  const [logModal, setLogModal] = useState(null);
  const [logSearch, setLogSearch] = useState("");
  const [logType, setLogType] = useState("none");
  const [message, setMessage] = useState(null);
  const [pm2Name, setPm2Name] = useState("");
  const [urlInput, setUrlInput] = useState("");

  const loadHealth = useCallback(async () => {
    setIsLoading(true);

    try {
      const response = await fetch("/api/health-checks", { cache: "no-store" });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || `Health API returned ${response.status}`);
      }

      setData(payload);
      setError(null);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  async function addWebsite(event) {
    event.preventDefault();
    setIsSaving(true);

    try {
      const response = await fetch("/api/health-checks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "add-http",
          label: labelInput,
          logType,
          pm2Name,
          url: urlInput,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || `Health API returned ${response.status}`);
      }

      setLabelInput("");
      setLogType("none");
      setPm2Name("");
      setUrlInput("");
      setMessage("Website health check added.");
      setError(null);
      await loadHealth();
    } catch (saveError) {
      setError(saveError.message);
      setMessage(null);
    } finally {
      setIsSaving(false);
    }
  }

  async function viewLogs(target) {
    setLogSearch("");
    setLogModal({
      isLoading: true,
      label: target.label,
      output: "",
      pm2Name: target.pm2Name,
    });

    try {
      const response = await fetch(
        `/api/health-checks/logs?id=${encodeURIComponent(target.id)}`,
        { cache: "no-store" },
      );
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || `Health log API returned ${response.status}`);
      }

      setLogModal({
        ...payload,
        isLoading: false,
      });
      setError(null);
    } catch (logError) {
      setLogModal((current) => ({
        ...current,
        error: logError.message,
        isLoading: false,
      }));
    }
  }

  async function removeTarget(target) {
    if (target.source !== "settings") {
      setError("Targets from environment variables cannot be removed from the web UI.");
      setMessage(null);
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch("/api/health-checks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "remove",
          id: target.id,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || `Health API returned ${response.status}`);
      }

      setMessage(`Removed ${target.label}.`);
      setError(null);
      await loadHealth();
    } catch (removeError) {
      setError(removeError.message);
      setMessage(null);
    } finally {
      setIsSaving(false);
    }
  }

  async function changeMute(target, minutes = 30) {
    setIsSaving(true);

    try {
      const response = await fetch("/api/health-checks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: target.mute ? "unmute" : "mute",
          id: target.id,
          minutes,
          reason: "maintenance",
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || `Health API returned ${response.status}`);
      }

      setMessage(
        target.mute
          ? `${target.label} alerts resumed.`
          : `${target.label} alerts muted for ${minutes} minutes.`,
      );
      setError(null);
      await loadHealth();
    } catch (muteError) {
      setError(muteError.message);
      setMessage(null);
    } finally {
      setIsSaving(false);
    }
  }

  async function restartPm2(target) {
    if (!window.confirm(`Restart PM2 process ${target.pm2Name}?`)) {
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch("/api/pm2", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "restart",
          name: target.pm2Name,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || `PM2 API returned ${response.status}`);
      }

      setMessage(`${target.pm2Name} restart completed.`);
      setError(null);
      await loadHealth();
    } catch (restartError) {
      setError(restartError.message);
      setMessage(null);
    } finally {
      setIsSaving(false);
    }
  }

  useEffect(() => {
    const timeout = setTimeout(loadHealth, 0);
    const interval = setInterval(loadHealth, 15000);

    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [loadHealth]);

  return (
    <main className="min-h-screen bg-[#1c1b22] text-white">
      <AppMobileNav activeItem="Health" />
      <div className="grid min-h-screen lg:grid-cols-[280px_minmax(0,1fr)]">
        <AppSidebar
          activeItem="Health"
          helperText="HTTP and TCP health checks refresh automatically."
          username={username}
        />

        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_0%,rgba(233,84,32,0.20),transparent_30%),linear-gradient(135deg,rgba(44,0,30,0.58),rgba(17,17,17,0.98)_56%)]" />

          <div className="relative z-10 px-5 py-5 sm:px-8 lg:px-10">
            <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#ffb088]">
                  Health Checks
                </p>
                <h1 className="mt-2 text-3xl font-bold tracking-normal">Web & Port Health</h1>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  className="h-10 rounded-md border border-white/14 px-4 text-sm font-semibold text-white transition hover:bg-white/10"
                  onClick={loadHealth}
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
                  <h2 className="text-xl font-bold tracking-normal">Health error</h2>
                  <p className="mt-2 text-sm leading-6 text-white/70">{error}</p>
                </section>
              ) : null}

              {message ? (
                <section className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-4">
                  <p className="text-sm font-semibold text-emerald-100">{message}</p>
                </section>
              ) : null}

              <section className="grid gap-4 md:grid-cols-3">
                <article className="rounded-lg border border-white/10 bg-white/[0.05] p-5">
                  <p className="text-sm font-semibold text-white/56">Configured</p>
                  <p className="mt-2 text-3xl font-bold">{data?.configured ?? 0}</p>
                </article>
                <article className="rounded-lg border border-white/10 bg-white/[0.05] p-5">
                  <p className="text-sm font-semibold text-white/56">Unhealthy</p>
                  <p className="mt-2 text-3xl font-bold">{data?.unhealthy?.length ?? 0}</p>
                </article>
                <article className="rounded-lg border border-white/10 bg-white/[0.05] p-5">
                  <p className="text-sm font-semibold text-white/56">Updated</p>
                  <p className="mt-2 text-base font-bold">{formatTime(data?.checkedAt)}</p>
                </article>
              </section>

              {(data?.alerts || []).length > 0 ? (
                <section className="rounded-lg border border-[#e95420]/45 bg-[#e95420]/14 p-5">
                  <h2 className="text-xl font-bold tracking-normal">Active Health Alerts</h2>
                  <div className="mt-4 grid gap-3">
                    {data.alerts.map((alert, index) => (
                      <div
                        className="rounded-md border border-white/10 bg-black/20 px-4 py-3"
                        key={`${alert.targetId}-${alert.title}-${index}`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-bold text-white">{alert.title}</p>
                            <p className="mt-1 text-sm leading-6 text-white/68">{alert.detail}</p>
                          </div>
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] ${
                              alert.severity === "critical"
                                ? "bg-[#e95420]/22 text-[#ffb088]"
                                : "bg-[#ffb088]/16 text-[#ffd4bf]"
                            }`}
                          >
                            {alert.severity}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              <section className="rounded-lg border border-white/10 bg-white/[0.05] p-5">
                <h2 className="text-xl font-bold tracking-normal">Alert Rules</h2>
                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  <div className="rounded-md bg-black/20 p-4">
                    <p className="text-sm text-white/54">Failure streak</p>
                    <p className="mt-1 text-2xl font-bold">
                      {data?.rules?.failureStreakLimit ?? "-"}
                    </p>
                  </div>
                  <div className="rounded-md bg-black/20 p-4">
                    <p className="text-sm text-white/54">Latency warning</p>
                    <p className="mt-1 text-2xl font-bold">
                      {data?.rules?.latencyWarningMs ?? "-"}ms
                    </p>
                  </div>
                  <div className="rounded-md bg-black/20 p-4">
                    <p className="text-sm text-white/54">History window</p>
                    <p className="mt-1 text-2xl font-bold">
                      {data?.rules?.historyMaxAgeHours ?? "-"}h
                    </p>
                  </div>
                  <div className="rounded-md bg-black/20 p-4">
                    <p className="text-sm text-white/54">Stored entries</p>
                    <p className="mt-1 text-2xl font-bold">{data?.rules?.maxEntries ?? "-"}</p>
                  </div>
                </div>
              </section>

              <section className="rounded-lg border border-white/10 bg-[#111111]/70 p-5">
                <h2 className="text-xl font-bold tracking-normal">Add Website</h2>
                <form className="mt-5 grid gap-3" onSubmit={addWebsite}>
                  <div className="grid gap-3 lg:grid-cols-[260px_1fr_auto]">
                    <input
                      className="h-11 rounded-md border border-white/10 bg-black/24 px-4 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-[#e95420]"
                      onChange={(event) => setLabelInput(event.target.value)}
                      placeholder="Label"
                      value={labelInput}
                    />
                    <input
                      className="h-11 rounded-md border border-white/10 bg-black/24 px-4 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-[#e95420]"
                      onChange={(event) => setUrlInput(event.target.value)}
                      placeholder="http://localhost:3001"
                      value={urlInput}
                    />
                    <button
                      className="h-11 rounded-md bg-[#e95420] px-5 text-sm font-bold text-white transition hover:bg-[#c34113] disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={isSaving || !labelInput.trim() || !urlInput.trim()}
                      type="submit"
                    >
                      {isSaving ? "Saving" : "Add Website"}
                    </button>
                  </div>
                  <div className="grid gap-3 lg:grid-cols-[220px_1fr]">
                    <select
                      className="h-11 rounded-md border border-white/10 bg-black/24 px-4 text-sm text-white outline-none transition focus:border-[#e95420]"
                      onChange={(event) => setLogType(event.target.value)}
                      value={logType}
                    >
                      <option className="bg-[#111111]" value="none">
                        No log source
                      </option>
                      <option className="bg-[#111111]" value="pm2">
                        PM2 logs
                      </option>
                    </select>
                    <input
                      className="h-11 rounded-md border border-white/10 bg-black/24 px-4 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-[#e95420] disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={logType !== "pm2"}
                      onChange={(event) => setPm2Name(event.target.value)}
                      placeholder="PM2 process name, e.g. erp-web"
                      value={pm2Name}
                    />
                  </div>
                </form>
              </section>

              <section className="rounded-lg border border-white/10 bg-[#111111]/70 p-5">
                <h2 className="text-xl font-bold tracking-normal">Targets</h2>
                <div className="mt-5 grid gap-3">
                  {isLoading && !data ? (
                    <p className="rounded-md bg-black/20 px-4 py-5 text-sm text-white/58">
                      Loading health checks...
                    </p>
                  ) : null}

                  {(data?.results || []).map((item) => (
                    <div
                      className="grid gap-3 rounded-md border border-white/10 bg-white/[0.04] p-4 lg:grid-cols-[1fr_auto]"
                      key={`${item.type}-${item.label}-${item.url || `${item.host}:${item.port}`}`}
                    >
                      <div className="min-w-0">
                        <p className="break-all font-bold">{item.label}</p>
                        <p className="mt-1 break-all text-sm text-white/58">
                          {item.type === "http" ? item.url : `${item.host}:${item.port}`}
                        </p>
                        {item.error ? (
                          <p className="mt-1 text-sm text-[#ffb088]">{item.error}</p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                        <span className="rounded-full bg-white/8 px-3 py-1 text-sm font-semibold text-white/50">
                          {item.source === "env" ? "Env" : "Web"}
                        </span>
                        <span
                          className={`rounded-full px-3 py-1 text-sm font-bold ${
                            item.ok
                              ? "bg-emerald-400/12 text-emerald-200"
                              : "bg-[#e95420]/18 text-[#ffb088]"
                          }`}
                        >
                          {item.ok ? "Healthy" : "Unhealthy"}
                        </span>
                        <span className="rounded-full bg-white/8 px-3 py-1 text-sm font-semibold text-white/62">
                          {item.latencyMs}ms
                        </span>
                        {item.mute ? (
                          <span className="rounded-full bg-[#ffb088]/12 px-3 py-1 text-sm font-semibold text-[#ffd4bf]">
                            Muted until {formatShortTime(item.mute.mutedUntil)}
                          </span>
                        ) : null}
                        {item.logType === "pm2" && item.pm2Name ? (
                          <>
                            <button
                              className="h-8 rounded-md border border-emerald-400/25 px-3 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/10"
                              onClick={() => viewLogs(item)}
                              type="button"
                            >
                              View Logs
                            </button>
                            <button
                              className="h-8 rounded-md bg-[#e95420] px-3 text-sm font-bold text-white transition hover:bg-[#c34113] disabled:cursor-not-allowed disabled:opacity-50"
                              disabled={isSaving}
                              onClick={() => restartPm2(item)}
                              type="button"
                            >
                              Restart PM2
                            </button>
                          </>
                        ) : null}
                        {item.source === "settings" ? (
                          <button
                            className="h-8 rounded-md border border-white/14 px-3 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={isSaving}
                            onClick={() => removeTarget(item)}
                            type="button"
                          >
                            Remove
                          </button>
                        ) : null}
                        <button
                          className="h-8 rounded-md border border-white/14 px-3 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={isSaving}
                          onClick={() => changeMute(item, 30)}
                          type="button"
                        >
                          {item.mute ? "Unmute" : "Mute 30m"}
                        </button>
                      </div>
                    </div>
                  ))}

                  {!isLoading && (data?.results || []).length === 0 ? (
                    <p className="rounded-md border border-white/10 bg-black/20 px-4 py-6 text-center text-sm text-white/58">
                      No health targets configured. Set HEALTH_CHECK_URLS or HEALTH_CHECK_PORTS.
                    </p>
                  ) : null}
                </div>
              </section>

              <section className="rounded-lg border border-white/10 bg-[#111111]/70 p-5">
                <h2 className="text-xl font-bold tracking-normal">Health History</h2>
                <div className="mt-5 grid gap-3">
                  {(data?.history || []).map((item) => (
                    <div
                      className="grid gap-4 rounded-md border border-white/10 bg-white/[0.04] p-4 xl:grid-cols-[1fr_auto]"
                      key={item.targetId}
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-3">
                          <p className="break-all font-bold">
                            {item.latest?.label || item.targetId}
                          </p>
                          <span
                            className={`rounded-full px-3 py-1 text-sm font-bold ${
                              item.latest?.ok
                                ? "bg-emerald-400/12 text-emerald-200"
                                : "bg-[#e95420]/18 text-[#ffb088]"
                            }`}
                          >
                            {item.latest?.ok ? "Latest healthy" : "Latest unhealthy"}
                          </span>
                        </div>
                        <div className="mt-3">
                          <HistoryDots entries={item.recent} />
                        </div>
                      </div>
                      <div className="grid gap-1 text-sm text-white/58 xl:text-right">
                        <span>Uptime {item.uptimePercent ?? "-"}%</span>
                        <span>Avg {item.averageLatencyMs ?? "-"}ms</span>
                        <span>Failures {item.failures}</span>
                        <span>Latest {formatShortTime(item.latest?.checkedAt)}</span>
                      </div>
                    </div>
                  ))}
                  {(data?.history || []).length === 0 ? (
                    <p className="rounded-md border border-white/10 bg-black/20 px-4 py-6 text-center text-sm text-white/58">
                      No health history yet. It will appear after checks run.
                    </p>
                  ) : null}
                </div>
              </section>
            </div>
          </div>
        </section>
      </div>
      {logModal ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 py-6">
          <section className="grid max-h-[88vh] w-full max-w-5xl overflow-hidden rounded-lg border border-white/10 bg-[#111111] shadow-2xl shadow-black/50">
            <header className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 p-5">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#ffb088]">
                  PM2 Logs
                </p>
                <h2 className="mt-2 text-2xl font-bold tracking-normal">{logModal.label}</h2>
                <p className="mt-1 text-sm text-white/54">{logModal.pm2Name}</p>
              </div>
              <button
                className="h-10 rounded-md border border-white/14 px-4 text-sm font-semibold text-white transition hover:bg-white/10"
                onClick={() => setLogModal(null)}
                type="button"
              >
                Close
              </button>
            </header>
            <div className="overflow-auto p-5">
              {logModal.isLoading ? (
                <p className="rounded-md bg-black/20 px-4 py-5 text-sm text-white/58">
                  Loading PM2 logs...
                </p>
              ) : null}
              {logModal.error ? (
                <p className="mb-4 rounded-md border border-[#e95420]/50 bg-[#e95420]/14 px-4 py-3 text-sm text-[#ffb088]">
                  {logModal.error}
                </p>
              ) : null}
              <input
                className="mb-4 h-10 w-full rounded-md border border-white/10 bg-black/24 px-4 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-[#e95420]"
                onChange={(event) => setLogSearch(event.target.value)}
                placeholder="Search logs..."
                value={logSearch}
              />
              <pre className="min-h-72 overflow-auto rounded-md border border-white/10 bg-black/45 p-4 font-mono text-xs leading-5 text-white/72">
                {(logModal.output || "")
                  .split("\n")
                  .filter((line) =>
                    logSearch.trim()
                      ? line.toLowerCase().includes(logSearch.trim().toLowerCase())
                      : true,
                  )
                  .join("\n")}
              </pre>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
