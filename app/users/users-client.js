"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AppSidebar, { AppMobileNav } from "@/app/components/app-sidebar";

function StatCard({ label, value }) {
  return (
    <section className="rounded-lg border border-white/10 bg-[#111111]/70 p-5">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-white/42">{label}</p>
      <p className="mt-3 text-3xl font-bold tracking-normal text-white">{value}</p>
    </section>
  );
}

export default function UsersClient({ username }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState("");

  const loadUsers = useCallback(async () => {
    setIsLoading(true);

    try {
      const response = await fetch("/api/users", { cache: "no-store" });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || `Users API returned ${response.status}`);
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
    const timeout = setTimeout(loadUsers, 0);

    return () => clearTimeout(timeout);
  }, [loadUsers]);

  const filteredUsers = useMemo(() => {
    const needle = query.trim().toLowerCase();

    if (!needle) {
      return data?.users || [];
    }

    return (data?.users || []).filter((user) =>
      [user.username, user.uid, user.gid, user.home, user.shell, user.comment]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [data, query]);

  return (
    <main className="min-h-screen bg-[#1c1b22] text-white">
      <AppMobileNav activeItem="Users" />
      <div className="grid min-h-screen lg:grid-cols-[280px_minmax(0,1fr)]">
        <AppSidebar
          activeItem="Users"
          helperText="System users, shell sessions, and recent failed SSH logins."
          username={username}
        />

        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_0%,rgba(233,84,32,0.20),transparent_30%),linear-gradient(135deg,rgba(44,0,30,0.58),rgba(17,17,17,0.98)_56%)]" />

          <div className="relative z-10 px-5 py-5 sm:px-8 lg:px-10">
            <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#ffb088]">
                  Users
                </p>
                <h1 className="mt-2 text-3xl font-bold tracking-normal">System Users</h1>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  className="h-10 rounded-md border border-white/14 px-4 text-sm font-semibold text-white transition hover:bg-white/10"
                  onClick={loadUsers}
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
                  <h2 className="text-xl font-bold tracking-normal">Users error</h2>
                  <p className="mt-2 text-sm leading-6 text-white/70">{error}</p>
                </section>
              ) : null}

              {isLoading || !data ? (
                <p className="rounded-md bg-black/20 px-4 py-5 text-sm text-white/58">
                  Loading users...
                </p>
              ) : (
                <>
                  <div className="grid gap-4 md:grid-cols-4">
                    <StatCard label="All Users" value={data.summary.userCount} />
                    <StatCard label="Login Users" value={data.summary.loginUserCount} />
                    <StatCard label="Active Sessions" value={data.summary.sessionCount} />
                    <StatCard label="Failed Logins" value={data.summary.failedLoginCount} />
                  </div>

                  <section className="rounded-lg border border-white/10 bg-[#111111]/70 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <h2 className="text-xl font-bold tracking-normal">User Accounts</h2>
                      <input
                        className="h-10 w-full rounded-md border border-white/10 bg-black/24 px-4 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-[#e95420] sm:w-80"
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Filter users..."
                        value={query}
                      />
                    </div>
                    <div className="mt-5 overflow-x-auto">
                      <table className="min-w-[860px] w-full border-separate border-spacing-y-2 text-left text-sm">
                        <thead className="text-xs uppercase tracking-[0.14em] text-white/42">
                          <tr>
                            <th className="px-3 py-2">User</th>
                            <th className="px-3 py-2">UID</th>
                            <th className="px-3 py-2">GID</th>
                            <th className="px-3 py-2">Home</th>
                            <th className="px-3 py-2">Shell</th>
                            <th className="px-3 py-2">Type</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredUsers.map((user) => (
                            <tr className="bg-white/[0.04]" key={`${user.username}-${user.uid}`}>
                              <td className="rounded-l-md px-3 py-3 font-semibold text-white">
                                {user.username}
                              </td>
                              <td className="px-3 py-3 text-white/68">{user.uid}</td>
                              <td className="px-3 py-3 text-white/68">{user.gid}</td>
                              <td className="px-3 py-3 text-white/68">{user.home}</td>
                              <td className="px-3 py-3 text-white/68">{user.shell}</td>
                              <td className="rounded-r-md px-3 py-3 text-white/68">
                                {user.isLoginUser ? "Login" : "System"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <section className="rounded-lg border border-white/10 bg-[#111111]/70 p-5">
                    <h2 className="text-xl font-bold tracking-normal">Active Shell Sessions</h2>
                    <div className="mt-5 grid gap-3">
                      {data.sessions.length > 0 ? (
                        data.sessions.map((session, index) => (
                          <div
                            className="grid gap-2 rounded-md border border-white/10 bg-black/18 p-4 md:grid-cols-[1fr_1fr_1fr_1fr]"
                            key={`${session.raw}-${index}`}
                          >
                            <span className="font-semibold">{session.username || "Unknown"}</span>
                            <span className="text-white/62">{session.tty || "-"}</span>
                            <span className="text-white/62">{session.host || "-"}</span>
                            <span className="text-white/62">{session.since || session.raw}</span>
                          </div>
                        ))
                      ) : (
                        <p className="rounded-md bg-black/18 px-4 py-4 text-sm text-white/56">
                          No active shell sessions found.
                        </p>
                      )}
                    </div>
                  </section>

                  <section className="rounded-lg border border-white/10 bg-[#111111]/70 p-5">
                    <h2 className="text-xl font-bold tracking-normal">Recent Failed Logins</h2>
                    <div className="mt-5 grid gap-3">
                      {data.failedLogins.length > 0 ? (
                        data.failedLogins.map((entry, index) => (
                          <div
                            className="rounded-md border border-white/10 bg-black/18 p-4"
                            key={`${entry.raw}-${index}`}
                          >
                            <div className="flex flex-wrap gap-3 text-sm font-semibold">
                              <span className="text-[#ffb088]">{entry.ip || "unknown ip"}</span>
                              <span>{entry.username || "unknown user"}</span>
                            </div>
                            <p className="mt-2 break-words text-sm leading-6 text-white/58">
                              {entry.raw}
                            </p>
                          </div>
                        ))
                      ) : (
                        <p className="rounded-md bg-black/18 px-4 py-4 text-sm text-white/56">
                          No failed SSH logins found in the recent log window.
                        </p>
                      )}
                    </div>
                  </section>
                </>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
