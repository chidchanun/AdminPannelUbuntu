"use client";

import { useCallback, useEffect, useState } from "react";
import AppSidebar, { AppMobileNav } from "@/app/components/app-sidebar";

function formatTime(value) {
  return value ? new Date(value).toLocaleString() : "-";
}

export default function HealthClient({ username }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

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
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
