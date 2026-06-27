"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AppSidebar, { AppMobileNav } from "@/app/components/app-sidebar";

function formatTime(value) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString();
}

function actionTone(action) {
  if (action?.includes("failed") || action?.includes("denied")) {
    return "bg-[#e95420]/18 text-[#ffb088]";
  }

  if (action?.includes("success") || action?.includes("save") || action?.includes("create")) {
    return "bg-emerald-400/12 text-emerald-200";
  }

  return "bg-white/8 text-white/70";
}

function summarize(entry) {
  const parts = [];

  if (entry.path) {
    parts.push(`path: ${entry.path}`);
  }

  if (entry.service) {
    parts.push(`service: ${entry.service}`);
  }

  if (entry.reason) {
    parts.push(`reason: ${entry.reason}`);
  }

  if (entry.backupPath) {
    parts.push(`backup: ${entry.backupPath}`);
  }

  if (entry.error) {
    parts.push(`error: ${entry.error}`);
  }

  return parts.length > 0 ? parts.join(" | ") : JSON.stringify(entry);
}

export default function AuditClient({ username }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const loadAudit = useCallback(async () => {
    setIsLoading(true);

    try {
      const response = await fetch("/api/audit?limit=300", { cache: "no-store" });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || `Audit API returned ${response.status}`);
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
    async function loadInitialAudit() {
      await loadAudit();
    }

    loadInitialAudit();
  }, [loadAudit]);

  const filteredEntries = useMemo(() => {
    const entries = data?.entries || [];
    const needle = query.trim().toLowerCase();

    if (!needle) {
      return entries;
    }

    return entries.filter((entry) => JSON.stringify(entry).toLowerCase().includes(needle));
  }, [data?.entries, query]);

  return (
    <main className="min-h-screen bg-[#1c1b22] text-white">
      <AppMobileNav activeItem="Audit" />
      <div className="grid min-h-screen lg:grid-cols-[280px_minmax(0,1fr)]">
        <AppSidebar
          activeItem="Audit"
          helperText="Audit entries are stored as JSON lines on the server."
          username={username}
        />

        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_0%,rgba(233,84,32,0.20),transparent_30%),linear-gradient(135deg,rgba(44,0,30,0.58),rgba(17,17,17,0.98)_56%)]" />

          <div className="relative z-10 px-5 py-5 sm:px-8 lg:px-10">
            <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#ffb088]">
                  Audit Log
                </p>
                <h1 className="mt-2 text-3xl font-bold tracking-normal">
                  Admin Activity
                </h1>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  className="h-10 rounded-md border border-white/14 px-4 text-sm font-semibold text-white transition hover:bg-white/10"
                  onClick={loadAudit}
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
              <section className="rounded-lg border border-white/10 bg-white/[0.05] p-5">
                <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
                  <input
                    className="h-11 rounded-md border border-white/10 bg-black/24 px-4 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-[#e95420]"
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search action, user, path, service, error..."
                    value={query}
                  />
                  <span className="flex h-11 items-center rounded-md border border-white/10 px-4 text-sm text-white/58">
                    {isLoading ? "Loading" : `${filteredEntries.length} entries`}
                  </span>
                </div>
                <p className="mt-3 break-all text-sm text-white/54">
                  Log file: <span className="text-white/76">{data?.path || "-"}</span>
                </p>
              </section>

              {error ? (
                <section className="rounded-lg border border-[#e95420]/50 bg-[#e95420]/14 p-5">
                  <h2 className="text-xl font-bold tracking-normal">Audit error</h2>
                  <p className="mt-2 text-sm leading-6 text-white/70">{error}</p>
                </section>
              ) : null}

              <section className="rounded-lg border border-white/10 bg-[#111111]/70 p-5">
                <div className="overflow-x-auto rounded-md border border-white/10">
                  <table className="w-full min-w-[980px] table-fixed text-left text-sm">
                    <colgroup>
                      <col className="w-[20%]" />
                      <col className="w-[18%]" />
                      <col className="w-[16%]" />
                      <col className="w-[46%]" />
                    </colgroup>
                    <thead className="bg-black/24 text-white/48">
                      <tr className="border-b border-white/10">
                        <th className="px-4 py-3 font-semibold">Time</th>
                        <th className="px-4 py-3 font-semibold">Action</th>
                        <th className="px-4 py-3 font-semibold">User</th>
                        <th className="px-4 py-3 font-semibold">Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEntries.map((entry, index) => (
                        <tr className="border-b border-white/8 last:border-0" key={`${entry.at}-${index}`}>
                          <td className="px-4 py-3 text-white/70">{formatTime(entry.at)}</td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full px-3 py-1 text-xs font-bold ${actionTone(entry.action)}`}>
                              {entry.action || "unknown"}
                            </span>
                          </td>
                          <td className="break-all px-4 py-3 font-semibold text-white">
                            {entry.user || entry.username || "-"}
                          </td>
                          <td className="break-words px-4 py-3 text-white/64">
                            {summarize(entry)}
                          </td>
                        </tr>
                      ))}
                      {!isLoading && filteredEntries.length === 0 ? (
                        <tr>
                          <td className="px-4 py-8 text-center text-white/52" colSpan={4}>
                            No audit entries found.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
