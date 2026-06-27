"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import AppSidebar from "@/app/components/app-sidebar";

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

function FolderIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5 flex-none text-[#ffb088]"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M3.75 6.75A2.25 2.25 0 0 1 6 4.5h4.05c.6 0 1.18.24 1.6.66l1.08 1.09H18A2.25 2.25 0 0 1 20.25 8.5v8.75A2.25 2.25 0 0 1 18 19.5H6a2.25 2.25 0 0 1-2.25-2.25V6.75Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5 flex-none text-white/58"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M7 3.75h6.35c.6 0 1.17.24 1.59.66l2.65 2.65c.42.42.66.99.66 1.59V18A2.25 2.25 0 0 1 16 20.25H7A2.25 2.25 0 0 1 4.75 18V6A2.25 2.25 0 0 1 7 3.75Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M13.25 4v3.5c0 .69.56 1.25 1.25 1.25H18"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5 flex-none text-sky-200/80"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M9.5 14.5 14.5 9.5M10.75 6.75l.7-.7a4.25 4.25 0 0 1 6.01 6.01l-.7.7M13.25 17.25l-.7.7a4.25 4.25 0 0 1-6.01-6.01l.7-.7"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function EntryIcon({ type }) {
  if (type === "directory") {
    return <FolderIcon />;
  }

  if (type === "symlink") {
    return <LinkIcon />;
  }

  return <FileIcon />;
}

export default function FilesClient({ initialPath, username }) {
  const [data, setData] = useState(null);
  const [pathInput, setPathInput] = useState(initialPath || "");
  const [createName, setCreateName] = useState("");
  const [createType, setCreateType] = useState("file");
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

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
      setPathInput(payload.path);
      setError(null);
      setMessage(null);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    async function loadInitialDirectory() {
      await loadDirectory(initialPath || "");
    }

    loadInitialDirectory();
  }, [initialPath, loadDirectory]);

  function submitPath(event) {
    event.preventDefault();
    loadDirectory(pathInput);
  }

  async function createEntry(event) {
    event.preventDefault();

    if (!data?.path) {
      setError("Open a directory before creating files or folders.");
      return;
    }

    setIsCreating(true);

    try {
      const response = await fetch("/api/files", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          directory: data.path,
          name: createName,
          type: createType,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || `Files API returned ${response.status}`);
      }

      setCreateName("");
      setMessage(`${createType === "directory" ? "Folder" : "File"} created.`);
      setError(null);
      await loadDirectory(data.path);
    } catch (createError) {
      setError(createError.message);
      setMessage(null);
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#1c1b22] text-white">
      <div className="grid min-h-screen lg:grid-cols-[280px_minmax(0,1fr)]">
        <AppSidebar
          activeItem="Files"
          helperText="Directory access follows the server process permissions."
          username={username}
        />

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

              {message ? (
                <section className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-4">
                  <p className="text-sm font-semibold text-emerald-100">{message}</p>
                </section>
              ) : null}

              <section className="rounded-lg border border-white/10 bg-white/[0.05] p-5">
                <div className="mb-4">
                  <h2 className="text-xl font-bold tracking-normal">Create</h2>
                  <p className="mt-1 text-sm text-white/56">
                    Create a new file or folder inside the current directory.
                  </p>
                </div>

                <form className="grid gap-3 lg:grid-cols-[180px_1fr_auto]" onSubmit={createEntry}>
                  <select
                    className="h-11 rounded-md border border-white/10 bg-black/24 px-4 text-sm text-white outline-none transition focus:border-[#e95420]"
                    onChange={(event) => setCreateType(event.target.value)}
                    value={createType}
                  >
                    <option className="bg-[#111111]" value="file">
                      File
                    </option>
                    <option className="bg-[#111111]" value="directory">
                      Folder
                    </option>
                  </select>
                  <input
                    className="h-11 rounded-md border border-white/10 bg-black/24 px-4 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-[#e95420]"
                    onChange={(event) => setCreateName(event.target.value)}
                    placeholder={createType === "directory" ? "new-folder" : "new-file.txt"}
                    value={createName}
                  />
                  <button
                    className="h-11 rounded-md bg-[#e95420] px-5 text-sm font-bold text-white transition hover:bg-[#c34113] disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={isCreating || !data?.path || !createName.trim()}
                    type="submit"
                  >
                    {isCreating ? "Creating" : "Create"}
                  </button>
                </form>
              </section>

              <section className="rounded-lg border border-white/10 bg-[#111111]/70 p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-xl font-bold tracking-normal">Directory Items</h2>
                  <span className="text-sm text-white/50">
                    {isLoading ? "Loading" : `${data?.items?.length || 0} items`}
                  </span>
                </div>

                <div className="overflow-x-auto rounded-md border border-white/10">
                  <table className="w-full min-w-[1040px] table-fixed text-left text-sm">
                    <colgroup>
                      <col className="w-[36%]" />
                      <col className="w-[11%]" />
                      <col className="w-[13%]" />
                      <col className="w-[20%]" />
                      <col className="w-[10%]" />
                      <col className="w-[10%]" />
                    </colgroup>
                    <thead className="bg-black/24 text-white/48">
                      <tr className="border-b border-white/10">
                        <th className="px-4 py-3 font-semibold">Name</th>
                        <th className="px-4 py-3 font-semibold">Type</th>
                        <th className="px-4 py-3 font-semibold">Size</th>
                        <th className="px-4 py-3 font-semibold">Modified</th>
                        <th className="px-4 py-3 font-semibold">Mode</th>
                        <th className="px-4 py-3 font-semibold">Edit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data?.items || []).map((item) => (
                        <tr className="border-b border-white/8 last:border-0" key={item.path}>
                          <td className="px-4 py-3">
                            {item.type === "directory" ? (
                              <button
                                className="flex min-w-0 items-center gap-3 text-left font-semibold text-[#ffb088] hover:text-white"
                                onClick={() => loadDirectory(item.path)}
                                type="button"
                              >
                                <EntryIcon type={item.type} />
                                <span className="break-all">{item.name}</span>
                              </button>
                            ) : (
                              <span className="flex min-w-0 items-center gap-3 font-semibold text-white">
                                <EntryIcon type={item.type} />
                                <span className="break-all">{item.name}</span>
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
                          <td className="px-4 py-3">
                            {item.type === "file" ? (
                              <Link
                                className="inline-flex min-w-16 justify-center rounded-md border border-white/14 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-white/10"
                                href={`/editor?path=${encodeURIComponent(item.path)}`}
                              >
                                Edit
                              </Link>
                            ) : (
                              <span className="text-white/28">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                      {!isLoading && (data?.items || []).length === 0 ? (
                        <tr>
                          <td className="px-4 py-8 text-center text-white/52" colSpan={6}>
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
