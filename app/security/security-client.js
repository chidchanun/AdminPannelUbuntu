"use client";

import { useCallback, useEffect, useState } from "react";
import AppSidebar, { AppMobileNav } from "@/app/components/app-sidebar";

function formatTime(value) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString();
}

function EmptyState({ children }) {
  return (
    <div className="rounded-md border border-white/10 bg-black/20 px-4 py-6 text-center text-sm text-white/58">
      {children}
    </div>
  );
}

function actionLabel(action) {
  if (action === "firewall-block") {
    return "Firewall blocked";
  }

  return action === "block" ? "Blocked" : "Unblocked";
}

function BlockButtons({ ip, onAction }) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        className="h-10 rounded-md border border-white/14 px-4 text-sm font-semibold text-white transition hover:bg-white/10"
        onClick={() => onAction("block", ip)}
        type="button"
      >
        App Block
      </button>
      <button
        className="h-10 rounded-md bg-[#e95420] px-4 text-sm font-bold text-white transition hover:bg-[#c34113]"
        onClick={() => onAction("firewall-block", ip)}
        type="button"
      >
        UFW Block
      </button>
    </div>
  );
}

export default function SecurityClient({ username }) {
  const [data, setData] = useState(null);
  const [manualIp, setManualIp] = useState("");
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadSecurity = useCallback(async () => {
    setIsLoading(true);

    try {
      const response = await fetch("/api/security", { cache: "no-store" });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || `Security API returned ${response.status}`);
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
    async function loadInitialSecurity() {
      await loadSecurity();
    }

    loadInitialSecurity();
    const interval = setInterval(loadSecurity, 5000);

    return () => clearInterval(interval);
  }, [loadSecurity]);

  async function changeBlock(action, ip) {
    try {
      const response = await fetch("/api/security", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action, ip }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || `Security API returned ${response.status}`);
      }

      setMessage(`${actionLabel(action)} ${ip}`);
      setError(null);
      setManualIp("");
      await loadSecurity();
    } catch (changeError) {
      setError(changeError.message);
      setMessage(null);
    }
  }

  function submitManualBlock(event) {
    event.preventDefault();

    if (manualIp.trim()) {
      changeBlock("block", manualIp.trim());
    }
  }

  return (
    <main className="min-h-screen bg-[#1c1b22] text-white">
      <AppMobileNav activeItem="Security" />
      <div className="grid min-h-screen lg:grid-cols-[280px_minmax(0,1fr)]">
        <AppSidebar
          activeItem="Security"
          helperText="Suspicious paths and request floods are blocked automatically."
          username={username}
        />

        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_0%,rgba(233,84,32,0.20),transparent_30%),linear-gradient(135deg,rgba(44,0,30,0.58),rgba(17,17,17,0.98)_56%)]" />

          <div className="relative z-10 px-5 py-5 sm:px-8 lg:px-10">
            <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#ffb088]">
                  Security Guard
                </p>
                <h1 className="mt-2 text-3xl font-bold tracking-normal">
                  Bot Scan & DDoS Blocking
                </h1>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  className="h-10 rounded-md border border-white/14 px-4 text-sm font-semibold text-white transition hover:bg-white/10"
                  onClick={loadSecurity}
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
              <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
                <article className="rounded-lg border border-white/10 bg-white/[0.05] p-5">
                  <p className="text-sm font-semibold text-white/56">Blocked IPs</p>
                  <p className="mt-2 text-3xl font-bold">{data?.blocked?.length ?? 0}</p>
                </article>
                <article className="rounded-lg border border-white/10 bg-white/[0.05] p-5">
                  <p className="text-sm font-semibold text-white/56">Tracked IPs</p>
                  <p className="mt-2 text-3xl font-bold">{data?.requests?.length ?? 0}</p>
                </article>
                <article className="rounded-lg border border-white/10 bg-white/[0.05] p-5">
                  <p className="text-sm font-semibold text-white/56">Scan Buckets</p>
                  <p className="mt-2 text-3xl font-bold">{data?.scans?.length ?? 0}</p>
                </article>
                <article className="rounded-lg border border-white/10 bg-white/[0.05] p-5">
                  <p className="text-sm font-semibold text-white/56">Port Alerts</p>
                  <p className="mt-2 text-3xl font-bold">
                    {data?.server?.connections?.alerts?.length ?? 0}
                  </p>
                </article>
                <article className="rounded-lg border border-white/10 bg-white/[0.05] p-5">
                  <p className="text-sm font-semibold text-white/56">Web Scanners</p>
                  <p className="mt-2 text-3xl font-bold">
                    {data?.server?.webLogs?.suspicious?.length ?? 0}
                  </p>
                </article>
                <article className="rounded-lg border border-white/10 bg-white/[0.05] p-5">
                  <p className="text-sm font-semibold text-white/56">SSH Attackers</p>
                  <p className="mt-2 text-3xl font-bold">
                    {data?.server?.auth?.failedByIp?.length ?? 0}
                  </p>
                </article>
              </section>

              {error ? (
                <section className="rounded-lg border border-[#e95420]/50 bg-[#e95420]/14 p-5">
                  <h2 className="text-xl font-bold tracking-normal">Security error</h2>
                  <p className="mt-2 text-sm leading-6 text-white/70">{error}</p>
                </section>
              ) : null}

              {message ? (
                <section className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-4">
                  <p className="text-sm font-semibold text-emerald-100">{message}</p>
                </section>
              ) : null}

              <section className="rounded-lg border border-white/10 bg-white/[0.05] p-5">
                <h2 className="text-xl font-bold tracking-normal">Manual Block</h2>
                <form className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto_auto]" onSubmit={submitManualBlock}>
                  <input
                    className="h-11 rounded-md border border-white/10 bg-black/24 px-4 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-[#e95420]"
                    onChange={(event) => setManualIp(event.target.value)}
                    placeholder="IP address"
                    value={manualIp}
                  />
                  <button
                    className="h-11 rounded-md bg-[#e95420] px-5 text-sm font-bold text-white transition hover:bg-[#c34113] disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!manualIp.trim()}
                    type="submit"
                  >
                    Block IP
                  </button>
                  <button
                    className="h-11 rounded-md border border-[#e95420]/60 px-5 text-sm font-bold text-white transition hover:bg-[#e95420]/16 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!manualIp.trim()}
                    onClick={(event) => {
                      event.preventDefault();
                      changeBlock("firewall-block", manualIp.trim());
                    }}
                    type="button"
                  >
                    UFW Block
                  </button>
                </form>
              </section>

              <section className="rounded-lg border border-white/10 bg-[#111111]/70 p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-xl font-bold tracking-normal">Server Port Alerts</h2>
                  <span className="text-sm text-white/50">
                    {data?.server?.connections?.total ?? 0} active TCP rows
                  </span>
                </div>

                {data?.server?.connections?.error ? (
                  <p className="mb-4 rounded-md border border-[#e95420]/40 bg-[#e95420]/12 px-4 py-3 text-sm text-white/70">
                    {data.server.connections.error}
                  </p>
                ) : null}

                <div className="grid gap-3">
                  {(data?.server?.connections?.alerts || []).map((item) => (
                    <div
                      className="grid gap-4 rounded-md border border-white/10 bg-white/[0.04] p-4 xl:grid-cols-[1fr_auto]"
                      key={item.ip}
                    >
                      <div>
                        <p className="break-all font-bold">{item.ip}</p>
                        <p className="mt-1 text-sm text-white/58">
                          {item.total} connections | {item.synReceived} SYN-RECV | ports{" "}
                          {item.ports.join(", ")}
                        </p>
                        <p className="mt-1 text-sm text-[#ffb088]">{item.reasons.join(", ")}</p>
                      </div>
                      <BlockButtons ip={item.ip} onAction={changeBlock} />
                    </div>
                  ))}
                  {(data?.server?.connections?.alerts || []).length === 0 ? (
                    <EmptyState>No port alerts right now.</EmptyState>
                  ) : null}
                </div>
              </section>

              <section className="grid gap-5 xl:grid-cols-2">
                <div className="rounded-lg border border-white/10 bg-white/[0.05] p-5">
                  <h2 className="text-xl font-bold tracking-normal">Web Log Scans</h2>
                  <div className="mt-4 grid gap-3">
                    {data?.server?.webLogs?.error ? (
                      <p className="rounded-md border border-[#e95420]/40 bg-[#e95420]/12 px-4 py-3 text-sm text-white/70">
                        {data.server.webLogs.error}
                      </p>
                    ) : null}

                    {(data?.server?.webLogs?.suspicious || []).map((item) => (
                      <div className="rounded-md bg-black/20 px-4 py-3" key={item.ip}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="break-all font-bold">{item.ip}</p>
                            <p className="mt-1 text-sm text-white/60">
                              {item.scanHits} scan hits | {item.notFound} not found
                            </p>
                            <p className="mt-1 break-all text-xs text-white/40">
                              {item.examples.join(", ")}
                            </p>
                          </div>
                          <BlockButtons ip={item.ip} onAction={changeBlock} />
                        </div>
                      </div>
                    ))}
                    {(data?.server?.webLogs?.suspicious || []).length === 0 ? (
                      <EmptyState>No suspicious web log sources.</EmptyState>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-lg border border-white/10 bg-white/[0.05] p-5">
                  <h2 className="text-xl font-bold tracking-normal">SSH Failed Login Sources</h2>
                  <div className="mt-4 grid gap-3">
                    {data?.server?.auth?.error ? (
                      <p className="rounded-md border border-[#e95420]/40 bg-[#e95420]/12 px-4 py-3 text-sm text-white/70">
                        {data.server.auth.error}
                      </p>
                    ) : null}

                    {(data?.server?.auth?.failedByIp || []).map((item) => (
                      <div className="rounded-md bg-black/20 px-4 py-3" key={item.ip}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="break-all font-bold">{item.ip}</p>
                            <p className="mt-1 text-sm text-white/60">
                              {item.total} failures | users {item.users.join(", ")}
                            </p>
                            <p className="mt-1 break-all text-xs text-white/40">
                              {item.lastMessage}
                            </p>
                          </div>
                          <BlockButtons ip={item.ip} onAction={changeBlock} />
                        </div>
                      </div>
                    ))}
                    {(data?.server?.auth?.failedByIp || []).length === 0 ? (
                      <EmptyState>No repeated SSH failures.</EmptyState>
                    ) : null}
                  </div>
                </div>
              </section>

              <section className="rounded-lg border border-white/10 bg-[#111111]/70 p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-xl font-bold tracking-normal">Blocked IPs</h2>
                  <span className="text-sm text-white/50">
                    {isLoading ? "Loading" : formatTime(data?.updatedAt)}
                  </span>
                </div>

                <div className="grid gap-3">
                  {(data?.blocked || []).map((item) => (
                    <div
                      className="grid gap-3 rounded-md border border-white/10 bg-white/[0.04] p-4 lg:grid-cols-[1fr_auto]"
                      key={item.ip}
                    >
                      <div>
                        <p className="break-all font-bold">{item.ip}</p>
                        <p className="mt-1 text-sm text-white/58">{item.reason}</p>
                        <p className="mt-1 text-sm text-white/42">
                          Expires: {formatTime(item.expiresAtIso)}
                        </p>
                      </div>
                      <button
                        className="h-10 rounded-md border border-white/14 px-4 text-sm font-semibold text-white transition hover:bg-white/10"
                        onClick={() => changeBlock("unblock", item.ip)}
                        type="button"
                      >
                        Unblock
                      </button>
                    </div>
                  ))}
                  {(data?.blocked || []).length === 0 ? (
                    <EmptyState>No blocked IPs right now.</EmptyState>
                  ) : null}
                </div>
              </section>

              <section className="grid gap-5 xl:grid-cols-2">
                <div className="rounded-lg border border-white/10 bg-white/[0.05] p-5">
                  <h2 className="text-xl font-bold tracking-normal">Recent Security Events</h2>
                  <div className="mt-4 grid gap-3">
                    {(data?.events || []).slice(0, 12).map((event, index) => (
                      <div className="rounded-md bg-black/20 px-4 py-3" key={`${event.at}-${index}`}>
                        <p className="font-semibold">{event.action}</p>
                        <p className="mt-1 break-all text-sm text-white/60">
                          {event.ip || "-"} | {event.reason || event.pathname || "-"}
                        </p>
                        <p className="mt-1 text-xs text-white/38">{formatTime(event.at)}</p>
                      </div>
                    ))}
                    {(data?.events || []).length === 0 ? (
                      <EmptyState>No recent security events.</EmptyState>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-lg border border-white/10 bg-white/[0.05] p-5">
                  <h2 className="text-xl font-bold tracking-normal">Tracked Request Counts</h2>
                  <div className="mt-4 grid gap-3">
                    {(data?.requests || []).slice(0, 12).map((item) => (
                      <div
                        className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-black/20 px-4 py-3"
                        key={item.ip}
                      >
                        <span className="break-all font-semibold">{item.ip}</span>
                        <span className="rounded-full bg-white/8 px-3 py-1 text-sm font-bold text-white/70">
                          {item.count} req/min
                        </span>
                      </div>
                    ))}
                    {(data?.requests || []).length === 0 ? (
                      <EmptyState>No active request buckets.</EmptyState>
                    ) : null}
                  </div>
                </div>
              </section>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
