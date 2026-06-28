"use client";

import { useCallback, useEffect, useState } from "react";
import AppSidebar, { AppMobileNav } from "@/app/components/app-sidebar";

function formatTime(value) {
  return value ? new Date(value).toLocaleString() : "-";
}

function toneClass(severity) {
  if (severity === "critical") {
    return "border-[#e95420]/45 bg-[#e95420]/14 text-[#ffb088]";
  }

  if (severity === "warning") {
    return "border-[#ffb088]/35 bg-[#ffb088]/10 text-[#ffd4bf]";
  }

  return "border-white/10 bg-white/[0.04] text-white/70";
}

export default function NotificationsClient({ username }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadNotifications = useCallback(async () => {
    setIsLoading(true);

    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || `Notifications API returned ${response.status}`);
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
    const timeout = setTimeout(loadNotifications, 0);
    const interval = setInterval(loadNotifications, 10000);

    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [loadNotifications]);

  return (
    <main className="min-h-screen bg-[#1c1b22] text-white">
      <AppMobileNav activeItem="Notifications" />
      <div className="grid min-h-screen lg:grid-cols-[280px_minmax(0,1fr)]">
        <AppSidebar
          activeItem="Notifications"
          helperText="Service, health, security, and audit notices in one place."
          username={username}
        />

        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_0%,rgba(233,84,32,0.20),transparent_30%),linear-gradient(135deg,rgba(44,0,30,0.58),rgba(17,17,17,0.98)_56%)]" />

          <div className="relative z-10 px-5 py-5 sm:px-8 lg:px-10">
            <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#ffb088]">
                  Notifications
                </p>
                <h1 className="mt-2 text-3xl font-bold tracking-normal">Notice Center</h1>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  className="h-10 rounded-md border border-white/14 px-4 text-sm font-semibold text-white transition hover:bg-white/10"
                  onClick={loadNotifications}
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
                  <h2 className="text-xl font-bold tracking-normal">Notification error</h2>
                  <p className="mt-2 text-sm leading-6 text-white/70">{error}</p>
                </section>
              ) : null}

              <section className="grid gap-4 md:grid-cols-3">
                <article className="rounded-lg border border-[#e95420]/35 bg-[#e95420]/12 p-5">
                  <p className="text-sm font-semibold text-white/56">Critical</p>
                  <p className="mt-2 text-3xl font-bold">{data?.counts?.critical ?? 0}</p>
                </article>
                <article className="rounded-lg border border-[#ffb088]/25 bg-[#ffb088]/8 p-5">
                  <p className="text-sm font-semibold text-white/56">Warning</p>
                  <p className="mt-2 text-3xl font-bold">{data?.counts?.warning ?? 0}</p>
                </article>
                <article className="rounded-lg border border-white/10 bg-white/[0.05] p-5">
                  <p className="text-sm font-semibold text-white/56">Updated</p>
                  <p className="mt-2 text-base font-bold">{formatTime(data?.updatedAt)}</p>
                </article>
              </section>

              <section className="rounded-lg border border-white/10 bg-[#111111]/70 p-5">
                <h2 className="text-xl font-bold tracking-normal">Timeline</h2>
                <div className="mt-5 grid gap-3">
                  {isLoading && !data ? (
                    <p className="rounded-md bg-black/20 px-4 py-5 text-sm text-white/58">
                      Loading notifications...
                    </p>
                  ) : null}

                  {(data?.notifications || []).map((item, index) => (
                    <div
                      className={`rounded-md border p-4 ${toneClass(item.severity)}`}
                      key={`${item.source}-${item.title}-${item.at}-${index}`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-bold text-white">{item.title}</p>
                          <p className="mt-1 break-words text-sm leading-6 text-white/64">
                            {item.detail || "-"}
                          </p>
                        </div>
                        <span className="rounded-full bg-black/20 px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-white/56">
                          {item.source}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-white/38">{formatTime(item.at)}</p>
                    </div>
                  ))}

                  {!isLoading && (data?.notifications || []).length === 0 ? (
                    <p className="rounded-md border border-white/10 bg-black/20 px-4 py-6 text-center text-sm text-white/58">
                      No notifications right now.
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
