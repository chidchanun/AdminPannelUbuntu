"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

function formatBytes(value) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDate(value) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString();
}

function typeLabel(type) {
  if (type === "directory") {
    return "DIR";
  }

  if (type === "symlink") {
    return "LINK";
  }

  if (type === "file") {
    return "FILE";
  }

  return "UNKNOWN";
}

export default function FilesClient({ username }) {
  const [data, setData] = useState(null);
  const [currentPath, setCurrentPath] = useState("");
  const [pathInput, setPathInput] = useState("");
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadDirectory = useCallback(async (nextPath = "") => {
    setIsLoading(true);

    try {
      const params = nextPath ? `?path=${encodeURIComponent(nextPath)}` : "";
      const response = await fetch(`/api/files${params}`, { cache: "no-store" });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || `Files API returned ${response.status}`);
      }

      setData(payload);
      setCurrentPath(payload.path);
      setPathInput(payload.path);
      setError(null);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    async function loadInitialDirectory() {
      await loadDirectory("");
    }

    loadInitialDirectory();
  }, [loadDirectory]);

  function submitPath(event) {
    event.preventDefault();
    loadDirectory(pathInput);
  }

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
              <Link
                className="rounded-md px-3 py-2.5 text-sm font-semibold text-white/66 transition hover:bg-white/8 hover:text-white"
                href="/dashboard"
              >
                Dashboard
              </Link>
              <Link
                className="rounded-md px-3 py-2.5 text-sm font-semibold text-white/66 transition hover:bg-white/8 hover:text-white"
                href="/connections"
              >
                Connections
              </Link>
              <Link
                className="rounded-md bg-[#e95420] px-3 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#e95420]/20"
                href="/files"
              >
                Files
              </Link>
            </nav>

            <div className="mt-auto rounded-lg border border-white/10 bg-white/[0.04] p-4">
              <p className="text-sm font-semibold text-[#ffb088]">Signed in as</p>
              <p className="mt-1 truncate text-base font-bold">{username}</p>
              <p className="mt-2 text-sm leading-6 text-white/56">
                Directory access follows the server process permissions.
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
                  File Directory
                </p>
                <h1 className="mt-2 text-3xl font-bold tracking-normal">
                  Server Directory Browser
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
              <section className="rounded-lg border border-white/10 bg-white/[0.05] p-5">
                <form className="grid gap-3 lg:grid-cols-[1fr_auto_auto]" onSubmit={submitPath}>
                  <input
                    className="h-11 rounded-md border border-white/10 bg-black/24 px-4 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-[#e95420]"
                    onChange={(event) => setPathInput(event.target.value)}
                    placeholder="Enter server directory path"
                    value={pathInput}
                  />
                  <button
                    className="h-11 rounded-md bg-[#e95420] px-5 text-sm font-bold text-white transition hover:bg-[#c34113]"
                    type="submit"
                  >
                    Open
                  </button>
                  <button
                    className="h-11 rounded-md border border-white/14 px-5 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={!data?.parentPath}
                    onClick={() => loadDirectory(data.parentPath)}
                    type="button"
                  >
                    Parent
                  </button>
                </form>

                <div className="mt-4 grid gap-2 text-sm text-white/58">
                  <p>
                    Root: <span className="break-all text-white/78">{data?.root || "-"}</span>
                  </p>
                  <p>
                    Current: <span className="break-all text-white/78">{data?.path || "-"}</span>
                  </p>
                </div>
              </section>

              {error ? (
                <section className="rounded-lg border border-[#e95420]/50 bg-[#e95420]/14 p-5">
                  <h2 className="text-xl font-bold tracking-normal">File browser error</h2>
                  <p className="mt-2 text-sm leading-6 text-white/70">{error}</p>
                </section>
              ) : null}

              <section className="rounded-lg border border-white/10 bg-[#111111]/70 p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-xl font-bold tracking-normal">Directory Items</h2>
                  <span className="text-sm text-white/50">
                    {isLoading ? "Loading" : `${data?.items?.length || 0} items`}
                  </span>
                </div>

                <div className="overflow-x-auto rounded-md border border-white/10">
                  <table className="w-full min-w-[860px] table-fixed text-left text-sm">
                    <colgroup>
                      <col className="w-[40%]" />
                      <col className="w-[12%]" />
                      <col className="w-[14%]" />
                      <col className="w-[20%]" />
                      <col className="w-[14%]" />
                    </colgroup>
                    <thead className="bg-black/24 text-white/48">
                      <tr className="border-b border-white/10">
                        <th className="px-4 py-3 font-semibold">Name</th>
                        <th className="px-4 py-3 font-semibold">Type</th>
                        <th className="px-4 py-3 font-semibold">Size</th>
                        <th className="px-4 py-3 font-semibold">Modified</th>
                        <th className="px-4 py-3 font-semibold">Mode</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data?.items || []).map((item) => (
                        <tr className="border-b border-white/8 last:border-0" key={item.path}>
                          <td className="px-4 py-3">
                            {item.type === "directory" ? (
                              <button
                                className="break-all text-left font-semibold text-[#ffb088] hover:text-white"
                                onClick={() => loadDirectory(item.path)}
                                type="button"
                              >
                                {item.name}
                              </button>
                            ) : (
                              <span className="break-all font-semibold text-white">
                                {item.name}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className="rounded-full bg-white/8 px-3 py-1 text-xs font-bold text-white/70">
                              {typeLabel(item.type)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-white/70">{formatBytes(item.size)}</td>
                          <td className="px-4 py-3 text-white/70">{formatDate(item.modifiedAt)}</td>
                          <td className="px-4 py-3 text-white/70">{item.mode || "-"}</td>
                        </tr>
                      ))}
                      {!isLoading && (data?.items || []).length === 0 ? (
                        <tr>
                          <td className="px-4 py-8 text-center text-white/52" colSpan={5}>
                            This directory is empty.
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
