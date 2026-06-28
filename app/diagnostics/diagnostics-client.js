"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AppSidebar, { AppMobileNav } from "@/app/components/app-sidebar";

function statusClass(status) {
  if (status === "ok") {
    return "border-emerald-400/28 bg-emerald-400/10 text-emerald-100";
  }

  if (status === "fail") {
    return "border-[#e95420]/45 bg-[#e95420]/14 text-[#ffb088]";
  }

  return "border-[#ffb088]/28 bg-[#ffb088]/10 text-[#ffd1bd]";
}

function SummaryCard({ label, value, tone }) {
  return (
    <article className={`rounded-lg border p-5 ${statusClass(tone)}`}>
      <p className="text-sm font-bold uppercase tracking-[0.16em] opacity-70">{label}</p>
      <p className="mt-3 text-3xl font-bold tracking-normal">{value}</p>
    </article>
  );
}

function CheckCard({ item }) {
  return (
    <article className="rounded-lg border border-white/10 bg-white/[0.05] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold tracking-normal">{item.name}</h2>
          <p className="mt-2 break-words text-sm leading-6 text-white/62">{item.detail}</p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] ${statusClass(
            item.status,
          )}`}
        >
          {item.status}
        </span>
      </div>
      {item.hint ? (
        <p className="mt-4 rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm leading-6 text-white/58">
          {item.hint}
        </p>
      ) : null}
    </article>
  );
}

function RecommendationCard({ item }) {
  return (
    <article
      className={`rounded-lg border p-5 ${
        item.severity === "critical"
          ? "border-[#e95420]/45 bg-[#e95420]/14"
          : "border-[#ffb088]/28 bg-[#ffb088]/10"
      }`}
    >
      <h2 className="text-lg font-bold tracking-normal">{item.title}</h2>
      <p className="mt-2 text-sm leading-6 text-white/62">{item.detail}</p>
    </article>
  );
}

export default function DiagnosticsClient({ username }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadDiagnostics = useCallback(async () => {
    setIsLoading(true);

    try {
      const response = await fetch("/api/diagnostics", { cache: "no-store" });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || `Diagnostics API returned ${response.status}`);
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
    const timeout = setTimeout(loadDiagnostics, 0);

    return () => clearTimeout(timeout);
  }, [loadDiagnostics]);

  const groupedChecks = useMemo(() => {
    const checks = data?.checks || [];

    return {
      fail: checks.filter((item) => item.status === "fail"),
      ok: checks.filter((item) => item.status === "ok"),
      warn: checks.filter((item) => item.status === "warn"),
    };
  }, [data]);

  return (
    <main className="min-h-screen bg-[#1c1b22] text-white">
      <AppMobileNav activeItem="Diagnostics" />
      <div className="grid min-h-screen lg:grid-cols-[280px_minmax(0,1fr)]">
        <AppSidebar
          activeItem="Diagnostics"
          helperText="Checks runtime, permissions, tools, and local guard risk."
          username={username}
        />

        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_0%,rgba(233,84,32,0.20),transparent_30%),linear-gradient(135deg,rgba(44,0,30,0.58),rgba(17,17,17,0.98)_56%)]" />

          <div className="relative z-10 px-5 py-5 sm:px-8 lg:px-10">
            <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#ffb088]">
                  Diagnostics
                </p>
                <h1 className="mt-2 text-3xl font-bold tracking-normal">Server Setup Check</h1>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  className="h-10 rounded-md border border-white/14 px-4 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isLoading}
                  onClick={loadDiagnostics}
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
                  <h2 className="text-xl font-bold tracking-normal">Diagnostics error</h2>
                  <p className="mt-2 text-sm leading-6 text-white/70">{error}</p>
                </section>
              ) : null}

              {isLoading || !data ? (
                <p className="rounded-md bg-black/20 px-4 py-5 text-sm text-white/58">
                  Checking server setup...
                </p>
              ) : (
                <>
                  <section className="grid gap-4 md:grid-cols-3">
                    <SummaryCard label="Passed" tone="ok" value={data.summary.ok} />
                    <SummaryCard label="Warnings" tone="warn" value={data.summary.warn} />
                    <SummaryCard label="Failed" tone="fail" value={data.summary.fail} />
                  </section>

                  <section className="rounded-lg border border-white/10 bg-[#111111]/70 p-5">
                    <h2 className="text-xl font-bold tracking-normal">Local IP Notice</h2>
                    <p className="mt-2 text-sm leading-6 text-white/62">
                      `::1` is localhost IPv6. If it appears as `ip.blocked` with `many target
                      ports`, the source is usually a local health check, reverse proxy, browser dev
                      traffic, or another process on this server. Whitelist `::1` and `127.0.0.1`
                      when local traffic is expected.
                    </p>
                  </section>

                  {data.recommendations?.length > 0 ? (
                    <section className="grid gap-3">
                      <h2 className="text-xl font-bold tracking-normal">
                        Security Recommendations
                      </h2>
                      <div className="grid gap-3 xl:grid-cols-2">
                        {data.recommendations.map((item) => (
                          <RecommendationCard item={item} key={item.title} />
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {["fail", "warn", "ok"].map((status) =>
                    groupedChecks[status].length > 0 ? (
                      <section className="grid gap-3" key={status}>
                        <h2 className="text-xl font-bold capitalize tracking-normal">{status}</h2>
                        <div className="grid gap-3 xl:grid-cols-2">
                          {groupedChecks[status].map((item) => (
                            <CheckCard item={item} key={`${item.name}-${item.status}`} />
                          ))}
                        </div>
                      </section>
                    ) : null,
                  )}
                </>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
