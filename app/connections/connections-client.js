"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppSidebar from "@/app/components/app-sidebar";

function StatCard({ label, value, detail }) {
  return (
    <article className="rounded-lg border border-white/10 bg-white/[0.05] p-5">
      <p className="text-sm font-semibold text-white/56">{label}</p>
      <p className="mt-2 text-3xl font-bold tracking-normal">{value}</p>
      <p className="mt-2 text-sm leading-6 text-white/58">{detail}</p>
    </article>
  );
}

function StatusMessage({ title, message }) {
  return (
    <div className="rounded-md border border-[#ffb088]/35 bg-[#ffb088]/10 px-4 py-3">
      <p className="text-sm font-bold">{title}</p>
      <p className="mt-1 text-sm leading-6 text-white/62">{message}</p>
    </div>
  );
}

function EmptyState({ children }) {
  return (
    <div className="rounded-md border border-white/10 bg-black/20 px-4 py-6 text-center text-sm text-white/58">
      {children}
    </div>
  );
}

export default function ConnectionsClient({ username }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadConnections() {
      try {
        const response = await fetch("/api/connections", { cache: "no-store" });

        if (!response.ok) {
          throw new Error(`Connections API returned ${response.status}`);
        }

        const payload = await response.json();

        if (isMounted) {
          setData(payload);
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

    loadConnections();
    const interval = setInterval(loadConnections, 5000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const activeRows = data?.current?.byIp || [];
  const failedRows = data?.failed?.byIp || [];
  const connectionRows = data?.current?.connections || [];

  return (
    <main className="min-h-screen bg-[#1c1b22] text-white">
      <div className="grid min-h-screen lg:grid-cols-[280px_minmax(0,1fr)]">
        <AppSidebar
          activeItem="Connections"
          helperText="Connection data refreshes every 5 seconds."
          username={username}
        />

        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_0%,rgba(233,84,32,0.20),transparent_30%),linear-gradient(135deg,rgba(44,0,30,0.58),rgba(17,17,17,0.98)_56%)]" />

          <div className="relative z-10 px-5 py-5 sm:px-8 lg:px-10">
            <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#ffb088]">
                  Connection Monitor
                </p>
                <h1 className="mt-2 text-3xl font-bold tracking-normal">
                  ใครกำลังเชื่อมต่อเข้ามา
                </h1>
              </div>

              <div className="flex items-center gap-3">
                <Link
                  className="h-10 rounded-md border border-white/14 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
                  href="/dashboard"
                >
                  Dashboard
                </Link>
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

            <div className="grid gap-6 py-7">
              {error ? (
                <StatusMessage title="Connection API error" message={error} />
              ) : null}

              <section className="grid gap-4 md:grid-cols-4">
                <StatCard
                  detail="All visible TCP rows from ss"
                  label="Current"
                  value={isLoading ? "Loading" : data?.current?.total ?? 0}
                />
                <StatCard
                  detail="Currently established TCP sessions"
                  label="Established"
                  value={isLoading ? "Loading" : data?.current?.established ?? 0}
                />
                <StatCard
                  detail="Half-open or pending TCP handshakes"
                  label="SYN-RECV"
                  value={isLoading ? "Loading" : data?.current?.synReceived ?? 0}
                />
                <StatCard
                  detail="Failed SSH/auth attempts in 24 hours"
                  label="Failed Attempts"
                  value={isLoading ? "Loading" : data?.failed?.total ?? 0}
                />
              </section>

              {!data?.current?.checked && data?.current?.error ? (
                <StatusMessage title="Current connection check unavailable" message={data.current.error} />
              ) : null}

              {!data?.failed?.checked && data?.failed?.error ? (
                <StatusMessage title="Auth attempt check unavailable" message={data.failed.error} />
              ) : null}

              <section className="rounded-lg border border-white/10 bg-white/[0.05] p-5">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <h2 className="text-xl font-bold tracking-normal">Active IPs</h2>
                  <span className="text-sm text-white/50">
                    {data?.updatedAt ? new Date(data.updatedAt).toLocaleTimeString() : "Not updated"}
                  </span>
                </div>

                <div className="overflow-x-auto rounded-md border border-white/10">
                  {activeRows.length > 0 ? (
                    <table className="w-full min-w-[860px] table-fixed text-left text-sm">
                      <colgroup>
                        <col className="w-[34%]" />
                        <col className="w-[12%]" />
                        <col className="w-[12%]" />
                        <col className="w-[12%]" />
                        <col className="w-[30%]" />
                      </colgroup>
                      <thead className="bg-black/24 text-white/48">
                        <tr className="border-b border-white/10">
                          <th className="px-4 py-3 font-semibold">Remote IP</th>
                          <th className="px-4 py-3 font-semibold">Total</th>
                          <th className="px-4 py-3 font-semibold">ESTAB</th>
                          <th className="px-4 py-3 font-semibold">SYN</th>
                          <th className="px-4 py-3 font-semibold">Local ports</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeRows.map((row) => (
                          <tr className="border-b border-white/8 last:border-0" key={row.ip}>
                            <td className="break-all px-4 py-3 font-semibold text-white">
                              {row.ip}
                            </td>
                            <td className="px-4 py-3 text-white/70">{row.total}</td>
                            <td className="px-4 py-3 text-white/70">{row.established}</td>
                            <td className="px-4 py-3 text-white/70">{row.synReceived}</td>
                            <td className="break-words px-4 py-3 text-white/70">
                              {row.ports.join(", ")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <EmptyState>No active external TCP connections found.</EmptyState>
                  )}
                </div>
              </section>

              <section className="grid gap-6 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
                <div className="rounded-lg border border-white/10 bg-white/[0.05] p-5">
                  <div className="mb-4 flex items-center justify-between gap-4">
                    <h2 className="text-xl font-bold tracking-normal">Failed Login Sources</h2>
                    <span className="text-sm text-white/50">Last 24 hours</span>
                  </div>

                  <div className="overflow-x-auto">
                    {failedRows.length > 0 ? (
                      <table className="w-full min-w-[620px] text-left text-sm">
                        <thead className="text-white/48">
                          <tr className="border-b border-white/10">
                            <th className="pb-3 font-semibold">Remote IP</th>
                            <th className="pb-3 font-semibold">Attempts</th>
                            <th className="pb-3 font-semibold">Users</th>
                          </tr>
                        </thead>
                        <tbody>
                          {failedRows.map((row) => (
                            <tr className="border-b border-white/8" key={row.ip}>
                              <td className="break-all py-3 pr-4 font-semibold text-white">
                                {row.ip}
                              </td>
                              <td className="py-3 text-white/70">{row.total}</td>
                              <td className="break-words py-3 text-white/70">
                                {row.users.join(", ")}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <EmptyState>No failed login sources found in the current window.</EmptyState>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border border-white/10 bg-white/[0.05] p-5">
                  <div className="mb-4 flex items-center justify-between gap-4">
                    <h2 className="text-xl font-bold tracking-normal">Failed Login Sources</h2>
                    <span className="text-sm text-white/50">Last 24 hours</span>
                  </div>

                  <div className="grid gap-3">
                    {(data?.failed?.attempts || []).slice(0, 6).map((attempt, index) => (
                      <div
                        className="rounded-md border border-white/10 bg-black/20 px-4 py-3"
                        key={`${attempt.ip}-${index}`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="break-all font-semibold text-white">{attempt.ip}</p>
                          <span className="rounded-full bg-[#e95420]/18 px-3 py-1 text-xs font-bold text-[#ffb088]">
                            {attempt.user}
                          </span>
                        </div>
                        <p className="mt-2 break-words text-sm leading-6 text-white/58">
                          {attempt.message}
                        </p>
                      </div>
                    ))}
                    {(data?.failed?.attempts || []).length === 0 ? (
                      <EmptyState>No recent failed login rows available.</EmptyState>
                    ) : null}
                  </div>
                </div>
              </section>

              <section className="rounded-lg border border-white/10 bg-[#111111]/70 p-5">
                <h2 className="text-xl font-bold tracking-normal">Current Connection Rows</h2>
                <div className="mt-4 overflow-x-auto">
                  {connectionRows.length > 0 ? (
                    <table className="w-full min-w-[760px] text-left text-sm">
                      <thead className="text-white/48">
                        <tr className="border-b border-white/10">
                          <th className="pb-3 font-semibold">State</th>
                          <th className="pb-3 font-semibold">Remote</th>
                          <th className="pb-3 font-semibold">Remote Port</th>
                          <th className="pb-3 font-semibold">Local Port</th>
                          <th className="pb-3 font-semibold">Process</th>
                        </tr>
                      </thead>
                      <tbody>
                        {connectionRows.map((row, index) => (
                          <tr
                            className="border-b border-white/8"
                            key={`${row.state}-${row.peer.host}-${row.peer.port}-${index}`}
                          >
                            <td className="py-3">
                              <span
                                className={`rounded-full px-3 py-1 text-xs font-bold ${
                                  row.state === "SYN-RECV"
                                    ? "bg-[#e95420]/18 text-[#ffb088]"
                                    : "bg-white/8 text-white/70"
                                }`}
                              >
                                {row.state}
                              </span>
                            </td>
                            <td className="py-3 font-semibold text-white">{row.peer.host}</td>
                            <td className="py-3 text-white/70">{row.peer.port}</td>
                            <td className="py-3 text-white/70">{row.local.port}</td>
                            <td className="max-w-[320px] truncate py-3 text-white/70">
                              {row.process || "N/A"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <EmptyState>No connection rows available.</EmptyState>
                  )}
                </div>
              </section>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
