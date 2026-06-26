"use client";

import { useEffect, useMemo, useState } from "react";

function formatPercent(value) {
  if (!Number.isFinite(value)) {
    return "N/A";
  }

  return `${Math.round(value)}%`;
}

function formatGb(value) {
  if (!Number.isFinite(value)) {
    return "N/A";
  }

  return `${value.toFixed(1)} GB`;
}

function formatTemperature(value) {
  if (!Number.isFinite(value)) {
    return "N/A";
  }

  return `${value.toFixed(1)} C`;
}

function formatUptime(seconds) {
  if (!Number.isFinite(seconds)) {
    return "N/A";
  }

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }

  return `${hours}h ${minutes}m`;
}

function Meter({ value }) {
  const width = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;

  return (
    <div className="mt-4 h-2 rounded-full bg-white/10">
      <div
        className="h-2 rounded-full bg-[#e95420] transition-all duration-500"
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

function MetricCard({ label, value, detail, percent }) {
  return (
    <article className="rounded-lg border border-white/10 bg-white/[0.05] p-5 shadow-xl shadow-black/10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-white/56">{label}</p>
          <p className="mt-2 text-3xl font-bold tracking-normal text-white">{value}</p>
        </div>
      </div>
      <p className="mt-3 min-h-6 text-sm leading-6 text-white/58">{detail}</p>
      {Number.isFinite(percent) ? <Meter value={percent} /> : null}
    </article>
  );
}

function Notice({ notice }) {
  const isCritical = notice.level === "critical";
  const isOk = notice.level === "ok";

  return (
    <div
      className={`rounded-md border px-4 py-3 ${
        isCritical
          ? "border-[#e95420]/50 bg-[#e95420]/14"
          : isOk
            ? "border-emerald-400/30 bg-emerald-400/10"
            : "border-[#ffb088]/35 bg-[#ffb088]/10"
      }`}
    >
      <p className="text-sm font-bold text-white">{notice.title}</p>
      <p className="mt-1 text-sm leading-6 text-white/62">{notice.message}</p>
    </div>
  );
}

export default function DashboardClient({ username }) {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadStatus() {
      try {
        const response = await fetch("/api/server-status", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Status API returned ${response.status}`);
        }

        const data = await response.json();

        if (isMounted) {
          setStatus(data);
          setError(null);
          setIsLoading(false);
        }
      } catch (loadError) {
        if (isMounted) {
          setError(loadError.message);
          setIsLoading(false);
        }
      }
    }

    loadStatus();
    const interval = setInterval(loadStatus, 5000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const metrics = useMemo(() => {
    if (!status) {
      return [];
    }

    return [
      {
        label: "CPU",
        value: formatPercent(status.cpu?.usagePercent),
        detail: `${status.cpu?.cores ?? "N/A"} cores - ${status.cpu?.model ?? "Unknown CPU"}`,
        percent: status.cpu?.usagePercent,
      },
      {
        label: "RAM",
        value: formatPercent(status.memory?.usedPercent),
        detail: `${formatGb(status.memory?.usedGb)} used of ${formatGb(status.memory?.totalGb)}`,
        percent: status.memory?.usedPercent,
      },
      {
        label: "Disk",
        value: formatPercent(status.disk?.usedPercent),
        detail: status.disk
          ? `${formatGb(status.disk.usedGb)} used of ${formatGb(status.disk.totalGb)}`
          : "Disk usage is unavailable",
        percent: status.disk?.usedPercent,
      },
      {
        label: "Temperature",
        value: formatTemperature(status.temperature),
        detail: status.temperature === null ? "Thermal sensor not available" : "Current sensor reading",
      },
    ];
  }, [status]);

  return (
    <main className="min-h-screen bg-[#1c1b22] text-white">
      <div className="grid min-h-screen lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="hidden border-r border-white/10 bg-[#111111] px-5 py-6 lg:block">
          <div className="flex h-full flex-col">
            <div className="flex items-center gap-3 px-2">
              <div className="grid h-11 w-11 place-items-center rounded-md bg-[#e95420] font-bold shadow-lg shadow-[#e95420]/20">
                UA
              </div>
              <div>
                <p className="text-sm text-white/54">Ubuntu</p>
                <p className="font-bold">Admin Panel</p>
              </div>
            </div>

            <nav className="mt-9 grid gap-1">
              {["Overview", "Resources", "Notices", "Settings"].map((item, index) => (
                <a
                  className={`rounded-md px-3 py-2.5 text-sm font-semibold transition ${
                    index === 0
                      ? "bg-[#e95420] text-white shadow-lg shadow-[#e95420]/20"
                      : "text-white/66 hover:bg-white/8 hover:text-white"
                  }`}
                  href="#"
                  key={item}
                >
                  {item}
                </a>
              ))}
            </nav>

            <div className="mt-auto rounded-lg border border-white/10 bg-white/[0.04] p-4">
              <p className="text-sm font-semibold text-[#ffb088]">Signed in as</p>
              <p className="mt-1 truncate text-base font-bold">{username}</p>
              <p className="mt-2 text-sm leading-6 text-white/56">
                Server metrics refresh automatically.
              </p>
            </div>
          </div>
        </aside>

        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_0%,rgba(233,84,32,0.20),transparent_30%),linear-gradient(135deg,rgba(44,0,30,0.58),rgba(17,17,17,0.98)_56%)]" />

          <div className="relative z-10 px-5 py-5 sm:px-8 lg:px-10">
            <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#ffb088]">
                  Server Dashboard
                </p>
                <h1 className="mt-2 text-3xl font-bold tracking-normal text-white">
                  Welcome, {username}
                </h1>
              </div>

              <form action="/api/logout" method="post">
                <button
                  type="submit"
                  className="h-10 rounded-md border border-white/14 px-4 text-sm font-semibold text-white transition hover:bg-white/10"
                >
                  Logout
                </button>
              </form>
            </header>

            <div className="grid gap-6 py-7 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="grid gap-6">
                <section className="rounded-lg border border-white/10 bg-white/[0.05] p-6 shadow-2xl shadow-black/20">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#e95420]">
                        Live resources
                      </p>
                      <h2 className="mt-3 text-2xl font-bold tracking-normal">
                        {status?.hostname || "Loading server"}
                      </h2>
                    </div>
                    <span className="rounded-full bg-[#e95420]/18 px-3 py-1 text-sm font-bold text-[#ffb088]">
                      Refresh 5s
                    </span>
                  </div>
                  <p className="mt-4 max-w-3xl text-base leading-7 text-white/66">
                    CPU, RAM, disk, temperature, uptime, and error notices are read from the
                    server after PAM login.
                  </p>
                </section>

                {error ? (
                  <section className="rounded-lg border border-[#e95420]/50 bg-[#e95420]/14 p-5">
                    <h2 className="text-xl font-bold tracking-normal">Status API error</h2>
                    <p className="mt-2 text-sm leading-6 text-white/70">{error}</p>
                  </section>
                ) : null}

                <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {isLoading
                    ? ["CPU", "RAM", "Disk", "Temperature"].map((label) => (
                        <MetricCard
                          detail="Waiting for server data"
                          key={label}
                          label={label}
                          value="Loading"
                        />
                      ))
                    : metrics.map((metric) => (
                        <MetricCard
                          detail={metric.detail}
                          key={metric.label}
                          label={metric.label}
                          percent={metric.percent}
                          value={metric.value}
                        />
                      ))}
                </section>

                <section className="rounded-lg border border-white/10 bg-[#111111]/70 p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-xl font-bold tracking-normal">Error Notice</h2>
                    <span className="text-sm text-white/50">
                      {status?.updatedAt
                        ? new Date(status.updatedAt).toLocaleTimeString()
                        : "Not updated"}
                    </span>
                  </div>

                  <div className="grid gap-3">
                    {(status?.notices || [
                      {
                        level: "warning",
                        title: "Waiting for metrics",
                        message: "The dashboard is loading server status data.",
                      },
                    ]).map((notice) => (
                      <Notice key={`${notice.level}-${notice.title}`} notice={notice} />
                    ))}
                  </div>
                </section>

                <section className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-lg border border-white/10 bg-white/[0.05] p-5">
                    <h2 className="text-xl font-bold tracking-normal">Service Status</h2>
                    <div className="mt-4 grid gap-3">
                      {(status?.checks?.services?.services || []).length > 0 ? (
                        status.checks.services.services.map((service) => (
                          <div
                            className="flex items-center justify-between gap-3 rounded-md bg-black/20 px-4 py-3"
                            key={service.name}
                          >
                            <span className="font-semibold">{service.name}</span>
                            <span
                              className={`rounded-full px-3 py-1 text-sm font-bold ${
                                service.ok
                                  ? "bg-emerald-400/12 text-emerald-200"
                                  : "bg-[#e95420]/18 text-[#ffb088]"
                              }`}
                            >
                              {service.state}
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm leading-6 text-white/58">
                          Service checks are unavailable or not configured.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-lg border border-white/10 bg-white/[0.05] p-5">
                    <h2 className="text-xl font-bold tracking-normal">Security Signals</h2>
                    <div className="mt-4 grid gap-3">
                      <div className="rounded-md bg-black/20 p-4">
                        <p className="text-sm text-white/54">Failed logins / 15 minutes</p>
                        <p className="mt-1 text-2xl font-bold">
                          {status?.checks?.authFailures?.checked
                            ? status.checks.authFailures.failedLogins
                            : "N/A"}
                        </p>
                      </div>
                      <div className="rounded-md bg-black/20 p-4">
                        <p className="text-sm text-white/54">SYN received connections</p>
                        <p className="mt-1 text-2xl font-bold">
                          {status?.checks?.connections?.checked
                            ? status.checks.connections.synReceived
                            : "N/A"}
                        </p>
                      </div>
                      <div className="rounded-md bg-black/20 p-4">
                        <p className="text-sm text-white/54">Established connections</p>
                        <p className="mt-1 text-2xl font-bold">
                          {status?.checks?.connections?.checked
                            ? status.checks.connections.established
                            : "N/A"}
                        </p>
                      </div>
                    </div>
                  </div>
                </section>
              </div>

              <aside className="grid content-start gap-6">
                <section className="rounded-lg border border-white/10 bg-white/[0.05] p-5">
                  <h2 className="text-xl font-bold tracking-normal">Server Info</h2>
                  <div className="mt-4 grid gap-3">
                    <div className="rounded-md bg-black/20 p-4">
                      <p className="text-sm text-white/54">Platform</p>
                      <p className="mt-1 font-bold">{status?.platform || "N/A"}</p>
                    </div>
                    <div className="rounded-md bg-black/20 p-4">
                      <p className="text-sm text-white/54">Uptime</p>
                      <p className="mt-1 font-bold">{formatUptime(status?.uptimeSeconds)}</p>
                    </div>
                    <div className="rounded-md bg-black/20 p-4">
                      <p className="text-sm text-white/54">Load average</p>
                      <p className="mt-1 font-bold">
                        {status?.cpu?.loadAverage
                          ?.map((value) => value.toFixed(2))
                          .join(" / ") || "N/A"}
                      </p>
                    </div>
                  </div>
                </section>

                <section className="rounded-lg border border-white/10 bg-white/[0.05] p-5">
                  <h2 className="text-xl font-bold tracking-normal">Memory</h2>
                  <div className="mt-4 grid gap-3 text-sm leading-6 text-white/64">
                    <p>Used: {formatGb(status?.memory?.usedGb)}</p>
                    <p>Free: {formatGb(status?.memory?.freeGb)}</p>
                    <p>Total: {formatGb(status?.memory?.totalGb)}</p>
                  </div>
                </section>
              </aside>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
